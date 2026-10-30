// Step 5: how much of what we cannot read is news we have anyway. For every
// article (Topuria's for comparison) that failed the readable bar, is there a
// readable article about the same fighter carrying the same story? Three
// tests, strict to loose: the same slug (the rule in ../2026-10-22-addresses/);
// the same story in production's own grouping (story_id, which a model
// decides and which crosses languages); or headlines sharing at least 60% of
// their words within 48 hours. A fourth,
// looser count is an upper bound only: any readable article about the same
// fighter within 48 hours, whatever its story. Last, the share of the
// fighter's stories with at least one readable article, and the ceiling a
// free route could reach while the outlets behind Cloudflare's check (and
// without a full-text feed) refuse.
//
//   node copies.mjs
//
// Reads data/items.json through load.mjs and results.json ("probes", from
// probe.mjs). Writes results.json ("copies").

import { readFileSync } from "node:fs";
import { slugOf } from "../2026-10-22-addresses/slugs.mjs";
import { loadArticles, saveResults, FIGHTERS } from "./load.mjs";

const WINDOW_MS = 48 * 3_600_000;
const HEADLINE_OVERLAP = 0.6;

/**
 * Two headlines' share of shared words (the rule ../2026-10-22-addresses/slugs.mjs
 * uses): words of three letters or more, shared over the shorter headline's count.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number}  0 to 1.
 */
function headlineOverlap(left, right) {
  const words = (text) => new Set((text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2));
  const leftWords = words(left);
  const rightWords = words(right);
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  return shared / Math.max(1, Math.min(leftWords.size, rightWords.size));
}

/**
 * The time an article appeared: its publication date, or when production saw it.
 *
 * @param {object} article
 * @returns {number}  Milliseconds since 1970.
 */
function timeOf(article) {
  return new Date(article.published_at ?? article.seen_at).getTime();
}

/**
 * Which test, if any, finds a readable copy of an unreadable article.
 *
 * @param {object} lost  The unreadable article.
 * @param {object[]} readable  The same fighter's readable articles.
 * @returns {"slug"|"story"|"headline"|"nearby"|null}  The strictest test that matched.
 */
function copyKind(lost, readable) {
  const lostSlug = lost.address.includes("news.google.com") ? null : slugOf(lost.address);
  const nearby = readable.filter((other) => Math.abs(timeOf(other) - timeOf(lost)) <= WINDOW_MS);
  if (lostSlug && readable.some((other) => slugOf(other.address) === lostSlug)) return "slug";
  if (lost.story_id !== null && readable.some((other) => other.story_id === lost.story_id)) return "story";
  if (nearby.some((other) => headlineOverlap(lost.title, other.title) >= HEADLINE_OVERLAP)) return "headline";
  if (nearby.length > 0) return "nearby";
  return null;
}

/**
 * The fighter's stories in production's grouping (an article with no story
 * is its own), and how many have at least one readable article.
 *
 * @param {object[]} own  One fighter's articles.
 * @returns {{stories: number, readable: number, readable_share: number}}
 */
function storyCoverage(own) {
  const stories = new Map();
  for (const article of own) {
    const key = article.story_id ?? `article-${article.id}`;
    stories.set(key, Boolean(stories.get(key)) || article.readable);
  }
  const readable = [...stories.values()].filter(Boolean).length;
  return { stories: stories.size, readable, readable_share: Math.round((readable / stories.size) * 100) / 100 };
}

/**
 * The best a free route could do today: every article counted readable
 * except those at outlets that answered step 3 with Cloudflare's bot check
 * and offer no full-text feed (whether production read them earlier or
 * not). An upper bound, per article and per story.
 *
 * @param {object[]} own  One fighter's articles.
 * @param {Set<string>} checked  Hosts that answered with the bot check.
 * @returns {{articles: number, reachable: number, share: number, stories: number, reachable_stories: number, story_share: number}}
 */
function ceiling(own, checked) {
  const reachable = own.filter((article) => !checked.has(article.outlet)).length;
  const stories = new Map();
  for (const article of own) {
    const key = article.story_id ?? `article-${article.id}`;
    stories.set(key, Boolean(stories.get(key)) || !checked.has(article.outlet));
  }
  const reachableStories = [...stories.values()].filter(Boolean).length;
  const round = (value) => Math.round(value * 100) / 100;
  return { articles: own.length, reachable, share: round(reachable / own.length), stories: stories.size, reachable_stories: reachableStories, story_share: round(reachableStories / stories.size) };
}

/**
 * Counts, per fighter and per outlet, the unreadable articles with a readable copy.
 */
function main() {
  const articles = loadArticles();
  const results = {};
  const probes = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8")).probes;
  const behindCheck = probes.filter((outcome) => outcome.home.cloudflare_check || outcome.article?.cloudflare_check);
  const noFullTextFeed = behindCheck.filter((outcome) => !outcome.feed?.full_text);
  const checked = new Set(noFullTextFeed.map((outcome) => outcome.host));
  for (const fighter of FIGHTERS) {
    const own = articles.filter((article) => article.subject === fighter);
    const readable = own.filter((article) => article.readable);
    const lost = own.filter((article) => !article.readable);
    const row = { articles: own.length, unreadable: lost.length, slug: 0, story: 0, headline: 0, nearby: 0, none: 0, by_outlet: {} };

    // Each lost article counts once, under the strictest test that found a copy.
    for (const article of lost) {
      const kind = copyKind(article, readable) ?? "none";
      row[kind] += 1;
      const outletRow = (row.by_outlet[article.outlet] ??= { unreadable: 0, slug: 0, story: 0, headline: 0, nearby: 0, none: 0 });
      outletRow.unreadable += 1;
      outletRow[kind] += 1;
    }
    row.same_story_share = Math.round(((row.slug + row.story + row.headline) / row.unreadable) * 100) / 100;
    row.by_story = storyCoverage(own);
    row.ceiling_without_checked_outlets = ceiling(own, checked);
    results[fighter] = row;
  }
  saveResults("copies", results);
  console.log(JSON.stringify(results, null, 1));
}

main();
