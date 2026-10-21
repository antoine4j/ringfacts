// Step 1d of 3.12: one clean text per golden article, from Readability when
// it passed its four checks, else from the hand-cleaning, and the record of
// where each came from. No model calls.
//
//   node build-clean.mjs
//
// Writes data/clean.json (the texts; git-ignored) and record.json (sources,
// checks, reasons and lengths, no article text; tracked).
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync } from "node:fs";
import { SUBJECTS } from "../../../watchlist.js";
import { letters, sentences, decoded, holdsSentence } from "./text.mjs";

const ARTICLES = new URL("../../../golden/articles.json", import.meta.url);
const READABILITY = new URL("./data/readability.json", import.meta.url);
const HAND = new URL("./data/hand-clean.json", import.meta.url);
const CLEAN = new URL("./data/clean.json", import.meta.url);
const RECORD = new URL("./record.json", import.meta.url);
const RECHECK_LENGTH = 0.9;

/**
 * Whether a text names the article's fighter, by watchlist.js's stems.
 *
 * @param {string} text
 * @param {string} subject  The fighter's name.
 * @returns {boolean}
 */
function namesFighter(text, subject) {
  const stems = SUBJECTS.find((entry) => entry.name === subject).matchNames;
  return stems.some((stem) => text.toLowerCase().includes(stem.toLowerCase()));
}

/**
 * The length check redone with the hand-cleaned text as the yardstick, for a
 * Readability text that failed only that check: it must hold every
 * hand-cleaned sentence naming the fighter (the headline aside) and be at
 * least 90% as long.
 *
 * @param {object} article  The golden article.
 * @param {object} read  Its Readability entry.
 * @param {object|undefined} handEntry  Its hand-cleaning entry.
 * @returns {boolean}
 */
function passesRecheck(article, read, handEntry) {
  const failedOnlyLength = read.failed?.length === 1 && read.failed[0] === "long_enough";
  if (!failedOnlyLength || !handEntry?.text) return false;
  const pageLetters = letters(read.text);
  const headlineLetters = letters(decoded(article.title.split(/ [-|–] /)[0]));
  const naming = sentences(handEntry.text).filter((sentence) => namesFighter(sentence, article.subject));
  const missing = naming.filter((sentence) => !holdsSentence(pageLetters, sentence) && !letters(decoded(sentence)).startsWith(headlineLetters));
  return missing.length === 0 && pageLetters.length >= RECHECK_LENGTH * letters(decoded(handEntry.text)).length;
}

/**
 * A text with every run of spaces made one, for comparing.
 *
 * @param {string} text
 * @returns {string}
 */
function squeeze(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Builds the clean texts and the record.
 */
function main() {
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const readability = JSON.parse(readFileSync(READABILITY, "utf8"));
  const hand = JSON.parse(readFileSync(HAND, "utf8"));
  const clean = {};
  const record = {};
  for (const article of articles) {
    const read = readability[article.id];
    const handEntry = hand[article.id];

    // Readability when it passed, first time or on the recheck; otherwise the hand-cleaned text, or nothing usable.
    const rechecked = !read.kept && passesRecheck(article, read, handEntry);
    const useReadability = read.kept || rechecked;
    const source = useReadability ? "readability" : handEntry?.source ?? "missing";
    const text = useReadability ? read.text : handEntry?.text ?? null;
    const reason = read.kept ? read.reason
      : rechecked ? "Readability passed once its length was checked against the hand-cleaned text"
      : `Readability not used (${read.reason}); ${handEntry?.note ?? "no hand mark"}`;
    clean[article.id] = { source, text };
    record[article.id] = {
      source,
      checks: read.checks ? { ...read.checks, ...(rechecked ? { long_enough: "passed on recheck" } : {}) } : null,
      reason,
      saved_chars: article.body.length,
      clean_chars: text?.length ?? 0,
      same_as_saved: text !== null && squeeze(text) === squeeze(article.body),
      names_fighter: text ? namesFighter(text, article.subject) : false,
    };
  }
  writeFileSync(CLEAN, JSON.stringify(clean, null, 1));
  writeFileSync(RECORD, JSON.stringify(record, null, 1) + "\n");
  const counts = {};
  for (const entry of Object.values(record)) counts[entry.source] = (counts[entry.source] ?? 0) + 1;
  console.log(counts);
}

main();
