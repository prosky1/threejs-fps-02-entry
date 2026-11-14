// Bot brains: waypoint routing (BFS), vision cones + line-of-sight, hearing,
// burst fire with reaction time and settling aim, site holds, rotates on the
// plant, and plant/defuse channels. Decisions run at 10 Hz, staggered per bot;
// movement and shooting run every fixed step.
import * as THREE from 'three';
import { BOT, WEAPONS } from './config.js';
import { findPath, nearestWaypoint, SITES, WAYPOINTS } from './map.js';
import { hasLineOfSight, moveBody, segmentHitsSphere } from './collision.js';
import { range } from './rng.js';
import { createWeaponState } from './state.js';

const ATTACK_ROUTES = [
  { site: 'A', via: [1, 2, 22, 4, 5] },
  { site: 'A', via: [17, 18, 20, 22, 4, 5] },
  { site: 'B', via: [16, 15, 23, 13, 12] },
  { site: 'B', via: [17, 18, 21, 23, 13, 12] },
  { site: 'A', via: [17, 18, 19, 22, 4, 5] },
];
const DEFEND_SPOTS = [
  { wp: 5, look: 4 }, { wp: 7, look: 5 }, { wp: 12, look: 13 },
  { wp: 10, look: 12 }, { wp: 8, look: 19 },
];

export function botBuy(bot, rng) {
  const money = bot.money;
  if (money >= 4500 && rng() < 0.25) bot.primary = createWeaponState('marksman');
  else if (money >= 2700) bot.primary = createWeaponState('rifle');
  else if (money >= 1200) bot.primary = createWeaponState('smg');
  else bot.primary = null;
  bot.active = bot.primary ? 'primary' : 'secondary';
  if (money >= 650 && rng() < 0.7) { bot.armor = 100; bot.money -= 650; }
  if (bot.primary) bot.money -= WEAPONS[bot.primary.id].price;
  if (rng() < 0.5 && bot.money >= 300) { bot.grenades.frag = 1; bot.money -= 300; }
  if (rng() < 0.3 && bot.money >= 300) { bot.grenades.smoke = 1; bot.money -= 300; }
}

export function assignRoles(state, rng) {
  const attackers = state.players.filter((p) => p.team === 'vanguard' && !p.isPlayer);
  const defenders = state.players.filter((p) => p.team === 'sentinel');
  attackers.forEach((bot, i) => {
    const route = ATTACK_ROUTES[i % ATTACK_ROUTES.length];
    bot.bot.site = route.site;
    bot.bot.route = route.via;
    bot.bot.state = 'advance';
  });
  defenders.forEach((bot, i) => {
    const spot = DEFEND_SPOTS[i % DEFEND_SPOTS.length];
    bot.bot.site = spot.wp === 5 || spot.wp === 7 ? 'A' : spot.wp === 12 || spot.wp === 10 ? 'B' : null;
    bot.bot.holdWp = spot.wp;
    bot.bot.holdLook = spot.look;
    bot.bot.state = 'advance';
  });
  // Carrier: first attacker bot; the bomb starts on them.
  const carrier = attackers[0];
  if (carrier) {
    carrier.hasBomb = true;
    state.bomb.state = 'carried';
    state.bomb.carrierId = carrier.id;
  }
}

function canSee(world, state, from, to) {
  const dx = to.pos.x - from.pos.x;
  const dz = to.pos.z - from.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > BOT.seeRange) return false;
  // Field of view: dot of facing vs direction to target.
  const fx = -Math.sin(from.yaw);
  const fz = -Math.cos(from.yaw);
  if ((dx * fx + dz * fz) / (dist || 1) < BOT.fovCos) return false;
  const eyeY = from.pos.y + (from.crouch ? 1.12 : 1.62);
  const targetY = to.pos.y + (to.crouch ? 0.8 : 1.2);
  if (!hasLineOfSight(world.collision, from.pos.x, eyeY, from.pos.z, to.pos.x, targetY, to.pos.z)) return false;
  for (const s of state.smokes) {
    if (segmentHitsSphere(from.pos.x, eyeY, from.pos.z, to.pos.x, targetY, to.pos.z, s.x, s.y, s.z, s.r)) return false;
  }
  return true;
}

function setPath(bot, targetWp) {
  const from = nearestWaypoint(bot.pos.x, bot.pos.z);
  bot.bot.path = findPath(from, targetWp);
  bot.bot.pathIndex = 0;
}

function think(state, world, bot, rng) {
  const b = bot.bot;
  const planted = state.bomb.state === 'planted';
  // 1. Vision: nearest visible enemy becomes the target.
  let visible = null;
  let visibleD = Infinity;
  for (const p of state.players) {
    if (p.team === bot.team || !p.alive) continue;
    if (!canSee(world, state, bot, p)) continue;
    const d = (p.pos.x - bot.pos.x) ** 2 + (p.pos.z - bot.pos.z) ** 2;
    if (d < visibleD) { visibleD = d; visible = p; }
  }
  if (visible) {
    if (b.targetId !== visible.id) {
      b.targetId = visible.id;
      b.reactT = range(rng, BOT.reactionMin, BOT.reactionMax) * (1.3 - b.skill * 0.6);
      b.aimTime = 0;
      b.burstLeft = 0;
    }
    b.lastKnown = { x: visible.pos.x, z: visible.pos.z, t: state.time };
    if (b.state !== 'plant' && b.state !== 'defuse') b.state = 'engage';
    return;
  }
  b.targetId = null;
  // 2. Hearing: fresh gunfire nearby pulls bots toward it.
  if (!planted && b.state !== 'plant' && b.state !== 'defuse') {
    for (let i = state.shots.length - 1; i >= 0; i -= 1) {
      const s = state.shots[i];
      if (s.team === bot.team || state.time - s.t > 3) continue;
      const d = Math.hypot(s.x - bot.pos.x, s.z - bot.pos.z);
      if (d < BOT.hearRadius) {
        b.lastKnown = { x: s.x, z: s.z, t: state.time };
        if (b.state === 'hold' || b.state === 'advance') b.state = 'seek';
        break;
      }
    }
  }
  // 3. Role behaviour.
  if (planted) {
    const site = SITES[state.bomb.site];
    if (bot.team === 'sentinel') {
      b.state = 'rotate';
      setPath(bot, nearestWaypoint(site.x, site.z));
    } else if (b.state !== 'hold') {
      b.state = 'hold';
      setPath(bot, nearestWaypoint(site.x + range(rng, -4, 4), site.z + range(rng, -4, 4)));
    }
    return;
  }
  if (bot.team === 'vanguard') {
    if (bot.hasBomb) {
      const site = SITES[b.site];
      const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
      if (d < site.r - 1 && b.state !== 'plant') {
        b.state = 'plant';
        bot.planting = 0;
        return;
      }
      if (b.state !== 'advance' && b.state !== 'seek') {
        b.state = 'advance';
        b.path = [...b.route];
        b.pathIndex = 0;
      }
    } else if (state.bomb.state === 'dropped' && state.bomb.pos) {
      // Nearest attacker fetches the dropped bomb.
      const d = Math.hypot(state.bomb.pos.x - bot.pos.x, state.bomb.pos.z - bot.pos.z);
      const closer = state.players.some((p) => p.team === 'vanguard' && p.alive && p !== bot
        && Math.hypot(state.bomb.pos.x - p.pos.x, state.bomb.pos.z - p.pos.z) < d);
      if (!closer) {
        b.state = 'seek';
        b.lastKnown = { x: state.bomb.pos.x, z: state.bomb.pos.z, t: state.time };
        return;
      }
      if (b.state !== 'advance') { b.state = 'advance'; b.path = [...b.route]; b.pathIndex = 0; }
    } else if (b.state !== 'advance' && b.state !== 'seek') {
      b.state = 'advance';
      b.path = [...b.route];
      b.pathIndex = 0;
    }
  } else {
    // Defenders: walk to their hold spot, then watch the assigned angle.
    if (b.state === 'advance' && b.holdWp !== undefined) {
      const wp = WAYPOINTS[b.holdWp];
      if (Math.hypot(wp.x - bot.pos.x, wp.z - bot.pos.z) < 1.5) {
        b.state = 'hold';
        const look = WAYPOINTS[b.holdLook];
        bot.yaw = Math.atan2(-(look.x - bot.pos.x), -(look.z - bot.pos.z));
      } else if (!b.path.length) {
        setPath(bot, b.holdWp);
      }
    }
  }
}

function moveToward(state, world, bot, tx, tz, dt, speed) {
  const dx = tx - bot.pos.x;
  const dz = tz - bot.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4) return true;
  const step = Math.min(dist, speed * dt);
  bot.yaw = Math.atan2(-dx, -dz);
  moveBody(world.collision, bot.pos, { x: (dx / dist) * step, y: 0, z: (dz / dist) * step }, 0.34, 1.78);
  // Stuck detection: barely moved while trying.
  const moved = Math.hypot(bot.pos.x - bot.bot.lastPos.x, bot.pos.z - bot.bot.lastPos.z);
  if (moved < 0.02) {
    bot.bot.stuckT += dt;
    if (bot.bot.stuckT > 1.2) {
      bot.bot.stuckT = 0;
      // Sidestep: nudge perpendicular, then re-path from the new spot.
      const px = -dz / (dist || 1);
      const pz = dx / (dist || 1);
      moveBody(world.collision, bot.pos, { x: px * 1.2, y: 0, z: pz * 1.2 }, 0.34, 1.78);
      if (bot.bot.path.length) setPath(bot, bot.bot.path[bot.bot.path.length - 1]);
    }
  } else {
    bot.bot.stuckT = 0;
  }
  bot.bot.lastPos.x = bot.pos.x;
  bot.bot.lastPos.z = bot.pos.z;
  return dist < 1.2;
}

function followPath(state, world, bot, dt) {
  const b = bot.bot;
  if (!b.path.length) return true;
  const wp = WAYPOINTS[b.path[b.pathIndex]];
  if (!wp) return true;
  if (moveToward(state, world, bot, wp.x, wp.z, dt, 4.3)) {
    b.pathIndex += 1;
    if (b.pathIndex >= b.path.length) { b.path = []; return true; }
  }
  return false;
}

export function createBotSystem(state, world, rng) {
  const bots = state.players.filter((p) => !p.isPlayer);
  bots.forEach((b, i) => {
    b.bot.skill = 0.45 + rng() * 0.5;
    b.bot.thinkT = (i % 6) * (1 / BOT.thinkHz / 6);
  });
  return {
    step(dt, ctx) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const b = bot.bot;
        b.thinkT -= dt;
        if (b.thinkT <= 0) {
          b.thinkT = 1 / BOT.thinkHz;
          think(state, world, bot, rng);
        }
        // Weapon timers always tick.
        const w = bot.active === 'primary' ? bot.primary : bot.secondary;
        if (w) {
          const def = WEAPONS[w.id];
          if (w.cooldown > 0) w.cooldown -= dt;
          if (w.reloading > 0) {
            w.reloading -= dt;
            if (w.reloading <= 0) {
              const take = Math.min(def.mag - w.mag, w.reserve);
              w.mag += take;
              w.reserve -= take;
            }
          }
          w.bloom = Math.max(0, w.bloom - dt * 0.05);
          if (w.mag === 0 && w.reserve > 0 && w.reloading <= 0) w.reloading = def.reload;
        }
        if (b.reactT > 0) b.reactT -= dt;
        // Plant / defuse channels.
        if (b.state === 'plant' && bot.hasBomb) {
          const site = SITES[b.site];
          const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
          if (d > site.r) { b.state = 'advance'; b.path = [...b.route]; b.pathIndex = 0; }
          else {
            bot.planting += dt;
            if (bot.planting >= 3.5) ctx.onPlant(bot, b.site);
          }
          continue;
        }
        if (b.state === 'defuse') {
          bot.defusing += dt;
          if (bot.defusing >= 5) ctx.onDefuse(bot);
          continue;
        }
        // Rotate-to-site bots defuse when they arrive and the site looks clear.
        if (b.state === 'rotate' && state.bomb.state === 'planted') {
          const site = SITES[state.bomb.site];
          const d = Math.hypot(site.x - bot.pos.x, site.z - bot.pos.z);
          if (d < 1.6 && !b.targetId) {
            b.state = 'defuse';
            bot.defusing = 0;
            state.events.push({ kind: 'defuseStart', by: bot.id });
            continue;
          }
          followPath(state, world, bot, dt);
          continue;
        }
        // Engage: face the target, settle aim, fire bursts.
        if (b.state === 'engage' && b.targetId) {
          const target = state.players.find((p) => p.id === b.targetId);
          if (!target || !target.alive) { b.targetId = null; b.state = 'seek'; continue; }
          const dx = target.pos.x - bot.pos.x;
          const dz = target.pos.z - bot.pos.z;
          const dist = Math.hypot(dx, dz);
          bot.yaw = Math.atan2(-dx, -dz);
          const eyeY = bot.pos.y + 1.5;
          const targetY = target.pos.y + (target.crouch ? 0.9 : 1.25);
          bot.pitch = Math.atan2(targetY - eyeY, dist);
          b.aimTime += dt;
          // Strafe while fighting: sidestep, reversing every 0.7-1.4s.
          b.strafeT = (b.strafeT ?? 0) - dt;
          if (b.strafeT <= 0) {
            b.strafeT = range(rng, 0.7, 1.4);
            b.strafeDir = rng() < 0.5 ? -1 : 1;
          }
          const sx = -Math.cos(bot.yaw) * (b.strafeDir ?? 1);
          const sz = Math.sin(bot.yaw) * (b.strafeDir ?? 1);
          moveBody(world.collision, bot.pos, { x: sx * 2.2 * dt, y: 0, z: sz * 2.2 * dt }, 0.34, 1.78);
          // Crouch to steady long-range shots; re-decide about once a second.
          b.crouchT = (b.crouchT ?? 0) - dt;
          if (b.crouchT <= 0) {
            b.crouchT = 1;
            bot.crouch = dist > 18 && rng() < 0.4;
          }
          if (b.reactT <= 0 && b.aimTime > 0.12 && w && w.mag > 0 && w.reloading <= 0) {
            if (b.burstLeft <= 0) {
              if (b.burstPause > 0) { b.burstPause -= dt; continue; }
              b.burstLeft = Math.floor(range(rng, BOT.burstMin, BOT.burstMax + 1));
              b.burstPause = range(rng, 0.35, 0.8);
            }
            if (w.cooldown <= 0) {
              b.burstLeft -= 1;
              ctx.shootBot(bot, target);
            }
          }
          continue;
        }
        // Seek: walk to the last known position, then resume the role.
        if (b.state === 'seek' && b.lastKnown) {
          if (moveToward(state, world, bot, b.lastKnown.x, b.lastKnown.z, dt, 4.6)) {
            b.state = bot.team === 'vanguard' ? 'advance' : 'hold';
            if (bot.team === 'vanguard') { b.path = [...b.route]; b.pathIndex = 0; }
            // Pick up a dropped bomb by walking over it.
            if (bot.team === 'vanguard' && state.bomb.state === 'dropped' && state.bomb.pos
              && Math.hypot(state.bomb.pos.x - bot.pos.x, state.bomb.pos.z - bot.pos.z) < 1.2) {
              bot.hasBomb = true;
              state.bomb.state = 'carried';
              state.bomb.carrierId = bot.id;
              state.events.push({ kind: 'pickup', by: bot.id });
            }
          }
          continue;
        }
        if (b.state === 'advance') {
          if (bot.team === 'sentinel') {
            if (followPath(state, world, bot, dt)) {
              const wp = WAYPOINTS[b.holdWp];
              if (wp && Math.hypot(wp.x - bot.pos.x, wp.z - bot.pos.z) < 2) b.state = 'hold';
            }
          } else {
            followPath(state, world, bot, dt);
          }
          continue;
        }
        // Hold: stand and watch. Small idle sway of the aim.
        if (b.state === 'hold') {
          bot.yaw += Math.sin(state.time * 0.5 + bot.id.charCodeAt(1)) * 0.0009;
        }
      }
    },
  };
}

// Bot bodies: a readable humanoid — legs that swing when walking, torso with
// a team-coloured vest, arms holding a rifle, helmet + visor, backpack, and a
// floating nameplate with a health bar so enemies read at a glance in a fight.
export function createBotMesh(team, name) {
  const group = new THREE.Group();
  const bodyColor = team === 'vanguard' ? 0x2e4a5e : 0x5e4a2e;
  const accentColor = team === 'vanguard' ? 0x4fc3f7 : 0xffb300;
  const cloth = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.45, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.3 });

  // Legs: boxes pivoted at the hip so they can swing while walking.
  const legGeo = new THREE.BoxGeometry(0.17, 0.78, 0.2);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, cloth);
  legL.position.set(-0.13, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, cloth);
  legR.position.set(0.13, 0.78, 0);
  legL.castShadow = true;
  legR.castShadow = true;
  group.add(legL, legR);
  // Boots ride on the legs so they swing with them.
  const bootGeo = new THREE.BoxGeometry(0.18, 0.1, 0.3);
  const bootL = new THREE.Mesh(bootGeo, dark);
  bootL.position.set(0, -0.74, 0.05);
  const bootR = new THREE.Mesh(bootGeo, dark);
  bootR.position.set(0, -0.74, 0.05);
  legL.add(bootL);
  legR.add(bootR);

  // Torso + vest plate + backpack + shoulder pads.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.34), cloth);
  torso.position.y = 1.09;
  torso.castShadow = true;
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.08), accent);
  vest.position.set(0, 1.1, -0.2);
  group.add(vest);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.16), dark);
  pack.position.set(0, 1.12, 0.24);
  group.add(pack);
  for (const sx of [-0.36, 0.36]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.3), accent);
    pad.position.set(sx, 1.38, 0);
    group.add(pad);
  }

  // Arms angled forward to hold the rifle.
  const armGeo = new THREE.BoxGeometry(0.13, 0.52, 0.14);
  armGeo.translate(0, -0.26, 0);
  const armL = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.36, 1.36, -0.05);
  armL.rotation.x = -1.0;
  const armR = new THREE.Mesh(armGeo, cloth);
  armR.position.set(0.36, 1.36, -0.02);
  armR.rotation.x = -1.15;
  group.add(armL, armR);

  // Head: helmet dome + brim + glowing visor slit.
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.3 }),
  );
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.2 }),
  );
  helmet.position.y = 1.62;
  group.add(helmet);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.07, 0.06),
    new THREE.MeshBasicMaterial({ color: accentColor }),
  );
  visor.position.set(0, 1.6, -0.19);
  group.add(visor);

  // Held rifle: receiver + barrel + magazine, angled slightly up.
  const gun = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.6), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.45);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.09), dark);
  mag.position.set(0, -0.13, -0.05);
  mag.rotation.x = 0.15;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.08), dark);
  grip.position.set(0, -0.1, 0.2);
  grip.rotation.x = 0.3;
  gun.add(receiver, barrel, mag, grip);
  gun.position.set(0.1, 1.18, -0.38);
  gun.rotation.x = 0.05;
  group.add(gun);

  // Muzzle flash: a small quad at the barrel tip, shown briefly per shot.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.1, 1.2, -1.02);
  group.add(flash);

  // Nameplate: name + health bar sprite, drawn once and redrawn only when
  // the health changes (tracked in userData).
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 256;
  plateCanvas.height = 64;
  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Sprite(new THREE.SpriteMaterial({
    map: plateTex, transparent: true, depthTest: false,
  }));
  plate.scale.set(1.7, 0.42, 1);
  plate.position.y = 2.06;
  plate.renderOrder = 4;
  group.add(plate);
  group.userData = {
    legL, legR, bootL, bootR, flash, plate, plateCanvas, plateTex,
    name: name ?? '', teamColor: team === 'vanguard' ? '#4fc3f7' : '#ffb300',
    lastHp: -1, walkPhase: Math.random() * Math.PI * 2,
  };
  drawNameplate(group.userData, 100);
  return group;
}

// Redraw the nameplate canvas: name above a health bar (green -> red).
export function drawNameplate(ud, hp) {
  const g = ud.plateCanvas.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = 'bold 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(48, 2, 160, 32);
  g.fillStyle = ud.teamColor;
  g.fillText(ud.name, 128, 19);
  const frac = Math.max(0, hp / 100);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(48, 40, 160, 12);
  g.fillStyle = frac > 0.5 ? '#7ee787' : frac > 0.25 ? '#f0a830' : '#ff5252';
  g.fillRect(50, 42, 156 * frac, 8);
  ud.plateTex.needsUpdate = true;
  ud.lastHp = hp;
}

