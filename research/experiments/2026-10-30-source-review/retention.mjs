// Step 6: how long a feed keeps an article listed. Fetches once each feed
// production reads (Google News's search per fighter and language, the six
// outlet feeds) plus MMAWeekly's and Athlon's (Launch Map task 1.3): how many
// items, and the age of the newest and oldest. One request each, a browser's
// headers, 10 seconds, no retries, one second apart. The feeds step 3 found
// are added from its saved copy, without a new request.
//
// A second view from production's own record: for each feed, how long after
// publication production first stored an article it listed. Production only
// takes items published in the last 24 hours (hunter.js HOURS_BACK), so this
// measures that window binding, not how long the feed keeps an article.
//
//   node retention.mjs
//
// A third view needs no request: of the articles production found through
// each Google search, how many today's copy of that search still lists.
//
// Writes results.json ("retention", "listing_delay", "still_listed") and
// data/retention-items.json (each feed's headlines and dates: git-ignored).

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { parseFeedItems, OUTLETS } from "../../../lib/feeds.js";
import { SUBJECTS } from "../../../watchlist.js";
import { saveResults } from "./load.mjs";

const TIMEOUT_MS = 10_000;
const PAUSE_MS = 1_000;
const DAY_MS = 86_400_000;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// The language and country settings production sends per edition (hunter.js EDITIONS).
const EDITIONS = { en: "hl=en-US&gl=US&ceid=US:en", uk: "hl=uk&gl=UA&ceid=UA:uk", es: "hl=es&gl=ES&ceid=ES:es" };
// Production's first run listed every older article at once; delays start counting after it.
const FIRST_RUN_END = "2026-08-08T00:00:00Z";

/**
 * Every feed to fetch: Google's searches, production's outlet feeds, MMAWeekly and Athlon.
 *
 * @returns {{name: string, address: string}[]}
 */
function feedList() {
  const searches = SUBJECTS.flatMap((subject) => subject.aliases.map((alias) => ({
    name: `google ${alias.edition} ${alias.query}`,
    address: `https://news.google.com/rss/search?q=${encodeURIComponent(alias.query)}&${EDITIONS[alias.edition]}`,
  })));
  const outlets = OUTLETS.map((outlet) => ({ name: `direct ${outlet.id}`, address: outlet.url }));
  const candidates = [
    { name: "candidate mmaweekly", address: "https://mmaweekly.com/feed" },
    { name: "candidate athlon", address: "https://athlonsports.com/rss" },
  ];
  return [...searches, ...outlets, ...candidates];
}

/**
 * Item count and the newest and oldest item's age in days at a given moment.
 *
 * @param {{publishedAt: Date|string}[]} items
 * @param {number} at  Milliseconds since 1970: when the feed was read.
 * @returns {{items: number, dated: number, newest_days: number|null, median_days: number|null, oldest_days: number|null, within_1d: number, within_7d: number}}
 */
function ages(items, at) {
  const days = items.map((item) => (at - new Date(item.publishedAt).getTime()) / DAY_MS)
    .filter((value) => Number.isFinite(value) && value > -1 && value < 3650)
    .sort((left, right) => left - right);
  const round = (value) => (value === undefined ? null : Math.round(value * 10) / 10);
  const within = (limit) => days.filter((value) => value <= limit).length;
  return {
    items: items.length,
    dated: days.length,
    newest_days: round(days[0]),
    median_days: round(days[Math.floor(days.length / 2)]),
    oldest_days: round(days.at(-1)),
    within_1d: within(1),
    within_7d: within(7),
  };
}

/**
 * Fetches one feed once and describes its items' ages.
 *
 * @param {{name: string, address: string}} feed
 * @param {object} saved  Collects each feed's item dates and headlines for data/.
 * @returns {Promise<object>}
 */
async function readFeed(feed, saved) {
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  try {
    const response = await fetch(feed.address, { headers: { "user-agent": BROWSER_UA, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const xml = await response.text();
    const items = response.ok ? parseFeedItems(xml) : [];
    saved[feed.name] = items.map((item) => ({ title: item.title, url: item.url, published: item.publishedAt }));
    return { name: feed.name, host: new URL(feed.address).host, status: response.status, ...ages(items, Date.now()) };
  } catch (error) {
    return { name: feed.name, host: new URL(feed.address).host, status: error.name === "TimeoutError" ? "timeout" : `error-${error.name}`, items: 0 };
  }
}

/**
 * The feeds step 3 found, aged at the moment it saved them.
 *
 * @returns {object[]}
 */
function probedFeeds() {
  const file = new URL("./data/probe-feeds.json", import.meta.url);
  const savedAt = statSync(file).mtimeMs;
  const probes = JSON.parse(readFileSync(file, "utf8")).filter((outcome) => outcome.feed);
  return probes.map((outcome) => ({ name: `probed ${outcome.host}`, host: new URL(outcome.feed.address).host, status: 200, ...ages(outcome.feed.headlines.map((headline) => ({ publishedAt: headline.published })), savedAt) }));
}

/**
 * Production's delay from publication to first storing, per feed (found_via),
 * after its first run: median, 90th percentile and longest, in days.
 *
 * @returns {object}
 */
function listingDelays() {
  const items = JSON.parse(readFileSync(new URL("./data/items.json", import.meta.url), "utf8"));
  const byFeed = new Map();
  for (const item of items) {
    const afterFirstRun = new Date(item.seen_at) >= new Date(FIRST_RUN_END);
    if (!afterFirstRun || !item.published_at || !item.found_via) continue;
    const delay = (new Date(item.seen_at) - new Date(item.published_at)) / DAY_MS;
    byFeed.set(item.found_via, [...(byFeed.get(item.found_via) ?? []), delay]);
  }

  // Sorted delays give the median, the 90th percentile and the longest.
  const delays = {};
  for (const [feed, values] of byFeed) {
    values.sort((left, right) => left - right);
    const pick = (share) => Math.round(values[Math.min(values.length - 1, Math.floor(values.length * share))] * 10) / 10;
    delays[feed] = { items: values.length, median_days: pick(0.5), p90_days: pick(0.9), longest_days: Math.round(values.at(-1) * 10) / 10 };
  }
  return delays;
}

/**
 * A headline reduced for matching: lower case, Google's " - Outlet" tail and punctuation dropped.
 *
 * @param {string|null} title
 * @returns {string}
 */
function headlineKey(title) {
  const withoutOutlet = (title ?? "").toLowerCase().replace(/\s+-\s+[^-]+$/, "");
  return withoutOutlet.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * For each Google search, of the articles production found through it, how
 * many today's feed still lists (same feed address or same headline), by how
 * long ago production stored them. Direct evidence of how long Google keeps
 * an article listed.
 *
 * Reads today's copy from data/retention-items.json, aged at the moment it was saved.
 *
 * @returns {object}
 */
export function stillListed() {
  const savedFile = new URL("./data/retention-items.json", import.meta.url);
  const readAt = statSync(savedFile).mtimeMs;
  const saved = JSON.parse(readFileSync(savedFile, "utf8"));
  const items = JSON.parse(readFileSync(new URL("./data/items.json", import.meta.url), "utf8"));
  const buckets = [["0-7 days", 0, 7], ["7-30 days", 7, 30], ["30-90 days", 30, 90]];
  const results = {};
  for (const [name, listed] of Object.entries(saved)) {
    if (!name.startsWith("google ")) continue;
    const addresses = new Set(listed.map((item) => item.url));
    const headlines = new Set(listed.map((item) => headlineKey(item.title)));
    const found = items.filter((item) => item.found_via === name.replace("google ", ""));

    // Per age bucket: articles found, and how many of them are still listed.
    results[name] = {};
    for (const [label, from, to] of buckets) {
      const inBucket = found.filter((item) => {
        const age = (readAt - new Date(item.seen_at).getTime()) / DAY_MS;
        return age >= from && age < to;
      });
      const listedNow = inBucket.filter((item) => addresses.has(item.feed_url) || headlines.has(headlineKey(item.title)));
      results[name][label] = { found: inBucket.length, still_listed: listedNow.length };
    }
  }
  return results;
}

/**
 * Reads every feed once, adds the probed ones and production's delays, and saves the tables.
 */
async function main() {
  const fetched = [];
  const saved = {};
  for (const feed of feedList()) {
    const outcome = await readFeed(feed, saved);
    console.log(`${outcome.name}: ${outcome.status}, ${outcome.items} items, newest ${outcome.newest_days} d, oldest ${outcome.oldest_days} d`);
    fetched.push(outcome);
  }
  writeFileSync(new URL("./data/retention-items.json", import.meta.url), JSON.stringify(saved, null, 1));
  const retention = { read_at: new Date().toISOString(), feeds: [...fetched, ...probedFeeds()] };
  const delays = listingDelays();
  saveResults("retention", retention);
  saveResults("listing_delay", delays);
  saveResults("still_listed", stillListed());
  console.log(JSON.stringify(delays, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
