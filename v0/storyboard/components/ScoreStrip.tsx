// The one-line strip on the claims list (scoreboard D1): the live numbers,
// all time always (D5), as counts only, linking to the scores page. It reads
// the same function as that page, so the two cannot disagree.

import Link from "next/link";
import { liveScores } from "../lib/live-scores.ts";

/**
 * The strip, read from the database when the list loads.
 *
 * @returns One line of counts.
 */
export async function ScoreStrip() {
  const live = await liveScores(null);
  const parts = [
    `over-merge ${live.overMerge.count} of ${live.overMerge.of} articles`,
    `over-split ${live.overSplit.count} of ${live.overSplit.of} stories`,
    `wrong tier ${live.wrongTier.count} of ${live.wrongTier.of} judged`,
    `tier-1 repeats ${live.repeats.count} of ${live.repeats.of} posts`,
    `👎 ${live.thumbsDown.count} of ${live.thumbsDown.of} messages`,
    `events not posted ${live.events.notPosted.count} of ${live.events.notPosted.of}`,
  ];
  return (
    <p className="score-strip small">
      <span className="muted">Scores, all time:</span> {parts.join(" · ")} · <Link href="/scores">scores →</Link>
    </p>
  );
}
