// Measures the "unrefined digest" question (2026-08-09): two thirds of what the
// group sees is a raw publisher headline, and the weakest items land there —
// the digest is the bucket for everything the matcher did NOT turn into a claim.
// Asks whether the subject's name sits in the HEADLINE or only in the BODY.
// Read-only: no writes, no posting, no LLM calls.
//
// Measured 2026-08-09 over 60 items / 36 posted, after backfill-bodies.js took
// body coverage from 4 to 49. Findings:
//   - 24 of 36 posted items were raw digest lines; 11 named no subject in the
//     headline. Name-in-headline alone is REJECTED as a tier key: #26 is a real
//     Subject B story headlined "30-1 UFC welterweight", and epithet headlines are
//     routine in MMA press.
//   - Body mention COUNT separates cleanly. Among items with a usable body,
//     claim-bearing articles name the subject 2-12x; the junk cluster names
//     them 0-1x. Gap at 1|2, read off the data like the 0.80 dup threshold.
//   - First-occurrence POSITION does not separate and is not used: #7 is a
//     legitimate division story whose first mention sits at 71% depth.
//   - The 300ch floor is load-bearing. #12 is claim-bearing, headline does not
//     name the subject, body scores 1x — and its body is a 141ch og-description
//     blurb. Without the floor the rule would demote a real claim source.
//   - Known residual: #23 names Subject C in a celebrity-listicle headline and
//     never in the body. Headline mentions are reader-visible so the rule keeps
//     it; closing that needs a second rule and there is one example of it.
//
// 2026-08-10: gained a second axis. The matcher now also answers `subject_role`
// ("central" | "supporting" | "passing") and it is stored on the item row — an
// LLM opinion about prominence, sitting next to the measured count rule. It is
// stored specifically so it can be MEASURED against the count rule before any
// weight is put on it; the new section below is the whole reason the column
// exists. No finding yet: the column is nullable and every archived row
// predates it, so the first honest reading is "nothing to compare" and the
// section says exactly that. Re-run after a few live hunts have filled it in.
// (Reading this section requires the subject_role column to exist — run
// migrate.js first, or the SELECT below fails on an unknown column.)
//
// Run:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node scripts/audit-digest-tier.js
import { openDb } from "../lib/db.js";
import { loadSubjects, matchNamesOf } from "../lib/subjects.js";
import {
  mentionsName, countMentions, isTangential, digestTierFor,
  MIN_BODY_FOR_JUDGEMENT, MAX_MENTIONS_TO_DEMOTE,
} from "../lib/tier.js";

// The rule and the watchlist both come from lib/ — this script exists to
// re-measure the thresholds the hunter runs on, so a private copy of either
// would let the measurement drift away from the thing being measured.
const subjects = await loadSubjects();
const hasName = (text, subject) => mentionsName(text, matchNamesOf(subjects, subject));

// Audit-only telemetry. `first` (position of the earliest mention, as a
// fraction of body length) was EVALUATED AND REJECTED as a tier signal —
// item #7 is a legitimate division story first mentioning the subject at 71%
// depth — so it lives here, not in lib/tier.js, and is reported for context
// only. `count` is the signal the rule actually uses.
function density(text, subject) {
  if (!text) return null;
  const names = matchNamesOf(subjects, subject);
  const count = countMentions(text, names);
  if (!count) return { count: 0, first: null };
  const lower = text.toLowerCase();
  let first = null;
  for (const n of names) {
    const at = lower.indexOf(n.toLowerCase());
    if (at >= 0 && (first === null || at < first)) first = at;
  }
  return { count, first: +(first / text.length).toFixed(2) };
}

const db = await openDb();

// claim_sources tells us which items were REFINED (fed a claim) vs raw digest.
const { rows: items } = await db.query(`
  SELECT i.id, i.subject, i.title, i.source, i.posted, i.held_reason,
         i.found_via, i.published_at, i.subject_role,
         i.body IS NOT NULL AS has_body,
         left(i.body, 4000) AS body,
         EXISTS (SELECT 1 FROM claim_sources cs WHERE cs.item_id = i.id) AS in_claim
    FROM items i
   ORDER BY i.id
`);

const bucket = (it) => {
  const inTitle = hasName(it.title, it.subject);
  const inBody = hasName(it.body, it.subject);
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
    const d = density(it.body, it.subject);
    console.log(`  #${it.id} ${String(d.count).padStart(2)}×  first@${d.first ?? "-"}  ${it.in_claim ? "claim " : "digest"}  ${it.title.slice(0, 58)}`);
  }
}

// The LIVE rule, imported — not a local re-implementation. Running the exact
// function the hunter runs is what makes this script a regression test: if
// lib/tier.js drifts, these numbers move.
const wouldDemote = (it) => isTangential(it, matchNamesOf(subjects, it.subject));

console.log(`\n--- LIVE RULE (lib/tier.js): no name in headline + body >= ${MIN_BODY_FOR_JUDGEMENT}ch + <= ${MAX_MENTIONS_TO_DEMOTE} mention(s) ---`);
const claimMentions = items.filter((i) => i.in_claim && i.body)
  .map((i) => density(i.body, i.subject).count).sort((a, b) => a - b);
console.log(`claim-bearing items mention the subject ${claimMentions[0]}-${claimMentions.at(-1)}× ` +
  `(the floor the threshold must stay under)`);
console.log(`would demote ${posted.filter(wouldDemote).length} of ${posted.length} posted items; ` +
  `${posted.filter((i) => i.in_claim && wouldDemote(i)).length} of them claim-bearing (must be 0):`);
for (const it of posted.filter(wouldDemote)) {
  console.log(`  #${it.id} ${density(it.body, it.subject).count}×  ${it.title.slice(0, 66)}`);
}
console.log(`kept despite no headline name (unmeasurable or genuinely about them):`);
for (const it of posted.filter((i) => !hasName(i.title, i.subject) && !wouldDemote(i))) {
  const d = it.body ? `${density(it.body, it.subject).count}× / ${it.body.length}ch` : "no body";
  console.log(`  #${it.id} ${d.padEnd(14)} ${it.title.slice(0, 62)}`);
}

// --- The LLM's opinion, and whether it agrees with the measured rule ---
//
// `items.subject_role` is what the Haiku matcher answers alongside its verdict:
// how prominent the subject is in the article. It is written on every item the
// matcher SAW (including wrong_subject and match rows, which never reach the
// digest), so it is a signal about the archive, not about what got posted.
// null is a real and distinct value: the matcher never looked (pre-migration
// row, matcher off, matcher error). Those rows get their own bucket instead of
// being quietly counted as some role.
//
// Nothing acts on this yet, and that is the point. The count rule above was
// read off the archive (2-12x vs 0-1x, gap at 1|2); this one arrives with a
// model's say-so and no measurement behind it, which is exactly the thing the
// repo does not ship (docs/self-improvement.md §1, §5). So: store it, tabulate
// it against the rule that IS measured, and decide later.
//
// The cross-tab below deliberately compares the two RAW signals —
// isTangential() vs the stored role — and NOT digestTierFor(), which collapses
// them into a single answer. A collapsed answer cannot show disagreement, and
// disagreement is the only thing worth measuring here.
//
// digestTierFor IS imported, but only where the question is "what does the
// live rule actually decide about this item" — the two disagreement lists.
// Hand-deriving that (headline check first, then role, then count) would be a
// private copy of the decision, i.e. exactly the drift this file's header
// argues against; the lists would keep printing the old ordering long after
// lib/tier.js changed it. The role is passed explicitly, as snake_case
// `subject_role` — these rows come straight from Postgres, not from the
// hunter's camelCase item, which is precisely why that argument exists.
const ROLES = ["central", "supporting", "passing"];
const roleOf = (it) => (ROLES.includes(it.subject_role) ? it.subject_role : null);
const liveTier = (it) => digestTierFor(it, matchNamesOf(subjects, it.subject), it.subject_role);

// One step further out than digestTierFor can see. The hunter asks
// `isRealClaim ? "main" : digestTierFor(...)`, so anything that fed a claim is
// exempt by construction and is never demoted whatever either signal says —
// count these as catches and the lists below overstate what the LLM adds.
// `in_claim` approximates isRealClaim from the archive's own record rather
// than re-deriving it: not identical (echo links write claim_sources rows too,
// and those items never posted), but it is the same exemption in spirit and it
// errs toward NOT claiming a catch.
const effectiveTier = (it) => (it.in_claim ? "main" : liveTier(it));

// Restricted to body-bearing items: without a body the count rule abstains by
// construction (it demotes only on positive evidence), so a cross-tab over
// bodyless rows would measure the absence of an article, not a disagreement.
const graded = withBody;
const labelled = graded.filter((it) => roleOf(it));

console.log(`\n--- COUNT RULE × subject_role, ${graded.length} body-bearing item(s) ---`);
if (!labelled.length) {
  console.log(`  no item carries a subject_role yet — all ${graded.length} rows are null`);
  console.log(`  (pre-migration archive / matcher off). Expected reading until live hunts`);
  console.log(`  have written the column; the table below is one honest row, not a failure.`);
}
console.log(`  ${"subject_role".padEnd(36)} demote   keep`);
for (const role of [...ROLES, null]) {
  const inRole = graded.filter((it) => roleOf(it) === role);
  const demoted = inRole.filter(wouldDemote).length;
  const label = role ?? "(null — pre-migration / matcher off)";
  console.log(`  ${label.padEnd(36)} ${String(demoted).padStart(6)} ${String(inRole.length - demoted).padStart(6)}`);
}
if (labelled.length) {
  // "The LLM would demote" = role passing; central/supporting = keep. That is
  // the LLM half of digestTierFor's OR, stated as a standalone verdict so the
  // two signals can be scored against each other.
  const agree = labelled.filter((it) => (roleOf(it) === "passing") === wouldDemote(it)).length;
  console.log(`  agreement: ${agree}/${labelled.length} labelled items ` +
    `(${Math.round((100 * agree) / labelled.length)}%) — the two signals reach the same verdict`);
}

// Why the COUNT rule abstained, in its own terms — audit telemetry, not a
// decision. Which of the three abstentions fired is the interesting part:
// "headline names them" is the one digestTierFor checks first, so an item kept
// for that reason is kept whatever the role says.
const whyKept = (it) => {
  if (hasName(it.title, it.subject)) return "headline names them";
  const len = it.body?.length ?? 0;
  if (len < MIN_BODY_FOR_JUDGEMENT) return `body ${len}ch < ${MIN_BODY_FOR_JUDGEMENT}ch`;
  return `${density(it.body, it.subject).count}× > ${MAX_MENTIONS_TO_DEMOTE}`;
};

// (a) The LLM says the subject matters here; the count rule demotes anyway.
// Under digestTierFor's current OR semantics the demotion WINS — a central or
// supporting role never rescues an item. That is deliberate (the count rule is
// the measured one), and this list is the evidence a future central-rescue
// would have to rest on. Empty means nothing is asking for one.
const roleRescueCandidates = graded.filter(
  (it) => ["central", "supporting"].includes(roleOf(it)) && wouldDemote(it));
console.log(`\n(a) role=central/supporting but the count rule demotes — ${roleRescueCandidates.length} item(s)`);
console.log(`    "live" is what the pipeline actually does with the item today; these should read`);
console.log(`    tangential (role does not rescue) unless they fed a claim. The case for a`);
console.log(`    central-rescue, if these are articles a reader would have wanted at full size.`);
if (!roleRescueCandidates.length) console.log("      (none)");
for (const it of roleRescueCandidates) {
  const exempt = it.in_claim ? " (claim-exempt)" : "";
  console.log(`      #${it.id} ${roleOf(it).padEnd(10)} ${density(it.body, it.subject).count}× / ${it.body.length}ch  ` +
    `live=${(effectiveTier(it) + exempt).padEnd(22)} ${it.title.slice(0, 46)}`);
}

// (b) The LLM says the subject is passing scenery; the count rule keeps the
// item. These are the catches the LLM ADDS — the item-#73 shape (an article
// about someone else that names the subject twice as background colour:
// "teammate of", "in his corner"), which cleared the <=1 mention threshold and
// got a full headline it did not deserve. The `whyKept` tag says which
// abstention let it through, because the headline-names-them ones are NOT
// catches: that check runs ahead of the role and keeps them regardless.
const llmCatches = graded.filter((it) => roleOf(it) === "passing" && !wouldDemote(it));
console.log(`\n(b) role=passing but the count rule keeps — ${llmCatches.length} item(s)`);
console.log(`    What the LLM signal ADDS is the NEW CATCH subset. The others change nothing:`);
console.log(`    headline-named items lose to the headline check (it runs first), and claim-bearing`);
console.log(`    items never reach the tier decision at all. Watch the "body Nch < 300ch" catches`);
console.log(`    hardest — that floor exists because #12 was a real claim source with a 141ch blurb,`);
console.log(`    so the LLM demoting there is the shape most likely to cost a real story.`);
if (!llmCatches.length) console.log("      (none)");
for (const it of llmCatches) {
  const tier = effectiveTier(it);
  const tag = it.in_claim ? "claim-exempt" : tier === "tangential" ? "NEW CATCH" : "no change";
  console.log(`      #${it.id} ${tag.padEnd(12)} live=${tier.padEnd(11)} count rule abstained: ${whyKept(it).padEnd(22)} ${it.title.slice(0, 46)}`);
}

console.log(`\n--- RAW DIGEST LINES WITH NO NAME IN THE HEADLINE (the tier-down candidates) ---`);
const candidates = rawDigest.filter((i) => bucket(i) !== "title");
if (!candidates.length) console.log("(none)");
for (const it of candidates) {
  console.log(`\n#${it.id} [${bucket(it)}] ${it.subject} — ${it.source} (${it.found_via ?? "?"})`);
  console.log(`  "${it.title}"`);
  if (it.body) {
    // Show the name's neighbourhood so the mention can be judged in context.
    const names = matchNamesOf(subjects, it.subject);
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
