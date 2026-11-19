// Step 3: what the classifier answers from the headline side alone, against
// the labels and against its own answers on the full saved text. Counts and
// ids only, never text. Training and validation sides only: no test-side
// article is read.
//
//   node compare.ts            # prints the counts and writes results.json
//
// Four runs, the same 195 articles in each:
//   headline_a   this folder's data/runs/headline-a (the headline side, first run)
//   headline_b   data/runs/headline-b (the same headline side sent again: the headline noise floor)
//   saved        the clean-text experiment's saved-a (classifier v7.7 on the saved text)
//   saved_again  its saved-b (the same saved text sent again: the full-text noise floor)
// The decider's settings are data/live-settings.json (v1, read read-only).

import { readFileSync, existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { decideTier, type Settings } from "../../../v0/pipeline/settings/tiers.ts";
import { CLASSIFIER_VERSION } from "../../../v0/pipeline/stations/classifier/classifier.ts";
import { SUBJECTS } from "../../../watchlist.js";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const OWN_RUNS = new URL("./data/runs/", import.meta.url);
const SAVED_RUNS = new URL("../2026-10-20-clean-text/data/runs/", import.meta.url);
const OUT = new URL("./results.json", import.meta.url);
const QUESTIONS = ["centrality", "source", "act", "fact", "firmness", "reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"];
const CAREER_FACTS = new Set(["result", "next_fight", "health"]);
const TIER_NAMES: Record<number, string> = { 1: "post", 2: "digest", 3: "drop" };
const RUN_FOLDERS: Record<string, URL> = { headline_a: new URL("headline-a/", OWN_RUNS), headline_b: new URL("headline-b/", OWN_RUNS), saved: new URL("saved-a/", SAVED_RUNS), saved_again: new URL("saved-b/", SAVED_RUNS) };

type Answers = Record<string, string>;
type Context = { key: Record<string, Answers>; flips: Map<string, Set<string>>; settings: Settings; answers: Record<string, Record<string, Answers>> };

/**
 * Reads JSON from a URL.
 *
 * @param url
 * @returns The parsed content.
 */
function readJson(url: URL): any {
  return JSON.parse(readFileSync(url, "utf8"));
}

/**
 * The tier the decider gives a set of answers under the live settings.
 *
 * @param answers  Nine answers.
 * @param settings  The decider's settings.
 * @returns 1 (post), 2 (digest) or 3 (drop).
 */
function tierOf(answers: Answers, settings: Settings): number {
  return decideTier(answers, CLASSIFIER_VERSION, settings).tier;
}

/**
 * Whether one answer counts as right: the key's value, or either value of a coin flip.
 *
 * @param id  The article id.
 * @param question  The question.
 * @param value  The answer given.
 * @param context  The key and coin flips.
 * @returns True when right.
 */
function isRight(id: string, question: string, value: string, context: Context): boolean {
  const accepted = context.flips.get(`${id} ${question}`) ?? new Set([context.key[id][question]]);
  return accepted.has(value);
}

/**
 * One run's score against the labels on a set of articles.
 *
 * @param run  "headline_a", "headline_b", "saved" or "saved_again".
 * @param ids  The articles.
 * @param context  Key, flips, settings and every run's answers.
 * @returns Answers right, all nine right, career facts, false alarms, and the tier the labels' own answers get.
 */
function score(run: string, ids: string[], context: Context) {
  const rightPerQuestion: Record<string, number> = {};
  let answersRight = 0;
  let allNine = 0;
  for (const id of ids) {
    const given = context.answers[run][id];
    const rightHere = QUESTIONS.filter((question) => isRight(id, question, given[question], context));
    for (const question of rightHere) rightPerQuestion[question] = (rightPerQuestion[question] ?? 0) + 1;
    answersRight += rightHere.length;
    if (rightHere.length === QUESTIONS.length) allNine += 1;
  }

  // Career facts: labelled ones recognised (any career fact counts), and career facts given where the label has none.
  const careerIds = ids.filter((id) => CAREER_FACTS.has(context.key[id].fact));
  const quietIds = ids.filter((id) => !CAREER_FACTS.has(context.key[id].fact));
  const recognised = careerIds.filter((id) => CAREER_FACTS.has(context.answers[run][id].fact));
  const sameFact = careerIds.filter((id) => context.answers[run][id].fact === context.key[id].fact);
  const falseAlarms = quietIds.filter((id) => CAREER_FACTS.has(context.answers[run][id].fact));

  // The tier the decider gives this run's answers, against the tier it gives the labels' answers.
  const atLabelTier = ids.filter((id) => tierOf(context.answers[run][id], context.settings) === tierOf(context.key[id], context.settings));
  const labelPostIds = ids.filter((id) => tierOf(context.key[id], context.settings) === 1);
  const postedOfLabelPost = labelPostIds.filter((id) => tierOf(context.answers[run][id], context.settings) === 1);
  const postedWithoutLabelPost = ids.filter((id) => tierOf(context.answers[run][id], context.settings) === 1 && tierOf(context.key[id], context.settings) !== 1);
  return {
    articles: ids.length,
    answers_right: answersRight,
    answers_asked: ids.length * QUESTIONS.length,
    all_nine_right: allNine,
    right_per_question: rightPerQuestion,
    career_facts_labelled: careerIds.length,
    career_facts_recognised: recognised.length,
    career_facts_same_kind: sameFact.length,
    career_false_alarms: falseAlarms.length,
    career_false_alarm_ids: falseAlarms,
    at_the_labels_tier: atLabelTier.length,
    label_post_articles: labelPostIds.length,
    label_post_reaching_post: postedOfLabelPost.length,
    post_where_label_is_not_post: postedWithoutLabelPost.length,
  };
}

/**
 * How one run's answers differ from another's on a set of articles: same nine, tier crossings and their direction.
 *
 * @param first  The run compared against (the full text, or the first headline run).
 * @param second  The run compared.
 * @param ids  The articles.
 * @param context  Settings and every run's answers.
 * @returns The counts, with the ids that crossed a tier or moved a career fact.
 */
function agreement(first: string, second: string, ids: string[], context: Context) {
  const tierMoves: Record<string, number> = {};
  const crossedIds: string[] = [];
  const answersChangedPerQuestion: Record<string, number> = {};
  let sameNine = 0;
  let answersChanged = 0;
  let moreCautious = 0;
  let moreEager = 0;
  let careerLost = 0;
  let careerInvented = 0;
  for (const id of ids) {
    const before = context.answers[first][id];
    const after = context.answers[second][id];
    const changed = QUESTIONS.filter((question) => before[question] !== after[question]);
    for (const question of changed) answersChangedPerQuestion[question] = (answersChangedPerQuestion[question] ?? 0) + 1;
    answersChanged += changed.length;
    if (changed.length === 0) sameNine += 1;

    // A tier crossing, and its direction: a higher tier number is more cautious (post 1, digest 2, drop 3).
    const tierBefore = tierOf(before, context.settings);
    const tierAfter = tierOf(after, context.settings);
    if (tierBefore !== tierAfter) {
      const move = `${TIER_NAMES[tierBefore]} → ${TIER_NAMES[tierAfter]}`;
      tierMoves[move] = (tierMoves[move] ?? 0) + 1;
      crossedIds.push(id);
      if (tierAfter > tierBefore) moreCautious += 1;
      else moreEager += 1;
    }

    // A career fact the full text saw and this run did not, or the other way.
    const careerBefore = CAREER_FACTS.has(before.fact);
    const careerAfter = CAREER_FACTS.has(after.fact);
    if (careerBefore && !careerAfter) careerLost += 1;
    if (!careerBefore && careerAfter) careerInvented += 1;
  }
  const tierCrossings = crossedIds.length;
  return { articles: ids.length, same_nine_answers: sameNine, answers_changed: answersChanged, answers_changed_per_question: answersChangedPerQuestion, tier_crossings: tierCrossings, tier_moves: tierMoves, more_cautious: moreCautious, more_eager: moreEager, career_fact_lost: careerLost, career_fact_invented: careerInvented, tier_crossing_ids: crossedIds };
}

/**
 * How many of the articles that changed tier against the full text changed tier in both headline runs.
 *
 * @param ids  The articles.
 * @param context  Settings and every run's answers.
 * @returns The crossings of each headline run against the full text, and the ones they share.
 */
function sharedCrossings(ids: string[], context: Context) {
  const crossedByA = new Set(agreement("saved", "headline_a", ids, context).tier_crossing_ids);
  const crossedByB = new Set(agreement("saved", "headline_b", ids, context).tier_crossing_ids);
  const inBoth = [...crossedByA].filter((id) => crossedByB.has(id));
  return { headline_a_crossings: crossedByA.size, headline_b_crossings: crossedByB.size, crossed_in_both_runs: inBoth.length, crossed_in_one_run_only: crossedByA.size + crossedByB.size - 2 * inBoth.length };
}

/**
 * How many articles each run puts in each tier.
 *
 * @param run  The run, or "labels" for the labels' own answers.
 * @param ids  The articles.
 * @param context  Key, settings and every run's answers.
 * @returns Post, digest and drop counts.
 */
function tierCounts(run: string, ids: string[], context: Context): Record<string, number> {
  const counts: Record<string, number> = { post: 0, digest: 0, drop: 0 };
  for (const id of ids) {
    const answers = run === "labels" ? context.key[id] : context.answers[run][id];
    counts[TIER_NAMES[tierOf(answers, context.settings)]] += 1;
  }
  return counts;
}

/**
 * Every comparison on one group of articles.
 *
 * @param ids  The group.
 * @param context  Key, flips, settings and every run's answers.
 * @returns Scores per run, agreement with the full text beside the full-text noise floor, the headline noise floor, and tier counts.
 */
function report(ids: string[], context: Context) {
  return {
    articles: ids.length,
    scores: { headline_a: score("headline_a", ids, context), headline_b: score("headline_b", ids, context), saved: score("saved", ids, context), saved_again: score("saved_again", ids, context) },
    against_full_text: { headline_a_vs_saved: agreement("saved", "headline_a", ids, context), headline_b_vs_saved: agreement("saved", "headline_b", ids, context), noise_floor_saved_vs_saved_again: agreement("saved", "saved_again", ids, context) },
    headline_noise_floor_a_vs_b: agreement("headline_a", "headline_b", ids, context),
    headline_crossings_shared: sharedCrossings(ids, context),
    tiers: { labels: tierCounts("labels", ids, context), headline_a: tierCounts("headline_a", ids, context), headline_b: tierCounts("headline_b", ids, context), saved: tierCounts("saved", ids, context), saved_again: tierCounts("saved_again", ids, context) },
  };
}

/**
 * Whether a headline names its fighter by one of the watchlist's name stems (case ignored).
 *
 * @param headline
 * @param subject  The fighter's full name.
 * @returns True when a stem appears.
 */
function headlineNamesHim(headline: string, subject: string): boolean {
  const stems: string[] = SUBJECTS.find((entry: { name: string }) => entry.name === subject)?.matchNames ?? [];
  const lower = headline.toLowerCase();
  return stems.some((stem) => lower.includes(stem.toLowerCase()));
}

/**
 * Loads the key, the coin flips, the settings and every run's answers for the given ids.
 *
 * @param ids  The articles every run must hold.
 * @returns The context every count reads.
 */
function loadContext(ids: string[]): Context {
  const key: Record<string, Answers> = {};
  for (const [id, label] of Object.entries(readJson(new URL("labels.json", GOLDEN)).articles as Record<string, { answers: Answers }>)) key[id] = label.answers;
  const flips = new Map<string, Set<string>>();
  for (const flip of readJson(new URL("coin-flips.json", GOLDEN)).flips) flips.set(`${flip.id} ${flip.question}`, new Set(flip.accepted));
  const settings: Settings = readJson(new URL("./data/live-settings.json", import.meta.url));

  // Every run must hold every article, or the comparisons would not share a denominator.
  const answers: Record<string, Record<string, Answers>> = {};
  for (const [run, folder] of Object.entries(RUN_FOLDERS)) {
    answers[run] = {};
    for (const id of ids) {
      const file = new URL(`${id}.json`, folder);
      if (!existsSync(file)) throw new Error(`run ${run} has no answer for article ${id}`);
      answers[run][id] = readJson(file).answers;
    }
  }
  return { key, flips, settings, answers };
}

/**
 * What one headline run cost, from its stored usage fields.
 *
 * @param run  "headline_a" or "headline_b".
 * @param ids  The articles.
 * @returns Calls, JEV input tokens and dollars.
 */
function spendOf(run: string, ids: string[]) {
  let dollars = 0;
  let inputTokens = 0;
  for (const id of ids) {
    const usage = readJson(new URL(`${id}.json`, RUN_FOLDERS[run])).usage;
    dollars += usage?.dollars ?? 0;
    inputTokens += usage?.jev?.input_tokens ?? 0;
  }
  return { calls: ids.length, jev_input_tokens: inputTokens, dollars: Number(dollars.toFixed(4)) };
}

/**
 * Compares the runs on every group and writes the counts.
 */
function main(): void {
  const sideOf: Record<string, string> = readJson(new URL("split.json", GOLDEN)).articles;
  const articles: { id: string; subject: string; title: string }[] = readJson(new URL("articles-meta.json", GOLDEN));
  const summaries: Record<string, { adds_words: boolean; has_preview: boolean }> = readJson(new URL("./summaries.json", import.meta.url));
  const ids = articles.map((article) => article.id).filter((id) => sideOf[id] !== "test");
  const subjectOf = Object.fromEntries(articles.map((article) => [article.id, article.subject]));
  const namedIds = new Set(articles.filter((article) => headlineNamesHim(article.title, article.subject)).map((article) => article.id));
  const cyrillicIds = new Set(articles.filter((article) => /[\u0400-\u04FF]/.test(article.title)).map((article) => article.id));
  const context = loadContext(ids);

  // The groups: by side, by fighter, by whether the feed's preview added any word, whether the headline names him, and its script.
  const groups: Record<string, string[]> = {
    training: ids.filter((id) => sideOf[id] === "tune"),
    validation: ids.filter((id) => sideOf[id] === "check"),
    both_sides: ids,
    topuria: ids.filter((id) => subjectOf[id] === "Ilia Topuria"),
    amosov_and_donchenko: ids.filter((id) => subjectOf[id] !== "Ilia Topuria"),
    preview_adds_words: ids.filter((id) => summaries[id].adds_words),
    headline_alone: ids.filter((id) => !summaries[id].adds_words),
    headline_names_him: ids.filter((id) => namedIds.has(id)),
    headline_does_not_name_him: ids.filter((id) => !namedIds.has(id)),
    cyrillic_headline: ids.filter((id) => cyrillicIds.has(id)),
    latin_headline: ids.filter((id) => !cyrillicIds.has(id)),
  };
  const results: Record<string, unknown> = { settings_version: context.settings.version, classifier: CLASSIFIER_VERSION, note: "training = split 'tune', validation = split 'check'; no test-side article was sent or read" };
  for (const [name, groupIds] of Object.entries(groups)) results[name] = report(groupIds, context);

  // The spend of this experiment's own runs, from the stored usage fields, per run and in all.
  const perRun = Object.fromEntries(["headline_a", "headline_b"].map((run) => [run, spendOf(run, ids)]));
  const dollars = perRun.headline_a.dollars + perRun.headline_b.dollars;
  const inputTokens = perRun.headline_a.jev_input_tokens + perRun.headline_b.jev_input_tokens;
  results.cost = { calls: ids.length * 2, jev_input_tokens: inputTokens, dollars: Number(dollars.toFixed(4)), per_run: perRun };
  writeFileSync(OUT, JSON.stringify(results, null, 1) + "\n");
  console.log(JSON.stringify(results, null, 1));
}

main();
