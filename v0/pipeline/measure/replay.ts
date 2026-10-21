// The golden replay (10.1): the training and validation articles of the
// golden set through v0's stations, in the `replay` schema, scored against
// Anton's labels. The test articles are never sent. Nothing posts: every
// replay article is history.
//
//   V0_OWNER_URL=$(neonctl connection-string main --project-id calm-mouse-60802247 --database-name v0 --role-name neondb_owner) \
//   node --env-file=../../../.env.v0 replay.ts
//   node --env-file=../../../.env.v0 replay.ts --continue   # finish what an earlier replay left waiting
//
// The replay schema holds only copies of golden articles and v0's answers to
// them, so each replay starts by emptying it (the owner's address is needed
// for that alone). Each replay's scores are kept in measure/replay-results/.
// JEV runs on the experiments' test key (research/bench/.env.bench), never
// live v0's, so a replay cannot eat into the hourly run's allowance.

import pg from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { SUBJECTS } from "../../../watchlist.js";
import { openPool } from "../store/db.ts";
import { importItems, type ProductionItem } from "../store/import.ts";
import { buildWorkflow } from "../workflow/hourly.ts";
import { scoreReplay } from "./replay-score.ts";
import type { RunContext } from "../workflow/context.ts";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const BENCH_ENV = new URL("../../../research/bench/.env.bench", import.meta.url);
const REPLAY_TABLES = "articles, readings, classifications, extracts, claims, groupings, decisions, digests, digest_claims, feedback, review_readings, review_same_claims, review_tiers, review_claim_notes, runs, daily_reports, reactions";

/**
 * The golden articles on the training and validation sides, as production rows.
 *
 * @returns The rows, oldest first; the test side is left out.
 */
export function goldenItems(): ProductionItem[] {
  const articles = JSON.parse(readFileSync(new URL("articles.json", GOLDEN), "utf8"));
  const sideOf = JSON.parse(readFileSync(new URL("split.json", GOLDEN), "utf8")).articles;
  const kept = articles.filter((article: { id: number }) => sideOf[String(article.id)] !== "test");
  const items = kept.map((article: Record<string, unknown>) => ({
    id: Number(article.id), url: article.url, resolved_url: article.resolved_url ?? null, subject: article.subject, title: article.title,
    source: article.source ?? "", published_at: new Date(String(article.published_at)), body: article.body ?? null, body_via: article.body_via ?? null,
    posted: Boolean(article.posted), held_reason: article.held_reason ?? null, digest_tier: article.digest_tier ?? null,
  }));
  items.sort((first: ProductionItem, second: ProductionItem) => first.published_at.getTime() - second.published_at.getTime());
  return items;
}

/**
 * The JEV test key, read from the bench's key file; never printed.
 *
 * @returns The key.
 */
function jevTestKey(): string {
  const line = readFileSync(BENCH_ENV, "utf8").split("\n").find((entry) => entry.startsWith("JEV_TEST_API_KEY="));
  const key = line?.slice("JEV_TEST_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("no JEV_TEST_API_KEY line in research/bench/.env.bench");
  return key;
}

/**
 * Empties the replay schema and gives it the current live settings.
 *
 * @param ownerUrl  The owner's address for the v0 database.
 */
async function resetReplay(ownerUrl: string): Promise<void> {
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`TRUNCATE ${REPLAY_TABLES.split(", ").map((table) => `replay.${table}`).join(", ")} RESTART IDENTITY CASCADE`);
  await owner.end();
}

/** The versions a replay ran on, as the replay schema's own rows record them. */
type RunVersions = { classifier: string | null; extractor: string | null; grouping: string | null; settings: string | null };

/**
 * The versions the replay actually used, read from its answers rather than
 * from the code. A comma in a value means a --continue run spanned a change
 * of that station, and the scores mix the two.
 *
 * @param pool  The replay pool.
 * @returns Each station's versions, comma-separated when more than one.
 */
async function runVersions(pool: pg.Pool): Promise<RunVersions> {
  const result = await pool.query<RunVersions>(
    `SELECT (SELECT string_agg(DISTINCT version, ',') FROM classifications) AS classifier,
            (SELECT string_agg(DISTINCT version, ',') FROM extracts) AS extractor,
            (SELECT string_agg(DISTINCT version, ',') FROM groupings) AS grouping,
            (SELECT string_agg(DISTINCT settings_version::text, ',') FROM decisions) AS settings`,
  );
  const versions = result.rows[0];

  // Say so when a station ran on more than one version.
  for (const [station, value] of Object.entries(versions)) {
    if (value?.includes(",")) console.warn(`warning: the replay's ${station} answers come from more than one version (${value}); its scores mix them`);
  }
  return versions;
}

/**
 * Runs the replay and prints and stores its scores.
 */
async function main(): Promise<void> {
  // --continue carries on with what an earlier replay left waiting; otherwise start empty.
  const isContinue = process.argv.includes("--continue");
  const ownerUrl = process.env.V0_OWNER_URL;
  if (!isContinue && !ownerUrl) throw new Error("set V0_OWNER_URL: the replay empties the replay schema first");
  if (!isContinue) await resetReplay(String(ownerUrl));

  // Import the golden articles as history, then run every station on them.
  const pool = openPool(String(process.env.V0_DATABASE_URL), "replay");
  const started = Date.now();
  const runStartedAt = new Date(started).toISOString().slice(0, 19) + "Z";
  const imported = isContinue ? { imported: 0, readings: 0, noBody: 0 } : await importItems(pool, goldenItems(), SUBJECTS, true);
  const context: RunContext = {
    pool, feed: null, subjects: SUBJECTS, backfill: true, importDays: null, importLimit: null, deadline: Infinity,
    keys: { jev: jevTestKey(), openrouter: String(process.env.OPENROUTER_API_KEY), gemini: String(process.env.GEMINI_API_KEY) },
    poster: async () => null, readsReactions: false, sends: false, tally: { imported: imported.imported, readings_made: imported.readings, no_body: imported.noBody },
  };
  const result = await (await buildWorkflow(context).createRun()).start({ inputData: {} });

  // Score, store the scores with the run, and keep them in the repository with the versions they describe.
  const scores = await scoreReplay(pool);
  const versions = await runVersions(pool);
  const seconds = (Date.now() - started) / 1000;
  await pool.query("INSERT INTO runs (kind, finished_at, seconds, counts) VALUES ('replay', now(), $1, $2)", [seconds, { ...context.tally, scores }]);
  const stamp = new Date().toISOString().slice(0, 16).replace(":", "");
  const record = { status: result.status, run_started_at: runStartedAt, seconds: Math.round(seconds), versions, counts: context.tally, scores };
  mkdirSync(new URL("./replay-results/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`./replay-results/${stamp}.json`, import.meta.url), JSON.stringify(record, null, 1) + "\n");
  console.log(JSON.stringify({ status: result.status, seconds: Math.round(seconds), counts: context.tally }, null, 1));
  console.log(JSON.stringify(scores, null, 1));
  await pool.end();
}

if (import.meta.main) await main();
