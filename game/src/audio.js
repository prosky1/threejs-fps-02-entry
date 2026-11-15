// Procedural WebAudio effects — no audio files, so the game stays offline and
// small. Every sound is a shaped noise burst and/or oscillator; distant shots are
// quieter by distance. Created lazily on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  // Returns true only while the context is actually running. Never calls
  // resume() here: without a user gesture Chrome logs a warning on every call
  // and the context stays suspended anyway; unlock() resumes after the click.
  function ensure() {
    if (ctx) return ctx.state === 'running';
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx.state === 'running';
  }

  function noise({ duration, filterFreq, type = 'lowpass', gain, when = 0, q = 1 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  function tone({ freq, freqEnd, duration, type = 'sine', gain, when = 0 }) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  let ambientOn = false;
  function startAmbient() {
    if (!ctx || ambientOn || ctx.state !== 'running') return;
    ambientOn = true;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    // A slow swell so the wind breathes instead of sitting flat.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(master);
    src.start();
    lfo.start();
  }

  const SHOTS = {
    pistol: { filterFreq: 2400, duration: 0.12, gain: 0.5, thump: 140 },
    smg: { filterFreq: 3000, duration: 0.09, gain: 0.4, thump: 170 },
    rifle: { filterFreq: 1800, duration: 0.14, gain: 0.55, thump: 110 },
    marksman: { filterFreq: 1200, duration: 0.3, gain: 0.8, thump: 70 },
    shotgun: { filterFreq: 900, duration: 0.2, gain: 0.85, thump: 90 },
    lmg: { filterFreq: 1500, duration: 0.13, gain: 0.6, thump: 100 },
  };

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      startAmbient();
    },
    // A quiet dusk wind: a looped, low-passed noise bed with a slow swell.
    // Starts on the first user gesture; nothing plays before it.
    ambient() { startAmbient(); },
    // Hearing bus: distance falloff, and a wall between shooter and listener
    // muffles the shot (lower cutoff + less gain), so a crack nearby reads
    // very differently from a thump through the warehouse wall.
    shot(kind, distance = 0, occluded = false) {
      if (!ensure()) return;
      const s = SHOTS[kind] ?? SHOTS.rifle;
      const falloff = 1 / (1 + distance * 0.045);
      const muffle = occluded ? 0.38 : 1;
      noise({ duration: s.duration, filterFreq: s.filterFreq * (occluded ? 0.32 : 1), gain: s.gain * falloff * muffle });
      tone({ freq: s.thump, freqEnd: 45, duration: 0.1, type: 'triangle', gain: 0.5 * falloff * muffle });
    },
    // Short radio blip under a bot callout in the feed.
    radio() {
      if (!ensure()) return;
      tone({ freq: 950, duration: 0.05, type: 'square', gain: 0.1 });
      tone({ freq: 1250, duration: 0.05, type: 'square', gain: 0.1, when: 0.07 });
    },
    dryFire() { if (ensure()) tone({ freq: 1200, duration: 0.04, type: 'square', gain: 0.12 }); },
    reload() {
      if (!ensure()) return;
      tone({ freq: 500, duration: 0.05, type: 'square', gain: 0.15 });
      tone({ freq: 700, duration: 0.05, type: 'square', gain: 0.15, when: 0.35 });
      tone({ freq: 900, duration: 0.06, type: 'square', gain: 0.18, when: 0.8 });
    },
    hitmarker(head) {
      if (!ensure()) return;
      tone({ freq: head ? 1900 : 1400, duration: 0.06, type: 'sine', gain: 0.25 });
    },
    step(crouch) {
      if (!ensure()) return;
      noise({ duration: 0.06, filterFreq: 400, gain: crouch ? 0.03 : 0.07 });
    },
    beep(final) {
      if (!ensure()) return;
      tone({ freq: final ? 1500 : 1100, duration: 0.09, type: 'square', gain: 0.2 });
    },
    plant() {
      if (!ensure()) return;
      tone({ freq: 600, duration: 0.12, type: 'square', gain: 0.2 });
      tone({ freq: 900, duration: 0.15, type: 'square', gain: 0.2, when: 0.15 });
    },
    explosion() {
      if (!ensure()) return;
      noise({ duration: 1.4, filterFreq: 300, gain: 1.0 });
      tone({ freq: 90, freqEnd: 28, duration: 1.2, type: 'sine', gain: 0.9 });
    },
    roundEnd(win) {
      if (!ensure()) return;
      const notes = win ? [523, 659, 784] : [392, 330, 262];
      notes.forEach((f, i) => tone({ freq: f, duration: 0.22, type: 'triangle', gain: 0.22, when: i * 0.13 }));
    },
    buy() { if (ensure()) tone({ freq: 880, duration: 0.08, type: 'sine', gain: 0.2 }); },
    denied() { if (ensure()) tone({ freq: 180, duration: 0.12, type: 'square', gain: 0.18 }); },
    grenade() { if (ensure()) noise({ duration: 0.25, filterFreq: 900, gain: 0.4 }); },
  };
}
