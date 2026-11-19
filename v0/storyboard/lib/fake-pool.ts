// Test helper for the specs that run the storyboard's queries: a stand-in for
// the connection pool, so lib/db.ts runs unchanged but nothing reaches a
// database. lib/db.ts keeps its pool on globalThis; installing a fake there
// makes query() answer from the routes a spec gives. It is not a spec; the
// runner skips it.
//
// The fake does not run SQL. A route answers by what the SQL text matches, so a
// spec checks the values the code sent and how the rows it gets back are shaped,
// not what the database would have selected.

/** What a route answers with: rows, or a function of the values sent. */
type Answer = unknown[] | ((values: unknown[], sql: string) => unknown[]);

/** One query the code sent. */
export type SentQuery = { sql: string; values: unknown[] };

/** A pool in memory, shaped like the part of pg.Pool the storyboard uses. */
export class FakePool {
  queries: SentQuery[] = [];
  private routes: { pattern: RegExp; answer: Answer }[] = [];
  private saved: unknown;

  /**
   * Puts this pool where lib/db.ts looks for its own.
   *
   * @returns This pool, for chaining.
   */
  install(): this {
    const holder = globalThis as unknown as { storyboardPool?: unknown };
    this.saved = holder.storyboardPool;
    holder.storyboardPool = this;
    return this;
  }

  /** Puts back whatever pool was there before. */
  restore(): void {
    (globalThis as unknown as { storyboardPool?: unknown }).storyboardPool = this.saved;
  }

  /**
   * Answers every later query whose SQL matches, ahead of earlier routes.
   *
   * @param pattern  What the SQL must match.
   * @param answer  The rows, or a function from the values sent to the rows.
   * @returns This pool, for chaining.
   */
  on(pattern: RegExp, answer: Answer): this {
    this.routes.unshift({ pattern, answer });
    return this;
  }

  /**
   * The queries sent so far that match a pattern.
   *
   * @param pattern  What to look for.
   * @returns The matching queries, in the order sent.
   */
  sent(pattern: RegExp): SentQuery[] {
    return this.queries.filter((query) => pattern.test(query.sql));
  }

  /**
   * Answers one query, as pg.Pool.query does.
   *
   * @param sql  The SQL.
   * @param values  The values sent.
   * @returns The result, with its rows.
   */
  async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.queries.push({ sql, values });
    const route = this.routes.find((candidate) => candidate.pattern.test(sql));
    if (!route) throw new Error(`the fake pool does not know this query: ${sql.trim().slice(0, 120)}`);
    return { rows: typeof route.answer === "function" ? route.answer(values, sql) : route.answer };
  }
}
