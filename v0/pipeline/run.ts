// Starts one v0 run. The Cloud Run job runs it every hour at :47; the archive
// run and development run it by hand.
//
//   node --env-file=../../.env.v0 run.ts --kind hourly           # the job: posts if a chat id is set
//   node --env-file=../../.env.v0 run.ts --dev --import-limit 5  # development: the Neon dev branch, prints
//   node --env-file=../../.env.v0 run.ts --kind archive          # production's whole archive, never posted
//
// Flags: --dev (use the v0-dev branch), --kind hourly|archive|local,
// --import-limit N (only the newest N production articles), --no-import,
// --deadline-seconds S. DRY_RUN=1 prints instead of posting.

import "./config.ts"; // first: fills the environment from v0-config on Cloud Run
import { SUBJECTS } from "../../watchlist.js";
import { openPool } from "./store/db.ts";
import { IMPORT_WINDOW_DAYS } from "./store/import.ts";
import { stageCounts } from "./store/readings.ts";
import { buildWorkflow } from "./workflow/hourly.ts";
import { makePoster } from "./stations/telegram/telegram.ts";
import type { RunContext } from "./workflow/context.ts";

// Cloud Run stops a run at 4 minutes; stopping new work at 3.5 leaves time to write the counts.
const HOURLY_DEADLINE_SECONDS = 210;

/**
 * One command-line flag's value.
 *
 * @param name  The flag, without the dashes.
 * @returns Its value, true for a bare flag, or undefined.
 */
function flag(name: string): string | true | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : true;
}

/**
 * A required environment variable.
 *
 * @param name  Its name.
 * @returns Its value.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Builds the run's context from the flags and the environment.
 *
 * @returns The context, and the run's kind.
 */
function contextFromFlags(): { context: RunContext; kind: string } {
  const kind = String(flag("kind") ?? "local");
  const isDev = flag("dev") === true;
  const deadlineSeconds = Number(flag("deadline-seconds") ?? (kind === "hourly" ? HOURLY_DEADLINE_SECONDS : 1e9));
  const dryRun = Boolean(process.env.DRY_RUN) || isDev || kind !== "hourly";
  const { poster, sends } = makePoster(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, dryRun);
  const context: RunContext = {
    pool: openPool(required(isDev ? "V0_DEV_DATABASE_URL" : "V0_DATABASE_URL"), String(flag("schema") ?? "public")),
    feed: flag("no-import") ? null : openPool(required("V0_FEED_DATABASE_URL")),
    keys: { jev: required("JEV_API_KEY"), openrouter: required("OPENROUTER_API_KEY"), gemini: required("GEMINI_API_KEY") },
    subjects: SUBJECTS,
    backfill: kind === "archive",
    importDays: kind === "archive" ? null : IMPORT_WINDOW_DAYS,
    importLimit: flag("import-limit") ? Number(flag("import-limit")) : null,
    deadline: Date.now() + deadlineSeconds * 1000,
    poster,
    readsReactions: sends,
    sends,
    tally: {},
  };
  return { context, kind };
}

/**
 * Runs the workflow once and records the run.
 */
async function main(): Promise<void> {
  const started = Date.now();
  const { context, kind } = contextFromFlags();
  const runRow = await context.pool.query("INSERT INTO runs (kind) VALUES ($1) RETURNING id", [kind === "archive" ? "archive" : kind === "hourly" ? "hourly" : "local"]);
  const runId = runRow.rows[0].id;

  // The workflow; a step never throws for one reading, so a failed run is a broken run.
  const workflow = buildWorkflow(context);
  const run = await workflow.createRun();
  const result = await run.start({ inputData: {} });
  if (result.status !== "success") context.tally.workflow_failed = 1;

  // The run's counts, with where every reading stands now.
  const seconds = (Date.now() - started) / 1000;
  const counts = { ...context.tally, stages: await stageCounts(context.pool) };
  await context.pool.query("UPDATE runs SET finished_at = now(), seconds = $1, counts = $2 WHERE id = $3", [seconds, counts, runId]);
  console.log(JSON.stringify({ run: Number(runId), kind, status: result.status, seconds: Math.round(seconds), counts }));
  if (result.status !== "success") console.error(JSON.stringify((result as { error?: unknown }).error ?? result).slice(0, 2000));

  await context.pool.end();
  await context.feed?.end();
  if (result.status !== "success") process.exitCode = 1;
}

if (import.meta.main) await main();
