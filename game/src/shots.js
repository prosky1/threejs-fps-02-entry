// Deterministic capture mode: ?shot=start|buy|play|end&seed=N. The game plays
// itself on a fixed seed — bots fight, the autopilot walks and aims — then the
// frame freezes and window.__shotReady is set for the screenshot script. These
// are real renders of the game's own code, not composites.
import { SITES } from './map.js';

// Autopilot: walk the player toward the assigned site, look at the nearest
// visible enemy, fire in short bursts. Used only in ?shot=play/end captures.
export function createAutopilot(state) {
  const me = state.players[0];
  let fireUntil = 0;
  let pauseUntil = 0;
  return {
    step(dt, canSee) {
      const keys = new Set();
      if (!me.alive || state.phase !== 'live') return { keys, look: { x: 0, y: 0 }, fire: false };
      // Walk toward Site A.
      const site = SITES.A;
      const dx = site.x - me.pos.x;
      const dz = site.z - me.pos.z;
      const wantYaw = Math.atan2(-dx, -dz);
      let dyaw = wantYaw - me.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      // Look for an enemy first; otherwise look where we walk.
      let target = null;
      let bestD = Infinity;
      for (const p of state.players) {
        if (p.team === me.team || !p.alive) continue;
        const d = (p.pos.x - me.pos.x) ** 2 + (p.pos.z - me.pos.z) ** 2;
        if (d < bestD && canSee(me, p)) { bestD = d; target = p; }
      }
      let lookX = 0;
      let lookY = 0;
      let fire = false;
      if (target) {
        const tdx = target.pos.x - me.pos.x;
        const tdz = target.pos.z - me.pos.z;
        const tyaw = Math.atan2(-tdx, -tdz);
        let dty = tyaw - me.yaw;
        while (dty > Math.PI) dty -= Math.PI * 2;
        while (dty < -Math.PI) dty += Math.PI * 2;
        lookX = -dty / 0.0022;
        const dist = Math.hypot(tdx, tdz);
        const tpitch = Math.atan2(target.pos.y + 1.2 - (me.pos.y + 1.62), dist);
        lookY = -(tpitch - me.pitch) / 0.0022;
        if (Math.abs(dty) < 0.05) {
          if (state.time < fireUntil) fire = true;
          else if (state.time > pauseUntil) {
            fire = true;
            fireUntil = state.time + 0.4;
            pauseUntil = state.time + 0.9;
          }
        }
      } else {
        lookX = -dyaw / 0.0022;
      }
      lookX = Math.max(-60, Math.min(60, lookX));
      lookY = Math.max(-40, Math.min(40, lookY));
      if (Math.abs(dyaw) < 0.6) keys.add('KeyW');
      return { keys, look: { x: lookX, y: lookY }, fire };
    },
  };
}

// Runs the scripted capture. api: { startMatch, stepFixed, syncAll, render,
// showBuy, showScoreboard, banner }. Calls window.__shotReady when done.
export function runShot(name, api) {
  const STEP = 1 / 60;
  if (name === 'start') {
    api.pose(-24, 10, -0.5, -0.08);
    api.showOverlay('start');
  } else if (name === 'buy') {
    api.startMatch();
    api.pose(-42, 0, -Math.PI / 2, 0);
    api.showBuy();
  } else if (name === 'play') {
    api.startMatch();
    api.skipFreeze();
    for (let i = 0; i < 60 * 9; i += 1) api.stepFixed(STEP, true);
    api.syncAll();
  } else if (name === 'end') {
    api.startMatch();
    api.skipFreeze();
    // Play the round out for real (cap 115s of sim) until it ends.
    let guard = 0;
    while (api.phase() === 'live' && guard < 60 * 115) {
      api.stepFixed(STEP, true);
      guard += 1;
    }
    for (let i = 0; i < 60; i += 1) api.stepFixed(STEP, false);
    api.syncAll();
    api.showScoreboard();
  }
  api.render();
  api.render();
  window.__shotReady = true;
}
