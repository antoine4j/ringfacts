// The filter row at the top of a list page. It is a plain form that writes
// its choices into the address (?fighter=…&tier=1), so every view can be
// bookmarked or pasted.

import { param, STAGES, type Params } from "../lib/filters.ts";
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
};

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
 * @returns The form.
 */
export function FilterBar({ path, params, schema, fighters, outlets, stages = false, answers }: Props) {
  return (
    <form className="filters" method="get" action={path}>
      {schema === "replay" && <input type="hidden" name="schema" value="replay" />}
      <Choice name="fighter" label="fighter" value={param(params, "fighter")} options={fighters} />
      <label>
        day
        <input type="date" name="day" defaultValue={param(params, "day")} />
      </label>
      <label>
        outlet
        <input name="outlet" list="outlet-names" defaultValue={param(params, "outlet")} size={16} />
        <datalist id="outlet-names">
          {outlets.map((outlet) => (
            <option key={outlet} value={outlet} />
          ))}
        </datalist>
      </label>
      <Choice name="tier" label="tier" value={param(params, "tier")} options={["1", "2", "3", "none"]} />
      <Choice name="posted" label="posted" value={param(params, "posted")} options={["yes", "no"]} />
      {stages && <Choice name="stage" label="stage" value={param(params, "stage")} options={["waiting", ...STAGES]} />}
      {stages && <Choice name="history" label="archive" value={param(params, "history")} options={["yes", "no"]} />}
      {answers &&
        Object.entries(answers).map(([name, values]) => (
          <Choice key={name} name={name} label={name} value={param(params, name)} options={values} />
        ))}
      <button type="submit" className="primary">
        filter
      </button>
      <a href={schema === "replay" ? `${path}?schema=replay` : path}>clear</a>
    </form>
  );
}

/**
 * One drop-down filter with an "any" choice.
 *
 * @param props.name  The address key.
 * @param props.label  What the drop-down is called.
 * @param props.value  The current choice.
 * @param props.options  The choices.
 * @returns The labelled drop-down.
 */
function Choice({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        <option value="">any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
