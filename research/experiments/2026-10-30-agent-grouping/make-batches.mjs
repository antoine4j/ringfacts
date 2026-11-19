// Cuts an exported week into reading batches of a fixed size, in claim order,
// each reading with its claim's label, so one agent reads one batch. Batches
// that already have an answer file are left alone, so a later run resumes.
// A reading already read for an earlier week (a claim that spans both) is not
// read again: its answer is copied into this week's reused.out.json.
// The maintainer's marks are not in the batches: the agents decide blind.
//
// Usage: node research/experiments/2026-10-30-agent-grouping/make-batches.mjs 2026-09-28

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BATCH_SIZE = 25;
const BODY_MAX = 3500;
const monday = process.argv[2];
const week = JSON.parse(readFileSync(join(here, "data", `week-${monday}.json`), "utf8"));

// Readers' answers from other weeks, by reading.
const folder = join(here, "data", `batches-${monday}`);
const earlier = new Map();
for (const other of readdirSync(join(here, "data")).filter((name) => name.startsWith("batches-") && name !== `batches-${monday}`)) {
  for (const name of readdirSync(join(here, "data", other)).filter((file) => file.endsWith(".out.json"))) {
    for (const answer of JSON.parse(readFileSync(join(here, "data", other, name), "utf8"))) earlier.set(String(answer.reading_id), answer);
  }
}

// Every reading, in claim order, with what the agent needs to read it.
const all = week.claims.flatMap((claim) =>
  claim.readings.map((reading) => ({
    reading_id: reading.reading_id,
    claim_id: claim.id,
    fighter: claim.fighter,
    claim_label: claim.current_label,
    published: reading.published_at,
    outlet: reading.outlet,
    headline: reading.headline,
    extract: reading.extract ? { claim: reading.extract.claim, occasion: reading.extract.occasion, date: reading.extract.date } : null,
    body: reading.body ? reading.body.slice(0, BODY_MAX) : null,
  })),
);

// Those read before are reused, with this week's claim; the rest are batched.
mkdirSync(folder, { recursive: true });
const reused = all.filter((reading) => earlier.has(String(reading.reading_id))).map((reading) => ({ ...earlier.get(String(reading.reading_id)), claim_id: reading.claim_id }));
writeFileSync(join(folder, "reused.out.json"), JSON.stringify(reused, null, 1));
writeFileSync(join(folder, "reused.in.json"), "[]");
const readings = all.filter((reading) => !earlier.has(String(reading.reading_id)));

// Fixed-size batches, numbered from 1; one already answered is not rewritten.
let written = 0;
for (let start = 0, number = 1; start < readings.length; start += BATCH_SIZE, number++) {
  const name = `batch-${String(number).padStart(2, "0")}`;
  if (existsSync(join(folder, `${name}.out.json`))) continue;
  writeFileSync(join(folder, `${name}.in.json`), JSON.stringify(readings.slice(start, start + BATCH_SIZE), null, 1));
  written++;
}
console.log(`${all.length} readings, ${reused.length} read before; ${written} batches to read in ${folder}`);
