// Which copy of the tables a page reads: the live ones, or the golden replay's.
// The choice comes from the address (?schema=replay), so it is checked against
// a fixed list before it goes anywhere near a query.

/** The two schemas of the v0 database: live data, and the golden replay. */
export type Schema = "public" | "replay";

/**
 * The schema a page should read, from its ?schema= value.
 *
 * @param value  What the address says; anything but "replay" means live data.
 * @returns "replay" or "public".
 */
export function schemaFrom(value: string | string[] | undefined): Schema {
  return value === "replay" ? "replay" : "public";
}

/**
 * The query-string suffix that keeps a link in the same schema.
 *
 * @param schema  The schema the page is reading.
 * @param joiner  "?" when the link has no query yet, "&" when it has.
 * @returns "" for live data, "?schema=replay" (or "&schema=replay") for the replay.
 */
export function schemaSuffix(schema: Schema, joiner: "?" | "&" = "?"): string {
  return schema === "replay" ? `${joiner}schema=replay` : "";
}
