// Test helpers for the workflow's specs: a database kept in memory, a stand-in
// for the network, and a run context built on them. Nothing here touches the
// network, a real database or a key. It is not a spec; the runner skips it.
//
// The fake answers only the queries the workflow sends. It does not run SQL:
// where a query holds logic (the stuck threshold, the move to the next stage),
// the fake applies the same rule to the values the code sends, so a spec checks
// what the code asks for. The SQL itself is checked against a real branch by
// the database tests, not here.

import type pg from "pg";
import type { RunContext } from "./context.ts";
import type { Reading } from "../store/readings.ts";
import type { Settings } from "../settings/tiers.ts";
import { startingTierMap, startingSchedule } from "../settings/tiers.ts";
import { QUESTIONS } from "../stations/classifier/classifier.ts";

/** A reading as the fake keeps it: what the stations see, and where it stands. */
export type StoredReading = Reading & { stage: string; attempts: number; last_error: string | null; stuck_from: string | null };

/** What a query handler answers. */
export type QueryAnswer = { rows: any[]; rowCount?: number };

type Handler = { pattern: RegExp; answer: (params: any[], sql: string) => QueryAnswer };

/** One row the code inserted: the new id and the values it sent. */
export type InsertedRow = { id: number; params: any[] };

// The tables whose inserts the fake answers with a new id.
const INSERT_TABLES = ["classifications", "extracts", "decisions", "claims", "groupings", "articles", "digests"];

/** A database in memory, shaped like the pool the store functions take. */
export class FakeDatabase {
  readings: StoredReading[] = [];
  queries: { sql: string; params: any[] }[] = [];
  transactionLog: string[] = [];
  inserted: Record<string, InsertedRow[]> = {};
  settings: Settings | null = null;
  private nextId = 100;
  private handlers: Handler[] = [];

  /** The pool to hand to the code under test. */
  readonly pool = { query: (sql: string, params: any[] = []) => this.run(sql, params), connect: async () => ({ query: (sql: string, params: any[] = []) => this.run(sql, params), release: () => {} }) } as unknown as pg.Pool;

  /**
   * Starts with the starting settings, so a decision can be made.
   *
   * @param fighters  The fighters whose digest schedule the settings hold.
   */
  constructor(fighters: string[] = []) {
    this.settings = { version: 1, classifier_version: "v7.7", tiers: startingTierMap(), digest_schedule: startingSchedule(fighters) };
  }

  /**
   * Answers every later query that matches, ahead of the built-in answers.
   *
   * @param pattern  What the SQL must match.
   * @param answer  Given the values the code sent, the rows to return.
   */
  on(pattern: RegExp, answer: (params: any[], sql: string) => QueryAnswer): void {
    this.handlers.unshift({ pattern, answer });
  }

  /**
   * Puts a reading at a stage.
   *
   * @param fields  Any fields to set; the rest are filled in.
   * @returns The stored reading.
   */
  addReading(fields: Partial<StoredReading> & { id: number }): StoredReading {
    const reading: StoredReading = {
      fighter: "Marko Testov", article_id: fields.id * 10, headline: `Headline ${fields.id}`, outlet: "Example News", url: `https://example.com/${fields.id}`,
      published_at: new Date("2026-10-05T12:00:00Z"), body: "The article's body.", backfill: false,
      stage: "classify", attempts: 0, last_error: null, stuck_from: null,
      ...fields,
    };
    this.readings.push(reading);
    return reading;
  }

  /**
   * One reading by id.
   *
   * @param readingId  The id.
   * @returns The stored reading.
   */
  reading(readingId: number): StoredReading {
    const found = this.readings.find((reading) => reading.id === readingId);
    if (!found) throw new Error(`the fake has no reading ${readingId}`);
    return found;
  }

  /**
   * Records an answer a station gave earlier, for a later station to read back.
   *
   * @param table  "classifications" or "extracts".
   * @param readingId  The reading.
   * @param version  The station's version.
   * @param answers  Its answers.
   * @returns The row's id.
   */
  seedAnswer(table: "classifications" | "extracts", readingId: number, version: string, answers: unknown): number {
    const id = this.nextId++;
    (this.inserted[table] ??= []).push({ id, params: [readingId, version, answers, {}] });
    return id;
  }

  /**
   * The SQL texts sent so far that match a pattern.
   *
   * @param pattern  What to look for.
   * @returns The matching queries, in the order sent.
   */
  sent(pattern: RegExp): { sql: string; params: any[] }[] {
    return this.queries.filter((query) => pattern.test(query.sql));
  }

  /**
   * Answers one query.
   *
   * @param sql  The SQL.
   * @param params  The values the code sent.
   * @returns The rows, as pg gives them.
   */
  private async run(sql: string, params: any[]): Promise<any> {
    this.queries.push({ sql, params });
    const answer = this.answerFor(sql, params);
    return { rows: answer.rows, rowCount: answer.rowCount ?? answer.rows.length };
  }

  /**
   * Finds the answer: a handler from a spec first, then the built-in ones.
   *
   * @param sql  The SQL.
   * @param params  The values the code sent.
   * @returns The rows to return.
   */
  private answerFor(sql: string, params: any[]): QueryAnswer {
    const handler = this.handlers.find((candidate) => candidate.pattern.test(sql));
    if (handler) return handler.answer(params, sql);
    const text = sql.trim();

    // Transaction boundaries are only logged.
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) {
      this.transactionLog.push(text);
      return { rows: [] };
    }

    // The readings waiting at a stage, oldest article first.
    if (/FROM readings r JOIN articles a/.test(text)) {
      const waiting = this.readings.filter((reading) => reading.stage === params[0]);
      waiting.sort((first, second) => first.published_at.getTime() - second.published_at.getTime() || first.id - second.id);
      return { rows: waiting.map((reading) => ({ ...reading })) };
    }

    // A failed attempt: counted, and the reading stuck once the count reaches the threshold the code sent.
    if (/^UPDATE readings\s+SET attempts = attempts \+ 1/.test(text)) {
      const [error, stuckAfter, readingId, stage] = params;
      const reading = this.readings.find((candidate) => candidate.id === readingId && candidate.stage === stage);
      if (!reading) return { rows: [] };
      reading.attempts += 1;
      reading.last_error = error;
      if (reading.attempts >= stuckAfter) {
        reading.stuck_from = reading.stage;
        reading.stage = "stuck";
      }
      return { rows: [{ stage: reading.stage }] };
    }

    // An answer's move to the next stage, only for a reading still at the stage it is leaving.
    if (/^UPDATE readings SET stage = \$1, attempts = 0/.test(text)) {
      const [nextStage, readingId, stage] = params;
      const reading = this.readings.find((candidate) => candidate.id === readingId && candidate.stage === stage);
      if (!reading) return { rows: [], rowCount: 0 };
      reading.stage = nextStage;
      reading.attempts = 0;
      reading.last_error = null;
      return { rows: [], rowCount: 1 };
    }

    // A station's latest answer for a reading.
    const latest = text.match(/^SELECT id, version, answers FROM (\w+) WHERE reading_id/);
    if (latest) {
      const rows = (this.inserted[latest[1]] ?? []).filter((row) => row.params[0] === params[0]);
      const newest = rows[rows.length - 1];
      return newest ? { rows: [{ id: newest.id, version: newest.params[1], answers: newest.params[2] }] } : { rows: [] };
    }

    // The claims a reading could join: none, unless a spec says otherwise.
    if (/WITH recent AS/.test(text)) return { rows: [] };

    // The claims due to post: none, unless a spec says otherwise.
    if (/WITH first_tier_one AS/.test(text)) return { rows: [] };

    // Marking a digest as posted needs no answer; a spec reads the query.
    if (/^UPDATE digests SET posted_at/.test(text)) return { rows: [], rowCount: 1 };

    // Today's counts report: already sent, so a run's result does not depend on the clock.
    if (/FROM daily_reports WHERE day/.test(text)) return { rows: [{ text: "already sent", posted_at: new Date() }] };

    // The newest settings.
    if (/FROM settings ORDER BY version/.test(text)) return this.settings ? { rows: [this.settings] } : { rows: [] };

    // An insert into a table that hands back a new id.
    const insert = text.match(/^INSERT INTO (\w+)/);
    if (insert && INSERT_TABLES.includes(insert[1])) {
      const id = this.nextId++;
      (this.inserted[insert[1]] ??= []).push({ id, params });
      return { rows: [{ id }] };
    }

    // Inserts that need no answer.
    if (insert) {
      (this.inserted[insert[1]] ??= []).push({ id: 0, params });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`the fake database does not know this query: ${text.slice(0, 120)}`);
  }
}

/** A run context built on a fake database, with every message it posts collected. */
export type TestContext = RunContext & { messages: string[] };

/**
 * A run context for a spec: a fake database, no feed, a poster that collects its messages.
 *
 * @param database  The fake database.
 * @param overrides  Any context fields to change.
 * @returns The context, with `messages` holding what the poster was given.
 */
export function makeContext(database: FakeDatabase, overrides: Partial<RunContext> = {}): TestContext {
  const messages: string[] = [];
  let nextMessageId = 5000;
  const context: TestContext = {
    pool: database.pool, feed: null, keys: { jev: "jev-key", openrouter: "openrouter-key", gemini: "gemini-key" }, subjects: [],
    backfill: false, importDays: 3, importLimit: null, deadline: Date.now() + 600_000,
    poster: async (text) => {
      messages.push(text);
      return nextMessageId++;
    },
    readsReactions: false, sends: true, tally: {}, messages,
    ...overrides,
  };
  return context;
}

/** One request the network stand-in saw. */
export type SeenRequest = { url: string; headers: Record<string, string>; body: any };

/**
 * Replaces fetch for a spec. The answer function sees every request and returns a status and a JSON body.
 *
 * @param answer  Given the request, the reply.
 * @returns The requests seen so far, and a function that puts the real fetch back.
 */
export function stubNetwork(answer: (request: SeenRequest) => { status?: number; body: unknown }): { requests: SeenRequest[]; restore: () => void } {
  const realFetch = globalThis.fetch;
  const requests: SeenRequest[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request: SeenRequest = { url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : null };
    requests.push(request);
    const reply = answer(request);
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status ?? 200 });
  }) as typeof fetch;
  return { requests, restore: () => { globalThis.fetch = realFetch; } };
}

/**
 * JEV's reply to the classifier's questions, answering each the way the options name.
 *
 * @param answers  The options to give; the rest are filled in as "main_subject" about him, nothing else reported.
 * @param inputTokens  The input tokens JEV reports using.
 * @returns A reply the classifier accepts.
 */
export function jevClassification(answers: { fact: string; firmness: number } = { fact: "result", firmness: 3 }, inputTokens = 1234): unknown {
  const choice = (option: string) => ({ type: "choice", choice: option, probabilities: { [option]: 0.9, none_of_these: 0.1 } });
  const flag = (value: boolean) => ({ type: "noul", noul: value ? 1 : 0 });
  const reply: Record<string, unknown> = {
    centrality: { type: "score", score: 3 },
    source: choice("media"),
    act: choice("reports_an_event"),
    fact: choice(answers.fact),
    firmness: { type: "score", score: answers.firmness },
    reports_his_result: flag(answers.fact === "result"),
    reports_his_next_fight: flag(answers.fact === "next_fight"),
    reports_his_health: flag(answers.fact === "health"),
    he_speaks: flag(false),
  };

  // The extra "h_" yes/no questions JEV is also asked are answered no.
  for (const [question, definition] of Object.entries(QUESTIONS as Record<string, { type: string }>)) {
    if (question in reply) continue;
    if (definition.type !== "noul") throw new Error(`the fixture does not answer the question "${question}"`);
    reply[question] = flag(false);
  }
  return { answers: reply, usage: { input_tokens: inputTokens } };
}

/**
 * The OpenRouter chat reply the extractor reads: an extract as the message, and a cost.
 *
 * @param claim  The extract's claim sentence.
 * @param cost  The dollars OpenRouter reports.
 * @returns A reply the extractor accepts.
 */
export function openRouterExtract(claim = "Marko Testov will fight Ivan Rivalov at UFC 400.", cost = 0.000123): unknown {
  const extract = { kind: "new_event", claim, occasion: "UFC announcement", actor: null, opponent: "Ivan Rivalov", event: "UFC 400", date: null };
  return { choices: [{ message: { content: JSON.stringify(extract) } }], usage: { cost } };
}
