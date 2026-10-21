// Step 1c of 3.12: turn the hand-cleaning marks into clean texts, and prove
// each one only deletes. A mark keeps spans of the saved text, each named by
// its exact first and last words; anything between the spans is deleted.
//
//   node hand-clean.mjs
//
// Reads data/hand/<id>.json ({keep: [{from, to}], unusable?, note});
// writes data/hand-clean.json. A mark whose anchors are not found, or
// that would reorder the text, is refused and listed.
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ARTICLES = new URL("../../../golden/articles.json", import.meta.url);
const READABILITY = new URL("./data/readability.json", import.meta.url);
const HAND = new URL("./data/hand/", import.meta.url);
const OUT = new URL("./data/hand-clean.json", import.meta.url);

/**
 * The kept spans of one saved text, in order.
 *
 * @param {string} body  The saved text.
 * @param {{from: string, to: string}[]} keep  Each span's first and last words, copied exactly.
 * @returns {{spans: string[], error: string|null}}
 */
export function keptSpans(body, keep) {
  const spans = [];
  let cursor = 0;
  for (const [index, span] of keep.entries()) {
    // Each span starts after the one before it, so the text cannot be reordered.
    const start = body.indexOf(span.from, cursor);
    if (start < 0) return { spans, error: `span ${index + 1}: "from" not found after the previous span` };
    const toAt = body.indexOf(span.to, start);
    if (toAt < 0) return { spans, error: `span ${index + 1}: "to" not found after its "from"` };
    const end = toAt + span.to.length;
    spans.push(body.slice(start, end));
    cursor = end;
  }
  return { spans, error: null };
}

/**
 * Builds every hand-cleaned text and records refusals.
 */
function main() {
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const readability = JSON.parse(readFileSync(READABILITY, "utf8"));
  const out = {};
  const refused = [];
  for (const article of articles) {
    if (readability[article.id].kept) continue;
    const file = new URL(`${article.id}.json`, HAND);
    if (!existsSync(file)) {
      refused.push(`${article.id}: no mark`);
      continue;
    }
    const mark = JSON.parse(readFileSync(file, "utf8"));

    // A text with nothing of the article in it is recorded as such, with the reader's note.
    if (mark.unusable) {
      out[article.id] = { source: "nothing usable", text: null, note: mark.note };
      continue;
    }
    const { spans, error } = keptSpans(article.body, mark.keep ?? []);
    if (error || spans.length === 0) {
      refused.push(`${article.id}: ${error ?? "no spans"}`);
      continue;
    }
    const text = spans.join(" ").replace(/\s+/g, " ").trim();
    out[article.id] = { source: "hand-cleaned", text, note: mark.note, spans: spans.length, deleted_chars: article.body.length - text.length };
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`built ${Object.keys(out).length}; refused ${refused.length}`);
  for (const line of refused) console.log("  " + line);
}

// Run only when called as a script, not when the review page imports keptSpans.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
