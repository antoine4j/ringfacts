// Step 3: probes each outlet step 2 picked, once and politely: one request
// per page or feed address, a browser's headers, a 10-second limit, no
// retries, one second between requests. For each outlet: does its homepage
// and one of its article pages answer, or answer with Cloudflare's bot check?
// Does it publish an RSS or Atom feed (announced on the homepage, or at a
// common address)? If a feed answers: how many items, how long their text
// is (full text or a teaser), and how many name each fighter.
//
//   node probe.mjs
//
// Reads data/targets.json (from outlets.mjs). Writes results.json ("probes")
// and data/probe-feeds.json (feed headlines: git-ignored).

import { readFileSync, writeFileSync } from "node:fs";
import { parseFeedItems, OUTLETS } from "../../../lib/feeds.js";
import { htmlToText } from "../../../lib/extract.js";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";
import { saveResults } from "./load.mjs";

const TIMEOUT_MS = 10_000;
const PAUSE_MS = 1_000;
const FULL_TEXT_MEDIAN = 800;
const COMMON_FEED_PATHS = ["/rss", "/feed", "/rss.xml", "/feed.xml", "/rss/all", "/news/rss"];
const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9,uk;q=0.8,es;q=0.7",
};
// Feeds already known for a host: production's outlet feeds and the 5 Oct spike's finds.
const KNOWN_FEEDS = {
  ...Object.fromEntries(OUTLETS.map((outlet) => [new URL(outlet.url).host.replace(/^www\./, ""), outlet.url])),
  "marca.com": "https://e00-marca.uecdn.es/rss/mma.xml",
  "mmaweekly.com": "https://mmaweekly.com/feed",
  "athlonsports.com": "https://athlonsports.com/rss",
};

/**
 * Waits between requests.
 *
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * One GET, recorded: status, whether Cloudflare's bot check answered, the
 * final host after redirects, and the body (kept in memory only).
 *
 * @param {string} address
 * @returns {Promise<{address: string, status: number|string, cloudflare_check: boolean, final_host: string|null, body: string}>}
 */
async function probe(address) {
  await pause(PAUSE_MS);
  try {
    const response = await fetch(address, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await response.text();
    const challengeText = /Just a moment|cf-chl|challenge-platform/i.test(body);
    const cloudflareCheck = response.headers.get("cf-mitigated") === "challenge" || ((response.status === 403 || response.status === 503) && challengeText);
    return { address, status: response.status, cloudflare_check: cloudflareCheck, final_host: new URL(response.url).host, body };
  } catch (error) {
    const kind = error.name === "TimeoutError" ? "timeout" : `error-${error.cause?.code ?? error.name}`;
    return { address, status: kind, cloudflare_check: false, final_host: null, body: "" };
  }
}

/**
 * The feed addresses a homepage announces with <link rel="alternate" type="application/rss+xml|atom+xml">.
 *
 * @param {string} html
 * @param {string} base  The homepage address, for relative links.
 * @returns {string[]}
 */
function announcedFeeds(html, base) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]);
  const feedLinks = links.filter((tag) => /rel=["']?alternate/i.test(tag) && /application\/(rss|atom)\+xml/i.test(tag));
  const addresses = feedLinks.map((tag) => tag.match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean);
  return [...new Set(addresses.map((href) => new URL(href.replace(/&amp;/g, "&"), base).href))];
}

/**
 * Reads a feed's items: count, median text length, and items naming each fighter.
 *
 * @param {string} xml
 * @returns {{items: number, median_text: number, full_text: boolean, naming: object, readable_items: object, headlines: object[]}|null}  null when the body is not a feed.
 */
function describeFeed(xml) {
  const isFeed = /<(rss|feed|rdf:RDF)\b/i.test(xml.slice(0, 2000));
  const items = isFeed ? parseFeedItems(xml) : [];
  if (items.length === 0) return null;

  // Text length of each item's richest body field, tags stripped.
  const texts = items.map((item) => (item.feedContent ? htmlToText(item.feedContent) : ""));
  const lengths = texts.map((text) => text.length).sort((left, right) => left - right);
  const median = lengths[Math.floor(lengths.length / 2)];

  // Per fighter: items naming them anywhere, and items whose own text would pass the readable bar.
  const naming = {};
  const readableItems = {};
  for (const subject of SUBJECTS) {
    const named = items.map((item, index) => mentionsName(`${item.title} ${texts[index]}`, subject.matchNames));
    naming[subject.name] = named.filter(Boolean).length;
    readableItems[subject.name] = texts.filter((text) => text.length >= 400 && mentionsName(text, subject.matchNames)).length;
  }
  const headlines = items.map((item) => ({ title: item.title, url: item.url, published: item.publishedAt }));
  return { items: items.length, median_text: median, full_text: median >= FULL_TEXT_MEDIAN, naming, readable_items: readableItems, headlines };
}

/**
 * Tries an outlet's candidate feed addresses in order and stops at the first that is a feed.
 *
 * @param {string} host
 * @param {string[]} announced  Addresses the homepage announced.
 * @returns {Promise<{tried: object[], feed: object|null}>}
 */
async function findFeed(host, announced) {
  const commonAddresses = COMMON_FEED_PATHS.map((path) => `https://${host}${path}`);
  const candidates = [...new Set([KNOWN_FEEDS[host], ...announced, ...commonAddresses].filter(Boolean))];
  const tried = [];
  for (const address of candidates) {
    const answer = await probe(address);
    const feed = typeof answer.status === "number" && answer.status < 400 ? describeFeed(answer.body) : null;
    tried.push({ address, status: answer.status, cloudflare_check: answer.cloudflare_check, is_feed: Boolean(feed) });
    if (feed) return { tried, feed: { address, ...feed } };
  }
  return { tried, feed: null };
}

/**
 * Probes one outlet: homepage, one article page, then its feed.
 *
 * @param {{host: string, article: string|null, reasons: string[]}} target
 * @returns {Promise<object>}
 */
async function probeOutlet(target) {
  const home = await probe(`https://${target.host}/`);
  const article = target.article ? await probe(target.article) : null;
  const homeAnswered = typeof home.status === "number" && home.status < 400;
  const announced = homeAnswered ? announcedFeeds(home.body, `https://${target.host}/`) : [];
  const { tried, feed } = await findFeed(target.host, announced);
  const summarize = (answer) => answer && { status: answer.status, cloudflare_check: answer.cloudflare_check, final_host: answer.final_host };
  return { host: target.host, reasons: target.reasons, home: summarize(home), article: summarize(article), announced, tried, feed };
}

/**
 * Probes every target and writes the record.
 */
async function main() {
  const targets = JSON.parse(readFileSync(new URL("./data/targets.json", import.meta.url), "utf8"));
  const probes = [];
  for (const target of targets) {
    const outcome = await probeOutlet(target);
    console.log(`${outcome.host}: home ${outcome.home.status}${outcome.home.cloudflare_check ? " (check)" : ""}, article ${outcome.article?.status ?? "-"}, feed ${outcome.feed ? `${outcome.feed.address} ${outcome.feed.items} items, median ${outcome.feed.median_text}` : "none"}`);
    probes.push(outcome);
  }

  // Headlines stay in data/; the tracked record keeps counts and statuses.
  writeFileSync(new URL("./data/probe-feeds.json", import.meta.url), JSON.stringify(probes.map((outcome) => ({ host: outcome.host, feed: outcome.feed })), null, 1));
  const tracked = probes.map((outcome) => ({ ...outcome, feed: outcome.feed && { ...outcome.feed, headlines: undefined } }));
  saveResults("probes", tracked);
}

await main();
