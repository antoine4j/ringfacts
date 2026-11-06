// The history pass compared across models: the same-claim links weeks apart
// (who made each), the story threads, and the career-event ledger set
// against v0's tiers: for each event the judges name, whether v0 put any
// reading of its claims at tier 1 (would post), and how many hours after the
// first article. The launch bar's "no career event missed", measured on the
// history. Writes data/compare/history-pass.md and results/history-pass.json.
//
// Usage: node research/experiments/2026-11-05-three-judges/history-pass.mjs [opus,fable,sonnet]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { majority, share } from "./stats.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const models = (process.argv[2] ?? "opus,fable,sonnet").split(",");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const table = (header, rows) => [`| ${header.join(" | ")} |`, `|---${"|---".repeat(header.length - 1)}|`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""];
const fighters = ["topuria", "donchenko", "amosov"];

// Claims and readings over the history, with v0's tier per reading.
const claims = new Map();
const pipelineOf = new Map();
for (const name of readdirSync(join(here, "data", "history")).filter((file) => /^week-/.test(file))) {
  const week = read(join(here, "data", "history", name));
  for (const claim of week.claims) claims.set(claim.id, claim);
  for (const row of read(join(here, "data", "history", name.replace("week-", "pipeline-"))).readings) pipelineOf.set(row.reading_id, row);
}
const tier1At = (claimId) => {
  const claim = claims.get(claimId);
  if (!claim) return null;
  const posts = claim.readings.filter((reading) => pipelineOf.get(reading.reading_id)?.tier === 1).map((reading) => new Date(reading.published_at));
  return posts.length ? new Date(Math.min(...posts)) : null;
};
const firstAt = (claimIds) => { const dates = claimIds.map((id) => claims.get(id)?.readings.map((reading) => new Date(reading.published_at))).flat().filter(Boolean); return dates.length ? new Date(Math.min(...dates)) : null; };

// Each model's history outputs.
const outputs = {};
for (const model of models) {
  outputs[model] = {};
  for (const fighter of fighters) {
    const file = join(here, "data", model, `history-out-${fighter}.json`);
    if (existsSync(file)) outputs[model][fighter] = read(file);
  }
}
const have = (fighter) => models.filter((model) => outputs[model][fighter]);
const counts = { models, fighters: {} };
const lines = ["# The history pass compared", ""];

for (const fighter of fighters) {
  const present = have(fighter);
  if (!present.length) continue;
  const row = { models: present };
  lines.push(`## ${fighter[0].toUpperCase() + fighter.slice(1)} (${present.join(", ")})`, "");

  // Same-claim links weeks apart: who made each pair.
  const pairs = new Map();
  for (const model of present) for (const link of outputs[model][fighter].same_claims ?? []) {
    const key = [String(link.claim_id), String(link.other_claim_id)].sort((a, b) => Number(a) - Number(b)).join(":");
    pairs.set(key, (pairs.get(key) ?? new Set()).add(model));
  }
  const by = { all: 0, two: 0, one: 0 };
  for (const who of pairs.values()) by[who.size === present.length && present.length > 1 ? "all" : who.size >= 2 ? "two" : "one"]++;
  row.links = { pairs: pairs.size, ...by };
  lines.push(`Same-claim links across the history: ${pairs.size} pairs; made by all ${by.all}, by two ${by.two}, by one ${by.one}.`, "");

  // Stories: how many each model names, and the share of claims in any story.
  const storyRows = present.map((model) => { const stories = outputs[model][fighter].stories ?? []; const inStory = new Set(stories.flatMap((story) => story.claim_ids.map(String))); return [model, stories.length, inStory.size, stories.slice(0, 6).map((story) => `${story.name} (${story.claim_ids.length})`).join("; ")]; });
  row.stories = Object.fromEntries(present.map((model, index) => [model, { stories: storyRows[index][1], claims_in_stories: storyRows[index][2] }]));
  lines.push(...table(["Model", "Stories", "Claims in a story", "The largest few"], storyRows));

  // Career events: pooled by type and date (same type within 3 days = the same event), with who named it.
  const events = [];
  for (const model of present) for (const event of outputs[model][fighter].career_events ?? []) {
    const date = event.date ? new Date(event.date) : firstAt(event.claim_ids.map(String));
    const match = events.find((other) => other.type === event.type && date && other.date && Math.abs(other.date - date) <= 3 * 86400000);
    if (match) { match.by.add(model); match.claim_ids = new Set([...match.claim_ids, ...event.claim_ids.map(String)]); match.whats[model] = event.what; }
    else events.push({ type: event.type, date, by: new Set([model]), claim_ids: new Set(event.claim_ids.map(String)), whats: { [model]: event.what }, first_claim_id: String(event.first_claim_id) });
  }
  events.sort((a, b) => (a.date ?? 0) - (b.date ?? 0));
  const eventRows = [];
  let named = 0, tier1 = 0, late = 0;
  for (const event of events) {
    const agreed = event.by.size >= Math.ceil(present.length / 2) && (present.length === 1 || event.by.size >= 2);
    const first = firstAt([...event.claim_ids]);
    const posts = [...event.claim_ids].map(tier1At).filter(Boolean);
    const post = posts.length ? new Date(Math.min(...posts)) : null;
    const hours = first && post ? Math.round((post - first) / 3600000) : null;
    if (agreed) { named++; if (post) tier1++; if (hours !== null && hours > 24) late++; }
    eventRows.push([event.date ? event.date.toISOString().slice(0, 10) : "?", event.type, [...event.by].join("+"), agreed ? "yes" : "no", post ? `tier 1${hours !== null ? `, ${hours} h after the first article` : ""}` : "no tier 1", Object.values(event.whats)[0].slice(0, 90)]);
  }
  row.career = { events: events.length, agreed: named, agreed_with_tier1: tier1, agreed_tier1_after_a_day: late };
  lines.push(`Career events: ${events.length} named by someone; ${named} by a majority of the models, of which v0 put ${tier1} at tier 1 (${share(tier1, named).pct ?? "–"}%), ${late} of those more than a day after the first article.`, "", ...table(["Date", "Type", "Named by", "Majority", "v0", "What"], eventRows));
  counts.fighters[fighter] = row;
}

mkdirSync(join(here, "data", "compare"), { recursive: true });
mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "data", "compare", "history-pass.md"), lines.join("\n") + "\n");
writeFileSync(join(here, "results", "history-pass.json"), JSON.stringify(counts, null, 1));
console.log(lines.join("\n"));
