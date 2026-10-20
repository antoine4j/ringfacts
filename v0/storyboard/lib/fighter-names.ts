// The name stems the pipeline looks for in an article to say it names a
// fighter: watchlist.js's matchNames, read here so the pages and the pipeline
// never disagree about them.

import { SUBJECTS } from "../../../watchlist.js";

/**
 * A fighter's name stems.
 *
 * @param fighter  The fighter's name, as the readings table has it.
 * @returns Its stems; none when the fighter is not on the watchlist.
 */
export function nameStemsOf(fighter: string): string[] {
  return SUBJECTS.find((subject) => subject.name === fighter)?.matchNames ?? [];
}
