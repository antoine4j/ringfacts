// One slice on the scores page: a count and its share, no interval
// (scoreboard D9), greyed out when fewer than 30 were counted.

import { countWithShare } from "../lib/format.ts";
import { isThin, THIN_BELOW, type Share } from "../lib/scores.ts";
import { Explain } from "./ScoreCard.tsx";

/**
 * A slice as a table row.
 *
 * @param props.name  The number's name, such as "Over-merge".
 * @param props.share  How many of how many; null when it is not measured yet.
 * @param props.unit  What is counted, such as "articles".
 * @param props.explain  How it is measured, and its weakness.
 * @returns The row.
 */
export function ScoreRow({ name, share, unit, explain }: { name: string; share: Share | null; unit: string; explain: { how: string; weakness: string } }) {
  const isGrey = share === null || isThin(share);
  return (
    <tr className={isGrey ? "dim" : ""}>
      <th scope="row">{name}</th>
      <td className="num nowrap">{share ? `${countWithShare(share.count, share.of)} ${unit}` : "not measured yet"}</td>
      <td>
        {share && isThin(share) && <p className="small">Fewer than {THIN_BELOW} counted: too few to read as a rate.</p>}
        <Explain how={explain.how} weakness={explain.weakness} />
      </td>
    </tr>
  );
}
