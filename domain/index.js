// Resolves the active domain once, at import. Selected by the DOMAIN env var
// so a deployment picks its subject area without a code change.
//
// Static imports on purpose: a dynamic import keyed on env would need
// top-level await and would turn a typo in DOMAIN into a runtime surprise
// deep in a run. Adding a domain is one import plus one map entry.

import mma from "./mma.js";
import exampleMusic from "./example-music.js";

// "example-music" is a template, not working configuration — it has never been
// run against live feeds. It is registered so the validation below actually
// checks it, which is the point of shipping it: a second domain that passes
// the same startup contract is evidence the seam is real.
const DOMAINS = { mma, "example-music": exampleMusic };

const id = process.env.DOMAIN || "mma";
const active = DOMAINS[id];
if (!active) {
  throw new Error(
    `Unknown DOMAIN "${id}". Available: ${Object.keys(DOMAINS).join(", ")}`,
  );
}

// Fail at startup, not mid-run, if a domain is missing a field the pipeline
// dereferences. Cheap insurance for the main way a hand-written domain breaks.
const REQUIRED = ["id", "outlets", "officialSource", "claimTypes", "loudTypes",
                  "ignoredTypes", "ceremonyType", "ceremonyLabel", "prompt"];
for (const key of REQUIRED) {
  if (active[key] == null) throw new Error(`domain "${id}" is missing "${key}"`);
}
for (const type of [...active.loudTypes, ...active.ignoredTypes, active.ceremonyType]) {
  if (!active.claimTypes.includes(type)) {
    throw new Error(`domain "${id}": "${type}" is routed but absent from claimTypes`);
  }
}
// Surfaces the contract that used to be invisible: an outlet's `name` is what
// officialSource is tested against. A domain whose official rule matches none
// of its own outlets can still be correct (the authority may only appear via
// Google News), so this warns rather than throws.
if (!active.outlets.some((o) => active.officialSource.test(o.name))) {
  console.warn(
    `domain "${id}": officialSource matches no outlet name — official items can only arrive via Google News`,
  );
}

export const domain = active;
export default active;
