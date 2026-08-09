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

const db = await openDb();
const subject = { name: "Fighter C", aliases: [], matchNames: ["Fighter C", "Fighter C"] };

// Both bodies sit comfortably above the 400ch feed-content floor (extract.js
// MIN_FEED_TEXT) so rung 0 fires without a live network fetch to a fake
// domain — the earlier draft of this check used shorter bodies, which fell
// through to a real (failing) fetch and taught nothing about the tier rule.
const tangentialBody =
  "The lightweight division continues to shuffle as contenders jockey for position ahead of " +
  "the next scheduled event in the calendar year. Sources close to the promotion say a rematch " +
  "is being discussed for early next year, with several names in the mix for the next title " +
  "shot once the current contenders are sorted out through eliminators. Fighter C has been " +
  "mentioned as a measuring stick for how far the division has come, though no formal talks " +
  "are underway between either camp at this early stage of the process.";
const mainBody =
  "Fighter C spoke to reporters today about his training camp and upcoming plans for the " +
  'rest of the year, touching on his mindset and preparation routine. "I feel ready for ' +
  'whatever comes next," Fighter C said during the session. "Fighter C has always been about ' +
  'proving doubters wrong," he added, discussing his mindset heading into the new year and the ' +
  "challenges ahead. Fighter C also addressed recent rumors about his next opponent, saying " +
  "Fighter C would fight anyone the UFC picks and that Fighter C trusts the matchmakers.";

const items = [
  {
    title: "Lightweight shuffle continues as contenders jockey for position",
    url: "https://example-test-wire.invalid/tangential-" + Date.now(),
    publishedAt: new Date(Date.now() - 3 * 3600_000),
    feedContent: `<p>${tangentialBody}</p>`,
    source: "Test Wire A", edition: "en", foundVia: "synthetic", rssDescription: null,
  },
  {
    title: "Fighter C opens up about training camp and next fight",
    url: "https://example-test-wire.invalid/main-" + Date.now(),
    publishedAt: new Date(Date.now() - 1 * 3600_000),
    feedContent: `<p>${mainBody}</p>`,
    source: "Test Wire B", edition: "en", foundVia: "synthetic", rssDescription: null,
  },
];

console.log("Expect: item A (no headline name, 1 body mention) -> tangential, folded into");
console.log('"Also mentioning". Item B (headline names him) -> its own bullet. One message,');
console.log("not suppressed, since a real line exists.\n");

await huntSubject(db, subject, items);
await db.end();
