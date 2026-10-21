// Step 2 of 3.11: what clean text changes. Compares the stored runs, article
// by article, and scores each kind of text against the labels. Only ids and
// counts come out, never article text; on the test side, counts only.
//
//   node compare.ts            # prints the counts and writes results.json
//
// Three kinds of text, from two runs (run.ts):
//   saved        v0's saved text (run saved-a)
//   clean        3.12's clean text (run clean-a; saved-a where the clean text is the saved one or nothing usable)
//   production   Readability where code alone accepted it, else the saved text (clean-a there, saved-a elsewhere)
// The noise floor is saved-a against saved-b: the same saved text, sent twice.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { decideTier, type Settings } from "../../../v0/pipeline/settings/tiers.ts";
import { CLASSIFIER_VERSION } from "../../../v0/pipeline/stations/classifier/classifier.ts";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const RUNS = new URL("./data/runs/", import.meta.url);
const OUT = new URL("./results.json", import.meta.url);
const QUESTIONS = ["centrality", "source", "act", "fact", "firmness", "reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"];
const CAREER_FACTS = new Set(["result", "next_fight", "health"]);
const EXTRACT_FIELDS = ["kind", "actor", "opponent", "event", "date"];
const TIER_NAMES: Record<number, string> = { 1: "post", 2: "digest", 3: "drop" };

type Stored = { answers: Record<string, string>; extract: Record<string, string | null>; usage: { dollars: number } };

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
 * One stored answer, or null when that run did not send the article.
 *
 * @param run  The run's name.
 * @param id  The article id.
 * @returns The stored answers.
 */
function stored(run: string, id: string): Stored | null {
  const file = new URL(`${run}/${id}.json`, RUNS);
  return existsSync(file) ? readJson(file) : null;
}

/**
 * A detail field as compared: trimmed, lower-cased, a missing one empty.
 *
 * @param value
 * @returns The compared form.
 */
function normal(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * What differs between two answers to the same article.
 *
 * @param first  One run's answers.
 * @param second  The other's.
 * @param settings  The decider's settings.
 * @returns The changed questions, extract fields, tiers and career-fact moves.
 */
function difference(first: Stored, second: Stored, settings: Settings) {
  const questions = QUESTIONS.filter((question) => first.answers[question] !== second.answers[question]);
  const extractFields = EXTRACT_FIELDS.filter((field) => normal(first.extract[field]) !== normal(second.extract[field]));
  const tierFirst = decideTier(first.answers, CLASSIFIER_VERSION, settings).tier;
  const tierSecond = decideTier(second.answers, CLASSIFIER_VERSION, settings).tier;
  const careerFirst = CAREER_FACTS.has(first.answers.fact);
  const careerSecond = CAREER_FACTS.has(second.answers.fact);
  return {
    questions,
    extractChanged: extractFields.length > 0,
    extractFields,
    claimReworded: normal(first.extract.claim) !== normal(second.extract.claim),
    tierMove: tierFirst === tierSecond ? null : `${TIER_NAMES[tierFirst]} → ${TIER_NAMES[tierSecond]}`,
    careerLost: careerFirst && !careerSecond,
    careerInvented: !careerFirst && careerSecond,
  };
}

/**
 * Totals of the differences over a set of articles.
 *
 * @param pairs  Article id with its two answers.
 * @param settings  The decider's settings.
 * @param nameArticles  True on the training side only: the test side is counts only.
 * @returns The counts, and on the training side which articles moved.
 */
function tally(pairs: { id: string; first: Stored; second: Stored }[], settings: Settings, nameArticles: boolean) {
  const perQuestion: Record<string, number> = {};
  const tierMoves: Record<string, number> = {};
  const extractFields: Record<string, number> = {};
  let articlesWithAnswerChange = 0;
  let answersChanged = 0;
  let extractsChanged = 0;
  let claimsReworded = 0;
  let careerLost = 0;
  let careerInvented = 0;
  const moved: string[] = [];
  for (const { id, first, second } of pairs) {
    const change = difference(first, second, settings);

    // Add this article's changes to every total it belongs to.
    for (const question of change.questions) perQuestion[question] = (perQuestion[question] ?? 0) + 1;
    for (const field of change.extractFields) extractFields[field] = (extractFields[field] ?? 0) + 1;
    if (change.questions.length > 0) articlesWithAnswerChange += 1;
    answersChanged += change.questions.length;
    if (change.extractChanged) extractsChanged += 1;
    if (change.claimReworded) claimsReworded += 1;
    if (change.tierMove) tierMoves[change.tierMove] = (tierMoves[change.tierMove] ?? 0) + 1;
    if (change.careerLost) careerLost += 1;
    if (change.careerInvented) careerInvented += 1;
    if (change.tierMove || change.careerLost || change.careerInvented) moved.push(id);
  }
  const tierCrossings = Object.values(tierMoves).reduce((sum, count) => sum + count, 0);
  return {
    articles: pairs.length,
    answers: pairs.length * QUESTIONS.length,
    articles_with_an_answer_change: articlesWithAnswerChange,
    answers_changed: answersChanged,
    answers_changed_per_question: perQuestion,
    extracts_changed: extractsChanged,
    extract_fields_changed: extractFields,
    claims_reworded: claimsReworded,
    tier_crossings: tierCrossings,
    tier_moves: tierMoves,
    career_fact_lost: careerLost,
    career_fact_invented: careerInvented,
    ...(nameArticles ? { articles_that_crossed_a_tier_or_moved_a_career_fact: moved } : {}),
  };
}

/**
 * One kind of text's score against the labels: answers right, all nine right,
 * and the career-fact marks of replay-score.ts.
 *
 * @param rows  Article id with the answers that kind of text got.
 * @param key  Article id → the labelled answers.
 * @param flips  "id question" → the values accepted on a coin flip.
 * @returns The score.
 */
function score(rows: { id: string; answers: Record<string, string> }[], key: Record<string, Record<string, string>>, flips: Map<string, Set<string>>) {
  const right: Record<string, number> = {};
  let allNine = 0;
  let answersRight = 0;
  for (const row of rows) {
    let rightHere = 0;
    for (const question of QUESTIONS) {
      const accepted = flips.get(`${row.id} ${question}`) ?? new Set([key[row.id][question]]);
      const isRight = accepted.has(row.answers[question]);
      right[question] = (right[question] ?? 0) + (isRight ? 1 : 0);
      rightHere += isRight ? 1 : 0;
    }
    answersRight += rightHere;
    if (rightHere === QUESTIONS.length) allNine += 1;
  }

  // Career facts: labelled ones recognised, and false alarms on articles labelled without one.
  const career = rows.filter((row) => CAREER_FACTS.has(key[row.id].fact));
  const quiet = rows.filter((row) => !CAREER_FACTS.has(key[row.id].fact));
  return {
    articles: rows.length,
    all_nine_right: allNine,
    answers_right: `${answersRight} of ${rows.length * QUESTIONS.length}`,
    right_per_question: right,
    career_facts_recognised: `${career.filter((row) => CAREER_FACTS.has(row.answers.fact)).length} of ${career.length}`,
    career_false_alarms: quiet.filter((row) => CAREER_FACTS.has(row.answers.fact)).length,
  };
}

/**
 * The answers one kind of text got for one article.
 *
 * @param kind  "saved", "saved_again" (the noise run), "clean" or "production".
 * @param id  The article id.
 * @param productionIds  The articles whose production-like text is Readability's.
 * @returns The stored answers.
 */
function answersFor(kind: string, id: string, productionIds: Set<string>): Stored {
  const saved = stored("saved-a", id) as Stored;
  const clean = stored("clean-a", id);
  if (kind === "saved") return saved;
  if (kind === "saved_again") return (stored("saved-b", id) as Stored) ?? saved;
  if (kind === "clean") return clean ?? saved;
  return productionIds.has(id) && clean ? clean : saved;
}

/**
 * Compares the runs and writes the counts.
 */
function main(): void {
  const articles: { id: string }[] = readJson(new URL("articles.json", GOLDEN));
  const sideOf: Record<string, string> = readJson(new URL("split.json", GOLDEN)).articles;
  const settings: Settings = readJson(new URL("./data/live-settings.json", import.meta.url));
  const readability = readJson(new URL("./data/readability.json", import.meta.url));
  const key: Record<string, Record<string, string>> = {};
  for (const [id, label] of Object.entries(readJson(new URL("labels.json", GOLDEN)).articles as Record<string, { answers: Record<string, string> }>)) key[id] = label.answers;
  const flips = new Map<string, Set<string>>();
  for (const flip of readJson(new URL("coin-flips.json", GOLDEN)).flips) flips.set(`${flip.id} ${flip.question}`, new Set(flip.accepted));
  const productionIds = new Set(articles.map((article) => article.id).filter((id) => readability[id].kept));
  const sides = { training: (id: string) => sideOf[id] !== "test", test: (id: string) => sideOf[id] === "test" };
  const results: Record<string, unknown> = { settings_version: settings.version, classifier: CLASSIFIER_VERSION };

  // The noise floor: the same saved text, sent twice.
  const noisePairs = articles.map((article) => ({ id: article.id, first: stored("saved-a", article.id), second: stored("saved-b", article.id) })).filter((pair) => pair.first && pair.second) as { id: string; first: Stored; second: Stored }[];
  results.noise_floor = { training: tally(noisePairs.filter((pair) => sides.training(pair.id)), settings, true), test: tally(noisePairs.filter((pair) => sides.test(pair.id)), settings, false), all: tally(noisePairs, settings, false) };

  // The same noise, on exactly the articles each comparison below covers, so each delta has its own floor.
  const onClean = noisePairs.filter((pair) => stored("clean-a", pair.id));
  const onProduction = onClean.filter((pair) => productionIds.has(pair.id));
  results.noise_floor_on_clean_articles = { training: tally(onClean.filter((pair) => sides.training(pair.id)), settings, false), test: tally(onClean.filter((pair) => sides.test(pair.id)), settings, false), all: tally(onClean, settings, false) };
  results.noise_floor_on_production_articles = { all: tally(onProduction, settings, false) };

  // Saved against clean, and saved against production-like, on the articles where the text differs.
  for (const kind of ["clean", "production"]) {
    const pairs = articles
      .filter((article) => stored("clean-a", article.id) && (kind === "clean" || productionIds.has(article.id)))
      .map((article) => ({ id: article.id, first: answersFor("saved", article.id, productionIds), second: answersFor(kind, article.id, productionIds) }));
    results[`saved_vs_${kind}`] = { training: tally(pairs.filter((pair) => sides.training(pair.id)), settings, true), test: tally(pairs.filter((pair) => sides.test(pair.id)), settings, false), all: tally(pairs, settings, false) };
  }

  // Each kind of text scored against the labels, side by side; the saved text sent again shows the score's own noise.
  const scores: Record<string, unknown> = {};
  for (const kind of ["saved", "saved_again", "clean", "production"]) {
    const rows = articles.map((article) => ({ id: article.id, answers: answersFor(kind, article.id, productionIds).answers }));
    scores[kind] = { training: score(rows.filter((row) => sides.training(row.id)), key, flips), test: score(rows.filter((row) => sides.test(row.id)), key, flips) };
  }
  results.scores = scores;
  writeFileSync(OUT, JSON.stringify(results, null, 1) + "\n");
  console.log(JSON.stringify(results, null, 1));
}

main();
