// Axis-aligned collision + raycasts. The map is one level of AABB boxes, so both
// movement and hitscan are exact slab tests — no physics engine, no surprises.
// All math is plain numbers; hot paths allocate nothing.
export function createCollision(boxes) {
  return { boxes };
}

// Move an AABB body (half extents hx, height h, feet at pos.y) by delta, resolving
// one axis at a time so sliding along walls works. Mutates pos in place.
export function moveBody(collision, pos, delta, hx, h) {
  pos.x += delta.x;
  resolveAxis(collision, pos, hx, h, 'x');
  pos.z += delta.z;
  resolveAxis(collision, pos, hx, h, 'z');
  pos.y += delta.y;
  if (pos.y < 0) pos.y = 0;
  resolveAxis(collision, pos, hx, h, 'y');
}

function overlaps(box, pos, hx, h) {
  return pos.x + hx > box.min[0] && pos.x - hx < box.max[0]
    && pos.y + h > box.min[1] && pos.y < box.max[1]
    && pos.z + hx > box.min[2] && pos.z - hx < box.max[2];
}

function resolveAxis(collision, pos, hx, h, axis) {
  for (const box of collision.boxes) {
    if (!overlaps(box, pos, hx, h)) continue;
    if (axis === 'x') {
      const cx = (box.min[0] + box.max[0]) / 2;
      pos.x = pos.x < cx ? box.min[0] - hx : box.max[0] + hx;
    } else if (axis === 'z') {
      const cz = (box.min[2] + box.max[2]) / 2;
      pos.z = pos.z < cz ? box.min[2] - hx : box.max[2] + hx;
    } else if (axis === 'y') {
      const cy = (box.min[1] + box.max[1]) / 2;
      pos.y = pos.y + h / 2 < cy ? box.min[1] - h : box.max[1];
    }
  }
}

// Ray vs one AABB (slab method). Returns distance or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return Infinity;
    } else {
      let t1 = (box.min[i] - o[i]) / d[i];
      let t2 = (box.max[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Nearest wall hit along a ray, or null. out is reused {dist, x, y, z, nx, ny, nz}.
export function rayWalls(collision, ox, oy, oz, dx, dy, dz, maxDist, out) {
  let best = Infinity;
  let bestBox = null;
  for (const box of collision.boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, box, maxDist);
    if (t < best) { best = t; bestBox = box; }
  }
  if (!bestBox || best === Infinity) return null;
  out.dist = best;
  out.x = ox + dx * best;
  out.y = oy + dy * best;
  out.z = oz + dz * best;
  // Face normal from the hit point's position inside the box.
  const e = 0.01;
  out.nx = Math.abs(out.x - bestBox.min[0]) < e ? -1 : Math.abs(out.x - bestBox.max[0]) < e ? 1 : 0;
  out.ny = Math.abs(out.y - bestBox.min[1]) < e ? -1 : Math.abs(out.y - bestBox.max[1]) < e ? 1 : 0;
  out.nz = Math.abs(out.z - bestBox.min[2]) < e ? -1 : Math.abs(out.z - bestBox.max[2]) < e ? 1 : 0;
  return out;
}

// Ray vs sphere. Returns distance or Infinity.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  const t = tca - Math.sqrt(r2 - d2);
  return t >= 0 && t <= maxDist ? t : Infinity;
}

// Ray vs capsule (axis segment a-b, radius r): the body hitbox. Closest points
// between the ray segment and the capsule axis (Ericson, segment-segment);
// a hit is when that distance is under r, pulled back by the cap depth.
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r, maxDist) {
  const p1 = [ox, oy, oz];
  const q1 = [ox + dx * maxDist, oy + dy * maxDist, oz + dz * maxDist];
  const p2 = [ax, ay, az];
  const q2 = [bx, by, bz];
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r0 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r0);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let s;
  let t;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = clamp01(f / e); }
  else {
    const c = dot(d1, r0);
    if (e <= 1e-12) { t = 0; s = clamp01(-c / a); }
    else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const cx = p1[0] + d1[0] * s - (p2[0] + d2[0] * t);
  const cy = p1[1] + d1[1] * s - (p2[1] + d2[1] * t);
  const cz = p1[2] + d1[2] * s - (p2[2] + d2[2] * t);
  const d2v = cx * cx + cy * cy + cz * cz;
  if (d2v > r * r) return Infinity;
  const hit = s * maxDist - Math.sqrt(r * r - d2v);
  return hit >= 0 && hit <= maxDist ? hit : Infinity;
}

// Line of sight between two points: true when no wall blocks the segment.
export function hasLineOfSight(collision, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const inv = 1 / dist;
  const tmp = { dist: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0 };
  const hit = rayWalls(collision, ax, ay, az, dx * inv, dy * inv, dz * inv, dist - 0.05, tmp);
  return hit === null;
}

// Does segment ab pass through sphere (cx,cy,cz,r)? Used for smoke blocking sight.
export function segmentHitsSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + abx * t - cx;
  const py = ay + aby * t - cy;
  const pz = az + abz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}
