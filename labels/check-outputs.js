// Validates every reviewer output in tmp/labels/output against its input
// batch and prints a per-file verdict. Read-only; exits 1 on any problem.
//
//   node labels/check-outputs.js [author]   (author = haiku | sonnet, default haiku)

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { validateBatch } from "./validate.js";

const author = process.argv[2] ?? "haiku";
const INPUT_DIR = "tmp/labels/input";
const OUTPUT_DIR = join("tmp/labels/output", author);

let failed = false;
const batches = readdirSync(INPUT_DIR).filter((name) => /^(dup|matched|wrong-subject|folded|posted-new)-\d+\.json$/.test(name));
for (const name of batches.sort()) {
  const outputPath = join(OUTPUT_DIR, name);
  if (!existsSync(outputPath)) { console.log(`${name}: MISSING`); failed = true; continue; }
  const input = JSON.parse(readFileSync(join(INPUT_DIR, name), "utf8"));
  let output;
  try { output = JSON.parse(readFileSync(outputPath, "utf8")); } catch (error) { console.log(`${name}: bad JSON (${error.message})`); failed = true; continue; }
  const problems = validateBatch(input, output);
  console.log(`${name}: ${problems.length === 0 ? "ok" : problems.join("; ")}`);
  if (problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
