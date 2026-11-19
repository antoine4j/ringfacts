// Step 3: the tables. Each page that failed on 20 or 22 October, set against
// what happened when it was fetched again; the control; the outlets; and how
// many of the 22 October refusals Jina could already read then.
//
//   node count.mjs
//
// Writes results.json (tracked: ids, hosts, status codes and counts only) and
// prints the tables.

import { writeFileSync } from "node:fs";
import { buildTargets, failureKind, hostOf, readJson } from "./targets.mjs";
import { mentionsName } from "../../../lib/tier.js";
import { SUBJECTS } from "../../../watchlist.js";

const DATA = new URL("./data/", import.meta.url);
const JINA_RECORD_FRESH = new URL("../2026-10-22-reading-order/data/jina-record.json", import.meta.url);
const JINA_TEXTS_FRESH = new URL("../2026-10-22-reading-order/data/jina.json", import.meta.url);
const JINA_RECORD_GOLDEN = new URL("../2026-10-22-reading-order/data/golden-jina-record.json", import.meta.url);
const JINA_TEXTS_GOLDEN = new URL("../2026-10-22-reading-order/data/golden-jina.json", import.meta.url);
const OUTCOMES = ["same failure", "different failure", "unreadable", "readable"];
const USABLE = 400;

/**
 * Whether Jina's text for one article passed the readable bar then.
 *
 * @param {string} id
 * @param {string} subject  The fighter's name as in watchlist.js.
 * @param {{record: object, texts: object}} jina  One experiment's Jina record and texts.
 * @returns {{reached: boolean, readable: boolean}}
 */
function jinaVerdict(id, subject, jina) {
  const reached = jina.record[id]?.status === "ok";
  const text = jina.texts[id] ?? "";
  const matchNames = SUBJECTS.find((entry) => entry.name === subject)?.matchNames ?? [];
  const readable = reached && text.length >= USABLE && mentionsName(text, matchNames);
  return { reached, readable };
}

/**
 * Sorts one earlier failure into what happened today.
 *
 * @param {string} originalKind  "403", "connect"...
 * @param {object} fetched  Today's fetch row.
 * @param {object|undefined} read  Today's read row, when the page came back.
 * @returns {{todayKind: string|null, outcome: string}}
 */
function classify(originalKind, fetched, read) {
  const todayKind = failureKind(fetched);
  if (todayKind === null) return { todayKind, outcome: read?.readable ? "readable" : "unreadable" };
  return { todayKind, outcome: todayKind === originalKind ? "same failure" : "different failure" };
}

/**
 * Counts rows into a table: original kind by outcome.
 *
 * @param {object[]} rows  Classified failed rows.
 * @returns {Record<string, Record<string, number>>}
 */
function tableOf(rows) {
  const table = {};
  for (const row of rows) {
    table[row.kind] ??= Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
    table[row.kind][row.outcome] += 1;
  }
  return table;
}

/**
 * How many distinct pages of each host came back in the two earlier runs.
 *
 * @returns {Record<string, number>}
 */
function earlierSuccessesByHost() {
  const records = [readJson(new URL("../2026-10-20-clean-text/data/fetch.json", import.meta.url)), readJson(new URL("../2026-10-22-reading-order/data/fetch.json", import.meta.url))];
  const idsByHost = {};
  for (const record of records) {
    for (const [id, row] of Object.entries(record)) {
      if (row.status !== 200) continue;
      idsByHost[hostOf(row.address)] ??= new Set();
      idsByHost[hostOf(row.address)].add(id);
    }
  }
  return Object.fromEntries(Object.entries(idsByHost).map(([host, ids]) => [host, ids.size]));
}

/**
 * Counts failed rows per outlet host, with how many of the host's pages came back in the earlier runs.
 *
 * @param {object[]} rows  Classified failed rows.
 * @returns {{host: string, pages: number, cameBack: number, readable: number, cameBackEarlier: number}[]}  Most pages first.
 */
function hostTable(rows) {
  const byHost = {};
  const earlier = earlierSuccessesByHost();
  for (const row of rows) {
    byHost[row.host] ??= { host: row.host, pages: 0, cameBack: 0, readable: 0, cameBackEarlier: earlier[row.host] ?? 0 };
    byHost[row.host].pages += 1;
    if (row.todayKind === null) byHost[row.host].cameBack += 1;
    if (row.outcome === "readable") byHost[row.host].readable += 1;
  }
  return Object.values(byHost).sort((first, second) => second.pages - first.pages || first.host.localeCompare(second.host));
}

/**
 * Judges the control: pages that came back on 22 October, fetched again.
 *
 * @param {object[]} controlRows  Target rows of the control group.
 * @param {object} fetchedById
 * @param {object} readById
 * @returns {object}
 */
function controlSummary(controlRows, fetchedById, readById) {
  const earlierRead = readJson(new URL("../2026-10-22-reading-order/data/read.json", import.meta.url));
  const pages = controlRows.map((row) => {
    const todayKind = failureKind(fetchedById[row.id]);
    const readableToday = readById[row.id]?.readable ?? false;
    return { id: row.id, host: hostOf(row.address), todayKind, readableToday, readableOn22Oct: earlierRead[row.id]?.ours?.readable ?? null };
  });
  const stillCameBack = pages.filter((page) => page.todayKind === null).length;
  const sameVerdict = pages.filter((page) => page.todayKind === null && page.readableToday === page.readableOn22Oct).length;
  return { pages: pages.length, stillCameBack, nowFailing: pages.length - stillCameBack, sameReadVerdict: sameVerdict, rows: pages };
}

/**
 * Counts the pages that failed on one date and succeeded on the other, among the 14 ids both runs fetched.
 *
 * @param {object[]} failedRows
 * @returns {object[]}
 */
function mixedPages(failedRows) {
  const goldenRecord = readJson(new URL("../2026-10-20-clean-text/data/fetch.json", import.meta.url));
  const freshRecord = readJson(new URL("../2026-10-22-reading-order/data/fetch.json", import.meta.url));
  const bothDates = Object.keys(goldenRecord).filter((id) => freshRecord[id]);
  const mixed = bothDates.filter((id) => (goldenRecord[id].status === 200) !== (freshRecord[id].status === 200));
  return mixed.map((id) => ({ id, on20Oct: failureKind(goldenRecord[id]) ?? "200", on22Oct: failureKind(freshRecord[id]) ?? "200", today: failedRows.find((row) => row.id === id)?.todayKind ?? "not refetched (came back both times)" }));
}

/**
 * What today's refusals and connection failures were, and how many distinct pages failed.
 *
 * @param {Record<string, any>} fetchedById  Today's fetch rows.
 * @param {object[]} failedRows  Classified failed rows.
 * @returns {object}
 */
function refusalMakeup(fetchedById, failedRows) {
  const refused = Object.values(fetchedById).filter((row) => failureKind(row) === "403");
  const botCheckAmongRefusals = { refused403: refused.length, botCheck: refused.filter((row) => row.bot_check).length };
  const otherRefusalHosts = refused.filter((row) => !row.bot_check).map((row) => hostOf(row.address));
  const connectCauses = Object.values(fetchedById).filter((row) => failureKind(row) === "connect").map((row) => ({ id: row.id, cause: row.cause }));
  const uniqueFailedPages = new Set(failedRows.map((row) => row.id)).size;
  return { uniqueFailedPages, pagesFailedOnBothDates: failedRows.length - uniqueFailedPages, botCheckAmongRefusals, otherRefusalHosts, connectCauses };
}

/**
 * The rows of one date.
 *
 * @param {object[]} rows
 * @param {string} date
 * @returns {object[]}
 */
function onDate(rows, date) {
  return rows.filter((row) => row.date === date);
}

/**
 * The rows whose page came back today.
 *
 * @param {object[]} rows
 * @returns {object[]}
 */
function cameBackToday(rows) {
  return rows.filter((row) => row.todayKind === null);
}

/**
 * Counts how many rows came back readable today and how many Jina could read then.
 *
 * @param {object[]} rows  Classified failed rows with a `jina` verdict.
 * @returns {{pages: number, readableToday: number, jinaReached: number, jinaReadable: number}}
 */
function jinaCounts(rows) {
  const readableToday = rows.filter((row) => row.outcome === "readable").length;
  const jinaReached = rows.filter((row) => row.jina.reached).length;
  const jinaReadable = rows.filter((row) => row.jina.readable).length;
  return { pages: rows.length, readableToday, jinaReached, jinaReadable };
}

/**
 * Builds every table and writes results.json.
 */
function main() {
  const fetchRecord = readJson(new URL("fetch.json", DATA));
  const fetchedById = fetchRecord.pages;
  const readById = readJson(new URL("read.json", DATA));
  const { rows: targets } = buildTargets();

  // Each failed row: classified, with its outlet host.
  const failedRows = targets.filter((row) => row.group === "failed").map((row) => {
    const classified = classify(row.kind, fetchedById[row.id], readById[row.id]);
    return { id: row.id, date: row.date, kind: row.kind, host: hostOf(row.address), subject: row.subject, ...classified };
  });

  // Jina's verdict then, for the 22 October refusals that came back today, and (extra) the 20 October ones.
  const jinaFresh = { record: readJson(JINA_RECORD_FRESH), texts: readJson(JINA_TEXTS_FRESH) };
  const jinaGolden = { record: readJson(JINA_RECORD_GOLDEN), texts: readJson(JINA_TEXTS_GOLDEN) };
  for (const row of failedRows) {
    const jina = row.date === "2026-10-22" ? jinaFresh : jinaGolden;
    row.jina = jinaVerdict(row.id, row.subject, jina);
  }

  // The control.
  const control = controlSummary(targets.filter((row) => row.group === "control"), fetchedById, readById);

  // The refusals' makeup, the connection failures' causes and the distinct-page counts.
  const makeup = refusalMakeup(fetchedById, failedRows);

  const results = {
    ...makeup,
    fetched_at: fetchRecord.fetched_at,
    finished_at: fetchRecord.finished_at,
    pages_fetched: Object.keys(fetchedById).length,
    failed_rows: failedRows.length,
    tables: { "2026-10-20": tableOf(onDate(failedRows, "2026-10-20")), "2026-10-22": tableOf(onDate(failedRows, "2026-10-22")), combined: tableOf(failedRows) },
    hosts: hostTable(failedRows),
    jina: { "2026-10-22": jinaCounts(cameBackToday(onDate(failedRows, "2026-10-22"))), "2026-10-20": jinaCounts(cameBackToday(onDate(failedRows, "2026-10-20"))) },
    jinaOnAllFailed: { "2026-10-22": jinaCounts(onDate(failedRows, "2026-10-22")), "2026-10-20": jinaCounts(onDate(failedRows, "2026-10-20")) },
    control,
    mixed: mixedPages(failedRows),
    relented: failedRows.filter((row) => row.todayKind === null).map(({ id, date, kind, host, outcome, jina }) => ({ id, date, kind, host, outcome, jina })),
    todayKinds: Object.entries(Object.groupBy(failedRows, (row) => `${row.kind} -> ${row.todayKind ?? "200"}`)).map(([key, group]) => [key, group.length]),
  };
  writeFileSync(new URL("results.json", import.meta.url), JSON.stringify(results, null, 1));
  console.log(JSON.stringify({ tables: results.tables, jina: results.jina, jinaOnAllFailed: results.jinaOnAllFailed, control: { ...control, rows: undefined }, mixed: results.mixed, botCheckAmongRefusals: results.botCheckAmongRefusals, relented: results.relented, todayKinds: results.todayKinds }, null, 1));
  console.table(results.hosts);
}

main();
