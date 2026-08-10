// Integration check for the digest tier rule (2026-08-09). Drives the real
// huntSubject() with synthetic candidates through the real pipeline — real
// embedding + matcher calls, but DRY_RUN semantics: no DB writes, no
// Telegram sends. Exists because the rule's boundary cases (lib/tier.js) and
// the message formatting (digestLine/alsoMentioningLine) are unit-checkable
// on their own, but the WIRING between them — matcher verdict -> isTangential
// -> array split -> "also mentioning" line vs suppression — only shows up by
// actually running huntSubject, and real news doesn't always cooperate by
// having a genuinely tangential item on hand when you need one.
//
// Requires DRY_RUN=1 in the environment (huntSubject reads it at import
// time) or every send/write below becomes real. Run from the laptop:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//   GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key) \
//   ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret=anthropic-api-key) \
//   DRY_RUN=1 node verify-digest-tier.js

if (process.env.DRY_RUN !== "1") {
  throw new Error("run with DRY_RUN=1 — this script sends synthetic items through the real pipeline");
}

import { openDb } from "./lib/db.js";
import { huntSubject } from "./hunter.js";
import { matchItem } from "./lib/matcher.js";

const db = await openDb();
// Synthetic subject: the fixture bodies below are written around this name, so
// the two must stay in step for the mention counts to mean anything.
const subject = { name: "Testov Example", aliases: [], matchNames: ["Testov"] };

// Both bodies sit comfortably above the 400ch feed-content floor (extract.js
// MIN_FEED_TEXT) so rung 0 fires without a live network fetch to a fake
// domain — the earlier draft of this check used shorter bodies, which fell
// through to a real (failing) fetch and taught nothing about the tier rule.
const tangentialBody =
  "The lightweight division continues to shuffle as contenders jockey for position ahead of " +
  "the next scheduled event in the calendar year. Sources close to the promotion say a rematch " +
  "is being discussed for early next year, with several names in the mix for the next title " +
  "shot once the current contenders are sorted out through eliminators. Testov has been " +
  "mentioned as a measuring stick for how far the division has come, though no formal talks " +
  "are underway between either camp at this early stage of the process.";
// A SECOND tangential story from the same outlet as the first (2026-08-10), so
// the run renders the numbered "(1) · (2)" form. Deliberately about a different
// event in different words: two tangential bodies that read alike would be
// caught by Gate 2's 0.80 similarity check and never reach the tier at all,
// which is the failure mode that would make this check quietly prove nothing.
const secondTangentialBody =
  "Ticket sales for the promotion's return to the arena opened this morning, with the venue " +
  "reporting strong early demand from a market that has waited three years for a card of this " +
  "size. Local officials pointed to the economic case, citing hotel bookings and restaurant " +
  "traffic around previous events downtown. The broadcast window has not been finalised. Among " +
  "the names floated for the co-main slot was Testov, though the promotion has said nothing " +
  "publicly and no bout agreement has been sent to any camp for that position on the card.";
const mainBody =
  "Testov Example spoke to reporters today about his training camp and upcoming plans for the " +
  'rest of the year, touching on his mindset and preparation routine. "I feel ready for ' +
  'whatever comes next," Testov said during the session. "Testov has always been about ' +
  'proving doubters wrong," he added, discussing his mindset heading into the new year and the ' +
  "challenges ahead. Testov also addressed recent rumors about his next opponent, saying " +
  "Testov would fight anyone the UFC picks and that Testov trusts the matchmakers.";

const items = [
  {
    title: "Lightweight shuffle continues as contenders jockey for position",
    url: "https://example-test-wire.invalid/tangential-" + Date.now(),
    publishedAt: new Date(Date.now() - 3 * 3600_000),
    feedContent: `<p>${tangentialBody}</p>`,
    source: "Test Wire A", edition: "en", foundVia: "synthetic", rssDescription: null,
  },
  {
    title: "Arena ticket sales open for the promotion's return downtown",
    url: "https://example-test-wire.invalid/tangential2-" + Date.now(),
    publishedAt: new Date(Date.now() - 2 * 3600_000),
    feedContent: `<p>${secondTangentialBody}</p>`,
    source: "Test Wire A", edition: "en", foundVia: "synthetic", rssDescription: null,
  },
  {
    title: "Testov Example opens up about training camp and next fight",
    url: "https://example-test-wire.invalid/main-" + Date.now(),
    publishedAt: new Date(Date.now() - 1 * 3600_000),
    feedContent: `<p>${mainBody}</p>`,
    source: "Test Wire B", edition: "en", foundVia: "synthetic", rssDescription: null,
  },
];

// The subject_role tap (2026-08-10). The matcher now also answers how
// prominent the subject is in the article ("central" | "supporting" |
// "passing"), and the pipeline stores it on the item row — but this script
// runs DRY_RUN=1, so no row is ever written and there is nothing to SELECT
// afterwards. huntSubject also CLONES direct-feed items (hunter.js
// fetchFreshItems), so the objects in `items` above are not the ones the
// pipeline decorates either.
//
// So read the signal where it is born: wrap the real matchItem through
// huntSubject's `overrides` seam. This is a TAP, not a stub — the live Haiku
// call still happens and its verdict is handed back untouched; we only copy
// what came out of it. Keyed by URL, the one field that survives the clone.
const roleByUrl = new Map();
const tapMatcher = async (args) => {
  const verdict = await matchItem(args);
  roleByUrl.set(args.item.url, {
    verdict: verdict.verdict,
    // `?? null` because this reads as undefined until the matcher change
    // lands — an absent field must show as "the matcher answered nothing",
    // not crash the check that exists to observe it.
    role: verdict.subject_role ?? null,
  });
  return verdict;
};

console.log("Expect: items A and C (no headline name, 1 body mention each) -> tangential, folded");
console.log('into "Also mentioning". Both are from "Test Wire A", so that one outlet must render');
console.log('as TWO numbered links — "Test Wire A (1) · Test Wire A (2)" — not one. Item B');
console.log("(headline names him) -> its own bullet. One message, not suppressed.");
console.log("On the new axis: A should come back subject_role=passing, B=central. That is an");
console.log("expectation, not an assertion — this script reports what Haiku said, and the");
console.log("matcher samples at the API default, so one run is not evidence (see TODO.md).\n");

await huntSubject(db, subject, items, { matchItem: tapMatcher });

// The whole point of the tap: the new axis, item by item, end to end.
console.log("\n--- subject_role, as the live matcher answered it ---");
for (const item of items) {
  const seen = roleByUrl.get(item.url);
  const role = !seen
    ? "(matcher never ran for this item — held at an earlier gate?)"
    : (seen.role ?? "(none — matcher returned no subject_role)");
  console.log(`  ${(seen?.verdict ?? "-").padEnd(13)} role=${String(role).padEnd(12)} ${item.title.slice(0, 52)}`);
}
if (!roleByUrl.size) {
  console.log("  (no matcher calls at all: ANTHROPIC_API_KEY unset, so huntSubject took its");
  console.log("   fail-open path and every item was treated as UNSURE)");
}

await db.end();
