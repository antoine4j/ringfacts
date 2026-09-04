// Articles in, pipeline items out. The bench reads the corpus files
// (corpus/tune.json, corpus/holdout.json) or any JSON in the same shape, and
// hands each row to a step in the shape the hunter itself reads.

import { readFile } from "node:fs/promises";

/**
 * One corpus row as the item huntSubject and the step functions read. The
 * stored body rides as feed content so the body step's first rung fires and
 * nothing touches the network.
 *
 * @param {object} row  corpus shape: key, subject, title, source, url, published_at, edition, body
 * @returns {object}
 */
export function toPipelineItem(row) {
  return {
    key: row.key,
    title: row.title,
    url: row.url,
    source: row.source ?? "",
    edition: row.edition ?? null,
    publishedAt: new Date(row.published_at),
    feedContent: row.body || null,
    rssDescription: null,
    foundVia: `bench ${row.key}`,
  };
}

/**
 * The watchlist entry an article belongs to: by exact name first, then by
 * any of a subject's name stems appearing in the given name — the corpus
 * still says "Daniel Donchenko" from before the watchlist spelled him
 * "Daniil".
 *
 * @param {object[]} subjects
 * @param {string} name
 * @returns {object|null}
 */
export function resolveSubject(subjects, name) {
  const exact = subjects.find((subject) => subject.name === name);
  if (exact) return exact;

  const haystack = name.toLowerCase();
  const byStem = subjects.find((subject) =>
    subject.matchNames.some((stem) => haystack.includes(stem.toLowerCase()))
  );
  return byStem ?? null;
}

/**
 * The rows of a corpus file (or a bare array), optionally narrowed to some
 * keys or to one split, and capped. Key order follows the file, not the
 * --keys list.
 *
 * @param {object|object[]} parsed  the JSON as read
 * @param {{ keys?: string[]|null, split?: string|null, limit?: number|null }} options
 * @returns {object[]}
 */
export function itemsFromFile(parsed, { keys = null, split = null, limit = null } = {}) {
  const all = Array.isArray(parsed) ? parsed : parsed.items ?? [];
  const inSplit = split ? all.filter((row) => row.split === split) : all;
  const wanted = keys ? inSplit.filter((row) => keys.includes(row.key)) : inSplit;
  return limit ? wanted.slice(0, limit) : wanted;
}

/**
 * Reads and narrows a corpus file from disk.
 *
 * @param {string} path
 * @param {{ keys?: string[]|null, split?: string|null, limit?: number|null }} options
 * @returns {Promise<object[]>}
 */
export async function loadItems(path, options) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  return itemsFromFile(parsed, options);
}
