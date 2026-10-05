// The date filter: a named period (today, last week …) or a custom range,
// turned into first and last calendar days in Pacific time, where Anton
// reads. Shared by the filter bar, which shows the days a period covers, and
// the queries, which filter on them. Weeks start on Monday.

/** The named periods, in the order the filter offers them. */
export const PERIODS: [key: string, label: string][] = [
  ["today", "today"],
  ["yesterday", "yesterday"],
  ["this_week", "this week"],
  ["last_week", "last week"],
  ["last_7", "last 7 days"],
  ["this_month", "this month"],
  ["last_month", "last month"],
  ["last_30", "last 30 days"],
];

/** A calendar day as the date picker writes it. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const pacificDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A period's first and last day, either end open when null. */
export type DayRange = { from: string | null; to: string | null };

/**
 * A day plus or minus some days, as calendar arithmetic.
 *
 * @param day  "YYYY-MM-DD".
 * @param days  How many days to add; negative goes back.
 * @returns The new day.
 */
function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The first and last day of a named period.
 *
 * @param period  A key of PERIODS.
 * @param now  The current moment.
 * @returns The range, or null for a name it does not know.
 */
export function periodRange(period: string, now: Date): DayRange | null {
  // Today in Pacific time, and how far into its week and month it is.
  const today = pacificDay.format(now);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -weekday);
  const firstOfMonth = `${today.slice(0, 8)}01`;

  if (period === "today") return { from: today, to: today };
  if (period === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1) };
  if (period === "this_week") return { from: monday, to: today };
  if (period === "last_week") return { from: addDays(monday, -7), to: addDays(monday, -1) };
  if (period === "last_7") return { from: addDays(today, -6), to: today };
  if (period === "this_month") return { from: firstOfMonth, to: today };
  if (period === "last_month") return { from: `${addDays(firstOfMonth, -1).slice(0, 8)}01`, to: addDays(firstOfMonth, -1) };
  if (period === "last_30") return { from: addDays(today, -29), to: today };
  return null;
}

/**
 * The days the address asks for: a named period (?when=last_week), a custom
 * range (?when=custom&from=…&to=…, either end may be left out), or the older
 * single day (?day=…).
 *
 * @param when  The period's name, "custom", or "".
 * @param from  The custom range's first day, or "".
 * @param to  The custom range's last day, or "".
 * @param day  A single day, or "".
 * @param now  The current moment.
 * @returns The range, or null for no date filter.
 */
export function dayRange(when: string, from: string, to: string, day: string, now: Date): DayRange | null {
  const named = periodRange(when, now);
  if (named) return named;

  // A custom range keeps only well-formed days.
  const first = DAY.test(from) ? from : null;
  const last = DAY.test(to) ? to : null;
  if (when === "custom" && (first || last)) return { from: first, to: last };
  if (DAY.test(day)) return { from: day, to: day };
  return null;
}

/**
 * A range as a reader would write it, such as "28 Sep – 4 Oct".
 *
 * @param range  The range.
 * @returns The words.
 */
export function describeRange(range: DayRange): string {
  const show = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  if (range.from && range.to) return range.from === range.to ? show(range.from) : `${show(range.from)} – ${show(range.to)}`;
  if (range.from) return `from ${show(range.from)}`;
  if (range.to) return `until ${show(range.to)}`;
  return "";
}
