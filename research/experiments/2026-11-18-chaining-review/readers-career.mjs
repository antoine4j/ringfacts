// What the three readers (one per model) said each reading's career event is,
// from the three-judges data. Read-only. Used as an aid when counting which
// foreign readings report a career event; the count itself rests on this
// review's own reading of the headline and extract.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JUDGES_DATA, MODELS } from "./load-judged.mjs";

/**
 * Loads each reader's career-event answer for every reading it read.
 *
 * @returns A map from reading id to { model: career_event }.
 */
export function loadReaderCareerEvents() {
  const answers = new Map();
  for (const model of MODELS) {
    const folder = join(JUDGES_DATA, model);
    const batchFolders = readdirSync(folder).filter((name) => /^batches-\d{4}-\d{2}-\d{2}$/.test(name));
    for (const batchFolder of batchFolders) {
      const files = readdirSync(join(folder, batchFolder)).filter((name) => /^batch-\d+\.out\.json$/.test(name));
      for (const file of files) {
        const path = join(folder, batchFolder, file);
        if (!existsSync(path)) continue;
        for (const reading of JSON.parse(readFileSync(path, "utf8"))) {
          const forReading = answers.get(String(reading.reading_id)) ?? {};
          forReading[model] = reading.career_event ?? "none";
          answers.set(String(reading.reading_id), forReading);
        }
      }
    }
  }
  return answers;
}

/**
 * The career event at least two readers name, or "none".
 *
 * @param forReading  { model: career_event } for one reading.
 * @returns The majority's event, "none" when no two agree on one.
 */
export function majorityCareerEvent(forReading) {
  const counts = {};
  for (const event of Object.values(forReading ?? {})) counts[event] = (counts[event] ?? 0) + 1;
  const best = Object.entries(counts).sort((first, second) => second[1] - first[1])[0];
  return best && best[1] >= 2 ? best[0] : "none";
}
