// Joins the three judges' calls into the storyboard's file: for every reading
// of every judged week, each judge's call and how far they agree; for every
// pair of claims any judge linked, who linked it. Each call is checked against
// the week first (every reading called once, named claims of the same
// fighter). The storyboard shows the calls in violet and never counts them as
// the maintainer's; confirming a call saves the majority's call as his own
// mark. The file names headlines nowhere, but its `why` lines paraphrase the
// articles, so it stays in data/.
//
// Usage: node research/experiments/2026-11-05-three-judges/build-marks.mjs [opus,fable,sonnet]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { majority } from "./stats.mjs";
import { VERDICTS } from "./values.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const models = (process.argv[2] ?? "opus,fable,sonnet").split(",");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

/**
 * A call in a comparable form.
 *
 * @param call  A reading call.
 * @returns "verdict" or "verdict→claim".
 */
export function said(call) {
  return call.verdict + (call.belongs_in_claim_id ? `→${call.belongs_in_claim_id}` : "");
}

/**
 * One judge's calls on one week, checked against the week.
 *
 * @param week  The exported week.
 * @param judged  The judge's output.
 * @param problems  Where to add what was fixed or dropped.
 * @returns Reading calls and same-claim calls, ids as strings.
 */
export function checkedCalls(week, judged, problems) {
  const fighterOf = new Map(week.claims.map((claim) => [String(claim.id), claim.fighter]));
  const expected = new Set(week.claims.flatMap((claim) => claim.readings.map((reading) => `${claim.id}:${reading.reading_id}`)));
  const readings = [];
  for (const call of judged.readings) {
    const out = { claim_id: String(call.claim_id), reading_id: String(call.reading_id), verdict: call.verdict, belongs_in_claim_id: call.belongs_in_claim_id ? String(call.belongs_in_claim_id) : null, why: call.why ?? "", rule: Number(call.rule ?? 0), confidence: call.confidence ?? "medium" };
    if (!expected.delete(`${out.claim_id}:${out.reading_id}`)) { problems.push(`not in the week, or called twice: ${out.claim_id}:${out.reading_id}`); continue; }
    if (!VERDICTS.includes(out.verdict)) { problems.push(`unknown verdict ${out.verdict} on ${out.claim_id}:${out.reading_id}`); continue; }
    if (out.belongs_in_claim_id && (out.verdict !== "does_not_belong" || fighterOf.get(out.belongs_in_claim_id) !== fighterOf.get(out.claim_id) || out.belongs_in_claim_id === out.claim_id)) {
      problems.push(`${out.claim_id}:${out.reading_id} names #${out.belongs_in_claim_id}; dropped`);
      out.belongs_in_claim_id = null;
    }
    readings.push(out);
  }
  for (const missing of expected) problems.push(`no call for ${missing}`);
  const same_claims = (judged.same_claims ?? [])
    .map((call) => ({ claim_id: String(call.claim_id), other_claim_id: String(call.other_claim_id), why: call.why ?? "", rule: Number(call.rule ?? 0), confidence: call.confidence ?? "medium" }))
    .filter((call) => {
      const ok = call.claim_id !== call.other_claim_id && fighterOf.get(call.claim_id) && fighterOf.get(call.claim_id) === fighterOf.get(call.other_claim_id);
      if (!ok) problems.push(`same-claim ${call.claim_id}–${call.other_claim_id} dropped`);
      return ok;
    });
  return { readings, same_claims, cores: Object.fromEntries((judged.claims ?? []).map((claim) => [String(claim.claim_id), claim.core])) };
}

/**
 * Joins every model's checked calls into one record per reading and per claim pair.
 *
 * @param byModel  Model → its checked calls over every week, newest week last.
 * @param modelNames  The models, in order.
 * @returns The storyboard file's body.
 */
export function joinCalls(byModel, modelNames) {
  // Per reading: the newest call each model made (a later week's judge saw more claims).
  const readings = new Map();
  for (const model of modelNames) {
    for (const call of byModel[model]?.readings ?? []) {
      const key = `${call.claim_id}:${call.reading_id}`;
      const entry = readings.get(key) ?? readings.set(key, { claim_id: call.claim_id, reading_id: call.reading_id, calls: {} }).get(key);
      const before = entry.calls[model];
      if (!before || (call.belongs_in_claim_id && call.belongs_in_claim_id !== before.belongs_in_claim_id)) entry.calls[model] = call;
    }
  }
  for (const entry of readings.values()) {
    const votes = modelNames.map((model) => entry.calls[model]).filter(Boolean).map(said);
    const best = majority(votes);
    entry.judges = votes.length;
    entry.agreement = !best ? "none" : best.unanimous ? "unanimous" : best.count > votes.length / 2 ? "majority" : "split";
    const lead = best && best.count > votes.length / 2 ? modelNames.map((model) => entry.calls[model]).find((call) => call && said(call) === best.answer) : null;
    entry.majority = lead ? { verdict: lead.verdict, belongs_in_claim_id: lead.belongs_in_claim_id } : null;
    entry.proposes_change = Boolean(entry.majority && entry.majority.verdict !== "belongs");
  }

  // Per claim pair: who linked it.
  const pairs = new Map();
  for (const model of modelNames) {
    for (const call of byModel[model]?.same_claims ?? []) {
      const [a, b] = [call.claim_id, call.other_claim_id].sort((x, y) => Number(x) - Number(y));
      const key = `${a}:${b}`;
      const entry = pairs.get(key) ?? pairs.set(key, { claim_id: a, other_claim_id: b, calls: {} }).get(key);
      entry.calls[model] = call;
    }
  }
  for (const entry of pairs.values()) {
    const count = Object.keys(entry.calls).length;
    entry.judges = count;
    entry.agreement = count === modelNames.length ? "unanimous" : count > modelNames.length / 2 ? "majority" : "minority";
  }
  return { readings: [...readings.values()], same_claims: [...pairs.values()] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const weeks = readdirSync(join(here, "data", "history")).filter((name) => /^week-\d{4}-\d{2}-\d{2}\.json$/.test(name)).map((name) => name.slice(5, 15)).sort();
  const byModel = {};
  const problems = [];
  const judgedWeeks = new Set();
  for (const model of models) {
    byModel[model] = { readings: [], same_claims: [], cores: {} };
    for (const monday of weeks) {
      const file = join(here, "data", model, `judge-out-${monday}.json`);
      if (!existsSync(file)) continue;
      judgedWeeks.add(monday);
      const week = read(join(here, "data", "history", `week-${monday}.json`));
      const before = problems.length;
      const checked = checkedCalls(week, read(file), problems);
      if (problems.length > before) console.log(`${model} ${monday}: ${problems.length - before} problem(s) fixed or dropped`);
      byModel[model].readings.push(...checked.readings);
      byModel[model].same_claims.push(...checked.same_claims);
      Object.assign(byModel[model].cores, checked.cores);
    }
  }
  const joined = joinCalls(byModel, models);
  const file = { made_by: `three judges (${models.join(", ")}), ${new Date().toISOString().slice(0, 10)}`, weeks: [...judgedWeeks].sort(), judges: models, ...joined, cores: Object.fromEntries(models.map((model) => [model, byModel[model].cores])) };
  mkdirSync(join(here, "data", "marks"), { recursive: true });
  writeFileSync(join(here, "data", "marks", "three-judges.json"), JSON.stringify(file, null, 1));
  writeFileSync(join(here, "data", "marks", "problems.txt"), problems.join("\n") + "\n");
  const count = (agreement) => joined.readings.filter((entry) => entry.agreement === agreement).length;
  console.log(`${file.weeks.length} week(s), ${joined.readings.length} readings: unanimous ${count("unanimous")}, majority ${count("majority")}, split ${count("split")}; ${joined.same_claims.length} claim pairs linked by someone; ${problems.length} problems → data/marks/three-judges.json`);
}
