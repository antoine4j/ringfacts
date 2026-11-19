// Checks one model's reader answers for a week: every batch answered, every
// article answered once, every field a known value. A bad batch is named so it
// can be read again; the judge input refuses to build while one is bad.
//
// Usage: node research/experiments/2026-11-05-three-judges/check-batches.mjs <model> 2026-09-28

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANSWERS, BODY_PROBLEMS, CAREER_EVENTS, FIRST_SOURCES, KINDS, NINE } from "./values.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [model, monday] = process.argv.slice(2);
const folder = join(here, "data", model, `batches-${monday}`);

/**
 * The problems in one batch's answers.
 *
 * @param input  The batch as sent.
 * @param output  The answers, or null when unread.
 * @returns Problem lines; empty when the batch is good.
 */
export function batchProblems(input, output) {
  if (!output) return ["not read yet"];
  const problems = [];
  if (!Array.isArray(output)) return ["answers are not a list"];
  const wanted = new Set(input.map((reading) => String(reading.reading_id)));
  const seen = new Set();
  for (const answer of output) {
    const id = String(answer.reading_id);
    if (!wanted.has(id)) problems.push(`${id}: not in the batch`);
    if (seen.has(id)) problems.push(`${id}: answered twice`);
    seen.add(id);
    for (const question of NINE) if (!ANSWERS[question].includes(answer[question])) problems.push(`${id}: ${question} = ${JSON.stringify(answer[question])}`);
    if (!KINDS.includes(answer.kind)) problems.push(`${id}: kind = ${JSON.stringify(answer.kind)}`);
    if (!BODY_PROBLEMS.includes(answer.body_problem ?? "")) problems.push(`${id}: body_problem = ${JSON.stringify(answer.body_problem)}`);
    if (!FIRST_SOURCES.includes(answer.first_source)) problems.push(`${id}: first_source = ${JSON.stringify(answer.first_source)}`);
    if (!CAREER_EVENTS.includes(answer.career_event)) problems.push(`${id}: career_event = ${JSON.stringify(answer.career_event)}`);
    if (typeof answer.claim !== "string" || !answer.claim) problems.push(`${id}: no claim sentence`);
    if (typeof answer.occasion !== "string") problems.push(`${id}: no occasion`);
    if (answer.fact === "no_fact" && answer.firmness !== "none") problems.push(`${id}: no_fact with firmness ${answer.firmness}`);
    if (["result", "next_fight", "health"].includes(answer.fact) && answer[`reports_his_${answer.fact === "next_fight" ? "next_fight" : answer.fact}`] !== "yes") problems.push(`${id}: fact ${answer.fact} but its yes/no is no`);
  }
  for (const id of wanted) if (!seen.has(id)) problems.push(`${id}: no answer`);
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!model || !monday) throw new Error("usage: check-batches.mjs <model> <monday>");
  let bad = 0;
  let answered = 0;
  for (const name of readdirSync(folder).filter((file) => file.endsWith(".in.json")).sort()) {
    const input = JSON.parse(readFileSync(join(folder, name), "utf8"));
    const out = join(folder, name.replace(".in.json", ".out.json"));
    const output = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : null;
    const problems = batchProblems(input, output);
    if (output) answered += output.length;
    if (problems.length) {
      bad++;
      console.log(`${name}: ${problems.length} problem(s)\n  ${problems.slice(0, 12).join("\n  ")}${problems.length > 12 ? "\n  …" : ""}`);
    }
  }
  console.log(`${model} ${monday}: ${answered} answers, ${bad} bad batch(es)`);
  process.exit(bad ? 1 : 0);
}
