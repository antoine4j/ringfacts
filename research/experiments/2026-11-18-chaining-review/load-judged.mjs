// Loads the three judges' calls over every judged week exactly as
// ../2026-11-05-three-judges/history-judges.mjs does, so the claims counted here
// are the claims behind its over-merge figure. Read-only: the judges' data is
// read from the shared checkout and never written.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkedCalls, joinCalls } from "../2026-11-05-three-judges/build-marks.mjs";

export const MODELS = ["opus", "fable", "sonnet"];
export const JUDGES_DATA = process.env.THREE_JUDGES_DATA ?? "/Users/anton/Projects/fighter-bot/research/experiments/2026-11-05-three-judges/data";
// The newest week in the study. The week of 16 Nov was still being judged when this ran, so it is left out.
export const LAST_WEEK = process.env.LAST_WEEK ?? "2026-11-09";
export const OUT_DATA = process.env.REVIEW_DATA ?? "/Users/anton/Projects/fighter-bot/research/experiments/2026-11-18-chaining-review/data";

/**
 * Reads a JSON file.
 *
 * @param path  The file.
 * @returns The parsed content.
 */
export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Loads every week judged by all three models: the exported claims with their
 * readings, the pipeline's own answers, and the joined judge calls.
 *
 * @returns The weeks, the claims by id (with readings, text included), the pipeline rows by reading id, the joined calls, and each judge's one-line core per claim.
 */
export function loadJudged() {
  const historyFolder = join(JUDGES_DATA, "history");
  const historyFiles = readdirSync(historyFolder).filter((name) => /^week-\d{4}-\d{2}-\d{2}\.json$/.test(name));
  const allWeeks = historyFiles.map((name) => name.slice(5, 15)).sort();
  const weeks = allWeeks.filter((monday) => monday <= LAST_WEEK).filter((monday) => MODELS.every((model) => existsSync(join(JUDGES_DATA, model, `judge-out-${monday}.json`))));

  // Every claim's fighter, so a call may name a claim seen in an earlier week.
  const knownFighters = new Map();
  const claims = new Map();
  const pipeline = new Map();
  const byModel = Object.fromEntries(MODELS.map((model) => [model, { readings: [], same_claims: [], cores: {} }]));
  const problems = [];
  for (const monday of allWeeks) {
    const week = readJson(join(historyFolder, `week-${monday}.json`));
    for (const claim of week.claims) knownFighters.set(String(claim.id), claim.fighter);
  }

  // Each judged week: its claims, the pipeline's rows, and every model's checked calls.
  for (const monday of weeks) {
    const week = readJson(join(historyFolder, `week-${monday}.json`));
    const pipelineWeek = readJson(join(historyFolder, `pipeline-${monday}.json`));
    for (const claim of week.claims) {
      const before = claims.get(claim.id);
      if (!before || claim.readings.length >= before.readings.length) claims.set(claim.id, claim);
    }
    for (const row of pipelineWeek.readings) pipeline.set(row.reading_id, row);
    for (const model of MODELS) {
      const judged = readJson(join(JUDGES_DATA, model, `judge-out-${monday}.json`));
      const checked = checkedCalls(week, judged, problems, knownFighters);
      byModel[model].readings.push(...checked.readings);
      byModel[model].same_claims.push(...checked.same_claims);
      Object.assign(byModel[model].cores, checked.cores);
    }
  }
  const joined = joinCalls(byModel, MODELS);
  const cores = Object.fromEntries(MODELS.map((model) => [model, byModel[model].cores]));
  return { weeks, claims, pipeline, joined, cores, problems };
}
