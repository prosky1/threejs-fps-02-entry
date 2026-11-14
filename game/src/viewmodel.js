// First-person presentation: the gun viewmodel (bob, recoil, ADS, reload dip),
// muzzle flash, pooled tracers and impact sparks. Pools are preallocated; the
// hot path never creates objects.
import * as THREE from 'three';

const TRACER_POOL = 24;
const SPARK_POOL = 120;

// One viewmodel per weapon: the pistol is a short slide, the SMG a compact
// box with a foregrip, the rifle a long body with a scope, the marksman a
// long barrel with a big scope and a folded bipod. The active gun is the only
// one visible; the muzzle flash is shared and moves to the active muzzle.
function makeGun(id) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.4, metalness: 0.65 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.85 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.5, metalness: 0.4 });
  const g = new THREE.Group();
  const box = (w, h, d, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  const tube = (r, len, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  let muzzle = -0.5;
  if (id === 'pistol') {
    box(0.055, 0.07, 0.26, dark, 0, 0.01, -0.05);
    box(0.05, 0.14, 0.07, grip, 0, -0.09, 0.08, 0.25);
    tube(0.02, 0.1, dark, 0, 0.015, -0.2);
    box(0.02, 0.03, 0.02, dark, 0, 0.055, -0.16);
    box(0.058, 0.012, 0.12, accent, 0, 0.048, -0.05);
    muzzle = -0.26;
  } else if (id === 'smg') {
    box(0.08, 0.11, 0.34, dark, 0, 0, 0);
    tube(0.02, 0.3, dark, 0, 0.015, -0.3);
    box(0.06, 0.1, 0.07, grip, 0, -0.09, -0.12);
    box(0.06, 0.2, 0.08, dark, 0, -0.14, 0.02, 0.1);
    box(0.07, 0.1, 0.18, grip, 0, -0.01, 0.26);
    box(0.03, 0.05, 0.1, dark, 0, 0.08, -0.02);
    box(0.085, 0.018, 0.2, accent, 0, 0.04, -0.05);
    muzzle = -0.48;
  } else if (id === 'rifle') {
    box(0.09, 0.13, 0.44, dark, 0, 0, 0);
    box(0.08, 0.1, 0.3, dark, 0, 0, -0.28);
    tube(0.022, 0.5, dark, 0, 0.015, -0.45);
    tube(0.035, 0.22, dark, 0, 0.1, -0.08);
    box(0.03, 0.05, 0.05, dark, 0, 0.06, -0.02);
    box(0.03, 0.05, 0.05, dark, 0, 0.06, -0.14);
    box(0.07, 0.18, 0.1, dark, 0, -0.14, -0.02, 0.12);
    box(0.08, 0.11, 0.22, grip, 0, -0.01, 0.3);
    box(0.02, 0.06, 0.02, dark, 0, 0.08, -0.5);
    box(0.095, 0.02, 0.2, accent, 0, 0.045, -0.05);
    muzzle = -0.72;
  } else { // marksman
    box(0.09, 0.12, 0.5, dark, 0, 0, 0);
    tube(0.024, 0.7, dark, 0, 0.015, -0.58);
    tube(0.05, 0.3, dark, 0, 0.12, -0.1);
    box(0.03, 0.06, 0.05, dark, 0, 0.07, -0.02);
    box(0.03, 0.06, 0.05, dark, 0, 0.07, -0.18);
    box(0.05, 0.03, 0.1, dark, 0.075, 0.02, 0.12);
    box(0.07, 0.14, 0.09, dark, 0, -0.12, -0.02, 0.1);
    box(0.08, 0.12, 0.26, grip, 0, -0.01, 0.32);
    const bipodL = box(0.02, 0.02, 0.22, dark, -0.05, -0.08, -0.35, 0.5);
    bipodL.rotation.z = 0.5;
    const bipodR = box(0.02, 0.02, 0.22, dark, 0.05, -0.08, -0.35, 0.5);
    bipodR.rotation.z = -0.5;
    box(0.095, 0.02, 0.2, accent, 0, 0.045, -0.05);
    muzzle = -0.95;
  }
  return { group: g, muzzle };
}

export function createViewmodel(camera) {
  const group = new THREE.Group();
  const guns = {};
  for (const id of ['pistol', 'smg', 'rifle', 'marksman']) {
    const built = makeGun(id);
    built.group.visible = id === 'pistol';
    group.add(built.group);
    guns[id] = built;
  }

  const flashLight = new THREE.PointLight(0xffc266, 0, 9, 2);
  flashLight.position.set(0, 0.02, -0.3);
  group.add(flashLight);
  const flashQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flashQuad.position.set(0, 0.02, -0.3);
  group.add(flashQuad);

  group.position.set(0.26, -0.24, -0.5);
  camera.add(group);

  let current = 'pistol';
  const state = { bobT: 0, kick: 0, flash: 0, adsT: 0, reloadT: 0 };
  return {
    group,
    setWeapon(id) {
      if (!guns[id] || id === current) return;
      guns[current].group.visible = false;
      current = id;
      guns[id].group.visible = true;
      const mz = guns[id].muzzle;
      flashLight.position.z = mz - 0.02;
      flashQuad.position.z = mz - 0.04;
    },
    kick(amount) {
      state.kick = Math.min(1, state.kick + amount);
      state.flash = 1;
    },
    setReloading(active) { state.reloadT = active ? 1 : 0; },
    step(dt, speed, ads, grounded) {
      if (speed > 0.5 && grounded) state.bobT += dt * speed * 1.6;
      state.kick = Math.max(0, state.kick - dt * 6);
      state.flash = Math.max(0, state.flash - dt * 14);
      state.adsT += ((ads ? 1 : 0) - state.adsT) * Math.min(1, dt * 10);
      const bobY = Math.sin(state.bobT * 2) * 0.008 * Math.min(1, speed / 4.6);
      const bobX = Math.cos(state.bobT) * 0.006 * Math.min(1, speed / 4.6);
      const hip = { x: 0.26 + bobX, y: -0.24 + bobY, z: -0.5 + state.kick * 0.09 };
      const aim = { x: 0, y: -0.145 + bobY * 0.4, z: -0.42 + state.kick * 0.06 };
      const t = state.adsT;
      group.position.set(
        hip.x + (aim.x - hip.x) * t,
        hip.y + (aim.y - hip.y) * t - state.reloadT * 0.14,
        hip.z + (aim.z - hip.z) * t,
      );
      group.rotation.x = state.kick * 0.09 + state.reloadT * 0.5;
      group.rotation.z = state.reloadT * 0.25;
      flashLight.intensity = state.flash * 14;
      flashQuad.material.opacity = state.flash * 0.95;
      flashQuad.rotation.z = Math.random() * Math.PI;
    },
  };
}

export function createEffects(scene) {
  // Tracers: one LineSegments with a ring buffer of segments.
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(TRACER_POOL * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracers = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0.85,
  }));
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tracerLife = new Float32Array(TRACER_POOL);
  let tracerCursor = 0;

  // Sparks: one Points cloud, ring buffer.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_POOL * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffc266, size: 0.06, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARK_POOL * 3);
  const sparkLife = new Float32Array(SPARK_POOL);
  let sparkCursor = 0;

  // Smoke clouds: a few transparent spheres per cloud, pooled.
  const smokeMeshes = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0xb9bdc2, transparent: true, opacity: 0.32, depthWrite: false });
  for (let i = 0; i < 12; i += 1) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), smokeMat);
    m.visible = false;
    scene.add(m);
    smokeMeshes.push(m);
  }

  return {
    tracer(from, to) {
      const i = tracerCursor;
      tracerCursor = (tracerCursor + 1) % TRACER_POOL;
      tracerPos[i * 6] = from.x; tracerPos[i * 6 + 1] = from.y; tracerPos[i * 6 + 2] = from.z;
      tracerPos[i * 6 + 3] = to.x; tracerPos[i * 6 + 4] = to.y; tracerPos[i * 6 + 5] = to.z;
      tracerLife[i] = 0.07;
      tracerGeo.attributes.position.needsUpdate = true;
    },
    sparksAt(p, normal, count = 8) {
      for (let n = 0; n < count; n += 1) {
        const i = sparkCursor;
        sparkCursor = (sparkCursor + 1) % SPARK_POOL;
        sparkPos[i * 3] = p.x; sparkPos[i * 3 + 1] = p.y; sparkPos[i * 3 + 2] = p.z;
        sparkVel[i * 3] = normal.x * 2 + (Math.random() - 0.5) * 3;
        sparkVel[i * 3 + 1] = Math.abs(normal.y) * 2 + Math.random() * 2.5;
        sparkVel[i * 3 + 2] = normal.z * 2 + (Math.random() - 0.5) * 3;
        sparkLife[i] = 0.3 + Math.random() * 0.25;
      }
      sparkGeo.attributes.position.needsUpdate = true;
    },
    setSmoke(clouds) {
      let m = 0;
      for (const c of clouds) {
        for (let k = 0; k < 4 && m < smokeMeshes.length; k += 1, m += 1) {
          const mesh = smokeMeshes[m];
          mesh.visible = true;
          mesh.position.set(
            c.x + Math.sin(c.seed + k * 1.7) * 1.4,
            c.y + 0.8 + (k % 2) * 0.9,
            c.z + Math.cos(c.seed + k * 2.3) * 1.4,
          );
          const s = c.r * (0.55 + (k % 3) * 0.14);
          mesh.scale.set(s, s * 0.8, s);
        }
      }
      for (; m < smokeMeshes.length; m += 1) smokeMeshes[m].visible = false;
    },
    step(dt) {
      let dirtyT = false;
      for (let i = 0; i < TRACER_POOL; i += 1) {
        if (tracerLife[i] > 0) {
          tracerLife[i] -= dt;
          if (tracerLife[i] <= 0) {
            tracerPos[i * 6 + 3] = tracerPos[i * 6];
            tracerPos[i * 6 + 4] = tracerPos[i * 6 + 1];
            tracerPos[i * 6 + 5] = tracerPos[i * 6 + 2];
            dirtyT = true;
          }
        }
      }
      if (dirtyT) tracerGeo.attributes.position.needsUpdate = true;
      let dirtyS = false;
      for (let i = 0; i < SPARK_POOL; i += 1) {
        if (sparkLife[i] > 0) {
          sparkLife[i] -= dt;
          sparkVel[i * 3 + 1] -= 9 * dt;
          sparkPos[i * 3] += sparkVel[i * 3] * dt;
          sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
          sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
          if (sparkPos[i * 3 + 1] < 0.02) sparkPos[i * 3 + 1] = 0.02;
          dirtyS = true;
        }
      }
      if (dirtyS) sparkGeo.attributes.position.needsUpdate = true;
    },
  };
}
