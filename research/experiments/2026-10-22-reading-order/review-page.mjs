// Step 7 (E1): the maintainer's spot check. Ten fresh pages where the readers
// disagree, two texts side by side, word by word: the three pages only
// Readability could read, three where Readability and our extractor read
// different parts of the page, and four only Jina could read.
//
//   node review-page.mjs
//
// Writes data/review-artifact.html (git-ignored: it holds the outlets' text),
// published as a private claude.ai artifact.
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync } from "node:fs";
import { savedHtml, cleanHtml, withNames } from "../2026-10-20-clean-text/review-page.mjs";

// Two kinds of question: judge the right-hand text on its own, or say which of the two is better.
const CLEAN_ANSWERS = "judge";
const PREFER = "prefer";

/**
 * The answers offered for one pick, each naming the reader it is about.
 *
 * @param {string} kind  "judge" or "prefer".
 * @param {string} left  The left reader's name.
 * @param {string} right  The right reader's name.
 * @returns {{answers: string[], help: string}}
 */
function answersFor(kind, left, right) {
  if (kind === "prefer") {
    return {
      answers: [`${left} is better`, `${right} is better`, "both are fine", "neither is the article"],
      help: `Which text is the better copy of the article? Better means it has the whole article and less else (menus, links, other stories).`,
    };
  }
  return {
    answers: [`${right}: the article, clean`, `${right}: the article plus clutter`, `${right}: part of the article missing`, `${right}: not this article`],
    help: `Judge only the right-hand text (${right}). Clean: the article and little else. Plus clutter: the whole article, with menus, links or other stories mixed in. Part missing: some of the article is not there. Not this article: another story or page text.`,
  };
}

// Each pick: the article, the two texts compared, the question, the answers offered.
const PICKS = [
  ["869", "ours", "readability", "Our extractor found nothing usable; Readability did. Is Readability's text (right) this article?", CLEAN_ANSWERS],
  ["1616", "ours", "readability", "Our extractor found nothing usable; Readability did. Is Readability's text (right) this article?", CLEAN_ANSWERS],
  ["2150", "ours", "readability", "Our extractor found nothing usable; Readability did. Is Readability's text (right) this article?", CLEAN_ANSWERS],
  ["2034", "ours", "readability", "Both pass, but Readability's text is a third as long and shares few sentences. Which reads the article?", PREFER],
  ["1003", "ours", "readability", "Both pass; Readability's is longer and half of our sentences are not in it. Which reads the article?", PREFER],
  ["1780", "ours", "readability", "Both pass; Readability's is half as long. Which reads the article?", PREFER],
  ["1539", "jina", "jinaPage", "Bloody Elbow refuses us; Jina gets the page. Left: Jina's own text. Right: our extractor run on Jina's copy of the page. Which is the better copy?", PREFER],
  ["1706", "jina", "jinaPage", "Sport.nv.ua refuses us; Jina gets the page. Left: Jina's own text. Right: our extractor on Jina's copy. Which is the better copy?", PREFER],
  ["1810", "jina", "jinaPage", "A Ukr.net item that Jina followed to the outlet. Left: Jina's own text. Right: our extractor on Jina's copy. Which is the better copy?", PREFER],
  ["1161", "jina", "jinaPage", "Only Jina could get this xsport.ua page. Left: Jina's own text. Right: our extractor on Jina's copy. Which is the better copy?", PREFER],
];
const NAMES = { ours: "Our extractor", readability: "Readability", jina: "Jina's own text", jinaPage: "Our extractor on Jina's copy" };

/**
 * Escapes text for HTML.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * One article's section: the question, the two texts, the answers.
 *
 * @param {object} article  Its sample row.
 * @param {string} address  The page.
 * @param {string|null} left  The left text.
 * @param {string|null} right  The right text.
 * @param {string[]} pick  [id, left reader, right reader, question, kind of question].
 * @returns {string}
 */
function section(article, address, left, right, [id, leftReader, rightReader, question, kind]) {
  const { answers, help } = answersFor(kind, NAMES[leftReader], NAMES[rightReader]);
  const radios = answers.map((answer) => `<label><input type="radio" name="v${id}" value="${answer}"> ${answer}</label>`).join(" ");
  const leftHtml = left ? withNames(savedHtml(left, right ?? ""), article.subject) : "<i>nothing usable</i>";
  const rightHtml = withNames(cleanHtml(right, undefined, left ?? ""), article.subject);
  return `<section data-id="${id}">
<h2>#${id} · <a href="${escapeHtml(address)}" target="_blank" rel="noopener">${withNames(escapeHtml(article.title), article.subject)} <span class="out">↗</span></a></h2>
<p class="why">${escapeHtml(question)}</p>
<p class="meta"><b>How to answer:</b> ${escapeHtml(help)} The headline links to the live page if you want to compare.</p>
<p class="meta">${escapeHtml(article.subject)} · ${escapeHtml(article.source)} · ${NAMES[leftReader]} ${left?.length ?? 0} chars, ${NAMES[rightReader]} ${right?.length ?? 0}</p>
<details class="texts"><summary>Show the two texts</summary><div class="pair"><div><h3>${NAMES[leftReader]}</h3><p>${leftHtml}</p></div>
<div><h3>${NAMES[rightReader]}</h3><p>${rightHtml}</p></div></div></details>
<p class="verdict">${radios} <input type="text" placeholder="note" name="n${id}"></p>
</section>`;
}

/**
 * Writes the review page, reusing the clean-text spot check's page around new sections.
 */
function main() {
  const sample = JSON.parse(readFileSync(new URL("./data/sample.json", import.meta.url), "utf8"));
  const fetched = JSON.parse(readFileSync(new URL("./data/fetch.json", import.meta.url), "utf8"));
  const texts = JSON.parse(readFileSync(new URL("./data/texts.json", import.meta.url), "utf8"));
  const jina = JSON.parse(readFileSync(new URL("./data/jina.json", import.meta.url), "utf8"));
  const jinaPages = JSON.parse(readFileSync(new URL("./data/jina-html.json", import.meta.url), "utf8"));
  const textOf = (id, reader) => (reader === "jina" ? jina[id] : reader === "jinaPage" ? jinaPages[`fresh:${id}`]?.ours : texts[id]?.[reader]) ?? null;
  const sections = PICKS.map((pick) => {
    const article = sample.find((row) => String(row.id) === pick[0]);
    return section(article, fetched[pick[0]]?.address ?? article.url, textOf(pick[0], pick[1]), textOf(pick[0], pick[2]), pick);
  });

  // The clean-text page's frame: its style, theme switch and saving script, with new words and sections.
  const frame = readFileSync(new URL("../2026-10-20-clean-text/data/review-artifact.html", import.meta.url), "utf8");
  const start = frame.indexOf("<h1>");
  const end = frame.indexOf('<p><button id="copy">');
  const intro = `<h1>Reader spot check (self-feeding, E1)</h1>
<p class="fold"><button id="open-all" type="button">Show all texts</button> <button id="close-all" type="button">Hide all texts</button></p>
<p><b>What you are checking:</b> which reader gets the article, and how much else comes with it. Ten fresh pages (Sep to Oct) where the readers disagree.</p>
<p class="key"><span class="removed">Red, struck through</span> on the left: not in the right-hand text.<br>
<span class="added">Blue</span> on the right: not in the left-hand text.<br>
<mark class="name">Bold, underlined in gold</mark>: the fighter's name, in any form. Plain text is in both. The headline links to the live page, to compare.</p>
<p><b>Two kinds of question.</b> The first three ask about the right-hand text alone (Readability's, where our extractor found nothing): is it this article, and is it clean? The other seven ask which of the two texts is the better copy of the article. Each article says which under "How to answer".</p>
<p><b>What your answers decide:</b> #869 to #1780, whether our extractor goes before Readability; #1539 to #1161, whether to read Jina's copy of a page with our extractor instead of using Jina's own text. "Clutter" is fine to accept: it barely changes decisions. A missing part or the wrong article is what matters.</p>
<p>Pick an answer for each; picks and notes save as you go, with the page. When done, just tell me in the thread.</p>
`;
  const page = frame.slice(0, start).replace("<title>Clean Text Spot Check</title>", "<title>Reader Spot Check</title>") + intro + sections.join("\n") + "\n" + frame.slice(end);
  writeFileSync(new URL("./data/review-artifact.html", import.meta.url), page);
  console.log("wrote data/review-artifact.html");
}

main();
