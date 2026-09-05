// Replays the story gate over tmp/labels/stories.json (from
// labels/export-stories.js) and prints the threshold table for TODO 3f.
// Offline, no database, no LLM.
//
//   node labels/measure-story-gate.js [--window 7] > docs/grading/<date>-story-gate.md
//
// Prints: the distributions the thresholds must separate, today's rule as
// a baseline, then one row per (T_member, T_root) pair.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { observe, score, scoreBaseline, simulate, quantiles } from "./story-gate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const INPUT = join(HERE, "..", "tmp/labels/stories.json");
const windowArg = process.argv.indexOf("--window");
const WINDOW_DAYS = windowArg > 0 ? Number(process.argv[windowArg + 1]) : 7;

const T_MEMBER = [0.75, 0.78, 0.80, 0.82, 0.85];
const T_ROOT = [0, 0.55, 0.60, 0.65, 0.70, 0.75];

const items = JSON.parse(readFileSync(INPUT, "utf8"));
const records = observe(items, { windowDays: WINDOW_DAYS });
const byId = new Map(records.map((r) => [r.id, r]));

const fmt = (x) => (x === null || x === undefined ? "–" : x.toFixed(3));
const line = (label, values) => `| ${label} | ${values.length} | ${quantiles(values).map(fmt).join(" | ")} |`;

// Distributions.
const members = records.filter((r) => r.isMember && r.nearest);
const memberToRoot = members.filter((r) => r.nearest.root === r.trueRoot).map((r) => r.rootSimilarity);
const memberToNearest = members.filter((r) => r.nearest.root === r.trueRoot).map((r) => r.nearest.similarity);
const strangers = records.filter((r) => !r.isMember && r.nearest);
const strangerToNearest = strangers.map((r) => r.nearest.similarity);
const lookalikes = strangers.filter((r) => r.nearest.similarity >= 0.8);
const lookalikeToRoot = lookalikes.map((r) => r.rootSimilarity);
const membersNoNeighbour = records.filter((r) => r.isMember && !r.nearest).length;
const membersWrongNearest = members.filter((r) => r.nearest.root !== r.trueRoot).length;

console.log(`# Story gate, replayed over the labelled archive

Source: the \`feedback\` table as of ${new Date().toISOString().slice(0, 10)} (current label per
article: user > claude > sonnet > haiku), embeddings from \`items\`
(gemini-embedding-001), window ${WINDOW_DAYS} days, same subject only. Earlier items
sit in their labelled stories, so the numbers isolate the thresholds from
cascade effects. ${items.length} articles, ${records.filter((r) => r.isMember).length} story members (later arrivals of a
labelled story), ${records.filter((r) => !r.isMember).length} first arrivals (story roots and singletons).

## What the thresholds must separate

| similarity of… | n | 5% | 25% | 50% | 75% | 95% |
|---|---|---|---|---|---|---|
${line("a true member to its story root", memberToRoot)}
${line("a true member to its nearest earlier member", memberToNearest)}
${line("a new story to its nearest earlier item", strangerToNearest)}
${line("a new story that looks like an old one (nearest ≥ 0.80) to that story's root", lookalikeToRoot)}

Members whose nearest earlier item is in another story: ${membersWrongNearest}.
Members with no earlier item in the window: ${membersNoNeighbour} (uncatchable by any threshold).

## Today's rule

| rule | held (caught + misplaced) | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|
${[scoreBaseline(records, 0.8)].map((b) => `| ${b.rule} | ${b.caught + b.misplaced} | ${b.caught} | ${b.misplaced} | ${b.missed} | ${b.swallowedUseful} | ${b.swallowedJunk} |`).join("\n")}

## The story gate: nearest member ≥ T_member, and root ≥ T_root

"caught" = joined to its own story; "misplaced" = joined to another story;
"missed" = posted again as if new. For the group, caught and misplaced are
the same outcome — the repeat is held; misplaced only muddles the story
bookkeeping. "useful swallowed" = a genuinely new bucket-1/2 story held as a
dup — the real cost. "junk swallowed" = a new bucket-3 item held as a dup —
harmless, it was not for the group anyway.
Of the ${records.filter((r) => !r.isMember).length} first arrivals, ${records.filter((r) => !r.isMember && r.bucket !== 3).length} are useful stories and ${records.filter((r) => !r.isMember && r.bucket === 3).length} are junk.

| T_member | T_root | held | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|---|
${T_MEMBER.flatMap((tm) => T_ROOT.map((tr) => score(records, tm, tr))).map((s) => `| ${s.tMember.toFixed(2)} | ${s.tRoot ? s.tRoot.toFixed(2) : "off"} | ${s.caught + s.misplaced} | ${s.caught} | ${s.misplaced} | ${s.missed} | ${s.swallowedUseful} | ${s.swallowedJunk} |`).join("\n")}
`);

// With cascade: earlier items sit where the gate itself put them.
const cascadeRows = [
  { label: "today: posted anchors ≥ 0.80", s: simulate(items, 0.8, 0, { windowDays: WINDOW_DAYS, postedOnly: true }) },
  ...[0.80, 0.82, 0.85].flatMap((tm) => [0, 0.65, 0.70].map((tr) => ({ label: `all anchors ≥ ${tm.toFixed(2)}, root ${tr ? "≥ " + tr.toFixed(2) : "off"}`, s: simulate(items, tm, tr, { windowDays: WINDOW_DAYS }) }))),
];
console.log(`## With cascade — the live shape, chains included

Here an earlier item sits in the story the gate itself gave it, so a wrong
join becomes an anchor for the next arrival. This is what the August
posted-anchors decision measured (docs/decisions.md#posted-anchors).

A swallowed first arrival drags its whole story into "misplaced" here: the
repeats are still held, but under the wrong root.

| rule | held | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|
${cascadeRows.map(({ label, s }) => `| ${label} | ${s.caught + s.misplaced} | ${s.caught} | ${s.misplaced} | ${s.missed} | ${s.swallowedUseful} | ${s.swallowedJunk} |`).join("\n")}
`);

// The individual cases behind the table, for the eye.
console.log(`## The useful new stories that look like old ones (nearest ≥ 0.80)

These are what the root guard must let through. Sorted by similarity to the
old story's root: the guard saves those below its T_root.

| id | bucket | nearest | sim | that story's root | sim to root |
|---|---|---|---|---|---|
${lookalikes.filter((r) => r.bucket !== 3).sort((a, b) => b.rootSimilarity - a.rootSimilarity).map((r) => `| #${r.id} | ${r.bucket} | #${r.nearest.id} | ${fmt(r.nearest.similarity)} | #${r.nearest.root} | ${fmt(r.rootSimilarity)} |`).join("\n")}

## True members far from their root (sim to root < 0.65)

| id | root | sim to root | nearest member | sim |
|---|---|---|---|---|
${members.filter((r) => r.nearest.root === r.trueRoot && r.rootSimilarity < 0.65).sort((a, b) => a.rootSimilarity - b.rootSimilarity).map((r) => `| #${r.id} | #${r.trueRoot} | ${fmt(r.rootSimilarity)} | #${r.nearest.id} | ${fmt(r.nearest.similarity)} |`).join("\n")}
`);
void byId;
