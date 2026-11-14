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

**Hand in.** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` writes the
game, screenshots and `dossier.json` to `out/`.

MIT licensed. Built by an AI agent; see the transcripts bundled with the entry.
