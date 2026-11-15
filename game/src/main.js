// Boot + the one loop: a fixed 120 Hz simulation feeding a render at the
// display's rate. This file is glue only — systems live in their own modules.
// ?shot=start|buy|play|end&seed=N runs a deterministic capture instead.
import * as THREE from 'three';
import { GAME, WEAPONS } from './config.js';
import { createState, human, applyDamage, activeWeapon, playerById } from './state.js';
import { buildMap, WAYPOINTS, GRAPH } from './map.js';
import { hasLineOfSight } from './collision.js';
import { computeSpread, makeShotResult, patternKick, resolveShot, stepWeapon, tryFire, tryReload, throwGrenade, stepGrenades } from './weapons.js';
import { createPlayerController } from './player.js';
import { createInput } from './input.js';
import { createBotSystem, createBotMesh, drawNameplate } from './bots.js';
import { createSky } from './sky.js';
import { resetRound, buyItem, stepRounds, stepInteract, plantBomb, defuseBomb } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createViewmodel, createEffects } from './viewmodel.js';
import { createAutopilot, runShot } from './shots.js';
import { mulberry32 } from './rng.js';

const FIXED_STEP = 1 / 120;
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = mulberry32(shotMode ? seed : (Date.now() % 2147483647));

// --- Renderer / scene -------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Filmic tone mapping: the dusk palette (warm sun, orange horizon) reads
// richer and less flat than linear output, at no extra draw cost.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2b3038);
scene.fog = new THREE.Fog(0x39323e, 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 600);
scene.add(camera);

// --- World / state / systems -----------------------------------------------
const world = buildMap(scene);
const sky = createSky(scene);
const state = createState(rng);
const audio = createAudio();
const hud = createHud();
const viewmodel = createViewmodel(camera);
const effects = createEffects(scene);
const me = human(state);
const controller = createPlayerController(me, world.collision);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBotSystem(state, world, rng);
const autopilot = createAutopilot(state);
const shotResult = makeShotResult();

for (const p of state.players) {
  if (p.isPlayer) continue;
  p.mesh = createBotMesh(p.team, p.name);
  scene.add(p.mesh);
}
const bombMesh = new THREE.Group();
const bombBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.32, 0.36),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 }),
);
const bombLamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff2222 }),
);
bombLamp.position.set(0, 0.22, 0);
bombMesh.add(bombBox, bombLamp);
bombMesh.visible = false;
scene.add(bombMesh);

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let shake = 0;
let nextBeep = 0;
let prevFiring = false;
let minimapT = 0;
let fov = 74;
let lastWeaponId = 'pistol';

// --- Map self-test: every waypoint edge must clear every wall ---------------
(function selfTest() {
  let bad = 0;
  const inside = (x, z, m) => world.boxes.some((b) =>
    x > b.min[0] - m && x < b.max[0] + m && z > b.min[2] - m && z < b.max[2] + m && b.min[1] < 1.5);
  GRAPH.forEach((edges, i) => {
    for (const j of edges) {
      if (j <= i) continue;
      const a = WAYPOINTS[i];
      const b = WAYPOINTS[j];
      for (let s = 0; s <= 20; s += 1) {
        const x = a.x + ((b.x - a.x) * s) / 20;
        const z = a.z + ((b.z - a.z) * s) / 20;
        if (inside(x, z, 0.4)) { bad += 1; console.warn(`map: edge ${i}-${j} blocked near ${x.toFixed(1)},${z.toFixed(1)}`); break; }
      }
    }
  });
  console.log(`map self-test: ${GRAPH.flat().length / 2} edges, ${bad} blocked`);
})();

// --- Shooting ----------------------------------------------------------------
function eyeOf(p) {
  return { x: p.pos.x, y: p.pos.y + (p.crouch ? 1.12 : 1.62), z: p.pos.z };
}

function damage(victim, amount, part, attacker) {
  if (victim.planting > 0 || victim.defusing > 0) {
    victim.planting = 0;
    victim.defusing = 0;
    if (victim.bot) {
      victim.bot.state = victim.team === 'vanguard' ? 'advance' : 'hold';
      if (victim.team === 'vanguard' && victim.bot.route) {
        victim.bot.path = [...victim.bot.route];
        victim.bot.pathIndex = 0;
      }
    }
  }
  const result = applyDamage(state, victim, amount, part, attacker?.id ?? null);
  if (victim === me) {
    shake = Math.min(1, shake + 0.35);
    hud.setVignette(true);
    setTimeout(() => hud.setVignette(false), 260);
    // Hit-direction arc: rotate the red marker toward the shooter.
    if (attacker) {
      const dx = attacker.pos.x - me.pos.x;
      const dz = attacker.pos.z - me.pos.z;
      const worldAng = Math.atan2(-dx, -dz);
      let rel = worldAng - me.yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      hud.setHitDir((rel * 180) / Math.PI);
    }
  }
  if (result === 'dead' && victim.mesh) victim.mesh.rotation.x = -Math.PI / 2;
  return result;
}

function fireBullet(shooter, origin, dir, def, spread) {
  // One trigger pull = def.pellets (1 for most guns, 8 for the shotgun):
  // each pellet is its own hitscan ray with its own spread jitter.
  const pellets = def.pellets ?? 1;
  let first = null;
  for (let n = 0; n < pellets; n += 1) {
    const rx = (rng() * 2 - 1) * spread;
    const ry = (rng() * 2 - 1) * spread;
    const rz = (rng() * 2 - 1) * spread;
    const d = { x: dir.x + rx, y: dir.y + ry, z: dir.z + rz };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    d.x /= len; d.y /= len; d.z /= len;
    resolveShot(world, shooter, origin, d, def, state.players, shotResult);
    effects.tracer(origin, shotResult.point);
    state.shots.push({ x: shooter.pos.x, z: shooter.pos.z, t: state.time, team: shooter.team });
    if (shotResult.hit === 'player') {
      damage(shotResult.victim, shotResult.damage, shotResult.part, shooter);
      if (shooter === me) {
        hud.hitmarker(shotResult.part === 'head');
        audio.hitmarker(shotResult.part === 'head');
      }
    } else if (shotResult.hit === 'wall') {
      effects.sparksAt(shotResult.point, { x: shotResult.nx, y: shotResult.ny, z: shotResult.nz });
    }
    if (!first) first = shotResult;
  }
  return first;
}

const botCtx = {
  shootBot(bot, target) {
    const w = activeWeapon(bot);
    if (!w) return;
    const def = WEAPONS[w.id];
    if (tryFire(w, def) !== 'fired') return;
    const origin = eyeOf(bot);
    const chest = { x: target.pos.x, y: target.pos.y + (target.crouch ? 0.9 : 1.25), z: target.pos.z };
    const dir = { x: chest.x - origin.x, y: chest.y - origin.y, z: chest.z - origin.z };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;
    const aimErr = 0.011 * (2 - bot.bot.skill) * (1.7 - Math.min(1, bot.bot.aimTime / 1.4));
    const spread = computeSpread(def, 2.2, bot.crouch, false, w.bloom) + aimErr;
    fireBullet(bot, origin, dir, def, spread);
    bot.flashT = 0.07;
    const dist = Math.hypot(me.pos.x - bot.pos.x, me.pos.z - bot.pos.z);
    // Wall between the shot and the player muffles it (hearing bus).
    const occluded = !hasLineOfSight(world.collision, origin.x, origin.y, origin.z, me.pos.x, me.pos.y + 1.62, me.pos.z);
    audio.shot(def.sound, dist, occluded);
  },
  onPlant(bot, site) { plantBomb(state, bot, site); },
  onDefuse(bot) { defuseBomb(state, bot); },
};

function playerShoot() {
  const w = activeWeapon(me);
  if (!w) return;
  const def = WEAPONS[w.id];
  const result = tryFire(w, def);
  if (result === 'empty') { audio.dryFire(); return; }
  if (result !== 'fired') return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const spread = computeSpread(def, controller.speed(), me.crouch, me.ads, w.bloom);
  fireBullet(me, eyeOf(me), { x: dir.x, y: dir.y, z: dir.z }, def, spread);
  // Recoil follows the weapon's pattern, not a random kick: shot N of a
  // spray climbs by pattern[N], so pulling down along the pattern controls it.
  const [pitchKick, yawKick] = patternKick(def, w.shotN - 1);
  controller.recoil(pitchKick * (0.9 + rng() * 0.2), yawKick * (0.9 + rng() * 0.2));
  viewmodel.kick(def.kick * 0.35);
  audio.shot(def.sound, 0);
}

// --- Fixed step ---------------------------------------------------------------
function stepFixed(dt, useAutopilot = false) {
  state.time += dt;
  if (state.phase === 'menu' || state.phase === 'match') return;

  // Drive: real input, or the autopilot in capture mode.
  let drive;
  if (useAutopilot) {
    drive = autopilot.step(dt, (a, b) => hasLineOfSight(world.collision,
      a.pos.x, a.pos.y + 1.62, a.pos.z, b.pos.x, b.pos.y + 1.2, b.pos.z));
  } else {
    drive = { keys: input.state.keys, look: { x: 0, y: 0 }, fire: false };
  }
  if (me.alive) {
    if (!useAutopilot) {
      const look = input.takeLook();
      controller.look(look.x, look.y);
      me.ads = input.state.ads && state.phase === 'live';
      if (input.state.firing && state.phase === 'live') {
        const w = activeWeapon(me);
        const semi = w && !WEAPONS[w.id].auto;
        if (!semi || !prevFiring) playerShoot();
      }
      prevFiring = input.state.firing;
    } else {
      controller.look(drive.look.x, drive.look.y);
      if (drive.fire && state.phase === 'live') playerShoot();
      if (drive.reload) {
        const rw = activeWeapon(me);
        if (rw) tryReload(rw, WEAPONS[rw.id]);
      }
    }
    controller.step(dt, drive.keys, (crouch) => audio.step(crouch));
    const w = activeWeapon(me);
    if (w) stepWeapon(w, WEAPONS[w.id], dt);
    stepInteract(state, me, drive.keys.has('KeyE'), dt);
  }

  if (state.phase === 'live') bots.step(dt, botCtx);
  stepRounds(state, dt);

  stepGrenades(state, world, dt,
    (g) => {
      state.events.push({ kind: 'explodeFrag', x: g.pos.x, y: g.pos.y, z: g.pos.z });
      audio.explosion();
      for (const p of state.players) {
        if (!p.alive) continue;
        const d = Math.hypot(p.pos.x - g.pos.x, p.pos.z - g.pos.z);
        if (d > 6.5) continue;
        const chest = { x: p.pos.x, y: p.pos.y + 1.1, z: p.pos.z };
        if (!hasLineOfSight(world.collision, g.pos.x, g.pos.y + 0.3, g.pos.z, chest.x, chest.y, chest.z)) continue;
        damage(p, 120 * (1 - d / 7) + 15, 'body', playerById(state, g.owner));
      }
      const dMe = Math.hypot(me.pos.x - g.pos.x, me.pos.z - g.pos.z);
      if (dMe < 12) shake = Math.min(1, shake + 0.8 * (1 - dMe / 12));
    },
    (g) => {
      state.smokes.push({ x: g.pos.x, y: 0.6, z: g.pos.z, r: 4.5, until: state.time + 18, seed: rng() * 10 });
      state.events.push({ kind: 'smoke', x: g.pos.x, z: g.pos.z });
    });

  // Prune short-lived lists.
  state.shots = state.shots.filter((s) => state.time - s.t < 4);
  state.smokes = state.smokes.filter((s) => s.until > state.time);

  // Bomb beeps accelerate as the timer runs down.
  if (state.bomb.state === 'planted') {
    const interval = 0.25 + (state.bomb.timer / GAME.bombTimer) * 0.85;
    if (state.time >= nextBeep) {
      nextBeep = state.time + interval;
      audio.beep(state.bomb.timer < 5);
    }
  }
}

// --- Events -> audio / banners / radio chatter ---------------------------------
function pushFeed(text, team) {
  state.feed.push({ text, team: team ?? null, t: state.time });
  if (state.feed.length > 6) state.feed.shift();
}

function drainEvents() {
  for (const e of state.events) {
    if (e.kind === 'roundStart') {
      hud.banner(`ROUND ${e.round}`, state.wins.vanguard + ' — ' + state.wins.sentinel, null);
      pushFeed(`Round ${e.round} — ${state.wins.vanguard}:${state.wins.sentinel}`, null);
    } else if (e.kind === 'live') hud.banner('GO', 'Eliminate the enemy or plant the charge', null);
    else if (e.kind === 'roundEnd') {
      hud.banner(e.winner === 'vanguard' ? 'VANGUARD WINS THE ROUND' : 'SENTINEL WINS THE ROUND', e.reason, e.winner);
      audio.roundEnd(e.winner === 'vanguard');
    } else if (e.kind === 'plant') {
      hud.banner('CHARGE PLANTED', `Site ${e.site} — ${GAME.bombTimer}s to detonation`, 'vanguard');
      audio.plant();
      const planter = playerById(state, e.by);
      if (planter) pushFeed(`${planter.name}: Charge planted at ${e.site} — hold it`, 'vanguard');
    } else if (e.kind === 'defuseStart') {
      const defuser = playerById(state, e.by);
      if (defuser) pushFeed(`${defuser.name}: Defusing the charge!`, 'sentinel');
    } else if (e.kind === 'callout') {
      const caller = playerById(state, e.by);
      if (caller) {
        pushFeed(`${caller.name}: Contact at ${e.site} — eyes on it`, caller.team);
        audio.radio();
      }
    } else if (e.kind === 'defuse') hud.banner('CHARGE DEFUSED', 'Sentinel holds the site', 'sentinel');
    else if (e.kind === 'explode') {
      audio.explosion();
      shake = 1;
    } else if (e.kind === 'pickup' && e.by === me.id) hud.setHint('You carry the charge — plant at A or B (hold E)');
    else if (e.kind === 'buy' && e.by === me.id) audio.buy();
    else if (e.kind === 'matchEnd') {
      hud.showOverlay('end', { matchWinner: e.winner, wins: state.wins });
      input.releaseLock();
    }
  }
  state.events.length = 0;
}

// --- Camera / render sync -------------------------------------------------------
function syncCamera() {
  let eye;
  let yaw;
  let pitch;
  if (!me.alive && state.phase === 'live') {
    const mate = state.players.find((p) => p.team === me.team && p.alive && !p.isPlayer);
    if (mate) {
      eye = { x: mate.pos.x, y: mate.pos.y + 1.62, z: mate.pos.z };
      yaw = mate.yaw;
      pitch = mate.pitch;
      hud.setSpectate(mate.name);
    } else {
      eye = eyeOf(me);
      yaw = me.yaw;
      pitch = me.pitch;
      hud.setSpectate(null);
    }
  } else {
    hud.setSpectate(null);
    eye = eyeOf(me);
    yaw = me.yaw;
    pitch = me.pitch;
  }
  // No gun in hand while dead (spectating) or before the match starts.
  viewmodel.group.visible = me.alive && state.phase !== 'menu';
  shake = Math.max(0, shake - 0.03);
  const shX = (rng() - 0.5) * shake * 0.02;
  const shY = (rng() - 0.5) * shake * 0.02;
  camera.position.set(eye.x, eye.y, eye.z);
  camera.rotation.set(pitch + shX, yaw + shY, 0, 'YXZ');
  const w = activeWeapon(me);
  const targetFov = me.ads ? (w && WEAPONS[w.id].scoped ? 38 : 55) : 74;
  fov += (targetFov - fov) * 0.2;
  if (Math.abs(camera.fov - fov) > 0.1) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

function syncMeshes(dt) {
  for (const p of state.players) {
    if (!p.mesh) continue;
    const ud = p.mesh.userData;
    if (p.alive) {
      p.mesh.visible = true;
      p.mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      p.mesh.rotation.set(0, p.yaw, 0);
      p.mesh.scale.y = p.crouch ? 0.78 : 1;
      // Walk cycle: legs swing while the bot is moving, boots follow.
      const moving = p.bot && (p.bot.state === 'advance' || p.bot.state === 'seek' || p.bot.state === 'rotate');
      if (moving) {
        ud.walkPhase += dt * 9;
        const swing = Math.sin(ud.walkPhase) * 0.5;
        ud.legL.rotation.x = swing;
        ud.legR.rotation.x = -swing;
        p.mesh.position.y = Math.abs(Math.sin(ud.walkPhase)) * 0.05;
      } else {
        ud.legL.rotation.x *= 0.8;
        ud.legR.rotation.x *= 0.8;
      }
      // Muzzle flash: shown briefly after the bot fires.
      if (p.flashT > 0) {
        p.flashT -= dt;
        ud.flash.material.opacity = Math.max(0, p.flashT / 0.07) * 0.95;
        ud.flash.rotation.z = Math.random() * Math.PI;
      } else {
        ud.flash.material.opacity = 0;
      }
      // Nameplate: redraw only when health changed; hide far away or when dead.
      if (ud.lastHp !== Math.ceil(p.hp)) drawNameplate(ud, Math.ceil(p.hp));
      const distMe = Math.hypot(p.pos.x - me.pos.x, p.pos.z - me.pos.z);
      ud.plate.visible = distMe < 45;
    } else {
      // Fallen bodies sink away after a few seconds.
      if (state.time - p.deadT > 4) p.mesh.position.y -= 0.01;
      if (state.time - p.deadT > 6) p.mesh.visible = false;
      ud.plate.visible = false;
    }
  }
  const bomb = state.bomb;
  if ((bomb.state === 'dropped' || bomb.state === 'planted') && bomb.pos) {
    bombMesh.visible = true;
    bombMesh.position.set(bomb.pos.x, 0.25, bomb.pos.z);
    bombLamp.material.color.setHex(Math.sin(state.time * (bomb.state === 'planted' ? 10 : 3)) > 0 ? 0xff2222 : 0x330000);
  } else {
    bombMesh.visible = false;
  }
  effects.setSmoke(state.smokes);
}

function syncHud(dt) {
  const w = activeWeapon(me);
  // Swap the first-person gun model when the active weapon changes.
  if (w && w.id !== lastWeaponId) {
    lastWeaponId = w.id;
    viewmodel.setWeapon(w.id);
  }
  const def = w ? WEAPONS[w.id] : null;
  hud.setHealth(me.hp, me.armor);
  hud.setAmmo(w ? w.mag : 0, w ? w.reserve : 0, def ? def.name : '—', !!(w && w.reloading > 0));
  hud.setGrenades(me.grenades.frag, me.grenades.smoke);
  hud.setMoney(me.money);
  hud.setTimer(state.phaseT, state.phase);
  hud.setScores(state.wins, state.round);
  hud.feed(state.feed);
  hud.setBomb(state.bomb);
  if (w && def) {
    const spread = computeSpread(def, controller.speed(), me.crouch, me.ads, w.bloom);
    hud.setCrosshairGap(6 + spread * 900);
  }
  viewmodel.setReloading(!!(w && w.reloading > 0));
  if (me.planting > 0) hud.setProgress('PLANTING CHARGE', me.planting / GAME.plantTime);
  else if (me.defusing > 0) hud.setProgress('DEFUSING CHARGE', me.defusing / GAME.defuseTime);
  else hud.setProgress(null, 0);
  // Context hint (only while alive — a dead player cannot act on it).
  let hint = '';
  if (me.alive) {
    if (state.phase === 'freeze') hint = 'B — buy menu  ·  freeze ends soon';
    else if (me.hasBomb) hint = 'You carry the charge — reach A or B, hold E to plant';
    else if (state.bomb.state === 'planted' && me.team === 'sentinel') hint = 'Charge planted — reach it and hold E to defuse';
    else if (state.bomb.state === 'dropped') hint = 'Charge dropped — walk over it to pick it up';
  }
  hud.setHint(hint);
  minimapT -= dt;
  if (minimapT <= 0) {
    minimapT = 0.1;
    hud.drawMinimap(state, world, me);
  }
}

// --- Match control ---------------------------------------------------------------
function startMatch() {
  state.wins.vanguard = 0;
  state.wins.sentinel = 0;
  state.round = 1;
  state.matchWinner = null;
  for (const p of state.players) {
    p.money = GAME.startMoney;
    p.kills = 0;
    p.deaths = 0;
  }
  resetRound(state);
  started = true;
  hud.hideOverlay();
  hud.hideBuy();
}

function onLockChange(locked) {
  if (shotMode) return;
  if (locked) {
    hud.hideOverlay();
  } else if (started && (state.phase === 'live' || state.phase === 'freeze') && !hud.isBuyOpen()) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shotMode) return;
  audio.unlock();
  if (!started || state.phase === 'match' || state.phase === 'menu') startMatch();
  input.requestLock();
});

function handlePressed() {
  for (const code of input.takePressed()) {
    if (state.phase === 'menu' || state.phase === 'match') continue;
    if (code === 'KeyB' && state.phase === 'freeze') {
      if (hud.isBuyOpen()) hud.hideBuy();
      else hud.showBuy(me.money);
      continue;
    }
    if (hud.isBuyOpen()) {
      const buyKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'];
      const idx = buyKeys.indexOf(code);
      if (idx !== -1) {
        const ids = ['smg', 'shotgun', 'rifle', 'marksman', 'lmg', 'frag', 'smoke', 'armor'];
        if (buyItem(state, me, ids[idx])) hud.showBuy(me.money);
        else audio.denied();
      }
      if (code === 'Escape') hud.hideBuy();
      continue;
    }
    if (!me.alive) continue;
    if (code === 'KeyR') {
      const w = activeWeapon(me);
      if (w && tryReload(w, WEAPONS[w.id])) audio.reload();
    } else if (code === 'Digit1' && me.primary) {
      if (me.active !== 'primary') { me.active = 'primary'; cancelReload(); }
    } else if (code === 'Digit2') {
      if (me.active !== 'secondary') { me.active = 'secondary'; cancelReload(); }
    } else if (code === 'KeyQ') {
      if (me.primary) {
        me.active = me.active === 'primary' ? 'secondary' : 'primary';
        cancelReload();
      }
    } else if (code === 'KeyG') {
      const kind = me.grenades.frag > 0 ? 'frag' : me.grenades.smoke > 0 ? 'smoke' : null;
      if (kind && state.phase === 'live') {
        me.grenades[kind] -= 1;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        throwGrenade(state, me, kind, eyeOf(me), { x: dir.x, y: dir.y, z: dir.z });
        audio.grenade();
      }
    }
  }
  if (input.state.keys.has('Tab') && state.phase !== 'menu') hud.showScoreboard(state);
  else hud.hideScoreboard();
}

function cancelReload() {
  const w = activeWeapon(me);
  if (w) w.reloading = 0;
}

// --- Frame loop -------------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    handlePressed();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 10) {
      stepFixed(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 10) accumulator = 0;
    drainEvents();
    syncCamera();
    syncMeshes(dt);
    sky.update(dt);
    viewmodel.step(dt, controller.speed(), me.ads, me.grounded);
    effects.step(dt);
    syncHud(dt);
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Boot --------------------------------------------------------------------------
syncCamera();
if (shotMode) {
  runShot(shotMode, {
    phase: () => state.phase,
    startMatch,
    skipFreeze() {
      state.phase = 'live';
      state.phaseT = GAME.roundTime;
    },
    stepFixed: (dt, auto) => stepFixed(dt, auto),
    syncAll() {
      drainEvents();
      syncCamera();
      syncMeshes(0.1);
      syncHud(0.1);
    },
    render() {
      syncCamera();
      // Apply the viewmodel state once (muzzle flash, kick) — in capture
      // mode the frame loop never runs, so without this a fired shot shows
      // no flash in the screenshot.
      viewmodel.step(0, 0, false, true);
      renderer.render(scene, camera);
    },
    // Let a fired shot's flash decay before the frame freezes: at full
    // strength it is a huge pale quad + a blown-out foreground in a still.
    coolFlash() { viewmodel.step(0.055, 0, false, true); },
    pose(x, z, yaw, pitch) {
      me.pos.x = x;
      me.pos.z = z;
      me.yaw = yaw;
      me.pitch = pitch;
      syncCamera();
    },
    showBuy() { hud.showBuy(me.money); },
    showScoreboard() { hud.showScoreboard(state); },
    showOverlay(kind) { hud.showOverlay(kind, { wins: state.wins }); },
    banner(text, sub) { hud.banner(text, sub, null); },
    hideBanner() { hud.hideBanner(); },
  });
  frozen = true;
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
