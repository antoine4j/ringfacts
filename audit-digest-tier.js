// Measures the "unrefined digest" question (2026-08-09): two thirds of what the
// group sees is a raw publisher headline, and the weakest items land there —
// the digest is the bucket for everything the matcher did NOT turn into a claim.
// Asks whether the fighter's name sits in the HEADLINE or only in the BODY.
// Read-only: no writes, no posting, no LLM calls.
//
// Measured 2026-08-09 over 60 items / 36 posted, after backfill-bodies.js took
// body coverage from 4 to 49. Findings:
//   - 24 of 36 posted items were raw digest lines; 11 named no fighter in the
//     headline. Name-in-headline alone is REJECTED as a tier key: #26 is a real
//     Fighter B story headlined "30-1 UFC welterweight", and epithet headlines are
//     routine in MMA press.
//   - Body mention COUNT separates cleanly. Among items with a usable body,
//     claim-bearing articles name the fighter 2-12x; the junk cluster names
//     them 0-1x. Gap at 1|2, read off the data like the 0.80 dup threshold.
//   - First-occurrence POSITION does not separate and is not used: #7 is a
//     legitimate division story whose first mention sits at 71% depth.
//   - The 300ch floor is load-bearing. #12 is claim-bearing, headline does not
//     name the fighter, body scores 1x — and its body is a 141ch og-description
//     blurb. Without the floor the rule would demote a real claim source.
//   - Known residual: #23 names Fighter C in a celebrity-listicle headline and
//     never in the body. Headline mentions are reader-visible so the rule keeps
//     it; closing that needs a second rule and there is one example of it.
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

// Candidate rule, evaluated against the archive. Demote ONLY on positive
// evidence of a non-mention: we must have a usable body (a 75-char
// og-description blurb cannot support a density judgment, and a 403 gives us
// nothing at all), the name must be absent from the headline, and the body
// must name them at most once. Anything we could not measure is kept — a
// missing body is not evidence of irrelevance.
const MIN_BODY_FOR_JUDGEMENT = 300;
const MAX_MENTIONS_TO_DEMOTE = 1;
const wouldDemote = (it) => {
  if (hasName(it.title, it.fighter)) return false;
  if (!it.body || it.body.length < MIN_BODY_FOR_JUDGEMENT) return false;
  return density(it.body, it.fighter).count <= MAX_MENTIONS_TO_DEMOTE;
};

console.log(`\n--- CANDIDATE RULE: no name in headline + body >= ${MIN_BODY_FOR_JUDGEMENT}ch + <= ${MAX_MENTIONS_TO_DEMOTE} mention(s) ---`);
const claimMentions = items.filter((i) => i.in_claim && i.body)
  .map((i) => density(i.body, i.fighter).count).sort((a, b) => a - b);
console.log(`claim-bearing items mention the fighter ${claimMentions[0]}-${claimMentions.at(-1)}× ` +
  `(the floor the threshold must stay under)`);
console.log(`would demote ${posted.filter(wouldDemote).length} of ${posted.length} posted items; ` +
  `${posted.filter((i) => i.in_claim && wouldDemote(i)).length} of them claim-bearing (must be 0):`);
for (const it of posted.filter(wouldDemote)) {
  console.log(`  #${it.id} ${density(it.body, it.fighter).count}×  ${it.title.slice(0, 66)}`);
}
console.log(`kept despite no headline name (unmeasurable or genuinely about them):`);
for (const it of posted.filter((i) => !hasName(i.title, i.fighter) && !wouldDemote(i))) {
  const d = it.body ? `${density(it.body, it.fighter).count}× / ${it.body.length}ch` : "no body";
  console.log(`  #${it.id} ${d.padEnd(14)} ${it.title.slice(0, 62)}`);
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
