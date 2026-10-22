// Step 9: Jina's own text carries the page around the article. Does asking
// Jina for the page's HTML instead (X-Respond-With: html) and running our
// extractor and Readability on it give clean text, so Jina is only a fetcher?
// Two sets: the fresh articles only Jina could read, and 60 golden articles
// with a clean text to score against. Keyless, one call started every 3.2 seconds.
//
//   node jina-html.mjs
//
// Writes data/jina-html.json (texts, git-ignored) and jina-html.json (scores, no text).

import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { extractFromHtml } from "../../../lib/extract.js";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";

const GAP_MS = 3_200;
const GOLDEN_COUNT = 60;
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

/**
 * Whether a text passes the readable bar for a fighter.
 *
 * @param {string|null} text
 * @param {string} fighter
 * @returns {boolean}
 */
function readable(text, fighter) {
  return Boolean(text) && text.length >= 400 && mentionsName(text, SUBJECTS.find((subject) => subject.name === fighter).matchNames);
}

/**
 * Words that belong to the clean text, and how much of it is kept, word by word.
 *
 * @param {string} text
 * @param {string} key
 * @returns {{precision: number, recall: number}}
 */
function overlap(text, key) {
  const counts = (value) => {
    const map = new Map();
    for (const word of value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) map.set(word, (map.get(word) ?? 0) + 1);
    return map;
  };
  const got = counts(text);
  const want = counts(key);
  let shared = 0;
  for (const [word, count] of got) shared += Math.min(count, want.get(word) ?? 0);
  const total = (map) => [...map.values()].reduce((sum, count) => sum + count, 0);
  return { precision: shared / Math.max(1, total(got)), recall: shared / Math.max(1, total(want)) };
}

/**
 * The page's HTML as Jina's browser saw it, then our extractor, then Readability.
 *
 * @param {string} address
 * @returns {Promise<{status: string, ours: string|null, readability: string|null}>}
 */
async function readThroughJina(address) {
  try {
    const response = await fetch(`https://r.jina.ai/${address}`, { headers: { "X-Respond-With": "html", "X-Timeout": "20", DNT: "1" }, signal: AbortSignal.timeout(35_000) });
    if (!response.ok) return { status: `jina-${response.status}`, ours: null, readability: null };
    const html = (await response.text()).slice(0, 1_500_000);
    const ours = extractFromHtml(html).text?.slice(0, 10_000) ?? null;
    const dom = new JSDOM(html, { url: address, virtualConsole: new VirtualConsole() });
    const parsed = new Readability(dom.window.document).parse();
    dom.window.close();
    return { status: "ok", ours, readability: parsed?.textContent?.replace(/\s+/g, " ").trim() || null };
  } catch (error) {
    return { status: `error-${error.name}`, ours: null, readability: null };
  }
}

/**
 * The articles to try: fresh ones only Jina read, and golden ones with a clean text.
 *
 * @returns {{set: string, id: string, address: string, fighter: string}[]}
 */
function articles() {
  const sample = read("./data/sample.json");
  const fetched = read("./data/fetch.json");
  const pageRead = read("./data/read.json");
  const jinaRecord = read("./data/jina.json");
  const fresh = sample
    .filter((article) => readable(jinaRecord[article.id], article.subject) && !(pageRead[article.id]?.ours.readable || pageRead[article.id]?.readability.readable))
    .map((article) => ({ set: "fresh", id: String(article.id), address: fetched[article.id]?.address ?? article.url, fighter: article.subject }));
  const clean = read("../2026-10-20-clean-text/data/clean.json");
  const goldenFetch = read("../2026-10-20-clean-text/data/fetch.json");
  const golden = read("../../../golden/articles.json")
    .filter((article) => clean[article.id]?.text && goldenFetch[article.id]?.address)
    .slice(0, GOLDEN_COUNT)
    .map((article) => ({ set: "golden", id: article.id, address: goldenFetch[article.id].address, fighter: article.subject }));
  return [...fresh, ...golden];
}

/**
 * Calls Jina for every article and scores what our readers make of its HTML.
 */
async function main() {
  const clean = read("../2026-10-20-clean-text/data/clean.json");
  const goldenJina = read("./data/golden-jina.json");
  const texts = {};
  const rows = [];
  const calls = [];
  for (const article of articles()) {
    calls.push(
      readThroughJina(article.address).then((result) => {
        texts[`${article.set}:${article.id}`] = result;
        const row = { set: article.set, id: article.id, status: result.status, ours: readable(result.ours, article.fighter), readability: readable(result.readability, article.fighter) };
        if (article.set === "golden") {
          const key = clean[article.id].text;
          if (result.ours) row.ours_score = overlap(result.ours, key);
          if (goldenJina[article.id]) row.jina_text_score = overlap(goldenJina[article.id], key);
        }
        rows.push(row);
        console.log(article.set, article.id, result.status, row.ours, row.readability);
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }
  await Promise.all(calls);
  writeFileSync(new URL("./data/jina-html.json", import.meta.url), JSON.stringify(texts));

  // The summary: readable counts per set, and median scores on the golden set.
  const median = (values) => (values.length ? Math.round([...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] * 100) / 100 : null);
  const summary = {};
  for (const set of ["fresh", "golden"]) {
    const inSet = rows.filter((row) => row.set === set);
    const scored = inSet.filter((row) => row.ours_score && row.jina_text_score);
    summary[set] = {
      articles: inSet.length,
      html_ok: inSet.filter((row) => row.status === "ok").length,
      ours_readable: inSet.filter((row) => row.ours).length,
      either_readable: inSet.filter((row) => row.ours || row.readability).length,
      ...(set === "golden" ? { scored: scored.length, ours_precision: median(scored.map((row) => row.ours_score.precision)), ours_recall: median(scored.map((row) => row.ours_score.recall)), jina_text_precision: median(scored.map((row) => row.jina_text_score.precision)), jina_text_recall: median(scored.map((row) => row.jina_text_score.recall)) } : {}),
    };
  }
  writeFileSync(new URL("./jina-html.json", import.meta.url), JSON.stringify({ summary, rows: rows.map(({ ours_score, jina_text_score, ...row }) => row) }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
}

await main();
