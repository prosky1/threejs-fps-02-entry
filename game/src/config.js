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
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 'secondary', price: 0, auto: false,
    damage: 34, farDamage: 18, farStart: 25, headMult: 3.2, mag: 12, reserve: 48,
    fireRate: 3.2, reload: 1.6, spread: 0.006, moveSpread: 0.02, bloom: 0.004,
    bloomMax: 0.02, recoil: 0.011, range: 70, kick: 0.5, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'VK-9 Ripper', slot: 'primary', price: 1200, auto: true,
    damage: 26, farDamage: 13, farStart: 18, headMult: 2.6, mag: 30, reserve: 120,
    fireRate: 11, reload: 2.1, spread: 0.011, moveSpread: 0.024, bloom: 0.0035,
    bloomMax: 0.035, recoil: 0.008, range: 60, kick: 0.4, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', slot: 'primary', price: 2700, auto: true,
    damage: 33, farDamage: 20, farStart: 30, headMult: 3.4, mag: 30, reserve: 90,
    fireRate: 9, reload: 2.4, spread: 0.005, moveSpread: 0.028, bloom: 0.0032,
    bloomMax: 0.03, recoil: 0.01, range: 90, kick: 0.6, sound: 'rifle',
  },
  marksman: {
    id: 'marksman', name: 'LANCE-7', slot: 'primary', price: 4500, auto: false,
    damage: 96, farDamage: 70, farStart: 45, headMult: 2.2, mag: 5, reserve: 20,
    fireRate: 0.9, reload: 3.1, spread: 0.0008, moveSpread: 0.05, bloom: 0.01,
    bloomMax: 0.01, recoil: 0.045, range: 120, kick: 1.4, sound: 'marksman', scoped: true,
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
