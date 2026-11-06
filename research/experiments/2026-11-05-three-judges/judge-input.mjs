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

// Every reader's answer, by reading; a batch without one stops the run.
const answers = new Map();
for (const name of readdirSync(folder).filter((file) => file.endsWith(".in.json"))) {
  const out = join(folder, name.replace(".in.json", ".out.json"));
  if (!existsSync(out)) throw new Error(`${model} ${monday}: ${name} is not read yet`);
  for (const answer of JSON.parse(readFileSync(out, "utf8"))) answers.set(String(answer.reading_id), answer);
}

// This model's calls from earlier weeks, by claim and reading.
const earlierCalls = new Map();
for (const name of readdirSync(root).filter((file) => /^judge-out-\d{4}-\d{2}-\d{2}\.json$/.test(file) && file !== `judge-out-${monday}.json`)) {
  for (const call of JSON.parse(readFileSync(join(root, name), "utf8")).readings) {
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
