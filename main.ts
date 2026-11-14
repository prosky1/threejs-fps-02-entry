// SANDLINE entrypoint (Node 22, standard library only). The grader runs this
// program twice in a sandbox with no network: both runs must write the same
// bytes to /output. It copies the static game and the screenshots beside this
// file, then writes /output/dossier.json with the kit's own library — the same
// bytes the sealed gate rebuilds when it checks dossier_matches.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally: node serve.ts  (then http://localhost:8080)

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from an empty output directory so a second run cannot inherit stale files.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The playable game (static ES modules + vendored three.js) and its screenshots.
cpSync(join(repo, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(repo, 'screenshots'))) {
  cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps from the sealed gate (reference/gate.json): the dossier text cap shapes
// the bytes; the rest refuse an entry the scorer would refuse.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
