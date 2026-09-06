// The story gate: the labelled archive replayed through the REAL decider.
// Every article of tmp/labels/stories.json goes past lib/matcher.js in
// arrival order, per subject, against the stories the matcher itself has
// opened so far (a cascade, not an oracle), and the result is scored against
// Anton's labels. Supersedes labels/measure-stories-llm.js, which asked a
// hand-written prompt the same question.
//
//   node bench/story.js --mode body            # the paid pass, about $1.85
//   node bench/story.js --decider fake --limit 60   # free smoke run, no key
//
// TEST key only (bench/.env.bench), no database, no posting. Verdicts are
// cached per run under tmp/labels/, so a rerun costs nothing.
//
// History: docs/decisions.md#stories-as-objects

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cosine, storiesByArrival } from "../labels/story-gate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LABELS_DIR = join(HERE, "..", "tmp/labels");
const WINDOW_MS = 7 * 24 * 3_600_000;

// Haiku 4.5 list price, dollars per million tokens (5-minute cache).
const PRICE_INPUT = 1;
const PRICE_OUTPUT = 5;
const PRICE_CACHE_READ = 0.1;
const PRICE_CACHE_WRITE = 1.25;

// The ship gate (task 5 brief): the archive must hold this many repeats, may
// swallow no more than this many useful first arrivals, and must not fold
// the three articles Anton called separate stories into #474.
const MIN_HELD = 307;
const MAX_USEFUL_SWALLOWED = 9;
const FORBIDDEN_FOLD = { target: 474, items: [490, 594, 598] };

/** When an item arrived, in milliseconds. */
function arrivalOf(item) {
  return new Date(item.seen_at).getTime();
}

/**
 * The stories still open to an arriving article: those with at least one
 * member seen inside the window.
 *
 * @param {Iterable<object>} stories  in-memory stories, each with `members`
 * @param {object} item               the arriving article
 * @param {{ windowMs?: number }} [options]
 * @returns {object[]}
 */
export function liveStories(stories, item, { windowMs = WINDOW_MS } = {}) {
  const arrived = arrivalOf(item);
  const live = [];

  for (const story of stories) {
    const hasFreshMember = story.members.some((member) => arrived - arrivalOf(member) < windowMs);
    if (hasFreshMember) live.push(story);
  }

  return live;
}

/**
 * The shortlist: live stories by their BEST member's similarity to the
 * arriving article, most similar first, cut at `top`. Max over all members
 * on purpose — a story's fifth article can be the one this article repeats.
 *
 * @param {object[]} live  live stories
 * @param {object} item    the arriving article
 * @param {number} top     how many to keep
 * @returns {object[]}     copies carrying `similarity`
 */
export function rankStories(live, item, top) {
  const scored = live.map((story) => {
    const similarities = story.members.map((member) => cosine(item.vec, member.vec));
    return { ...story, similarity: Math.max(...similarities) };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, top);
}

/**
 * One in-memory story as a matcher shortlist row. The id is a string because
 * that is what the pipeline hands the matcher (Postgres bigints arrive from
 * pg as strings) and normalizeVerdict compares offered ids as strings.
 *
 * @param {object} story
 * @returns {{ id: string, fact: string, root_title: string, members: number, claim_type: null, claim_status: null }}
 */
export function toShortlistRow(story) {
  return {
    id: String(story.root),
    fact: story.fact,
    root_title: story.rootTitle,
    members: story.members.length,
    // The archive replay files no claims, so the two claim columns the real
    // shortlist carries are always empty here.
    claim_type: null,
    claim_status: null,
  };
}

/**
 * Applies one verdict to the running story set and says which story the
 * article ended up in.
 *
 * A join lands on the named story. Everything else — new, reaction,
 * wrong_subject and UNSURE — opens a story rooted at the article itself; a
 * reaction records what it answers.
 *
 * @param {Map<number, object>} stories  root id → story, mutated in place
 * @param {object} item                  the arriving article
 * @param {{ decision: string|null, story: number|null, fact?: string|null }} verdict
 * @returns {number}                     the predicted story root
 */
export function applyDecision(stories, item, verdict) {
  const joined = verdict.decision === "join" && stories.has(verdict.story);
  if (joined) {
    stories.get(verdict.story).members.push(item);
    return verdict.story;
  }

  stories.set(item.id, {
    root: item.id,
    rootTitle: item.title,
    fact: verdict.fact ?? item.title,
    members: [item],
    reactsTo: verdict.decision === "reaction" ? verdict.story : null,
  });
  return item.id;
}

/** A fresh, empty tally. */
function emptyTally() {
  return {
    caught: 0, misplaced: 0, missed: 0, members: 0,
    swallowedUseful: 0, swallowedJunk: 0, newStories: 0,
    reactions: 0, wrongSubject: 0, unsure: 0,
    oracleInShortlist: 0, membersWithShortlist: 0,
  };
}

/**
 * Scores a finished cascade against the labels, for every row and for
 * Anton's rows alone.
 *
 * A labelled repeat is caught when it joined a story of the same labelled
 * story, misplaced when it joined a different one, missed when it did not
 * join at all. A labelled first arrival that joined anything is swallowed —
 * useful when Anton's bucket says it was worth posting, junk otherwise.
 *
 * @param {object[]} items                     the labelled items in the run
 * @param {Record<number, object>} verdictsById  the cached verdicts
 * @param {Map<number, number>} predictedRootById
 * @returns {{ all: object, user: object }}
 */
export function score(items, verdictsById, predictedRootById) {
  const trueStory = storiesByArrival(items);
  const all = emptyTally();
  const user = emptyTally();

  for (const item of items) {
    const verdict = verdictsById[item.id];
    if (!verdict) continue;
    const isRepeat = trueStory.get(item.id) !== item.id;
    const tallies = item.author === "user" ? [all, user] : [all];
    for (const tally of tallies) countOne(tally, { item, verdict, isRepeat, trueStory, predictedRootById });
  }

  return { all, user };
}

/**
 * Adds one article's outcome to one tally.
 *
 * @param {object} tally
 * @param {object} args  item, verdict, isRepeat, trueStory, predictedRootById
 * @returns {void}
 */
function countOne(tally, { item, verdict, isRepeat, trueStory, predictedRootById }) {
  if (verdict.decision === "reaction") tally.reactions += 1;
  if (verdict.decision === "wrong_subject") tally.wrongSubject += 1;
  if (verdict.decision === null || verdict.decision === undefined) tally.unsure += 1;
  const joined = verdict.decision === "join";

  // A first arrival that joined anything swallowed a story of its own.
  if (!isRepeat) {
    tally.newStories += 1;
    if (joined) tally[(item.bucket ?? 3) === 3 ? "swallowedJunk" : "swallowedUseful"] += 1;
    return;
  }

  tally.members += 1;
  const landedRight = predictedRootById.has(verdict.story) && trueStory.get(verdict.story) === trueStory.get(item.id);
  if (!joined) tally.missed += 1;
  else if (landedRight) tally.caught += 1;
  else tally.misplaced += 1;

  // What the shortlist could have offered, whatever the model then chose.
  tally.membersWithShortlist += 1;
  const sawTrueStory = (verdict.candidates ?? []).some((root) => trueStory.get(root) === trueStory.get(item.id));
  if (sawTrueStory) tally.oracleInShortlist += 1;
}

/**
 * The ship gate: enough repeats held, few enough useful first arrivals
 * swallowed, and none of the three articles Anton called separate stories
 * folded into #474.
 *
 * @param {object} tally                        the all-rows tally
 * @param {Record<number, object>} verdictsById  the cached verdicts
 * @returns {{ pass: boolean, reasons: string[] }}
 */
export function gate(tally, verdictsById) {
  const reasons = [];
  const held = tally.caught + tally.misplaced;

  if (held < MIN_HELD) reasons.push(`held ${held} < ${MIN_HELD}`);
  if (tally.swallowedUseful > MAX_USEFUL_SWALLOWED) reasons.push(`useful swallowed ${tally.swallowedUseful} > ${MAX_USEFUL_SWALLOWED}`);

  // A fold can be indirect: #594 joins a story that itself joined #474.
  for (const itemId of FORBIDDEN_FOLD.items) {
    if (foldsInto(itemId, FORBIDDEN_FOLD.target, verdictsById)) {
      reasons.push(`#${itemId} joined to #${FORBIDDEN_FOLD.target}`);
    }
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * Whether an article ends up in a target story by following its chain of
 * joins. Stops on a repeat, so a cycle in a hand-made verdict set cannot
 * hang the gate.
 *
 * @param {number} itemId
 * @param {number} targetId
 * @param {Record<number, object>} verdictsById
 * @returns {boolean}
 */
function foldsInto(itemId, targetId, verdictsById) {
  const seen = new Set();
  let current = itemId;

  while (verdictsById[current]?.decision === "join" && !seen.has(current)) {
    seen.add(current);
    current = verdictsById[current].story;
    if (current === targetId) return true;
  }

  return false;
}

/**
 * The labelled archive, with the mode's text and vectors folded in.
 *
 * @param {string} mode  "title" or "body"
 * @returns {object[]}
 */
function loadItems(mode) {
  const items = JSON.parse(readFileSync(join(LABELS_DIR, "stories.json"), "utf8"));
  const bodiesPath = join(LABELS_DIR, "bodies.json");
  const bodies = existsSync(bodiesPath) ? JSON.parse(readFileSync(bodiesPath, "utf8")) : {};

  // Title mode is the shape of the old headline-only hold; body mode uses the
  // body text and the vectors embedded from it.
  if (mode !== "body") {
    for (const item of items) item.body = null;
    return items;
  }

  const vectors = JSON.parse(readFileSync(join(LABELS_DIR, "vectors-body.json"), "utf8"));
  for (const item of items) {
    item.vec = vectors[item.id] ?? item.vec;
    item.body = item.body ?? bodies[item.id]?.body ?? null;
  }
  return items;
}

/**
 * The command line.
 *
 * @param {string[]} argv
 * @returns {object}
 */
function parseArguments(argv) {
  const valueOf = (name, fallback) => {
    const at = argv.indexOf(name);
    return at > 0 ? argv[at + 1] : fallback;
  };

  return {
    mode: valueOf("--mode", "body"),
    top: Number(valueOf("--top", 3)),
    limit: Number(valueOf("--limit", Infinity)),
    repeat: Number(valueOf("--repeat", 1)),
    decider: valueOf("--decider", "real"),
    fightWeekShape: !argv.includes("--no-shape"),
  };
}

/**
 * The cache file for one run: the mode, the settings that change the answer,
 * and which repeat this is.
 *
 * @param {object} options
 * @param {number} runIndex
 * @returns {string}
 */
function cachePath(options, runIndex) {
  const parts = [options.mode];
  if (options.top !== 3) parts.push(`top${options.top}`);
  if (!options.fightWeekShape) parts.push("noshape");
  if (options.decider === "fake") parts.push("fake");
  return join(LABELS_DIR, `bench-story-${parts.join("-")}-r${runIndex}.json`);
}

// The fake decider's join threshold: a $0 stand-in that exercises the whole
// script without a key. Deliberately the old similarity rule, not a model.
const FAKE_JOIN_SIMILARITY = 0.85;

/**
 * A deterministic stand-in for the matcher: join the best candidate when it
 * is similar enough, else open a story.
 *
 * @param {object} item
 * @param {object[]} shortlist  ranked stories, most similar first
 * @returns {{ decision: string, story: number|null, fact: string, reasoning: string }}
 */
function fakeDecide(item, shortlist) {
  const best = shortlist[0];
  if (best && best.similarity >= FAKE_JOIN_SIMILARITY) {
    return { decision: "join", story: best.root, fact: null, reasoning: `similarity ${best.similarity.toFixed(3)}` };
  }
  return { decision: "new", story: null, fact: item.title, reasoning: "no candidate above the threshold" };
}

/**
 * Replays one subject's articles in arrival order, cascading the decider's
 * own decisions.
 *
 * @param {object} args  subject, subjectItems, decide, options, cache, saveCache
 * @returns {Promise<Map<number, number>>}  item id → predicted story root
 */
async function replaySubject({ subject, subjectItems, decide, options, cache, saveCache }) {
  const stories = new Map();
  const predictedRootById = new Map();

  for (const item of subjectItems) {
    const shortlist = rankStories(liveStories(stories.values(), item), item, options.top);
    let verdict = cache[item.id];
    if (!verdict) {
      verdict = await decide({ subject, item, shortlist });
      cache[item.id] = verdict;
      saveCache();
    }

    const root = applyDecision(stories, item, verdict);
    predictedRootById.set(item.id, root);
    process.stderr.write(`${subject} #${item.id} ${verdict.decision ?? "unsure"}${verdict.story ? " → #" + verdict.story : ""}\n`);
  }

  return predictedRootById;
}

/**
 * One whole cascade over the archive, under its own verdict cache.
 *
 * @param {object[]} sorted   the items in arrival order
 * @param {Function} decide   the decider
 * @param {object} options
 * @param {number} runIndex
 * @returns {Promise<{ verdictsById: object, predictedRootById: Map<number, number> }>}
 */
async function runOnce(sorted, decide, options, runIndex) {
  const path = cachePath(options, runIndex);
  const cache = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const saveCache = () => writeFileSync(path, JSON.stringify(cache));

  // Subjects share nothing, so they replay in parallel.
  const bySubject = new Map();
  for (const item of sorted) {
    if (!bySubject.has(item.subject)) bySubject.set(item.subject, []);
    bySubject.get(item.subject).push(item);
  }
  const perSubject = await Promise.all(
    [...bySubject].map(([subject, subjectItems]) => replaySubject({ subject, subjectItems, decide, options, cache, saveCache })),
  );

  const predictedRootById = new Map();
  for (const one of perSubject) for (const [id, root] of one) predictedRootById.set(id, root);
  return { verdictsById: cache, predictedRootById };
}

/** Thrown by Anthropic when the account has hit its spend cap. The cap is
 * shared with production, so this must stop the run rather than retry. */
const USAGE_LIMIT_PATTERN = /usage|billing|limit|credit/i;

/**
 * Retries a fallible async call, except a usage-limit error, which is fatal
 * immediately — the Anthropic cap is shared with production.
 *
 * @param {() => Promise<*>} fn
 * @param {{ attempts: number, delayMs: number }} options  delayMs is per attempt, backing off as delayMs × attempt
 * @returns {Promise<*>}
 */
export async function withRetry(fn, { attempts, delayMs }) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (USAGE_LIMIT_PATTERN.test(error.message)) throw error;
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  throw lastError;
}

/**
 * Builds the real decider: one matchItem call per article, cached, retried
 * on transient errors.
 *
 * @param {object} options
 * @returns {Promise<{ decide: Function, usage: Function, model: string, errorCount: Function }>}
 */
async function realDecider(options) {
  const { loadBenchEnv } = await import("./env.js");
  await loadBenchEnv();
  // Imported only now: lib/matcher.js builds its Anthropic client at import
  // time, so the env has to be in place first.
  const { matchItem, usageTotals, MATCHER_MODEL } = await import("../lib/matcher.js");

  let errors = 0;

  const decide = async ({ subject, item, shortlist }) => {
    const pipelineItem = {
      title: item.title,
      source: item.source,
      publishedAt: new Date(item.published_at),
      body: item.body,
      foundVia: null,
    };
    const surname = subject.split(" ").pop();
    const candidates = shortlist.map((story) => story.root);

    let verdict;
    try {
      verdict = await withRetry(
        () =>
          matchItem({
            subject,
            item: pipelineItem,
            stories: shortlist.map(toShortlistRow),
            subjectNames: [surname],
            fightWeekShape: options.fightWeekShape,
          }),
        { attempts: 3, delayMs: 2000 },
      );
    } catch (error) {
      if (USAGE_LIMIT_PATTERN.test(error.message)) {
        throw new Error(`Anthropic usage/billing limit hit — stopping the run: ${error.message}`);
      }
      // Three transient failures in a row: record as UNSURE and move on,
      // rather than aborting the whole paid cascade over one bad item.
      errors++;
      return { decision: null, story: null, fact: item.title, reasoning: `error: ${error.message}`, candidates };
    }

    return {
      decision: verdict.decision ?? null,
      story: verdict.story_id === null || verdict.story_id === undefined ? null : Number(verdict.story_id),
      fact: verdict.fact ?? null,
      reasoning: verdict.reasoning ?? "",
      candidates,
    };
  };

  return { decide, usage: usageTotals, model: MATCHER_MODEL, errorCount: () => errors };
}

/** The free decider: no env, no matcher import, no key. */
function fakeDecider() {
  const decide = async ({ item, shortlist }) => ({
    ...fakeDecide(item, shortlist),
    candidates: shortlist.map((story) => story.root),
  });
  return {
    decide,
    usage: () => ({ calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }),
    model: "fake decider (similarity ≥ 0.85)",
    errorCount: () => 0,
  };
}

/**
 * One markdown table row.
 *
 * @param {string} label
 * @param {object} tally
 * @returns {string}
 */
function tableRow(label, tally) {
  const cells = [
    label,
    tally.caught + tally.misplaced,
    tally.caught,
    tally.misplaced,
    tally.missed,
    tally.swallowedUseful,
    tally.swallowedJunk,
    tally.reactions,
    `${tally.oracleInShortlist}/${tally.membersWithShortlist}`,
  ];
  return `| ${cells.join(" | ")} |`;
}

/**
 * The min–max line across repeat runs, so a reader can see the noise before
 * reading a difference.
 *
 * @param {object[]} tallies  one all-rows tally per run
 * @returns {string}
 */
function spreadLine(tallies) {
  const range = (values) => (Math.min(...values) === Math.max(...values) ? `${values[0]}` : `${Math.min(...values)}–${Math.max(...values)}`);
  const held = tallies.map((tally) => tally.caught + tally.misplaced);
  const missed = tallies.map((tally) => tally.missed);
  const swallowed = tallies.map((tally) => tally.swallowedUseful);
  return `Spread over ${tallies.length} runs: held ${range(held)}, missed ${range(missed)}, useful swallowed ${range(swallowed)}.`;
}

/**
 * Runs the bench: the archive through the decider, K times, then the table,
 * the cost and the gate.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const options = parseArguments(process.argv);
  const items = loadItems(options.mode);
  const sorted = [...items].sort((a, b) => arrivalOf(a) - arrivalOf(b) || a.id - b.id).slice(0, options.limit);
  const { decide, usage, model, errorCount } = options.decider === "fake" ? fakeDecider() : await realDecider(options);

  const rows = [];
  const allTallies = [];
  const gates = [];
  for (let runIndex = 1; runIndex <= options.repeat; runIndex++) {
    const { verdictsById, predictedRootById } = await runOnce(sorted, decide, options, runIndex);
    // Scored against the WHOLE archive's labels even under --limit: a story's
    // root can sit outside the slice, and only rows with a verdict are counted.
    const { all, user } = score(items, verdictsById, predictedRootById);
    const suffix = options.repeat > 1 ? ` [run ${runIndex}]` : "";
    rows.push(tableRow(`all ${sorted.length} articles (${all.members} repeats, ${all.newStories} first arrivals)${suffix}`, all));
    rows.push(tableRow(`Anton's rows only (${user.members} repeats, ${user.newStories} first arrivals)${suffix}`, user));
    allTallies.push(all);
    gates.push(gate(all, verdictsById));
  }

  printReport({ options, sorted, model, rows, allTallies, gates, usage: usage(), errors: errorCount() });
}

/**
 * Prints the table, the extra counts, the money and the gate.
 *
 * @param {object} args  options, sorted, model, rows, allTallies, gates, usage, errors
 * @returns {void}
 */
function printReport({ options, sorted, model, rows, allTallies, gates, usage, errors }) {
  const inputCost = usage.inputTokens * PRICE_INPUT;
  const outputCost = usage.outputTokens * PRICE_OUTPUT;
  const cacheReadCost = usage.cacheReadTokens * PRICE_CACHE_READ;
  const cacheWriteCost = usage.cacheWriteTokens * PRICE_CACHE_WRITE;
  const cost = (inputCost + outputCost + cacheReadCost + cacheWriteCost) / 1e6;
  const shape = options.fightWeekShape ? "" : ", no fight-week shape";
  const last = allTallies[allTallies.length - 1];
  const failed = gates.filter((one) => !one.pass);
  const reasons = [...new Set(failed.flatMap((one) => one.reasons))];

  console.log(`## The story gate — ${sorted.length} labelled articles, ${options.mode} text, top-${options.top} shortlist${shape}, ${model}

| rows | held | caught | misplaced | missed | useful swallowed | junk swallowed | reactions | true story in shortlist |
|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

Off-menu verdicts in the last run: ${last.wrongSubject} wrong_subject, ${last.unsure} unsure (each counted as a story of its own).
${options.repeat > 1 ? spreadLine(allTallies) + "\n" : ""}
Spent this run: ${usage.calls} calls, ${usage.inputTokens} input + ${usage.outputTokens} output tokens, cache read ${usage.cacheReadTokens} + cache write ${usage.cacheWriteTokens} tokens ≈ $${cost.toFixed(2)} at Haiku 4.5 list price ($${PRICE_INPUT}/M input, $${PRICE_OUTPUT}/M output, $${PRICE_CACHE_READ}/M cache read, $${PRICE_CACHE_WRITE}/M cache write). ${errors} errors treated as UNSURE.

## gate
${failed.length === 0 ? "PASS" : `FAIL — ${reasons.join("; ")}`}`);
}

// Only when run as a script: importing this file for its pure parts must
// load no env, no key and no matcher.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
