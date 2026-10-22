// Step 5: the tables. Per fighter, how many articles each reader and each
// reading order makes readable (R2, the route test); how the texts differ
// where two readers both read a page; on the golden pages, how close each
// reader comes to the hand-checked clean text (3.12's answer key); and
// Readability's CPU (E2).
//
//   node compare.mjs
//
// Writes results.json: counts and ids only, no article text.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";
import { withoutFurniture, sentences, letters, holdsSentence } from "../2026-10-20-clean-text/text.mjs";

const USABLE = 400;
const data = (name) => (existsSync(new URL(`./data/${name}`, import.meta.url)) ? JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), "utf8")) : null);

/**
 * Whether a text passes v0's readable bar for a fighter.
 *
 * @param {string|null} text
 * @param {string} fighter
 * @returns {boolean}
 */
function readable(text, fighter) {
  const names = SUBJECTS.find((subject) => subject.name === fighter)?.matchNames ?? [];
  return Boolean(text) && text.length >= USABLE && mentionsName(text, names);
}

/**
 * A text's words, lower-cased, with how often each appears.
 *
 * @param {string} text
 * @returns {Map<string, number>}
 */
function wordCounts(text) {
  const counts = new Map();
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

/**
 * How much of a reader's text is in the answer key (precision), and how much
 * of the key the reader got (recall), word by word.
 *
 * @param {string} text  The reader's text.
 * @param {string} key  The clean text.
 * @returns {{precision: number, recall: number}}
 */
function overlap(text, key) {
  const got = wordCounts(text);
  const want = wordCounts(key);
  let shared = 0;
  for (const [word, count] of got) shared += Math.min(count, want.get(word) ?? 0);
  const total = (counts) => [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { precision: shared / Math.max(1, total(got)), recall: shared / Math.max(1, total(want)) };
}

/**
 * The share of one text's sentences that the other holds.
 *
 * @param {string} from
 * @param {string} other
 * @returns {number}
 */
function sentencesHeld(from, other) {
  const otherLetters = letters(other);
  const list = sentences(from).filter((sentence) => sentence.length >= 40);
  return list.filter((sentence) => holdsSentence(otherLetters, sentence)).length / Math.max(1, list.length);
}

/**
 * The median of a list, rounded to two places.
 *
 * @param {number[]} values
 * @returns {number|null}
 */
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100;
}

/**
 * The fresh sample: readable shares per fighter and per reading order.
 *
 * @returns {object}
 */
function fresh() {
  const sample = data("sample.json");
  const fetched = data("fetch.json");
  const texts = data("texts.json");
  const jina = data("jina.json") ?? {};
  const perFighter = {};
  const perOutlet = {};
  const both = { pages: 0, readability_longer: 0, furniture_ours: [], furniture_readability: [], ours_in_readability: [], readability_in_ours: [], jina_in_readability: [], readability_in_jina: [], jina_furniture: [] };
  for (const article of sample) {
    const fighter = article.subject;
    const own = texts[article.id] ?? {};
    const ok = {
      fetched: fetched[article.id]?.status === 200,
      ours: readable(own.ours, fighter),
      readability: readable(own.readability, fighter),
      jina: readable(jina[article.id], fighter),
      production: article.body_chars >= USABLE,
    };
    ok.page_readers = ok.ours || ok.readability;
    ok.all = ok.page_readers || ok.jina;
    ok.ours_or_jina = ok.ours || ok.jina;
    const row = (perFighter[fighter] ??= { articles: 0, fetched: 0, ours: 0, readability: 0, jina: 0, page_readers: 0, ours_or_jina: 0, all: 0, production: 0, jina_only: 0 });
    row.articles += 1;
    for (const key of ["fetched", "ours", "readability", "jina", "page_readers", "ours_or_jina", "all", "production"]) row[key] += ok[key] ? 1 : 0;
    if (ok.jina && !ok.page_readers) row.jina_only += 1;
    const outlet = (perOutlet[article.source] ??= { articles: 0, fetched: 0, page_readers: 0, jina: 0, all: 0 });
    outlet.articles += 1;
    for (const key of ["fetched", "page_readers", "jina", "all"]) outlet[key] += ok[key] ? 1 : 0;

    // Where both page readers pass, how their texts differ.
    if (ok.ours && ok.readability) {
      both.pages += 1;
      if (own.readability.length > own.ours.length) both.readability_longer += 1;
      both.furniture_ours.push(1 - withoutFurniture(own.ours, article.title).length / own.ours.length);
      both.furniture_readability.push(1 - withoutFurniture(own.readability, article.title).length / own.readability.length);
      both.ours_in_readability.push(sentencesHeld(own.ours, own.readability));
      both.readability_in_ours.push(sentencesHeld(own.readability, own.ours));
    }
    if (ok.readability && ok.jina) {
      both.jina_in_readability.push(sentencesHeld(jina[article.id], own.readability));
      both.readability_in_jina.push(sentencesHeld(own.readability, jina[article.id]));
      both.jina_furniture.push(1 - withoutFurniture(jina[article.id], article.title).length / jina[article.id].length);
    }
  }
  const summary = Object.fromEntries(Object.entries(both).map(([key, value]) => [key, Array.isArray(value) ? { n: value.length, median: median(value) } : value]));
  return { perFighter, perOutlet, bothRead: summary };
}

/**
 * The golden pages: each reader against the answer key, split by where the key came from.
 *
 * @returns {object}
 */
function golden() {
  const clean = JSON.parse(readFileSync(new URL("../2026-10-20-clean-text/data/clean.json", import.meta.url), "utf8"));
  const articles = JSON.parse(readFileSync(new URL("../../../golden/articles.json", import.meta.url), "utf8"));
  const texts = data("golden-texts.json");
  const jina = data("golden-jina.json") ?? {};
  const scores = {};
  for (const article of articles) {
    const key = clean[article.id];
    if (!key?.text || key.source === "none") continue;
    const readers = { ours: texts[article.id]?.ours, readability: texts[article.id]?.readability, jina: jina[article.id] };
    for (const [reader, text] of Object.entries(readers)) {
      if (!text) continue;
      const group = (scores[`${key.source}:${reader}`] ??= { n: 0, readable: 0, precision: [], recall: [] });
      const { precision, recall } = overlap(text, key.text);
      group.n += 1;
      group.readable += readable(text, article.subject) ? 1 : 0;
      group.precision.push(precision);
      group.recall.push(recall);
    }
  }
  return Object.fromEntries(Object.entries(scores).map(([name, group]) => [name, { n: group.n, readable: group.readable, precision: median(group.precision), recall: median(group.recall) }]));
}

/**
 * Readability's and our extractor's CPU per page, on the laptop.
 *
 * @returns {object}
 */
function cpu() {
  const out = {};
  for (const name of ["read.json", "golden-read.json"]) {
    const record = Object.values(data(name));
    const of = (reader) => record.map((row) => row[reader].cpu_ms);
    const sum = (values) => Math.round(values.reduce((total, value) => total + value, 0));
    out[name] = { pages: record.length, readability_ms: { median: median(of("readability")), mean: Math.round(sum(of("readability")) / record.length), max: Math.round(Math.max(...of("readability"))) }, ours_ms: { median: median(of("ours")), max: Math.round(Math.max(...of("ours"))) } };
  }
  return out;
}

const results = { fresh: fresh(), golden: data("golden-texts.json") ? golden() : null, cpu: cpu() };
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results, null, 1));
