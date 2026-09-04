// The mentions digest: the once-a-day message that carries every article the
// hourly runs folded as tangential — the group's fighter named in passing in
// someone else's story. Real news posts on the hour; these accumulate and
// ship together, grouped by fighter, newest first, or not at all when there
// is nothing. Rendering only; the sweep that feeds it lives in hunter.js.
// History: docs/decisions.md#mentions-digest

import { escapeHtml } from "./telegram.js";

/**
 * Groups queued rows by subject, keeping the watchlist's order for subjects
 * and each row list's own order (newest first) inside a group.
 *
 * @param {object[]} rows       From the store's unsweptMentions.
 * @param {string[]} subjectOrder  Watchlist names, for the group order.
 * @returns {{ subject: string, rows: object[] }[]}
 */
export function groupMentions(rows, subjectOrder) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.subject)) groups.set(row.subject, []);
    groups.get(row.subject).push(row);
  }

  // Watchlist order first, then anything the watchlist no longer names.
  const ordered = [];
  for (const name of subjectOrder) {
    if (groups.has(name)) ordered.push({ subject: name, rows: groups.get(name) });
  }
  for (const [subject, groupRows] of groups) {
    if (!subjectOrder.includes(subject)) ordered.push({ subject, rows: groupRows });
  }
  return ordered;
}

/**
 * The headline without a Google News style " - Outlet" suffix — only when the
 * suffix is the row's own outlet name, so a real dash in a headline survives.
 *
 * @param {object} row
 * @returns {string}
 */
export function cleanTitle(row) {
  const suffix = ` - ${row.source?.trim() ?? ""}`;
  const hasSuffix = row.source && row.title.endsWith(suffix);
  return hasSuffix ? row.title.slice(0, -suffix.length) : row.title;
}

/**
 * The outlet name shown for a row: the feed's source, else the hostname.
 *
 * @param {object} row
 * @returns {string}
 */
function outletOf(row) {
  return row.source?.trim() || hostOf(row.url);
}

/**
 * One story, however many outlets carried it: the newest copy's headline is
 * the link, its outlet follows, and every other outlet is a further link.
 *
 * @param {object[]} copies  Rows sharing one headline, newest first.
 * @returns {string}
 */
export function mentionLine(copies) {
  const rows = Array.isArray(copies) ? copies : [copies];
  const [first, ...others] = rows;
  const title = escapeHtml(cleanTitle(first));
  const outlets = [escapeHtml(outletOf(first))];
  for (const row of others) {
    outlets.push(`<a href="${escapeHtml(row.url)}">${escapeHtml(outletOf(row))}</a>`);
  }
  return `• <a href="${escapeHtml(first.url)}">${title}</a> — ${outlets.join(" · ")}`;
}

/**
 * Folds rows with the same headline into one entry each, keeping order.
 *
 * @param {object[]} rows
 * @returns {object[][]}  one array of copies per distinct headline
 */
export function collapseSameStory(rows) {
  const byTitle = new Map();
  for (const row of rows) {
    const key = cleanTitle(row).trim().toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(row);
  }
  return [...byTitle.values()];
}

/**
 * The hostname of a URL without a www prefix, for rows whose feed gave no
 * source name.
 *
 * @param {string} url
 * @returns {string}
 */
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

/**
 * The whole message, or null when there is nothing to say.
 *
 * @param {object[]} rows
 * @param {string[]} subjectOrder
 * @returns {string|null}
 */
export function renderMentionsDigest(rows, subjectOrder) {
  if (rows.length === 0) return null;

  const sections = groupMentions(rows, subjectOrder).map(({ subject, rows: groupRows }) => {
    const lines = collapseSameStory(groupRows).map(mentionLine);
    return `<b>${escapeHtml(subject)}</b>\n${lines.join("\n")}`;
  });

  return `📎 <b>Mentions</b> — articles that name them in passing\n\n${sections.join("\n\n")}`;
}
