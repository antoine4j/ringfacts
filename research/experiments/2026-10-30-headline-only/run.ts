// Step 2: send the headline side of every training and validation article
// through v0's own classifier (v7.7, JEV), imported unchanged. Only the key
// differs: the experiments' test key (research/bench/.env.bench), never live
// v0's. Test-side articles are never sent.
//
//   node run.ts --run headline-a          # every training and validation article, once
//   node run.ts --run headline-a --dry    # what would be sent, and the spend so far
//
// Writes data/runs/<run>/<id>.json in the shape of the clean-text
// experiment's saved-a (answers, extract, usage); extract is null, since
// only the classifier runs. A stored article is not sent again, so a stopped
// run carries on. Stops before the measured spend passes SPEND_LIMIT.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { classify } from "../../../v0/pipeline/stations/classifier/classifier.ts";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const BENCH_ENV = new URL("../../../research/bench/.env.bench", import.meta.url);
const HEADLINE_SIDE = new URL("./data/headline-side.json", import.meta.url);
const RUNS = new URL("./data/runs/", import.meta.url);
const JEV_DOLLARS_PER_TOKEN = 0.042 / 1_000_000;
const SPEND_LIMIT = 0.6;
const PARALLEL = 4;

type Article = { id: string; subject: string; title: string; source?: string; published_at: string };

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
 * Sends one article's headline side through the classifier and stores the answers.
 *
 * @param article  The golden article.
 * @param text  The headline side.
 * @param key  The JEV test key.
 * @param folder  The run's folder.
 * @returns The dollars it cost.
 */
async function sendOne(article: Article, text: string, key: string, folder: URL): Promise<number> {
  const input = { fighter: article.subject, headline: article.title, outlet: article.source ?? "", publishedAt: new Date(article.published_at), body: text };
  const classified = await classify(input, key);
  const jevUsage = (classified.raw as any)?.usage ?? null;
  const dollars = (jevUsage?.input_tokens ?? 0) * JEV_DOLLARS_PER_TOKEN;
  const usage = { jev: jevUsage, openrouter: null, dollars };
  writeFileSync(new URL(`${article.id}.json`, folder), JSON.stringify({ answers: classified.answers, extract: null, usage }, null, 1));
  return dollars;
}

/**
 * The articles to send: every one with a headline side (training and validation only), with its text.
 *
 * @returns Article and text pairs.
 */
function workList(): { article: Article; text: string }[] {
  const articles: Article[] = JSON.parse(readFileSync(new URL("articles-meta.json", GOLDEN), "utf8"));
  const sideOf: Record<string, string> = JSON.parse(readFileSync(new URL("split.json", GOLDEN), "utf8")).articles;
  const texts: Record<string, { text: string }> = JSON.parse(readFileSync(HEADLINE_SIDE, "utf8"));

  // A test-side article is refused even if a text for it were somehow present.
  const eligible = articles.filter((article) => sideOf[article.id] !== "test" && texts[article.id]);
  return eligible.map((article) => ({ article, text: texts[article.id].text }));
}

/**
 * The dollars every stored run of this experiment has cost so far.
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
  const run = argument("--run");
  if (!run) throw new Error("usage: node run.ts --run <name> [--dry]");
  const folder = new URL(`${run}/`, RUNS);
  mkdirSync(folder, { recursive: true });
  const key = benchKey("JEV_TEST_API_KEY");
  const waiting = workList().filter(({ article }) => !existsSync(new URL(`${article.id}.json`, folder)));

  // --dry says what would be sent and what has been spent, and sends nothing.
  if (process.argv.includes("--dry")) {
    console.log(JSON.stringify({ run, would_send: waiting.length, spent_so_far: Number(spentSoFar().toFixed(4)) }));
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
        // Await first, then add, so no worker's cost is lost.
        const dollars = await sendOne(article, text, key, folder);
        spent += dollars;
      } catch (error) {
        failures.push(`${article.id}: ${String(error).slice(0, 160)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  console.log(JSON.stringify({ run, sent: next - failures.length, waiting_left: waiting.length - next, failures, experiment_dollars_so_far: Number(spent.toFixed(4)) }, null, 1));
}

await main();
