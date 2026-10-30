// Shared by fetch.mjs, read.mjs and count.mjs: which pages are fetched again,
// and the words used for what happened to them. Not run on its own.
//
// The pages are those that failed in the clean-text experiment (20 October,
// the golden articles) or the reading-order experiment (22 October, the
// fresh sample), plus a seeded control of pages that came back on 22 October.
// Addresses are the ones those runs already recorded (Google's wrapped links
// were decoded then), so nothing is decoded again.

import { readFileSync } from "node:fs";

const GOLDEN_RECORD = new URL("../2026-10-20-clean-text/data/fetch.json", import.meta.url);
const GOLDEN_META = new URL("../../../golden/articles-meta.json", import.meta.url);
const FRESH_RECORD = new URL("../2026-10-22-reading-order/data/fetch.json", import.meta.url);
const FRESH_SAMPLE = new URL("../2026-10-22-reading-order/data/sample.json", import.meta.url);
const CONTROL_SIZE = 20;

/**
 * Reads a JSON file.
 *
 * @param {URL} location
 * @returns {any}
 */
export function readJson(location) {
  return JSON.parse(readFileSync(location, "utf8"));
}

/**
 * A number from 0 to 1 fixed by an article's id, the same function the
 * reading-order sample used, so the control pick can be repeated.
 *
 * @param {number} id
 * @returns {number}
 */
function seeded(id) {
  const x = Math.sin(id * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Names what went wrong in an earlier run's record, in one short word.
 *
 * @param {{status?: number|string, error?: string}} row  One record row from either experiment.
 * @returns {string|null}  "403", "404", "connect", "timeout"..., or null when the page came back.
 */
export function failureKind(row) {
  if (row.status === 200) return null;
  if (typeof row.status === "number") return String(row.status);
  if (row.status === "timeout") return "timeout";
  if (row.status === "error-TypeError" || String(row.error ?? "").startsWith("TypeError")) return "connect";
  return row.status ?? row.error ?? "unknown";
}

/**
 * The host of an address, without a leading "www.".
 *
 * @param {string} address
 * @returns {string}
 */
export function hostOf(address) {
  return new URL(address).hostname.replace(/^www\./, "");
}

/**
 * The failed pages of one earlier run.
 *
 * @param {string} date  "2026-10-20" or "2026-10-22".
 * @param {Record<string, any>} record  That run's fetch record, by article id.
 * @param {Record<string, string>} subjectById  The fighter each article is about.
 * @returns {object[]}
 */
function failuresOf(date, record, subjectById) {
  const rows = [];
  for (const [id, row] of Object.entries(record)) {
    const kind = failureKind(row);
    if (!kind) continue;
    rows.push({ id, date, group: "failed", kind, address: row.address, subject: subjectById[id] });
  }
  return rows;
}

/**
 * Every page to fetch again, with where it came from.
 * A page that failed on both dates appears once per date (same id, same
 * address); the fetch is done once per id.
 *
 * @returns {{rows: object[], ids: string[]}}  rows: one per (page, earlier run); ids: unique ids, in fetch order.
 */
export function buildTargets() {
  const goldenRecord = readJson(GOLDEN_RECORD);
  const goldenSubjects = Object.fromEntries(readJson(GOLDEN_META).map((article) => [String(article.id), article.subject]));
  const freshRecord = readJson(FRESH_RECORD);
  const freshSubjects = Object.fromEntries(readJson(FRESH_SAMPLE).map((article) => [String(article.id), article.subject]));

  // The failures of both dates.
  const rows = [...failuresOf("2026-10-20", goldenRecord, goldenSubjects), ...failuresOf("2026-10-22", freshRecord, freshSubjects)];
  const failedIds = new Set(rows.map((row) => row.id));

  // The control: a fixed seeded pick of 22 October's successes not already being fetched.
  const successes = Object.keys(freshRecord).filter((id) => freshRecord[id].status === 200 && !failedIds.has(id));
  const ordered = successes.sort((first, second) => seeded(Number(first)) - seeded(Number(second)));
  for (const id of ordered.slice(0, CONTROL_SIZE)) {
    rows.push({ id, date: "2026-10-22", group: "control", kind: null, address: freshRecord[id].address, subject: freshSubjects[id] });
  }

  // One fetch per unique id, in a seeded order so one outlet's pages are spread out.
  const uniqueIds = [...new Set(rows.map((row) => row.id))];
  const ids = uniqueIds.sort((first, second) => seeded(Number(first)) - seeded(Number(second)));
  return { rows, ids };
}
