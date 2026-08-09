// The extraction ladder (tier 1). Five rungs decide how much of an article the
// matcher and the digest tier rule ever get to see, and WHICH rung fires is the
// whole question — a page that falls to og:description gives the tier rule a
// 150-char blurb to count mentions in, which is why MIN_BODY_FOR_JUDGEMENT
// exists. Every rung gets a fixture here.
//
// The subject is a synthetic name ("Testov"), never a real watchlist entry:
// tracked files stopped naming who Anton actually follows in commit 555e918,
// and a test fixture is a tracked file like any other.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, extractFromHtml, fetchArticleBody } from "./extract.js";
import { countMentions, isTangential } from "./tier.js";

const MATCH_NAMES = ["Testov", "Тестов"];

// Long enough to clear MIN_FEED_TEXT (400) and MIN_BODY_FOR_JUDGEMENT (300),
// so a fixture never fails for being short when the point is something else.
const filler = (n) =>
  Array.from(
    { length: n },
    (_, i) =>
      `The division continued to reshuffle through the back half of the season as contenders ` +
      `waited on bookings that made sense for everyone involved, and paragraph ${i} of the ` +
      `report walked through the standings one place at a time without hurry.`
  );

describe("rung selection", () => {
  test("JSON-LD articleBody wins over everything below it", () => {
    const html = `<html><head><script type="application/ld+json">
      ${JSON.stringify({ "@type": "NewsArticle", articleBody: filler(3).join(" ") })}
    </script></head><body><article><p>${filler(1)[0]}</p></article></body></html>`;
    const { via, text } = extractFromHtml(html);
    assert.equal(via, "json-ld");
    assert.ok(text.length > 300);
  });

  test("article tag is used when there is no JSON-LD", () => {
    const html = `<html><body><article>${filler(3).map((p) => `<p>${p}</p>`).join("")}</article></body></html>`;
    assert.equal(extractFromHtml(html).via, "article-tag");
  });

  test("bare paragraphs are the fallback when no article tag exists", () => {
    const html = `<html><body><div>${filler(3).map((p) => `<p>${p}</p>`).join("")}</div></body></html>`;
    assert.equal(extractFromHtml(html).via, "paragraphs");
  });

  test("og:description is the last rung before giving up", () => {
    const html = `<html><head><meta property="og:description" content="A short blurb about the card."></head><body></body></html>`;
    const { via, text } = extractFromHtml(html);
    assert.equal(via, "og-description");
    assert.equal(text, "A short blurb about the card.");
  });

  // "no-extract" rather than null on purpose: body_via is telemetry, and a
  // page that yielded nothing is a different fact from a row written before
  // the column existed. The audit scripts partition on exactly that.
  test("a page with nothing extractable reports the no-extract rung, never throws", () => {
    const { via, text } = extractFromHtml("<html><body><div>hi</div></body></html>");
    assert.equal(via, "no-extract");
    assert.equal(text, null);
  });

  test("captions and bylines are excluded — under 40 chars is not a body paragraph", () => {
    const html = `<html><body><div><p>Photo: Getty</p><p>By A. Reporter</p>${filler(3)
      .map((p) => `<p>${p}</p>`)
      .join("")}</div></body></html>`;
    const { text } = extractFromHtml(html);
    assert.ok(!text.includes("Photo: Getty"));
    assert.ok(!text.includes("By A. Reporter"));
  });
});

// ---------------------------------------------------------------------------
// Paragraph doubling. Pathology observed live on Sports Illustrated
// (item #72, 2026-08-09): the page renders its lede paragraphs TWICE inside the
// first <article> — 24 paragraphs of length >= 40, only 17 unique. The single
// sentence naming the watched subject therefore counted as 2 mentions, one
// above TIER_MAX_MENTIONS, so an article about someone else took a full
// headline in that subject's digest instead of folding into "Also mentioning".
//
// The demotion rule is deliberately built on positive evidence of a
// NON-mention, so a doubled body manufactures exactly the evidence it needs to
// NOT demote. That is why this is fixed in the extractor rather than by moving
// the threshold: a mention count is only meaningful over text that says each
// thing once.
describe("duplicated paragraphs (SI pathology, item #72)", () => {
  const mentionPara =
    "Salter has quickly emerged as a lightweight to pay attention to in a division that has " +
    "experienced recent parity at the top. In June, Testov was upset by the eventual champion, " +
    "which opened up a fresh lineup of contenders should the belt change hands again this year.";
  const ledePara =
    "Capping off an entertaining card on Saturday night at the arena downtown, the lightweight " +
    "contender Salter delivered a potentially career-defining performance against a durable " +
    "opponent with a first-round submission that ended matters early.";
  const closerPara =
    "Even if it does not happen, Salter said he is already interested in bigger opportunities " +
    "down the line where the stakes attached will be clearer than ever before, he explained.";

  const doubled = (paras) => paras.flatMap((p) => [p, p]).map((p) => `<p>${p}</p>`).join("\n");
  const title = "Contender Salter eyes a massive top-10 fight after his win downtown";

  test("article-tag rung: each paragraph survives exactly once", () => {
    const html = `<html><body><article>${doubled([ledePara, mentionPara, closerPara])}</article></body></html>`;
    const { text, via } = extractFromHtml(html);
    assert.equal(via, "article-tag");
    for (const [label, para] of [["lede", ledePara], ["mention", mentionPara], ["closer", closerPara]]) {
      assert.equal(text.split(para).length - 1, 1, `${label} paragraph should appear once`);
    }
  });

  test("article-tag rung: the mention count now reflects the article", () => {
    const html = `<html><body><article>${doubled([ledePara, mentionPara, closerPara])}</article></body></html>`;
    const { text } = extractFromHtml(html);
    assert.equal(countMentions(text, MATCH_NAMES), 1);
    // Which is the whole point — the story folds into "Also mentioning".
    assert.equal(isTangential({ title, body: text }, MATCH_NAMES), true);
  });

  // The obvious over-correction to guard against. Two DISTINCT sentences that
  // both name the subject are two real mentions; only identical paragraphs
  // collapse, never merely similar ones.
  test("distinct sentences naming the subject both survive", () => {
    const text = htmlToText(
      `<p>Testov opened the session by talking about his camp and what the last year taught him about pacing.</p>` +
        `<p>Later, Testov returned to the subject of the title and said he intends to reclaim it before summer.</p>`
    );
    assert.equal(countMentions(text, MATCH_NAMES), 2);
  });

  // Rung 0 is the RICHEST rung — the six direct outlet feeds ship whole
  // articles in <content:encoded>, so nothing is ever scraped and the
  // paragraph-level fix above never runs. Same doubling, same wrong count:
  // latent rather than observed, but the richest rung is the worst place to
  // leave it. htmlToText flattens to a single line, so the duplicate check has
  // to happen while the <p> boundaries still exist.
  test("feed-content rung dedups too", async () => {
    const feedContent = doubled([mentionPara, ...filler(1)]);
    const r = await fetchArticleBody(null, { feedContent });
    assert.equal(r.via, "feed-content");
    assert.equal(r.body.split(mentionPara).length - 1, 1);
    assert.equal(countMentions(r.body, MATCH_NAMES), 1);
    assert.equal(isTangential({ title, body: r.body }, MATCH_NAMES), true);
  });

  // Feeds that ship plain text or <br>-separated lines have no <p> boundaries
  // at all. Those must pass through byte-identically: the dedup step is allowed
  // to remove repetition, never to start dropping content it cannot structure.
  test("a feed with no <p> tags passes through untouched", async () => {
    const plain =
      "Testov opened the session by talking about his camp and what the last year taught him. " +
      "<br><br>Later, Testov returned to the subject of the title and said he intends to reclaim " +
      "it before the summer, adding that the timing is not entirely in his hands and that he " +
      "expects an answer from the promotion within weeks rather than months of negotiation. " +
      "He declined to name an opponent, saying only that the division sorts itself out in the " +
      "cage and that he has never campaigned publicly for the fights he ends up taking anyway.";
    const r = await fetchArticleBody(null, { feedContent: plain });
    assert.equal(r.via, "feed-content");
    assert.equal(r.body, htmlToText(plain));
    assert.equal(countMentions(r.body, MATCH_NAMES), 2);
  });

  // The teaser floor (MIN_FEED_TEXT) judges how much a feed actually SAYS, so
  // it has to be applied AFTER dedup — a doubled 300-char teaser is a teaser,
  // not a body, and must fall through to the fetch rungs rather than being
  // accepted as a complete article.
  test("a doubled teaser is still a teaser and does not satisfy the feed rung", async () => {
    const teaser = "A short teaser paragraph that runs to roughly two hundred and twenty characters " +
      "in total, which on its own sits below the floor the feed rung requires before it will call " +
      "the feed a complete article body worth trusting.";
    assert.ok(teaser.length < 400 && teaser.length * 2 > 400, "fixture must straddle the floor");
    const r = await fetchArticleBody(null, { feedContent: `<p>${teaser}</p><p>${teaser}</p>` });
    assert.notEqual(r.via, "feed-content");
  });
});

describe("htmlToText", () => {
  test("strips script and style content, not just tags", () => {
    const text = htmlToText("<div><script>var x = 'boo';</script><p>Real text here.</p><style>p{color:red}</style></div>");
    assert.ok(!text.includes("boo"));
    assert.ok(!text.includes("color:red"));
    assert.ok(text.includes("Real text here."));
  });

  test("decodes entities so downstream name matching sees real characters", () => {
    assert.equal(htmlToText("<p>Testov&#39;s next fight &amp; more</p>"), "Testov's next fight & more");
  });
});
