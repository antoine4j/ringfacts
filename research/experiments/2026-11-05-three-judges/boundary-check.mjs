// The 5 Nov cut-off seam after the top-up of 2026-11-18: how often new
// articles joined claims that existed before the cut (moved there by a judge,
// or a new claim linked to an old one by the history pass), and how much the
// second judging of the 2 Nov week and the second history pass changed the
// first ones (the judges' own noise). Counts only.
//
// Usage: node research/experiments/2026-11-05-three-judges/boundary-check.mjs [cut-2026-11-05 2026-11-18]
// The folder that holds the previous export's re-exported weeks, and the date
// of the new cut (results/cut-<date>.json); writes results/boundary-<date>.json.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const [cutFolder = "cut-2026-11-05", cutDate = "2026-11-18"] = process.argv.slice(2);
const cut = read(join(here, "results", `cut-${cutDate}.json`));
const newIds = new Set(cut.new_reading_ids.grouped.map(String));
const hist = join(here, "data", "history");
const oldClaims = new Set();
const again = readdirSync(join(hist, cutFolder)).filter((f) => /^week-.*\.json$/.test(f)).sort();
for (const f of readdirSync(hist).filter((f) => /^week-.*\.json$/.test(f) && f < again[0])) for (const c of read(join(hist, f)).claims) oldClaims.add(c.id);
for (const f of again) for (const c of read(join(hist, cutFolder, f)).claims) oldClaims.add(c.id);
const firstWeek = again[0].slice(5, 15);
const newWeeks = readdirSync(hist).filter((f) => /^week-.*\.json$/.test(f) && f >= again[0]).map((f) => f.slice(5, 15));
const out = {};
for (const model of ["opus", "fable", "sonnet"]) {
  const root = join(here, "data", model);
  const r = { new_readings_in_old_claims_by_pipeline: 0, new_readings_moved_into_old_claims: 0, new_claims_linked_to_old: 0, old_links: 0, old_links_kept: 0, rejudged_old_calls: 0, rejudged_changed: 0 };
  for (const w of newWeeks) {
    for (const call of read(join(root, `judge-out-${w}.json`)).readings) {
      if (!newIds.has(String(call.reading_id))) continue;
      if (oldClaims.has(String(call.claim_id)) && call.verdict === "belongs") r.new_readings_in_old_claims_by_pipeline++;
      if (call.verdict === "does_not_belong" && oldClaims.has(String(call.belongs_in_claim_id))) r.new_readings_moved_into_old_claims++;
    }
  }
  const first = new Map(read(join(root, cutFolder, `judge-out-${firstWeek}.json`)).readings.map((c) => [`${c.claim_id}:${c.reading_id}`, c]));
  for (const c of read(join(root, `judge-out-${firstWeek}.json`)).readings) {
    const f = first.get(`${c.claim_id}:${c.reading_id}`); if (!f) continue;
    r.rejudged_old_calls++; if (f.verdict !== c.verdict || String(f.belongs_in_claim_id ?? "") !== String(c.belongs_in_claim_id ?? "")) r.rejudged_changed++;
  }
  const key = (l) => [String(l.claim_id), String(l.other_claim_id)].sort().join(":");
  for (const fighter of ["topuria", "donchenko", "amosov"]) {
    const now = read(join(root, `history-out-${fighter}.json`)).same_claims ?? [];
    const before = new Set((read(join(root, cutFolder, `history-out-${fighter}.json`)).same_claims ?? []).map(key));
    const nowKeys = new Set(now.map(key));
    r.old_links += before.size; r.old_links_kept += [...before].filter((k) => nowKeys.has(k)).length;
    for (const l of now) { const a = oldClaims.has(String(l.claim_id)), b = oldClaims.has(String(l.other_claim_id)); if (a !== b) r.new_claims_linked_to_old++; }
  }
  out[model] = r;
}
writeFileSync(join(here, "results", cutDate === "2026-11-18" ? "boundary-check.json" : `boundary-${cutDate}.json`), JSON.stringify({ cut: cutDate, rejudged_week: firstWeek, ...out }, null, 1));
console.table(out);
