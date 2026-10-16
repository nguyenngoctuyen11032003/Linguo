/**
 * Tiny Web Audio synth for interface sounds. Every cue is synthesised at play time (no audio files): nothing to
 * download or cache, no media-src CSP entry, works offline, and the whole kit costs a few kB of code.
 *
 * Browsers only let an AudioContext start inside a user gesture. Answer verdicts arrive after a network round
 * trip (outside the gesture), so installSoundUnlock() creates/resumes the context on the first tap or key press;
 * once running it stays running and later cues play without a gesture.
 */

type Wave = OscillatorType;

export interface ToneSpec {
  freq: number;
  /** Seconds from the cue start. */
  at?: number;
  dur: number;
  type?: Wave;
  gain?: number;
  attack?: number;
  /** Exponential glide target over the tone's duration. */
  glideTo?: number;
  detune?: number;
  /** Sends a copy into the shared echo for an airy tail. */
  echo?: boolean;
}

export interface NoiseSpec {
  at?: number;
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  sweepTo?: number;
  q?: number;
  echo?: boolean;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  echoIn: GainNode;
  noise: AudioBuffer;
}

let graph: Graph | null = null;
let unavailable = false;

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function build(): Graph | null {
  if (graph || unavailable) return graph;
  const Ctor = audioContextCtor();
  if (!Ctor) {
    unavailable = true;
    return null;
  }
  try {
    const ctx = new Ctor({ latencyHint: 'interactive' });
    // Soft limiter so stacked cues (combo + celebration) never clip on phone speakers.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.connect(limiter);

    // Short feedback echo shared by the "sparkly" cues.
    const echoIn = ctx.createGain();
    echoIn.gain.value = 0.22;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.11;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 3800;
    echoIn.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(master);

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

    graph = { ctx, master, echoIn, noise };
    return graph;
  } catch {
    unavailable = true;
    return null;
  }
}

/** Resolves to a running graph, or null when audio is unavailable or still locked. */
function ready(): Graph | null {
  const g = build();
  if (!g) return null;
  if (g.ctx.state === 'suspended') void g.ctx.resume().catch(() => {});
  return g.ctx.state === 'closed' ? null : g;
}

let unlockInstalled = false;

/** Call once at startup: unlocks audio on the first user gesture (iOS/Safari and Chrome autoplay policies). */
export function installSoundUnlock(): void {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const events = ['pointerdown', 'keydown', 'touchend'] as const;
  const unlock = () => {
    const g = build();
    if (!g) return done();
    void g.ctx.resume().then(done, () => {});
  };
  const done = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
}

function envelope(param: AudioParam, start: number, peak: number, attack: number, end: number): void {
  param.setValueAtTime(0.0001, start);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  param.exponentialRampToValueAtTime(0.0001, end);
}

export interface Voice {
  tone: (spec: ToneSpec) => void;
  noise: (spec: NoiseSpec) => void;
}

/**
 * Runs a cue recipe at `level` (0..1, already scaled by the user's volume). Returns false when nothing could play.
 */
export function perform(recipe: (voice: Voice) => void, level: number): boolean {
  if (level <= 0) return false;
  const g = ready();
  if (!g || g.ctx.state !== 'running') return false;
  const { ctx, master, echoIn } = g;
  const t0 = ctx.currentTime + 0.005;

  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(master);

  const route = (node: AudioNode, echo?: boolean) => {
    node.connect(out);
    if (echo) node.connect(echoIn);
  };

  recipe({
    tone({ freq, at = 0, dur, type = 'sine', gain = 0.3, attack = 0.008, glideTo, detune = 0, echo }) {
      const start = t0 + at;
      const end = start + dur;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, end);
      osc.detune.value = detune;
      const amp = ctx.createGain();
      envelope(amp.gain, start, gain, attack, end);
      osc.connect(amp);
      route(amp, echo);
      osc.start(start);
      osc.stop(end + 0.02);
      osc.onended = () => amp.disconnect();
    },
    noise({ at = 0, dur, gain = 0.1, filter = 'bandpass', freq = 2000, sweepTo, q = 1, echo }) {
      const start = t0 + at;
      const end = start + dur;
      const src = ctx.createBufferSource();
      src.buffer = g.noise;
      const biquad = ctx.createBiquadFilter();
      biquad.type = filter;
      biquad.Q.value = q;
      biquad.frequency.setValueAtTime(freq, start);
      if (sweepTo) biquad.frequency.exponentialRampToValueAtTime(sweepTo, end);
      const amp = ctx.createGain();
      envelope(amp.gain, start, gain, Math.min(0.01, dur / 3), end);
      src.connect(biquad);
      biquad.connect(amp);
      route(amp, echo);
      src.start(start);
      src.stop(end + 0.02);
      src.onended = () => amp.disconnect();
    },
  });

  // Drop the per-cue bus once every voice has faded (longest cue ~1.6 s + echo tail).
  setTimeout(() => out.disconnect(), 3000);
  return true;
}

/** Test helper. */
export function resetSoundEngineForTests(): void {
  graph = null;
  unavailable = false;
  unlockInstalled = false;
}
