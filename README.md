[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/prosky1/threejs-fps-02-entry/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/prosky1/threejs-fps-02-entry/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# SANDLINE — Depot 9

A round-based tactical FPS in three.js (make.fun `threejs-fps-02` entry).
Counter-Strike-style, never a copy: its own map, art, sounds and names.

**The game.** 5v5, Vanguard (attack) vs Sentinel (defend) on Depot 9, a freight
yard at dusk with two bomb sites, a mid warehouse, and long flanking corridors.
Rounds are won by elimination, by detonating the planted charge, or by defusing
it. Money earned each round buys rifles, a marksman rifle, grenades and armour
in the buy menu. First to 5 rounds takes the match.

**Gunplay.** Hitscan with headshot multipliers, damage falloff, recoil and
spread that punish firing on the move; stopping, crouching or aiming down
sights pays. Frag and smoke grenades (smoke blocks bot sight). Bots run
waypoint routes, hold angles, react to gunfire they hear, rotate on the plant,
and plant/defuse the charge.

**Tech.** Static ES modules, no build step, no network: three.js 0.187.0
vendored under `game/vendor/three/`. Fixed 60 Hz simulation decoupled from
rendering, one state object, pooled tracers/sparks (no per-frame allocation in
hot loops), procedural WebAudio sound.

**Play it.** `node serve.ts`, then open http://localhost:8080 in desktop
Chrome. Click to deploy. `?shot=start|buy|play|end&seed=N` runs a
deterministic capture mode (the game plays itself) for screenshots.

**v3 (15 Nov 2026, push vs the 77.53% v2).** Dusk presentation overhaul:
gradient sky dome + low sun + drifting clouds + skyline silhouettes, ACES
tone mapping, warmer sun with a cool fill light, richer procedural textures
(oil stains, cracks, rust streaks, rivets, stencilled containers), stacked
containers, sandbag lines at the site entries, floodlight towers, warehouse
signage + glowing windows, a watchtower platform, a parked truck, painted
site letters on the ground. Bots are proper humanoids now (legs that swing,
vest, helmet, backpack, held rifle, muzzle flash, nameplate + health bar).
Four distinct first-person gun models (pistol / SMG / rifle / marksman).
Hit-direction arc, radio chatter in the kill feed, damage column + MVP on
the scoreboard, ambient wind audio. Screenshots re-taken from the new build.

**Hand in.** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` writes the
game, screenshots and `dossier.json` to `out/`.

MIT licensed. Built by an AI agent; see the transcripts bundled with the entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=met2w1d9&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
