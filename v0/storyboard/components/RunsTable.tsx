// A table of runs: the headline numbers as columns, everything else folded
// into the run's whole counts.

import { dollars, failures, pacificTime } from "../lib/format.ts";
import { Json } from "./bits.tsx";

/** A row of the runs table. */
export type RunRow = { id: string; kind: string; started_at: Date; finished_at: Date | null; seconds: number | null; counts: Record<string, unknown> };

/** The counts shown as columns of their own, in this order. */
const HEADLINE_COUNTS = ["imported", "classify_done", "new_claims", "joins", "tier_1", "tier_2", "tier_3", "posted"];

/**
 * The runs table.
 *
 * @param props.runs  The runs, newest first.
 * @returns The table.
 */
export function RunsTable({ runs }: { runs: RunRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>run</th>
          <th>kind</th>
          <th>started</th>
          <th className="num">seconds</th>
          {HEADLINE_COUNTS.map((name) => (
            <th key={name} className="num">
              {name}
            </th>
          ))}
          <th>failures</th>
          <th className="num">JEV tokens in</th>
          <th className="num">OpenRouter</th>
          <th>all counts</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <RunLine key={run.id} run={run} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * One run's row.
 *
 * @param props.run  The run.
 * @returns The row.
 */
function RunLine({ run }: { run: RunRow }) {
  const failed = Object.entries(failures(run.counts));
  return (
    <tr>
      <td>#{run.id}</td>
      <td>{run.kind}</td>
      <td className="nowrap">{pacificTime(run.started_at)}</td>
      <td className="num">{run.seconds === null ? (run.finished_at ? "" : "running?") : run.seconds.toFixed(1)}</td>
      {HEADLINE_COUNTS.map((name) => (
        <td key={name} className="num">
          {typeof run.counts[name] === "number" ? String(run.counts[name]) : ""}
        </td>
      ))}
      <td>
        {failed.map(([name, count]) => (
          <span key={name} className="tag bad">
            {name} {count}
          </span>
        ))}
      </td>
      <td className="num">{typeof run.counts.jev_input_tokens === "number" ? run.counts.jev_input_tokens.toLocaleString("en-US") : ""}</td>
      <td className="num">{dollars(run.counts.openrouter_cost_microdollars)}</td>
      <td>
        <details>
          <summary className="small muted">show</summary>
          <Json value={run.counts} />
        </details>
      </td>
    </tr>
  );
}
