// The storyboard's one door to the database. Every page asks its questions
// through query(); nothing else opens a connection. The address comes from
// DATABASE_URL (the v0_editor role: it reads everything and can add only
// feedback and settings rows).

import pg from "pg";
import { type Schema } from "./schema.ts";

/** The pool lives on globalThis so a page reload in development does not open a new one each time. */
const holder = globalThis as unknown as { storyboardPool?: pg.Pool };

/**
 * The shared connection pool, opened on first use.
 *
 * @returns A pool of at most three connections, as Neon suggests for Vercel.
 */
function pool(): pg.Pool {
  // Open the pool once; later calls reuse it.
  if (!holder.storyboardPool) {
    const address = process.env.DATABASE_URL;
    if (!address) throw new Error("DATABASE_URL is not set: the storyboard has no database to read");
    holder.storyboardPool = new pg.Pool({ connectionString: address, max: 3, idleTimeoutMillis: 10_000 });
  }
  return holder.storyboardPool;
}

/**
 * Runs one query against the live tables or the golden replay's copy of them.
 *
 * @param schema  "public" for live data, "replay" for the golden replay.
 * @param sql  The query, with $1, $2 … for every value.
 * @param values  The values for $1, $2 …
 * @returns The rows.
 */
export async function query<Row = Record<string, unknown>>(schema: Schema, sql: string, values: unknown[] = []): Promise<Row[]> {
  // Live data sits in the default schema, so the query runs as it is.
  if (schema === "public") {
    const result = await pool().query(sql, values);
    return result.rows as Row[];
  }

  // The replay's tables have the same names in another schema: point this one query at them.
  return inReplaySchema(async (client) => {
    const result = await client.query(sql, values);
    return result.rows as Row[];
  });
}

/**
 * Inserts one row and returns it, in the schema given.
 *
 * @param schema  "public" or "replay".
 * @param sql  An INSERT … RETURNING statement, with $1, $2 … for every value.
 * @param values  The values.
 * @returns The inserted row.
 */
export async function insertOne<Row = Record<string, unknown>>(schema: Schema, sql: string, values: unknown[]): Promise<Row> {
  const rows = await query<Row>(schema, sql, values);
  return rows[0];
}

/**
 * Runs some work on one connection whose search path is the replay schema,
 * inside a transaction so the setting ends with it.
 *
 * @param work  The queries to run.
 * @returns Whatever work returns.
 */
async function inReplaySchema<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    // SET LOCAL lasts until the transaction ends, so the connection goes back to the pool unchanged.
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path TO replay, public");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
