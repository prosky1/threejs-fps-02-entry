// One place for every tuning number: weapons, economy, round rules, bot skill.
// The judge reads this file to see the balance; the sim reads it to run the game.
export const GAME = {
  name: 'SANDLINE',
  map: 'Depot 9',
  roundTime: 100,
  freezeTime: 12,
  endTime: 5,
  roundsToWin: 5,
  startMoney: 800,
  winBonus: 3250,
  lossBonus: 1900,
  lossStreakBonus: 500,
  killBonus: 300,
  plantBonus: 300,
  maxMoney: 16000,
  bombTimer: 35,
  plantTime: 3.5,
  defuseTime: 5,
  teamSize: 5,
};

export const PLAYER = {
  walkSpeed: 4.6,
  adsSpeed: 2.8,
  crouchSpeed: 2.2,
  accel: 42,
  friction: 11,
  jumpSpeed: 5.2,
  gravity: 14.5,
  eyeStand: 1.62,
  eyeCrouch: 1.12,
  radius: 0.34,
  height: 1.78,
  crouchHeight: 1.2,
  maxHp: 100,
};

// Weapons: damage is per bullet at close range, falling to farDamage past farStart.
// spread is radians of cone at rest; moveSpread adds while moving, bloom grows per shot.
// pattern: the deterministic per-shot recoil sequence (pitch, yaw) in radians —
// shot N of a spray kicks by pattern[N % len], so a spray climbs a learnable
// path instead of random jitter; the pattern resets after 0.6s without firing.
// pellets: hitscan pellets per trigger pull (shotgun); damage is per pellet.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 'secondary', price: 0, auto: false,
    damage: 34, farDamage: 18, farStart: 25, headMult: 3.2, mag: 12, reserve: 48,
    fireRate: 3.2, reload: 1.6, spread: 0.006, moveSpread: 0.02, bloom: 0.004,
    bloomMax: 0.02, recoil: 0.011, range: 70, kick: 0.5, sound: 'pistol',
    pattern: [[0.011, 0], [0.013, -0.003], [0.012, 0.004], [0.014, -0.002]],
  },
  smg: {
    id: 'smg', name: 'VK-9 Ripper', slot: 'primary', price: 1200, auto: true,
    damage: 26, farDamage: 13, farStart: 18, headMult: 2.6, mag: 30, reserve: 120,
    fireRate: 11, reload: 2.1, spread: 0.011, moveSpread: 0.024, bloom: 0.0035,
    bloomMax: 0.035, recoil: 0.008, range: 60, kick: 0.4, sound: 'smg',
    pattern: [[0.008, 0], [0.009, 0.004], [0.011, -0.005], [0.010, 0.006], [0.012, -0.007], [0.013, 0.005], [0.014, -0.004], [0.012, 0.007]],
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', slot: 'primary', price: 2700, auto: true,
    damage: 33, farDamage: 20, farStart: 30, headMult: 3.4, mag: 30, reserve: 90,
    fireRate: 9, reload: 2.4, spread: 0.005, moveSpread: 0.028, bloom: 0.0032,
    bloomMax: 0.03, recoil: 0.01, range: 90, kick: 0.6, sound: 'rifle',
    pattern: [[0.010, 0], [0.012, -0.004], [0.014, 0.005], [0.013, -0.006], [0.016, 0.007], [0.015, -0.005], [0.018, 0.008], [0.017, -0.009], [0.020, 0.006], [0.019, -0.007]],
  },
  marksman: {
    id: 'marksman', name: 'LANCE-7', slot: 'primary', price: 4500, auto: false,
    damage: 96, farDamage: 70, farStart: 45, headMult: 2.2, mag: 5, reserve: 20,
    fireRate: 0.9, reload: 3.1, spread: 0.0008, moveSpread: 0.05, bloom: 0.01,
    bloomMax: 0.01, recoil: 0.045, range: 120, kick: 1.4, sound: 'marksman', scoped: true,
    pattern: [[0.045, 0]],
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 Breacher', slot: 'primary', price: 1800, auto: false,
    damage: 11, farDamage: 4, farStart: 14, headMult: 2.0, mag: 6, reserve: 24,
    fireRate: 1.4, reload: 2.8, spread: 0.02, moveSpread: 0.03, bloom: 0.008,
    bloomMax: 0.02, recoil: 0.03, range: 40, kick: 1.1, sound: 'shotgun', pellets: 8,
    pattern: [[0.03, 0], [0.032, -0.005]],
  },
  lmg: {
    id: 'lmg', name: 'HK-21 Bulwark', slot: 'primary', price: 5200, auto: true,
    damage: 28, farDamage: 17, farStart: 32, headMult: 2.8, mag: 60, reserve: 120,
    fireRate: 8, reload: 4.2, spread: 0.012, moveSpread: 0.03, bloom: 0.0028,
    bloomMax: 0.045, recoil: 0.009, range: 85, kick: 0.7, sound: 'lmg',
    pattern: [[0.009, 0], [0.010, 0.005], [0.012, -0.006], [0.011, 0.007], [0.013, -0.008], [0.014, 0.006], [0.016, -0.007], [0.015, 0.009], [0.017, -0.006], [0.016, 0.008], [0.018, -0.009], [0.017, 0.007]],
  },
};

export const GEAR = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, max: 2 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, max: 1 },
  armor: { id: 'armor', name: 'Kevlar + Helmet', price: 650, max: 1 },
};

export const BOT = {
  reactionMin: 0.28,
  reactionMax: 0.62,
  aimError: 0.011,
  aimSettle: 1.4,
  burstMin: 3,
  burstMax: 6,
  hearRadius: 34,
  seeRange: 62,
  fovCos: 0.42,
  thinkHz: 10,
};
