// Joins one model's readers' answers into that model's judge file for a week:
// every claim, in order, with one short account per reading, and nothing of
// the maintainer's marks or the pipeline's answers. Refuses while a batch is
// unread, so the judge never sees half a week. A reading already called by
// this model's judge in an earlier week carries that call.
//
// Usage: node research/experiments/2026-11-05-three-judges/judge-input.mjs <model> 2026-09-28

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [model, monday] = process.argv.slice(2);
if (!model || !/^\d{4}-\d{2}-\d{2}$/.test(monday ?? "")) throw new Error("usage: judge-input.mjs <model> <monday>");
const week = JSON.parse(readFileSync(join(here, "data", "history", `week-${monday}.json`), "utf8"));
const root = join(here, "data", model);
const folder = join(root, `batches-${monday}`);

// Every reader's answer of this model, from every week's batches (a claim
// that spans weeks was read once); a batch of this week without one stops the run.
const answers = new Map();
for (const other of readdirSync(root).filter((name) => name.startsWith("batches-"))) {
  for (const name of readdirSync(join(root, other)).filter((file) => file.endsWith(".in.json"))) {
    const out = join(root, other, name.replace(".in.json", ".out.json"));
    if (!existsSync(out)) { if (other === `batches-${monday}`) throw new Error(`${model} ${monday}: ${name} is not read yet`); continue; }
    for (const answer of JSON.parse(readFileSync(out, "utf8"))) answers.set(String(answer.reading_id), answer);
  }
}

// This model's calls from earlier weeks, by claim and reading, oldest week
// first so the newest call wins. A week judged again after a later cut-off
// keeps its first judging in cut-<date>/: those calls count as earlier ones,
// for that week too, and a week's current judging wins over its first.
const earlierCalls = new Map();
const isJudged = (file) => /^judge-out-\d{4}-\d{2}-\d{2}\.json$/.test(file);
const sources = [
  ...readdirSync(root).filter((name) => /^cut-\d{4}-\d{2}-\d{2}$/.test(name))
    .flatMap((cut) => readdirSync(join(root, cut)).filter(isJudged).map((file) => ({ week: file.slice(10, 20), order: 0, path: join(root, cut, file) }))),
  ...readdirSync(root).filter((file) => isJudged(file) && file !== `judge-out-${monday}.json`).map((file) => ({ week: file.slice(10, 20), order: 1, path: join(root, file) })),
].sort((a, b) => a.week.localeCompare(b.week) || a.order - b.order);
for (const { path } of sources) {
  for (const call of JSON.parse(readFileSync(path, "utf8")).readings) {
    earlierCalls.set(`${call.claim_id}:${call.reading_id}`, { verdict: call.verdict, belongs_in_claim_id: call.belongs_in_claim_id });
  }
}

// The week as the judge sees it.
const SHOWN = ["occasion", "speaker", "occasion_date", "also", "centrality", "kind", "claim", "career_event", "body_problem"];
const claims = week.claims.map((claim) => ({
  claim_id: claim.id,
  fighter: claim.fighter,
  label: claim.current_label,
  readings: claim.readings.map((reading) => {
    const answer = answers.get(String(reading.reading_id));
    if (!answer) throw new Error(`${model} ${monday}: reading ${reading.reading_id} has no reader's answer`);
    const said = Object.fromEntries(SHOWN.filter((field) => field in answer).map((field) => [field, answer[field]]));
    const earlier_call = earlierCalls.get(`${claim.id}:${reading.reading_id}`);
    return { reading_id: String(reading.reading_id), published: String(reading.published_at).slice(0, 10), outlet: reading.outlet, headline: reading.headline, ...said, ...(earlier_call ? { earlier_call } : {}) };
  }),
}));
const file = join(root, `judge-in-${monday}.json`);
writeFileSync(file, JSON.stringify({ week: monday, claims }, null, 1));
console.log(`${model} ${monday}: ${claims.length} claims, ${answers.size} readings → ${file}`);
