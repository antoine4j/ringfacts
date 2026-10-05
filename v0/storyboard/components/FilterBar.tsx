"use client";
// The filter row at the top of a list page, pinned under the navigation while
// the list scrolls. It is a plain form that writes its choices into the
// address (?fighter=…&when=last_week), so every view can be bookmarked or
// pasted; any change applies at once. A filter that is set is highlighted.

import { useEffect, useRef, useState } from "react";
import { describeRange, PERIODS } from "../lib/dates.ts";
import { CLAIM_SORTS, dateFilter, param, STAGES, type Params } from "../lib/filters.ts";
import type { Schema } from "../lib/schema.ts";

/** What the bar offers; stage and answers only where the page supports them. */
type Props = {
  path: string;
  params: Params;
  schema: Schema;
  fighters: string[];
  outlets: string[];
  stages?: boolean;
  answers?: Record<string, string[]>;
  claimOptions?: boolean;
};

/**
 * Sends the form the control belongs to, so a choice applies at once.
 *
 * @param event  The change.
 */
function apply(event: { currentTarget: { form: HTMLFormElement | null } }): void {
  event.currentTarget.form?.requestSubmit();
}

/**
 * Leaves empty filters out of the address, so it shows only what is chosen.
 *
 * @param event  The form being sent.
 */
function dropEmpty(event: { currentTarget: HTMLFormElement }): void {
  for (const element of Array.from(event.currentTarget.elements) as HTMLInputElement[]) {
    if (element.name && element.value === "") element.disabled = true;
  }
}

/**
 * The filter form.
 *
 * @param props.path  The page the form reloads.
 * @param props.params  The current filters, to show as chosen.
 * @param props.schema  Kept as a hidden field so filtering stays in the same schema.
 * @param props.fighters  The fighter choices.
 * @param props.outlets  Outlet suggestions.
 * @param props.stages  Whether to offer the stage filter.
 * @param props.answers  Classifier answer name → values seen, when the page filters on answers.
 * @param props.claimOptions  The claims page: offer "in a digest" and the sort.
 * @returns The form.
 */
export function FilterBar({ path, params, schema, fighters, outlets, stages = false, answers, claimOptions = false }: Props) {
  // The bar's height, so table headers stick just below it (globals.css, --filters-h).
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const element = form.current;
    if (!element) return;
    const root = document.documentElement.style;
    const measure = () => root.setProperty("--filters-h", `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.removeProperty("--filters-h");
    };
  }, []);

  // Which filters are set, for the highlight and the clear link.
  const chosenAnswers = Object.keys(answers ?? {}).filter((name) => param(params, name));
  const isFiltered = ["fighter", "when", "day", "outlet", "tier", "posted", "digest", "stage", "history", "sort"].some((key) => param(params, key)) || chosenAnswers.length > 0;

  return (
    <form ref={form} className="filters" method="get" action={path} onSubmit={dropEmpty}>
      {schema === "replay" && <input type="hidden" name="schema" value="replay" />}
      <Choice name="fighter" placeholder="all fighters" value={param(params, "fighter")} options={fighters} />
      <DateChoice params={params} />
      <input
        name="outlet"
        list="outlet-names"
        placeholder="any outlet"
        defaultValue={param(params, "outlet")}
        size={12}
        className={param(params, "outlet") ? "set" : ""}
        onChange={(event) => (event.currentTarget.value === "" || outlets.includes(event.currentTarget.value)) && apply(event)}
        aria-label="outlet"
      />
      <datalist id="outlet-names">
        {outlets.map((outlet) => (
          <option key={outlet} value={outlet} />
        ))}
      </datalist>
      <Choice name="tier" placeholder="any tier" value={param(params, "tier")} options={["1", "2", "3", "none"]} prefix="tier " />
      <Choice name="posted" placeholder="posted or not" value={param(params, "posted")} options={["yes", "no"]} prefix="posted: " />
      {claimOptions && <Choice name="digest" placeholder="in a digest or not" value={param(params, "digest")} options={["yes", "no"]} prefix="in a digest: " />}
      {claimOptions && (
        <select name="sort" defaultValue={param(params, "sort")} onChange={apply} className={param(params, "sort") ? "set" : ""} aria-label="sort">
          <option value="">newest activity</option>
          {Object.entries(CLAIM_SORTS)
            .filter(([key]) => key !== "activity")
            .map(([key, sort]) => (
              <option key={key} value={key}>
                {sort.label}
              </option>
            ))}
        </select>
      )}
      {stages && <Choice name="stage" placeholder="any stage" value={param(params, "stage")} options={["waiting", ...STAGES]} prefix="stage: " />}
      {stages && <Choice name="history" placeholder="live and archive" value={param(params, "history")} options={["yes", "no"]} prefix="archive: " />}
      {answers && (
        <details className={`more${chosenAnswers.length ? " set" : ""}`}>
          <summary>answers{chosenAnswers.length ? ` (${chosenAnswers.length})` : ""} ▾</summary>
          <div className="more-panel">
            {Object.entries(answers).map(([name, values]) => (
              <label key={name}>
                <span>{name}</span>
                <Choice name={name} placeholder="any" value={param(params, name)} options={values} />
              </label>
            ))}
          </div>
        </details>
      )}
      <noscript>
        <button type="submit">filter</button>
      </noscript>
      {isFiltered && (
        <a className="clear" href={schema === "replay" ? `${path}?schema=replay` : path}>
          clear
        </a>
      )}
    </form>
  );
}

/**
 * The date filter: a named period, or a custom range shown as two date boxes.
 *
 * @param props.params  The current filters.
 * @returns The drop-down, the range's days, and the boxes when custom.
 */
function DateChoice({ params }: { params: Params }) {
  // The older ?day= link opens as a one-day custom range.
  const day = param(params, "day");
  const initial = param(params, "when") || (day ? "custom" : "");
  const [when, setWhen] = useState(initial);
  const range = dateFilter(params);
  const isCustom = when === "custom";

  return (
    <span className="dates">
      <select
        name="when"
        value={when}
        className={range ? "set" : ""}
        aria-label="dates"
        onChange={(event) => {
          setWhen(event.currentTarget.value);
          if (event.currentTarget.value !== "custom") apply(event);
        }}
      >
        <option value="">any time</option>
        {PERIODS.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
        <option value="custom">custom range…</option>
      </select>
      {isCustom && (
        <>
          <input type="date" name="from" defaultValue={param(params, "from") || day} onChange={apply} aria-label="from" className="set" />
          <span className="muted">–</span>
          <input type="date" name="to" defaultValue={param(params, "to") || day} onChange={apply} aria-label="to" className="set" />
        </>
      )}
      {range && !isCustom && <span className="range">{describeRange(range)}</span>}
    </span>
  );
}

/**
 * One drop-down filter whose empty choice names what it filters.
 *
 * @param props.name  The address key.
 * @param props.placeholder  The empty choice's words, such as "all fighters".
 * @param props.value  The current choice.
 * @param props.options  The choices.
 * @param props.prefix  Words shown before each choice, so a set filter reads on its own.
 * @returns The drop-down.
 */
function Choice({ name, placeholder, value, options, prefix = "" }: { name: string; placeholder: string; value: string; options: string[]; prefix?: string }) {
  return (
    <select name={name} defaultValue={value} onChange={apply} className={value ? "set" : ""} aria-label={name}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {prefix}
          {option}
        </option>
      ))}
    </select>
  );
}
