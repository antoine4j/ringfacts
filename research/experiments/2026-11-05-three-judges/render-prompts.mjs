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
const commit = execSync(`git -C ${root} log -1 --format=%h -- ${guidePath}`).toString().trim();
writeFileSync(join(out, "record.json"), JSON.stringify({ rendered_at: new Date().toISOString(), guide: guidePath, guide_commit: commit, reader: "r1", screen: "s1" }, null, 1));
console.log(`prompts in ${out}; guide at ${commit}`);
