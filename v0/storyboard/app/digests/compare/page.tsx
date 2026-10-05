// The digest models side by side (task 0.5, D25): one fighter's past week as
// each model wrote it, in columns labelled A, B, C so the writing is judged
// before the name; "show models" reveals them. "Best" marks the week's pick,
// and the top line tallies every pick so far by model.

import Link from "next/link";
import { PickBest } from "../../../components/PickBest.tsx";
import { Empty } from "../../../components/bits.tsx";
import { query } from "../../../lib/db.ts";
import { param, type Params } from "../../../lib/filters.ts";
import { pacificTime } from "../../../lib/format.ts";
import { schemaFrom, schemaSuffix } from "../../../lib/schema.ts";
import { safeTelegramHtml } from "../../../lib/telegram-html.ts";

/** One archive digest, with what it cost and whether it is its week's pick. */
type WeekDigest = { id: string; model: string; text: string; items: number; cost: number | null; picked: boolean };

/** A fighter's week that has archive digests, and whether a pick was made. */
type Week = { fighter: string; period_end: Date; models: number; picked: boolean };

/**
 * A stable shuffle: the same week always shows its models in the same order,
 * and different weeks in different ones, so a column's place gives nothing away.
 *
 * @param models  The models.
 * @param seed  The week's fighter and date.
 * @returns The models in this week's order.
 */
function blindOrder<T extends { model: string }>(models: T[], seed: string): T[] {
  const score = (model: string) => [...`${seed}|${model}`].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
  return [...models].sort((a, b) => score(a.model) - score(b.model));
}

/**
 * The comparison page.
 *
 * @param props.searchParams  ?fighter=…&week=YYYY-MM-DD&reveal=1, and ?schema=replay.
 * @returns The page.
 */
export default async function DigestComparePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const schema = schemaFrom(params.schema);
  const reveal = param(params, "reveal") === "1";

  // Every fighter's archive weeks, newest first, with whether a pick was made.
  const weeks = await query<Week>(
    schema,
    `SELECT d.fighter, d.period_end, count(*)::int AS models,
            bool_or(EXISTS (SELECT 1 FROM feedback f WHERE f.digest_id = d.id AND f.field = 'model_pick')) AS picked
     FROM digests d WHERE d.backfill GROUP BY 1, 2 ORDER BY d.fighter, d.period_end DESC`,
  );
  if (weeks.length === 0) return <Empty>No archive digests yet.</Empty>;
  const fighters = [...new Set(weeks.map((week) => week.fighter))];
  const fighter = fighters.includes(param(params, "fighter")) ? param(params, "fighter") : fighters[0];
  const fighterWeeks = weeks.filter((week) => week.fighter === fighter);
  const weekKey = (week: Week) => week.period_end.toISOString().slice(0, 10);
  const chosenWeek = fighterWeeks.find((week) => weekKey(week) === param(params, "week")) ?? fighterWeeks[0];

  // The week's digests, and the week's pick: the digest of its latest model_pick row.
  const digests = await query<WeekDigest>(
    schema,
    `WITH week AS (SELECT * FROM digests WHERE backfill AND fighter = $1 AND period_end = $2),
          pick AS (SELECT f.digest_id FROM feedback f JOIN week w ON w.id = f.digest_id WHERE f.field = 'model_pick' ORDER BY f.id DESC LIMIT 1)
     SELECT w.id, w.model, w.text, jsonb_array_length(w.items) AS items, (w.raw -> 'usage' ->> 'cost')::float AS cost,
            w.id IN (SELECT digest_id FROM pick) AS picked
     FROM week w`,
    [fighter, chosenWeek.period_end],
  );

  // Every week's pick so far, counted by model.
  const tally = await query<{ model: string; wins: number }>(
    schema,
    `SELECT DISTINCT ON (d.fighter, d.period_end) d.model, d.fighter, d.period_end
     FROM feedback f JOIN digests d ON d.id = f.digest_id
     WHERE f.field = 'model_pick' AND d.backfill ORDER BY d.fighter, d.period_end, f.id DESC`,
  ).then((rows) => {
    const wins = new Map<string, number>();
    for (const row of rows) wins.set(row.model, (wins.get(row.model) ?? 0) + 1);
    return [...wins.entries()].map(([model, count]) => ({ model, wins: count }));
  });
  const pickedWeeks = weeks.filter((week) => week.picked).length;

  // Links that keep the other choices.
  const link = (changes: Record<string, string>) => {
    const search = new URLSearchParams({ fighter, week: weekKey(chosenWeek), ...(reveal ? { reveal: "1" } : {}), ...(schema === "replay" ? { schema: "replay" } : {}) });
    for (const [key, value] of Object.entries(changes)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    return `/digests/compare?${search}`;
  };
  const columns = blindOrder(digests, `${fighter}|${weekKey(chosenWeek)}`);

  return (
    <>
      <h1>Digest models, side by side</h1>
      <p className="muted">
        You picked {pickedWeeks} of {weeks.length} weeks
        {reveal && tally.length > 0 ? `: ${tally.map((row) => `${row.model} ${row.wins}`).join(", ")}` : reveal ? "" : " (the tally by model shows with the models)"}
        . Columns are lettered in a different order each week.{" "}
        <Link href={link({ reveal: reveal ? "" : "1" })}>{reveal ? "hide models" : "show models"}</Link> ·{" "}
        <Link href={`/digests${schemaSuffix(schema)}`}>all digests</Link>
      </p>
      <nav className="chips">
        {fighters.map((name) => (
          <Link key={name} href={link({ fighter: name, week: "" })} className={name === fighter ? "chip current" : "chip"}>
            {name}
          </Link>
        ))}
      </nav>
      <nav className="chips">
        {fighterWeeks.map((week) => (
          <Link key={weekKey(week)} href={link({ week: weekKey(week) })} className={week === chosenWeek ? "chip current" : "chip"} title={`${week.models} models`}>
            {week.picked ? "✓ " : ""}to {weekKey(week).slice(5)}
          </Link>
        ))}
      </nav>
      <div className="side-by-side">
        {columns.map((digest, index) => (
          <section key={digest.id} className={`column-digest${digest.picked ? " picked" : ""}`}>
            <h2>
              {String.fromCharCode(65 + index)}
              <span className="muted small">
                {reveal ? ` · ${digest.model}` : ""} · {digest.items} items · {digest.text.length} chars{reveal && digest.cost !== null ? ` · $${digest.cost.toFixed(4)}` : ""}
              </span>
            </h2>
            <PickBest digestId={digest.id} schema={schema} chosen={digest.picked} />
            <div className="pre digest-text" dangerouslySetInnerHTML={{ __html: safeTelegramHtml(digest.text) }} />
          </section>
        ))}
      </div>
      <p className="muted small">Week ending {pacificTime(chosenWeek.period_end)} (Pacific).</p>
    </>
  );
}
