// Text helpers shared by the clean-text steps: comparing texts that were
// saved with their spaces lost, and estimating how much of a saved text is
// the article rather than the page around it.

const WINDOW = 40;

/**
 * A text's letters and digits only, lower-cased, so texts whose spaces were
 * lost when saved ("boldpredictions") still compare equal.
 *
 * @param {string} text
 * @returns {string}
 */
export function letters(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * A text split at sentence ends.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function sentences(text) {
  return text.split(/(?<=[.!?…])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
}

/**
 * The share of words that start with a lower-case letter: high in running
 * text, low in menus and link lists.
 *
 * @param {string[]} words
 * @returns {number}
 */
function proseShare(words) {
  const withLetter = words.filter((word) => /^\p{L}/u.test(word));
  const lower = withLetter.filter((word) => /^\p{Ll}/u.test(word)).length;
  return lower / Math.max(1, withLetter.length);
}

/**
 * The saved text without the menus and link lists around the article: the
 * same rule the classifier-v7 experiment used (states.py, cleaned()). Only
 * an estimate, used as the length a Readability text must reach.
 *
 * @param {string} text  The saved body, one line.
 * @param {string} headline  The saved headline.
 * @returns {string}
 */
export function withoutFurniture(text, headline) {
  // Pages repeat the headline above the article: start at its last repeat in the first half.
  const opening = headline.split(/ [-|–] /)[0].split(/\s+/).slice(0, 5).join(" ");
  const found = opening.length > 15 ? text.lastIndexOf(opening, Math.floor(text.length / 2)) : -1;
  let rest = found > 0 ? text.slice(found) : text;

  // Lists of other headlines carry a date and time each: end before the first one past the opening.
  const stamp = /\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/g;
  stamp.lastIndex = Math.floor(rest.length / 3);
  const stampFound = stamp.exec(rest);
  if (stampFound) rest = rest.slice(0, stampFound.index);
  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length < 3 * WINDOW) return rest;

  // Keep from the first to the last stretch that reads as running text.
  const isProse = [];
  for (let index = 0; index < words.length - WINDOW; index += 1) isProse.push(proseShare(words.slice(index, index + WINDOW)) >= 0.6);
  const first = Math.max(0, isProse.indexOf(true));
  const lastProse = isProse.lastIndexOf(true);
  const last = lastProse < 0 ? isProse.length - 1 : lastProse;
  return words.slice(first, last + WINDOW).join(" ");
}

const NAMED_ENTITIES = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", eacute: "é", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ", egrave: "è", agrave: "à", ccedil: "ç", uuml: "ü" };

/**
 * A saved text with its HTML entities decoded and its links dropped, so it
 * compares with a text read from the page ("&#x27;" against "'").
 *
 * @param {string} text
 * @returns {string}
 */
export function decoded(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (match, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/https?:\/\/\S+/g, " ");
}

/**
 * Whether most of a sentence is in a text: 70% of its 30-letter pieces,
 * so a sentence split differently by the two readers still counts.
 *
 * @param {string} haystackLetters  The text, already reduced to letters().
 * @param {string} sentence
 * @returns {boolean}
 */
export function holdsSentence(haystackLetters, sentence) {
  const needle = letters(decoded(sentence));
  if (needle.length < 30) return haystackLetters.includes(needle);
  let pieces = 0;
  let found = 0;
  for (let start = 0; start + 30 <= needle.length; start += 15) {
    pieces += 1;
    if (haystackLetters.includes(needle.slice(start, start + 30))) found += 1;
  }
  return found / pieces >= 0.7;
}
