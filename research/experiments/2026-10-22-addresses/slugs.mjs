// The "seen" rule (S1–S3) measured on every address production stored: how
// many articles each key would have recognised as seen, whether any two
// different articles share a slug (a false merge), and whether any outlet
// keeps an article's identity after the "?" (E5).
//
//   node --env-file=../../../.env.v0 pull.mjs   # once: production's items, read-only, into data/
//   node slugs.mjs
//
// Writes results.json (counts and ids only; headlines stay in data/).

import { readFileSync, writeFileSync } from "node:fs";

// Query keys that track a click, never name an article.
const TRACKING = /^(utm_.*|ref|fbclid|gclid|si|is|format|oc|output|amp|outputtype|cmpid|ito|src)$/i;
// A last path part that is a script, not a name: its article lives in the query.
const SCRIPT_PAGE = /\.(asp|aspx|php|jsp|cgi)$/i;

/**
 * The slug of an address: the page's own name with the protocol, host, any
 * amp/ part, the trailing slash and the tracking query dropped. The query is
 * kept (tracking keys removed, sorted) only when the path names no page:
 * empty, or a script such as nota.asp.
 *
 * @param {string} address
 * @returns {string|null}  null for an address that is not a URL.
 */
export function slugOf(address) {
  let url;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  const parts = decodeURIComponent(url.pathname)
    .split("/")
    .filter((part) => part && part.toLowerCase() !== "amp");
  const path = parts.join("/");
  const last = parts.at(-1) ?? "";
  if (path && !SCRIPT_PAGE.test(last)) return path;
  const kept = [...url.searchParams].filter(([key]) => !TRACKING.test(key)).sort(([a], [b]) => a.localeCompare(b));
  return [path, kept.map(([key, value]) => `${key}=${value}`).join("&")].filter(Boolean).join("?");
}

/**
 * The real address production stored for an item.
 *
 * @param {{url: string, resolved_url: string|null}} item
 * @returns {string|null}  null while Google's link is still wrapped.
 */
function realAddress(item) {
  const address = item.resolved_url ?? item.url;
  return address.includes("news.google.com") ? null : address;
}

/**
 * Two headlines' share of shared words, to tell a re-listed article from a different one.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}  0 to 1.
 */
function headlineOverlap(a, b) {
  const words = (text) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2));
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.max(1, Math.min(left.size, right.size));
}

/**
 * Groups items by one key and reports what the key would have caught.
 *
 * @param {object[]} items  Production's rows, oldest first.
 * @param {(item: object) => string|null} keyOf
 * @returns {{seen: number, groups: number, mixedHosts: number, falseMerges: {ids: number[], overlap: number}[]}}
 */
function measure(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const repeated = [...groups.values()].filter((group) => group.length > 1);
  const falseMerges = [];
  let mixedHosts = 0;
  for (const group of repeated) {
    const hosts = new Set(group.map((item) => new URL(realAddress(item) ?? item.url).host));
    if (hosts.size > 1) mixedHosts += 1;
    const overlap = Math.min(...group.slice(1).map((item) => headlineOverlap(group[0].title, item.title)));
    if (overlap < 0.5) falseMerges.push({ ids: group.map((item) => Number(item.id)), overlap: Math.round(overlap * 100) / 100 });
  }
  return { seen: repeated.reduce((sum, group) => sum + group.length - 1, 0), groups: repeated.length, mixedHosts, falseMerges };
}

/**
 * Compares the keys on production's whole table.
 */
function main() {
  const items = JSON.parse(readFileSync(new URL("./data/items.json", import.meta.url), "utf8"));
  const slugs = items.map((item) => realAddress(item)).filter(Boolean).map(slugOf);
  const results = {
    items: items.length,
    still_wrapped: items.filter((item) => !realAddress(item)).length,
    feed_link: measure(items, (item) => item.url),
    real_address: measure(items, (item) => realAddress(item)),
    slug: measure(items, (item) => (realAddress(item) ? slugOf(realAddress(item)) : null)),
    any_key: null,
    query_kept: items.filter((item) => realAddress(item) && slugOf(realAddress(item)).includes("?")).map((item) => Number(item.id)),
    short_slugs: slugs.filter((slug) => slug.length < 12),
  };

  // All three keys together: an item is seen when any of its keys was met before (S1–S3).
  const met = new Set();
  let seenAny = 0;
  for (const item of items) {
    const keys = [`f:${item.url}`, realAddress(item) && `r:${realAddress(item)}`, realAddress(item) && `s:${slugOf(realAddress(item))}`].filter(Boolean);
    if (keys.some((key) => met.has(key))) seenAny += 1;
    keys.forEach((key) => met.add(key));
  }
  results.any_key = { seen: seenAny };
  writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1));
  console.log(JSON.stringify(results, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
