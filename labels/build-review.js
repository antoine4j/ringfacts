// Builds the review sheet docs/grading/2026-09-05-all-articles.md: every
// archived article, one row each, in id order, with the machine's decision,
// the reviewer's label, and a column for Anton. Reads tmp/labels only.
//
//   node labels/build-review.js

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseGradingRow, finalBucket } from "../corpus/graded.js";
import { deriveReason } from "./derive-reason.js";
import { formatSheetRow, machineSaid } from "./sheet.js";
import { overturns } from "./doubts.js";

const INPUT_DIR = "tmp/labels/input";
const OUTPUT_DIR = "tmp/labels/output";
const GRADING_DOC = "docs/grading/2026-09-04-posted-30d.md";
const SHEET = "docs/grading/2026-09-05-all-articles.md";
const AS_GRADED = "as graded — check reason";

/**
 * Loads every export batch, keyed by item id, with its group name.
 *
 * @returns {Map<number, object>}
 */
function loadInputs() {
  const items = new Map();
  const names = readdirSync(INPUT_DIR).filter((name) => /^[a-z-]+-\d+\.json$/.test(name));
  for (const name of names) {
    const group = name.replace(/-\d+\.json$/, "");
    for (const row of JSON.parse(readFileSync(join(INPUT_DIR, name), "utf8"))) items.set(row.id, { ...row, group });
  }
  return items;
}

/**
 * Loads reviewer labels for one author, keyed by item id.
 *
 * @param {string} author  haiku | sonnet | claude
 * @returns {Map<number, object>}
 */
function loadLabels(author) {
  const labels = new Map();
  const dir = join(OUTPUT_DIR, author);
  if (!existsSync(dir)) return labels;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    for (const row of JSON.parse(readFileSync(join(dir, name), "utf8"))) labels.set(row.id, { ...row, author });
  }
  return labels;
}

/**
 * Anton's graded rows from the September grading doc, keyed by id, each
 * with the reason code derived from his note.
 *
 * @returns {Map<number, object>}
 */
function loadGraded() {
  const graded = new Map();
  for (const line of readFileSync(GRADING_DOC, "utf8").split("\n")) {
    const row = parseGradingRow(line);
    if (!row) continue;
    const bucket = finalBucket(row);
    const derived = deriveReason(bucket, row.reason);
    graded.set(row.id, { bucket, reason: derived.reason, dup_of: derived.dup_of, why: row.reason, author: "user" });
  }
  return graded;
}

/**
 * The label that stands for an item: Claude's own, else Sonnet's re-read,
 * else Haiku's first pass.
 *
 * @param {number} id
 * @param {Map<number, object>[]} byPriority  [claude, sonnet, haiku]
 * @returns {object|null}
 */
function currentLabel(id, byPriority) {
  for (const labels of byPriority) {
    if (labels.has(id)) return labels.get(id);
  }
  return null;
}

/** Formats an ISO timestamp as MM-DD. */
function shortDate(iso) {
  return String(iso).slice(5, 10);
}

/** Last name of a fighter's full name. */
function lastName(fullName) {
  return fullName.split(" ").at(-1);
}

const inputs = loadInputs();
const graded = loadGraded();
const byPriority = [loadLabels("claude"), loadLabels("sonnet"), loadLabels("haiku")];

// One sheet row per item, in id order; the numbers table is tallied as we go.
const ids = [...inputs.keys()].sort((a, b) => a - b);
const rows = [];
const tally = {};
const misses = [];
const bodyQuality = {};
let unlabelled = 0;
for (const id of ids) {
  const item = inputs.get(id);
  const label = graded.get(id) ?? currentLabel(id, byPriority);
  if (!label) { unlabelled += 1; continue; }
  const machine = machineSaid(item);
  const isGraded = graded.has(id);

  // Group tally: confirmed / overturned / unsure.
  const group = item.group;
  tally[group] ??= { count: 0, confirmed: 0, overturned: 0, unsure: 0 };
  tally[group].count += 1;
  if (!isGraded && label.confidence === "low") tally[group].unsure += 1;
  else if (!isGraded && overturns(group, label)) tally[group].overturned += 1;
  else tally[group].confirmed += 1;
  if (!item.posted && label.bucket !== 3) misses.push(id);
  if (label.body_quality === "furniture" || label.body_quality === "none") {
    bodyQuality[item.source] ??= 0;
    bodyQuality[item.source] += 1;
  }

  rows.push(formatSheetRow({
    id, url: item.url, date: shortDate(item.published_at), fighter: lastName(item.fighter),
    source: item.source, machine, bucket: label.bucket, author: label.author,
    reason: label.reason, dup_of: label.dup_of, why: label.why, anton: isGraded ? AS_GRADED : "",
  }));
}

// Assemble the document.
const tallyLines = Object.entries(tally).map(([group, t]) =>
  `| ${group} | ${t.count} | ${t.confirmed} | ${t.overturned} | ${t.unsure} |`);
const bodyLines = Object.entries(bodyQuality).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([host, n]) => `| ${host} | ${n} |`);
const doc = `# Grading pass — every archived article, 2026-08-07 to 2026-09-05

Every row in the \`items\` table, in discovery order. **machine said** is what
the pipeline did; **Claude** is the reviewer's bucket (Haiku first pass, marked
\`(sonnet)\` where Sonnet re-read a doubt, \`(claude)\` where Claude ruled);
**reason** is the label code that goes into the \`feedback\` table; **why** is
the reviewer's one line. The 103 posts Anton graded on 2026-09-04 carry his
bucket and his note verbatim, with the reason code derived from the note —
those rows say **"${AS_GRADED}"** in the Anton column.

**Anton's column**: leave "as graded" to accept the row; otherwise write the
correction — a bucket digit, and/or a reason code, and/or "dup of #N" — with
any words you like. Nothing is written to the database until this file is
done.

Reason codes: fine · missed · junk · dup · old · wrong · loud · other —
defined in one place, [docs/goals.md, "The reason codes"](../goals.md#the-reason-codes--why-an-article-got-its-bucket).

## The numbers

| group | rows | confirmed | overturned | unsure |
|---|---|---|---|---|
${tallyLines.join("\n")}

**Held articles the reviewer thinks were real news (bucket 1 or 2):** ${misses.length}
${misses.map((id) => `#${id}`).join(", ")}

Rows with no usable body (page furniture or nothing), per outlet, top 15:

| outlet | rows |
|---|---|
${bodyLines.join("\n")}

## Items

| # | date | fighter | source | machine said | Claude | reason | dup of | why | Anton |
|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
writeFileSync(SHEET, doc);
console.error(`Wrote ${rows.length} rows to ${SHEET}; unlabelled: ${unlabelled}; misses: ${misses.length}`);
