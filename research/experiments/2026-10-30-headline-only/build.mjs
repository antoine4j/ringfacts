// Step 1: the "headline side" of every training and validation article: the
// headline, a blank line, then the feed's preview text with its HTML removed,
// or the headline alone when there is no preview or it adds no word beyond
// the headline and the outlet's name.
//
//   node build.mjs
//
// Reads data/descriptions.json (pull.mjs). Writes data/headline-side.json
// (id → text and the preview's measures: git-ignored) and summaries.json
// (id → the measures only, no text: tracked).

import { readFileSync, writeFileSync } from "node:fs";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const DESCRIPTIONS = new URL("./data/descriptions.json", import.meta.url);
const OUT_TEXT = new URL("./data/headline-side.json", import.meta.url);
const OUT_MEASURES = new URL("./summaries.json", import.meta.url);
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/**
 * Turns HTML codes (&amp;, &nbsp;, &#8217;, &#x27;) back into the characters they stand for.
 *
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, code) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return NAMED_ENTITIES[lower] ?? whole;
  });
}

/**
 * A feed preview as plain text: one line per list item, tags removed, codes decoded, spaces collapsed.
 *
 * @param {string} html
 * @returns {string}
 */
export function plainText(html) {
  // List items and line breaks become line ends; every other tag goes.
  const withBreaks = html.replace(/<\/li>|<br\s*\/?>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]*>/g, " ");
  const decoded = decodeEntities(withoutTags);

  // Collapse runs of spaces inside each line and drop empty lines.
  const lines = decoded.split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  return lines.filter((line) => line.length > 0).join("\n");
}

/**
 * The words of a text, lower-cased, letters and digits in any script.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function wordsOf(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * The preview's words that are neither in the headline nor in the outlet's name.
 *
 * @param {string} preview  The preview as plain text.
 * @param {string} headline
 * @param {string} outlet
 * @returns {string[]}
 */
export function addedWords(preview, headline, outlet) {
  const known = new Set([...wordsOf(headline), ...wordsOf(outlet)]);
  return wordsOf(preview).filter((word) => !known.has(word));
}

/**
 * Builds and saves the headline-side text of every article that has an entry in descriptions.json.
 */
function main() {
  const descriptions = JSON.parse(readFileSync(DESCRIPTIONS, "utf8"));
  const articles = JSON.parse(readFileSync(new URL("articles-meta.json", GOLDEN), "utf8"));
  const texts = {};
  const measures = {};
  for (const article of articles) {
    if (!(article.id in descriptions)) continue;
    const raw = descriptions[article.id] ?? "";
    const preview = plainText(raw);
    const added = addedWords(preview, article.title, article.source ?? "");

    // The preview goes in only when it adds a word; otherwise the headline stands alone.
    const addsWords = added.length > 0;
    const text = addsWords ? `${article.title}\n\n${preview}` : article.title;
    const isCluster = /<ol\b/i.test(raw);
    texts[article.id] = { text, preview, adds_words: addsWords };
    measures[article.id] = { has_preview: preview.length > 0, preview_chars: preview.length, added_words: added.length, adds_words: addsWords, related_coverage_list: isCluster };
  }
  writeFileSync(OUT_TEXT, JSON.stringify(texts, null, 1));
  writeFileSync(OUT_MEASURES, JSON.stringify(measures, null, 1) + "\n");

  // A short summary for the console: counts only.
  const values = Object.values(measures);
  const count = (test) => values.filter(test).length;
  console.log(JSON.stringify({ articles: values.length, with_preview: count((entry) => entry.has_preview), preview_adds_words: count((entry) => entry.adds_words), related_coverage_lists: count((entry) => entry.related_coverage_list), added_word_counts: values.map((entry) => entry.added_words).filter((words) => words > 0) }));
}

main();
