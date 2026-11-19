// Over-merge and over-split per week, as the scores page counts them
// (v0/storyboard/lib/scores.ts), twice: with the agents' calls as the marks,
// and with the maintainer's own marks where a claim is sealed (every reading
// marked). A claim belongs to a week when any of its readings was published
// in it, as on the scores page, so a claim can count in two weeks.
//
// Usage: node research/experiments/2026-10-30-agent-grouping/rates.mjs

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, "data");
const calls = JSON.parse(readFileSync(join(data, "agent-marks.json"), "utf8"));
const callOf = new Map(calls.readings.map((call) => [`${call.claim_id}:${call.reading_id}`, call]));
const agentLinked = new Set(calls.same_claims.flatMap((call) => [String(call.claim_id), String(call.other_claim_id)]));

/**
 * A share with its Wilson 95% range, in percent.
 *
 * @param count  How many.
 * @param of  Out of.
 * @returns Such as "12 of 300 = 4.0% (2.3–6.9)".
 */
function share(count, of) {
  if (of === 0) return "–";
  const z = 1.96;
  const p = count / of;
  const centre = (p + (z * z) / (2 * of)) / (1 + (z * z) / of);
  const half = (z * Math.sqrt((p * (1 - p)) / of + (z * z) / (4 * of * of))) / (1 + (z * z) / of);
  return `${count} of ${of} = ${(100 * p).toFixed(1)}% (${(100 * (centre - half)).toFixed(1)}–${(100 * (centre + half)).toFixed(1)})`;
}

/**
 * Both rates over a set of claims.
 *
 * @param claims  The claims, each with its readings.
 * @param marks  Claim:reading → the mark in force.
 * @param linked  Claims with a same-claim link.
 * @returns Over-merge and over-split as counts, over the sealed claims only.
 */
function rates(claims, marks, linked) {
  const sealed = claims.filter((claim) => claim.readings.every((reading) => marks.has(`${claim.id}:${reading.reading_id}`)));
  const readings = sealed.flatMap((claim) => claim.readings.map((reading) => marks.get(`${claim.id}:${reading.reading_id}`)));
  return {
    sealed: sealed.length,
    merge: [readings.filter((mark) => mark.verdict !== "belongs").length, readings.length],
    mergeMoved: readings.filter((mark) => mark.verdict === "does_not_belong").length,
    split: [sealed.filter((claim) => linked.has(String(claim.id))).length, sealed.length],
    ids: sealed.map((claim) => claim.id),
  };
}

// Every week, then all weeks together (each claim once).
const weeks = readdirSync(data).filter((name) => /^week-\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
const allClaims = new Map();
const antonMarks = new Map();
const antonLinked = new Set();
const rows = [];
for (const name of weeks) {
  const week = JSON.parse(readFileSync(join(data, name), "utf8"));
  for (const claim of week.claims) allClaims.set(claim.id, claim);
  for (const mark of week.anton.marks) antonMarks.set(`${mark.claim_id}:${mark.reading_id}`, mark);
  for (const link of week.anton.links) [link.claim_id, link.other_claim_id].forEach((id) => antonLinked.add(String(id)));
  rows.push([name.slice(5, 15), week.claims]);
}
rows.push(["all five", [...allClaims.values()]]);

for (const [label, claims] of rows) {
  const agents = rates(claims, callOf, agentLinked);
  const anton = rates(claims, antonMarks, antonLinked);
  const agentsOnHis = rates(claims.filter((claim) => anton.ids.includes(claim.id)), callOf, agentLinked);
  console.log(`\n${label}: ${claims.length} claims, ${claims.reduce((n, claim) => n + claim.readings.length, 0)} readings`);
  console.log(`  agents   over-merge ${share(...agents.merge)} [${agents.mergeMoved} to another claim]; over-split ${share(...agents.split)}`);
  console.log(`  maintainer (his ${anton.sealed} sealed claims) over-merge ${share(...anton.merge)}; over-split ${share(...anton.split)}`);
  console.log(`  agents on those same claims: over-merge ${share(...agentsOnHis.merge)}; over-split ${share(...agentsOnHis.split)}`);
}
