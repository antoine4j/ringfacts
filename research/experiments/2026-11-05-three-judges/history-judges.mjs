// The judges over every judged week, each reading once: how far the three
// agree, each judge and their majority against every mark the maintainer has
// made, the over-merge and over-split rates by fighter, the same-claim links
// by agreement, the rules behind the splits, and the rule gaps the judges
// logged. Readings a judge called in two weeks take the newer call when it
// names a claim (build-marks.mjs). Writes data/compare/history-judges.md and
// results/history-judges.json (counts only).
//
// Usage: node research/experiments/2026-11-05-three-judges/history-judges.mjs [opus,fable,sonnet]

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkedCalls, joinCalls, said } from "./build-marks.mjs";
import { agreementCounts, fleissKappa, share } from "./stats.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const models = (process.argv[2] ?? "opus,fable,sonnet").split(",");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const table = (header, rows) => [`| ${header.join(" | ")} |`, `|---${"|---".repeat(header.length - 1)}|`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""];

// Weeks every model has judged; the claims, readings and marks in them, each once.
const weeks = readdirSync(join(here, "data", "history")).filter((name) => /^week-\d{4}-\d{2}-\d{2}\.json$/.test(name)).map((name) => name.slice(5, 15)).sort()
  .filter((monday) => models.every((model) => existsSync(join(here, "data", model, `judge-out-${monday}.json`))));
const claims = new Map();
const knownFighters = new Map();
for (const name of readdirSync(join(here, "data", "history")).filter((file) => /^week-/.test(file))) for (const claim of read(join(here, "data", "history", name)).claims) knownFighters.set(String(claim.id), claim.fighter);
const marks = new Map();
const links = new Set();
const byModel = Object.fromEntries(models.map((model) => [model, { readings: [], same_claims: [], gaps: [] }]));
const problems = [];
for (const monday of weeks) {
  const week = read(join(here, "data", "history", `week-${monday}.json`));
  for (const claim of week.claims) claims.set(claim.id, claim);
  for (const mark of week.anton.marks) marks.set(`${mark.claim_id}:${mark.reading_id}`, mark);
  for (const link of week.anton.links) links.add([link.claim_id, link.other_claim_id].sort((a, b) => Number(a) - Number(b)).join(":"));
  for (const model of models) {
    const judged = read(join(here, "data", model, `judge-out-${monday}.json`));
    const checked = checkedCalls(week, judged, problems, knownFighters);
    byModel[model].readings.push(...checked.readings);
    byModel[model].same_claims.push(...checked.same_claims);
    for (const gap of judged.rule_gaps ?? []) byModel[model].gaps.push({ week: monday, ...gap });
  }
}
const joined = joinCalls(byModel, models);
const fighterOf = new Map([...claims.values()].map((claim) => [String(claim.id), claim.fighter]));
const counts = { models, weeks, claims: claims.size, readings: joined.readings.length, problems: problems.length };
const lines = [`# The judges over the history (${weeks.length} weeks judged by all: ${weeks[0]} to ${weeks.at(-1)})`, "", `Judges: ${models.join(", ")}. Claims: ${claims.size}; readings: ${joined.readings.length}. ${problems.length} call(s) fixed or dropped by the checks.`, ""];

// A. Agreement.
const items = joined.readings.map((entry) => models.map((model) => entry.calls[model] && said(entry.calls[model])));
const agreed = agreementCounts(items);
const changeItems = joined.readings.map((entry) => models.map((model) => (entry.calls[model] ? (entry.calls[model].verdict === "belongs" ? "keep" : "change") : null)));
counts.agreement = { ...agreed, kappa_call: fleissKappa(items), kappa_verdict: fleissKappa(joined.readings.map((entry) => models.map((model) => entry.calls[model]?.verdict))) };
counts.agreement_change = { ...agreementCounts(changeItems), kappa: fleissKappa(changeItems) };
lines.push("## How far the judges agree", "", `Full call (verdict and the claim named): unanimous ${share(agreed.unanimous, agreed.items).text}, majority ${agreed.majority}, split ${agreed.split}; kappa ${counts.agreement.kappa_call}.`, `Keep-or-change alone: unanimous ${counts.agreement_change.unanimous}, majority ${counts.agreement_change.majority}, split ${counts.agreement_change.split}; kappa ${counts.agreement_change.kappa}.`, "");
// Each judge's call in force per reading (a claim spanning weeks is called once per week; the joined view keeps one).
lines.push(...table(["Judge", "belongs", "does not belong", "own claim", "same-claim pairs"], models.map((model) => { const calls = joined.readings.map((entry) => entry.calls[model]).filter(Boolean); const n = (verdict) => calls.filter((call) => call.verdict === verdict).length; return [model, n("belongs"), n("does_not_belong"), n("own_claim"), joined.same_claims.filter((pair) => pair.calls[model]).length]; })));

// B. Against the maintainer's marks.
const entryOf = new Map(joined.readings.map((entry) => [`${entry.claim_id}:${entry.reading_id}`, entry]));
const markSaid = (mark) => mark.verdict + (mark.belongs_in_claim_id ? `→${mark.belongs_in_claim_id}` : "");
const majoritySaid = (entry) => entry.majority && entry.majority.verdict + (entry.majority.belongs_in_claim_id ? `→${entry.majority.belongs_in_claim_id}` : "");
counts.anton = { marks: marks.size, same: {} };
const antonRows = [];
for (const model of models) {
  let same = 0, had = 0;
  for (const mark of marks.values()) { const call = entryOf.get(`${mark.claim_id}:${mark.reading_id}`)?.calls[model]; if (!call) continue; had++; if (said(call) === markSaid(mark)) same++; }
  counts.anton.same[model] = { same, of: had };
  antonRows.push([model, share(same, had).text]);
}
let majoritySame = 0, majorityHad = 0, unanimousSame = 0, unanimousHad = 0;
const differences = [];
for (const mark of marks.values()) {
  const entry = entryOf.get(`${mark.claim_id}:${mark.reading_id}`);
  if (!entry?.majority) continue;
  majorityHad++;
  const same = majoritySaid(entry) === markSaid(mark);
  if (same) majoritySame++; else differences.push({ mark, entry });
  if (entry.agreement === "unanimous") { unanimousHad++; if (same) unanimousSame++; }
}
counts.anton.majority = { same: majoritySame, of: majorityHad };
counts.anton.unanimous = { same: unanimousSame, of: unanimousHad };
antonRows.push(["majority", share(majoritySame, majorityHad).text], ["unanimous calls only", share(unanimousSame, unanimousHad).text]);
lines.push(`## Against the maintainer's ${marks.size} marks on these weeks`, "", ...table(["Judge", "Same call"], antonRows));
const byClaim = {};
for (const { mark, entry } of differences) { byClaim[mark.claim_id] ??= []; byClaim[mark.claim_id].push(`${mark.reading_id}: he ${markSaid(mark)}, judges ${models.map((model) => entry.calls[model] ? said(entry.calls[model]) : "–").join(" / ")}`); }
counts.anton.differences_by_claim = Object.fromEntries(Object.entries(byClaim).map(([claim, list]) => [claim, list.length]));
if (differences.length) lines.push("Where the majority differs from his mark, by claim:", "", ...Object.entries(byClaim).map(([claim, list]) => `- #${claim} (${list.length}): ${list.join("; ")}`), "");
const linksMade = joined.same_claims.filter((pair) => links.has(`${pair.claim_id}:${pair.other_claim_id}`));
counts.anton.links = { his: links.size, made_by_someone: linksMade.length, made_by_all: linksMade.filter((pair) => pair.agreement === "unanimous").length };
lines.push(`His same-claim links: ${links.size}; made by at least one judge: ${linksMade.length}; by all three: ${counts.anton.links.made_by_all}.`, "");

// C. Rates by fighter, each judge and the majority.
counts.rates = {};
const rateRows = [];
const fighters = [...new Set(fighterOf.values())].sort();
for (const who of [...models, "majority"]) {
  for (const fighter of [...fighters, "all"]) {
    const entries = joined.readings.filter((entry) => fighter === "all" || fighterOf.get(entry.claim_id) === fighter);
    const claimIds = new Set([...claims.values()].filter((claim) => fighter === "all" || claim.fighter === fighter).map((claim) => String(claim.id)));
    let merge, linked;
    if (who === "majority") {
      merge = entries.filter((entry) => entry.proposes_change).length;
      linked = new Set(joined.same_claims.filter((pair) => pair.agreement !== "minority").flatMap((pair) => [pair.claim_id, pair.other_claim_id]));
    } else {
      merge = entries.filter((entry) => entry.calls[who] && entry.calls[who].verdict !== "belongs").length;
      linked = new Set(byModel[who].same_claims.flatMap((pair) => [pair.claim_id, pair.other_claim_id]));
    }
    const split = [...claimIds].filter((id) => linked.has(id)).length;
    counts.rates[`${who} ${fighter}`] = { over_merge: share(merge, entries.length), over_split: share(split, claimIds.size) };
    if (fighter === "all" || who === "majority") rateRows.push([who, fighter, share(merge, entries.length).text, share(split, claimIds.size).text]);
  }
}
lines.push("## The pipeline's grouping, scored with the judges' calls", "", "Over-merge = readings that do not belong in their claim; over-split = claims linked as the same as another. The spread between judges is the error bar.", "", ...table(["Judge", "Fighter", "Over-merge (readings)", "Over-split (claims)"], rateRows));

// D. Same-claim links and rules.
const pairCounts = { unanimous: 0, majority: 0, minority: 0 };
for (const pair of joined.same_claims) pairCounts[pair.agreement]++;
counts.same_claims = { pairs: joined.same_claims.length, ...pairCounts };
lines.push("## Same-claim links", "", `${joined.same_claims.length} pairs linked by someone: all three ${pairCounts.unanimous}, two ${pairCounts.majority}, one ${pairCounts.minority}.`, "");
counts.rules = {};
lines.push("## The rule behind each split or move", "", ...table(["Judge", "rule 1 same sitting", "rule 2 reactions", "rule 3 rumour", "rule 4 columns", "rule 5 passing", "rule 6 core", "rule 7 text", "none"], models.map((model) => { const perRule = {}; for (const entry of joined.readings) { const call = entry.calls[model]; if (call && call.verdict !== "belongs") perRule[call.rule] = (perRule[call.rule] ?? 0) + 1; } counts.rules[model] = perRule; return [model, ...[1, 2, 3, 4, 5, 6, 7, 0].map((rule) => perRule[rule] ?? 0)]; })));

// E. Rule gaps.
const gaps = models.flatMap((model) => byModel[model].gaps.map((gap) => ({ model, ...gap })));
counts.rule_gaps = gaps.length;
lines.push(`## Rule gaps the judges logged (${gaps.length})`, "", ...gaps.map((gap) => `- ${gap.week} ${gap.model}, #${gap.claim_id}${gap.reading_id ? ` reading ${gap.reading_id}` : ""}: ${gap.question} Options: ${(gap.options ?? []).join(" / ")}`), "");

mkdirSync(join(here, "data", "compare"), { recursive: true });
mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "data", "compare", "history-judges.md"), lines.join("\n") + "\n");
writeFileSync(join(here, "results", "history-judges.json"), JSON.stringify(counts, null, 1));
console.log(lines.slice(0, lines.findIndex((line) => line.startsWith("## Rule gaps"))).join("\n"));
console.log(`\n${gaps.length} rule gaps → data/compare/history-judges.md`);
