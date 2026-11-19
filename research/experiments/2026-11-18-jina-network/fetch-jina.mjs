// Step 2: each chosen address once through keyless Jina, asked for the page's
// HTML (X-Respond-With: html), the mode the architecture names, then read by
// our extractor and by Readability as the 2026-10-22 reading-order experiment
// did (jina-html.mjs). One request every 3.2 seconds at the fastest, one at a
// time, and a stop at the first sign of rate limiting.
//
//   node fetch-jina.mjs            # asks Jina, saves the pages, scores them
//   node fetch-jina.mjs --rescore  # no requests: scores the pages an earlier run saved
//
// Reads data/targets.json (select.mjs). Writes data/pages/<id>.html and
// data/raw-log.json (git-ignored: Jina's responses) and results.json (ids,
// outlets, status codes and yes/no verdicts, no addresses or text).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { extractFromHtml } from "../../../lib/extract.js";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";
import { dataDirectory, OUTLETS } from "./select.mjs";

const GAP_MS = 3_200;
const MIN_READABLE_CHARS = 400;
const READING_RUNGS = new Set(["json-ld", "article-tag", "paragraphs"]);
const HEADLINE_WORD_MIN_LENGTH = 4;
const HEADLINE_MATCH_SHARE = 0.5;
const MAX_HTML_CHARS = 1_500_000;
// Words in a page that say a bot check, an access block or a network wall, not an article.
const BLOCK_MARKERS = [
  ["cloudflare-block", ["attention required", "sorry, you have been blocked", "just a moment", "enable javascript and cookies"]],
  ["vpn-wall", ["disable your vpn", "using a vpn may disrupt"]],
  ["access-denied", ["access denied", "request blocked", "403 forbidden", "captcha"]],
];
const RESCORE = process.argv.includes("--rescore");
// Response headers worth keeping: they say how Jina is metering the call.
const KEPT_HEADERS = ["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "content-type", "cf-ray", "server"];

/**
 * Whether a response shows Jina limiting the caller: a 429, a retry-after header,
 * an exhausted allowance header, or the words in the body.
 *
 * @param {number} status
 * @param {Record<string, string>} headers  The kept headers.
 * @param {string} body
 * @returns {boolean}
 */
function showsRateLimit(status, headers, body) {
  const remaining = headers["x-ratelimit-remaining"];
  const exhausted = remaining !== undefined && Number(remaining) <= 0;
  // The wording counts only on an error response, so an article that mentions a quota cannot stop the run.
  const wording = status >= 400 && /rate.?limit|too many requests|quota/i.test(body.slice(0, 2_000));
  return status === 429 || Boolean(headers["retry-after"]) || exhausted || wording;
}

/**
 * Which kind of block page answered instead of the article, or null when none did.
 *
 * @param {string} html
 * @returns {string|null}  "cloudflare-block", "vpn-wall", "access-denied" or null.
 */
function blockKind(html) {
  const lower = html.slice(0, 20_000).toLowerCase();
  const found = BLOCK_MARKERS.find(([, markers]) => markers.some((marker) => lower.includes(marker)));
  return found ? found[0] : null;
}

/**
 * Whether the page carries the article's headline: at least half of the
 * headline's longer words appear in the page's title, headings or opening text.
 *
 * @param {string} headline  Production's stored headline (outlet name after " - " is dropped).
 * @param {string} html
 * @param {string|null} text  What our extractor read.
 * @returns {boolean}
 */
function headlineMatches(headline, html, text) {
  const withoutOutlet = headline.replace(/\s+[-|–]\s+[^-|–]+$/, "");
  const words = withoutOutlet.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= HEADLINE_WORD_MIN_LENGTH);
  if (words.length === 0) return false;
  const titleAndHeadings = [...html.matchAll(/<(title|h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]).join(" ");
  const haystack = `${titleAndHeadings} ${(text ?? "").slice(0, 3_000)}`.toLowerCase();
  const found = words.filter((word) => haystack.includes(word));
  return found.length / words.length >= HEADLINE_MATCH_SHARE;
}

/**
 * Whether a text passes the readable bar for a fighter: a reading rung, at least
 * 400 characters, naming the fighter.
 *
 * @param {string|null} text
 * @param {string} via  The extractor's rung.
 * @param {string} fighter
 * @returns {boolean}
 */
function passesBar(text, via, fighter) {
  if (!text || !READING_RUNGS.has(via)) return false;
  const matchNames = SUBJECTS.find((subject) => subject.name === fighter).matchNames;
  return text.length >= MIN_READABLE_CHARS && mentionsName(text, matchNames);
}

/**
 * Readability's text for a page, or null when it finds none.
 *
 * @param {string} html
 * @param {string} address
 * @returns {string|null}
 */
function readabilityText(html, address) {
  const dom = new JSDOM(html, { url: address, virtualConsole: new VirtualConsole() });
  const parsed = new Readability(dom.window.document).parse();
  dom.window.close();
  return parsed?.textContent?.replace(/\s+/g, " ").trim() || null;
}

/**
 * One address through Jina, the page saved. Nothing is read from it here.
 *
 * @param {{id: number, outlet: string, subject: string, address: string}} target
 * @param {string} pagesDirectory  Where the returned page is saved.
 * @returns {Promise<object>}  The row so far: status, size, kept headers, milliseconds, `rateLimited`.
 */
async function askJina(target, pagesDirectory) {
  const started = Date.now();
  const row = { id: target.id, outlet: target.outlet, subject: target.subject };
  try {
    const response = await fetch(`https://r.jina.ai/${target.address}`, { headers: { "X-Respond-With": "html", "X-Timeout": "20", DNT: "1" }, signal: AbortSignal.timeout(40_000) });
    const body = (await response.text()).slice(0, MAX_HTML_CHARS);
    const headers = Object.fromEntries(KEPT_HEADERS.filter((name) => response.headers.has(name)).map((name) => [name, response.headers.get(name)]));
    writeFileSync(join(pagesDirectory, `${target.id}.html`), body);
    Object.assign(row, { status: response.status, bytes: body.length, headers, ms: Date.now() - started });
    row.rateLimited = showsRateLimit(response.status, headers, body);
  } catch (error) {
    Object.assign(row, { status: `error-${error.name}`, ms: Date.now() - started, rateLimited: false });
  }
  return row;
}

/**
 * Reads a saved page: the block kind, our extractor, Readability, the headline,
 * and whether the page is usable (passes the bar, and is not a block page).
 *
 * @param {object} row  From askJina.
 * @param {{address: string, title: string}} target
 * @param {string} pagesDirectory
 * @returns {object}  The row with the verdict fields added; an error status stays as it is.
 */
function scoreRow(row, target, pagesDirectory) {
  if (row.status !== 200) return row;
  const body = readFileSync(join(pagesDirectory, `${row.id}.html`), "utf8");
  const ours = extractFromHtml(body);
  const readability = readabilityText(body, target.address);
  const matchNames = SUBJECTS.find((subject) => subject.name === row.subject).matchNames;
  const block = blockKind(body);

  // A block page that happens to hold 400 characters naming nobody still fails the bar; usable also needs no block.
  const readableOurs = passesBar(ours.text, ours.via, row.subject);
  const readableReadability = passesBar(readability, "paragraphs", row.subject);
  const headlineMatch = headlineMatches(target.title, body, ours.text);
  const usable = (readableOurs || readableReadability) && block === null;
  return {
    ...row,
    blockPage: block,
    rung: ours.via,
    chars: ours.text?.length ?? 0,
    namesFighter: Boolean(ours.text) && mentionsName(ours.text, matchNames),
    readableOurs,
    readableReadability,
    headlineMatch,
    usable,
    usableWithHeadline: usable && headlineMatch,
  };
}

/**
 * Per outlet: requests, statuses, block pages and how many came back usable.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
function summarise(rows) {
  return OUTLETS.map((outlet) => {
    const own = rows.filter((row) => row.outlet === outlet);
    const statuses = {};
    const blockPages = {};
    for (const row of own) statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    for (const row of own.filter((candidate) => candidate.blockPage)) blockPages[row.blockPage] = (blockPages[row.blockPage] ?? 0) + 1;
    const count = (field) => own.filter((row) => row[field]).length;
    return { outlet, requests: own.length, statuses, blockPages, usable: count("usable"), usableByOurExtractor: count("readableOurs"), usableAlsoMatchingHeadline: count("usableWithHeadline"), rateLimited: count("rateLimited") };
  });
}

/**
 * Asks Jina for every target in turn, a gap apart, stopping at the first rate
 * limit; or, with --rescore, scores the pages and statuses an earlier run saved.
 */
async function main() {
  const directory = dataDirectory();
  const pagesDirectory = join(directory, "pages");
  mkdirSync(pagesDirectory, { recursive: true });
  const targets = JSON.parse(readFileSync(join(directory, "targets.json"), "utf8"));
  const earlier = RESCORE ? JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8")) : null;

  const rows = [];
  let stoppedAt = null;
  for (const target of targets) {
    const earlierRow = earlier?.rows.find((candidate) => candidate.id === target.id);
    if (RESCORE && !earlierRow) continue;
    const asked = RESCORE ? earlierRow : await askJina(target, pagesDirectory);
    const row = scoreRow(asked, target, pagesDirectory);
    rows.push(row);
    console.log(row.outlet, row.id, row.status, row.rung ?? "", row.chars ?? "", row.blockPage ?? "", row.usable ?? "", row.rateLimited ? "RATE LIMIT" : "");
    if (row.rateLimited) {
      stoppedAt = row.id;
      break;
    }
    if (!RESCORE) await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }

  const ranAt = RESCORE ? earlier.ranAt : new Date().toISOString();
  const results = { ranAt, requests: rows.length, stoppedAtRateLimitOnId: stoppedAt ?? earlier?.stoppedAtRateLimitOnId ?? null, perOutlet: summarise(rows), rows };
  writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1) + "\n");
  console.log(JSON.stringify(results.perOutlet));
}

await main();
