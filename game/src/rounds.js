// Round and match flow: freeze (buy) -> live -> end, money, plant/defuse, and
// the win conditions. The sim calls step() every fixed tick; UI reads phaseT.
import { GAME, GEAR, WEAPONS } from './config.js';
import { SPAWNS, SITES } from './map.js';
import { aliveOf, createWeaponState } from './state.js';
import { assignRoles, botBuy } from './bots.js';

export function resetRound(state) {
  state.phase = 'freeze';
  state.phaseT = GAME.freezeTime;
  state.bomb = { state: 'carried', carrierId: null, site: null, pos: null, timer: 0, plantedAt: 0 };
  state.frags = [];
  state.smokes = [];
  state.shots = [];
  state.winner = null;
  state.endReason = '';
  for (const p of state.players) {
    const spawn = SPAWNS[p.team][state.players.filter((q) => q.team === p.team).indexOf(p)];
    p.pos.x = spawn.x;
    p.pos.z = spawn.z;
    p.pos.y = 0;
    p.vel.x = 0; p.vel.y = 0; p.vel.z = 0;
    p.yaw = spawn.yaw;
    p.pitch = 0;
    p.alive = true;
    p.hp = 100;
    p.armor = 0;
    p.crouch = false;
    p.ads = false;
    p.hasBomb = false;
    p.planting = 0;
    p.defusing = 0;
    p.grenades = { frag: 0, smoke: 0 };
    p.secondary = createWeaponState('pistol');
    p.primary = null;
    p.active = 'secondary';
    if (p.bot) {
      p.bot.state = 'advance';
      p.bot.path = [];
      p.bot.pathIndex = 0;
      p.bot.targetId = null;
      p.bot.lastKnown = null;
      botBuy(p, state.rng);
    }
    if (p.mesh) {
      p.mesh.visible = true;
      p.mesh.rotation.set(0, 0, 0);
      p.mesh.position.y = 0;
    }
  }
  assignRoles(state, state.rng);
  state.events.push({ kind: 'roundStart', round: state.round });
}

export function buyItem(state, player, id) {
  if (state.phase !== 'freeze') return false;
  if (WEAPONS[id]) {
    const def = WEAPONS[id];
    if (player.money < def.price) return false;
    if (def.slot === 'primary') {
      if (player.primary?.id === id) return false;
      player.money -= def.price;
      player.primary = createWeaponState(id);
      player.active = 'primary';
    } else {
      return false; // pistol is the permanent sidearm
    }
    state.events.push({ kind: 'buy', by: player.id, item: id });
    return true;
  }
  const gear = GEAR[id];
  if (!gear || player.money < gear.price) return false;
  if (id === 'armor') {
    if (player.armor >= 100) return false;
    player.money -= gear.price;
    player.armor = 100;
  } else if (id === 'frag') {
    if (player.grenades.frag >= GEAR.frag.max) return false;
    player.money -= gear.price;
    player.grenades.frag += 1;
  } else if (id === 'smoke') {
    if (player.grenades.smoke >= GEAR.smoke.max) return false;
    player.money -= gear.price;
    player.grenades.smoke += 1;
  }
  state.events.push({ kind: 'buy', by: player.id, item: id });
  return true;
}

// Bonuses are per TEAM: the loss streak advances once per round, not once
// per player (an earlier version incremented inside the player loop, paying
// later players on the losing team up to $3400 instead of $1900).
function awardMoney(state, winner) {
  const loser = winner === 'vanguard' ? 'sentinel' : 'vanguard';
  state.lossStreak[winner] = 0;
  state.lossStreak[loser] += 1;
  const lossBonus = GAME.lossBonus
    + Math.min(3, state.lossStreak[loser] - 1) * GAME.lossStreakBonus;
  for (const p of state.players) {
    const bonus = p.team === winner ? GAME.winBonus : lossBonus;
    p.money = Math.min(GAME.maxMoney, p.money + bonus);
  }
}

export function endRound(state, winner, reason) {
  if (state.phase === 'end' || state.phase === 'match') return;
  state.phase = 'end';
  state.phaseT = GAME.endTime;
  state.winner = winner;
  state.endReason = reason;
  state.wins[winner] += 1;
  awardMoney(state, winner);
  state.events.push({ kind: 'roundEnd', winner, reason });
  if (state.wins[winner] >= GAME.roundsToWin) {
    state.matchWinner = winner;
  }
}

export function plantBomb(state, planter, siteKey) {
  const site = SITES[siteKey];
  state.bomb.state = 'planted';
  state.bomb.site = siteKey;
  state.bomb.pos = { x: planter.pos.x, y: 0.2, z: planter.pos.z };
  state.bomb.timer = GAME.bombTimer;
  state.bomb.plantedAt = state.time;
  state.bomb.carrierId = null;
  planter.hasBomb = false;
  planter.planting = 0;
  planter.money = Math.min(GAME.maxMoney, planter.money + GAME.plantBonus);
  state.events.push({ kind: 'plant', by: planter.id, site: siteKey });
}

export function defuseBomb(state, defuser) {
  state.bomb.state = 'defused';
  defuser.defusing = 0;
  state.events.push({ kind: 'defuse', by: defuser.id });
  endRound(state, 'sentinel', 'Charge defused');
}

export function stepRounds(state, dt) {
  if (state.phase === 'menu' || state.phase === 'match') return;
  state.phaseT -= dt;
  if (state.phase === 'freeze') {
    if (state.phaseT <= 0) {
      state.phase = 'live';
      state.phaseT = GAME.roundTime;
      state.events.push({ kind: 'live' });
    }
    return;
  }
  if (state.phase === 'live') {
    // Bomb timer.
    if (state.bomb.state === 'planted') {
      state.bomb.timer -= dt;
      if (state.bomb.timer <= 0) {
        state.bomb.state = 'exploded';
        state.events.push({ kind: 'explode', site: state.bomb.site });
        endRound(state, 'vanguard', 'Charge detonated');
        return;
      }
    }
    // Elimination / timeout.
    const v = aliveOf(state, 'vanguard');
    const s = aliveOf(state, 'sentinel');
    if (v === 0 && state.bomb.state !== 'planted') {
      endRound(state, 'sentinel', 'Vanguard eliminated');
      return;
    }
    if (s === 0) {
      if (state.bomb.state === 'planted') {
        // No defenders left to defuse: the bomb decides it.
        state.bomb.timer = Math.min(state.bomb.timer, 2);
      } else {
        endRound(state, 'vanguard', 'Sentinel eliminated');
        return;
      }
    }
    if (state.phaseT <= 0 && state.bomb.state !== 'planted') {
      endRound(state, 'sentinel', 'Time expired');
    }
    return;
  }
  if (state.phase === 'end' && state.phaseT <= 0) {
    if (state.matchWinner) {
      state.phase = 'match';
      state.events.push({ kind: 'matchEnd', winner: state.matchWinner });
    } else {
      state.round += 1;
      resetRound(state);
    }
  }
}

// Player interaction: plant (hold E in a site with the bomb), defuse (hold E
// near a planted bomb), pick up a dropped bomb by walking over it.
export function stepInteract(state, player, holdingE, dt) {
  if (!player.alive || state.phase !== 'live') {
    player.planting = 0;
    player.defusing = 0;
    return;
  }
  // Pickup.
  if (player.team === 'vanguard' && state.bomb.state === 'dropped' && state.bomb.pos
    && Math.hypot(state.bomb.pos.x - player.pos.x, state.bomb.pos.z - player.pos.z) < 1.3) {
    player.hasBomb = true;
    state.bomb.state = 'carried';
    state.bomb.carrierId = player.id;
    state.events.push({ kind: 'pickup', by: player.id });
  }
  if (!holdingE) {
    player.planting = 0;
    player.defusing = 0;
    return;
  }
  if (player.hasBomb && state.bomb.state === 'carried') {
    for (const key of ['A', 'B', 'C']) {
      const site = SITES[key];
      if (Math.hypot(site.x - player.pos.x, site.z - player.pos.z) < site.r) {
        player.planting += dt;
        if (player.planting >= GAME.plantTime) plantBomb(state, player, key);
        return;
      }
    }
    player.planting = 0;
    return;
  }
  if (state.bomb.state === 'planted' && state.bomb.pos && player.team === 'sentinel'
    && Math.hypot(state.bomb.pos.x - player.pos.x, state.bomb.pos.z - player.pos.z) < 1.8) {
    player.defusing += dt;
    if (player.defusing >= GAME.defuseTime) defuseBomb(state, player);
  } else {
    player.defusing = 0;
  }
}
