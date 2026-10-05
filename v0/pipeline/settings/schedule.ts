// When each fighter's digest is due (D24): a weekday and a time in a time
// zone, Monday 07:00 Pacific to start. Each digest covers from the end of the
// previous one to now, so a changed schedule never leaves a gap.

import type { DigestSchedule } from "./tiers.ts";

/**
 * The wall-clock date and time an instant shows in a time zone.
 *
 * @param instant  A moment.
 * @param timeZone  For example "America/Los_Angeles".
 * @returns Its year, month (1–12), day, hour, minute and weekday (0 = Sunday) there.
 */
export function wallClock(instant: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(part("year")), month: Number(part("month")), day: Number(part("day")),
    hour: Number(part("hour")), minute: Number(part("minute")), weekday: weekdays.indexOf(part("weekday")),
  };
}

/**
 * The instant a wall-clock time in a time zone falls on, daylight saving included.
 *
 * @param local  The date and time as the zone's clocks show it.
 * @param timeZone  The zone.
 * @returns That moment.
 */
export function zonedInstant(local: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string): Date {
  const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);

  // Guess, see what the zone's clocks show then, and correct by the difference; twice settles a DST edge.
  let guess = asIfUtc;
  for (let round = 0; round < 2; round += 1) {
    const shown = wallClock(new Date(guess), timeZone);
    const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
    guess += asIfUtc - shownAsUtc;
  }
  return new Date(guess);
}

/**
 * The latest scheduled moment at or before now.
 *
 * @param schedule  The fighter's schedule.
 * @param now  The current moment.
 * @returns The most recent weekday-and-time it names.
 */
export function lastScheduledAt(schedule: DigestSchedule, now: Date): Date {
  const [hour, minute] = schedule.time.split(":").map(Number);

  // Walk back day by day from today, in the zone's own calendar, to the first match not in the future.
  for (let daysBack = 0; daysBack <= 7; daysBack += 1) {
    const day = wallClock(new Date(now.getTime() - daysBack * 86_400_000), schedule.timezone);
    if (day.weekday !== schedule.weekday) continue;
    const candidate = zonedInstant({ ...day, hour, minute }, schedule.timezone);
    if (candidate.getTime() <= now.getTime()) return candidate;
  }
  throw new Error(`no scheduled moment in the last 8 days for ${JSON.stringify(schedule)}`);
}

/**
 * Whether a fighter's digest is due, and the period it would cover.
 *
 * @param schedule  The fighter's schedule.
 * @param previousEnd  Where his last digest ended, or null if he has none.
 * @param now  The current moment.
 * @returns Null when not due; otherwise the period's start and end.
 */
export function duePeriod(schedule: DigestSchedule, previousEnd: Date | null, now: Date): { start: Date; end: Date } | null {
  const scheduled = lastScheduledAt(schedule, now);
  if (previousEnd && previousEnd.getTime() >= scheduled.getTime()) return null;
  const start = previousEnd ?? new Date(scheduled.getTime() - 7 * 86_400_000);
  return { start, end: now };
}
