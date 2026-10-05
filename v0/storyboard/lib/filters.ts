// Turns the filters in a page's address (?fighter=…&tier=1&fact=result) into a
// WHERE clause. Every value travels as a query parameter ($1, $2 …), never
// pasted into the SQL; the only words that reach the SQL itself are fixed here.

import { dayRange } from "./dates.ts";

/** A page's query string, as Next hands it over. */
export type Params = Record<string, string | string[] | undefined>;

/** A WHERE clause being built: its conditions, and the values for their placeholders. */
export type SqlFilter = { conditions: string[]; values: unknown[] };

/** The stages a reading waits at between being made and being done. */
export const WAITING_STAGES = ["classify", "extract", "group", "decide"];

/** Every stage a reading can be at, as schema.sql allows. */
export const STAGES = ["no_body", ...WAITING_STAGES, "done", "stuck"];

/** Address keys that are filters of their own, so they are never read as a classifier answer. */
const RESERVED_KEYS = new Set(["fighter", "day", "when", "from", "to", "outlet", "tier", "posted", "stage", "history", "claim", "schema", "limit", "open"]);

/** What a classifier answer's name may look like in the address. */
const ANSWER_NAME = /^[a-z][a-z_]{0,39}$/;

/**
 * One value from the query string; the first one when a key is repeated.
 *
 * @param params  The query string.
 * @param key  The key to read.
 * @returns The value, trimmed, or "" when absent.
 */
export function param(params: Params, key: string): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim();
}

/**
 * An empty WHERE clause to add conditions to.
 *
 * @returns A filter with no conditions.
 */
export function newFilter(): SqlFilter {
  return { conditions: [], values: [] };
}

/**
 * Adds one condition, numbering its placeholders after the ones already there.
 *
 * @param filter  The clause being built.
 * @param sql  The condition, with "?" where each value goes.
 * @param values  The values, in the order of the "?"s.
 */
export function addCondition(filter: SqlFilter, sql: string, ...values: unknown[]): void {
  let numbered = sql;
  for (const value of values) {
    filter.values.push(value);
    numbered = numbered.replace("?", `$${filter.values.length}`);
  }
  filter.conditions.push(numbered);
}

/**
 * The finished WHERE clause.
 *
 * @param filter  The clause built so far.
 * @returns "WHERE a AND b", or "" when there are no conditions.
 */
export function whereSql(filter: SqlFilter): string {
  if (filter.conditions.length === 0) return "";
  return `WHERE ${filter.conditions.join(" AND ")}`;
}

/**
 * The classifier answers asked for in the address: every key that is not a
 * filter of its own, such as ?fact=next_fight&firmness=rumour.
 *
 * @param params  The query string.
 * @returns [answer name, value] pairs.
 */
export function answerFilters(params: Params): [string, string][] {
  const pairs: [string, string][] = [];
  for (const key of Object.keys(params)) {
    const value = param(params, key);
    const isAnswer = !RESERVED_KEYS.has(key) && ANSWER_NAME.test(key) && value !== "";
    if (isAnswer) pairs.push([key, value]);
  }
  return pairs;
}

/**
 * Adds the filters that describe one reading: fighter, dates, outlet, tier,
 * posted, stage, history and classifier answers.
 *
 * @param filter  The clause being built.
 * @param params  The query string.
 * @param alias  The name the query gives reading_now, such as "rn".
 */
export function addReadingConditions(filter: SqlFilter, params: Params, alias: string): void {
  addSimpleReadingConditions(filter, params, alias);
  addStateConditions(filter, params, alias);

  // Each classifier answer: the answer's name and value both travel as parameters.
  for (const [name, value] of answerFilters(params)) {
    addCondition(filter, `${alias}.classification ->> ? = ?`, name, value);
  }
}

/**
 * The days the address asks for, as lib/dates.ts reads them.
 *
 * @param params  The query string.
 * @param now  The current moment.
 * @returns The first and last day, or null for no date filter.
 */
export function dateFilter(params: Params, now = new Date()) {
  return dayRange(param(params, "when"), param(params, "from"), param(params, "to"), param(params, "day"), now);
}

/**
 * Adds the fighter, date and outlet filters.
 *
 * @param filter  The clause being built.
 * @param params  The query string.
 * @param alias  The name the query gives reading_now.
 */
function addSimpleReadingConditions(filter: SqlFilter, params: Params, alias: string): void {
  // Fighter and outlet match exactly.
  const fighter = param(params, "fighter");
  if (fighter) addCondition(filter, `${alias}.fighter = ?`, fighter);
  const outlet = param(params, "outlet");
  if (outlet) addCondition(filter, `${alias}.outlet = ?`, outlet);

  // Days are calendar days in Pacific time, where Anton reads; either end may be open.
  const range = dateFilter(params);
  const pacificDay = `(${alias}.published_at AT TIME ZONE 'America/Los_Angeles')::date`;
  if (range?.from) addCondition(filter, `${pacificDay} >= ?::date`, range.from);
  if (range?.to) addCondition(filter, `${pacificDay} <= ?::date`, range.to);
}

/**
 * Adds the tier, posted, stage and history filters.
 *
 * @param filter  The clause being built.
 * @param params  The query string.
 * @param alias  The name the query gives reading_now.
 */
function addStateConditions(filter: SqlFilter, params: Params, alias: string): void {
  // Tier 1, 2 or 3, or "none" for a reading not decided yet.
  const tier = param(params, "tier");
  if (["1", "2", "3"].includes(tier)) addCondition(filter, `${alias}.tier = ?`, Number(tier));
  if (tier === "none") addCondition(filter, `${alias}.tier IS NULL`);

  // Posted means v0 sent it to its chat.
  const posted = param(params, "posted");
  if (posted === "yes") addCondition(filter, `${alias}.posted_at IS NOT NULL`);
  if (posted === "no") addCondition(filter, `${alias}.posted_at IS NULL`);

  // A stage by name, or "waiting" for any stage before done.
  const stage = param(params, "stage");
  if (stage === "waiting") addCondition(filter, `${alias}.stage = ANY(?)`, WAITING_STAGES);
  if (STAGES.includes(stage)) addCondition(filter, `${alias}.stage = ?`, stage);

  // History is the archive, re-answered and never posted.
  const history = param(params, "history");
  if (history === "yes") addCondition(filter, `${alias}.backfill`);
  if (history === "no") addCondition(filter, `NOT ${alias}.backfill`);
}

/**
 * The WHERE clause for the readings page, over reading_now as "rn".
 *
 * @param params  The query string.
 * @returns The clause and its values.
 */
export function readingFilter(params: Params): SqlFilter {
  const filter = newFilter();
  addReadingConditions(filter, params, "rn");

  // One claim's readings, when the address names a claim.
  const claim = param(params, "claim");
  if (/^\d+$/.test(claim)) addCondition(filter, "rn.claim_id = ?", claim);
  return filter;
}

/**
 * The WHERE clause for the claims page, over claim_now as "cn". A claim
 * matches a reading filter when at least one of its readings does.
 *
 * @param params  The query string.
 * @returns The clause and its values.
 */
export function claimFilter(params: Params): SqlFilter {
  const filter = newFilter();

  // The claim's own fighter and whether it was posted.
  const fighter = param(params, "fighter");
  if (fighter) addCondition(filter, "cn.fighter = ?", fighter);
  const posted = param(params, "posted");
  if (posted === "yes") addCondition(filter, "cn.posted_reading_id IS NOT NULL");
  if (posted === "no") addCondition(filter, "cn.posted_reading_id IS NULL");

  // Day, outlet, tier and answers: the claim has a reading that matches them all.
  // The member conditions share the values list, so their placeholders keep counting.
  const members: SqlFilter = { conditions: [], values: filter.values };
  const memberParams: Params = { ...params, fighter: undefined, posted: undefined, stage: undefined };
  addReadingConditions(members, memberParams, "m");
  if (members.conditions.length > 0) {
    const memberWhere = members.conditions.join(" AND ");
    filter.conditions.push(`EXISTS (SELECT 1 FROM groupings g JOIN reading_now m ON m.reading_id = g.reading_id WHERE g.claim_id = cn.id AND ${memberWhere})`);
  }
  return filter;
}

/**
 * A link to the same page with one filter changed, the others kept.
 *
 * @param path  The page, such as "/readings".
 * @param params  The current query string.
 * @param changes  The keys to set; "" removes a key.
 * @returns The link.
 */
export function linkWith(path: string, params: Params, changes: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const key of Object.keys(params)) {
    const value = param(params, key);
    if (value) search.set(key, value);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value) search.set(key, value);
    else search.delete(key);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
