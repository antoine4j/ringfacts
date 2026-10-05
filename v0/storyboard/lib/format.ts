// How values are shown: times in Pacific (Anton is in San Francisco), money in
// dollars, and the small sums the runs page makes from a run's counts.

/** Anton's time zone; every time on the storyboard is shown in it. */
export const TIME_ZONE = "America/Los_Angeles";

/** "2026-10-04 21:57" in Pacific time; Swedish locale writes dates in that order. */
const timeFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-10-04" in Pacific time. */
const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * A moment as Pacific date and time.
 *
 * @param moment  A Date, an ISO string, or nothing.
 * @returns For example "2026-10-04 21:57"; "" when there is no moment.
 */
export function pacificTime(moment: Date | string | null | undefined): string {
  if (!moment) return "";
  return timeFormat.format(new Date(moment));
}

/**
 * A moment as its Pacific calendar day.
 *
 * @param moment  A Date, an ISO string, or nothing.
 * @returns For example "2026-10-04"; "" when there is no moment.
 */
export function pacificDay(moment: Date | string | null | undefined): string {
  if (!moment) return "";
  return dayFormat.format(new Date(moment));
}

/**
 * A cost kept in millionths of a dollar, as dollars.
 *
 * @param microdollars  The cost, as runs.counts stores it.
 * @returns For example "$0.0007"; "" when there is no cost.
 */
export function dollars(microdollars: unknown): string {
  if (typeof microdollars !== "number") return "";
  return `$${(microdollars / 1_000_000).toFixed(4)}`;
}

/**
 * Everything that went wrong in one run, from its counts: every number whose
 * name ends in _failed or _stuck, plus a nested "failed" object if there is one.
 *
 * @param counts  The run's counts.
 * @returns Name → how many, only the non-zero ones.
 */
export function failures(counts: Record<string, unknown>): Record<string, number> {
  const found: Record<string, number> = {};

  // Flat counts such as "classify_failed": 3.
  for (const [name, value] of Object.entries(counts)) {
    const isFailure = name.endsWith("_failed") || name.endsWith("_stuck");
    if (isFailure && typeof value === "number" && value > 0) found[name] = value;
  }

  // A nested form such as "failed": {"classify": 1}.
  const nested = counts.failed;
  if (nested && typeof nested === "object") {
    for (const [name, value] of Object.entries(nested)) {
      if (typeof value === "number" && value > 0) found[`${name}_failed`] = value;
    }
  }
  return found;
}

/**
 * A pick's confidence as a percentage.
 *
 * @param confidence  From 0 to 1, or nothing.
 * @returns For example "88%"; "" when there is none.
 */
export function percent(confidence: unknown): string {
  if (typeof confidence !== "number") return "";
  return `${Math.round(confidence * 100)}%`;
}
