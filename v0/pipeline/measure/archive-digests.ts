// Past weeks' digests by several models, side by side, so Anton can pick the
// Digest writer's model (D25, task 0.5). Every week from the archive's first
// article to the last scheduled Monday, per fighter, per model; each model
// writes its weeks in order, reading only its own earlier digests. Stored as
// history, never posted. Weeks already written by a model are skipped, so a
// stopped run picks up where it left off.
//
//   node --env-file=../../../.env.v0 archive-digests.ts [--dev] [--models a,b,c]

import { openPool } from "../store/db.ts";
import { currentSettings } from "../store/answers.ts";
import { writeAndPostDigest } from "../workflow/digests.ts";
import { lastScheduledAt } from "../settings/schedule.ts";
import type { RunContext } from "../workflow/context.ts";

export const COMPARED_MODELS = ["deepseek/deepseek-v4-pro", "z-ai/glm-5", "moonshotai/kimi-k3"];
const WEEK = 7 * 86_400_000;

/**
 * The weekly periods between the archive's first article and now, one per scheduled moment.
 *
 * @param firstArticle  When the archive starts.
 * @param lastMoment  The latest scheduled moment.
 * @returns Each week's start and end, oldest first.
 */
export function weeklyPeriods(firstArticle: Date, lastMoment: Date): { start: Date; end: Date }[] {
  const periods: { start: Date; end: Date }[] = [];
  for (let end = lastMoment.getTime(); end > firstArticle.getTime(); end -= WEEK) {
    periods.unshift({ start: new Date(end - WEEK), end: new Date(end) });
  }
  return periods;
}

/**
 * One model's weeks for one fighter, in order.
 *
 * @param context  A history run's context.
 * @param fighter  The fighter.
 * @param model  The model.
 * @param periods  The weeks.
 * @returns How many digests were written now.
 */
async function writeChain(context: RunContext, fighter: string, model: string, periods: { start: Date; end: Date }[]): Promise<number> {
  let written = 0;
  for (const period of periods) {
    const exists = await context.pool.query("SELECT 1 FROM digests WHERE fighter = $1 AND model = $2 AND backfill AND period_end = $3", [fighter, model, period.end]);
    if (exists.rowCount) continue;
    try {
      await writeAndPostDigest(context, fighter, period, model);
      written += 1;
      console.log(`${fighter} · ${model} · week to ${period.end.toISOString().slice(0, 10)}: written`);
    } catch (error) {
      console.error(`${fighter} · ${model} · week to ${period.end.toISOString().slice(0, 10)}: ${(error as Error).message.slice(0, 200)}`);
      return written;
    }
  }
  return written;
}

/**
 * Writes every missing past week, every fighter and model chain side by side.
 */
async function main(): Promise<void> {
  const isDev = process.argv.includes("--dev");
  const modelsFlag = process.argv.indexOf("--models");
  const models = modelsFlag === -1 ? COMPARED_MODELS : process.argv[modelsFlag + 1].split(",");
  const pool = openPool(String(process.env[isDev ? "V0_DEV_DATABASE_URL" : "V0_DATABASE_URL"]));
  const context: RunContext = {
    pool, feed: null, keys: { jev: "", openrouter: "", gemini: "" }, subjects: [], backfill: true,
    importDays: null, importLimit: null, deadline: Infinity, poster: async () => null, tally: {},
  };

  // The weeks run from the first archive article to each fighter's last scheduled moment.
  const first = (await pool.query("SELECT min(published_at) AS first FROM articles")).rows[0].first;
  const settings = await currentSettings(pool);
  const chains: Promise<number>[] = [];
  for (const [fighter, schedule] of Object.entries(settings.digest_schedule)) {
    const periods = weeklyPeriods(first, lastScheduledAt(schedule, new Date()));
    for (const model of models) chains.push(writeChain(context, fighter, model, periods));
  }
  const written = await Promise.all(chains);
  console.log(JSON.stringify({ digests_written: written.reduce((sum, n) => sum + n, 0), dollars: (context.tally.openrouter_cost_microdollars ?? 0) / 1e6 }));
  await pool.end();
}

if (import.meta.main) await main();
