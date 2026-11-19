// Step 2: per fighter, which outlets carry the news and how much of each
// production could read. One row per outlet, sorted by article count: the
// share of the fighter's articles it carries, how many passed the readable
// bar (over the whole window and its last 30 days), and why the rest failed.
// Also lists the outlets Google News brought for Amosov or Donchenko that
// production does not read as a direct feed (measure 5), and picks the
// outlets step 3 probes.
//
//   node outlets.mjs
//
// Writes results.json ("outlets", "not_direct") and data/targets.json
// (the outlets to probe, each with one article address: git-ignored).

import { writeFileSync } from "node:fs";
import { loadArticles, saveResults, DIRECT_FEED_HOSTS, FIGHTERS } from "./load.mjs";
import { WINDOW_END } from "./pull.mjs";

const RECENT_DAYS = 30;
const MIN_ARTICLES_TO_PROBE = 3;
const MOSTLY_UNREADABLE = 0.5;
const READING_RUNGS = new Set(["feed-content", "json-ld", "article-tag", "paragraphs"]);

/**
 * The reason an article did not pass the readable bar: the reader's failure,
 * or "short-or-unnamed" when a reading rung returned text that was too short
 * or did not name the fighter.
 *
 * @param {object} article
 * @returns {string}
 */
function failureKind(article) {
  return READING_RUNGS.has(article.body_via) ? "short-or-unnamed" : article.body_via;
}

/**
 * Counts one fighter's articles per outlet.
 *
 * @param {object[]} articles  One fighter's articles.
 * @returns {object[]}  One row per outlet, most articles first.
 */
function outletRows(articles) {
  const recentSince = new Date(WINDOW_END).getTime() - RECENT_DAYS * 86_400_000;
  const rows = new Map();
  for (const article of articles) {
    const row = rows.get(article.outlet) ?? { outlet: article.outlet, articles: 0, readable: 0, recent: 0, recent_readable: 0, failures: {} };
    const isRecent = new Date(article.seen_at).getTime() >= recentSince;
    row.articles += 1;
    row.readable += article.readable ? 1 : 0;
    row.recent += isRecent ? 1 : 0;
    row.recent_readable += isRecent && article.readable ? 1 : 0;
    if (!article.readable) row.failures[failureKind(article)] = (row.failures[failureKind(article)] ?? 0) + 1;
    rows.set(article.outlet, row);
  }

  // Shares are of the fighter's whole count; the sort puts the biggest outlets first.
  const sorted = [...rows.values()].sort((left, right) => right.articles - left.articles || left.outlet.localeCompare(right.outlet));
  for (const row of sorted) {
    row.share_of_fighter = round(row.articles / articles.length);
    row.readable_share = round(row.readable / row.articles);
  }
  return sorted;
}

/**
 * Rounds a share to two decimals.
 *
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * One fighter's totals: articles, readable, and the same over the last 30 days.
 *
 * @param {object[]} rows  The fighter's outlet rows.
 * @returns {object}
 */
function fighterTotals(rows) {
  const sum = (field) => rows.reduce((total, row) => total + row[field], 0);
  return {
    articles: sum("articles"),
    readable: sum("readable"),
    readable_share: round(sum("readable") / sum("articles")),
    recent: sum("recent"),
    recent_readable: sum("recent_readable"),
    outlets: rows.length,
  };
}

/**
 * The outlets Google News brought for Amosov or Donchenko that production
 * does not read as a direct feed, with counts and readability.
 *
 * @param {object[]} articles  All counted articles.
 * @returns {object[]}
 */
function notDirectOutlets(articles) {
  const fromGoogle = articles.filter((article) => {
    const isSmallFighter = article.subject !== "Ilia Topuria";
    const viaSearch = article.found_via && !article.found_via.startsWith("direct");
    return isSmallFighter && viaSearch && !DIRECT_FEED_HOSTS.includes(article.outlet);
  });
  const rows = outletRows(fromGoogle);

  // Per row, how many of its articles were each fighter's.
  for (const row of rows) {
    const own = fromGoogle.filter((article) => article.outlet === row.outlet);
    row.amosov = own.filter((article) => article.subject === "Yaroslav Amosov").length;
    row.donchenko = own.filter((article) => article.subject === "Daniil Donchenko").length;
  }
  return rows;
}

/**
 * The outlets to probe: any carrying 3 or more of a fighter's articles that
 * is mostly unreadable, plus any carrying 3 or more of Amosov's or
 * Donchenko's (readable or not), since a feed there is a direct route too.
 *
 * @param {object} perFighter  Fighter name to outlet rows.
 * @param {object[]} articles
 * @returns {object[]}  `{ host, reasons, article }`, article being the newest address seen there.
 */
function probeTargets(perFighter, articles) {
  const targets = new Map();
  for (const [fighter, rows] of Object.entries(perFighter)) {
    for (const row of rows) {
      const bigEnough = row.articles >= MIN_ARTICLES_TO_PROBE;
      const mostlyUnreadable = row.readable_share < MOSTLY_UNREADABLE;
      const isSmallFighter = fighter !== "Ilia Topuria";
      if (!bigEnough || !(mostlyUnreadable || isSmallFighter)) continue;
      const target = targets.get(row.outlet) ?? { host: row.outlet, reasons: [] };
      target.reasons.push(`${fighter}: ${row.readable}/${row.articles} readable`);
      targets.set(row.outlet, target);
    }
  }

  // Each target gets the newest real article address seen at it.
  for (const target of targets.values()) {
    const atOutlet = articles.filter((article) => article.outlet === target.host && !article.address.includes("news.google.com"));
    const newest = atOutlet.sort((left, right) => new Date(right.seen_at) - new Date(left.seen_at))[0];
    target.article = newest?.address ?? null;
    target.article_id = newest?.id ?? null;
  }
  return [...targets.values()];
}

/**
 * Counts every fighter's outlets and writes the tables and probe targets.
 */
function main() {
  const articles = loadArticles();
  const perFighter = {};
  const totals = {};
  for (const fighter of FIGHTERS) {
    perFighter[fighter] = outletRows(articles.filter((article) => article.subject === fighter));
    totals[fighter] = fighterTotals(perFighter[fighter]);
  }
  const targets = probeTargets(perFighter, articles);

  saveResults("outlets", { totals, per_fighter: perFighter });
  saveResults("not_direct", notDirectOutlets(articles));
  saveResults("probe_targets", targets.map(({ host, reasons, article_id }) => ({ host, reasons, article_id })));
  writeFileSync(new URL("./data/targets.json", import.meta.url), JSON.stringify(targets, null, 1));
  console.log(JSON.stringify(totals, null, 1));
  console.log(`${targets.length} outlets to probe: ${targets.map((target) => target.host).join(", ")}`);
}

main();
