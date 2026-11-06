// Cuts an exported week into reading batches for one model's readers, in claim
// order, with the full saved text and nothing of what the pipeline or the
// maintainer said (no claim label, no extract, no marks): the readers decide
// blind. Each model has its own folder under data/, and the models never share
// a file. A reading already read by this model for an earlier week (a claim
// that spans both) is not read again: its answer is copied into reused.out.json.
// A batch with an answer file is left alone, so a later run resumes. The week's
// unread readings (no saved text) go to one screen file, headline and all.
//
// Usage: node research/experiments/2026-11-05-three-judges/make-batches.mjs <model> 2026-09-28

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BATCH_SIZE = 20;
const [model, monday] = process.argv.slice(2);
if (!model || !/^\d{4}-\d{2}-\d{2}$/.test(monday ?? "")) throw new Error("usage: make-batches.mjs <model> <monday>");
const week = JSON.parse(readFileSync(join(here, "data", "history", `week-${monday}.json`), "utf8"));
const root = join(here, "data", model);
const folder = join(root, `batches-${monday}`);

// This model's answers from its other weeks, by reading.
const earlier = new Map();
if (existsSync(root)) {
  for (const other of readdirSync(root).filter((name) => name.startsWith("batches-") && name !== `batches-${monday}`)) {
    for (const name of readdirSync(join(root, other)).filter((file) => file.endsWith(".out.json"))) {
      for (const answer of JSON.parse(readFileSync(join(root, other, name), "utf8"))) earlier.set(String(answer.reading_id), answer);
    }
  }
}

// Every reading, in claim order, with only what a blind reader needs.
const all = week.claims.flatMap((claim) =>
  claim.readings.map((reading) => ({
    reading_id: reading.reading_id,
    fighter: claim.fighter,
    published: String(reading.published_at).slice(0, 10),
    outlet: reading.outlet,
    headline: reading.headline,
    body: reading.body,
  })),
);

// Those read before are reused; the rest are batched.
mkdirSync(folder, { recursive: true });
const reused = all.filter((reading) => earlier.has(String(reading.reading_id))).map((reading) => earlier.get(String(reading.reading_id)));
writeFileSync(join(folder, "reused.out.json"), JSON.stringify(reused, null, 1));
writeFileSync(join(folder, "reused.in.json"), "[]");
const readings = all.filter((reading) => !earlier.has(String(reading.reading_id)));

let written = 0;
for (let start = 0, number = 1; start < readings.length; start += BATCH_SIZE, number++) {
  const name = `batch-${String(number).padStart(2, "0")}`;
  if (existsSync(join(folder, `${name}.out.json`))) continue;
  writeFileSync(join(folder, `${name}.in.json`), JSON.stringify(readings.slice(start, start + BATCH_SIZE), null, 1));
  written++;
}

// The unread readings: headline, outlet, and the line of text when there is one.
const screen = week.unread.map((reading) => ({
  reading_id: reading.reading_id, fighter: reading.fighter, published: String(reading.published_at).slice(0, 10),
  outlet: reading.outlet, headline: reading.headline, url: reading.url, description: reading.body,
}));
if (!existsSync(join(root, `screen-${monday}.out.json`))) writeFileSync(join(root, `screen-${monday}.in.json`), JSON.stringify(screen, null, 1));

console.log(`${model} ${monday}: ${all.length} readings, ${reused.length} read before; ${written} batches to read in ${folder}; ${screen.length} unread to screen`);
