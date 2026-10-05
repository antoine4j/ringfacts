"use client";
// The tier map editor: three columns of cards that can be dragged (or moved
// with their buttons), a box saying what the draft changes, the digest
// schedule, and the save form. The preview re-runs the Decider's own lookup.

import { useActionState, useState, type DragEvent, type ReactNode } from "react";
import type { DigestSchedule, Tier } from "../../../pipeline/settings/tiers.ts";
import { answersBehind, cellAnchor, describeAnswer, GATE_CELL } from "../../lib/answers.ts";
import type { SettingsRow } from "../../lib/queries.ts";
import { allCombinations, movesBetween, TIER_NAMES, withCells, type AnswerGroup, type Combination } from "../../lib/tier-draft.ts";
import { saveSettings, type ActionResult } from "../actions.ts";
import { ScheduleEditor, startingEntry } from "./ScheduleEditor.tsx";

/** How many readings fall in one card, and a few of their headlines. */
export type CardCounts = { readings: number; examples: string[] };

/** What the board is given by the page. */
type Props = {
  current: SettingsRow;
  cards: Record<string, CardCounts>;
  groups: AnswerGroup[];
  fighters: string[];
  readOnly: boolean;
};

/** The three columns, in the order shown. */
const TIERS: Tier[] = [1, 2, 3];

/**
 * The whole editor.
 *
 * @param props.current  The settings in force.
 * @param props.cards  Cell → counts; "gate" for the not-about-him card.
 * @param props.groups  Readings grouped by answers, for the preview.
 * @param props.fighters  The watched fighters, for the schedule.
 * @param props.readOnly  True in the replay schema, where the storyboard may not save settings.
 * @returns The board.
 */
export function TierBoard({ current, cards, groups, fighters, readOnly }: Props) {
  // The draft starts as the settings in force.
  const [draft, setDraft] = useState<Record<string, Tier>>({ ...current.tiers.cells });
  const [schedule, setSchedule] = useState<Record<string, DigestSchedule>>(() => scheduleWithEveryone(current.digest_schedule, fighters));
  const [result, save, saving] = useActionState<ActionResult | null, FormData>(saveSettings, null);

  // After a save the page brings the new version: start the draft again from it, keeping the "saved" message.
  const [shownVersion, setShownVersion] = useState(current.version);
  if (shownVersion !== current.version) {
    setShownVersion(current.version);
    setDraft({ ...current.tiers.cells });
    setSchedule(scheduleWithEveryone(current.digest_schedule, fighters));
  }

  // Move one card to a column.
  const moveCard = (cell: string, tier: Tier) => setDraft((before) => ({ ...before, [cell]: tier }));

  // Order each column's cards by how many readings they hold, busiest first.
  const combinations = allCombinations();
  combinations.sort((first, second) => (cards[second.cell]?.readings ?? 0) - (cards[first.cell]?.readings ?? 0));

  return (
    <>
      <div className="board">
        {TIERS.map((tier) => (
          <Column key={tier} tier={tier} onDropCard={moveCard}>
            {tier === 3 && <GateCard gate={current.tiers.gate} counts={cards.gate} />}
            {combinations
              .filter((combination) => draft[combination.cell] === tier)
              .map((combination) => (
                <Card key={combination.cell} combination={combination} counts={cards[combination.cell]} tier={tier} was={current.tiers.cells[combination.cell]} onMove={moveCard} />
              ))}
          </Column>
        ))}
      </div>
      <h2>Digest schedule</h2>
      <ScheduleEditor fighters={fighters} schedule={schedule} onChange={setSchedule} />
      <Changes current={current} draft={draft} schedule={schedule} groups={groups} />
      <form action={save} className="filters">
        <input type="hidden" name="base_version" value={current.version} />
        <input type="hidden" name="cells" value={JSON.stringify(draft)} />
        <input type="hidden" name="schedule" value={JSON.stringify(schedule)} />
        <label style={{ flex: 1 }}>
          why (saved with the version)
          <input name="note" required maxLength={1000} placeholder="e.g. next fight rumours are worth a post" />
        </label>
        <button type="button" onClick={() => setDraft({ ...current.tiers.cells })}>
          reset the draft
        </button>
        <button type="submit" className="primary" disabled={saving || readOnly}>
          {saving ? "saving…" : `save as v${current.version + 1}`}
        </button>
      </form>
      {readOnly && <p className="muted small">The golden replay&apos;s settings are written by the replay itself; the storyboard saves only live settings.</p>}
      {result && <p className={`message ${result.ok ? "good" : "bad"}`}>{result.message}</p>}
    </>
  );
}

/**
 * The stored schedule, with a starting entry for any fighter it lacks.
 *
 * @param stored  The settings' digest_schedule.
 * @param fighters  The watched fighters.
 * @returns Fighter → schedule, one for each.
 */
function scheduleWithEveryone(stored: Record<string, DigestSchedule>, fighters: string[]): Record<string, DigestSchedule> {
  const schedule: Record<string, DigestSchedule> = { ...stored };
  for (const fighter of fighters) {
    if (!schedule[fighter]) schedule[fighter] = startingEntry();
  }
  return schedule;
}

/**
 * One column that cards can be dropped on.
 *
 * @param props.tier  The column's tier.
 * @param props.onDropCard  Called with the dropped card's cell.
 * @param props.children  The cards.
 * @returns The column.
 */
function Column({ tier, onDropCard, children }: { tier: Tier; onDropCard: (cell: string, tier: Tier) => void; children: ReactNode }) {
  const [isOver, setIsOver] = useState(false);

  // A drop carries the card's cell name as plain text.
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setIsOver(false);
    const cell = event.dataTransfer.getData("text/plain");
    if (cell) onDropCard(cell, tier);
  };

  return (
    <div
      className={`column ${isOver ? "over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={drop}
    >
      <h2 className={`tier-${tier}`}>
        {TIER_NAMES[tier]} <span className="muted small">tier {tier}</span>
      </h2>
      {children}
    </div>
  );
}

/**
 * One combination's card: its name, count, headlines, and buttons to move it.
 *
 * @param props.combination  The fact and firmness.
 * @param props.counts  Its readings, if any.
 * @param props.tier  The column it is in now.
 * @param props.was  Its tier in the settings in force.
 * @param props.onMove  Called to move it.
 * @returns The card.
 */
function Card({ combination, counts, tier, was, onMove }: { combination: Combination; counts?: CardCounts; tier: Tier; was: Tier; onMove: (cell: string, tier: Tier) => void }) {
  const readings = counts?.readings ?? 0;
  const changed = tier !== was;
  const others = TIERS.filter((other) => other !== tier);

  return (
    <div id={cellAnchor(combination.cell)} className={`card ${readings === 0 ? "empty" : ""} ${changed ? "changed" : ""}`} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", combination.cell)}>
      <div className="name">
        <span>
          {answersBehind(combination.cell, null).map((answer, index) => (
            <span key={answer.question} title={answer.definition}>
              {index > 0 && " · "}
              {answer.words}
            </span>
          ))}
        </span>
        <span className="tag">{readings}</span>
      </div>
      {changed && <div className="small">was {TIER_NAMES[was]}</div>}
      {counts && counts.examples.length > 0 && (
        <ul>
          {counts.examples.map((headline, index) => (
            <li key={index}>{headline}</li>
          ))}
        </ul>
      )}
      <div className="move">
        {others.map((other) => (
          <button key={other} type="button" onClick={() => onMove(combination.cell, other)} aria-label={`move ${combination.cell} to ${TIER_NAMES[other]}`}>
            → {TIER_NAMES[other]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The fixed not-about-him card: the gate runs before the map and always drops.
 *
 * @param props.gate  The gate's question and the answers that mean "not about him".
 * @param props.counts  Its readings, if any.
 * @returns The card.
 */
function GateCard({ gate, counts }: { gate: SettingsRow["tiers"]["gate"]; counts?: CardCounts }) {
  return (
    <div id={cellAnchor(GATE_CELL)} className="card fixed">
      <div className="name">
        <span>
          {gate.notAboutHim.map((value, index) => (
            <span key={value} title={describeAnswer(gate.question, value).definition}>
              {index > 0 && " or "}
              {describeAnswer(gate.question, value).words}
            </span>
          ))}
        </span>
        <span className="tag">{counts?.readings ?? 0}</span>
      </div>
      <div className="small muted">
        How central he is, checked before every other card: either answer drops the article, whatever it reports. Fixed.
      </div>
      {counts && (
        <ul>
          {counts.examples.map((headline, index) => (
            <li key={index}>{headline}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What the draft changes, worked out by re-deciding every reading under it.
 *
 * @param props.current  The settings in force.
 * @param props.draft  The draft cells.
 * @param props.schedule  The draft schedule.
 * @param props.groups  Readings grouped by answers.
 * @returns The box, or a line saying nothing changed.
 */
function Changes({ current, draft, schedule, groups }: { current: SettingsRow; draft: Record<string, Tier>; schedule: Record<string, DigestSchedule>; groups: AnswerGroup[] }) {
  // Which cards moved, which readings move with them, and whether the schedule changed.
  const movedCells = Object.keys(draft).filter((cell) => draft[cell] !== current.tiers.cells[cell]);
  const moves = movesBetween(groups, current, withCells(current, draft));
  const scheduleChanged = JSON.stringify(schedule) !== JSON.stringify(scheduleWithEveryone(current.digest_schedule, Object.keys(schedule)));
  if (movedCells.length === 0 && !scheduleChanged) return <p className="muted">The draft is the same as v{current.version}.</p>;

  return (
    <div className="changes">
      <strong>What saving would change</strong>
      <ul>
        {moves.map((move) => (
          <li key={`${move.from}-${move.to}`}>
            <strong>{move.readings}</strong> reading{move.readings === 1 ? "" : "s"} would move from {TIER_NAMES[move.from]} to {TIER_NAMES[move.to]}
          </li>
        ))}
        {movedCells.length > 0 && moves.length === 0 && <li>No reading moves: the moved cards hold no readings yet.</li>}
        {movedCells.map((cell) => (
          <li key={cell} className="small">
            {cell}: {TIER_NAMES[current.tiers.cells[cell]]} → {TIER_NAMES[draft[cell]]}
          </li>
        ))}
        {scheduleChanged && <li>The digest schedule changes.</li>}
      </ul>
      <div className="small">Counted by re-deciding every reading under the draft. Readings already decided keep their stored decision; a new version decides readings from the next run on.</div>
    </div>
  );
}
