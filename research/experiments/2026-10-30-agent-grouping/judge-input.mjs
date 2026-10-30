// Joins the readers' answers into one file per week for the judge: every
// claim, in order, with one short line per reading (what the reader said the
// article is), and nothing of the maintainer's marks. Refuses while a batch
// is unread, so the judge never sees half a week. A reading already called in
// an earlier week (a claim that spans both) carries that call, so the weeks
// agree unless the new readings change the picture.
//
// Usage: node research/experiments/2026-10-30-agent-grouping/judge-input.mjs 2026-09-28

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const monday = process.argv[2];
const week = JSON.parse(readFileSync(join(here, "data", `week-${monday}.json`), "utf8"));
const folder = join(here, "data", `batches-${monday}`);

// Every reader's answer, by reading; a batch without one stops the run.
const answers = new Map();
for (const name of readdirSync(folder).filter((file) => file.endsWith(".in.json"))) {
  const out = join(folder, name.replace(".in.json", ".out.json"));
  if (!existsSync(out)) throw new Error(`${name} is not read yet`);
  for (const answer of JSON.parse(readFileSync(out, "utf8"))) answers.set(String(answer.reading_id), answer);
}

// Calls made in earlier weeks, by claim and reading.
const earlierCalls = new Map();
for (const name of readdirSync(join(here, "data")).filter((file) => /^judge-out-.*\.json$/.test(file) && file !== `judge-out-${monday}.json`)) {
  for (const call of JSON.parse(readFileSync(join(here, "data", name), "utf8")).readings) earlierCalls.set(`${call.claim_id}:${call.reading_id}`, { verdict: call.verdict, belongs_in_claim_id: call.belongs_in_claim_id });
}

// The week as the judge sees it: claims, their readings, the reader's line on each.
const claims = week.claims.map((claim) => ({
  claim_id: claim.id,
  fighter: claim.fighter,
  label: claim.current_label,
  readings: claim.readings.map((reading) => {
    const answer = answers.get(String(reading.reading_id));
    if (!answer) throw new Error(`reading ${reading.reading_id} has no reader's answer`);
    const { reading_id, claim_id, ...said } = answer;
    const earlier_call = earlierCalls.get(`${claim.id}:${reading.reading_id}`);
    return { reading_id: String(reading.reading_id), published: String(reading.published_at).slice(0, 10), outlet: reading.outlet, headline: reading.headline, ...said, ...(earlier_call ? { earlier_call } : {}) };
  }),
}));
const file = join(here, "data", `judge-in-${monday}.json`);
writeFileSync(file, JSON.stringify({ week: monday, claims }, null, 1));
console.log(`${claims.length} claims, ${answers.size} readings → ${file}`);
