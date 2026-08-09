// Measures the "unrefined digest" question (2026-08-09): two thirds of what the
// group sees is a raw publisher headline, and the weakest items land there —
// the digest is the bucket for everything the matcher did NOT turn into a claim.
// Asks whether the fighter's name sits in the HEADLINE or only in the BODY.
// Read-only: no writes, no posting, no LLM calls.
//
// First run (60 items, 36 posted): 24 raw digest lines, 11 of them with no name
// in the headline. Of those 11 only 3 were true junk (#56/#58/#60, all through
// the direct-feed vector closed the same day). Name-in-headline was REJECTED as
// a tier key — #26 is a real Fighter B story headlined "30-1 UFC welterweight",
// and epithet headlines are routine in MMA press. The better signal is body
// mention density, which needs bodies: only 4/60 items had one (2e shipped
// 2026-08-08, bodies start at #56). Re-run once ~40+ body-bearing items exist
// and tune off the distribution, the way the 0.80 dup and 0.10 drift gaps were.
//
// Run:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node audit-digest-tier.js
import { openDb } from "/Users/anton/Projects/fighter-bot/lib/db.js";

// Mirrors hunter.js:47-72 (FIGHTERS is not exported and importing runs a hunt).
const MATCH_NAMES = {
  "Fighter A": ["Fighter A", "Fighter A"],
  "Fighter B": ["Fighter B", "Fighter B"],
  "Fighter C": ["Fighter C", "Fighter C"],
};

const hasName = (text, fighter) =>
  !!text && MATCH_NAMES[fighter].some((n) => text.toLowerCase().includes(n.toLowerCase()));

// The candidate tier signal, once enough bodies exist to tune it: a story that
// is ABOUT someone names them repeatedly and early; a "LATEST NEWS" sidebar
// names them once, deep in. `first` is the position as a fraction of the body,
// so it stays comparable across articles of different length.
function density(text, fighter) {
  if (!text) return null;
  const lower = text.toLowerCase();
  let count = 0;
  let first = null;
  for (const n of MATCH_NAMES[fighter]) {
    const needle = n.toLowerCase();
    for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) {
      count++;
      if (first === null || at < first) first = at;
    }
  }
  return count ? { count, first: +(first / text.length).toFixed(2) } : { count: 0, first: null };
}

const db = await openDb();

// claim_sources tells us which items were REFINED (fed a claim) vs raw digest.
const { rows: items } = await db.query(`
  SELECT i.id, i.fighter, i.title, i.source, i.posted, i.held_reason,
         i.found_via, i.published_at, i.body IS NOT NULL AS has_body,
         left(i.body, 4000) AS body,
         EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.item_id = i.id) AS in_claim
    FROM items i
   ORDER BY i.id
`);

const bucket = (it) => {
  const inTitle = hasName(it.title, it.fighter);
  const inBody = hasName(it.body, it.fighter);
  if (inTitle) return "title";
  if (inBody) return "body-only";
  return "neither";
};

const posted = items.filter((i) => i.posted);
const rawDigest = posted.filter((i) => !i.in_claim); // shown verbatim, no refinement

const tally = (rows) => {
  const t = { title: 0, "body-only": 0, neither: 0 };
  for (const r of rows) t[bucket(r)]++;
  return t;
};

console.log(`archive: ${items.length} items, ${posted.length} posted to the group`);
console.log(`  of the posted: ${posted.length - rawDigest.length} fed a claim (refined path),`,
            `${rawDigest.length} were raw digest lines\n`);
console.log("name location — ALL posted items:  ", tally(posted));
console.log("name location — RAW digest only:   ", tally(rawDigest));
console.log("name location — held/never posted: ", tally(items.filter((i) => !i.posted)));

// The distribution the tier rule will eventually be read off. Needs bodies:
// with only a handful stored there is nothing to threshold against yet.
const withBody = items.filter((i) => i.has_body);
console.log(`\nbody coverage: ${withBody.length}/${items.length} items` +
  (withBody.length < 40 ? "  <- too thin to tune a density rule; re-run later" : ""));
if (withBody.length) {
  console.log("mention density (posted, body-bearing) — count / first-position:");
  for (const it of withBody.filter((i) => i.posted)) {
    const d = density(it.body, it.fighter);
    console.log(`  #${it.id} ${String(d.count).padStart(2)}×  first@${d.first ?? "-"}  ${it.in_claim ? "claim " : "digest"}  ${it.title.slice(0, 58)}`);
  }
}

console.log(`\n--- RAW DIGEST LINES WITH NO NAME IN THE HEADLINE (the tier-down candidates) ---`);
const candidates = rawDigest.filter((i) => bucket(i) !== "title");
if (!candidates.length) console.log("(none)");
for (const it of candidates) {
  console.log(`\n#${it.id} [${bucket(it)}] ${it.fighter} — ${it.source} (${it.found_via ?? "?"})`);
  console.log(`  "${it.title}"`);
  if (it.body) {
    // Show the name's neighbourhood so the mention can be judged in context.
    const names = MATCH_NAMES[it.fighter];
    const lower = it.body.toLowerCase();
    for (const n of names) {
      const at = lower.indexOf(n.toLowerCase());
      if (at >= 0) {
        console.log(`  …${it.body.slice(Math.max(0, at - 140), at + 160).replace(/\s+/g, " ")}…`);
        break;
      }
    }
  } else {
    console.log("  (no body stored — headline-only item)");
  }
}

console.log(`\n--- SANITY: the three known-bad items ---`);
for (const it of items.filter((i) => [56, 58, 60].includes(Number(i.id)))) {
  console.log(`#${it.id} posted=${it.posted} held=${it.held_reason ?? "-"} bucket=${bucket(it)} — ${it.title.slice(0, 70)}`);
}

await db.end();
