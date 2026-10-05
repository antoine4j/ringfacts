// What one run carries from step to step: its connections, keys, deadline,
// how it posts, and the counts it adds up for the runs table.

import type pg from "pg";
import type { Subject } from "../store/import.ts";

/** Sends one message; returns its Telegram id, or null when it only printed. */
export type Poster = (text: string) => Promise<number | null>;

/** Everything a run needs, shared by its steps. */
export type RunContext = {
  pool: pg.Pool;
  feed: pg.Pool | null;
  keys: { jev: string; openrouter: string; gemini: string };
  subjects: Subject[];
  backfill: boolean;
  importDays: number | null;
  importLimit: number | null;
  deadline: number;
  poster: Poster;
  readsReactions: boolean;
  /** True when the poster really sends to Telegram, not just prints. */
  sends: boolean;
  tally: Record<string, number>;
  /** Stages that wait for the rest of this run, because a vendor's daily allowance is spent. */
  paused?: Set<string>;
};

/**
 * Adds to one of the run's counts.
 *
 * @param context  The run.
 * @param name  The count's name.
 * @param amount  How much to add.
 */
export function count(context: RunContext, name: string, amount = 1): void {
  context.tally[name] = (context.tally[name] ?? 0) + amount;
}
