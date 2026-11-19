// Turns the judge's calls into the storyboard's agent-marks file, after
// checking them against the week (every reading called once, named claims of
// the same fighter), and counts where they differ from the maintainer's own
// marks. The disagreements are listed in data/ (they carry headlines next to
// the article text's paraphrase); the counts go in the README.
//
// Usage: node research/experiments/2026-10-30-agent-grouping/build-marks.mjs 2026-09-28 "<who made the calls>"

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [monday, madeBy = "agents"] = process.argv.slice(2);
const week = JSON.parse(readFileSync(join(here, "data", `week-${monday}.json`), "utf8"));
const judged = JSON.parse(readFileSync(join(here, "data", `judge-out-${monday}.json`), "utf8"));

// What the week holds: each claim's fighter, each reading's claim.
const fighterOf = new Map(week.claims.map((claim) => [String(claim.id), claim.fighter]));
const expected = new Set(week.claims.flatMap((claim) => claim.readings.map((reading) => `${claim.id}:${reading.reading_id}`)));
const headlineOf = new Map(week.claims.flatMap((claim) => claim.readings.map((reading) => [String(reading.reading_id), reading.headline])));

// Every call checked; one that names a claim of another fighter, or outside the week, loses the claim it names.
const problems = [];
const readings = judged.readings.map((call) => {
  const out = { claim_id: String(call.claim_id), reading_id: String(call.reading_id), verdict: call.verdict, belongs_in_claim_id: call.belongs_in_claim_id ? String(call.belongs_in_claim_id) : null, why: call.why, confidence: call.confidence };
  if (!expected.delete(`${out.claim_id}:${out.reading_id}`)) problems.push(`not in the week, or called twice: ${out.claim_id}:${out.reading_id}`);
  if (!["belongs", "does_not_belong", "own_claim"].includes(out.verdict)) problems.push(`unknown verdict ${out.verdict}`);
  if (out.belongs_in_claim_id && (out.verdict !== "does_not_belong" || fighterOf.get(out.belongs_in_claim_id) !== fighterOf.get(out.claim_id) || out.belongs_in_claim_id === out.claim_id)) {
    problems.push(`${out.claim_id}:${out.reading_id} names #${out.belongs_in_claim_id}; dropped`);
    out.belongs_in_claim_id = null;
  }
  return out;
});
for (const missing of expected) problems.push(`no call for ${missing}`);
const same_claims = judged.same_claims
  .map((call) => ({ claim_id: String(call.claim_id), other_claim_id: String(call.other_claim_id), why: call.why, confidence: call.confidence }))
  .filter((call) => {
    const ok = call.claim_id !== call.other_claim_id && fighterOf.get(call.claim_id) && fighterOf.get(call.claim_id) === fighterOf.get(call.other_claim_id);
    if (!ok) problems.push(`same-claim ${call.claim_id}–${call.other_claim_id} dropped`);
    return ok;
  });

const file = join(here, "data", `agent-marks-${monday}.json`);
writeFileSync(file, JSON.stringify({ week: monday, made_by: madeBy, readings, same_claims }, null, 1));

// Against the maintainer's marks: the same call, or a different one.
const callOf = new Map(readings.map((call) => [`${call.claim_id}:${call.reading_id}`, call]));
const differ = [];
let agree = 0;
for (const mark of week.anton.marks) {
  const call = callOf.get(`${mark.claim_id}:${mark.reading_id}`);
  if (!call) continue;
  const same = call.verdict === mark.verdict && (call.belongs_in_claim_id ?? null) === (mark.belongs_in_claim_id ?? null);
  if (same) agree++;
  else differ.push({ mark, call });
}
const links = new Set(week.anton.links.map((link) => [link.claim_id, link.other_claim_id].sort().join(":")));
const linkedToo = same_claims.filter((call) => links.has([call.claim_id, call.other_claim_id].sort().join(":"))).length;

// The counts, and the list for the maintainer.
const count = (verdict) => readings.filter((call) => call.verdict === verdict).length;
const lines = [
  `# Agent calls against the maintainer's marks, week of ${monday}`,
  "",
  `Calls: ${readings.length} (belongs ${count("belongs")}, does not belong ${count("does_not_belong")}, own claim ${count("own_claim")}); same-claim links ${same_claims.length}.`,
  `Maintainer's marks on these readings: ${week.anton.marks.length}; the agents' call is the same on ${agree}, different on ${differ.length}.`,
  `Maintainer's same-claim links in the week: ${links.size}; the agents made ${linkedToo} of them.`,
  problems.length ? `\nProblems fixed or dropped:\n${problems.map((problem) => `- ${problem}`).join("\n")}` : "",
  "",
  "## Where they differ",
  "",
  ...differ.map(({ mark, call }) => `- #${mark.claim_id} reading ${mark.reading_id} (${headlineOf.get(String(mark.reading_id))}): maintainer **${mark.verdict}${mark.belongs_in_claim_id ? ` → #${mark.belongs_in_claim_id}` : ""}**, agents **${call.verdict}${call.belongs_in_claim_id ? ` → #${call.belongs_in_claim_id}` : ""}** (${call.confidence}): ${call.why}`),
];
writeFileSync(join(here, "data", `compare-${monday}.md`), lines.join("\n") + "\n");
console.log(lines.slice(0, 6).join("\n"));

// Every week's calls in one file for the storyboard. For a reading called in
// two weeks the earlier call stands, unless the later one names a claim to
// move it to: the later judge saw claims the earlier one could not, and
// could not name claims outside its own week.
const weeks = readdirSync(join(here, "data")).filter((name) => /^agent-marks-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
const combined = { week: weeks.map((name) => name.slice(12, 22)).join(", "), made_by: madeBy, readings: [], same_claims: [] };
const seen = new Set();
const byReading = new Map();
for (const name of weeks) {
  const one = JSON.parse(readFileSync(join(here, "data", name), "utf8"));
  for (const call of one.readings) {
    const key = `${call.claim_id}:${call.reading_id}`;
    const before = byReading.get(key);
    if (!before || (call.belongs_in_claim_id && call.belongs_in_claim_id !== before.belongs_in_claim_id)) byReading.set(key, call);
  }
  for (const call of one.same_claims) {
    const pair = `s:${[call.claim_id, call.other_claim_id].sort().join(":")}`;
    if (!seen.has(pair) && seen.add(pair)) combined.same_claims.push(call);
  }
}
combined.readings = [...byReading.values()];
writeFileSync(join(here, "data", "agent-marks.json"), JSON.stringify(combined, null, 1));
console.log(`all weeks (${combined.week}): ${combined.readings.length} reading calls, ${combined.same_claims.length} same-claim links → data/agent-marks.json`);

// The joined calls against every mark the maintainer made on these weeks' claims.
const antonMarks = new Map();
const antonLinks = new Set();
for (const name of weeks) {
  const one = JSON.parse(readFileSync(join(here, "data", `week-${name.slice(12, 22)}.json`), "utf8"));
  for (const mark of one.anton.marks) antonMarks.set(`${mark.claim_id}:${mark.reading_id}`, mark);
  for (const link of one.anton.links) antonLinks.add([link.claim_id, link.other_claim_id].sort().join(":"));
}
const joined = new Map(combined.readings.map((call) => [`${call.claim_id}:${call.reading_id}`, call]));
let joinedSame = 0;
for (const [key, mark] of antonMarks) {
  const call = joined.get(key);
  if (call && call.verdict === mark.verdict && (call.belongs_in_claim_id ?? null) === (mark.belongs_in_claim_id ?? null)) joinedSame++;
}
const linksMade = [...antonLinks].filter((pair) => combined.same_claims.some((call) => [call.claim_id, call.other_claim_id].sort().join(":") === pair)).length;
console.log(`all weeks against the maintainer: the same call on ${joinedSame} of his ${antonMarks.size} marks; ${linksMade} of his ${antonLinks.size} same-claim links made`);
