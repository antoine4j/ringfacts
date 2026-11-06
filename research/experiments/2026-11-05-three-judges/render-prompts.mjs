// Writes the prompts as the agents get them: the reader prompt with the golden
// set's labelling guide inlined (its nine-answer sections, headings demoted),
// into data/prompts/. The guide's commit is recorded beside them, so a run's
// exact prompt can be rebuilt from the public files.
//
// Usage: node research/experiments/2026-11-05-three-judges/render-prompts.mjs

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const guidePath = "research/experiments/2026-09-27-answer-key/key-guide.md";
const guide = readFileSync(join(root, guidePath), "utf8");

// The guide from its first rule to before its output section, one heading level down.
const start = guide.indexOf("**What you know about the fighter");
const end = guide.indexOf("## Output");
const body = guide.slice(start, end).replace(/^## /gm, "### ").trim();
const inlined = `## The labelling guide for the nine answers\n\nThe guide below is the golden set's, written for readers labelling one article at a time; "Anton" is the maintainer whose rulings it records.\n\n${body}`;

const after = (text) => text.slice(text.indexOf("\n---\n") + 5).trim();
const out = join(here, "data", "prompts");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "reader-r1.md"), after(readFileSync(join(here, "reader-prompt.md"), "utf8")).replace("{GUIDE}", inlined) + "\n");
writeFileSync(join(out, "screen-s1.md"), after(readFileSync(join(here, "screen-prompt.md"), "utf8")) + "\n");

// The judge prompt with the rulings in force. Until the maintainer rules on
// #289 (reactions) and #383 (recurring columns), rules 2 and 4 carry the
// proposed reading, and every split names its rule so a ruling flips the calls.
const rulings = JSON.parse(readFileSync(join(here, "rulings.json"), "utf8"));
const judgeVersion = readFileSync(join(here, "judge-prompt.md"), "utf8").match(/Prompt version: (j\d+)/)[1];
writeFileSync(join(out, `judge-${judgeVersion}.md`), after(readFileSync(join(here, "judge-prompt.md"), "utf8")).replace("{RULE_2}", rulings.rule_2).replace("{RULE_4}", rulings.rule_4).replace("{RULINGS_DATE}", rulings.date) + "\n");
const commit = execSync(`git -C ${root} log -1 --format=%h -- ${guidePath}`).toString().trim();
writeFileSync(join(out, "record.json"), JSON.stringify({ rendered_at: new Date().toISOString(), guide: guidePath, guide_commit: commit, reader: "r1", screen: "s1", judge: judgeVersion, rulings: rulings.date }, null, 1));
console.log(`prompts in ${out}; guide at ${commit}`);
