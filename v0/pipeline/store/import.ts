// Reads production's articles and imports the ones v0 does not have yet
// (stations 1–3, reused from production). Each run takes every article
// production stored in the last 3 days; the unique production id makes a
// second import of the same article do nothing.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 2.

import type pg from "pg";
import { mentionsName } from "../../../lib/tier.js";
import { inTransaction } from "./db.ts";

export const IMPORT_WINDOW_DAYS = 3;

// The shortest body the classifier was tuned on is 428 characters; the
// og-description rung yields blurbs of about 140. History: docs/decisions.md#v0-usable-body
export const USABLE_BODY_CHARACTERS = 400;

/** One row of production's items table, as v0 reads it. */
export type ProductionItem = {
  id: number;
  url: string;
  resolved_url: string | null;
  subject: string;
  title: string;
  source: string;
  published_at: Date;
  body: string | null;
  body_via: string | null;
  posted: boolean;
  held_reason: string | null;
  digest_tier: string | null;
};

/** A watched fighter: his name and the name stems that find him in a text. */
export type Subject = { name: string; matchNames: string[] };

/**
 * Production's articles stored in the last few days, or all of them.
 *
 * @param feed  A pool logged in as v0_feed, on production's database.
 * @param days  How far back to read; null for the whole archive.
 * @returns The rows, oldest first.
 */
export async function readProductionItems(feed: pg.Pool, days: number | null): Promise<ProductionItem[]> {
  const columns = "id, url, resolved_url, subject, title, source, published_at, body, body_via, posted, held_reason, digest_tier";
  const window = days === null ? "" : `WHERE seen_at > now() - make_interval(days => ${Number(days)})`;
  const result = await feed.query(`SELECT ${columns} FROM items ${window} ORDER BY published_at, id`);
  return result.rows;
}

/**
 * Whether a body is long enough to be classified (D2).
 *
 * @param body  The text production extracted, or null.
 * @returns True when it is at least USABLE_BODY_CHARACTERS long.
 */
export function isUsableBody(body: string | null): boolean {
  return body !== null && body.length >= USABLE_BODY_CHARACTERS;
}

/**
 * What production did with the article, for the comparison with v0.
 *
 * @param item  The production row.
 * @returns "posted", "mentions", or "held: <reason>".
 */
export function productionOutcome(item: ProductionItem): string {
  if (item.posted && item.digest_tier === "tangential") return "mentions";
  if (item.posted) return "posted";
  return `held: ${item.held_reason ?? "unknown"}`;
}

/**
 * Every watched fighter the article is about: the one production filed it
 * under, and every one whose name stems appear in its headline or body (D16).
 *
 * @param item  The production row.
 * @param subjects  The watchlist.
 * @returns One entry per fighter, with how he was found.
 */
export function fightersOf(item: ProductionItem, subjects: Subject[]): { fighter: string; foundBy: "production" | "name_in_text" }[] {
  const text = `${item.title} ${item.body ?? ""}`;
  const found: { fighter: string; foundBy: "production" | "name_in_text" }[] = [];
  for (const subject of subjects) {
    const filedUnderHim = subject.name === item.subject;
    if (filedUnderHim) found.push({ fighter: subject.name, foundBy: "production" });
    else if (mentionsName(text, subject.matchNames)) found.push({ fighter: subject.name, foundBy: "name_in_text" });
  }
  return found;
}

/**
 * Adds any watched fighter the fighters table does not have yet.
 *
 * @param pool  The v0 pool.
 * @param subjects  The watchlist.
 */
export async function ensureFighters(pool: pg.Pool, subjects: Subject[]): Promise<void> {
  for (const subject of subjects) {
    await pool.query("INSERT INTO fighters (name) VALUES ($1) ON CONFLICT DO NOTHING", [subject.name]);
  }
}

/**
 * Imports the articles v0 does not have yet, each with one reading per fighter.
 *
 * @param pool  The v0 pool.
 * @param items  Production's rows.
 * @param subjects  The watchlist.
 * @param backfill  True for the archive run: these readings never post.
 * @returns How many articles came in, how many readings were made, how many have no usable body.
 */
export async function importItems(pool: pg.Pool, items: ProductionItem[], subjects: Subject[], backfill: boolean): Promise<{ imported: number; readings: number; noBody: number }> {
  const counts = { imported: 0, readings: 0, noBody: 0 };

  // One query for the articles v0 already has, so a run writes only what is new.
  const known = await pool.query("SELECT production_item_id FROM articles WHERE production_item_id = ANY($1::bigint[])", [items.map((item) => item.id)]);
  const knownIds = new Set(known.rows.map((row) => Number(row.production_item_id)));
  for (const item of items) {
    if (knownIds.has(Number(item.id))) continue;
    const fighters = fightersOf(item, subjects);
    const stage = isUsableBody(item.body) ? "classify" : "no_body";

    // The article and its readings land together, or not at all.
    const made = await inTransaction(pool, async (client) => {
      const article = await client.query(
        `INSERT INTO articles (production_item_id, url, outlet, headline, published_at, body, body_via, production_subject, production_outcome, backfill)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (production_item_id) DO NOTHING RETURNING id`,
        [item.id, item.resolved_url ?? item.url, item.source, item.title, item.published_at, item.body, item.body_via, item.subject, productionOutcome(item), backfill],
      );
      if (article.rowCount === 0) return null;
      for (const { fighter, foundBy } of fighters) {
        await client.query("INSERT INTO readings (article_id, fighter, found_by, stage) VALUES ($1, $2, $3, $4)", [article.rows[0].id, fighter, foundBy, stage]);
      }
      return fighters.length;
    });

    // Count only what was new.
    if (made === null) continue;
    counts.imported += 1;
    counts.readings += made;
    if (stage === "no_body") counts.noBody += made;
  }
  return counts;
}
