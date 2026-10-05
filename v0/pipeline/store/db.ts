// Opens v0's database connections. Every other store module takes a pool
// from here and names no schema, so the same code writes live data or the
// golden replay depending on which pool it is given.

import pg from "pg";

/**
 * A connection pool for one schema of the v0 database.
 *
 * @param url  A role's database address.
 * @param schema  "public" for live data, "replay" for the golden replay.
 * @returns The pool; close it with pool.end().
 */
export function openPool(url: string, schema = "public"): pg.Pool {
  return new pg.Pool({ connectionString: url, max: 6, options: `-c search_path=${schema},public` });
}

/**
 * Runs some writes as one transaction: all of them land, or none.
 *
 * @param pool  The pool to borrow a connection from.
 * @param work  The writes, given the borrowed connection.
 * @returns Whatever work returns.
 */
export async function inTransaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
