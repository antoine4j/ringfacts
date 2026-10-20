// The watchlist's shape, for TypeScript code that reads watchlist.js (the
// v0 storyboard). The list itself, and why each name is spelled as it is,
// stay in watchlist.js.

/** One watched fighter. */
export type Subject = {
  /** The fighter's name; also the key in every table. */
  name: string;
  /** Search queries for Google News, one per edition. */
  aliases: { query: string; edition: string }[];
  /** Surname stems that say an article names this fighter. */
  matchNames: string[];
  /** Who could be mistaken for this fighter, for the matcher's prompt. */
  confusables?: string;
};

export declare const SUBJECTS: Subject[];
