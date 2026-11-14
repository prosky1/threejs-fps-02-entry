// Depot 9: an original freight yard at dusk. One level, AABB colliders, a waypoint
// graph bots path over. Vanguard spawn west, Sentinel east, Site A north-east inside
// a walled yard, Site B south-east among containers, a warehouse astride mid.
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
  // Long-corridor dividers with a gap at x -30..-26.
  [-40, 0, -22.5, -30, 4, -21.5, 'wall'], [-26, 0, -22.5, -14, 4, -21.5, 'wall'],
  [-40, 0, 21.5, -30, 4, 22.5, 'wall'], [-26, 0, 21.5, -14, 4, 22.5, 'wall'],
  // Crates and containers (cover + sightline breaks).
  [-7, 0, -1, -5, 2, 1, 'crate'], [5, 0, -5, 7, 2, -3, 'crate'],
  [-15, 0, 5, -13, 2, 7, 'crate'], [15, 0, 3, 17, 2, 5, 'crate'],
  [-5, 0, -20, -3, 2.4, -18, 'crate'], [25, 0, -23, 27, 2.4, -21, 'crate'],
  [33, 0, -15, 35, 2.4, -13, 'crate'], [35, 0, -25, 37, 2.4, -23, 'crate'],
  [25, 0, 21, 27, 2.4, 23, 'crate'], [33, 0, 13, 35, 2.4, 15, 'crate'],
  [-3, 0, -4, -1, 1.2, -2, 'crate'], [26, 0, -11, 28, 1.2, -9, 'crate'],
  [24, 0, 10, 30, 2.6, 12.4, 'containerT'], [36, 0, 20, 42, 2.6, 22.4, 'containerR'],
  [-36, 0, -28, -30, 2.6, -25.6, 'containerO'], [10, 0, 24, 16, 2.6, 26.4, 'containerT'],
  // Watchtower legs + platform block (decorative solid).
  [-4, 0, -18, -2, 5, -16, 'metal'],
  // Barrel clusters (low cylinders read as boxes to the sim).
  [-12, 0, -8, -10.6, 1.1, -6.6, 'barrel'], [28, 0, -4, 29.4, 1.1, -2.6, 'barrel'],
  [12, 0, 16, 13.4, 1.1, 17.4, 'barrel'],
];

// Waypoint graph: bots BFS over this. Coordinates verified against the walls above:
// every edge's segment clears every box (checked by the map self-test in main.js).
export const WAYPOINTS = [
  { x: -42, z: 0 }, { x: -32, z: -27 }, { x: -8, z: -27 }, { x: 12, z: -27 },
  { x: 24, z: -14 }, { x: 30, z: -18 }, { x: 38, z: -10 }, { x: 38, z: -4 },
  { x: 34, z: 0 }, { x: 42, z: 0 }, { x: 38, z: 4 }, { x: 38, z: 10 },
  { x: 30, z: 18 }, { x: 24, z: 14 }, { x: 12, z: 27 }, { x: -10, z: 27 },
  { x: -32, z: 27 }, { x: -20, z: 0 }, { x: 0, z: 0 }, { x: 18, z: 0 },
  { x: 0, z: -16 }, { x: 0, z: 16 }, { x: 16, z: -12 }, { x: 16, z: 12 },
];
const EDGES = [
  [0, 1], [0, 17], [0, 16], [1, 2], [1, 17], [2, 3], [2, 17], [2, 22],
  [3, 22], [4, 5], [4, 22], [5, 6], [6, 7], [7, 8], [7, 9], [8, 9],
  [8, 10], [10, 11], [10, 9], [11, 12], [12, 13], [13, 14], [13, 23],
  [14, 15], [15, 16], [15, 17], [15, 21], [16, 17], [17, 18], [18, 19],
  [18, 20], [18, 21], [19, 8], [19, 22], [19, 23], [20, 22], [21, 23],
];
export const GRAPH = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) { GRAPH[a].push(b); GRAPH[b].push(a); }

export const SITES = {
  A: { x: 30, z: -18, r: 6.5, label: 'A' },
  B: { x: 30, z: 18, r: 6.5, label: 'B' },
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

function groundTexture() {
  return canvasTexture(512, (g, s) => {
    g.fillStyle = '#6f675a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i += 1) {
      g.fillStyle = `rgba(${20 + Math.random() * 40 | 0},${18 + Math.random() * 36 | 0},${14 + Math.random() * 28 | 0},0.25)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(40,36,30,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo((i * s) / 4, 0); g.lineTo((i * s) / 4, s); g.stroke();
      g.beginPath(); g.moveTo(0, (i * s) / 4); g.lineTo(s, (i * s) / 4); g.stroke();
    }
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
    g.strokeStyle = line;
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i += 1) {
      g.beginPath(); g.moveTo((i * s) / 4, 0); g.lineTo((i * s) / 4, s); g.stroke();
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
    g.strokeStyle = 'rgba(60,42,20,0.7)';
    g.lineWidth = 4;
    g.strokeRect(4, 4, s - 8, s - 8);
  });
}

function corrugatedTexture(base) {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x, 0, 5, s);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x + 9, 0, 5, s);
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 0, s, 10);
    g.fillRect(0, s - 10, s, 10);
  }, 2, 1);
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

export function buildMap(scene) {
  const materials = {
    wall: new THREE.MeshStandardMaterial({ map: panelTexture('#7d7468', '#5d554a'), roughness: 0.95 }),
    crate: new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.9 }),
    containerT: new THREE.MeshStandardMaterial({ map: corrugatedTexture('#2e7f86'), roughness: 0.7, metalness: 0.35 }),
    containerR: new THREE.MeshStandardMaterial({ map: corrugatedTexture('#a8542f'), roughness: 0.7, metalness: 0.35 }),
    containerO: new THREE.MeshStandardMaterial({ map: corrugatedTexture('#7a7a35'), roughness: 0.7, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.7 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x8f2f26, roughness: 0.6, metalness: 0.4 }),
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

  // Site rings + floating letters.
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 48),
      new THREE.MeshBasicMaterial({ color: key === 'A' ? 0xf0a830 : 0x4fc3f7, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    scene.add(ring);
    const letter = letterSprite(key, key === 'A' ? '#f0a830' : '#4fc3f7');
    letter.position.set(site.x, 5.2, site.z);
    scene.add(letter);
  }

  // Dusk lighting: warm low sun + cool sky fill.
  const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
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
  scene.add(new THREE.HemisphereLight(0x8fa3c7, 0x4a3f31, 0.9));

  // Lamp posts: emissive heads, no extra lights (perf).
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.6 });
  for (const [lx, lz] of [[-20, -20], [20, -20], [-20, 20], [20, 20], [0, 0]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
    pole.position.set(lx, 3, lz);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lampMat);
    head.position.set(lx, 6.1, lz);
    scene.add(head);
  }

  return { collision: createCollision(boxes), boxes };
}
