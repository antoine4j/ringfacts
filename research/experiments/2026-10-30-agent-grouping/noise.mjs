// The noise floor: a second, independent judge run on the same week's reader
// lines (data/rerun-judge-<monday>.json), set against the first. Says how
// often two runs make the same call, and how each does against the
// maintainer's marks, so a difference between runs or prompts can be read
// against it.
//
// Usage: node research/experiments/2026-10-30-agent-grouping/noise.mjs 2026-09-28

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const monday = process.argv[2];
const read = (name) => JSON.parse(readFileSync(join(here, "data", name), "utf8"));
const first = read(`judge-out-${monday}.json`);
const second = read(`rerun-judge-${monday}.json`);
const week = read(`week-${monday}.json`);

/**
 * A call in a comparable form.
 *
 * @param call  A reading call.
 * @returns "verdict" or "verdict → claim".
 */
function said(call) {
  return call.verdict + (call.belongs_in_claim_id ? ` → ${call.belongs_in_claim_id}` : "");
}

// Run against run: the verdict alone, and the verdict with the claim it names.
const byKey = (file) => new Map(file.readings.map((call) => [`${call.claim_id}:${call.reading_id}`, call]));
const one = byKey(first);
const two = byKey(second);
let sameVerdict = 0;
let sameCall = 0;
let movedBoth = 0;
let movedEither = 0;
for (const [key, call] of one) {
  const other = two.get(key);
  if (!other) continue;
  if (call.verdict === other.verdict) sameVerdict++;
  if (said(call) === said(other)) sameCall++;
  if (call.verdict !== "belongs" || other.verdict !== "belongs") movedEither++;
  if (call.verdict !== "belongs" && other.verdict !== "belongs") movedBoth++;
}

// Same-claim links: how many pairs both runs made.
const pairs = (file) => new Set(file.same_claims.map((call) => [String(call.claim_id), String(call.other_claim_id)].sort().join(":")));
const linksOne = pairs(first);
const linksTwo = pairs(second);
const linksBoth = [...linksOne].filter((pair) => linksTwo.has(pair)).length;

// Each run against the maintainer.
const againstAnton = (calls) => week.anton.marks.filter((mark) => calls.get(`${mark.claim_id}:${mark.reading_id}`) && said(calls.get(`${mark.claim_id}:${mark.reading_id}`)) === said(mark)).length;

console.log(`readings: ${one.size}`);
console.log(`same verdict: ${sameVerdict} (${((100 * sameVerdict) / one.size).toFixed(1)}%); same call incl. the claim named: ${sameCall} (${((100 * sameCall) / one.size).toFixed(1)}%)`);
console.log(`not "belongs" in either run: ${movedEither}; in both: ${movedBoth}`);
console.log(`same-claim links: first ${linksOne.size}, second ${linksTwo.size}, both ${linksBoth}`);
console.log(`against the maintainer's ${week.anton.marks.length} marks: first ${againstAnton(one)}, second ${againstAnton(two)}`);
