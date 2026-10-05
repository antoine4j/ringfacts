// Classifier (4): one JEV call with the frozen v7.7 questions, then the four
// tie rules the labelling rules require. No database.
// The questions are the file scored on the golden set
// (experiments/2026-10-03-classifier-v7/classifier-v7/questions-r7.json); the
// ties are score.py's compose(), line for line.

import { readFileSync } from "node:fs";
import { z } from "zod";
import { postJson } from "../http.ts";

export const CLASSIFIER_VERSION = "v7.7";
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-1.13.0";
export const QUESTIONS = JSON.parse(readFileSync(new URL("./questions-v7.7.json", import.meta.url), "utf8"));

const LEVELS: Record<string, string[]> = {
  centrality: ["not_in_content", "only_mentioned", "one_of_several", "main_subject"],
  firmness: ["wish", "rumour", "reported", "official_or_done"],
};
const RENAMED: Record<string, string> = { nothing_regarding_him: "none_of_these", only_mentions_him: "none_of_these", other_fighter: "other_fighter_side" };
const FLAG_OF_FACT: Record<string, string> = { result: "reports_his_result", next_fight: "reports_his_next_fight", health: "reports_his_health" };
const YES_NO = z.enum(["yes", "no"]);

/** The nine answers of v7.7 once the ties are applied: the shape every stored row must have. */
export const AnswersV77 = z.object({
  centrality: z.enum(["not_in_content", "only_mentioned", "one_of_several", "main_subject"]),
  source: z.enum(["himself", "his_team", "his_manager", "opponent_side", "promotion", "other_fighter_side", "media", "fans", "no_one", "none_of_these"]),
  act: z.enum(["reports_an_event", "speaks_of_himself", "assesses_him", "predicts_his_fight", "calls_him_out", "answers_for_him", "steers_him", "gives_news_of_him", "none_of_these"]),
  fact: z.enum(["next_fight", "result", "fight_week_event", "health", "career_move", "personal_life", "status_update", "no_fact", "none_of_these"]),
  firmness: z.enum(["none", "wish", "rumour", "reported", "official_or_done"]),
  reports_his_result: YES_NO,
  reports_his_next_fight: YES_NO,
  reports_his_health: YES_NO,
  he_speaks: YES_NO,
}).strict();
export type Answers = z.infer<typeof AnswersV77>;

/** One question's answer in JEV's reply. */
type RawAnswer = { type: "noul"; noul: number } | { type: "score"; score: number } | { type: "choice"; choice: string; probabilities: Record<string, number> };

/** What the classifier is shown of one reading. */
export type ClassifierInput = { fighter: string; headline: string; outlet: string; publishedAt: Date; body: string };

/**
 * One raw answer as a plain value, before any tie is applied.
 *
 * @param question  The question's name.
 * @param answer  JEV's answer to it.
 * @returns An option name, a level name, or "yes" / "no".
 */
export function plainValue(question: string, answer: RawAnswer): string {
  if (answer.type === "noul") return answer.noul >= 0.5 ? "yes" : "no";
  if (answer.type === "choice") return RENAMED[answer.choice] ?? answer.choice;
  const level = Math.min(3, Math.max(0, roundHalfToEven(answer.score)));
  return LEVELS[question][level];
}

/**
 * Rounds as Python's round() does, a half to the even neighbour (2.5 → 2),
 * so a score lands on the level it was scored at.
 *
 * @param value  A score.
 * @returns The nearest whole number.
 */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const isHalf = Math.abs(value - floor - 0.5) < 1e-9;
  if (!isHalf) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * The most likely option of a choice once one option is ruled out.
 *
 * @param answer  JEV's answer to a choice question.
 * @param without  The option ruled out.
 * @returns The next most likely option, renamed as the key names it.
 */
function nextBest(answer: RawAnswer, without: string): string {
  if (answer.type !== "choice") throw new Error("nextBest needs a choice answer");
  const rest = Object.entries(answer.probabilities).filter(([option]) => option !== without);
  rest.sort((first, second) => second[1] - first[1]);
  return RENAMED[rest[0][0]] ?? rest[0][0];
}

/**
 * The nine answers for one reading, with the ties the labelling rules require.
 *
 * @param raw  JEV's answers, by question.
 * @returns The answers, checked against the v7.7 shape.
 */
export function composeAnswers(raw: Record<string, RawAnswer>): Answers {
  const out: Record<string, string> = {};
  for (const question of Object.keys(AnswersV77.shape)) out[question] = plainValue(question, raw[question]);

  // He is not in the text: nothing is reported about him and he does not speak.
  if (out.centrality === "not_in_content") {
    out.fact = "no_fact";
    out.he_speaks = "no";
  }

  // No fact: nothing is firm, no news question is yes, and nobody gives news of him.
  if (out.fact === "no_fact") {
    out.firmness = "none";
    for (const flag of Object.values(FLAG_OF_FACT)) out[flag] = "no";
    if (out.act === "gives_news_of_him") out.act = nextBest(raw.act, "gives_news_of_him");
  }

  // A result, next fight or health fact answers its own yes/no question.
  if (out.fact in FLAG_OF_FACT) out[FLAG_OF_FACT[out.fact]] = "yes";

  // A result is an account of the fight: an event, with nobody as its source, and done.
  if (out.fact === "result") {
    out.source = "no_one";
    out.act = "reports_an_event";
    out.firmness = "official_or_done";
  }
  return AnswersV77.parse(out);
}

/**
 * Asks JEV the v7.7 questions about one reading.
 *
 * @param input  The fighter and the article.
 * @param apiKey  v0's JEV key.
 * @returns The answers with ties applied, and JEV's whole reply.
 */
export async function classify(input: ClassifierInput, apiKey: string): Promise<{ answers: Answers; raw: unknown }> {
  const state = {
    watched_fighter: input.fighter,
    headline: input.headline,
    outlet: input.outlet,
    published: input.publishedAt.toISOString().slice(0, 10),
    article_text: input.body,
  };
  const raw = await postJson(JEV_URL, { Authorization: `Bearer ${apiKey}` }, { state, model: JEV_MODEL, questions: QUESTIONS }, 180_000, "JEV");
  return { answers: composeAnswers(raw.answers), raw };
}
