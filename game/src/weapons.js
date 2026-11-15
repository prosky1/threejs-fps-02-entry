// Hitscan gunplay: spread grows with movement and sustained fire, shrinks when
// still, crouched or aiming — stopping to aim pays. Damage falls with range and
// multiplies on headshots. Grenades are simulated ballistic bodies.
import { rayCapsule, raySphere, rayWalls } from './collision.js';
import { clamp } from './rng.js';

const wallHit = { dist: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };

// Current cone (radians) for a shooter. Bloom decays in weapon.step.
export function computeSpread(def, speed, crouch, ads, bloom) {
  let spread = def.spread + bloom;
  if (speed > 0.5) spread += def.moveSpread * Math.min(1, speed / 4.6);
  if (crouch) spread *= 0.7;
  if (ads) spread *= 0.45;
  return spread;
}

export function damageAtRange(def, dist, head) {
  const t = clamp((dist - 8) / Math.max(1, def.farStart - 8), 0, 1);
  const base = def.damage + (def.farDamage - def.damage) * t;
  return head ? base * def.headMult : base;
}

// Aim point of a body part in world space (head sphere / chest point, for bots).
export function partPoint(player, part) {
  const crouch = player.crouch ? 0.45 : 0;
  return part === 'head'
    ? { x: player.pos.x, y: player.pos.y + 1.58 - crouch, z: player.pos.z, r: 0.24 }
    : { x: player.pos.x, y: player.pos.y + 1.05 - crouch * 0.6, z: player.pos.z, r: 0.34 };
}

// Body hitbox: a vertical capsule (hips to shoulders) plus a head sphere.
// A capsule catches grazing shots a single chest sphere misses and stops
// shots passing between head and chest spheres from whiffing.
export function bodyCapsule(player) {
  const c = player.crouch ? 1 : 0;
  return {
    ax: player.pos.x, ay: player.pos.y + 0.72 - c * 0.22, az: player.pos.z,
    bx: player.pos.x, by: player.pos.y + 1.38 - c * 0.42, bz: player.pos.z, r: 0.34,
  };
}

// Deterministic recoil step for the Nth shot of a spray (0-based): the
// pattern in config.js, so a spray climbs a learnable path.
export function patternKick(def, shotN) {
  const pat = def.pattern;
  if (!pat || !pat.length) return [def.recoil, 0];
  return pat[shotN % pat.length];
}

// One hitscan bullet. Returns {hit:'wall'|'player'|null, victim, part, dist, point}.
// out is a reused result object — no allocation in the hot path.
export function resolveShot(world, shooter, origin, dir, def, players, out) {
  const wall = rayWalls(world.collision, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, def.range, wallHit);
  let bestDist = wall ? wall.dist : def.range;
  let victim = null;
  let part = null;
  for (const p of players) {
    if (p === shooter || !p.alive) continue;
    const head = partPoint(p, 'head');
    const dh = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, head.x, head.y, head.z, head.r, bestDist);
    const cap = bodyCapsule(p);
    const db = rayCapsule(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z,
      cap.ax, cap.ay, cap.az, cap.bx, cap.by, cap.bz, cap.r, bestDist);
    // The capsule's top cap overlaps the head sphere (neck region): a ray
    // through the head must count as a headshot, so the head wins when its
    // surface is within 0.15 m of the capsule's along the ray.
    if (dh < Infinity && dh <= db + 0.15 && dh < bestDist) { bestDist = dh; victim = p; part = 'head'; }
    else if (db < bestDist) { bestDist = db; victim = p; part = 'body'; }
  }
  out.dist = bestDist;
  out.point.x = origin.x + dir.x * bestDist;
  out.point.y = origin.y + dir.y * bestDist;
  out.point.z = origin.z + dir.z * bestDist;
  if (victim) {
    out.hit = 'player';
    out.victim = victim;
    out.part = part;
    out.damage = damageAtRange(def, bestDist, part === 'head');
  } else if (wall) {
    out.hit = 'wall';
    out.victim = null;
    out.part = null;
    out.damage = 0;
    out.nx = wall.nx; out.ny = wall.ny; out.nz = wall.nz;
  } else {
    out.hit = null;
    out.victim = null;
    out.part = null;
    out.damage = 0;
  }
  return out;
}

export function makeShotResult() {
  return { hit: null, victim: null, part: null, dist: 0, damage: 0, point: { x: 0, y: 0, z: 0 }, nx: 0, ny: 0, nz: 0 };
}

// Firing state machine for one weapon: cooldown, reload timer, bloom decay.
export function stepWeapon(w, def, dt) {
  if (w.cooldown > 0) w.cooldown -= dt;
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) {
      const need = def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
  }
  w.bloom = Math.max(0, w.bloom - dt * 0.05);
  // Spray pattern resets after 0.6s without a shot.
  if (w.cooldown <= 0 && w.reloading <= 0) {
    w.idleT = (w.idleT ?? 0) + dt;
    if (w.idleT > 0.6) w.shotN = 0;
  } else {
    w.idleT = 0;
  }
}

export function tryFire(w, def) {
  if (w.reloading > 0 || w.cooldown > 0) return 'busy';
  if (w.mag <= 0) return 'empty';
  w.mag -= 1;
  w.cooldown = 1 / def.fireRate;
  w.bloom = Math.min(def.bloomMax, w.bloom + def.bloom);
  w.shotN = (w.shotN ?? 0) + 1;
  w.idleT = 0;
  return 'fired';
}

export function tryReload(w, def) {
  if (w.reloading > 0 || w.mag >= def.mag || w.reserve <= 0) return false;
  w.reloading = def.reload;
  return true;
}

// Grenades: simple ballistic sim with one bounce, then fuse. Frag deals radial
// damage with wall occlusion; smoke lays a sight-blocking cloud.
export function throwGrenade(state, owner, kind, origin, dir) {
  state.frags.push({
    kind, owner: owner.id,
    pos: { x: origin.x, y: origin.y, z: origin.z },
    vel: { x: dir.x * 16 + owner.vel.x * 0.4, y: dir.y * 16 + 3.5, z: dir.z * 16 + owner.vel.z * 0.4 },
    fuse: kind === 'frag' ? 1.6 : 1.1,
  });
}

export function stepGrenades(state, world, dt, onExplode, onSmoke) {
  for (let i = state.frags.length - 1; i >= 0; i -= 1) {
    const g = state.frags[i];
    g.vel.y -= 14.5 * dt;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    if (g.pos.y < 0.15) {
      g.pos.y = 0.15;
      g.vel.y = -g.vel.y * 0.35;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    g.fuse -= dt;
    if (g.fuse <= 0) {
      state.frags.splice(i, 1);
      if (g.kind === 'frag') onExplode(g);
      else onSmoke(g);
    }
  }
}
