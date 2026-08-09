// Regression check for duplicated paragraphs in extracted bodies (2026-08-09).
//
// Why this exists: item #72 (Sports Illustrated, "UFC Contender Quillan
// Salkilld Eyes Massive Top-10 Fight") posted its headline verbatim to the
// group even though it is a Salkilld story that names Ilia Topuria exactly
// once, in one passing sentence. The digest tier rule (lib/tier.js) should
// have demoted it. It didn't, because SI renders its lede paragraphs TWICE
// inside the first <article> element — measured on the live page: 24
// paragraphs of length >= 40, only 17 unique. fromArticleTag joined both
// copies, so the single Topuria sentence counted as 2 mentions, one above
// TIER_MAX_MENTIONS, and the article kept a full headline.
//
// The demotion rule is deliberately built on "positive evidence of a
// non-mention" — a doubled body manufactures exactly the evidence it needs to
// NOT demote. So this is fixed in the extractor, not by moving the threshold:
// a mention count is only meaningful over text that says each thing once.
//
// No network, no DB, no API keys:
//   node verify-body-dedup.js

import { htmlToText, extractFromHtml, fetchArticleBody } from "./lib/extract.js";
import { countMentions, isTangential } from "./lib/tier.js";

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n        expected ${expected}, got ${actual}`);
}

// The real shape of the SI page, reduced to its essentials: every paragraph
// emitted twice, back to back, inside one <article>. The Topuria sentence is
// the verbatim one from item #72's stored body.
const TOPURIA_PARA =
  "Salkilld has quickly emerged as a lightweight to pay attention to in a division that has " +
  "experienced recent parity at the top. In June at UFC Freedom 250 in Washington, D.C., " +
  "Justin Gaethje upset Ilia Topuria to become the new champion, which opens up a fresh lineup " +
  "of contenders should Gaethje opt to defend his title a few more times.";
const LEDE_PARA =
  "Capping off an entertaining UFC Vegas 120 card Saturday night at the Meta APEX in Las Vegas, " +
  "UFC lightweight contender Quillan Salkilld delivered a potentially career-defining " +
  "performance against the always-durable Mateusz Gamrot with a first-round rear-naked choke.";
const CLOSER_PARA =
  "Even if it doesn't happen, Salkilld said he is already interested in bigger opportunities " +
  "down the line where the stakes attached will be clearer than ever before, he explained.";

const doubledArticle =
  "<article>" +
  [LEDE_PARA, LEDE_PARA, TOPURIA_PARA, TOPURIA_PARA, CLOSER_PARA, CLOSER_PARA]
    .map((p) => `<p>${p}</p>`)
    .join("\n") +
  "</article>";

const html = `<html><body>${doubledArticle}</body></html>`;
const { text: body, via } = extractFromHtml(html);

console.log(`extracted ${body?.length ?? 0} chars via ${via}\n`);
check("rung under test", via, "article-tag"); // the rung item #72 came through

const matchNames = ["Topuria", "Топурі"];
const title = "UFC Contender Quillan Salkilld Eyes Massive Top-10 Fight After UFC Vegas 120 Win";

// 1. Each paragraph survives exactly once.
check("lede paragraph appears once", body.split(LEDE_PARA).length - 1, 1);
check("Topuria paragraph appears once", body.split(TOPURIA_PARA).length - 1, 1);
check("closer paragraph appears once", body.split(CLOSER_PARA).length - 1, 1);

// 2. Which is the whole point: the mention count now reflects the article.
check("Topuria mention count", countMentions(body, matchNames), 1);

// 3. And so the tier rule reaches the verdict it was designed to reach —
//    the Salkilld story folds into "Also mentioning" instead of getting a
//    headline in the Topuria digest.
check("isTangential", isTangential({ title, body }, matchNames), true);

// 4. Guard the obvious over-correction: a body that legitimately repeats a
//    NAME across distinct sentences must keep both mentions. Only identical
//    paragraphs collapse, never similar ones.
const genuine = htmlToText(
  `<p>Topuria opened the session by talking about his camp and what the last year taught him about pacing.</p>` +
    `<p>Later, Topuria returned to the subject of the title and said he intends to reclaim it before the summer.</p>`
);
check("distinct sentences naming the subject both survive", countMentions(genuine, matchNames), 2);

// ---------------------------------------------------------------------------
// Rung 0 (feed-content). The six direct outlet feeds in lib/feeds.js hand the
// whole article over in <content:encoded>, so nothing is ever scraped and the
// paragraph-level fix above never runs. Same doubling, same wrong mention
// count — latent rather than observed, but the richest rung is the worst place
// to leave it. htmlToText flattens to one line, so the duplicate check has to
// happen while the <p> boundaries still exist.
console.log("");
const FEED_FILLER =
  "The card drew a strong walk-up crowd and the broadcast team spent much of the night discussing " +
  "how quickly the picture at the top of the division has changed over the past eight months, " +
  "with several contenders now waiting on a booking that makes sense for everyone involved.";
const doubledFeed = [TOPURIA_PARA, TOPURIA_PARA, FEED_FILLER, FEED_FILLER]
  .map((p) => `<p>${p}</p>`)
  .join("");
const feed = await fetchArticleBody(null, { feedContent: doubledFeed });
check("feed rung still fires", feed.via, "feed-content");
check("feed: Topuria paragraph appears once", feed.body.split(TOPURIA_PARA).length - 1, 1);
check("feed: Topuria mention count", countMentions(feed.body, matchNames), 1);
check("feed: isTangential", isTangential({ title, body: feed.body }, matchNames), true);

// Feeds that ship plain text or <br>-separated lines have no <p> boundaries at
// all. Those must pass through exactly as before — the dedup step is allowed to
// remove repetition, never to start dropping content it cannot structure.
const plainFeed =
  "Topuria opened the session by talking about his camp and what the last year taught him. " +
  "<br><br>Later, Topuria returned to the subject of the title and said he intends to reclaim it " +
  "before the summer, adding that the timing is not entirely in his hands and that he expects " +
  "an answer from the promotion within weeks rather than months of the current negotiation. " +
  "He declined to name an opponent, saying only that the division sorts itself out in the cage " +
  "and that he has never needed to campaign publicly for the fights he ends up taking anyway.";
const plain = await fetchArticleBody(null, { feedContent: plainFeed });
check("plain feed still fires", plain.via, "feed-content");
check("plain feed keeps both real mentions", countMentions(plain.body, matchNames), 2);
check("plain feed text preserved", plain.body, htmlToText(plainFeed));

console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
