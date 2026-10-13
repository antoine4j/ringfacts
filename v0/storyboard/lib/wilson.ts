// The Wilson 95% interval for a share: where the true rate probably lies,
// given k successes out of n. Unlike the plain ± formula it stays inside 0 to
// 1 and still gives a range at 0 of n, which the launch bar's zero targets need.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §5.

/** How many standard errors a 95% interval spans. */
const Z = 1.96;

/** A share's interval, both ends between 0 and 1. */
export type Interval = { low: number; high: number };

/**
 * The Wilson 95% interval for k successes out of n.
 *
 * @param successes  k.
 * @param trials  n; 0 gives null.
 * @returns { low, high } as shares between 0 and 1, or null when n is 0.
 */
export function wilson(successes: number, trials: number): Interval | null {
  if (trials === 0) return null;

  // The share, and how much the interval is pulled towards one half.
  const share = successes / trials;
  const zSquared = Z * Z;
  const divisor = 1 + zSquared / trials;

  // The centre of the interval, and its half-width.
  const centre = (share + zSquared / (2 * trials)) / divisor;
  const spread = share * (1 - share) / trials + zSquared / (4 * trials * trials);
  const halfWidth = (Z * Math.sqrt(spread)) / divisor;

  // Rounding can step a hair outside 0 or 1 at the extremes; keep it inside.
  const low = Math.max(0, centre - halfWidth);
  const high = Math.min(1, centre + halfWidth);
  return { low, high };
}
