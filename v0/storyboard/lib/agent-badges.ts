// The badges a reading or same-claim call carries on the page: how many of
// the judges made the call. Kept apart from agent-marks.ts, which reads the
// calls file with node:fs and so cannot be bundled into a client component.

import type { AgentReadingCall, SamePanel } from "./agent-marks.ts";

/**
 * The badge on a reading call: "3/3", "2/3" or "split"; nothing for a single-judge call.
 *
 * @param call  The reading call.
 * @returns The badge text, or null.
 */
export function agreementBadge(call: Pick<AgentReadingCall, "panel">): string | null {
  const panel = call.panel;
  if (!panel) return null;
  if (panel.agreement === "split") return "split";
  return `${panel.agreeing}/${panel.judges}`;
}

/**
 * The badge on a same-claim call: how many of the judges made it.
 *
 * @param call  The same-claim call.
 * @returns "2/3", or null for a single-judge call.
 */
export function sameBadge(call: Pick<SamePanel, "calls" | "judges">): string {
  return `${call.calls.length}/${call.judges}`;
}
