// The daily counts (10.2): one short message in v0's chat at 07:00 Pacific
// (D10), covering the 24 hours before, per fighter, with the month's Cloud
// Run seconds against v0's budget in the first line when it is at risk.

import { fighterDays, runTotals, cpuSecondsThisMonth, hasDailyReport, type FighterDay } from "../store/counts.ts";
import { wallClock, zonedInstant } from "../settings/schedule.ts";
import { escapeHtml } from "../stations/telegram/telegram.ts";
import { count, type RunContext } from "../workflow/context.ts";

const TIME_ZONE = "America/Los_Angeles";
const REPORT_HOUR = 7;

// v0's share of Cloud Run's free 240,000 vCPU-seconds a month (D29, spec section 12).
export const MONTHLY_CPU_BUDGET = 100_000;

/**
 * Today's report moment, 07:00 Pacific, and the Pacific date it carries.
 *
 * @param now  The current moment.
 * @returns The moment and the date.
 */
export function reportMoment(now: Date): { at: Date; day: string } {
  const local = wallClock(now, TIME_ZONE);
  const at = zonedInstant({ year: local.year, month: local.month, day: local.day, hour: REPORT_HOUR, minute: 0 }, TIME_ZONE);
  const day = `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
  return { at, day };
}

/**
 * Where the month's CPU seconds are heading at the current rate.
 *
 * @param secondsSoFar  vCPU-seconds this month.
 * @param now  The current moment.
 * @returns The month-end forecast.
 */
export function monthForecast(secondsSoFar: number, now: Date): number {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = Math.max(1, now.getTime() - monthStart);
  return Math.round((secondsSoFar * (monthEnd - monthStart)) / elapsed);
}

/**
 * The message, plain and short.
 *
 * @param day  The report's date.
 * @param fighters  Each fighter's day.
 * @param totals  The runs' totals.
 * @param cpu  This month's seconds and the forecast.
 * @returns Telegram HTML.
 */
export function dailyMessage(day: string, fighters: FighterDay[], totals: { runs: number; imported: number; failures: number; dollars: number }, cpu: { soFar: number; forecast: number }): string {
  const lines: string[] = [];
  if (cpu.forecast > MONTHLY_CPU_BUDGET) lines.push(`⚠️ Cloud Run: heading for ${cpu.forecast.toLocaleString("en-US")} vCPU-seconds this month, over v0's ${MONTHLY_CPU_BUDGET.toLocaleString("en-US")}. Run every two hours, or make the slow step faster.`);
  lines.push(`<b>v0, the 24 hours to ${escapeHtml(day)} 07:00</b>`);
  lines.push(`${totals.runs} runs, ${totals.imported} articles in, ${totals.failures} failed attempts, $${totals.dollars.toFixed(3)} on models`);
  for (const f of fighters) {
    lines.push(
      `\n<b>${escapeHtml(f.fighter)}</b>: ${f.readings} read, ${f.noBody} without body, ${f.classified} classified\n` +
      `${f.newClaims} new claims, ${f.joins} joins · tier 1: ${f.tier1}, tier 2: ${f.tier2}, tier 3: ${f.tier3} · posted ${f.posted}` +
      (f.waiting || f.stuck ? `\nwaiting ${f.waiting}, stuck ${f.stuck}` : ""),
    );
  }
  lines.push(`\nCloud Run this month: ${Math.round(cpu.soFar).toLocaleString("en-US")} vCPU-s, heading for ${cpu.forecast.toLocaleString("en-US")} of ${MONTHLY_CPU_BUDGET.toLocaleString("en-US")}`);
  return lines.join("\n");
}

/**
 * Writes and posts the day's counts once, after 07:00 Pacific.
 *
 * @param context  The run.
 * @param now  The current moment.
 */
export async function dailyCountsDue(context: RunContext, now: Date): Promise<void> {
  const { at, day } = reportMoment(now);
  if (now.getTime() < at.getTime() || (await hasDailyReport(context.pool, day))) return;
  const from = new Date(at.getTime() - 86_400_000);
  const soFar = await cpuSecondsThisMonth(context.pool, now);
  const text = dailyMessage(day, await fighterDays(context.pool, from, at), await runTotals(context.pool, from, at), { soFar, forecast: monthForecast(soFar, now) });
  await context.pool.query("INSERT INTO daily_reports (day, text) VALUES ($1, $2) ON CONFLICT DO NOTHING", [day, text]);
  const messageId = await context.poster(text);
  if (messageId !== null) await context.pool.query("UPDATE daily_reports SET posted_at = now(), message_id = $1 WHERE day = $2", [messageId, day]);
  count(context, "daily_counts_written");
}
