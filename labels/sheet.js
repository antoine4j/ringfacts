// The review sheet's row format, both directions: label -> markdown row for
// docs/grading/2026-09-05-all-articles.md, and markdown row -> label for
// labels/write-feedback.js. Pure; no I/O.

const AUTHORS = ["haiku", "sonnet", "claude", "user"];

/**
 * Formats one review-sheet row.
 * Shape: `| [#16](url) | 08-07 | Donchenko | sport24.ua | posted | **1** | fine | | why | Anton |`
 *
 * @param {object} row  { id, url, date, fighter, source, machine, bucket,
 *   author, reason, dup_of, dupOfBucket?, why, anton }  dupOfBucket, when
 *   given, shows the root's bucket next to its id.
 * @returns {string}
 */
export function formatSheetRow(row) {
  const bucket = row.author === "haiku" ? `**${row.bucket}**` : `**${row.bucket}** (${row.author})`;
  const dupOf = row.dup_of ? `#${row.dup_of}${row.dupOfBucket ? ` (bucket ${row.dupOfBucket})` : ""}` : "";
  const cells = [
    `[#${row.id}](${row.url})`,
    row.date,
    row.fighter,
    escapeCell(row.source),
    row.machine,
    bucket,
    row.reason,
    dupOf,
    escapeCell(row.why),
    escapeCell(row.anton ?? ""),
  ];
  return `| ${cells.join(" | ")} |`;
}

/**
 * Parses one review-sheet row back into a label; null for non-data lines.
 *
 * @param {string} line
 * @returns {{ id: number, url: string, date: string, fighter: string,
 *   source: string, machine: string, bucket: number, author: string,
 *   reason: string, dup_of: number|null, why: string, anton: string } | null}
 */
export function parseSheetRow(line) {
  const cells = splitCells(line);
  if (cells.length !== 10) return null;
  const idMatch = cells[0].match(/^\[#(\d+)\]\(([^)]+)\)$/);
  const bucketMatch = cells[5].match(/^\*\*([123])\*\*(?: \((\w+)\))?$/);
  if (!idMatch || !bucketMatch) return null;
  const dupMatch = cells[7].match(/#(\d+)/);
  const author = bucketMatch[2] ?? "haiku";
  if (!AUTHORS.includes(author)) return null;
  return {
    id: Number(idMatch[1]),
    url: idMatch[2],
    date: cells[1],
    fighter: cells[2],
    source: cells[3],
    machine: cells[4],
    bucket: Number(bucketMatch[1]),
    author,
    reason: cells[6],
    dup_of: dupMatch ? Number(dupMatch[1]) : null,
    why: cells[8],
    anton: cells[9],
  };
}

/**
 * Splits a markdown table line into trimmed cells, honouring escaped pipes.
 *
 * @param {string} line
 * @returns {string[]}
 */
function splitCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  const parts = trimmed.split(/(?<!\\)\|/);
  return parts.slice(1, -1).map((cell) => cell.trim().replaceAll("\\|", "|"));
}

/**
 * Escapes pipes and newlines so a value fits one table cell.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeCell(text) {
  return String(text ?? "").replaceAll("|", "\\|").replaceAll(/\s*\n\s*/g, " ");
}

/**
 * The one-phrase description of what the pipeline did with an item.
 *
 * @param {object} item  Export row (posted, held_reason, counterpart).
 * @returns {string}
 */
export function machineSaid(item) {
  if (item.posted) return "posted";
  const counterpart = item.counterpart;
  if (item.held_reason === "embedding") return `held: dup of #${counterpart?.id ?? "?"}`;
  if (item.held_reason === "llm" || item.held_reason === "official") {
    const origin = counterpart?.origin?.id ? ` (origin #${counterpart.origin.id})` : "";
    return `held: matched claim #${counterpart?.claim_id ?? "?"}${origin}`;
  }
  if (item.held_reason === "wrong_subject") return "held: wrong subject";
  if (item.held_reason === "url") return `held: same url as #${counterpart?.id ?? "?"}`;
  return "held: folded";
}
