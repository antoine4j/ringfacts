// The judge prompt's versions side by side on one week, from the saved
// comparisons (results/judges-<monday>[.jN].json): per version, each judge's
// verdict counts and agreement with the maintainer's marks, and how far the
// judges agree with one another. For the write-up, so a wording change is
// read against the spread between judges, not as a result by itself.
//
// Usage: node research/experiments/2026-11-05-three-judges/versions.mjs 2026-09-28

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const monday = process.argv[2];
const files = readdirSync(join(here, "results")).filter((name) => name.startsWith(`judges-${monday}`) && name.endsWith(".json")).sort();
const rows = [];
for (const name of files) {
  const counts = JSON.parse(readFileSync(join(here, "results", name), "utf8"));
  const version = name.match(/\.(j\d+)\.json$/)?.[1] ?? "current";
  for (const model of counts.models) {
    const rates = counts.rates[model];
    rows.push([version, model, `${counts.anton.same[model]} of ${counts.anton.marks}`, rates.over_merge.pct + "%", rates.over_split.pct + "%", Object.entries(counts.rules[model]).map(([rule, count]) => `r${rule}:${count}`).join(" ")]);
  }
  rows.push([version, `majority of ${counts.models.length}`, `${counts.anton.majority.same} of ${counts.anton.majority.of}`, counts.rates.majority.over_merge.pct + "%", counts.rates.majority.over_split.pct + "%", `unanimous ${counts.agreement.unanimous}/${counts.agreement.items}, kappa ${counts.agreement.kappa_call}; keep-or-change kappa ${counts.agreement_change.kappa}`]);
}
console.log(["| Prompt | Judge | Same as the maintainer | Over-merge | Over-split | Rules behind splits / agreement |", "|---|---|---|---|---|---|", ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n"));
