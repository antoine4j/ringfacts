// Spike, 2026-10-05: can the articles production could not read be read
// another way? Read-only and throwaway: nothing is written to any database,
// and no article text is kept (only lengths and whether the fighter is named).
// See README.md for the question and the result.
//
//   V0_DATABASE_URL=… node experiments/2026-10-05-body-fetch-spike/spike.mjs
//
// For every unreadable article in v0 (Mshale left out: a spam site production
// already holds), four ways, each on its own:
//   retry   production's own fetcher again, today (lib/extract.js)
//   decode  Google's wrapped link decoded again, for "decode-failed" ones
//   jina    Jina Reader, keyless (free, 20 pages a minute)
// and, per outlet, whether its RSS feed carries the article text (rss.json).

import { writeFileSync } from "node:fs";
import pg from "pg";
import { fetchArticleBody, htmlToText } from "../../lib/extract.js";
import { decodeGoogleNewsUrl, isGoogleWrapped } from "../../lib/googlenews.js";
import { mentionsName } from "../../lib/tier.js";
import { SUBJECTS } from "../../watchlist.js";

const HERE = new URL(".", import.meta.url).pathname;
const USABLE = 400;
const JINA_GAP_MS = 3_200;
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

/**
 * The unreadable articles, one row each, with the fighters they were read for.
 *
 * @returns {Promise<object[]>}  id, url, outlet, cause, published, fighters.
 */
async function unreadable() {
  const pool = new pg.Pool({ connectionString: process.env.V0_DATABASE_URL });
  const result = await pool.query(`
    SELECT a.id, a.url, a.outlet, coalesce(a.body_via, 'none') AS cause, a.published_at,
           array_agg(DISTINCT r.fighter) AS fighters
    FROM articles a JOIN readings r ON r.article_id = a.id
    WHERE r.stage = 'no_body' AND a.url NOT LIKE '%mshale.com%'
    GROUP BY a.id ORDER BY a.id`);
  await pool.end();
  return result.rows;
}

/**
 * Whether a text is long enough and names one of the article's fighters.
 *
 * @param {string|null} text  The text found.
 * @param {string[]} fighters  The fighters the article was read for.
 * @returns {{length: number, named: boolean, usable: boolean}}
 */
function judge(text, fighters) {
  const length = text ? text.length : 0;
  const stems = SUBJECTS.filter((subject) => fighters.includes(subject.name)).flatMap((subject) => subject.matchNames);
  const named = Boolean(text) && mentionsName(text, stems);
  return { length, named, usable: length >= USABLE && named };
}

/**
 * Jina Reader's text for a page: the part after "Markdown Content:", with links and images reduced to their words.
 *
 * @param {string} url  The article.
 * @returns {Promise<{text: string|null, status: string}>}
 */
async function viaJina(url, withIframe = false) {
  try {
    const headers = { "X-Timeout": "20", ...(withIframe ? { "X-With-Iframe": "true" } : {}) };
    const response = await fetch(`https://r.jina.ai/${url}`, { headers, signal: AbortSignal.timeout(35_000) });
    const raw = await response.text();
    if (!response.ok) return { text: null, status: `jina-${response.status}` };
    const warning = raw.match(/^Warning: (.*)$/m)?.[1] ?? null;
    const content = raw.split("Markdown Content:")[1] ?? "";
    const text = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return { text, status: warning ? `warning: ${warning.slice(0, 80)}` : "ok" };
  } catch (error) {
    return { text: null, status: `error-${error.name}` };
  }
}

/**
 * Each article through retry, decode and Jina.
 *
 * @param {object[]} articles  The unreadable articles.
 * @returns {Promise<object[]>}  One result per article: lengths and verdicts only.
 */
async function measureArticles(articles) {
  const results = [];
  for (const [index, article] of articles.entries()) {
    const started = Date.now();
    const row = { id: Number(article.id), outlet: article.outlet, cause: article.cause, published: article.published_at.toISOString().slice(0, 10), fighters: article.fighters };

    // The address production would fetch, decoded again when Google wrapped it.
    let url = article.url;
    if (isGoogleWrapped(url)) {
      const decoded = await decodeGoogleNewsUrl(url).catch(() => null);
      row.decode = decoded ? "ok" : "failed";
      if (decoded) url = decoded;
    }
    row.host = isGoogleWrapped(url) ? "news.google.com" : new URL(url).hostname.replace(/^www\./, "");

    // Production's fetcher again, then Jina, unless the link is still wrapped.
    const retry = await fetchArticleBody(url);
    row.retry = { ...judge(retry.body, article.fighters), via: retry.via };
    if (!isGoogleWrapped(url)) {
      // A page that wraps its article in a frame (Ukr.net) is read again with frames on.
      let jina = await viaJina(url);
      if (jina.status.includes("iframe")) {
        await new Promise((resolve) => setTimeout(resolve, JINA_GAP_MS));
        jina = await viaJina(url, true);
        jina.status = `iframe: ${jina.status}`;
      }
      row.jina = { ...judge(jina.text, article.fighters), status: jina.status };
    }
    results.push(row);
    if (index % 25 === 0) console.log(`${index + 1}/${articles.length} ${row.host} retry=${row.retry.usable} jina=${row.jina?.usable}`);

    // Keyless Jina allows 20 pages a minute.
    const wait = JINA_GAP_MS - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return results;
}

/**
 * An outlet's RSS feed, if its home page names one, and how much text its items carry.
 *
 * @param {string} host  The outlet's host.
 * @returns {Promise<object>}  The feed address, item count, and median item text length.
 */
async function measureFeed(host) {
  const get = (url) => fetch(url, { headers: { "user-agent": BROWSER_UA }, signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null);

  // The feed the home page announces, else the usual addresses.
  const home = (await get(`https://${host}/`)) ?? "";
  const announced = [...home.matchAll(/<link[^>]+type="application\/(?:rss|atom)\+xml"[^>]*>/gi)].map((tag) => tag[0].match(/href="([^"]+)"/)?.[1]).filter(Boolean);
  const candidates = [...announced.map((href) => new URL(href, `https://${host}/`).href), `https://${host}/rss`, `https://${host}/feed`, `https://${host}/rss.xml`, `https://${host}/feed/`];
  for (const feedUrl of candidates) {
    const xml = await get(feedUrl);
    if (!xml || !/<(rss|feed)[\s>]/i.test(xml)) continue;

    // Each item's longest text: full content where the feed has it, else the description.
    const items = [...xml.matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((match) => match[0]);
    const lengths = items.map((item) => {
      const fields = [...item.matchAll(/<(content:encoded|content|description|summary)[^>]*>([\s\S]*?)<\/\1>/gi)].map((field) => htmlToText(field[2].replace(/<!\[CDATA\[|\]\]>/g, "")).length);
      return Math.max(0, ...fields);
    }).sort((a, b) => a - b);
    const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0;
    return { host, feed: feedUrl, announced: announced.length > 0, items: items.length, median_text: median, items_over_400: lengths.filter((length) => length >= USABLE).length };
  }
  return { host, feed: null, announced: announced.length > 0, home_readable: home.length > 0 };
}

// LIMIT=n tries only the first n, for a trial run.
const articles = (await unreadable()).slice(0, Number(process.env.LIMIT) || undefined);
console.log(`${articles.length} unreadable articles`);
const results = await measureArticles(articles);
writeFileSync(`${HERE}results.json`, JSON.stringify(results, null, 1));
const hosts = [...new Set(results.map((row) => row.host))].filter((host) => host !== "news.google.com");
const feeds = [];
for (const host of hosts) feeds.push(await measureFeed(host));
writeFileSync(`${HERE}rss.json`, JSON.stringify(feeds, null, 1));
console.log("done");
