// Depot 9: an original freight yard at dusk. One level, AABB colliders, a waypoint
// graph bots path over. Vanguard spawn west, Sentinel east, Site A north-east inside
// a walled yard, Site B south-east among containers, a warehouse astride mid.
// v3: richer procedural textures (stains, rust, stencils, hazard paint), more
// set dressing (stacked containers, sandbags, floodlight towers, signage, a
// parked truck, a watchtower), warmer dusk lighting with a cool fill light.
import * as THREE from 'three';
import { createCollision } from './collision.js';

export const BOUNDS = { x: 48, z: 32 };

// [minX, minY, minZ, maxX, maxY, maxZ, material]
const BOXES = [
  // Perimeter (h 6).
  [-49, 0, -33, 49, 6, -32, 'wall'], [-49, 0, 32, 49, 6, 33, 'wall'],
  [-49, 0, -33, -48, 6, 33, 'wall'], [48, 0, -33, 49, 6, 33, 'wall'],
  // Warehouse astride mid (x -10..10, z -12..12), doors on all four sides.
  [-10, 0, -12, -2, 4, -11, 'wall'], [2, 0, -12, 10, 4, -11, 'wall'],
  [-10, 0, 11, -2, 4, 12, 'wall'], [2, 0, 11, 10, 4, 12, 'wall'],
  [-10, 0, -12, -9, 4, -3, 'wall'], [-10, 0, 3, -9, 4, 12, 'wall'],
  [9, 0, -12, 10, 4, -3, 'wall'], [9, 0, 3, 10, 4, 12, 'wall'],
  // Site A enclosure (NE): entries west (z -16..-8) and south (x 30..42).
  [20, 0, -28, 21, 4, -16, 'wall'], [20, 0, -8, 30, 4, -7, 'wall'],
  // Site B enclosure (SE): entries west (z 8..16) and north (x 30..42).
  [20, 0, 16, 21, 4, 28, 'wall'], [20, 0, 7, 30, 4, 8, 'wall'],
  // Long-corridor dividers with a gap at x -36..-26 (both waypoint crossings).
  [-40, 0, -22.5, -36, 4, -21.5, 'wall'], [-26, 0, -22.5, -14, 4, -21.5, 'wall'],
  [-40, 0, 21.5, -36, 4, 22.5, 'wall'], [-26, 0, 21.5, -14, 4, 22.5, 'wall'],
  // Crates and containers (cover + sightline breaks).
  [-8, 0, -6, -6, 2, -4, 'crate'], [5, 0, -5, 7, 2, -3, 'crate'],
  [-15, 0, 5, -13, 2, 7, 'crate'], [13, 0, 4, 15, 2, 6, 'crate'],
  [-5, 0, -20, -3, 2.4, -18, 'crate'], [25, 0, -23, 27, 2.4, -21, 'crate'],
  [35, 0, -21, 37, 2.4, -19, 'crate'], [35, 0, -25, 37, 2.4, -23, 'crate'],
  [25, 0, 21, 27, 2.4, 23, 'crate'], [35, 0, 19, 37, 2.4, 21, 'crate'],
  [-3, 0, -4, -1, 1.2, -2, 'crate'], [26, 0, -11, 28, 1.2, -9, 'crate'],
  [24, 0, 10, 30, 2.6, 12.4, 'containerT'], [36, 0, 20, 42, 2.6, 22.4, 'containerR'],
  [-36, 0, -28, -30, 2.6, -25.6, 'containerO'], [10, 0, 24, 16, 2.6, 26.4, 'containerT'],
  // Stacked containers (second layer, v3): extra verticality + cover.
  [24, 2.6, 10, 30, 5.2, 12.4, 'containerO'],
  [-36, 2.6, -28, -30, 5.2, -25.6, 'containerR'],
  [36, 0, 24.5, 42, 2.6, 27, 'containerT'],
  // Watchtower legs + platform block (decorative solid).
  [-4, 0, -18, -2, 5, -16, 'metal'],
  // Barrel clusters (low cylinders read as boxes to the sim).
  [-12, 0, -8, -10.6, 1.1, -6.6, 'barrel'], [28, 0, -4, 29.4, 1.1, -2.6, 'barrel'],
  [10, 0, 18, 11.4, 1.1, 19.4, 'barrel'],
  // Sandbag lines guarding the site entries (v3): low hard cover.
  [18.2, 0, -15.4, 19.4, 1.1, -13.4, 'sandbag'],
  [18.2, 0, -10.6, 19.4, 1.1, -8.6, 'sandbag'],
  [18.2, 0, 8.6, 19.4, 1.1, 10.6, 'sandbag'],
  [18.2, 0, 13.4, 19.4, 1.1, 15.4, 'sandbag'],
  // Parked flatbed truck west of spawn (v3): cab + trailer, clear of waypoint edges.
  [-45.5, 0, -12.5, -41.5, 2.6, -10, 'truck'],
  [-41.5, 0, -12.5, -39.5, 3.1, -10, 'truckCab'],
];

// Waypoint graph: bots BFS over this. Coordinates verified against the walls above:
// every edge's segment clears every box (checked by the map self-test in main.js).
export const WAYPOINTS = [
  { x: -42, z: 0 }, { x: -32, z: -24 }, { x: -8, z: -27 }, { x: 12, z: -27 },
  { x: 24, z: -14 }, { x: 30, z: -18 }, { x: 38, z: -10 }, { x: 38, z: -4 },
  { x: 34, z: 0 }, { x: 42, z: 0 }, { x: 38, z: 4 }, { x: 38, z: 10 },
  { x: 30, z: 18 }, { x: 24, z: 14 }, { x: 8, z: 27 }, { x: -10, z: 27 },
  { x: -32, z: 24 }, { x: -20, z: 0 }, { x: 0, z: 0 }, { x: 18, z: 0 },
  { x: 0, z: -16 }, { x: 0, z: 16 }, { x: 16, z: -12 }, { x: 16, z: 12 },
];
const EDGES = [
  [0, 1], [0, 17], [0, 16], [1, 2], [1, 17], [2, 3], [2, 17], [2, 22],
  [3, 22], [4, 5], [4, 22], [5, 6], [6, 7], [7, 8], [7, 9], [8, 9],
  [8, 10], [10, 11], [10, 9], [11, 12], [12, 13], [13, 23],
  [14, 15], [14, 23], [15, 16], [15, 17], [15, 21], [16, 17], [17, 18], [18, 19],
  [18, 20], [18, 21], [19, 8], [19, 22], [19, 23], [20, 22], [21, 23],
];
export const GRAPH = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { GRAPH[a].push(b); GRAPH[b].push(a); }

export const SITES = {
  A: { x: 30, z: -18, r: 6.5, label: 'A' },
  B: { x: 30, z: 18, r: 6.5, label: 'B' },
  // Site C: inside the mid warehouse (doors on all four sides), so the
  // rotation is A/B/C and mid control matters every round.
  C: { x: 0, z: 0, r: 5.5, label: 'C' },
};
export const SPAWNS = {
  vanguard: [-4, -2, 0, 2, 4].map((z) => ({ x: -44, z, yaw: -Math.PI / 2 })),
  sentinel: [-4, -2, 0, 2, 4].map((z) => ({ x: 44, z, yaw: Math.PI / 2 })),
};

// Breadth-first shortest path over the waypoint graph. Returns waypoint indices.
export function findPath(from, to) {
  if (from === to) return [to];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length) {
    const cur = queue.shift();
    for (const next of GRAPH[cur]) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) { node = prev[node]; path.unshift(node); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i += 1) {
    const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Deterministic speckle so the ground reads as worn asphalt, not flat paint.
function speckle(g, s, n, alpha) {
  for (let i = 0; i < n; i += 1) {
    g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${18 + Math.random() * 36 | 0},${14 + Math.random() * 28 | 0},${alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

function groundTexture() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#6f675a';
    g.fillRect(0, 0, s, s);
    speckle(g, s, 9000, 0.25);
    // Oil stains: dark soft ellipses.
    for (let i = 0; i < 14; i += 1) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 12 + Math.random() * 30;
      const grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(18,16,12,0.5)');
      grad.addColorStop(1, 'rgba(18,16,12,0)');
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
    // Cracks: thin dark polylines.
    g.strokeStyle = 'rgba(30,26,20,0.55)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 10; i += 1) {
      let x = Math.random() * s;
      let y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k += 1) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    // Expansion joints.
    g.strokeStyle = 'rgba(40,36,30,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo((i * s) / 4, 0); g.lineTo((i * s) / 4, s); g.stroke();
      g.beginPath(); g.moveTo(0, (i * s) / 4); g.lineTo(s, (i * s) / 4); g.stroke();
    }
    // Faded centre line.
    g.strokeStyle = 'rgba(240,168,48,0.55)';
    g.lineWidth = 5;
    g.setLineDash([26, 18]);
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
  }, 12, 8);
}

function panelTexture(base, line) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    // Rust streaks running down from the top edge.
    for (let i = 0; i < 12; i += 1) {
      const x = Math.random() * s;
      const len = 30 + Math.random() * 90;
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(90,52,28,0.4)');
      grad.addColorStop(1, 'rgba(90,52,28,0)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 3 + Math.random() * 5, len);
    }
    g.strokeStyle = line;
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo((i * s) / 4, 0); g.lineTo((i * s) / 4, s); g.stroke();
    }
    // Rivets along each seam.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i <= 4; i += 1) {
      for (let y = 14; y < s; y += 42) { g.beginPath(); g.arc((i * s) / 4, y, 2.5, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, s - 26, s, 26);
  }, 2, 1);
}

function plankTexture() {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#8a6b42';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle = i % 2 ? '#7d6139' : '#96764a';
      g.fillRect(0, (i * s) / 5, s, s / 5 - 3);
    }
    // Stencilled depot mark.
    g.fillStyle = 'rgba(30,22,14,0.6)';
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('SL-09', s / 2, s / 2 + 12);
    g.strokeStyle = 'rgba(60,42,20,0.7)';
    g.lineWidth = 4;
    g.strokeRect(4, 4, s - 8, s - 8);
  });
}

function corrugatedTexture(base, label) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x, 0, 5, s);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x + 9, 0, 5, s);
    }
    // Weathering: pale dust near the bottom, rust at the top corners.
    const dust = g.createLinearGradient(0, s * 0.6, 0, s);
    dust.addColorStop(0, 'rgba(200,180,150,0)');
    dust.addColorStop(1, 'rgba(200,180,150,0.18)');
    g.fillStyle = dust;
    g.fillRect(0, s * 0.6, s, s * 0.4);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, s, 10);
    g.fillRect(0, s - 10, s, 10);
    if (label) {
      g.fillStyle = 'rgba(240,235,220,0.85)';
      g.font = 'bold 40px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(label, s / 2, s / 2 - 6);
      g.font = 'bold 22px system-ui, sans-serif';
      g.fillStyle = 'rgba(240,235,220,0.6)';
      g.fillText('SANDLINE · DEPOT 9', s / 2, s / 2 + 26);
    }
  }, 2, 1);
}

function sandbagTexture() {
  return canvasTexture(128, (g, s) => {
    g.fillStyle = '#7a6a4e';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(50,40,24,0.6)';
    g.lineWidth = 3;
    for (let y = 0; y < s; y += 24) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      for (let x = (y / 24) % 2 ? 16 : 0; x < s; x += 32) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke();
      }
    }
    speckle(g, s, 500, 0.3);
  }, 1, 1);
}

function letterSprite(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = color;
  g.font = 'bold 92px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.4, 3.4, 1);
  sprite.renderOrder = 5;
  return sprite;
}

// A big painted letter flat on the ground (site decal), with a hazard ring.
function groundLetter(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.setLineDash([22, 14]);
  g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = color;
  g.font = 'bold 130px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 136);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  return mesh;
}

function signTexture(text, sub) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const g = canvas.getContext('2d');
  g.fillStyle = '#23262c';
  g.fillRect(0, 0, 512, 192);
  g.strokeStyle = '#f0a830';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 176);
  g.fillStyle = '#f0a830';
  g.font = 'bold 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 256, 96);
  g.fillStyle = '#cfd4d8';
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText(sub, 256, 150);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildMap(scene) {
  const materials = {
    wall: new THREE.MeshStandardMaterial({ map: panelTexture('#7d7468', '#5d554a'), roughness: 0.95 }),
    crate: new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 }),
    containerT: new THREE.MeshStandardMaterial({ map: corrugatedTexture('#2e7f86', 'SL-114'), roughness: 0.7, metalness: 0.35 }),
    containerR: new THREE.MeshStandardMaterial({ map: corrugatedTexture('#a8542f', 'SL-207'), roughness: 0.7, metalness: 0.35 }),
    containerO: new THREE.MeshStandardMaterial({ map: corrugatedTexture('#7a7a35', 'SL-088'), roughness: 0.7, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.7 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x8f2f26, roughness: 0.6, metalness: 0.4 }),
    sandbag: new THREE.MeshStandardMaterial({ map: sandbagTexture(), roughness: 1 }),
    truck: new THREE.MeshStandardMaterial({ color: 0x5c6650, roughness: 0.6, metalness: 0.3 }),
    truckCab: new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.55, metalness: 0.3 }),
  };
  const boxes = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x0, y0, z0, x1, y1, z1, mat] of BOXES) {
    const mesh = new THREE.Mesh(boxGeo, materials[mat]);
    mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  }

  // Ground: one big plane with the asphalt texture.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS.x * 2 + 4, BOUNDS.z * 2 + 4),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Site rings + floating letters + painted ground letters.
  const SITE_COLORS = { A: 0xf0a830, B: 0x4fc3f7, C: 0x7ee787 };
  const SITE_CSS = { A: '#f0a830', B: '#4fc3f7', C: '#7ee787' };
  for (const key of Object.keys(SITES)) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 48),
      new THREE.MeshBasicMaterial({ color: SITE_COLORS[key], transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
    const letter = letterSprite(key, SITE_CSS[key]);
    letter.position.set(site.x, 5.2, site.z);
    scene.add(letter);
    const decal = groundLetter(key, key === 'A' ? 'rgba(240,168,48,0.8)' : key === 'B' ? 'rgba(79,195,247,0.8)' : 'rgba(126,231,135,0.8)');
    decal.position.set(site.x, 0.02, site.z);
    scene.add(decal);
  }

  // Warehouse signage + glowing windows on the mid warehouse.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 2.6),
    new THREE.MeshBasicMaterial({ map: signTexture('DEPOT 9', 'FREIGHT TERMINAL · SANDLINE'), transparent: false }),
  );
  sign.position.set(0, 4.6, -12.15);
  sign.rotation.y = Math.PI;
  scene.add(sign);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffc266 });
  for (const [wx, wz, ry] of [[-6, -12.15, Math.PI], [6, -12.15, Math.PI], [-6, 12.15, 0], [6, 12.15, 0]]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), windowMat);
    win.position.set(wx, 2.6, wz);
    win.rotation.y = ry;
    scene.add(win);
  }

  // Watchtower: platform + roof + railing over the existing legs block.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.5 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), towerMat);
  platform.position.set(-3, 5.1, -17);
  platform.castShadow = true;
  scene.add(platform);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 4.8), materials.metal);
  roof.position.set(-3, 8.2, -17);
  roof.castShadow = true;
  scene.add(roof);
  for (const [px, pz] of [[-5, -19], [-1, -19], [-5, -15], [-1, -15]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), towerMat);
    post.position.set(px, 6.7, pz);
    scene.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 0.08), towerMat);
  rail.position.set(-3, 6.4, -19.1);
  scene.add(rail);
  const rail2 = rail.clone();
  rail2.position.set(-3, 6.4, -14.9);
  scene.add(rail2);

  // Floodlight towers in the four corners: pole, emissive head, visible cone.
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide,
  });
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.6 });
  for (const [tx, tz] of [[-44, -28], [-44, 28], [44, -28], [44, 28]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 9, 8), poleMat);
    pole.position.set(tx, 4.5, tz);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.5), headMat);
    head.position.set(tx, 9.1, tz);
    scene.add(head);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5.5, 9, 20, 1, true), coneMat);
    cone.position.set(tx, 4.5, tz);
    cone.rotation.x = Math.PI;
    scene.add(cone);
  }

  // Pallets and pipes: flat dressing flush against walls (no colliders).
  const palletMat = new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 });
  for (const [px, pz, ry] of [[-46, 20, 0.3], [46, -24, -0.2], [-14, -30, 0.9], [44, 26, 0.1], [-46, -6, 0.5]]) {
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 2.4), palletMat);
    pallet.position.set(px, 0.11, pz);
    pallet.rotation.y = ry;
    pallet.receiveShadow = true;
    scene.add(pallet);
  }
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.7, metalness: 0.4 });
  for (const [px, pz] of [[-30, -31.6], [10, -31.6], [30, 31.6]]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 10), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(px, 0.35, pz);
    pipe.castShadow = true;
    scene.add(pipe);
  }

  // Dusk lighting: warm low sun + cool sky fill + a soft cool bounce so the
  // shadowed faces are never pitch black.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.8);
  sun.position.set(-30, 42, -18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -55;
  sun.shadow.camera.right = 55;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x7a8fc7, 0.55);
  fill.position.set(40, 30, 25);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x4a3f31, 1.0));

  // Lamp posts: emissive heads, no extra lights (perf). The mid lamp sits
  // off the centre lane so it never blocks the autopilot's line of fire.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (const [lx, lz] of [[-20, -20], [20, -20], [-20, 20], [20, 20], [-14, 8]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
    pole.position.set(lx, 3, lz);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
    head.position.set(lx, 6.1, lz);
    scene.add(head);
  }

  return { collision: createCollision(boxes), boxes };
}
