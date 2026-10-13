// The scores page's two live sections: the launch bar (three headline cards)
// and grooming (slices from the review marks), with the versions behind them.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §6.

import Link from "next/link";
import type { MissCause } from "../lib/career-events.ts";
import type { LiveScores } from "../lib/live-scores.ts";
import { EXPLAIN, type VersionsInForce } from "../lib/scores.ts";
import { shortTime } from "../lib/format.ts";
import { ScoreCard } from "./ScoreCard.tsx";
import { ScoreRow } from "./ScoreRow.tsx";

/** Why an event was never heard, in words. */
const CAUSE_WORDS: Record<MissCause, string> = {
  never_found: "never found",
  not_decided: "not decided yet",
  tier_3_drop: "dropped (tier 3)",
  digest_omission: "left out of the digest",
  waiting_for_digest: "waiting for the digest",
};

/**
 * The launch bar: the three numbers the friends' group waits on.
 *
 * @param props.live  The period's live numbers.
 * @param props.last14  A link to the same page over the last 14 days.
 * @returns The section.
 */
export function LaunchBarSection({ live, last14 }: { live: LiveScores; last14: string }) {
  const { events, repeats, thumbsDown } = live;
  const causes = Object.entries(events.causes).map(([cause, count]) => `${count} ${CAUSE_WORDS[cause as MissCause]}`);
  return (
    <section>
      <h2>The launch bar</h2>
      <p className="small muted">
        The bar the bot must clear before friends join the group, judged over the last 14 days: <Link href={last14}>show the last 14 days</Link>.
      </p>
      <div className="score-cards">
        <ScoreCard
          title="Career events not posted"
          share={events.notPosted}
          unit="events"
          bar={{ words: "none", met: events.notPosted.count === 0 }}
          lines={[
            `${events.posted} posted · ${events.late} late, only in a digest · ${events.missed} missed${causes.length ? ` (${causes.join(", ")})` : ""}`,
            `List last checked ${events.checked}${events.listIsBehind ? "; events after that are not counted" : ""}.`,
          ]}
          explain={EXPLAIN.events_not_posted}
        />
        <ScoreCard title="Repeats in tier 1" share={repeats} unit="posts" bar={{ words: "none", met: repeats.count === 0 }} explain={EXPLAIN.tier1_repeats} />
        <ScoreCard
          title="Posts and digests with a 👎"
          share={thumbsDown}
          unit="messages"
          bar={{ words: "at most 1 in 10", met: thumbsDown.count * 10 <= thumbsDown.of }}
          lines={[`${thumbsDown.unreacted} of ${thumbsDown.of} without a reaction.`]}
          explain={EXPLAIN.thumbs_down}
        />
      </div>
    </section>
  );
}

/**
 * Grooming: how well the bot groups articles into stories, from the review marks.
 *
 * @param props.live  The period's live numbers.
 * @returns The section.
 */
export function GroomingSection({ live }: { live: LiveScores }) {
  return (
    <section>
      <h2>Grouping articles into stories</h2>
      <p className="small muted">
        Over the {live.sealed} stories reviewed in full, chosen by hand, not drawn at random. {live.reopened} more were reviewed and then gained new articles, so
        they are left out until those are reviewed too.
      </p>
      <table className="score-rows">
        <tbody>
          <ScoreRow name="Over-merge" share={live.overMerge} unit="articles" explain={EXPLAIN.over_merge} />
          <ScoreRow name="Over-split" share={live.overSplit} unit="stories" explain={EXPLAIN.over_split} />
          <ScoreRow name="Wrong tier" share={null} unit="stories" explain={EXPLAIN.wrong_tier} />
        </tbody>
      </table>
    </section>
  );
}

/**
 * The versions behind the live numbers, and a warning when they changed inside the period (scoreboard D6).
 *
 * @param props.versions  From versionsInForce.
 * @returns The line, and the warning when there is one.
 */
export function VersionsLine({ versions }: { versions: VersionsInForce }) {
  const { inForce, mixed } = versions;
  return (
    <>
      <p className="small muted">
        Versions in force: classifier {inForce.classifier ?? "none"} · grouping {inForce.grouping ?? "none"} · settings {inForce.settings ?? "none"}
      </p>
      {mixed.map((station) => (
        <p key={station.station} className="small message warn">
          The {station.station} changed in this period: {station.versions.map((one) => `${one.version} from ${shortTime(one.firstUsed).split(" ").slice(0, 2).join(" ")}`).join(", then ")}. These
          numbers mix them; pick a period inside one version to see one.
        </p>
      ))}
    </>
  );
}
