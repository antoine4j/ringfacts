// Step 2: our extractor (lib/extract.js) on every page that came back today,
// judged by v0's readable bar: at least 400 characters that name the
// article's fighter. "Names the fighter" is lib/tier.js's mentionsName with
// the fighter's matchNames from watchlist.js (surname stems, both scripts).
//
//   node read.mjs
//
// Writes data/read.json (rung used, length, verdict per page id; git-ignored).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { extractFromHtml } from "../../../lib/extract.js";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";
import { buildTargets, readJson } from "./targets.mjs";

const PAGES = new URL("./data/pages/", import.meta.url);
const MAX_HTML_CHARS = 1_500_000;
const MAX_BODY_CHARS = 10_000;
const USABLE = 400;

/**
 * The verdict on one page's text.
 *
 * @param {string|null} text  What the extractor returned.
 * @param {string[]} matchNames  The fighter's surname stems.
 * @returns {{chars: number, names: boolean, readable: boolean}}
 */
function verdict(text, matchNames) {
  const chars = text?.length ?? 0;
  const names = mentionsName(text ?? "", matchNames);
  return { chars, names, readable: chars >= USABLE && names };
}

/**
 * Reads every page fetched today with our extractor.
 */
function main() {
  const { rows, ids } = buildTargets();
  const subjectById = Object.fromEntries(rows.map((row) => [row.id, row.subject]));
  const record = {};

  // One extractor run per downloaded page.
  for (const id of ids) {
    const page = new URL(`${id}.html`, PAGES);
    if (!existsSync(page)) continue;
    const html = readFileSync(page, "utf8").slice(0, MAX_HTML_CHARS);
    const matchNames = SUBJECTS.find((subject) => subject.name === subjectById[id])?.matchNames ?? [];
    const extracted = extractFromHtml(html);
    const text = extracted.text?.slice(0, MAX_BODY_CHARS) ?? null;
    record[id] = { via: extracted.via ?? null, ...verdict(text, matchNames) };
  }
  writeFileSync(new URL("./data/read.json", import.meta.url), JSON.stringify(record, null, 1));
  console.log(`${Object.keys(record).length} pages read`);
}

main();
