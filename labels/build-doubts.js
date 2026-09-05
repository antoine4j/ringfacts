// Writes tmp/labels/doubts/<batch>.json: the input rows a second reviewer
// must re-read, each carrying the first reviewer's label as `first_pass`.
// Read-only apart from that directory.
//
//   node labels/build-doubts.js

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pickDoubts } from "./doubts.js";

const INPUT_DIR = "tmp/labels/input";
const FIRST_DIR = "tmp/labels/output/haiku";
const DOUBT_DIR = "tmp/labels/doubts";
mkdirSync(DOUBT_DIR, { recursive: true });

let total = 0;
const perGroup = {};
const batches = readdirSync(FIRST_DIR).filter((name) => name.endsWith(".json")).sort();
for (const name of batches) {
  const group = name.replace(/-\d+\.json$/, "");
  const input = JSON.parse(readFileSync(join(INPUT_DIR, name), "utf8"));
  const labels = JSON.parse(readFileSync(join(FIRST_DIR, name), "utf8"));
  const doubts = pickDoubts(group, labels);

  // Attach the first reviewer's label to each doubtful input row.
  const rows = doubts.map((label) => ({ ...input.find((row) => row.id === label.id), first_pass: label }));
  if (rows.length === 0) continue;
  writeFileSync(join(DOUBT_DIR, name), JSON.stringify(rows, null, 2) + "\n");
  total += rows.length;
  perGroup[group] = (perGroup[group] ?? 0) + rows.length;
}
console.error(`Doubts: ${total} rows`, JSON.stringify(perGroup));
