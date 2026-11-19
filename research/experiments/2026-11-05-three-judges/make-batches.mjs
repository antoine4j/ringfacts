// Cuts an exported week into reading batches for one model's readers, in claim
// order, with the full saved text and nothing of what the pipeline or the
// maintainer said (no claim label, no extract, no marks): the readers decide
// blind. Each model has its own folder under data/, and the models never share
// a file. A reading already read by this model for an earlier week (a claim
// that spans both) is not read again: its answer is copied into reused.out.json.
// A batch with an answer file is left alone, so a later run resumes. The week's
// unread readings (no saved text) go to one screen file, headline and all.
//
// A week exported again after more articles came in (the top-up of a later
// cut-off) keeps its batches: readings already in them are not cut again,
// the new ones go to batches numbered after the last, and the unread not yet
// screened go to screen-<monday>-<n>.in.json.
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

// Readings this model already has in another week's batches, answered or
// not: a claim that spans weeks is read once, in the first week cut.
const earlier = new Map();
if (existsSync(root)) {
  for (const other of readdirSync(root).filter((name) => name.startsWith("batches-") && name !== `batches-${monday}`)) {
    for (const name of readdirSync(join(root, other)).filter((file) => file.endsWith(".in.json") || file.endsWith(".out.json"))) {
      for (const item of JSON.parse(readFileSync(join(root, other, name), "utf8"))) if (!earlier.has(String(item.reading_id))) earlier.set(String(item.reading_id), other);
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

// Readings already in this week's own batches (a week exported again).
mkdirSync(folder, { recursive: true });
const batchNames = readdirSync(folder).filter((file) => /^batch-\d+\.in\.json$/.test(file));
const batched = new Set(batchNames.flatMap((name) => JSON.parse(readFileSync(join(folder, name), "utf8")).map((item) => String(item.reading_id))));
const firstNumber = batchNames.length ? Math.max(...batchNames.map((name) => Number(name.slice(6, -8)))) + 1 : 1;

// Those read before are reused; the rest are batched.
const reused = all.filter((reading) => earlier.has(String(reading.reading_id))).map((reading) => ({ reading_id: reading.reading_id, in: earlier.get(String(reading.reading_id)) }));
writeFileSync(join(folder, "reused.json"), JSON.stringify(reused, null, 1));
const readings = all.filter((reading) => !earlier.has(String(reading.reading_id)) && !batched.has(String(reading.reading_id)));

let written = 0;
for (let start = 0, number = firstNumber; start < readings.length; start += BATCH_SIZE, number++) {
  const name = `batch-${String(number).padStart(2, "0")}`;
  if (existsSync(join(folder, `${name}.out.json`))) continue;
  writeFileSync(join(folder, `${name}.in.json`), JSON.stringify(readings.slice(start, start + BATCH_SIZE), null, 1));
  written++;
}

// The unread readings: headline, outlet, and the line of text when there is one.
const screenNames = readdirSync(root).filter((file) => file.startsWith(`screen-${monday}`) && file.endsWith(".in.json"));
const screenedBefore = new Set(screenNames.flatMap((name) => JSON.parse(readFileSync(join(root, name), "utf8")).map((item) => String(item.reading_id))));
const screen = week.unread.filter((reading) => !screenedBefore.has(String(reading.reading_id))).map((reading) => ({
  reading_id: reading.reading_id, fighter: reading.fighter, published: String(reading.published_at).slice(0, 10),
  outlet: reading.outlet, headline: reading.headline, url: reading.url, description: reading.body,
}));
const screenName = screenNames.length ? `screen-${monday}-${screenNames.length + 1}.in.json` : `screen-${monday}.in.json`;
if (screen.length && !existsSync(join(root, screenName.replace(".in.json", ".out.json")))) writeFileSync(join(root, screenName), JSON.stringify(screen, null, 1));

console.log(`${model} ${monday}: ${all.length} readings, ${reused.length} read before; ${written} batches to read in ${folder}; ${screen.length} unread to screen`);
