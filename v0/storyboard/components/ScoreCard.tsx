// One headline number on the scores page: its count, its share, its Wilson
// 95% range (scoreboard D9: headline numbers only), whether it meets its bar,
// and the method and weakness in a visitor's words (D10).

import type { ReactNode } from "react";
import { countWithShare, intervalWords } from "../lib/format.ts";
import type { Share } from "../lib/scores.ts";
import { wilson } from "../lib/wilson.ts";

/** What a headline card shows. */
type Props = {
  title: string;
  share: Share;
  unit: string;
  bar: { words: string; met: boolean } | null;
  lines?: ReactNode[];
  explain: { how: string; weakness: string };
};

/**
 * A headline number as a card.
 *
 * @param props.title  The number's name, such as "Repeats in tier 1".
 * @param props.share  How many of how many.
 * @param props.unit  What is counted, such as "posts", after the count.
 * @param props.bar  The bar it is held to and whether it meets it; null when there is none.
 * @param props.lines  Further lines under the number, such as the outcomes behind it.
 * @param props.explain  How it is measured, and its weakness.
 * @returns The card.
 */
export function ScoreCard({ title, share, unit, bar, lines = [], explain }: Props) {
  const range = intervalWords(wilson(share.count, share.of));
  const isEmpty = share.of === 0;
  return (
    <section className="score-card">
      <h3>{title}</h3>
      <p className="score-number num">
        {countWithShare(share.count, share.of)} <span className="score-unit">{unit}</span>
      </p>
      {range && <p className="small muted num">{range}</p>}
      {bar && <BarVerdict words={bar.words} met={bar.met} isEmpty={isEmpty} />}
      {lines.map((line, index) => (
        <p key={index} className="small">
          {line}
        </p>
      ))}
      <Explain how={explain.how} weakness={explain.weakness} />
    </section>
  );
}

/**
 * Whether a number meets its bar, or that there was nothing to judge.
 *
 * @param props.words  The bar, such as "none" or "at most 1 in 10".
 * @param props.met  Whether the number meets it.
 * @param props.isEmpty  Whether nothing was counted in the period.
 * @returns The verdict tag.
 */
function BarVerdict({ words, met, isEmpty }: { words: string; met: boolean; isEmpty: boolean }) {
  if (isEmpty) return <p className="small"><span className="tag">bar: {words} · nothing to judge in this period</span></p>;
  return (
    <p className="small">
      <span className={`tag ${met ? "good" : "bad"}`}>{met ? "✓ meets" : "✕ misses"} the bar: {words}</span>
    </p>
  );
}

/**
 * A number's method and weakness, in two short lines.
 *
 * @param props.how  How it is measured.
 * @param props.weakness  What it cannot see.
 * @returns The lines.
 */
export function Explain({ how, weakness }: { how: string; weakness: string }) {
  return (
    <div className="explain small">
      <p>
        <b>How:</b> {how}
      </p>
      <p>
        <b>Weakness:</b> {weakness}
      </p>
    </div>
  );
}
