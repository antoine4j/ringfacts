"use client";
// Each fighter's digest schedule as a small table: weekday, time, time zone.
// Edited as part of the same draft as the tier map, and saved with it.

import type { DigestSchedule } from "../../../pipeline/settings/tiers.ts";
import { WEEKDAYS } from "../../lib/tier-draft.ts";

/**
 * A new fighter's schedule before anyone sets one: Monday 07:00 Pacific (D24).
 *
 * @returns The schedule.
 */
export function startingEntry(): DigestSchedule {
  return { every: "week", weekday: 1, time: "07:00", timezone: "America/Los_Angeles" };
}

/**
 * The schedule table.
 *
 * @param props.fighters  The watched fighters.
 * @param props.schedule  The draft schedule.
 * @param props.onChange  Called with the whole new schedule after any edit.
 * @returns The table.
 */
export function ScheduleEditor({ fighters, schedule, onChange }: { fighters: string[]; schedule: Record<string, DigestSchedule>; onChange: (next: Record<string, DigestSchedule>) => void }) {
  // Change one field of one fighter's entry.
  const edit = (fighter: string, changes: Partial<DigestSchedule>) => onChange({ ...schedule, [fighter]: { ...schedule[fighter], ...changes } });

  return (
    <table style={{ width: "auto" }}>
      <thead>
        <tr>
          <th>fighter</th>
          <th>weekly on</th>
          <th>at</th>
          <th>time zone</th>
        </tr>
      </thead>
      <tbody>
        {fighters.map((fighter) => (
          <tr key={fighter}>
            <td>{fighter}</td>
            <td>
              <select value={schedule[fighter].weekday} onChange={(event) => edit(fighter, { weekday: Number(event.target.value) })} aria-label={`${fighter} weekday`}>
                {WEEKDAYS.map((name, number) => (
                  <option key={name} value={number}>
                    {name}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input type="time" value={schedule[fighter].time} onChange={(event) => edit(fighter, { time: event.target.value })} aria-label={`${fighter} time`} />
            </td>
            <td>
              <input value={schedule[fighter].timezone} onChange={(event) => edit(fighter, { timezone: event.target.value })} size={22} aria-label={`${fighter} time zone`} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
