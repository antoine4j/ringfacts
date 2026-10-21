// Step 1b of 3.12: run Mozilla Readability on every fetched page and keep its
// text only when four checks pass. No model calls.
//
//   node readability.mjs
//
// Reads data/pages/<id>.html; writes data/readability.json (each article's
// text, when kept, and every check's outcome).
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { SUBJECTS } from "../../../watchlist.js";
import { withoutFurniture, letters, sentences, decoded } from "./text.mjs";

const ARTICLES = new URL("../../../golden/articles.json", import.meta.url);
const PAGES = new URL("./data/pages/", import.meta.url);
const FETCHED = new URL("./data/fetch.json", import.meta.url);
const OUT = new URL("./data/readability.json", import.meta.url);
const MIN_SHARED = 2;
// The furniture estimate leaves some furniture in (bylines, newsletter boxes),
// so Readability may come in a little under it; it may not drop a sentence naming him.
const LENGTH_SLACK = 0.85;

/**
 * Readability's reading of one saved page, plus the page's own headlines.
 *
 * @param {string} html  The page.
 * @param {string} address  The page's address, for relative links.
 * @returns {{title: string, text: string, headlines: string[]}|null}
 */
function readPage(html, address) {
  const quiet = new VirtualConsole();
  const dom = new JSDOM(html, { url: address, virtualConsole: quiet });
  const document = dom.window.document;

  // The headlines a page gives itself, besides Readability's guess.
  const headlines = [
    document.querySelector("meta[property='og:title']")?.getAttribute("content"),
    document.querySelector("h1")?.textContent,
    document.title,
  ].filter(Boolean);
  const article = new Readability(document).parse();
  if (!article) return null;
  const text = plainText(article.content ?? "");
  return { title: article.title ?? "", text, paragraphs: paragraphsOf(article.content ?? ""), headlines };
}

/**
 * Readability's HTML as one line of text, with a space where each block ends,
 * so paragraphs do not run together ("books.On Saturday").
 *
 * @param {string} html  Readability's article HTML.
 * @returns {string}
 */
function plainText(html) {
  const spaced = html.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|h[1-6]|li|blockquote|figcaption|td|th|tr|section|article)>/gi, "$& ");
  const holder = new JSDOM(`<body>${spaced}</body>`).window.document.body;
  return (holder.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Readability's HTML as its paragraphs, for the review page only; the
 * stations are sent the one-line text, as v0 stores it.
 *
 * @param {string} html  Readability's article HTML.
 * @returns {string[]}
 */
function paragraphsOf(html) {
  const holder = new JSDOM(`<body>${html}</body>`).window.document.body;
  const blocks = [...holder.querySelectorAll("p, h1, h2, h3, h4, li, blockquote, figcaption")];
  const leaves = blocks.filter((block) => !block.querySelector("p, li, blockquote"));
  return leaves.map((block) => block.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * A headline without the outlet's name at its end ("... - heavy.com",
 * "... | MMA Fighting"): only the last part after a separator, and only when
 * it is short, so a headline that itself holds a " | " keeps both halves.
 *
 * @param {string} headline
 * @returns {string}
 */
export function withoutOutlet(headline) {
  const parts = headline.split(/ [-|–] /);
  const last = parts[parts.length - 1];
  const isOutlet = parts.length > 1 && last.split(/\s+/).length <= 4;
  return isOutlet ? parts.slice(0, -1).join(" ") : headline;
}

/**
 * Whether two headlines name the same article: most of the shorter one's
 * words are in the longer one, once the outlet's suffix is dropped.
 *
 * @param {string} saved  The saved headline ("... - heavy.com").
 * @param {string} found  A headline on the page.
 * @returns {boolean}
 */
export function sameHeadline(saved, found) {
  const words = (text) => new Set(withoutOutlet(text).toLowerCase().match(/\p{L}+|\d+/gu) ?? []);
  const savedWords = words(saved);
  const foundWords = words(found);
  const shorter = savedWords.size <= foundWords.size ? savedWords : foundWords;
  const longer = shorter === savedWords ? foundWords : savedWords;
  if (shorter.size < 3) return false;
  const shared = [...shorter].filter((word) => longer.has(word)).length;
  return shared / shorter.size >= 0.7;
}

/**
 * The four checks for one article's Readability text.
 *
 * @param {object} article  The golden article.
 * @param {{title: string, text: string, headlines: string[]}} page  Readability's reading.
 * @returns {{checks: object, numbers: object}}
 */
function check(article, page) {
  const stems = SUBJECTS.find((subject) => subject.name === article.subject).matchNames;
  const pageLetters = letters(page.text);
  const savedSentences = sentences(decoded(article.body)).filter((sentence) => letters(sentence).length >= 40);
  const shared = savedSentences.filter((sentence) => pageLetters.includes(letters(sentence))).length;
  const savedArticle = withoutFurniture(decoded(article.body), article.title);
  const savedArticleLength = letters(savedArticle).length;
  const lowerText = page.text.toLowerCase();
  const namesHim = (text) => stems.some((stem) => text.toLowerCase().includes(stem.toLowerCase()));
  const lostNamingHim = sentences(savedArticle).filter((sentence) => namesHim(sentence) && !pageLetters.includes(letters(sentence))).length;

  // Each check on its own line, so a failure names itself.
  const headline = [page.title, ...page.headlines].some((found) => sameHeadline(article.title, found));
  const sharesSentences = shared >= Math.min(MIN_SHARED, savedSentences.length);
  const namesFighter = namesHim(lowerText);
  const longEnough = pageLetters.length >= LENGTH_SLACK * savedArticleLength && lostNamingHim === 0;
  return {
    checks: { headline, shares_sentences: sharesSentences, names_fighter: namesFighter, long_enough: longEnough },
    numbers: { shared, lost_naming_him: lostNamingHim, saved_sentences: savedSentences.length, page_letters: pageLetters.length, saved_article_letters: savedArticleLength, saved_letters: letters(article.body).length },
  };
}

/**
 * Runs Readability and the checks on every fetched page and records the outcomes.
 */
function main() {
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const fetched = JSON.parse(readFileSync(FETCHED, "utf8"));
  const out = {};
  for (const article of articles) {
    const fetch = fetched[article.id];
    const file = new URL(`${article.id}.html`, PAGES);

    // A page that never came back has nothing to read.
    if (fetch?.status !== 200 || !existsSync(file)) {
      out[article.id] = { kept: false, reason: `page not fetched (${fetch?.status ?? fetch?.error ?? "no record"})` };
      continue;
    }
    const page = readPage(readFileSync(file, "utf8"), fetch.final_url ?? fetch.address);
    if (!page || page.text.length === 0) {
      out[article.id] = { kept: false, reason: "Readability found no article" };
      continue;
    }
    const { checks, numbers } = check(article, page);
    const failed = Object.keys(checks).filter((name) => !checks[name]);
    const kept = failed.length === 0;
    out[article.id] = { kept, checks, numbers, failed, title: page.title, text: page.text, paragraphs: page.paragraphs, reason: kept ? "Readability passed all four checks" : `failed: ${failed.join(", ")}` };
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  const keptCount = Object.values(out).filter((entry) => entry.kept).length;
  console.log(`kept ${keptCount} of ${articles.length}`);
}

main();
