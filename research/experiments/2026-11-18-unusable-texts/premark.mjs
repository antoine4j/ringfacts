// Launch Map task 3.3, the automatic half: flag the golden articles whose
// saved text may not be the article, each with the reasons it was flagged.
// The reading and the proposed marks are the agent's own (see premarks.json);
// only the maintainer's confirmation makes a mark his.
//
//   node premark.mjs
//
// Reads the 300 saved texts (git-ignored, so they exist only in the checkout
// that holds golden/articles.json; set ARTICLE_TEXT_ROOT to that checkout
// when running from another worktree) and the clean-text experiment's
// record.json. Writes premarks.json: ids, reason codes, lengths and marks,
// never a word of an article.
// History: docs/decisions.md#article-text-out-of-git

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SUBJECTS } from "../../../watchlist.js";
import { withoutFurniture } from "../2026-10-20-clean-text/text.mjs";

const REPO_ROOT = new URL("../../../", import.meta.url);
export const TEXT_ROOT = process.env.ARTICLE_TEXT_ROOT ? new URL(`file://${process.env.ARTICLE_TEXT_ROOT.replace(/\/?$/, "/")}`) : REPO_ROOT;
const ARTICLES = new URL("golden/articles.json", TEXT_ROOT);
const RECORD = new URL("../2026-10-20-clean-text/record.json", import.meta.url);
const PREMARKS = new URL("./premarks.json", import.meta.url);

// The marks the agent may propose, each defined by what a score should do with the text.
export const MARKS = {
  unusable: "Not the article at all: styling code, login or comment-policy text, a caption, or a video page whose text is only its blurb and a list of other videos.",
  partial: "Part of the real article is there but a real part is missing: an intro only, or a cut at the 10,000-character cap that loses a paragraph or more.",
  furniture: "The whole article is there, but buried in or mixed with menus, link lists, comments, markup or other stories, or he is named only in that furniture.",
  fine: "A false alarm: the saved text is the article, as complete as can be told.",
};

// The thresholds. Each is a round number picked before looking at which
// articles it catches; the README says what each one caught.
export const THRESHOLDS = {
  capCharacters: 9990, // the save cut texts at 10,000; a few lost trailing spaces
  shortBelow: 800,
  menuLeadCharacters: 1500, // running text starts later than this
  menuLeadShare: 0.4, // ...or later than this share of the text, past 800 characters
  menuLeadFloor: 800,
  mostlyFurnitureBelow: 0.5, // share of the text that reads as running prose
  styleBraces: 20,
  videoThinProseBelow: 1500,
  cleanLongerBy: 1.5,
  cleanLongerAtCap: 1.2,
  cleanFillsCap: 9000, // a cleaned text this long still fills the cap, so the article may go on past it
  muchRemoved: 0.5,
};

const PROSE_WINDOW_WORDS = 40;
const SHORTER_MENU_CHARACTERS = 1000;
const VIDEO_MARKER = /(\/videos?\/|[/-]video|\bvideo\b|відео|видео|\/watch\b)/iu;

// The cases the Launch Map card, tasks 3.2 and 3.4 and the labelling notes name.
// The first group is the card's own list; the second is everything else
// already known to be a bad text, and the last two are not text defects.
export const KNOWN_CASES = [
  { id: "134", what: "intro only (a rankings page)" },
  { id: "655", what: "styling code only" },
  { id: "647", what: "one line and the site's comment policy" },
  { id: "44", what: "video page, almost nothing saved" },
  { id: "1045", what: "video page, only the blurb" },
  { id: "1172", what: "opens with 1,900 characters of menu" },
  { id: "230", what: "cut at the 10,000-character cap" },
  { id: "937", what: "second, chained article never fetched" },
  { id: "521", what: "video page, words not in the saved text" },
  { id: "653", what: "headline, then site boilerplate" },
  { id: "492", what: "video page, the whole transcript" },
  { id: "740", what: "video page, words not in the saved text" },
  { id: "852", what: "lost its 'said on Instagram' line (one line of an otherwise whole article)" },
  { id: "385", what: "embedded post that the saved text cannot show (the article itself is whole)" },
];

// Any one of these makes an article a suspect.
export const LIKELY_CODES = [
  "nothing_usable",
  "styling_code",
  "short",
  "video_thin",
  "no_name",
  "name_only_in_furniture",
  "clean_much_longer",
  "cut_at_cap",
];

// Two of these make an article a suspect; one alone is common and harmless.
export const SUPPORTING_CODES = ["at_cap", "menu_opening", "mostly_furniture", "much_removed", "video_page"];

// Only noted, never counted: Readability tried this page and failed one of its four checks.
export const NOTED_CODES = ["check_failed"];

/**
 * Whether a run of words reads as running text: most words that start with a
 * letter start in lower case, and at least two of them end a sentence.
 *
 * @param {string[]} words
 * @returns {boolean}
 */
function readsAsProse(words) {
  const lettered = words.filter((word) => /^\p{L}/u.test(word));
  const lower = lettered.filter((word) => /^\p{Ll}/u.test(word));
  const lowerShare = lower.length / Math.max(1, lettered.length);

  // A sentence end is a full stop before a space, the end, or a capital: some saved texts lost the space.
  const sentenceEnds = words.join(" ").match(/[.!?…]["”»’)]?(?=\s|$|\p{Lu})/gu) ?? [];
  const minimumEnds = words.length < PROSE_WINDOW_WORDS ? 1 : 2;
  return lowerShare >= 0.6 && sentenceEnds.length >= minimumEnds;
}

/**
 * How much of a text reads as running prose, and how far in it starts.
 * Every window of 40 words that reads as prose marks its words; the rest is
 * menus, link lists and headline lists.
 *
 * @param {string} text
 * @returns {{ proseChars: number, leadChars: number, proseShare: number }}
 */
export function proseProfile(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const isProse = new Array(words.length).fill(false);

  // A text shorter than one window is judged whole.
  if (words.length < PROSE_WINDOW_WORDS) isProse.fill(readsAsProse(words));

  // Mark every word that sits in at least one prose window.
  for (let start = 0; start + PROSE_WINDOW_WORDS <= words.length; start += 1) {
    const window = words.slice(start, start + PROSE_WINDOW_WORDS);
    if (readsAsProse(window)) isProse.fill(true, start, start + PROSE_WINDOW_WORDS);
  }

  // Add up the characters of marked words and note where the first one starts.
  let proseChars = 0;
  let leadChars = text.length;
  let offset = 0;
  for (const [index, word] of words.entries()) {
    if (isProse[index]) proseChars += word.length + 1;
    if (isProse[index] && leadChars === text.length) leadChars = offset;
    offset += word.length + 1;
  }
  return { proseChars, leadChars, proseShare: proseChars / Math.max(1, text.length) };
}

/**
 * How many times a text names the fighter, by his watchlist stems.
 *
 * @param {string} text
 * @param {string} subjectName  The fighter's name as in the golden articles.
 * @returns {number}
 */
export function nameCount(text, subjectName) {
  const subject = SUBJECTS.find((entry) => entry.name === subjectName);
  const pattern = new RegExp(subject.matchNames.join("|"), "giu");
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Whether a text is mostly a style sheet: many opening braces, densely.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeStyleSheet(text) {
  const braces = (text.match(/\{/g) ?? []).length;
  const perThousand = (braces / Math.max(1, text.length)) * 1000;
  return braces >= THRESHOLDS.styleBraces && perThousand >= 2;
}

/**
 * Whether the address or the headline marks a video page.
 *
 * @param {{ title: string, url: string, resolved_url: string|null }} article
 * @returns {boolean}
 */
export function isVideoPage(article) {
  const address = article.resolved_url ?? article.url;
  return VIDEO_MARKER.test(address) || VIDEO_MARKER.test(article.title);
}

/**
 * The reasons for suspicion that come from the text alone: its length, how
 * it opens, how much of it is running prose, whether it names him.
 *
 * @param {object} article  A golden article with its text.
 * @param {{ proseChars: number, leadChars: number, proseShare: number }} profile
 * @returns {string[]}
 */
function codesFromText(article, profile) {
  const text = article.body;
  const codes = [];
  const leadShare = profile.leadChars / Math.max(1, text.length);
  const opensWithMenu = profile.leadChars >= THRESHOLDS.menuLeadCharacters || (profile.leadChars >= THRESHOLDS.menuLeadFloor && leadShare >= THRESHOLDS.menuLeadShare);

  // Length: cut at the save's cap, or too short to be much of an article.
  if (text.length >= THRESHOLDS.capCharacters) codes.push("at_cap");
  if (text.length < THRESHOLDS.shortBelow) codes.push("short");

  // Furniture: an opening menu, or too little running text overall.
  if (opensWithMenu) codes.push("menu_opening");
  if (profile.proseShare < THRESHOLDS.mostlyFurnitureBelow) codes.push("mostly_furniture");

  // Code instead of words, and the fighter's name missing or only in furniture.
  if (looksLikeStyleSheet(text)) codes.push("styling_code");
  const flatText = text.replace(/\s+/g, " ");
  const namedInSaved = nameCount(text, article.subject) > 0;
  const namedInArticlePart = nameCount(withoutFurniture(flatText, article.title), article.subject) > 0;
  if (!namedInSaved) codes.push("no_name");
  if (namedInSaved && !namedInArticlePart) codes.push("name_only_in_furniture");
  return codes;
}

/**
 * The reasons for suspicion that come from what the clean-text experiment
 * recorded: nothing usable, a clean text much longer or much shorter than
 * the saved one, a failed Readability check, a clean text that lost his name.
 *
 * @param {object} article
 * @param {object} entry  The article's line of the clean-text record.json.
 * @returns {{ codes: string[], noted: string[] }}
 */
function codesFromRecord(article, entry) {
  const codes = [];
  const noted = [];
  const savedChars = article.body.length;
  const removedShare = (savedChars - entry.clean_chars) / Math.max(1, savedChars);
  const hasCleanText = entry.source !== "nothing usable";
  const atCap = savedChars >= THRESHOLDS.capCharacters;

  // What the clean-text step could not rescue.
  if (!hasCleanText) codes.push("nothing_usable");

  // A clean text much longer than the saved one: the saved copy lost part of the article.
  const longerBy = atCap ? THRESHOLDS.cleanLongerAtCap : THRESHOLDS.cleanLongerBy;
  if (hasCleanText && entry.clean_chars >= longerBy * savedChars) codes.push("clean_much_longer");

  // A text cut at the cap whose cleaned version still fills it, or which the cleaning step
  // noted as truncated: the article goes on past the cut.
  const stillFillsCap = entry.clean_chars >= THRESHOLDS.cleanFillsCap;
  const notedTruncated = /truncated/i.test(entry.reason);
  if (atCap && (stillFillsCap || notedTruncated)) codes.push("cut_at_cap");

  // Cleaning took away most of the saved text, or the clean text no longer names him.
  if (hasCleanText && removedShare >= THRESHOLDS.muchRemoved) codes.push("much_removed");
  const namedInSaved = nameCount(article.body, article.subject) > 0;
  if (hasCleanText && namedInSaved && !entry.names_fighter) codes.push("name_only_in_furniture");

  // Noted only: Readability tried the page and failed a check.
  const failedChecks = entry.checks ? Object.keys(entry.checks).filter((name) => !entry.checks[name]) : [];
  if (failedChecks.length > 0) noted.push("check_failed");
  return { codes, noted };
}

/**
 * Whether the codes make an article a suspect: one likely code, or two
 * supporting ones.
 *
 * @param {string[]} codes
 * @returns {boolean}
 */
export function isSuspect(codes) {
  const likely = codes.filter((code) => LIKELY_CODES.includes(code));
  const supporting = codes.filter((code) => SUPPORTING_CODES.includes(code));
  return likely.length >= 1 || supporting.length >= 2;
}

/**
 * Every code for one article, plus the measurements behind them.
 *
 * @param {object} article  A golden article with its text.
 * @param {object} entry  The article's line of the clean-text record.json.
 * @returns {{ codes: string[], noted: string[], lengths: object }}
 */
export function flagArticle(article, entry) {
  const profile = proseProfile(article.body);
  const fromRecord = codesFromRecord(article, entry);
  const found = new Set([...codesFromText(article, profile), ...fromRecord.codes]);

  // A video page is suspect when little of it reads as article text, otherwise only supporting.
  const isVideo = isVideoPage(article);
  const isThin = profile.proseChars < THRESHOLDS.videoThinProseBelow || entry.source === "nothing usable";
  if (isVideo && isThin) found.add("video_thin");
  if (isVideo && !isThin) found.add("video_page");

  const lengths = {
    saved: article.body.length,
    clean: entry.clean_chars,
    prose: profile.proseChars,
    lead: profile.leadChars,
  };
  const ordered = [...LIKELY_CODES, ...SUPPORTING_CODES].filter((code) => found.has(code));
  return { codes: ordered, noted: fromRecord.noted, lengths };
}

/**
 * Flags every article, in id order.
 *
 * @param {object[]} articles
 * @param {object} record  The clean-text record.json, by article id.
 * @returns {{ id: string, subject: string, codes: string[], noted: string[], lengths: object, cleanSource: string }[]}
 */
export function flagAll(articles, record) {
  const flagged = [];
  for (const article of articles) {
    const entry = record[article.id];
    const flags = flagArticle(article, entry);
    flagged.push({ id: article.id, subject: article.subject, ...flags, cleanSource: entry.source });
  }
  return flagged.sort((first, second) => Number(first.id) - Number(second.id));
}

/**
 * The flagged articles that are suspects.
 *
 * @param {{ codes: string[] }[]} flagged
 * @returns {object[]}
 */
export function findSuspects(flagged) {
  return flagged.filter((entry) => isSuspect(entry.codes));
}

/**
 * How many articles carry exactly one supporting code and nothing else, so
 * are not listed: the furniture-only cases a reader may still want to know of.
 *
 * @param {{ codes: string[] }[]} flagged
 * @returns {object}  Code to count.
 */
export function countUnlisted(flagged) {
  const unlisted = {};
  for (const entry of flagged) {
    if (isSuspect(entry.codes) || entry.codes.length === 0) continue;
    const code = entry.codes[0];
    unlisted[code] = (unlisted[code] ?? 0) + 1;
  }
  return unlisted;
}

/**
 * How many articles that are not suspects still open with a shorter menu
 * (1,000 characters or more before the running text starts).
 *
 * @param {{ codes: string[], lengths: { lead: number } }[]} flagged
 * @returns {number}
 */
export function countShorterMenus(flagged) {
  const notSuspects = flagged.filter((entry) => !isSuspect(entry.codes));
  const withMenu = notSuspects.filter((entry) => entry.lengths.lead >= SHORTER_MENU_CHARACTERS);
  return withMenu.length;
}

/**
 * Whether each known case was caught, and with which codes. A known case the
 * script cannot catch is listed with the reason, not hidden.
 *
 * @param {{ id: string, codes: string[] }[]} flagged
 * @returns {{ id: string, what: string, caught: boolean, codes: string[] }[]}
 */
export function checkKnownCases(flagged) {
  return KNOWN_CASES.map(({ id, what }) => {
    const entry = flagged.find((candidate) => candidate.id === id);
    return { id, what, caught: isSuspect(entry.codes), codes: entry.codes };
  });
}

/**
 * Carries the agent's marks over from the previous premarks.json, so rerunning
 * the flags never loses a reading. A suspect with no mark yet gets nulls.
 *
 * @param {object[]} suspects
 * @param {object|null} previous  The old premarks.json, if any.
 * @returns {object[]}
 */
export function withMarks(suspects, previous) {
  const marksById = new Map();
  for (const entry of previous?.suspects ?? []) marksById.set(entry.id, entry);

  return suspects.map((suspect) => {
    const earlier = marksById.get(suspect.id);
    const mark = earlier?.mark ?? null;
    if (mark !== null && !(mark in MARKS)) throw new Error(`#${suspect.id}: "${mark}" is not one of the marks`);
    const reason = earlier?.reason ?? null;
    return { ...suspect, mark, reason, by: mark ? "agent" : null };
  });
}

/**
 * How many suspects carry each code, each proposed mark, and each pair.
 *
 * @param {object[]} suspects
 * @returns {{ byCode: object, byMark: object }}
 */
export function countSuspects(suspects) {
  const byCode = {};
  const byMark = {};
  for (const suspect of suspects) {
    for (const code of suspect.codes) byCode[code] = (byCode[code] ?? 0) + 1;
    const mark = suspect.mark ?? "unmarked";
    byMark[mark] = (byMark[mark] ?? 0) + 1;
  }
  return { byCode, byMark };
}

/**
 * Reads the texts and the record, flags, merges the marks and writes premarks.json.
 */
function main() {
  if (!existsSync(ARTICLES)) throw new Error(`no saved texts at ${fileURLToPath(ARTICLES)}; set ARTICLE_TEXT_ROOT to the checkout that has golden/articles.json`);
  const articles = JSON.parse(readFileSync(ARTICLES, "utf8"));
  const record = JSON.parse(readFileSync(RECORD, "utf8"));
  const previous = existsSync(PREMARKS) ? JSON.parse(readFileSync(PREMARKS, "utf8")) : null;

  // Flag, then keep the marks the agent already gave.
  const flagged = flagAll(articles, record);
  const suspects = withMarks(findSuspects(flagged), previous);
  const counts = countSuspects(suspects);
  const knownCases = checkKnownCases(flagged);
  const output = {
    about: "Suspects among the 300 golden articles whose saved text may not be the article: reason codes, lengths and the agent's proposed mark. Marks are the agent's call (by: agent), not the maintainer's; ids and numbers only, no article text.",
    articles: articles.length,
    thresholds: THRESHOLDS,
    counts: { ...counts, notListed: countUnlisted(flagged), notSuspectsWithShorterMenu: countShorterMenus(flagged) },
    knownCases,
    suspects,
  };
  writeFileSync(PREMARKS, `${JSON.stringify(output, null, 2)}\n`);

  // Say what was written, and which known cases the flags missed.
  const caught = knownCases.filter((entry) => entry.caught).length;
  console.log(`${suspects.length} suspects of ${articles.length}; by mark ${JSON.stringify(counts.byMark)}; known cases caught ${caught} of ${knownCases.length}`);
}

// Run only when called as a script, so the tests can import the functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
