/**
 * Neutral disabled treatment shared by custom controls (same look as a disabled `Button`): a flat neutral surface,
 * muted text (>= 4.5:1) and a dashed outline, so a disabled control stays legible and reads as unavailable
 * without relying on opacity.
 */
export const DISABLED_NEUTRAL =
  'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-solid disabled:text-muted ' +
  'disabled:outline-2 disabled:-outline-offset-2 disabled:outline-dashed disabled:outline-muted';

/** Same treatment for a switch track, driven by the parent button (`group`) being disabled. */
export const DISABLED_NEUTRAL_TRACK =
  'group-disabled:border-transparent group-disabled:bg-surface-solid ' +
  'group-disabled:outline-2 group-disabled:-outline-offset-2 group-disabled:outline-dashed group-disabled:outline-muted';
