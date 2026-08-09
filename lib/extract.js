// Article-body extraction (2e). Given a real article URL, fetch the page and
// pull out readable text — no jsdom/readability dependency: the consumer is a
// 1200-char matcher excerpt, not a reader view, so the lede paragraphs are all
// that matters and news CMSes surface those in predictable places. The ladder,
// most reliable first:
//
//   0. the feed's own <content:encoded> (many WordPress feeds ship the whole
//      article for free — zero HTTP)
//   1. JSON-LD NewsArticle.articleBody (very common on news sites, cleanest)
//   2. <article> element's <p> paragraphs
//   3. all <p> paragraphs above a length floor (crude but effective)
//   4. og:description meta (one sentence — better than nothing)
//
// Every failure returns { body: null } — callers treat bodies as a bonus,
// never a requirement. The `via` field is quality telemetry: logs of which
// rung fired tell us when this heuristic needs upgrading to a real parser.

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_BODY_CHARS = 10_000;   // stored cap; the matcher slices its own 1200
const MAX_HTML_BYTES = 1_500_000;
const MIN_FEED_TEXT = 400;       // feed content shorter than this is a teaser, not a body

export function decodeEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#822[01];|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// HTML fragment -> plain text: drop script/style wholesale, strip tags,
// decode entities, collapse whitespace.
export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

// Rung 0's version of the paragraph dedup below. Feed content is flattened
// whole by htmlToText rather than picked apart paragraph by paragraph, so the
// duplicate check has to happen here, while <p> boundaries still exist —
// afterwards it is one line of text with nothing to compare. Drops a <p> whose
// visible text repeats an earlier one verbatim; everything outside <p> tags,
// and every feed that uses no <p> tags at all, passes through untouched.
// Conservative on purpose: this can remove repetition, never structure.
function dropDuplicateParagraphs(html) {
  const seen = new Set();
  return html.replace(/<p[^>]*>[\s\S]*?<\/p>/gi, (block) => {
    const text = htmlToText(block);
    if (text.length < 40) return block; // too short to be a body paragraph
    if (seen.has(text)) return " ";
    seen.add(text);
    return block;
  });
}

function fromJsonLd(html) {
  for (const [, block] of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let data;
    try { data = JSON.parse(block.trim()); } catch { continue; }
    // articleBody may sit on the object itself, inside @graph, or in an array.
    const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data?.["@graph"] ?? [])];
    for (const node of nodes) {
      if (typeof node?.articleBody === "string" && node.articleBody.trim().length > 100) {
        return node.articleBody.replace(/\s+/g, " ").trim();
      }
    }
  }
  return null;
}

// Identical paragraphs collapse to one. Not cosmetic: the digest tier rule
// (lib/tier.js) demotes an article on the strength of a mention COUNT, and a
// page that renders its lede twice manufactures exactly the extra mention
// that rule reads as "this article is really about the subject". Observed on
// Sports Illustrated (item #72, 2026-08-09): 24 paragraphs, 17 unique, so the
// one passing sentence naming a watched subject counted twice and an article
// about someone else took a full headline in that subject's digest. Exact
// matches only — two distinct sentences naming the subject are two real
// mentions.
function paragraphText(html) {
  const seen = new Set();
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(([, p]) => htmlToText(p))
    .filter((t) => t.length >= 40) // shorter <p>s are bylines/captions/boilerplate
    .filter((t) => !seen.has(t) && seen.add(t));
}

function fromArticleTag(html) {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (!article) return null;
  const text = paragraphText(article).join(" ");
  return text.length >= 200 ? text : null;
}

function fromAllParagraphs(html) {
  const text = paragraphText(html).join(" ");
  return text.length >= 200 ? text : null;
}

function fromOgDescription(html) {
  const m =
    html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  return m ? decodeEntities(m[1]).trim() : null;
}

// Exported so the rung ladder is checkable against a page fixture without a
// live fetch — verify-body-dedup.js needs the article-tag rung specifically,
// and going through fetchArticleBody would either hit the network or divert
// to rung 0.
export function extractFromHtml(html) {
  const jsonLd = fromJsonLd(html);
  if (jsonLd) return { text: jsonLd, via: "json-ld" };
  const article = fromArticleTag(html);
  if (article) return { text: article, via: "article-tag" };
  const paras = fromAllParagraphs(html);
  if (paras) return { text: paras, via: "paragraphs" };
  const og = fromOgDescription(html);
  if (og) return { text: og, via: "og-description" };
  return { text: null, via: "no-extract" };
}

// Read a response body up to a byte cap — a page that never stops streaming
// can't stall the run past its own 10s timeout or blow memory.
async function readCapped(res, cap) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchArticleBody(url, { feedContent = null, timeoutMs = 10_000 } = {}) {
  // Rung 0: the feed already gave us the article. Deduped first, so the
  // teaser floor below judges how much the feed actually SAYS — a doubled
  // 300-char teaser is a teaser, not a body.
  if (feedContent) {
    const text = htmlToText(dropDuplicateParagraphs(feedContent));
    if (text.length >= MIN_FEED_TEXT) {
      return { body: text.slice(0, MAX_BODY_CHARS), via: "feed-content", fetchedAt: new Date() };
    }
  }
  if (!url) return { body: null, via: "no-url" };

  try {
    const res = await fetch(url, {
      headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { body: null, via: `http-${res.status}` };
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) return { body: null, via: "not-html" };
    const html = await readCapped(res, MAX_HTML_BYTES);
    const { text, via } = extractFromHtml(html);
    return text
      ? { body: text.slice(0, MAX_BODY_CHARS), via, fetchedAt: new Date() }
      : { body: null, via };
  } catch (err) {
    return { body: null, via: err.name === "TimeoutError" ? "timeout" : `error-${err.name}` };
  }
}
