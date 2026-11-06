// Checks one judge output against its week: valid JSON, every reading called
// exactly once, known verdicts, a core line per claim. Exits 1 when it is not
// usable, so a runner can judge the week again.
//
// Usage: node research/experiments/2026-11-05-three-judges/check-judge.mjs <model> 2026-09-28 [suffix such as j3]

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkedCalls } from "./build-marks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [model, monday, version = ""] = process.argv.slice(2);
if (!model || !/^\d{4}-\d{2}-\d{2}$/.test(monday ?? "")) throw new Error("usage: check-judge.mjs <model> <monday> [suffix]");
const file = join(here, "data", model, `judge-out-${monday}${version ? `.${version}` : ""}.json`);
if (!existsSync(file)) { console.log(`${model} ${monday}: no judge output`); process.exit(1); }
let judged;
try { judged = JSON.parse(readFileSync(file, "utf8")); } catch (error) { console.log(`${model} ${monday}: not JSON: ${error.message}`); process.exit(1); }
const week = JSON.parse(readFileSync(join(here, "data", "history", `week-${monday}.json`), "utf8"));
const problems = [];
const checked = checkedCalls(week, judged, problems);
const missing = problems.filter((line) => line.startsWith("no call for")).length;
const expected = week.claims.reduce((sum, claim) => sum + claim.readings.length, 0);
const cores = Object.keys(checked.cores).length;
console.log(`${model} ${monday}: ${checked.readings.length} of ${expected} readings called, ${missing} missing, ${checked.same_claims.length} links, ${cores} of ${week.claims.length} cores, ${problems.length} problem(s)${problems.length ? `: ${problems.slice(0, 5).join("; ")}` : ""}`);
// Usable when nearly every reading is called; a few dropped calls are listed, not fatal.
process.exit(missing > Math.max(2, expected * 0.02) ? 1 : 0);
