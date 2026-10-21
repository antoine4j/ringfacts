// A spot check of extracts that changed with clean text (3.11): for ten
// training-side articles, the extract from the saved text, from the same
// saved text sent again, and from the clean text, fields that differ from
// the first marked. Only articles whose extract did not move when the saved
// text was sent again, so the change is the text's, not the model's wobble.
//
//   node extracts-page.mjs
//
// Writes data/extracts-artifact.html (git-ignored with the rest of data/),
// published as a private page whose verdicts save with it.

import { readFileSync, writeFileSync } from "node:fs";
import { savedHtml, cleanHtml, withNames } from "./review-page.mjs";

const ARTICLES = new URL("../../../golden/articles.json", import.meta.url);
const RECORD = new URL("./record.json", import.meta.url);
const FETCHED = new URL("./data/fetch.json", import.meta.url);
const RUNS = new URL("./data/runs/", import.meta.url);
const CLEAN = new URL("./data/clean.json", import.meta.url);
const READABILITY = new URL("./data/readability.json", import.meta.url);
const OUT = new URL("./data/extracts-artifact.html", import.meta.url);
const PICKS = ["494", "51", "1002", "838", "55", "905", "682", "144", "917", "563"];
const FIELDS = ["kind", "claim", "occasion", "actor", "opponent", "event", "date"];
const RUN_NAMES = [["saved-a", "Saved text"], ["saved-b", "Saved text, sent again"], ["clean-a", "Clean text"]];

/**
 * Escapes text for HTML.
 *
 * @param {unknown} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/**
 * One article's three extracts as a table, a field differing from the first run marked.
 *
 * @param {string} id
 * @returns {string}
 */
function extractTable(id) {
  const extracts = RUN_NAMES.map(([run]) => JSON.parse(readFileSync(new URL(`${run}/${id}.json`, RUNS), "utf8")).extract);
  const same = (first, second) => String(first ?? "").trim().toLowerCase() === String(second ?? "").trim().toLowerCase();
  const head = `<tr><th></th>${RUN_NAMES.map(([, name]) => `<th>${name}</th>`).join("")}</tr>`;
  const rows = FIELDS.map((field) => {
    const cells = extracts.map((extract, index) => {
      const differs = index > 0 && !same(extract[field], extracts[0][field]);
      return `<td class="${differs ? "diff" : ""}">${escapeHtml(extract[field])}</td>`;
    });
    return `<tr><th>${field}</th>${cells.join("")}</tr>`;
  });
  return `<div class="scroll"><table>${head}${rows.join("")}</table></div>`;
}

/**
 * The saved and clean texts, folded, marked as on the clean-text spot check.
 *
 * @param {object} article
 * @param {string} cleanText
 * @param {string[]|undefined} paragraphs  Readability's paragraphs, when it is the source.
 * @returns {string}
 */
function textsFold(article, cleanText, paragraphs) {
  const saved = withNames(savedHtml(article.body, cleanText), article.subject);
  const cleaned = withNames(cleanHtml(cleanText, paragraphs, article.body), article.subject);
  return `<details class="texts"><summary>Show the saved and clean texts</summary><div class="pair"><div><h3>Saved text</h3><p>${saved}</p></div><div><h3>Clean text</h3><p>${cleaned}</p></div></div></details>`;
}

/**
 * Writes the page.
 */
function main() {
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const record = JSON.parse(readFileSync(RECORD, "utf8"));
  const fetched = JSON.parse(readFileSync(FETCHED, "utf8"));
  const clean = JSON.parse(readFileSync(CLEAN, "utf8"));
  const readability = JSON.parse(readFileSync(READABILITY, "utf8"));
  const verdicts = ["clean extract better", "saved extract better", "same meaning", "both wrong"];
  const sections = PICKS.map((id) => {
    const article = articles.find((entry) => entry.id === id);
    const address = fetched[id]?.address ?? article.resolved_url ?? article.url;
    const radios = verdicts.map((verdict) => `<label><input type="radio" name="v${id}" value="${verdict}"> ${verdict}</label>`).join(" ");
    return `<section data-id="${id}"><details class="article"><summary><span class="status" data-status>not yet</span><h2>#${id} · ${escapeHtml(article.title)}</h2></summary>
<p class="meta"><a href="${escapeHtml(address)}" target="_blank" rel="noopener">Open the article ↗</a> · ${escapeHtml(article.subject)} · clean text from ${record[id].source}</p>${extractTable(id)}
${textsFold(article, clean[id].text, record[id].source === "readability" ? readability[id].paragraphs : undefined)}
<p class="verdict">${radios}</p>
<p class="notebox"><button type="button" class="addnote">+ Add a note</button><textarea name="n${id}" rows="2" placeholder="Why, in a line (optional)" hidden></textarea></p></details></section>`;
  });
  writeFileSync(OUT, page(sections.join("\n")));
  console.log(`wrote ${OUT.pathname}`);
}

/**
 * The whole page around the sections: styles, key, theme and verdict saving.
 *
 * @param {string} body
 * @returns {string}
 */
function page(body) {
  return `<title>Extract Spot Check</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:#fbfaf7;--ink:#1d1d1b;--muted:#6b6a64;--line:#dddad2;--diff:#cfe3fa;--del:#b3261e;--removed:#f7d4d1;--added:#cfe3fa;--name:#c78a00;--done:#2e7d4f}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1b1b1a;--ink:#ecebe6;--muted:#a3a29b;--line:#3a3935;--diff:#1f3a5c;--del:#f2867e;--removed:#5a2622;--added:#1f3a5c;--name:#f0b429;--done:#2f8a57;color-scheme:dark}}
:root[data-theme=dark]{--bg:#1b1b1a;--ink:#ecebe6;--muted:#a3a29b;--line:#3a3935;--diff:#1f3a5c;--del:#f2867e;--removed:#5a2622;--added:#1f3a5c;--name:#f0b429;--done:#2f8a57;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding-block:16px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:1.5rem;text-wrap:balance}h2{font-size:1.1rem;text-wrap:balance}h2 a{color:inherit;text-decoration:none}h2 a:hover{text-decoration:underline}h2 .out{color:var(--muted);font-weight:400}
section{border-top:1px solid var(--line);padding:6px 0}details.article>summary{cursor:pointer;list-style:none;display:flex;gap:10px;align-items:baseline;padding:6px 0}details.article>summary::-webkit-details-marker{display:none}details.article>summary h2{margin:0;flex:1;min-width:0}details.article[open]>summary{padding-bottom:4px}details.article>summary::before{content:"▸";color:var(--muted)}details.article[open]>summary::before{content:"▾"}.status{font-size:12px;white-space:nowrap;border-radius:999px;padding:1px 9px;border:1px solid var(--line);color:var(--muted)}.status.done{background:var(--done);border-color:var(--done);color:#fff}.fold{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}.fold button{font:inherit;font-size:13px;padding:3px 10px}#progress{color:var(--muted);font-size:13px}.meta{color:var(--muted);font-size:13px}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:560px;font-size:13.5px}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}th{font-weight:600;color:var(--muted)}td.diff{background:var(--diff)}
.verdict{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}.notebox{margin:4px 0 0}.addnote{font:inherit;font-size:13px;color:var(--muted);background:none;border:1px dashed var(--line);border-radius:999px;padding:2px 10px;cursor:pointer}.notebox textarea{display:block;width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}
.key span{padding:1px 6px;border-radius:3px}.key .df{background:var(--diff)}
details.texts{margin:8px 0}details.texts summary{cursor:pointer;color:var(--muted);font-size:14px;padding:4px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pair>div{min-width:0}.pair p{max-height:420px;overflow:auto;font-size:13.5px;overflow-wrap:anywhere}@media (max-width:760px){.pair{grid-template-columns:1fr}.pair p{max-height:none}}
.removed{background:var(--removed);color:var(--ink);text-decoration:line-through;text-decoration-color:var(--del)}.added{background:var(--added)}mark.name{background:none;color:var(--ink);font-weight:700;border-bottom:2px solid var(--name)}.code{color:var(--muted);font-size:.8em;border:1px dotted var(--muted);border-radius:3px;padding:0 2px}#done{color:var(--muted);font-size:13px}
</style>
<h1>Extract spot check (task 3.11)</h1>
<p class="fold"><button type="button" id="open-all">Open all</button> <button type="button" id="close-all">Close all</button> <span id="progress"></span></p>
<p>Ten training-side articles whose extract changed with clean text but did not move when the same saved text was sent again, so the change comes from the text. <span class="key"><span class="df">Blue</span></span> marks a field that differs from the first column. Under each table, the saved and clean texts fold out: <span class="key"><span class="removed">red, struck through</span></span> is saved text the clean text lacks, <span class="key"><span class="added">blue</span></span> is clean text the saved text lacks, and the fighter’s name is <mark class="name">bold, underlined in gold</mark>. Tap a headline to open or close its article; the chip beside it says whether you have marked it. "Open the article" goes to the outlet. Picks save with the page as you go. <span id="done"></span></p>
${body}
<script>
(async () => {
  const say = (text) => { document.getElementById("done").textContent = text; };
  const store = window.claude?.use ? await window.claude.use("db") : null;
  const verdicts = {};
  if (store) {
    try { for (const doc of (await store.collection("extract_verdicts").get()).docs) verdicts[doc.id] = { ...doc.data() }; } catch { say("Could not load saved picks."); }
  }
  const timers = {};
  const picked = () => Object.values(verdicts).filter((entry) => entry.pick).length;
  function mark(section, id) {
    const status = section.querySelector("[data-status]");
    const pick = verdicts[id]?.pick;
    status.textContent = pick ? "✓ " + pick : "not yet";
    status.classList.toggle("done", Boolean(pick));
    document.getElementById("progress").textContent = picked() + " of " + document.querySelectorAll("section").length + " marked";
  }
  document.getElementById("open-all").onclick = () => { for (const fold of document.querySelectorAll("details.article")) fold.open = true; };
  document.getElementById("close-all").onclick = () => { for (const fold of document.querySelectorAll("details.article")) fold.open = false; };
  async function save(id) {
    if (!store) { say("Not saved: open the page on claude.ai."); return; }
    try { await store.doc("extract_verdicts/" + id).set({ pick: verdicts[id].pick || "", note: verdicts[id].note || "" }); say("Saved with the page."); }
    catch { say("Could not save with the page."); }
  }
  for (const section of document.querySelectorAll("section")) {
    const id = section.dataset.id;
    const saved = verdicts[id] || {};
    for (const radio of section.querySelectorAll("input[type=radio]")) {
      radio.checked = radio.value === saved.pick;
      radio.onchange = () => { verdicts[id] = { ...verdicts[id], pick: radio.value }; mark(section, id); save(id); };
    }
    mark(section, id);
    const note = section.querySelector("textarea");
    const addNote = section.querySelector(".addnote");
    note.value = saved.note || "";
    const showNote = () => { note.hidden = false; addNote.hidden = true; };
    if (note.value) showNote();
    addNote.onclick = () => { showNote(); note.focus(); };
    note.oninput = () => { verdicts[id] = { ...verdicts[id], note: note.value }; clearTimeout(timers[id]); timers[id] = setTimeout(() => save(id), 700); };
  }
})();
</script>`;
}

main();
