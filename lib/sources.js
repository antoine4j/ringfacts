// The official-source rule, in ONE place. Official sources born-confirm
// claims (docs §6) — it used to live as three hand-synced copies (hunter,
// bootstrap, audit script), which is how rules quietly fork.
//
// The rule itself is domain knowledge and now lives beside the outlet list it
// is matched against (domain/mma.js). This module stays as the seam so the
// pipeline never reaches into a domain object for it.
import { domain } from "../domain/index.js";

export const OFFICIAL_SOURCE_RE = domain.officialSource;

// Same rule as a Postgres regex string, for SQL `~*` filters.
export const OFFICIAL_SOURCE_SQL = OFFICIAL_SOURCE_RE.source;

export function isOfficialSource(source) {
  return OFFICIAL_SOURCE_RE.test(source.trim());
}
