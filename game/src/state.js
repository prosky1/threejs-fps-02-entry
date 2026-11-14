// The single source of truth. Every system reads and mutates this one object;
// rendering only ever reads it. No other module keeps authoritative game state.
import { GAME, PLAYER, WEAPONS } from './config.js';

export const TEAMS = {
  vanguard: { id: 'vanguard', name: 'VANGUARD', color: 0x4fc3f7, css: '#4fc3f7', role: 'attack' },
  sentinel: { id: 'sentinel', name: 'SENTINEL', color: 0xffb300, css: '#ffb300', role: 'defend' },
};

const BOT_NAMES = [
  'Rook', 'Havoc', 'Mira', 'Dusk', 'Fable', 'Kite', 'Nomad', 'Onyx', 'Pike', 'Sable',
];

export function createWeaponState(id) {
  const def = WEAPONS[id];
  return { id, mag: def.mag, reserve: def.reserve, reloading: 0, cooldown: 0, bloom: 0 };
}

export function createPlayer(id, name, team, isPlayer, spawn) {
  return {
    id, name, team, isPlayer,
    alive: true, hp: PLAYER.maxHp, armor: 0,
    pos: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw, pitch: 0,
    crouch: false, grounded: true, ads: false,
    primary: null, secondary: createWeaponState('pistol'),
    active: 'secondary',
    grenades: { frag: 0, smoke: 0 },
    money: GAME.startMoney,
    kills: 0, deaths: 0, assists: 0, dmg: 0,
    hasBomb: false, planting: 0, defusing: 0,
    // Bot brain (unused for the human player).
    bot: isPlayer ? null : {
      state: 'advance', path: [], pathIndex: 0, targetId: null,
      aimAt: null, aimTime: 0, reactT: 0, burstLeft: 0, burstPause: 0,
      holdUntil: 0, lastKnown: null, stuckT: 0, lastPos: { x: spawn.x, z: spawn.z },
      skill: 0.5, site: null, route: null, thinkT: 0,
    },
    // Render-only scratch, written by the renderer, never read by the sim.
    mesh: null, flashT: 0, hurtT: 0, deadT: 0,
  };
}

export function createState(rng) {
  const players = [];
  for (let i = 0; i < GAME.teamSize; i += 1) {
    players.push(createPlayer(`v${i}`, i === 0 ? 'YOU' : BOT_NAMES[i - 1], 'vanguard', i === 0, { x: 0, z: 0, yaw: 0 }));
  }
  for (let i = 0; i < GAME.teamSize; i += 1) {
    players.push(createPlayer(`s${i}`, BOT_NAMES[GAME.teamSize - 1 + i], 'sentinel', false, { x: 0, z: 0, yaw: 0 }));
  }
  return {
    rng,
    time: 0,
    round: 1,
    phase: 'menu', // menu | freeze | live | end | match
    phaseT: 0,
    wins: { vanguard: 0, sentinel: 0 },
    lossStreak: { vanguard: 0, sentinel: 0 },
    players,
    bomb: { state: 'carried', carrierId: 'v1', site: null, pos: null, timer: 0, plantedAt: 0 },
    events: [], // {kind, ...} consumed by audio/HUD once per frame
    feed: [], // kill feed lines {text, team, t}
    shots: [], // recent gunfire {x, z, t, team} — what bots hear
    smokes: [], // {x, y, z, r, until}
    frags: [], // live grenades {pos, vel, fuse, owner}
    winner: null,
    matchWinner: null,
    endReason: '',
  };
}

export function aliveOf(state, team) {
  let n = 0;
  for (const p of state.players) if (p.team === team && p.alive) n += 1;
  return n;
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id) ?? null;
}

export function human(state) {
  return state.players[0];
}

// Damage with armor soak (amount already includes headshot/falloff from weapons.js).
// Returns 'dead' when the victim drops.
export function applyDamage(state, victim, amount, part, attackerId) {
  if (!victim.alive) return null;
  let dmg = amount;
  const attacker = attackerId ? playerById(state, attackerId) : null;
  if (attacker) attacker.dmg += amount;
  if (victim.armor > 0) {
    const absorbed = Math.min(victim.armor, dmg * 0.5);
    victim.armor -= absorbed;
    dmg -= absorbed;
  }
  victim.hp -= dmg;
  victim.hurtT = 0.35;
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.deadT = state.time;
    victim.deaths += 1;
    if (attacker) {
      attacker.kills += 1;
      attacker.money = Math.min(GAME.maxMoney, attacker.money + GAME.killBonus);
    }
    if (victim.hasBomb) {
      victim.hasBomb = false;
      state.bomb.state = 'dropped';
      state.bomb.pos = { x: victim.pos.x, y: 0.25, z: victim.pos.z };
      state.bomb.carrierId = null;
    }
    state.feed.push({ text: `${attacker ? attacker.name : '—'} ▸ ${victim.name}${part === 'head' ? ' ◎' : ''}`, team: attacker?.team ?? null, t: state.time });
    if (state.feed.length > 6) state.feed.shift();
    state.events.push({ kind: 'kill', victim: victim.id, attacker: attackerId, head: part === 'head' });
    return 'dead';
  }
  state.events.push({ kind: 'hit', victim: victim.id, attacker: attackerId, head: part === 'head' });
  return 'hit';
}

export function activeWeapon(player) {
  return player.active === 'primary' ? player.primary : player.secondary;
}
