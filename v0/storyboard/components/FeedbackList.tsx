// The feedback already given on one reading, claim or digest.

import { pacificTime } from "../lib/format.ts";
import type { FeedbackRow } from "../lib/queries.ts";

/**
 * A table of feedback rows, or a line saying there are none.
 *
 * @param props.rows  The rows, newest first.
 * @returns The table.
 */
export function FeedbackList({ rows }: { rows: FeedbackRow[] }) {
  if (rows.length === 0) return <p className="muted small">No feedback yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>when</th>
          <th>answer</th>
          <th>should be</th>
          <th>note</th>
          <th>by</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="nowrap">{pacificTime(row.created_at)}</td>
            <td>{row.field}</td>
            <td>{row.should_be ?? <span className="muted">(comment)</span>}</td>
            <td className="pre">{row.note}</td>
            <td>{row.author}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
