// Step 1: fetch every page that failed on 20 or 22 October once more, plus 20
// pages that came back on 22 October as a control. The same method as both
// earlier runs: browser headers, redirects followed, no retry. The 10-second
// limit is the reading-order run's (the clean-text run allowed 25). At most
// two requests are in flight. No Jina, no model.
//
//   node fetch.mjs
//
// Writes data/fetch.json (status, final address, size, milliseconds, whether
// the body is Cloudflare's bot check, per page id) and data/pages/<id>.html
// for each page that came back. Both are git-ignored.

import { writeFileSync, mkdirSync } from "node:fs";
import { buildTargets } from "./targets.mjs";

const PAGES = new URL("./data/pages/", import.meta.url);
const RECORD = new URL("./data/fetch.json", import.meta.url);
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;
const IN_FLIGHT = 2;
const PAUSE_MS = 250;

/**
 * Whether a response is Cloudflare's bot check rather than the page.
 *
 * @param {string} body  The response body.
 * @param {Headers} headers  The response headers.
 * @returns {boolean}
 */
function looksLikeBotCheck(body, headers) {
  const markers = ["Just a moment", "cf-browser-verification"];
  const bodyHasMarker = markers.some((marker) => body.includes(marker));
  const headerSaysChallenge = headers.get("cf-mitigated") === "challenge";
  return bodyHasMarker || headerSaysChallenge;
}

/**
 * Fetches one address once and writes the page if it came back.
 *
 * @param {string} id  The article id.
 * @param {string} address  The address both earlier runs fetched.
 * @returns {Promise<object>}  What happened, without the page.
 */
async function fetchOne(id, address) {
  const started = Date.now();
  try {
    const response = await fetch(address, {
      headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml", "accept-language": "en,uk;q=0.8,es;q=0.6" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await response.text();
    if (response.ok) writeFileSync(new URL(`${id}.html`, PAGES), html);
    const botCheck = looksLikeBotCheck(html, response.headers);
    return { id, address, status: response.status, final_url: response.url, bytes: html.length, ms: Date.now() - started, bot_check: botCheck };
  } catch (error) {
    const status = error.name === "TimeoutError" ? "timeout" : `error-${error.name}`;
    return { id, address, status, cause: error.cause?.code ?? null, ms: Date.now() - started };
  }
}

/**
 * Fetches every target, two at a time, and records the outcomes.
 */
async function main() {
  mkdirSync(PAGES, { recursive: true });
  const { rows, ids } = buildTargets();
  const addressById = Object.fromEntries(rows.map((row) => [row.id, row.address]));
  const record = { fetched_at: new Date().toISOString(), pages: {} };

  // Two workers, each taking the next id in turn and pausing briefly after each request.
  let next = 0;
  /**
   * One worker: takes the next id until none are left.
   */
  async function worker() {
    while (next < ids.length) {
      const id = ids[next];
      next += 1;
      record.pages[id] = await fetchOne(id, addressById[id]);
      console.log(id, record.pages[id].status);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }
  await Promise.all(Array.from({ length: IN_FLIGHT }, worker));
  record.finished_at = new Date().toISOString();
  writeFileSync(RECORD, JSON.stringify(record, null, 1));
  console.log(`${ids.length} pages fetched`);
}

await main();
