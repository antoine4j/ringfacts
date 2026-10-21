// Step 1a of 3.12: fetch every golden article's page again, once, into the
// git-ignored data/pages/ folder. Google's wrapped links are decoded the way
// production does (lib/googlenews.js). No model calls.
//
//   node fetch.mjs            # every article not fetched yet
//   node fetch.mjs --again    # every article, overwriting
//
// Writes data/pages/<id>.html and data/fetch.json (status, final URL, error per article).
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { decodeGoogleNewsUrl } from "../../../lib/googlenews.js";

const ARTICLES = new URL("../../../golden/articles.json", import.meta.url);
const DATA = new URL("./data/", import.meta.url);
const PAGES = new URL("./data/pages/", import.meta.url);
const RECORD = new URL("./data/fetch.json", import.meta.url);
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PARALLEL = 6;

/**
 * The address to fetch for one article: the decoded Google link, or the
 * resolved address production stored when decoding fails today.
 *
 * @param {{url: string, resolved_url?: string}} article
 * @returns {Promise<{address: string|null, decoded: boolean}>}
 */
async function addressOf(article) {
  const decoded = await decodeGoogleNewsUrl(article.url);
  if (decoded) return { address: decoded, decoded: true };
  return { address: article.resolved_url ?? null, decoded: false };
}

/**
 * Fetches one article's page and saves its HTML.
 *
 * @param {{id: string, url: string, resolved_url?: string}} article
 * @returns {Promise<object>} What happened: the address, status, final URL, size, or the error.
 */
async function fetchOne(article) {
  const { address, decoded } = await addressOf(article);
  if (!address) return { id: article.id, error: "no address" };

  // One attempt with a browser's headers; a refusal is recorded, not retried.
  try {
    const response = await fetch(address, {
      headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml", "accept-language": "en,uk;q=0.8,es;q=0.6" },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    const html = await response.text();
    if (response.ok) writeFileSync(new URL(`${article.id}.html`, PAGES), html);
    return { id: article.id, address, decoded, status: response.status, final_url: response.url, bytes: html.length };
  } catch (error) {
    return { id: article.id, address, decoded, error: `${error.name}: ${error.message}`.slice(0, 200) };
  }
}

/**
 * Fetches every article not fetched yet, a few at a time, and records the outcomes.
 */
async function main() {
  mkdirSync(PAGES, { recursive: true });
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const record = existsSync(RECORD) && !process.argv.includes("--again") ? JSON.parse(readFileSync(RECORD, "utf8")) : {};
  const waiting = articles.filter((article) => !record[article.id]?.status || record[article.id].status !== 200);

  // A small pool of workers, each taking the next article in turn.
  let next = 0;
  async function worker() {
    while (next < waiting.length) {
      const article = waiting[next];
      next += 1;
      record[article.id] = await fetchOne(article);
      console.log(article.id, record[article.id].status ?? record[article.id].error);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  mkdirSync(DATA, { recursive: true });
  writeFileSync(RECORD, JSON.stringify(record, null, 1));
}

await main();
