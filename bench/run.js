// The bench runner: a battery of articles through ONE pipeline step, on the
// test keys and the bench database, from any fresh session.
//
//   node bench/run.js --step tier                       # corpus/tune.json, free, offline
//   node bench/run.js --step matcher --keys a16,a18     # real Haiku calls on the TEST key
//   node bench/run.js --step extract --limit 5          # live fetches
//   node bench/run.js --step untrusted --from my.json   # the bench database's own record
//
// Steps and what they need are in bench/steps.js. Every run prints a table
// and writes the full rows to bench/runs/<stamp>-<step>.json (gitignored).
// Never the production keys, never the production database, never the group:
// bench/env.js refuses all three.

import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "./args.js";
import { loadBenchEnv } from "./env.js";
import { loadItems } from "./items.js";
import { STEPS, runStep } from "./steps.js";

const args = parseArgs(process.argv.slice(2));
const step = STEPS[args.step];

// Credentials first: lib/matcher.js builds its client when imported, so the
// TEST key has to be in the environment before the import below.
const env = await loadBenchEnv();

// Real modules, imported only now.
const { loadSubjects } = await import("../lib/subjects.js");
const { digestTierFor } = await import("../lib/tier.js");
const { domainOf, isUntrustedSource } = await import("../lib/untrusted.js");
const store = await import("../lib/db.js");

/**
 * The context a step runs in: every real dependency, opened only when the
 * step says it needs it.
 *
 * @returns {Promise<object>}
 */
async function buildContext() {
  const ctx = { subjects: await loadSubjects(), digestTierFor, domainOf, isUntrustedSource, store, db: null };

  if (step.needs.includes("db")) {
    ctx.db = await store.openDb();
  }
  if (step.needs.includes("anthropic")) {
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_TEST_API_KEY missing from bench/.env.bench");
    ctx.matchItem = (await import("../lib/matcher.js")).matchItem;
  }
  if (step.needs.includes("network")) {
    ctx.fetchArticleBody = (await import("../lib/extract.js")).fetchArticleBody;
  }
  return ctx;
}

/**
 * Prints the rows as a fixed-width table: key, ok mark, got, want, title.
 *
 * @param {object[]} rows
 */
function printTable(rows) {
  const mark = (row) => (row.error ? "!!" : row.ok === null ? "  " : row.ok ? "ok" : "XX");
  for (const row of rows) {
    const body = row.error ? `error: ${row.error}` : `${row.got}${row.want ? `  (want ${row.want})` : ""}`;
    console.log(`${row.key.padEnd(6)} ${mark(row)}  ${body}\n       ${row.title}`);
  }
}

const rows = await loadItems(args.from, { keys: args.keys, limit: args.limit });
console.log(`bench: ${step.name} — ${step.describe}\n${rows.length} item(s) from ${args.from}\n`);

const ctx = await buildContext();
try {
  const { rows: results, summary } = await runStep(step, rows, ctx);
  printTable(results);

  const score = summary.scored ? ` — ${summary.ok}/${summary.scored} match the corpus labels` : "";
  console.log(`\n${summary.total} item(s)${score}`);

  // The record of the run, for a later comparison.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const path = new URL(`./runs/${stamp}-${step.name}.json`, import.meta.url);
  await mkdir(new URL("./runs/", import.meta.url), { recursive: true });
  await writeFile(path, JSON.stringify({ step: step.name, from: args.from, summary, rows: results }, null, 2));
  console.log(`written ${path.pathname.replace(process.cwd() + "/", "")}`);
} finally {
  if (ctx.db) await ctx.db.end();
}
