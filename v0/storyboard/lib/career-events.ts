// The hand-kept list of career events (scoreboard D2, design §3): what is
// known to have happened to the watched fighters, kept in
// v0/pipeline/measure/career-events.json and changed by commit. The list holds
// facts only; what the bot did with each event is worked out here from the
// database, never typed.
// Design: docs/superpowers/specs/2026-10-09-precision-scoreboard-design.md, §3.

import file from "../../pipeline/measure/career-events.json" with { type: "json" };

/** G1's six kinds of career event. */
export const EVENT_KINDS = ["booked", "result", "withdrawal", "return_date", "retirement", "contract"] as const;

/** One kind of career event. */
export type EventKind = (typeof EVENT_KINDS)[number];

/** One event on the list. */
export type CareerEvent = {
  id: string;
  fighter: string;
  kind: EventKind;
  happened: string;
  what: string;
  first_report: string;
  claim_ids: number[];
  note: string;
};

/** The list file: when it was last checked, how, and the events. */
export type CareerEventsFile = { checked: string; how: string; events: CareerEvent[] };

/** What the database says about one claim an event names. */
export type ClaimFacts = {
  tier: "post" | "digest" | "drop" | null;
  posted: boolean;
  inPostedDigest: boolean;
  digestStillDue: boolean;
};

/** Why the group never heard an event. */
export type MissCause = "never_found" | "not_decided" | "tier_3_drop" | "digest_omission" | "waiting_for_digest";

/** What happened to an event: posted as tier 1, heard late through a digest, or not heard at all. */
export type EventStatus = { status: "posted" } | { status: "late" } | { status: "missed"; cause: MissCause };

/**
 * Whether a value is a calendar day written YYYY-MM-DD.
 *
 * @param value  Anything.
 * @returns True for a real day, such as "2026-10-04"; false for "2026-02-30".
 */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/**
 * The problems with one event, each as a sentence.
 *
 * @param event  One entry of the file's events.
 * @param index  Its place in the list, for the messages.
 * @returns The problems; [] when the event is good.
 */
function eventProblems(event: Record<string, unknown>, index: number): string[] {
  const problems: string[] = [];
  const name = `event ${index} (${String(event.id)})`;

  // The text fields are strings, the id is not empty.
  for (const field of ["id", "fighter", "what", "first_report", "note"]) {
    if (typeof event[field] !== "string") problems.push(`${name}: ${field} is not text`);
  }
  if (event.id === "") problems.push(`${name}: id is empty`);

  // The kind is one of G1's six, the day is real, the claims are whole numbers.
  if (!EVENT_KINDS.includes(event.kind as EventKind)) problems.push(`${name}: kind "${String(event.kind)}" is not one of ${EVENT_KINDS.join(", ")}`);
  if (!isDay(event.happened)) problems.push(`${name}: happened "${String(event.happened)}" is not a day`);
  const claimIds = event.claim_ids;
  if (!Array.isArray(claimIds) || !claimIds.every((claimId) => Number.isInteger(claimId))) problems.push(`${name}: claim_ids is not a list of claim numbers`);
  return problems;
}

/**
 * The problems with the list file, each as a sentence.
 *
 * @param data  The parsed file.
 * @returns The problems; [] when the file is good.
 */
export function validateEvents(data: unknown): string[] {
  const list = data as Record<string, unknown>;
  const problems: string[] = [];

  // The header: the day of the last check, and how it was done.
  if (!isDay(list?.checked)) problems.push(`checked "${String(list?.checked)}" is not a day`);
  if (typeof list?.how !== "string") problems.push("how is not text");
  if (!Array.isArray(list?.events)) return [...problems, "events is not a list"];

  // Each event on its own, then the ids across them.
  const events = list.events as Record<string, unknown>[];
  events.forEach((event, index) => problems.push(...eventProblems(event, index)));
  const ids = events.map((event) => event.id);
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
  for (const id of new Set(repeated)) problems.push(`id "${String(id)}" is used more than once`);
  return problems;
}

/**
 * The list as committed, checked first.
 *
 * @returns The file's content.
 */
export function careerEvents(): CareerEventsFile {
  const problems = validateEvents(file);
  if (problems.length > 0) throw new Error(`career-events.json: ${problems.join("; ")}`);
  return file as CareerEventsFile;
}

/**
 * The events that happened in a period, ends included.
 *
 * @param events  The list's events.
 * @param from  The first day, or null for no start.
 * @param to  The last day, or null for no end.
 * @returns The events in the period.
 */
export function eventsInPeriod(events: CareerEvent[], from: string | null, to: string | null): CareerEvent[] {
  return events.filter((event) => (!from || event.happened >= from) && (!to || event.happened <= to));
}

/**
 * What the bot did with one event, from the facts of the claims it names.
 * A tier-1 post anywhere wins; then a posted digest (late); otherwise the
 * group never heard it, and the cause is the furthest any claim got.
 *
 * @param event  The event.
 * @param facts  Claim id → its facts, for every claim the events name that exists.
 * @returns The status, and for a miss its cause.
 */
export function eventStatus(event: CareerEvent, facts: Map<number, ClaimFacts>): EventStatus {
  const claims = event.claim_ids.map((claimId) => facts.get(claimId)).filter((claim): claim is ClaimFacts => claim !== undefined);

  // Heard: posted as tier 1, or only in a digest.
  if (claims.some((claim) => claim.posted)) return { status: "posted" };
  if (claims.some((claim) => claim.inPostedDigest)) return { status: "late" };

  // Not heard: why, from the claim that got furthest.
  const reachesDigest = claims.filter((claim) => claim.tier === "post" || claim.tier === "digest");
  if (claims.length === 0) return { status: "missed", cause: "never_found" };
  if (reachesDigest.some((claim) => claim.digestStillDue)) return { status: "missed", cause: "waiting_for_digest" };
  if (reachesDigest.length > 0) return { status: "missed", cause: "digest_omission" };
  if (claims.some((claim) => claim.tier === null)) return { status: "missed", cause: "not_decided" };
  return { status: "missed", cause: "tier_3_drop" };
}

/**
 * Every claim id the events name, for one query of their facts.
 *
 * @param events  The events.
 * @returns The ids, each once.
 */
export function namedClaimIds(events: CareerEvent[]): number[] {
  return [...new Set(events.flatMap((event) => event.claim_ids))];
}
