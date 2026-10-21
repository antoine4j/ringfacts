// Step 1e of 3.12: the maintainer's spot check. A local page with about ten
// borderline texts, the saved text beside the clean one; for hand-cleaned
// texts the deleted parts are shown struck through in the saved text.
//
//   node review-page.mjs
//
// Writes data/review.html (git-ignored: it holds the outlets' text) and
// data/review-artifact.html, the same page for a private claude.ai artifact.
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { letters, decoded } from "./text.mjs";
import { SUBJECTS } from "../../../watchlist.js";

const ARTICLES = new URL("../../../golden/articles.json", import.meta.url);
const RECORD = new URL("./record.json", import.meta.url);
const CLEAN = new URL("./data/clean.json", import.meta.url);
const READABILITY = new URL("./data/readability.json", import.meta.url);
const FETCHED = new URL("./data/fetch.json", import.meta.url);
const OUT = new URL("./data/review.html", import.meta.url);
const ARTIFACT = new URL("./data/review-artifact.html", import.meta.url);
const SENTENCES_PER_BLOCK = 3;

// Why each text is borderline, in the order the page shows them.
const PICKS = [
  ["641", "Clean text = Readability's version of the page. It is shorter than the saved text: 85% of the saved text's article part, the lowest we accepted. Did Readability lose any of the article?"],
  ["230", "Clean text = Readability's version of the page. The saved copy was cut off at 10,000 characters; Readability's is 1.7 times longer. Is the extra the rest of the article, or other stories?"],
  ["654", "Clean text = Readability's version of the page. The saved copy was only a 600-character intro; Readability's is 5 times longer. Is it the whole article, or more than the article?"],
  ["620", "Clean text = Readability's version of the page. First flagged as sharing only 2 sentences with the saved text; that was a bug in my check (the saved text's &nbsp; codes), and the corrected count is 15 of 15. Kept so your verdict stays."],
  ["746", "Clean text = Readability's version of the page. It shares 8 of the saved text's 22 sentences, now the fewest of any Readability text. Is it the same article, and is anything missing?"],
  ["96", "Clean text = Readability's version of the page, only 30% of the saved text's length. Did it drop only menus and links, or article text too?"],
  ["261", "Clean text = Readability's version of the page (it was hand-cleaned until a bug in my headline check was fixed). It is a 'Morning Report' roundup, and Readability keeps its other-news sections, which hand-cleaning had cut; they show plain because the saved text has them too. Should those sections count as furniture?"],
  ["948", "Clean text = the saved text with parts cut by hand (red). The fighter was named only in a 'LATEST NEWS' line, now cut. Right call?"],
  ["497", "Clean text = Readability's version of the page (accepted on the recheck). Two short link lines inside the text are missing from it (red): links to other stories, or part of the article?"],
  ["1146", "Clean text = the saved text with parts cut by hand (red). The last block was cut as a piece of a different story. Right call?"],
  ["653", "No clean text: marked as holding nothing of the article (headline, then site boilerplate and a login form). Agree?"],
];

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
 * A text as words, each with the key it is compared by: its letters and
 * digits only, HTML codes decoded, so "&#x27;" and "'" match.
 *
 * @param {string} text
 * @returns {{raw: string, key: string}[]}
 */
function wordsOf(text) {
  // A non-breaking space code joins two words in the saved text; split there as at a space.
  return text.replaceAll("&nbsp;", "&nbsp; ").split(/\s+/).filter(Boolean).map((raw) => ({ raw, key: letters(decoded(raw)) }));
}

/**
 * Which words of the first text are also in the second, in order: the
 * longest common sequence of the two. Words with no letters (a dash, a
 * bullet) always count as shared.
 *
 * @param {{key: string}[]} first
 * @param {{key: string}[]} second
 * @returns {boolean[]} One entry per word of the first text.
 */
function sharedWords(first, second) {
  const rows = first.length + 1;
  const columns = second.length + 1;
  const table = new Uint16Array(rows * columns);

  // Fill from the end, so each cell holds the longest common run from there on.
  for (let row = first.length - 1; row >= 0; row -= 1) {
    for (let column = second.length - 1; column >= 0; column -= 1) {
      const same = first[row].key !== "" && first[row].key === second[column].key;
      table[row * columns + column] = same ? table[(row + 1) * columns + column + 1] + 1 : Math.max(table[(row + 1) * columns + column], table[row * columns + column + 1]);
    }
  }

  // Walk the table once to read off which words matched.
  const shared = first.map((word) => word.key === "");
  let row = 0;
  let column = 0;
  while (row < first.length && column < second.length) {
    const same = first[row].key !== "" && first[row].key === second[column].key;
    if (same) {
      shared[row] = true;
      row += 1;
      column += 1;
    } else if (table[(row + 1) * columns + column] >= table[row * columns + column + 1]) row += 1;
    else column += 1;
  }
  return shared;
}

/**
 * Words as HTML: shared words plain, the rest wrapped in the given class. A
 * new block starts around every unshared run of some length, at paragraph
 * ends, and after every few sentences of shared text.
 *
 * @param {{raw: string}[]} words
 * @param {boolean[]} shared
 * @param {string} missingClass  "removed" on the saved side, "added" on the clean side.
 * @param {Set<number>} paragraphEnds  Indexes of words that end a paragraph.
 * @returns {string}
 */
function markedWords(words, shared, missingClass, paragraphEnds) {
  let html = "";
  let sentencesInBlock = 0;
  let index = 0;
  while (index < words.length) {
    // One run of words that are all shared, or all not.
    let end = index;
    while (end < words.length && shared[end] === shared[index] && !(end > index && paragraphEnds.has(end - 1))) end += 1;
    const run = words.slice(index, end);
    const text = escapeHtml(run.map((word) => word.raw).join(" "));
    const isLongCut = !shared[index] && run.length >= 8;
    if (shared[index]) html += sentenceBreaks(run, () => (sentencesInBlock += 1) % SENTENCES_PER_BLOCK === 0) + " ";
    else html += `${isLongCut ? "<br><br>" : ""}<span class="${missingClass}">${text}</span>${isLongCut ? "<br><br>" : " "}`;
    if (isLongCut) sentencesInBlock = 0;
    if (paragraphEnds.has(end - 1)) {
      html += "<br><br>";
      sentencesInBlock = 0;
    }
    index = end;
  }
  return html;
}

/**
 * Shared words as HTML, with a block break after every few sentence ends.
 *
 * @param {{raw: string}[]} run
 * @param {() => boolean} breakNow  Counts one sentence end; true when a block should end there.
 * @returns {string}
 */
function sentenceBreaks(run, breakNow) {
  const parts = [];
  for (const word of run) {
    parts.push(escapeHtml(word.raw));
    const endsSentence = /[.!?…]["”»’]?$/.test(word.raw);
    if (endsSentence && breakNow()) parts.push("<br><br>");
  }
  return parts.join(" ").replaceAll(" <br><br> ", "<br><br>");
}

/**
 * The saved text as HTML: words the clean text kept plain, words it lacks marked red.
 *
 * @param {string} body  The saved text.
 * @param {string|null} cleanText
 * @returns {string}
 */
export function savedHtml(body, cleanText) {
  const savedWords = wordsOf(body);
  const html = markedWords(savedWords, sharedWords(savedWords, wordsOf(cleanText ?? "")), "removed", new Set());

  // HTML codes left in the saved text ("&nbsp;"), shown faint: the stations read them as written.
  return html.replace(/&amp;(#x?[0-9a-f]+|[a-z]+);/gi, (code) => `<span class="code">${code}</span>`);
}

/**
 * The clean text as HTML: words the saved text also has plain, words only the
 * clean text has marked blue. Readability's own paragraphs when it is the source.
 *
 * @param {string|null} text
 * @param {string[]|undefined} paragraphs  Readability's paragraphs, when it is the source.
 * @param {string} body  The saved text.
 * @returns {string}
 */
export function cleanHtml(text, paragraphs, body) {
  if (!text) return "<i>nothing usable</i>";
  const blocks = paragraphs?.length ? paragraphs : [text];
  const cleanWords = [];
  const paragraphEnds = new Set();
  for (const block of blocks) {
    cleanWords.push(...wordsOf(block));
    paragraphEnds.add(cleanWords.length - 1);
  }
  return markedWords(cleanWords, sharedWords(cleanWords, wordsOf(body)), "added", paragraphs?.length ? paragraphEnds : new Set());
}

/**
 * HTML with every word naming the fighter highlighted: the whole word around
 * any of his watchlist stems, so declined forms ("Топурії") light up too.
 *
 * @param {string} html  Escaped text, perhaps with marking spans around it.
 * @param {string} subject  The fighter's name.
 * @returns {string}
 */
export function withNames(html, subject) {
  const stems = SUBJECTS.find((entry) => entry.name === subject).matchNames;
  const pattern = new RegExp(`[\\p{L}'’]*(?:${stems.join("|")})[\\p{L}'’]*`, "giu");
  return html.replace(pattern, (word) => `<mark class="name">${word}</mark>`);
}

/**
 * One article's section: why it is borderline, the record, and the two texts.
 *
 * @param {object} article
 * @param {string} why
 * @param {object} entry  Its line of record.json.
 * @param {string|null} cleanText
 * @returns {string}
 */
function section(article, why, entry, cleanText, paragraphs, address) {
  const verdicts = ["clean text is right", "clean text lost some of the article", "clean text still has furniture", "other"];
  const radios = verdicts.map((verdict) => `<label><input type="radio" name="v${article.id}" value="${verdict}"> ${verdict}</label>`).join(" ");
  return `<section data-id="${article.id}">
<h2>#${article.id} · <a href="${escapeHtml(address)}" target="_blank" rel="noopener">${withNames(escapeHtml(article.title), article.subject)} <span class="out">↗</span></a></h2>
<p class="why">${escapeHtml(why)}</p>
<p class="meta">${escapeHtml(article.subject)} · source: <b>${entry.source}</b> · saved ${entry.saved_chars} chars → clean ${entry.clean_chars} · ${escapeHtml(entry.reason)}</p>
<details class="texts"><summary>Show the saved and clean texts</summary><div class="pair"><div><h3>Saved text</h3><p>${withNames(savedHtml(article.body, cleanText), article.subject)}</p></div>
<div><h3>Clean text</h3><p>${withNames(cleanHtml(cleanText, paragraphs, article.body), article.subject)}</p></div></div></details>
<p class="verdict">${radios} <input type="text" placeholder="note" name="n${article.id}"></p>
</section>`;
}

/**
 * Writes the review page.
 */
function main() {
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const record = JSON.parse(readFileSync(RECORD, "utf8"));
  const clean = JSON.parse(readFileSync(CLEAN, "utf8"));
  const readability = JSON.parse(readFileSync(READABILITY, "utf8"));
  const paragraphsOf = (id) => (record[id].source === "readability" ? readability[id].paragraphs : undefined);
  const fetched = JSON.parse(readFileSync(FETCHED, "utf8"));
  const addressOf = (article) => fetched[article.id]?.address ?? article.resolved_url ?? article.url;
  const sections = PICKS.map(([id, why]) => {
    const article = articles.find((entry) => entry.id === id);
    return section(article, why, record[id], clean[id].text, paragraphsOf(id), addressOf(article));
  });
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Clean text spot check</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%236B4FA8'/%3E%3Crect x='5' y='7' width='10' height='18' rx='1.5' fill='%23fff'/%3E%3Crect x='17' y='7' width='10' height='18' rx='1.5' fill='%23fff'/%3E%3Cg stroke='%236B4FA8' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M7.5 11.5h5M7.5 15h5M7.5 18.5h5M7.5 22h3'/%3E%3Cpath d='M19.5 11.5h5M19.5 15h5M19.5 22h3'/%3E%3C/g%3E%3C/svg%3E">
<style>
:root{--bg:#fbfaf7;--ink:#1d1d1b;--muted:#6b6a64;--line:#dddad2;--del:#b3261e;--removed:#f7d4d1;--added:#cfe3fa;--name:#c78a00;--link:#1d5fa8}
:root[data-theme=dark]{--bg:#1b1b1a;--ink:#ecebe6;--muted:#a3a29b;--line:#3a3935;--del:#f2867e;--removed:#5a2622;--added:#1f3a5c;--name:#f0b429;--link:#8ab8f0;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1b1b1a;--ink:#ecebe6;--muted:#a3a29b;--line:#3a3935;--del:#f2867e;--removed:#5a2622;--added:#1f3a5c;--name:#f0b429;--link:#8ab8f0;color-scheme:dark}}
.theme{float:right;font-size:13px;display:flex;gap:4px;flex-wrap:wrap;align-items:center}.theme button{padding:3px 9px}.theme button[aria-pressed=true]{font-weight:700}
body{background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,sans-serif;margin:0 auto;max-width:1300px;padding-block:16px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{text-wrap:balance;font-size:1.5rem}h2{text-wrap:balance;font-size:1.15rem}
section{border-top:1px solid var(--line);padding:12px 0 20px}.why{font-weight:600}h2 a{color:inherit;text-decoration:none}h2 a:hover,h2 a:focus-visible{text-decoration:underline;text-decoration-color:var(--muted);text-underline-offset:3px}h2 a .out{color:var(--muted);font-weight:400;font-size:.85em}.meta{color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pair>div{min-width:0}.pair p{max-height:420px;overflow:auto;font-size:13.5px;overflow-wrap:anywhere}
details.texts{margin:6px 0 10px}details.texts summary{cursor:pointer;color:var(--muted);font-size:14px;padding:4px 0}details.texts[open] summary{margin-bottom:6px}.fold{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.verdict{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}.verdict input[type=text]{flex:1 1 180px;min-width:0;font:inherit;padding:4px 6px}
.removed{background:var(--removed);color:var(--ink);text-decoration:line-through;text-decoration-color:var(--del)}.added{background:var(--added)}mark.name{background:none;color:var(--ink);font-weight:700;border-bottom:2px solid var(--name)}.key span{padding:1px 6px;border-radius:3px}.code{color:var(--muted);font-size:.8em;border:1px dotted var(--muted);border-radius:3px;padding:0 2px}
@media (max-width:760px){.pair{grid-template-columns:1fr}.pair p{max-height:none}.theme{float:none;margin-bottom:8px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
button{font:inherit;padding:6px 12px}
</style></head><body>
<div class="theme">Theme: <button data-mode="auto">Auto</button> <button data-mode="light">Light</button> <button data-mode="dark">Dark</button> <span id="auto-note"></span></div>
<h1>Clean text spot check (task 3.12)</h1>
<p class="fold"><button id="open-all" type="button">Show all texts</button> <button id="close-all" type="button">Hide all texts</button></p>
<p><b>What you are checking:</b> that the furniture is gone, and that none of the article is lost.</p>
<p class="key"><span class="removed">Red, struck through</span> in the saved text: not in the clean text. It should all be furniture (menus, links, captions, other stories). A real article sentence in red means the clean text lost it.<br>
<span class="added">Blue</span> in the clean text: not in the saved text. It should be more of the same article (the part the saved copy missed), never another story.<br>
<mark class="name">Bold, underlined in gold</mark>: the tracked fighter’s name, in any form. <span class="code">&amp;nbsp;</span> in a dotted box: an HTML code left in the saved text where the page had a space or a symbol. It is not article content, so it is not counted as a difference, but the models read it as written. Plain text is in both. Matching is word by word, so even a short line glued to a sentence shows. A word the saved copy ran together with its neighbour ("boldpredictions") shows red on one side and blue on the other; that is not a loss.</p>
<p>Pick a verdict for each; picks and notes save as you go, on claude.ai with the page itself, so every device sees them. When done, press Copy and paste the result in the thread.</p>
${sections.join("\n")}
<p><button id="copy">Copy verdicts</button> <span id="done"></span></p>
<script>
// Fold or unfold every article’s texts at once.
document.getElementById("open-all").onclick = () => { for (const fold of document.querySelectorAll("details.texts")) fold.open = true; };
document.getElementById("close-all").onclick = () => { for (const fold of document.querySelectorAll("details.texts")) fold.open = false; };
// Theme: Auto is dark from 19:00 to 07:00 on this computer's clock, in its own time zone; the choice is remembered.
function isNightHere() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour >= 19 || hour < 7;
}
function applyTheme(mode) {
  const dark = mode === "dark" || (mode === "auto" && isNightHere());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  for (const button of document.querySelectorAll(".theme button")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  document.getElementById("auto-note").textContent = mode === "auto" ? "(" + (dark ? "night" : "day") + " in " + zone + ")" : "";
}
let savedMode = "auto";
try { savedMode = localStorage.getItem("theme") || "auto"; } catch {}
applyTheme(savedMode);
setInterval(() => { if (savedMode === "auto") applyTheme("auto"); }, 600000);
for (const button of document.querySelectorAll(".theme button")) {
  button.onclick = () => {
    savedMode = button.dataset.mode;
    try { localStorage.setItem("theme", savedMode); } catch {}
    applyTheme(savedMode);
  };
}
// Verdicts and notes: kept with the artifact (its db, one document per article) when the page runs on
// claude.ai, so every device sees the same picks; in this browser too, which is all the laptop file has.
function loadVerdicts() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem("verdicts") || "{}"); } catch {}
  return stored;
}
const verdicts = loadVerdicts();
let store = null;
const writing = {};
const noteTimers = {};
function say(text) { document.getElementById("done").textContent = text; }
function fill(id) {
  const section = document.querySelector('section[data-id="' + id + '"]');
  const saved = verdicts[id] || {};
  for (const radio of section.querySelectorAll("input[type=radio]")) radio.checked = radio.value === saved.pick;
  const note = section.querySelector("input[type=text]");
  if (document.activeElement !== note) note.value = saved.note || "";
}
async function storeVerdict(id) {
  try { localStorage.setItem("verdicts", JSON.stringify(verdicts)); } catch {}
  if (!store) { say("Saved in this browser."); return; }
  const previous = writing[id] || Promise.resolve();
  writing[id] = previous.then(() => store.doc("verdicts/" + id).set({ pick: verdicts[id].pick || "", note: verdicts[id].note || "" }));
  try { await writing[id]; say("Saved with the page."); }
  catch { say("Could not save with the page; kept in this browser. Press Copy before closing."); }
}
for (const section of document.querySelectorAll("section")) {
  const id = section.dataset.id;
  fill(id);
  for (const radio of section.querySelectorAll("input[type=radio]")) {
    radio.onchange = () => { verdicts[id] = { ...verdicts[id], pick: radio.value }; storeVerdict(id); };
  }
  const note = section.querySelector("input[type=text]");
  note.oninput = () => {
    verdicts[id] = { ...verdicts[id], note: note.value };
    clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(() => storeVerdict(id), 700);
  };
}
(async () => {
  store = window.claude?.use ? await window.claude.use("db") : null;
  if (!store) return;
  try {
    const snapshot = await store.collection("verdicts").get();
    for (const doc of snapshot.docs) {
      verdicts[doc.id] = { ...doc.data() };
      fill(doc.id);
    }
    say(snapshot.empty ? "Picks will be saved with the page." : "Loaded your saved picks.");
  } catch { say("Could not load saved picks; new picks are kept in this browser."); }
})();
document.getElementById("copy").onclick = async () => {
  const lines = [...document.querySelectorAll("section")].map((s) => {
    const id = s.dataset.id;
    const pick = s.querySelector("input[type=radio]:checked")?.value ?? "no verdict";
    const note = s.querySelector("input[type=text]").value;
    return "#" + id + ": " + pick + (note ? " (" + note + ")" : "");
  });
  try { await navigator.clipboard.writeText(lines.join("\\n")); document.getElementById("done").textContent = "Copied."; }
  catch { document.getElementById("done").textContent = lines.join(" · "); }
};
</script></body></html>`;
  writeFileSync(OUT, page);

  // The same page for a private claude.ai artifact: the host adds the document skeleton.
  const artifact = page
    .replace('<!doctype html><html><head><meta charset="utf-8"><title>Clean text spot check</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%236B4FA8\'/%3E%3Crect x=\'5\' y=\'7\' width=\'10\' height=\'18\' rx=\'1.5\' fill=\'%23fff\'/%3E%3Crect x=\'17\' y=\'7\' width=\'10\' height=\'18\' rx=\'1.5\' fill=\'%23fff\'/%3E%3Cg stroke=\'%236B4FA8\' stroke-width=\'1.6\' stroke-linecap=\'round\'%3E%3Cpath d=\'M7.5 11.5h5M7.5 15h5M7.5 18.5h5M7.5 22h3\'/%3E%3Cpath d=\'M19.5 11.5h5M19.5 15h5M19.5 22h3\'/%3E%3C/g%3E%3C/svg%3E">', '<title>Clean Text Spot Check</title>\n<meta name="claude:viewport-fit-sides" content="cover"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'%3E%3Crect width=\'32\' height=\'32\' rx=\'7\' fill=\'%236B4FA8\'/%3E%3Crect x=\'5\' y=\'7\' width=\'10\' height=\'18\' rx=\'1.5\' fill=\'%23fff\'/%3E%3Crect x=\'17\' y=\'7\' width=\'10\' height=\'18\' rx=\'1.5\' fill=\'%23fff\'/%3E%3Cg stroke=\'%236B4FA8\' stroke-width=\'1.6\' stroke-linecap=\'round\'%3E%3Cpath d=\'M7.5 11.5h5M7.5 15h5M7.5 18.5h5M7.5 22h3\'/%3E%3Cpath d=\'M19.5 11.5h5M19.5 15h5M19.5 22h3\'/%3E%3C/g%3E%3C/svg%3E">')
    .replace("</style></head><body>", "</style>")
    .replace("</script></body></html>", "</script>");
  writeFileSync(ARTIFACT, artifact);
  console.log(`wrote ${OUT.pathname}`);
}

// Run only when called as a script, not when the extract page borrows the text rendering.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
