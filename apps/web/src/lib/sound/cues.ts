import type { Voice } from './engine';

/**
 * The sound kit. Design rules:
 * - One tonal family (C major pentatonic, bright octave 5–7) so every positive cue sounds related.
 * - Success rises, failure falls, neutral stays flat. Failure is soft and low, never a buzzer: a learner who just
 *   got something wrong should feel "not quite", not punished.
 * - Frequent cues (tap, select, flip) are quiet and under 80 ms; rare cues (lesson complete, badge) are allowed
 *   to be rich and longer, because rarity is what makes them feel earned.
 */
export type SoundCue =
  | 'tap'
  | 'select'
  | 'correct'
  | 'almost'
  | 'incorrect'
  | 'reveal'
  | 'combo'
  | 'complete'
  | 'perfect'
  | 'achievement'
  | 'streak'
  | 'flip'
  | 'next'
  | 'send'
  | 'receive'
  | 'recordStart'
  | 'recordStop'
  | 'tick'
  | 'warning'
  | 'error'
  | 'toggleOn'
  | 'toggleOff'
  | 'place'
  | 'unplace'
  | 'hint'
  | 'success'
  | 'notify'
  | 'start'
  | 'levelUp'
  | 'timeUp'
  | 'save'
  | 'remove'
  | 'play';

// Equal-tempered pitches used by the kit.
const N = {
  C4: 261.63,
  G4: 392.0,
  A4: 440.0,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880.0,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760.0,
  C7: 2093.0,
} as const;

/** A bell: fundamental plus slightly inharmonic partials, quick attack, long decay. */
function bell(v: Voice, freq: number, at: number, dur: number, gain: number): void {
  v.tone({ freq, at, dur, type: 'sine', gain, attack: 0.004, echo: true });
  v.tone({ freq: freq * 2.01, at, dur: dur * 0.6, type: 'sine', gain: gain * 0.35, attack: 0.004 });
  v.tone({ freq: freq * 3.98, at, dur: dur * 0.3, type: 'sine', gain: gain * 0.12, attack: 0.002 });
}

/**
 * A small crowd clapping: a few short band-passed noise bursts that thin out and decay, so a cue ends on applause.
 * `size` 1 is a handful of claps, 2 a room full.
 */
function applause(v: Voice, at: number, size: 1 | 2 = 1): void {
  const claps = size === 1 ? 5 : 9;
  const gaps = [0, 0.045, 0.085, 0.14, 0.18, 0.25, 0.29, 0.36, 0.43];
  for (let i = 0; i < claps; i += 1) {
    v.noise({
      at: at + gaps[i]!,
      dur: 0.05,
      gain: (size === 1 ? 0.07 : 0.085) * (1 - i / (claps + 2)),
      filter: 'bandpass',
      freq: 1500 + ((i * 487) % 1400),
      q: 0.9,
      echo: true,
    });
  }
}

/** A bright rising "pa-pa-PING" run: the shared cheer of every positive verdict. Returns when its last note lands. */
function cheerRun(v: Voice, notes: number[], step: number, gain: number): number {
  notes.forEach((f, i) => {
    v.tone({ freq: f, at: i * step, dur: 0.11, type: 'triangle', gain: gain * (0.8 + i * 0.1), attack: 0.003, echo: true });
    // A soft octave "shine" over each pluck makes the run sparkle instead of beep.
    v.tone({ freq: f * 2, at: i * step, dur: 0.07, type: 'sine', gain: gain * 0.25, attack: 0.002 });
  });
  return (notes.length - 1) * step + step;
}

export interface CueDef {
  /** Loudness relative to the user's volume (0..1). */
  level: number;
  /** Vibration pattern (ms) for devices that support it; omitted for cues too frequent to buzz. */
  haptic?: number[];
  /** Ignore repeats closer than this (ms), e.g. a key held down. */
  minGap?: number;
  play: (v: Voice, intensity: number) => void;
}

export const CUES: Record<SoundCue, CueDef> = {
  // A barely-there click for buttons; only used on primary actions, not every link.
  tap: {
    level: 0.35,
    minGap: 40,
    play: (v) => {
      v.tone({ freq: 1500, dur: 0.03, type: 'sine', gain: 0.18, attack: 0.002, glideTo: 1100 });
      v.noise({ dur: 0.012, gain: 0.04, freq: 4000, q: 0.8 });
    },
  },
  // Picking a choice / chip before checking it.
  select: {
    level: 0.4,
    minGap: 40,
    play: (v) => v.tone({ freq: N.A5, dur: 0.06, type: 'triangle', gain: 0.22, attack: 0.003, glideTo: N.C6 }),
  },
  // "Pa-pa-PING!" An upbeat rising run that lands on a bright major chord with a shimmer and a ripple of applause:
  // the sound of someone cheering the learner on.
  correct: {
    level: 0.78,
    haptic: [14, 30, 18],
    play: (v) => {
      const landing = cheerRun(v, [N.G5, N.C6, N.E6], 0.07, 0.24);
      v.tone({ freq: 196, dur: 0.12, type: 'sine', gain: 0.16, attack: 0.004, glideTo: 392 });
      [N.C6, N.E6, N.G6].forEach((f, i) => bell(v, f, landing, 0.7 - i * 0.1, 0.2 - i * 0.02));
      v.noise({ at: landing, dur: 0.4, gain: 0.03, filter: 'highpass', freq: 6500, echo: true });
      applause(v, landing + 0.03, 1);
    },
  },
  // Correct while on a streak of answers: a longer, higher run that climbs one step per combo level (intensity
  // 0..1), a ringing chord, a rising whoosh and a bigger round of applause.
  combo: {
    level: 0.82,
    haptic: [10, 40, 14, 40, 18],
    play: (v, intensity) => {
      const lift = 2 ** (Math.round(intensity * 5) / 12); // up to +5 semitones
      const run = [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].map((f) => f * lift);
      const landing = cheerRun(v, run, 0.06, 0.22);
      v.tone({ freq: 261.63 * lift, dur: 0.3, type: 'sine', gain: 0.14, glideTo: 523.25 * lift });
      [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => bell(v, f * lift, landing, 0.95 - i * 0.12, 0.2 - i * 0.02));
      v.noise({ dur: 0.36, gain: 0.04, filter: 'bandpass', freq: 800, sweepTo: 7000, q: 1.2, echo: true });
      v.noise({ at: landing, dur: 0.55, gain: 0.035, filter: 'highpass', freq: 6000, sweepTo: 10000, echo: true });
      applause(v, landing + 0.02, 2);
    },
  },
  // Accepted with a small slip (typo, accent): still an encouraging "nice!", two lifting notes, a little lighter than
  // correct and without the applause.
  almost: {
    level: 0.68,
    haptic: [12, 30, 12],
    play: (v) => {
      v.tone({ freq: N.G5, dur: 0.12, type: 'triangle', gain: 0.24, attack: 0.003, echo: true });
      v.tone({ freq: N.C6, at: 0.08, dur: 0.12, type: 'triangle', gain: 0.24, attack: 0.003, echo: true });
      bell(v, N.E6, 0.16, 0.5, 0.2);
      bell(v, N.G6, 0.16, 0.35, 0.1);
    },
  },
  // Soft descending "bwom-bwom": low, filtered, gentle. Never a buzzer.
  incorrect: {
    level: 0.6,
    haptic: [30, 60, 30],
    play: (v) => {
      v.tone({ freq: N.G4, dur: 0.16, type: 'triangle', gain: 0.26, attack: 0.01 });
      v.tone({ freq: 349.23, at: 0.15, dur: 0.38, type: 'triangle', gain: 0.24, attack: 0.012, glideTo: 311.13 });
      v.tone({ freq: 174.61, at: 0.15, dur: 0.38, type: 'sine', gain: 0.12, glideTo: 155.56 });
    },
  },
  // The correct answer is revealed after the last try: neutral, informative.
  reveal: {
    level: 0.45,
    play: (v) => {
      v.tone({ freq: N.E5, dur: 0.12, type: 'sine', gain: 0.22 });
      v.tone({ freq: N.E5, at: 0.12, dur: 0.22, type: 'sine', gain: 0.18 });
    },
  },
  // Lesson / session / review finished: short fanfare then a held major chord with sparkle.
  complete: {
    level: 0.8,
    haptic: [18, 70, 18, 70, 45],
    play: (v) => {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => v.tone({ freq: f, at: i * 0.09, dur: 0.16, type: 'triangle', gain: 0.24 }));
      [N.C6, N.E6, N.G6].forEach((f) => bell(v, f, 0.38, 1.1, 0.16));
      v.tone({ freq: N.C4, at: 0.38, dur: 0.9, type: 'sine', gain: 0.14 });
      v.noise({ at: 0.38, dur: 0.9, gain: 0.03, filter: 'highpass', freq: 5000, sweepTo: 9000, echo: true });
      applause(v, 0.42, 1);
    },
  },
  // 100% accuracy on a lesson or exam: the complete fanfare's bigger sibling with a high bell on top.
  perfect: {
    level: 0.85,
    haptic: [18, 60, 18, 60, 18, 60, 60],
    play: (v) => {
      [N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => v.tone({ freq: f, at: i * 0.075, dur: 0.15, type: 'triangle', gain: 0.22 }));
      [N.C6, N.E6, N.G6, N.C7].forEach((f) => bell(v, f, 0.4, 1.3, 0.13));
      bell(v, N.G6 * 2, 0.75, 0.9, 0.08);
      v.noise({ at: 0.4, dur: 1.1, gain: 0.035, filter: 'highpass', freq: 5000, sweepTo: 10000, echo: true });
      applause(v, 0.45, 2);
    },
  },
  // Badge unlocked, level up, milestone: upward shimmer resolving on a bright bell.
  achievement: {
    level: 0.8,
    haptic: [20, 40, 20, 40, 70],
    play: (v) => {
      v.tone({ freq: N.G4, dur: 0.45, type: 'sine', gain: 0.12, glideTo: N.G6 });
      [N.D6, N.G6, N.A6].forEach((f, i) => bell(v, f, 0.32 + i * 0.07, 0.9 - i * 0.15, 0.16));
      v.noise({ dur: 0.45, gain: 0.03, filter: 'bandpass', freq: 1500, sweepTo: 8000, q: 2, echo: true });
    },
  },
  // Daily goal hit / streak extended: warm low "whomp" lifting into two bright notes.
  streak: {
    level: 0.75,
    haptic: [25, 50, 25],
    play: (v) => {
      v.tone({ freq: 196, dur: 0.22, type: 'sine', gain: 0.22, glideTo: 392 });
      bell(v, N.G5, 0.14, 0.25, 0.2);
      bell(v, N.D6, 0.24, 0.6, 0.22);
    },
  },
  // Flashcard flip: a short airy swish.
  flip: {
    level: 0.4,
    minGap: 80,
    play: (v) => v.noise({ dur: 0.12, gain: 0.12, filter: 'bandpass', freq: 900, sweepTo: 3500, q: 1.4 }),
  },
  // Moving on to the next exercise / card.
  next: {
    level: 0.3,
    minGap: 60,
    play: (v) => v.tone({ freq: N.E5, dur: 0.07, type: 'sine', gain: 0.16, glideTo: N.A5 }),
  },
  // Chat message sent (tutor, role-play): quick upward whoosh.
  send: {
    level: 0.4,
    play: (v) => {
      v.tone({ freq: 520, dur: 0.09, type: 'sine', gain: 0.18, glideTo: 980 });
      v.noise({ dur: 0.08, gain: 0.03, filter: 'highpass', freq: 2500, sweepTo: 6000 });
    },
  },
  // Reply arrived: two soft pops.
  receive: {
    level: 0.4,
    play: (v) => {
      v.tone({ freq: N.A5, dur: 0.07, type: 'sine', gain: 0.18 });
      v.tone({ freq: N.D6, at: 0.07, dur: 0.12, type: 'sine', gain: 0.16 });
    },
  },
  // Microphone opens / closes (speaking practice).
  recordStart: {
    level: 0.45,
    haptic: [15],
    play: (v) => v.tone({ freq: N.A4, dur: 0.12, type: 'sine', gain: 0.22, glideTo: N.E5 }),
  },
  recordStop: {
    level: 0.45,
    play: (v) => v.tone({ freq: N.E5, dur: 0.12, type: 'sine', gain: 0.2, glideTo: N.A4 }),
  },
  // Exam countdown in the final seconds: dry woodblock.
  tick: {
    level: 0.35,
    minGap: 400,
    play: (v) => {
      v.tone({ freq: 1200, dur: 0.035, type: 'triangle', gain: 0.2, attack: 0.001 });
      v.noise({ dur: 0.02, gain: 0.05, filter: 'bandpass', freq: 2500, q: 3 });
    },
  },
  // Attention without alarm (e.g. 5 minutes left, leaving with unsaved work).
  warning: {
    level: 0.55,
    haptic: [40],
    minGap: 1000,
    play: (v) => {
      v.tone({ freq: N.D5, dur: 0.14, type: 'triangle', gain: 0.22 });
      v.tone({ freq: N.D5, at: 0.18, dur: 0.2, type: 'triangle', gain: 0.2 });
    },
  },
  // Something failed (save, network): dull, low, short. Distinct from a wrong answer.
  error: {
    level: 0.5,
    haptic: [50],
    minGap: 1000,
    play: (v) => {
      v.tone({ freq: 220, dur: 0.12, type: 'triangle', gain: 0.24 });
      v.tone({ freq: 207.65, at: 0.13, dur: 0.18, type: 'triangle', gain: 0.22 });
    },
  },
  toggleOn: {
    level: 0.4,
    play: (v) => v.tone({ freq: N.E5, dur: 0.08, type: 'sine', gain: 0.2, glideTo: N.A5 }),
  },
  toggleOff: {
    level: 0.4,
    play: (v) => v.tone({ freq: N.A5, dur: 0.08, type: 'sine', gain: 0.18, glideTo: N.E5 }),
  },
  // Word-bank token dropped into the answer line: a dry, rounded wooden "tok". Very frequent, so tiny and quiet.
  place: {
    level: 0.38,
    minGap: 35,
    play: (v) => {
      v.tone({ freq: 880, dur: 0.045, type: 'sine', gain: 0.2, attack: 0.002, glideTo: 620 });
      v.noise({ dur: 0.018, gain: 0.05, filter: 'bandpass', freq: 1800, q: 2.5 });
    },
  },
  // Token taken back out: the same wood, a fourth lower, so placing and removing read as a pair.
  unplace: {
    level: 0.32,
    minGap: 35,
    play: (v) => {
      v.tone({ freq: 620, dur: 0.045, type: 'sine', gain: 0.18, attack: 0.002, glideTo: 440 });
      v.noise({ dur: 0.015, gain: 0.035, filter: 'bandpass', freq: 1200, q: 2.5 });
    },
  },
  // A hint (or an explanation) opens: a soft, curious sparkle, two quiet high notes and a breath of air.
  hint: {
    level: 0.42,
    minGap: 250,
    play: (v) => {
      bell(v, N.E6, 0, 0.16, 0.12);
      bell(v, N.A6, 0.07, 0.32, 0.11);
      v.noise({ at: 0.04, dur: 0.22, gain: 0.018, filter: 'highpass', freq: 7000, echo: true });
    },
  },
  // Quiet confirmation for a background action that worked (settings saved, goal set, report sent).
  success: {
    level: 0.45,
    minGap: 600,
    play: (v) => {
      bell(v, N.G5, 0, 0.12, 0.14);
      bell(v, N.C6, 0.06, 0.3, 0.15);
    },
  },
  // Something new arrived (notification, AI answer ready): marimba-like double tap, recognisable but polite.
  notify: {
    level: 0.5,
    haptic: [12, 50, 12],
    minGap: 1500,
    play: (v) => {
      v.tone({ freq: N.D6, dur: 0.1, type: 'sine', gain: 0.2, attack: 0.002 });
      v.tone({ freq: N.D6 * 4, dur: 0.03, type: 'sine', gain: 0.03, attack: 0.001 });
      v.tone({ freq: N.A6, at: 0.11, dur: 0.24, type: 'sine', gain: 0.18, attack: 0.002, echo: true });
    },
  },
  // A lesson, review, exam or placement test begins: a short rising swell, like lifting a curtain.
  start: {
    level: 0.5,
    minGap: 1000,
    play: (v) => {
      v.noise({ dur: 0.32, gain: 0.05, filter: 'bandpass', freq: 500, sweepTo: 4000, q: 0.9 });
      v.tone({ freq: N.C5, at: 0.2, dur: 0.14, type: 'triangle', gain: 0.16 });
      bell(v, N.G5, 0.28, 0.4, 0.16);
    },
  },
  // Level reached / exam passed / placement result: the biggest moment. Low swell, rising major arpeggio, held
  // bright chord with shimmer. Reserved for genuinely rare events.
  levelUp: {
    level: 0.85,
    haptic: [20, 50, 20, 50, 20, 50, 90],
    play: (v) => {
      v.tone({ freq: N.C4, dur: 0.5, type: 'sine', gain: 0.14, glideTo: N.C5 });
      [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) =>
        v.tone({ freq: f, at: 0.12 + i * 0.065, dur: 0.14, type: 'triangle', gain: 0.18 }),
      );
      [N.C6, N.E6, N.G6, N.C7].forEach((f) => bell(v, f, 0.55, 1.4, 0.12));
      v.tone({ freq: N.C4, at: 0.55, dur: 1.2, type: 'sine', gain: 0.12 });
      v.noise({ at: 0.5, dur: 1.2, gain: 0.035, filter: 'highpass', freq: 5000, sweepTo: 11000, echo: true });
      applause(v, 0.55, 2);
    },
  },
  // Exam time ran out: three firm, descending notes. Clear and final, but not alarming.
  timeUp: {
    level: 0.6,
    haptic: [60, 80, 60],
    minGap: 2000,
    play: (v) => {
      [N.G5, N.E5, N.C5].forEach((f, i) =>
        v.tone({ freq: f, at: i * 0.16, dur: i === 2 ? 0.5 : 0.15, type: 'triangle', gain: 0.22 }),
      );
      v.tone({ freq: N.C4, at: 0.32, dur: 0.5, type: 'sine', gain: 0.12 });
    },
  },
  // A word/card saved to the learner's deck: a short "pocketed" pop rising into a soft bell.
  save: {
    level: 0.45,
    minGap: 150,
    play: (v) => {
      v.tone({ freq: 400, dur: 0.06, type: 'sine', gain: 0.18, glideTo: 800 });
      bell(v, N.E6, 0.05, 0.25, 0.13);
    },
  },
  // Something taken away (word removed, item deleted): a muted, downward puff. Never sounds like an error.
  remove: {
    level: 0.38,
    minGap: 150,
    play: (v) => {
      v.tone({ freq: 700, dur: 0.1, type: 'sine', gain: 0.15, glideTo: 300 });
      v.noise({ dur: 0.1, gain: 0.04, filter: 'lowpass', freq: 2000, sweepTo: 400 });
    },
  },
  // Press play on lesson audio: a barely-there tick so the tap feels acknowledged before speech starts.
  play: {
    level: 0.25,
    minGap: 200,
    play: (v) => v.tone({ freq: N.G5, dur: 0.04, type: 'sine', gain: 0.14, attack: 0.002 }),
  },
};
