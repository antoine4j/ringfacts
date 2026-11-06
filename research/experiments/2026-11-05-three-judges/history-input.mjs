// Builds one model's history file per fighter: one line per claim across
// every judged week (the judge's core line, first and last dates, how many
// readings, the readers' career event when they agreed on one), in date
// order, for the history pass that links claims weeks apart. Refuses while a
// week in the history is not judged by this model.
//
// Usage: node research/experiments/2026-11-05-three-judges/history-input.mjs <model>

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { majority } from "./stats.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const model = process.argv[2];
if (!model) throw new Error("usage: history-input.mjs <model>");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const root = join(here, "data", model);
const weeks = readdirSync(join(here, "data", "history")).filter((name) => /^week-\d{4}-\d{2}-\d{2}\.json$/.test(name)).map((name) => name.slice(5, 15)).sort();

// Every reader's answer of this model, from every week's batches.
const allAnswers = new Map();
for (const other of readdirSync(root).filter((name) => name.startsWith("batches-"))) {
  for (const name of readdirSync(join(root, other)).filter((file) => file.endsWith(".out.json"))) {
    for (const answer of read(join(root, other, name))) allAnswers.set(String(answer.reading_id), answer);
  }
}

// Every claim once, with the judge's newest core line and the readers' career event.
const claims = new Map();
for (const monday of weeks) {
  const judged = join(root, `judge-out-${monday}.json`);
  if (!existsSync(judged)) throw new Error(`${model} has not judged ${monday}`);
  const week = read(join(here, "data", "history", `week-${monday}.json`));
  const cores = new Map((read(judged).claims ?? []).map((claim) => [String(claim.claim_id), claim.core]));
  const answers = allAnswers;
  for (const claim of week.claims) {
    const dates = claim.readings.map((reading) => String(reading.published_at).slice(0, 10)).sort();
    const events = claim.readings.map((reading) => answers.get(reading.reading_id)?.career_event).filter((event) => event && event !== "none");
    const best = majority(events);
    const entry = claims.get(claim.id) ?? { claim_id: claim.id, fighter: claim.fighter, core: "", first: dates[0], last: dates.at(-1), readings: claim.readings.length };
    if (cores.get(claim.id)) entry.core = cores.get(claim.id);
    entry.first = [entry.first, dates[0]].sort()[0];
    entry.last = [entry.last, dates.at(-1)].sort().at(-1);
    entry.readings = claim.readings.length;
    if (best && best.count * 2 > claim.readings.length) entry.career_event = best.answer;
    claims.set(claim.id, entry);
  }
}

// One file per fighter, in date order.
const byFighter = Object.groupBy([...claims.values()], (claim) => claim.fighter);
for (const [fighter, list] of Object.entries(byFighter)) {
  list.sort((a, b) => a.first.localeCompare(b.first) || Number(a.claim_id) - Number(b.claim_id));
  const file = join(root, `history-in-${fighter.split(" ").at(-1).toLowerCase()}.json`);
  mkdirSync(root, { recursive: true });
  writeFileSync(file, JSON.stringify({ fighter, weeks, claims: list }, null, 1));
  console.log(`${model}: ${fighter}, ${list.length} claims → ${file}`);
}
