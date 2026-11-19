// Compares the three judges on one week: how far they agree call by call,
// each judge and their majority against the maintainer's marks, the rule
// behind every split, the same-claim links, the over-merge and over-split
// rates each judge implies, the first run's single judge as a fourth opinion,
// and a rerun's noise floor when one exists. Writes the readable report (with
// headlines) to data/compare/ and the counts to results/.
//
// Usage: node research/experiments/2026-11-05-three-judges/judges-compare.mjs 2026-09-28 [opus,fable,sonnet]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkedCalls, joinCalls, said } from "./build-marks.mjs";
import { agreementCounts, fleissKappa, share } from "./stats.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [monday, modelList = "opus,fable,sonnet", version = ""] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(monday ?? "")) throw new Error("usage: judges-compare.mjs <monday> [models] [prompt version suffix, such as j2]");
const models = modelList.split(",");
const suffix = version ? `.${version}` : "";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const week = read(join(here, "data", "history", `week-${monday}.json`));
const headlineOf = new Map(week.claims.flatMap((claim) => claim.readings.map((reading) => [reading.reading_id, reading.headline])));
const table = (header, rows) => [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`), ""];

// Each judge's checked calls, and the joined view.
const problems = [];
const byModel = {};
const gaps = [];
for (const model of models) {
  const file = join(here, "data", model, `judge-out-${monday}${suffix}.json`);
  if (!existsSync(file)) throw new Error(`${model} has not judged ${monday}${suffix}`);
  const judged = read(file);
  byModel[model] = checkedCalls(week, judged, problems);
  for (const gap of judged.rule_gaps ?? []) gaps.push({ model, ...gap });
}
const joined = joinCalls(byModel, models);
const lines = [`# Judges compared, week of ${monday}${version ? ` (prompt ${version})` : ""}`, "", `Judges: ${models.join(", ")}. Readings: ${joined.readings.length}; claims: ${week.claims.length}. ${problems.length} call(s) fixed or dropped by the checks.`, ""];
const counts = { week: monday, models, readings: joined.readings.length, problems: problems.length };

// A. Agreement call by call.
const items = joined.readings.map((entry) => models.map((model) => entry.calls[model] && said(entry.calls[model])));
const agreed = agreementCounts(items);
const kappaVerdict = fleissKappa(joined.readings.map((entry) => models.map((model) => entry.calls[model]?.verdict)));
counts.agreement = { ...agreed, kappa_call: fleissKappa(items), kappa_verdict: kappaVerdict };
const changeItems = joined.readings.map((entry) => models.map((model) => (entry.calls[model]?.verdict === "belongs" ? "keep" : "change")));
counts.agreement_change = { ...agreementCounts(changeItems), kappa: fleissKappa(changeItems) };
lines.push("## How far the judges agree", "", `On the full call (verdict and the claim named): unanimous ${share(agreed.unanimous, agreed.items).text}, majority ${agreed.majority}, split ${agreed.split}; kappa ${counts.agreement.kappa_call} (verdict alone ${kappaVerdict}).`, `On keep-or-change alone: unanimous ${counts.agreement_change.unanimous}, majority ${counts.agreement_change.majority}, split ${counts.agreement_change.split}; kappa ${counts.agreement_change.kappa}.`, "");
const verdictRows = models.map((model) => { const calls = byModel[model].readings; const n = (verdict) => calls.filter((call) => call.verdict === verdict).length; return [model, n("belongs"), n("does_not_belong"), n("own_claim"), byModel[model].same_claims.length]; });
lines.push(...table(["Judge", "belongs", "does not belong", "own claim", "same-claim links"], verdictRows));

// B. Against the maintainer's marks: each judge, the majority, the unanimous calls.
const marks = week.anton.marks.map((mark) => ({ ...mark, key: `${mark.claim_id}:${mark.reading_id}`, said: mark.verdict + (mark.belongs_in_claim_id ? `→${mark.belongs_in_claim_id}` : "") }));
const entryOf = new Map(joined.readings.map((entry) => [`${entry.claim_id}:${entry.reading_id}`, entry]));
counts.anton = { marks: marks.length, same: {} };
const antonRows = [];
const differences = [];
for (const model of models) {
  let same = 0;
  for (const mark of marks) { const call = entryOf.get(mark.key)?.calls[model]; if (call && said(call) === mark.said) same++; }
  counts.anton.same[model] = same;
  antonRows.push([model, `${same} of ${marks.length}`, share(same, marks.length).pct + "%"]);
}
let majoritySame = 0, majorityHad = 0, unanimousSame = 0, unanimousHad = 0;
for (const mark of marks) {
  const entry = entryOf.get(mark.key);
  if (!entry?.majority) continue;
  const call = entry.majority.verdict + (entry.majority.belongs_in_claim_id ? `→${entry.majority.belongs_in_claim_id}` : "");
  majorityHad++;
  if (call === mark.said) majoritySame++; else differences.push({ mark, entry });
  if (entry.agreement === "unanimous") { unanimousHad++; if (call === mark.said) unanimousSame++; }
}
counts.anton.majority = { same: majoritySame, of: majorityHad };
counts.anton.unanimous = { same: unanimousSame, of: unanimousHad };
antonRows.push(["majority", `${majoritySame} of ${majorityHad}`, share(majoritySame, majorityHad).pct + "%"], ["unanimous calls only", `${unanimousSame} of ${unanimousHad}`, share(unanimousSame, unanimousHad).pct + "%"]);
lines.push(`## Against the maintainer's ${marks.length} marks`, "", ...table(["Judge", "Same call", "Share"], antonRows));
if (differences.length) lines.push("Where the majority differs from his mark:", "", ...differences.map(({ mark, entry }) => `- #${mark.claim_id} reading ${mark.reading_id} (${headlineOf.get(mark.reading_id)}): maintainer **${mark.said}**, judges ${models.map((model) => `${model} ${entry.calls[model] ? said(entry.calls[model]) : "–"}`).join(", ")}. ${models.map((model) => entry.calls[model]?.why).filter(Boolean)[0] ?? ""}`), "");
const antonLinks = new Set(week.anton.links.map((link) => [link.claim_id, link.other_claim_id].sort((x, y) => Number(x) - Number(y)).join(":")));
const linksMade = joined.same_claims.filter((pair) => antonLinks.has(`${pair.claim_id}:${pair.other_claim_id}`));
counts.anton.links = { his: antonLinks.size, made_by_someone: linksMade.length, made_by_all: linksMade.filter((pair) => pair.agreement === "unanimous").length };
lines.push(`His same-claim links in the week: ${antonLinks.size}; made by at least one judge: ${linksMade.length}; by all three: ${counts.anton.links.made_by_all}.`, "");

// C. Same-claim links by agreement.
const pairCounts = { unanimous: 0, majority: 0, minority: 0 };
for (const pair of joined.same_claims) pairCounts[pair.agreement]++;
counts.same_claims = { pairs: joined.same_claims.length, ...pairCounts };
lines.push("## Same-claim links", "", `${joined.same_claims.length} pairs linked by someone: all three ${pairCounts.unanimous}, two ${pairCounts.majority}, one ${pairCounts.minority}.`, "");

// D. The rules behind the splits.
counts.rules = {};
const ruleRows = [];
for (const model of models) {
  const perRule = {};
  for (const call of byModel[model].readings) if (call.verdict !== "belongs") perRule[call.rule] = (perRule[call.rule] ?? 0) + 1;
  counts.rules[model] = perRule;
  ruleRows.push([model, ...[1, 2, 3, 4, 5, 6, 7, 0].map((rule) => perRule[rule] ?? 0)]);
}
lines.push("## The rule behind each split or move", "", ...table(["Judge", "rule 1", "rule 2 reactions", "rule 3", "rule 4 columns", "rule 5 passing", "rule 6 core", "rule 7 text", "none"], ruleRows));

// E. Over-merge and over-split each judge implies (every reading of the week is called, so every claim is sealed).
const rateRows = [];
counts.rates = {};
const readingsCount = joined.readings.length;
for (const model of models) {
  const calls = byModel[model].readings;
  const merge = calls.filter((call) => call.verdict !== "belongs").length;
  const linked = new Set(byModel[model].same_claims.flatMap((pair) => [pair.claim_id, pair.other_claim_id]));
  const split = week.claims.filter((claim) => linked.has(String(claim.id))).length;
  counts.rates[model] = { over_merge: share(merge, readingsCount), over_split: share(split, week.claims.length) };
  rateRows.push([model, share(merge, readingsCount).text, share(split, week.claims.length).text]);
}
const majorityMerge = joined.readings.filter((entry) => entry.proposes_change).length;
const majorityLinked = new Set(joined.same_claims.filter((pair) => pair.agreement !== "minority").flatMap((pair) => [pair.claim_id, pair.other_claim_id]));
counts.rates.majority = { over_merge: share(majorityMerge, readingsCount), over_split: share(week.claims.filter((claim) => majorityLinked.has(String(claim.id))).length, week.claims.length) };
rateRows.push(["majority", counts.rates.majority.over_merge.text, counts.rates.majority.over_split.text]);
lines.push("## The pipeline's grouping, scored with each judge's calls", "", "Over-merge = readings that do not belong in their claim; over-split = claims linked as the same as another. The spread between judges is the error bar.", "", ...table(["Judge", "Over-merge (readings)", "Over-split (claims)"], rateRows));

// F. The first run's single judge as a fourth opinion.
const oldFile = join(here, "..", "2026-10-30-agent-grouping", "data", `agent-marks-${monday}.json`);
if (existsSync(oldFile)) {
  const old = new Map(read(oldFile).readings.map((call) => [`${call.claim_id}:${call.reading_id}`, call]));
  const oldRows = [];
  counts.first_run = {};
  for (const model of models) {
    let same = 0, had = 0;
    for (const entry of joined.readings) { const before = old.get(`${entry.claim_id}:${entry.reading_id}`); const call = entry.calls[model]; if (!before || !call) continue; had++; if (said(before) === said(call)) same++; }
    counts.first_run[model] = { same, of: had };
    oldRows.push([model, share(same, had).text]);
  }
  let same = 0, had = 0;
  for (const entry of joined.readings) { const before = old.get(`${entry.claim_id}:${entry.reading_id}`); if (!before || !entry.majority) continue; had++; if (said(before) === entry.majority.verdict + (entry.majority.belongs_in_claim_id ? `→${entry.majority.belongs_in_claim_id}` : "")) same++; }
  counts.first_run.majority = { same, of: had };
  oldRows.push(["majority", share(same, had).text]);
  lines.push("## The first run's judge (30 Oct, Sonnet readers, one Opus judge) as a fourth opinion", "", ...table(["New judge", "Same call as the first run"], oldRows));
}

// G. Noise: a rerun of one judge on the same readers' lines.
for (const model of models) {
  const rerun = join(here, "data", model, `rerun-judge-${monday}.json`);
  if (!existsSync(rerun)) continue;
  const second = checkedCalls(week, read(rerun), []);
  const first = new Map(byModel[model].readings.map((call) => [`${call.claim_id}:${call.reading_id}`, call]));
  let same = 0, had = 0;
  for (const call of second.readings) { const before = first.get(`${call.claim_id}:${call.reading_id}`); if (!before) continue; had++; if (said(before) === said(call)) same++; }
  counts.noise = { ...(counts.noise ?? {}), [model]: { same, of: had } };
  lines.push(`## Noise floor: ${model} judged the same readers' lines twice`, "", `The same call on ${share(same, had).text}.`, "");
}

// H. Rule gaps, for the maintainer.
counts.rule_gaps = gaps.length;
lines.push(`## Rule gaps the judges logged (${gaps.length})`, "", ...gaps.map((gap) => `- ${gap.model}, #${gap.claim_id}${gap.reading_id ? ` reading ${gap.reading_id}` : ""}: ${gap.question} Options: ${(gap.options ?? []).join(" / ")}`), "");

mkdirSync(join(here, "data", "compare"), { recursive: true });
mkdirSync(join(here, "results"), { recursive: true });
writeFileSync(join(here, "data", "compare", `judges-${monday}${suffix}.md`), lines.join("\n") + "\n");
writeFileSync(join(here, "results", `judges-${monday}${suffix}.json`), JSON.stringify(counts, null, 1));
console.log(lines.join("\n"));
