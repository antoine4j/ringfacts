// Step 8: the route test (spec section 2) on the fresh sample, the way v0
// will count it: copies merged first (same slug, or a Ukr.net item whose
// original was sampled), then the share of each fighter's articles readable
// by each reading order. Production's share is its stored text of 400
// characters or more (its fighter's name not checked, so an upper bound).
//
//   node route.mjs
//
// Writes route.json.

import { readFileSync, writeFileSync } from "node:fs";
import { slugOf } from "../2026-10-22-addresses/slugs.mjs";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";

const read = (name) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), "utf8"));
const sample = read("sample.json");
const fetched = read("fetch.json");
const texts = read("texts.json");
const jina = read("jina.json");
const ukrnet = read("ukrnet.json");

/**
 * Whether a text passes the readable bar for a fighter.
 *
 * @param {string|null|undefined} text
 * @param {string} fighter
 * @returns {boolean}
 */
function readable(text, fighter) {
  return Boolean(text) && text.length >= 400 && mentionsName(text, SUBJECTS.find((subject) => subject.name === fighter).matchNames);
}

// One group per fighter and slug; a group is readable by an order when any of its copies is.
const groups = new Map();
for (const article of sample) {
  const address = ukrnet[article.id]?.original ?? fetched[article.id]?.address ?? article.url;
  const key = `${article.subject}|${slugOf(address)}`;
  const ours = readable(texts[article.id]?.ours, article.subject) || Boolean(ukrnet[article.id]?.ours);
  const readability = readable(texts[article.id]?.readability, article.subject) || Boolean(ukrnet[article.id]?.readability);
  const ok = { production: article.body_chars >= 400, ours, ours_readability: ours || readability, all: ours || readability || readable(jina[article.id], article.subject) };
  const group = groups.get(key) ?? { fighter: article.subject, copies: 0 };
  for (const [order, value] of Object.entries(ok)) group[order] = Boolean(group[order]) || value;
  group.copies += 1;
  groups.set(key, group);
}
const route = {};
for (const group of groups.values()) {
  const row = (route[group.fighter] ??= { sampled: 0, articles: 0, production: 0, ours: 0, ours_readability: 0, all: 0 });
  row.sampled += group.copies;
  row.articles += 1;
  for (const order of ["production", "ours", "ours_readability", "all"]) row[order] += group[order] ? 1 : 0;
}
writeFileSync(new URL("./route.json", import.meta.url), JSON.stringify(route, null, 1));
console.log(route);
