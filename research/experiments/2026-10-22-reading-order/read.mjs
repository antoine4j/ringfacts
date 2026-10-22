// Step 3: our extractor and Mozilla Readability on the same downloaded page,
// each timed in CPU milliseconds (E2), each judged by v0's readable bar: at
// least 400 characters that name the article's fighter (R2, D32).
//
//   node read.mjs                       # the fresh sample's pages (data/pages/)
//   node read.mjs --golden              # the golden pages kept by the clean-text experiment
//
// Writes data/texts.json or data/golden-texts.json (the texts, git-ignored)
// and data/read.json or data/golden-read.json (lengths, verdicts, timings).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { extractFromHtml } from "../../../lib/extract.js";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";

const GOLDEN = process.argv.includes("--golden");
const PAGES = GOLDEN ? new URL("../2026-10-20-clean-text/data/pages/", import.meta.url) : new URL("./data/pages/", import.meta.url);
const MAX_HTML_CHARS = 1_500_000;
const MAX_BODY_CHARS = 10_000;
const USABLE = 400;

/**
 * Readability's text for one page, one line, a space where each block ends.
 *
 * @param {string} html  The page.
 * @param {string} address  The page's address, for relative links.
 * @returns {string|null}
 */
function readabilityText(html, address) {
  const dom = new JSDOM(html, { url: address, virtualConsole: new VirtualConsole() });
  const article = new Readability(dom.window.document).parse();
  if (!article?.content) return null;
  const spaced = article.content.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|h[1-6]|li|blockquote|figcaption|td|th|tr|section|article)>/gi, "$& ");
  const holder = new JSDOM(`<body>${spaced}</body>`).window.document.body;
  return (holder.textContent ?? "").replace(/\s+/g, " ").trim() || null;
}

/**
 * Runs one reader and measures it.
 *
 * @param {() => string|null} read  The reader on one page.
 * @returns {{text: string|null, cpu_ms: number, error?: string}}
 */
function timed(read) {
  const before = process.cpuUsage();
  let text = null;
  let error;
  try {
    text = read();
  } catch (caught) {
    error = String(caught?.message ?? caught).slice(0, 120);
  }
  const used = process.cpuUsage(before);
  return { text, cpu_ms: (used.user + used.system) / 1000, ...(error ? { error } : {}) };
}

/**
 * The verdict on one reader's text for one article.
 *
 * @param {string|null} text
 * @param {string[]} matchNames  The fighter's name stems.
 * @returns {{chars: number, names: boolean, readable: boolean}}
 */
function verdict(text, matchNames) {
  const chars = text?.length ?? 0;
  const names = mentionsName(text ?? "", matchNames);
  return { chars, names, readable: chars >= USABLE && names };
}

/**
 * The articles to read, with their page's address and fighter.
 *
 * @returns {{id: string, address: string, subject: string}[]}
 */
function articles() {
  if (GOLDEN) {
    const golden = JSON.parse(readFileSync(new URL("../../../golden/articles.json", import.meta.url), "utf8"));
    const fetched = JSON.parse(readFileSync(new URL("../2026-10-20-clean-text/data/fetch.json", import.meta.url), "utf8"));
    return golden.map((article) => ({ id: article.id, address: fetched[article.id]?.final_url, subject: article.subject }));
  }
  const sample = JSON.parse(readFileSync(new URL("./data/sample.json", import.meta.url), "utf8"));
  const fetched = JSON.parse(readFileSync(new URL("./data/fetch.json", import.meta.url), "utf8"));
  return sample.map((article) => ({ id: String(article.id), address: fetched[article.id]?.final_url, subject: article.subject }));
}

/**
 * Reads every downloaded page with both readers.
 */
async function main() {
  const texts = {};
  const record = {};
  for (const article of articles()) {
    const page = new URL(`${article.id}.html`, PAGES);
    if (!existsSync(page)) continue;
    const html = readFileSync(page, "utf8").slice(0, MAX_HTML_CHARS);
    const matchNames = SUBJECTS.find((subject) => subject.name === article.subject)?.matchNames ?? [];

    // The two readers on the same HTML, one after the other.
    const ours = timed(() => extractFromHtml(html).text?.slice(0, MAX_BODY_CHARS) ?? null);
    const via = extractFromHtml(html).via;
    const readability = timed(() => readabilityText(html, article.address ?? "https://example.com/"));
    texts[article.id] = { ours: ours.text, readability: readability.text };
    record[article.id] = {
      html_chars: html.length,
      ours: { via, cpu_ms: ours.cpu_ms, ...verdict(ours.text, matchNames) },
      readability: { cpu_ms: readability.cpu_ms, ...verdict(readability.text, matchNames), ...(readability.error ? { error: readability.error } : {}) },
      rss_mb: Math.round(process.memoryUsage().rss / 1e6),
    };
  }
  const name = GOLDEN ? "golden-" : "";
  writeFileSync(new URL(`./data/${name}texts.json`, import.meta.url), JSON.stringify(texts));
  writeFileSync(new URL(`./data/${name}read.json`, import.meta.url), JSON.stringify(record, null, 1));
  console.log(`${Object.keys(record).length} pages read`);
}

await main();
