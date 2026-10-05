// Digests: each fighter's digest, its text as written, the items the writer
// listed, and which of the claims it was given it used or left out.

import Link from "next/link";
import { Empty, Json } from "../../components/bits.tsx";
import { FeedbackForm } from "../../components/FeedbackForm.tsx";
import { FeedbackList } from "../../components/FeedbackList.tsx";
import { query } from "../../lib/db.ts";
import { param, type Params } from "../../lib/filters.ts";
import { pacificTime } from "../../lib/format.ts";
import { fighterNames, type FeedbackRow } from "../../lib/queries.ts";
import { schemaFrom, schemaSuffix, type Schema } from "../../lib/schema.ts";

/** A row of the digests table. */
type DigestRow = { id: string; fighter: string; period_start: Date; period_end: Date; model: string; prompt_version: string; text: string; items: unknown; posted_at: Date | null; backfill: boolean; created_at: Date };

/** A claim the writer was given, with whether it used it. */
type GivenClaim = { digest_id: string; claim_id: string; used: boolean; current_label: string; readings: string; outlets: string };

/**
 * The digests page.
 *
 * @param props.searchParams  ?fighter=… and ?schema=replay, if any.
 * @returns The page.
 */
export default async function DigestsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const schema = schemaFrom(params.schema);
  const fighter = param(params, "fighter");

  // The digests, newest period first, then the claims and feedback of all of them at once.
  const digests = await query<DigestRow>(
    schema,
    "SELECT id, fighter, period_start, period_end, model, prompt_version, text, items, posted_at, backfill, created_at FROM digests WHERE ($1 = '' OR fighter = $1) ORDER BY period_end DESC, id DESC LIMIT 100",
    [fighter],
  );
  const ids = digests.map((digest) => digest.id);
  const [given, feedback, fighters] = await Promise.all([
    query<GivenClaim>(
      schema,
      `SELECT dc.digest_id, dc.claim_id, dc.used, cn.current_label, cn.readings, cn.outlets
       FROM digest_claims dc JOIN claim_now cn ON cn.id = dc.claim_id
       WHERE dc.digest_id = ANY($1::bigint[]) ORDER BY dc.used DESC, cn.readings DESC`,
      [ids],
    ),
    query<FeedbackRow>(schema, "SELECT * FROM feedback WHERE digest_id = ANY($1::bigint[]) ORDER BY id DESC", [ids]),
    fighterNames(schema),
  ]);

  return (
    <>
      <h1>Digests</h1>
      <form className="filters" method="get">
        {schema === "replay" && <input type="hidden" name="schema" value="replay" />}
        <label>
          fighter
          <select name="fighter" defaultValue={fighter}>
            <option value="">any</option>
            {fighters.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="primary">
          filter
        </button>
      </form>
      {digests.length === 0 && <Empty>No digests yet. The Digest writer (8) writes one per fighter on his schedule (see Settings).</Empty>}
      {digests.map((digest) => (
        <DigestCard
          key={digest.id}
          digest={digest}
          given={given.filter((claim) => claim.digest_id === digest.id)}
          feedback={feedback.filter((row) => row.digest_id === digest.id)}
          schema={schema}
        />
      ))}
    </>
  );
}

/**
 * One digest: its header, its text, its items, the claims used and left out, and feedback.
 *
 * @param props.digest  The digest.
 * @param props.given  The claims it was given.
 * @param props.feedback  Feedback on it.
 * @param props.schema  Kept on links.
 * @returns The card.
 */
function DigestCard({ digest, given, feedback, schema }: { digest: DigestRow; given: GivenClaim[]; feedback: FeedbackRow[]; schema: Schema }) {
  const used = given.filter((claim) => claim.used);
  const leftOut = given.filter((claim) => !claim.used);
  return (
    <section className="claim">
      <h2>
        #{digest.id} {digest.fighter}{" "}
        <span className="muted small">
          {pacificTime(digest.period_start)} → {pacificTime(digest.period_end)} · {digest.model} · prompt {digest.prompt_version} ·{" "}
          {digest.posted_at ? `posted ${pacificTime(digest.posted_at)}` : "not posted"}
          {digest.backfill ? " · archive" : ""}
        </span>
      </h2>
      <div className="pre">{digest.text}</div>
      <h3>Used ({used.length})</h3>
      <ClaimList claims={used} schema={schema} />
      <h3>Left out ({leftOut.length})</h3>
      <ClaimList claims={leftOut} schema={schema} />
      <details>
        <summary className="small muted">the items the writer listed</summary>
        <Json value={digest.items} />
      </details>
      <FeedbackForm target="digest" id={digest.id} schema={schema} fields={["digest", "digest.text", "digest.left_out", "digest.used"]} label="feedback on this digest" />
      {feedback.length > 0 && <FeedbackList rows={feedback} />}
    </section>
  );
}

/**
 * A short list of claims with their size.
 *
 * @param props.claims  The claims.
 * @param props.schema  Kept on links.
 * @returns The list, or "none".
 */
function ClaimList({ claims, schema }: { claims: GivenClaim[]; schema: Schema }) {
  if (claims.length === 0) return <p className="muted small">none</p>;
  return (
    <ul>
      {claims.map((claim) => (
        <li key={claim.claim_id}>
          <Link href={`/claims/${claim.claim_id}${schemaSuffix(schema)}`}>#{claim.claim_id}</Link> {claim.current_label}{" "}
          <span className="muted small">
            ({claim.readings} readings, {claim.outlets} outlets)
          </span>
        </li>
      ))}
    </ul>
  );
}
