// The official-source rule, in ONE place. Official sources born-confirm
// claims (docs §6), so this regex is the most consequential string in the
// system — it used to live as three hand-synced copies (hunter, bootstrap,
// audit script), which is how rules quietly fork.
//
// v1 list = ufc.com only (resolved 2026-08-08): all three fighters are UFC.
// pflmma.com parked until a watched fighter signs there. Record trackers
// (Tapology, Sherdog, ESPN) are high-credibility media, never official.
export const OFFICIAL_SOURCE_RE = /^ufc(\.com)?$/i;

// Same rule as a Postgres regex string, for SQL `~*` filters.
export const OFFICIAL_SOURCE_SQL = OFFICIAL_SOURCE_RE.source;

export function isOfficialSource(source) {
  return OFFICIAL_SOURCE_RE.test(source.trim());
}
