// Launch Map task 3.3, the maintainer's half: a private page with one folded
// card per suspect, the agent's proposed mark beside the saved text, and
// controls to confirm it or pick another. Built like the clean-text spot
// check (research/experiments/2026-10-20-clean-text/review-page.mjs): the
// same word-by-word comparison of saved and clean text, the same theme
// switch, and verdicts saved the same way, with the page itself on claude.ai
// and in the browser otherwise.
//
//   node review-page.mjs
//
// Reads premarks.json (tracked) and the saved and clean texts (git-ignored,
// so they exist only in the checkout that holds them; set ARTICLE_TEXT_ROOT
// to that checkout when running from another worktree). Writes
// data/review.html and data/review-artifact.html in that checkout, both
// git-ignored because they hold the outlets' text.
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MARKS, TEXT_ROOT } from "./premark.mjs";
import { savedHtml, cleanHtml, withNames } from "../2026-10-20-clean-text/review-page.mjs";

const PREMARKS = new URL("./premarks.json", import.meta.url);
const CLEAN_FOLDER = new URL("research/experiments/2026-10-20-clean-text/", TEXT_ROOT);
const ARTICLES = new URL("golden/articles.json", TEXT_ROOT);
const OUT_FOLDER = new URL("research/experiments/2026-11-18-unusable-texts/data/", TEXT_ROOT);
const CONTENTS_ADDRESS = "https://claude.ai/artifact/U6ZPToDnMuWt9Zux8pUf72";
const MARK_ORDER = ["unusable", "partial", "furniture", "fine"];

/**
 * Escapes text for HTML.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// The agent's least certain calls, shown first among the real decisions: video pages whose
// blurb may or may not count as the article, and cuts whose lost part is unknown.
const LEAST_CERTAIN = ["44", "1045", "521", "740", "746", "353", "563", "737", "937"];

/**
 * Whether a proposal needs a real look: the agent thinks the text is unusable
 * or partial. The others, furniture and fine, are texts the agent thinks usable.
 *
 * @param {{ mark: string }} suspect
 * @returns {boolean}
 */
function needsLook(suspect) {
  return suspect.mark === "unusable" || suspect.mark === "partial";
}

/**
 * Splits the suspects into the two groups, each in showing order. The real
 * decisions come first, the least certain calls first among them; the skim
 * group follows, furniture before fine.
 *
 * @param {object[]} suspects
 * @returns {{ look: object[], skim: object[] }}
 */
function inGroups(suspects) {
  const byId = (first, second) => Number(first.id) - Number(second.id);
  const markRank = (suspect) => MARK_ORDER.indexOf(suspect.mark);
  const uncertainRank = (suspect) => (LEAST_CERTAIN.includes(suspect.id) ? 0 : 1);
  const look = suspects.filter(needsLook).sort((first, second) => uncertainRank(first) - uncertainRank(second) || markRank(first) - markRank(second) || byId(first, second));
  const skim = suspects.filter((suspect) => !needsLook(suspect)).sort((first, second) => markRank(first) - markRank(second) || byId(first, second));
  return { look, skim };
}

/**
 * The text panes of one card: the saved text, and beside it the clean text
 * when there is one that differs.
 *
 * @param {object} article  The golden article with its text.
 * @param {object} cleanEntry  Its line of the clean-text clean.json.
 * @param {string[]|undefined} paragraphs  Readability's paragraphs, when it is the clean text's source.
 * @returns {string}
 */
function textPanes(article, cleanEntry, paragraphs) {
  const cleanText = cleanEntry.text;
  const saved = withNames(savedHtml(article.body, cleanText), article.subject);
  const savedPane = `<div><h3>Saved text (${article.body.length.toLocaleString("en")} characters)</h3><p>${saved}</p></div>`;

  // No clean text, or one identical to the saved text: say so instead of showing it twice.
  if (!cleanText) return `<div class="pair">${savedPane}<div><h3>Clean text</h3><p><i>nothing usable: the clean-text step found no article in it</i></p></div></div>`;
  if (cleanText === article.body) return `<div class="pair">${savedPane}<div><h3>Clean text</h3><p><i>identical to the saved text</i></p></div></div>`;
  const clean = withNames(cleanHtml(cleanText, paragraphs, article.body), article.subject);
  return `<div class="pair">${savedPane}<div><h3>Clean text (${cleanText.length.toLocaleString("en")} characters, ${cleanEntry.source})</h3><p>${clean}</p></div></div>`;
}

/**
 * The folded line of one card: id, headline, outlet, and the status chips.
 *
 * @param {object} suspect  Its line of premarks.json.
 * @param {object} article
 * @returns {string}
 */
function cardSummary(suspect, article) {
  const codeChips = suspect.codes.map((code) => `<span class="chip code">${code}</span>`).join("");
  return `<summary><span class="num">#${suspect.id}</span> <span class="head">${withNames(escapeHtml(article.title), article.subject)}</span> <span class="outlet">${escapeHtml(article.source)}</span>
<span class="chips"><span class="chip agent ${suspect.mark}" title="The agent's call, not yours until you confirm it">agent: ${suspect.mark}</span><span class="chip status" data-status>not yet reviewed</span>${codeChips}</span></summary>`;
}

/**
 * The open part of one card: link, measurements, the agent's call with its
 * reason, both texts, and the controls.
 *
 * @param {object} suspect
 * @param {object} article
 * @param {string} address  The page's own address.
 * @param {string} panes  The text panes.
 * @returns {string}
 */
function cardBody(suspect, article, address, panes) {
  const lengths = suspect.lengths;
  const radios = MARK_ORDER.map((mark) => `<label title="${escapeHtml(MARKS[mark])}"><input type="radio" name="v${suspect.id}" value="${mark}"> ${mark}</label>`);
  radios.push(`<label><input type="radio" name="v${suspect.id}" value="can't tell"> can't tell</label>`);
  return `<p class="meta">${escapeHtml(article.subject)} · <a href="${escapeHtml(address)}" target="_blank" rel="noopener">open the page ↗</a> · saved ${lengths.saved} characters, clean ${lengths.clean}, running prose ${lengths.prose}, first prose at ${lengths.lead}</p>
<p class="call"><b>The agent's call (not yet yours): ${suspect.mark}.</b> ${escapeHtml(suspect.reason)}</p>
${panes}
<p class="verdict"><button type="button" class="confirm" data-mark="${suspect.mark}">Confirm: ${suspect.mark}</button> or pick: ${radios.join(" ")} <input type="text" placeholder="note" name="n${suspect.id}"></p>`;
}

/**
 * One suspect's whole folded card.
 *
 * @param {object} suspect  Its line of premarks.json.
 * @param {object} article  The golden article with its text.
 * @param {object} readability  Its line of the clean-text readability.json, if any.
 * @param {object} cleanEntry  Its line of clean.json.
 * @param {string} address
 * @returns {string}
 */
function card(suspect, article, readability, cleanEntry, address) {
  const paragraphs = cleanEntry.source === "readability" ? readability?.paragraphs : undefined;
  const panes = textPanes(article, cleanEntry, paragraphs);
  return `<details class="card" data-id="${suspect.id}" data-agent="${suspect.mark}" data-group="${needsLook(suspect) ? "look" : "skim"}">
${cardSummary(suspect, article)}
<div class="inner">${cardBody(suspect, article, address, panes)}</div>
</details>`;
}

/**
 * The legend: what each mark means, one line each.
 *
 * @returns {string}
 */
function legend() {
  const rows = MARK_ORDER.map((mark) => `<li><span class="chip agent ${mark}">${mark}</span> ${escapeHtml(MARKS[mark])}</li>`);
  return `<ul class="legend">${rows.join("\n")}</ul>`;
}

/**
 * The filter buttons: one per agent's mark, and one per review status.
 *
 * @param {object[]} suspects
 * @returns {string}
 */
function filters(suspects) {
  const counts = {};
  for (const suspect of suspects) counts[suspect.mark] = (counts[suspect.mark] ?? 0) + 1;
  const byMark = MARK_ORDER.map((mark) => `<button type="button" data-filter="agent:${mark}">agent: ${mark} (${counts[mark] ?? 0})</button>`);
  const byStatus = ["not reviewed", "confirmed", "changed"].map((status) => `<button type="button" data-filter="status:${status}">${status}</button>`);
  return `<p class="filters"><button type="button" data-filter="all" aria-pressed="true">all (${suspects.length})</button> ${byMark.join(" ")} ${byStatus.join(" ")}</p>`;
}

/**
 * The page's own script: theme switch, filters, status chips, and verdicts
 * saved with the page on claude.ai and in this browser.
 *
 * @returns {string}
 */
function pageScript() {
  return `
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

// Fold or unfold every card at once.
document.getElementById("open-all").onclick = () => { for (const fold of document.querySelectorAll("details.card")) fold.open = true; };
document.getElementById("close-all").onclick = () => { for (const fold of document.querySelectorAll("details.card")) fold.open = false; };

// The status of one card: not reviewed, confirmed (the pick is the agent's call) or changed.
function statusOf(card, verdicts) {
  const pick = (verdicts[card.dataset.id] || {}).pick;
  if (!pick) return "not reviewed";
  return pick === card.dataset.agent ? "confirmed" : "changed";
}

// The progress line: how many of the real decisions are made, how many skim cards are still undecided.
function paintProgress() {
  const looks = [...document.querySelectorAll('details.card[data-group="look"]')];
  const skims = [...document.querySelectorAll('details.card[data-group="skim"]')];
  const decided = looks.filter((card) => (verdicts[card.dataset.id] || {}).pick).length;
  const toSkim = skims.filter((card) => !(verdicts[card.dataset.id] || {}).pick).length;
  document.getElementById("progress").textContent = decided + " of " + looks.length + " decided, " + toSkim + " to skim";
}

// Paint each card's status chip and the progress line, and apply the filter.
let activeFilter = "all";
function refresh() {
  const counts = { "not reviewed": 0, confirmed: 0, changed: 0 };
  for (const card of document.querySelectorAll("details.card")) {
    const status = statusOf(card, verdicts);
    const pick = (verdicts[card.dataset.id] || {}).pick;
    counts[status] += 1;
    const chip = card.querySelector("[data-status]");
    chip.textContent = status === "changed" ? "changed to " + pick : status === "confirmed" ? "confirmed: " + pick : "not yet reviewed";
    chip.dataset.state = status === "not reviewed" ? "open" : status;
    const [kind, value] = activeFilter.split(":");
    const shown = activeFilter === "all" || (kind === "agent" && card.dataset.agent === value) || (kind === "status" && status === value);
    card.hidden = !shown;
  }
  paintProgress();
  for (const group of document.querySelectorAll("section.group")) group.hidden = !group.querySelector("details.card:not([hidden])");
  for (const button of document.querySelectorAll("[data-filter]")) button.setAttribute("aria-pressed", String(button.dataset.filter === activeFilter));
}
for (const button of document.querySelectorAll("[data-filter]")) {
  button.onclick = () => { activeFilter = button.dataset.filter; refresh(); };
}

// Verdicts and notes: kept with the artifact (its db, one document per article) when the page runs on
// claude.ai, so every device sees the same picks; in this browser too, which is all the laptop file has.
function loadVerdicts() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem("unusableTextVerdicts") || "{}"); } catch {}
  return stored;
}
const verdicts = loadVerdicts();
let store = null;
const writing = {};
const noteTimers = {};
function say(text) { document.getElementById("done").textContent = text; }
function fill(id) {
  const card = document.querySelector('details.card[data-id="' + id + '"]');
  const saved = verdicts[id] || {};
  for (const radio of card.querySelectorAll("input[type=radio]")) radio.checked = radio.value === saved.pick;
  const note = card.querySelector("input[type=text]");
  if (document.activeElement !== note) note.value = saved.note || "";
}
async function storeVerdict(id) {
  try { localStorage.setItem("unusableTextVerdicts", JSON.stringify(verdicts)); } catch {}
  refresh();
  if (!store) { say("Saved in this browser."); return; }
  const previous = writing[id] || Promise.resolve();
  writing[id] = previous.then(() => store.doc("verdicts/" + id).set({ pick: verdicts[id].pick || "", note: verdicts[id].note || "" }));
  try { await writing[id]; say("Saved with the page."); }
  catch { say("Could not save with the page; kept in this browser. Press Copy before closing."); }
}
for (const card of document.querySelectorAll("details.card")) {
  const id = card.dataset.id;
  fill(id);
  for (const radio of card.querySelectorAll("input[type=radio]")) {
    radio.onchange = () => { verdicts[id] = { ...verdicts[id], pick: radio.value }; storeVerdict(id); };
  }
  card.querySelector("button.confirm").onclick = () => {
    verdicts[id] = { ...verdicts[id], pick: card.dataset.agent };
    fill(id);
    storeVerdict(id);
  };
  const note = card.querySelector("input[type=text]");
  note.oninput = () => {
    verdicts[id] = { ...verdicts[id], note: note.value };
    clearTimeout(noteTimers[id]);
    noteTimers[id] = setTimeout(() => storeVerdict(id), 700);
  };
}
// One press confirms the agent's call on every skim card with no pick yet; each is saved on its own.
document.getElementById("confirm-skim").onclick = () => {
  for (const card of document.querySelectorAll('details.card[data-group="skim"]')) {
    const id = card.dataset.id;
    if ((verdicts[id] || {}).pick) continue;
    verdicts[id] = { ...verdicts[id], pick: card.dataset.agent };
    fill(id);
    storeVerdict(id);
  }
};
refresh();
(async () => {
  store = window.claude?.use ? await window.claude.use("db") : null;
  if (!store) return;
  try {
    const snapshot = await store.collection("verdicts").get();
    for (const doc of snapshot.docs) {
      verdicts[doc.id] = { ...doc.data() };
      if (document.querySelector('details.card[data-id="' + doc.id + '"]')) fill(doc.id);
    }
    refresh();
    say(snapshot.empty ? "Picks will be saved with the page." : "Loaded your saved picks.");
  } catch { say("Could not load saved picks; new picks are kept in this browser."); }
})();
document.getElementById("copy").onclick = async () => {
  const lines = [...document.querySelectorAll("details.card")].map((card) => {
    const id = card.dataset.id;
    const pick = (verdicts[id] || {}).pick || "no verdict";
    const note = card.querySelector("input[type=text]").value;
    return "#" + id + ": " + pick + " (agent: " + card.dataset.agent + ", " + statusOf(card, verdicts) + ")" + (note ? " [" + note + "]" : "");
  });
  try { await navigator.clipboard.writeText(lines.join("\\n")); say("Copied."); }
  catch { say(lines.join(" · ")); }
};
`;
}

/**
 * The page's style: the clean-text page's colours and name marking, plus the
 * chips, the cards and the filters.
 *
 * @returns {string}
 */
function pageStyle() {
  return `
:root{--bg:#fbfaf7;--ink:#1d1d1b;--muted:#6b6a64;--line:#dddad2;--del:#b3261e;--removed:#f7d4d1;--added:#cfe3fa;--name:#c78a00;--link:#1d5fa8;--chip:#ecebe4;--unusable:#f3c9c4;--partial:#f6dfb4;--furniture:#d6e4f4;--fine:#d4ead6;--call:#f2efe6}
:root[data-theme=dark]{--bg:#1b1b1a;--ink:#ecebe6;--muted:#a3a29b;--line:#3a3935;--del:#f2867e;--removed:#5a2622;--added:#1f3a5c;--name:#f0b429;--link:#8ab8f0;--chip:#2c2b28;--unusable:#6a2a25;--partial:#5e4716;--furniture:#244563;--fine:#27502d;--call:#262522;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#1b1b1a;--ink:#ecebe6;--muted:#a3a29b;--line:#3a3935;--del:#f2867e;--removed:#5a2622;--added:#1f3a5c;--name:#f0b429;--link:#8ab8f0;--chip:#2c2b28;--unusable:#6a2a25;--partial:#5e4716;--furniture:#244563;--fine:#27502d;--call:#262522;color-scheme:dark}}
body{background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,sans-serif;margin:0 auto;max-width:1300px;padding-block:16px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
a{color:var(--link)}.back{display:inline-block;margin-bottom:6px;font-size:14px}
.theme{float:right;font-size:13px;display:flex;gap:4px;flex-wrap:wrap;align-items:center}.theme button{padding:3px 9px}.theme button[aria-pressed=true]{font-weight:700}
h1{text-wrap:balance;font-size:1.5rem}h3{font-size:.95rem;margin:.4em 0}
button{font:inherit;padding:6px 12px}button[aria-pressed=true]{font-weight:700;outline:2px solid var(--muted)}
.progress{font-weight:700;font-size:1.05rem}section.group[hidden]{display:none}h2{font-size:1.2rem;margin:1.2em 0 .2em}.legend{list-style:none;padding:0;margin:8px 0}.legend li{margin:5px 0}
.filters{display:flex;gap:6px;flex-wrap:wrap}.filters button{padding:4px 10px}
details.card{border-top:1px solid var(--line);padding:6px 0}details.card[hidden]{display:none}
details.card>summary{cursor:pointer;display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;align-items:baseline;padding:4px 0}
.num{font-weight:700}.head{min-width:0;overflow-wrap:anywhere}.outlet{color:var(--muted);font-size:13px}.chips{grid-column:1/-1;display:flex;gap:5px;flex-wrap:wrap}
.chip{font-size:12px;padding:1px 8px;border-radius:10px;background:var(--chip)}.chip.code{color:var(--muted)}
.chip.agent.unusable{background:var(--unusable)}.chip.agent.partial{background:var(--partial)}.chip.agent.furniture{background:var(--furniture)}.chip.agent.fine{background:var(--fine)}
.chip.status[data-state=open]{color:var(--muted)}.chip.status[data-state=confirmed],.chip.status[data-state=changed]{font-weight:700;outline:1px solid var(--muted)}
.inner{padding:4px 0 14px}.meta{color:var(--muted);font-size:13px;overflow-wrap:anywhere}.call{background:var(--call);padding:8px 10px;border-radius:6px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pair>div{min-width:0}.pair p{max-height:420px;overflow:auto;font-size:13.5px;overflow-wrap:anywhere}
.verdict{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}.verdict input[type=text]{flex:1 1 180px;min-width:0;font:inherit;padding:4px 6px}
.removed{background:var(--removed);color:var(--ink);text-decoration:line-through;text-decoration-color:var(--del)}.added{background:var(--added)}
mark.name{background:none;color:var(--ink);font-weight:700;border-bottom:2px solid var(--name)}.key span{padding:1px 6px;border-radius:3px}
.code{color:var(--muted)}.pair .code{font-size:.8em;border:1px dotted var(--muted);border-radius:3px;padding:0 2px}
@media (max-width:760px){.pair{grid-template-columns:1fr}.pair p{max-height:none}.theme{float:none;margin-bottom:8px}details.card>summary{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
}

/**
 * The two groups of cards, each under its heading; the skim group carries
 * the one control that confirms the agent's call for every card in it.
 *
 * @param {{ look: string[], skim: string[] }} cards  The folded cards of each group.
 * @returns {string}
 */
function groupedCards(cards) {
  const lookHeading = `<h2>These ${cards.look.length} need a real look</h2>
<p>The agent thinks the saved text is <b>unusable</b> or only <b>partial</b>. The least certain calls come first.</p>`;
  const skimHeading = `<h2>Skim: the agent thinks these ${cards.skim.length} texts are usable</h2>
<p>Marked <b>furniture</b> (the article is there under menus and lists) or <b>fine</b> (a false alarm). Open any that looks wrong; otherwise one press confirms the agent's call for all that you have not decided yet. It is still saved per article, and still the agent's call until you press it.</p>
<p><button type="button" id="confirm-skim">Confirm the agent's call for the whole skim group</button></p>`;
  return `<section class="group" data-group="look">${lookHeading}\n${cards.look.join("\n")}</section>
<section class="group" data-group="skim">${skimHeading}\n${cards.skim.join("\n")}</section>`;
}

/**
 * The whole page.
 *
 * @param {{ look: string[], skim: string[] }} cards  The folded cards of each group.
 * @param {object[]} suspects
 * @returns {string}
 */
function pageBody(cards, suspects) {
  return `<a class="back" href="${CONTENTS_ADDRESS}" target="_blank" rel="noopener">← Contents</a>
<div class="theme">Theme: <button data-mode="auto">Auto</button> <button data-mode="light">Light</button> <button data-mode="dark">Dark</button> <span id="auto-note"></span></div>
<h1>Unusable saved texts: confirm the agent's marks (task 3.3)</h1>
<p><b>What this is.</b> ${suspects.length} of the 300 golden articles were flagged by an automatic check as having a saved text that may not be the article. For each, an agent read the text and proposed one mark. <b>The marks are the agent's proposals, not yours.</b> A mark becomes yours only when you press Confirm or pick another. Your picks are the answer key for tuning the extractor (task 3.4).</p>
${legend()}
<p><b>How to read a card.</b> The folded line shows the article, the agent's call, your status and the reason codes. Open it to see why the agent chose its mark, the saved text and the clean text from the earlier step, and the controls. The first group is the real work; the second can be skimmed.</p>
<p class="key"><span class="removed">Red, struck through</span> in the saved text: not in the clean text (menus, lists and other furniture, or part of the article if the clean text lost it). <span class="added">Blue</span> in the clean text: not in the saved text. <mark class="name">Bold, underlined in gold</mark>: the tracked fighter's name, in any form. Plain text is in both.</p>
${filters(suspects)}
<p><button id="open-all" type="button">Open all cards</button> <button id="close-all" type="button">Fold all cards</button> </p>
<p class="progress" id="progress"></p>
${groupedCards(cards)}
<p>Picks and notes save as you go, on claude.ai with the page itself and in this browser. When done, press Copy and paste the result in the thread.</p>
<p><button id="copy" type="button">Copy verdicts</button> <span id="done"></span></p>`;
}

/**
 * Writes the review page and its artifact copy.
 */
function main() {
  const premarks = JSON.parse(readFileSync(PREMARKS, "utf8"));
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const clean = JSON.parse(readFileSync(new URL("data/clean.json", CLEAN_FOLDER), "utf8"));
  const readability = JSON.parse(readFileSync(new URL("data/readability.json", CLEAN_FOLDER), "utf8"));
  const fetched = JSON.parse(readFileSync(new URL("data/fetch.json", CLEAN_FOLDER), "utf8"));

  // One card per suspect, worst marks first; refuse a suspect the agent has not marked.
  const suspects = premarks.suspects;
  const unmarked = suspects.filter((suspect) => !suspect.mark);
  if (unmarked.length > 0) throw new Error(`${unmarked.length} suspects have no mark yet`);
  const groups = inGroups(suspects);
  const cardOf = (suspect) => {
    const article = articles.find((entry) => entry.id === suspect.id);
    const address = fetched[article.id]?.address ?? article.resolved_url ?? article.url;
    return card(suspect, article, readability[article.id], clean[article.id], address);
  };
  const cards = { look: groups.look.map(cardOf), skim: groups.skim.map(cardOf) };

  // The document: a full page for the laptop, and the same without its skeleton for a claude.ai artifact.
  const style = pageStyle();
  const script = pageScript();
  const body = pageBody(cards, suspects);
  const title = "Unusable Texts Review";
  const meta = '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  const page = `<!doctype html><html lang="en"><head>${meta}<title>${title}</title><style>${style}</style></head><body>\n${body}\n<script>${script}</script></body></html>`;
  const artifact = `<title>${title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>${style}</style>\n${body}\n<script>${script}</script>`;
  writeFileSync(new URL("review.html", OUT_FOLDER), page);
  writeFileSync(new URL("review-artifact.html", OUT_FOLDER), artifact);
  console.log(`wrote ${fileURLToPath(new URL("review.html", OUT_FOLDER))} (${page.length} characters, ${groups.look.length} to look at, ${groups.skim.length} to skim)`);
}

// Run only when called as a script.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
