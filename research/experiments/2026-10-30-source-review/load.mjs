// Shared by the counting steps: reads data/items.json (written by pull.mjs),
// gives every article a host-like outlet, and keeps the articles that count.
// Not run on its own.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { OUTLETS } from "../../../lib/feeds.js";

// Holds that mean "this is not an article about the fighter" (the matcher
// said so) or "this exact address was already stored" (the same article twice).
const NOT_COUNTED = new Set(["wrong_subject", "url"]);

// The hosts production already reads as a direct outlet feed (lib/feeds.js).
export const DIRECT_FEED_HOSTS = OUTLETS.map((outlet) => new URL(outlet.url).host.replace(/^www\./, ""))
  .map((host) => (host === "e00-marca.uecdn.es" ? "marca.com" : host));

export const FIGHTERS = ["Yaroslav Amosov", "Daniil Donchenko", "Ilia Topuria"];

/**
 * For each outlet name Google gave, the host its resolved articles most often had,
 * so an article whose address never resolved still lands under its outlet.
 *
 * @param {object[]} items
 * @returns {Map<string, string>}  Outlet name, lower case, to host.
 */
function hostByName(items) {
  const votes = new Map();
  for (const item of items) {
    if (!item.source || item.outlet.startsWith("(name)")) continue;
    const name = item.source.trim().toLowerCase();
    const tally = votes.get(name) ?? new Map();
    tally.set(item.outlet, (tally.get(item.outlet) ?? 0) + 1);
    votes.set(name, tally);
  }

  // The most frequent host wins for each name.
  const winners = new Map();
  for (const [name, tally] of votes) {
    const sorted = [...tally].sort((left, right) => right[1] - left[1]);
    winners.set(name, sorted[0][0]);
  }
  return winners;
}

/**
 * The articles that count, each with its outlet settled to a host where one is known.
 *
 * @returns {object[]}  pull.mjs's records plus `outlet` rewritten and `name_only` set.
 */
export function loadArticles() {
  const items = JSON.parse(readFileSync(new URL("./data/items.json", import.meta.url), "utf8"));
  const winners = hostByName(items);

  // An unresolved article takes its name's usual host; a name that is itself a host is used as one.
  for (const item of items) {
    if (!item.outlet.startsWith("(name)")) continue;
    const name = item.source?.trim().toLowerCase() ?? "";
    const looksLikeHost = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(name);
    item.name_only = true;
    item.outlet = winners.get(name) ?? (looksLikeHost ? name.replace(/^www\./, "") : item.outlet);
  }
  return items.filter((item) => !NOT_COUNTED.has(item.held_reason));
}

/**
 * Merges one step's results into results.json under its own key.
 *
 * @param {string} key
 * @param {object} value
 */
export function saveResults(key, value) {
  const file = new URL("./results.json", import.meta.url);
  const results = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  results[key] = value;
  writeFileSync(file, JSON.stringify(results, null, 1) + "\n");
}
