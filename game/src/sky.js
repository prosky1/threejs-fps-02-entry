// Dusk sky for Depot 9: a gradient dome, a low sun with a glow, drifting
// clouds and a dark skyline silhouette beyond the yard walls. Everything is
// procedural (canvas textures, no files, no network) and static geometry —
// the dome never moves, so it costs one draw call and no per-frame work.
import * as THREE from 'three';

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#141a33'); // zenith: deep indigo
  grad.addColorStop(0.35, '#2c2a4e'); // upper dusk purple
  grad.addColorStop(0.62, '#6e3f56'); // mauve band
  grad.addColorStop(0.8, '#c65f2e'); // burnt-orange horizon glow
  grad.addColorStop(0.93, '#f0a35e'); // warm haze at the horizon
  grad.addColorStop(1.0, '#8a6a52'); // ground haze below the horizon line
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  // A few faint early stars high up.
  for (let i = 0; i < 90; i += 1) {
    const y = Math.random() * 130;
    const a = (1 - y / 150) * (0.25 + Math.random() * 0.55);
    g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    g.fillRect(Math.random() * 4, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  // A soft elongated blob: several overlapping radial gradients.
  for (const [x, y, r, a] of [
    [70, 70, 46, 0.5], [120, 58, 58, 0.6], [180, 72, 44, 0.5],
    [100, 80, 52, 0.45], [150, 84, 50, 0.4],
  ]) {
    const grad = g.createRadialGradient(x, y, 4, x, y, r);
    grad.addColorStop(0, `rgba(255,196,150,${a})`);
    grad.addColorStop(1, 'rgba(255,196,150,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSky(scene) {
  // The dome: a big sphere, BackSide, fog never touches it.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(220, 32, 20),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(dome);

  // The sun: a bright core with a wide warm halo, low in the west.
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,236,190,1)', 'rgba(255,150,60,0.55)'),
    transparent: true, depthWrite: false, fog: false,
  }));
  sunGlow.position.set(-170, 42, -95);
  sunGlow.scale.set(110, 110, 1);
  scene.add(sunGlow);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,250,225,1)', 'rgba(255,200,110,0.9)'),
    transparent: true, depthWrite: false, fog: false,
  }));
  sunCore.position.set(-170, 42, -95);
  sunCore.scale.set(26, 26, 1);
  scene.add(sunCore);

  // Clouds: a handful of soft sprites, high and far, drifting slowly east.
  const cloudTex = cloudTexture();
  const clouds = [];
  const spots = [
    [-120, 95, -140, 90], [40, 110, -160, 120], [140, 88, -120, 80],
    [-60, 105, 150, 100], [110, 98, 140, 90], [-160, 90, 60, 70],
  ];
  for (const [x, y, z, w] of spots) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false, fog: false,
    }));
    c.position.set(x, y, z);
    c.scale.set(w, w * 0.42, 1);
    scene.add(c);
    clouds.push(c);
  }

  // Skyline: dark warehouse and crane silhouettes ringing the yard, outside
  // the playable walls — pure backdrop, no colliders, no gameplay effect.
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0x1d2029, fog: false });
  const skyline = new THREE.Group();
  const blocks = [
    [-120, 8, -90, 34, 16], [-70, 6, -120, 26, 12], [-10, 5, -130, 40, 10],
    [60, 7, -120, 30, 14], [120, 6, -80, 36, 12], [140, 9, -10, 22, 18],
    [130, 5, 60, 30, 10], [90, 8, 120, 34, 16], [20, 6, 130, 28, 12],
    [-50, 7, 125, 36, 14], [-110, 6, 110, 28, 12], [-140, 8, 30, 24, 16],
    [-135, 5, -50, 26, 10],
  ];
  for (const [x, y, z, w, h] of blocks) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), skylineMat);
    b.position.set(x, h / 2 - 1, z);
    skyline.add(b);
  }
  // Two crane silhouettes: a mast and a jib each.
  for (const [x, z, ry] of [[-95, -105, 0.4], [105, 95, -0.7]]) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(3, 42, 3), skylineMat);
    mast.position.set(x, 20, z);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(34, 2.4, 2.4), skylineMat);
    jib.position.set(x, 40, z);
    jib.rotation.y = ry;
    skyline.add(mast, jib);
  }
  scene.add(skyline);

  return {
    update(dt) {
      for (const c of clouds) {
        c.position.x += dt * 0.55;
        if (c.position.x > 190) c.position.x = -190;
      }
    },
  };
}
