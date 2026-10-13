"use client";
// The scores page's one date picker (scoreboard D5): the filter bar's date
// choice alone, so both live sections follow one period. All time when unset.

import { DateChoice, dropEmpty } from "./FilterBar.tsx";
import type { Params } from "../lib/filters.ts";

/**
 * The period form.
 *
 * @param props.path  The page the form reloads.
 * @param props.params  The current address, to show the period chosen.
 * @returns The form.
 */
export function PeriodPicker({ path, params }: { path: string; params: Params }) {
  return (
    <form className="filters" method="get" action={path} onSubmit={dropEmpty}>
      <DateChoice params={params} unset="all time" />
      <noscript>
        <button type="submit">show</button>
      </noscript>
    </form>
  );
}
