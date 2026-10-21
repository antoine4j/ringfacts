// Step 2 of 3.11: send golden articles through v0's own classifier (JEV v7.7)
// and claim extractor (p4 on Qwen), on the saved text or the clean text.
// The station code is imported unchanged; only the keys differ: the
// experiments' test keys (research/bench/.env.bench), never live v0's.
//
//   node run.ts --text saved --run saved-a                 # all 300 on the saved text
//   node run.ts --text saved --run saved-b --sample 40     # the noise floor: 40 again, same input
//   node run.ts --text clean --run clean-a                 # every article whose clean text differs
//
// The production-like arm needs no run of its own: where code alone accepted
// Readability (106 articles), its text is the clean text, so compare.ts reuses
// the clean run there and the saved run everywhere else.
//
// Writes data/runs/<run>/<id>.json (answers, extract, usage); a stored
// article is not sent again, so a stopped run carries on. Stops before
// the whole experiment's measured spend passes SPEND_LIMIT.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { classify } from "../../../v0/pipeline/stations/classifier/classifier.ts";
import { extract } from "../../../v0/pipeline/stations/extractor/extractor.ts";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const BENCH_ENV = new URL("../../../research/bench/.env.bench", import.meta.url);
const CLEAN = new URL("./data/clean.json", import.meta.url);
const RUNS = new URL("./data/runs/", import.meta.url);
const JEV_DOLLARS_PER_TOKEN = 0.042 / 1_000_000;
const SPEND_LIMIT = 0.9;
const PARALLEL = 4;
const SAMPLE_SEED = 3112;

type Article = { id: string; subject: string; title: string; source?: string; published_at: string; body: string };

/**
 * One key from the bench's key file; never printed.
 *
 * @param name  The variable's name.
 * @returns The key.
 */
function benchKey(name: string): string {
  const line = readFileSync(BENCH_ENV, "utf8").split("\n").find((entry) => entry.startsWith(`${name}=`));
  const key = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error(`no ${name} line in research/bench/.env.bench`);
  return key;
}

/**
 * A fixed sample of article ids: the same ids on every call.
 *
 * @param ids  The ids to draw from.
 * @param size  How many.
 * @returns The sample, in input order.
 */
export function sampleIds(ids: string[], size: number): string[] {
  let state = SAMPLE_SEED;
  const scored = ids.map((id) => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return { id, score: state };
  });
  scored.sort((first, second) => first.score - second.score);
  const chosen = new Set(scored.slice(0, size).map((entry) => entry.id));
  return ids.filter((id) => chosen.has(id));
}

/**
 * The dollars one article cost: JEV's input tokens at its price, plus OpenRouter's own figure.
 *
 * @param jevRaw  JEV's reply.
 * @param openRouterRaw  OpenRouter's reply.
 * @returns Dollars.
 */
function dollarsOf(jevRaw: any, openRouterRaw: any): number {
  const jev = (jevRaw?.usage?.input_tokens ?? 0) * JEV_DOLLARS_PER_TOKEN;
  const openRouter = Number(openRouterRaw?.usage?.cost ?? 0);
  return jev + openRouter;
}

/**
 * Sends one article's text through both stations and stores the answers.
 *
 * @param article  The golden article.
 * @param text  The text to send.
 * @param keys  The test keys.
 * @param folder  The run's folder.
 * @returns The dollars it cost.
 */
async function sendOne(article: Article, text: string, keys: { jev: string; openrouter: string }, folder: URL): Promise<number> {
  const input = { fighter: article.subject, headline: article.title, outlet: article.source ?? "", publishedAt: new Date(article.published_at), body: text };
  const classified = await classify(input, keys.jev);
  const extracted = await extract(input, keys.openrouter);
  const dollars = dollarsOf(classified.raw, extracted.raw);
  const usage = { jev: (classified.raw as any)?.usage ?? null, openrouter: (extracted.raw as any)?.usage ?? null, dollars };
  writeFileSync(new URL(`${article.id}.json`, folder), JSON.stringify({ answers: classified.answers, extract: extracted.answers, usage }, null, 1));
  return dollars;
}

/**
 * The text one article is sent under one kind of run, or null when that run
 * would send exactly the saved text (its saved-run answers stand for it).
 *
 * @param which  "saved" or "clean".
 * @param article  The golden article.
 * @param sources  The clean texts.
 * @returns The text, or null.
 */
function textFor(which: string, article: Article, sources: { clean: any }): string | null {
  if (which === "saved") return article.body;
  const text = sources.clean[article.id].text;
  const isSaved = !text || text.replace(/\s+/g, " ").trim() === article.body.replace(/\s+/g, " ").trim();
  return isSaved ? null : text;
}

/**
 * The articles a run sends, with the text each is sent.
 *
 * @param which  "saved" or "clean".
 * @param sample  How many to sample, or null for all.
 * @returns Article and text pairs.
 */
function workList(which: string, sample: number | null): { article: Article; text: string }[] {
  const articles: Article[] = JSON.parse(readFileSync(new URL("articles.json", GOLDEN), "utf8"));
  const sources = { clean: JSON.parse(readFileSync(CLEAN, "utf8")) };

  // Only the articles whose text differs from the saved one are sent; the rest reuse the saved run.
  const eligible = articles.filter((article) => textFor(which, article, sources) !== null);
  const chosen = sample ? new Set(sampleIds(eligible.map((article) => article.id), sample)) : null;
  const kept = chosen ? eligible.filter((article) => chosen.has(article.id)) : eligible;
  return kept.map((article) => ({ article, text: textFor(which, article, sources) as string }));
}

/**
 * The dollars every stored run has cost so far, so the limit covers the whole experiment.
 *
 * @returns Dollars.
 */
function spentSoFar(): number {
  if (!existsSync(RUNS)) return 0;
  let dollars = 0;
  for (const run of readdirSync(RUNS)) {
    for (const file of readdirSync(new URL(`${run}/`, RUNS))) {
      dollars += JSON.parse(readFileSync(new URL(`${run}/${file}`, RUNS), "utf8")).usage?.dollars ?? 0;
    }
  }
  return dollars;
}

/**
 * Runs one pass, a few articles at a time, and stops short of the spend limit.
 */
async function main(): Promise<void> {
  const argument = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
  const which = argument("--text");
  const run = argument("--run");
  if ((which !== "saved" && which !== "clean") || !run) throw new Error("usage: node run.ts --text saved|clean --run <name> [--sample N]");
  const sample = argument("--sample") ? Number(argument("--sample")) : null;
  const folder = new URL(`${run}/`, RUNS);
  mkdirSync(folder, { recursive: true });
  const keys = { jev: benchKey("JEV_TEST_API_KEY"), openrouter: benchKey("OPENROUTER_TEST_API_KEY") };
  const waiting = workList(which, sample).filter(({ article }) => !existsSync(new URL(`${article.id}.json`, folder)));

  // --dry says what would be sent and what has been spent, and sends nothing.
  if (process.argv.includes("--dry")) {
    console.log(JSON.stringify({ run, text: which, would_send: waiting.length, spent_so_far: Number(spentSoFar().toFixed(4)) }));
    return;
  }

  // A small pool of workers; each stops once the spend so far nears the limit.
  let spent = spentSoFar();
  let next = 0;
  const failures: string[] = [];
  async function worker() {
    while (next < waiting.length && spent < SPEND_LIMIT) {
      const { article, text } = waiting[next];
      next += 1;
      try {
        // Await first, then add: "spent += await ..." would read spent before the wait and lose other workers' costs.
        const dollars = await sendOne(article, text, keys, folder);
        spent += dollars;
      } catch (error) {
        failures.push(`${article.id}: ${String(error).slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(JSON.stringify({ run, text: which, sent: next - failures.length, waiting_left: waiting.length - next, failures, experiment_dollars_so_far: Number(spent.toFixed(4)) }, null, 1));
}

await main();
