// Step 2: fetch every sampled page once, as v0 would: Google's wrapped link
// decoded the way production does (lib/googlenews.js), then one download with
// a browser's headers and a 10-second limit, production's own.
//
//   node fetch.mjs
//
// Writes data/pages/<id>.html and data/fetch.json (decode outcome, status,
// final address, size, milliseconds per article).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { decodeGoogleNewsUrl, isGoogleWrapped } from "../../../lib/googlenews.js";

const PAGES = new URL("./data/pages/", import.meta.url);
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PARALLEL = 6;

/**
 * Decodes and fetches one article's page.
 *
 * @param {{id: number, url: string, resolved_url: string|null}} article
 * @returns {Promise<object>} What happened, without the page.
 */
async function fetchOne(article) {
  const wrapped = isGoogleWrapped(article.url);
  const decodeStarted = Date.now();
  const decoded = wrapped ? await decodeGoogleNewsUrl(article.url) : article.url;
  const decodeMs = Date.now() - decodeStarted;
  const row = { id: article.id, wrapped, decoded: Boolean(decoded), decode_ms: decodeMs, address: decoded };
  if (!decoded) return row;

  // One attempt, a refusal recorded, not retried.
  const started = Date.now();
  try {
    const response = await fetch(decoded, {
      headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    if (response.ok) writeFileSync(new URL(`${article.id}.html`, PAGES), html);
    return { ...row, status: response.status, final_url: response.url, bytes: html.length, fetch_ms: Date.now() - started };
  } catch (error) {
    return { ...row, status: error.name === "TimeoutError" ? "timeout" : `error-${error.name}`, fetch_ms: Date.now() - started };
  }
}

/**
 * Fetches every sampled article, a few at a time.
 */
async function main() {
  mkdirSync(PAGES, { recursive: true });
  const sample = JSON.parse(readFileSync(new URL("./data/sample.json", import.meta.url), "utf8"));
  const record = {};
  let next = 0;
  async function worker() {
    while (next < sample.length) {
      const article = sample[next];
      next += 1;
      record[article.id] = await fetchOne(article);
      console.log(article.id, record[article.id].status ?? "no decode");
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  writeFileSync(new URL("./data/fetch.json", import.meta.url), JSON.stringify(record, null, 1));
}

await main();
