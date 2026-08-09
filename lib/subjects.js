// Loads the watchlist — WHO is tracked, as opposed to domain/*.js, which is
// what kind of thing they are. It lives at the repo root as watchlist.js and
// is deliberately NOT committed: the subject list is the one genuinely
// personal thing here, and a public repo should ship the shape, not the names.
// watchlist.example.js documents that shape.
//
// Loaded on demand rather than imported at module scope. A static import of a
// file that may not exist fails during module resolution, before any code can
// explain why — and it would take down anything that imports hunter.js for its
// formatters without wanting the watchlist at all.

const WATCHLIST_URL = new URL("../watchlist.js", import.meta.url);

export async function loadSubjects() {
  let mod;
  try {
    mod = await import(WATCHLIST_URL.href);
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(
        "watchlist.js not found. Copy watchlist.example.js to watchlist.js and " +
          "fill in your own subjects — it is gitignored on purpose.",
      );
    }
    throw err; // a syntax error in the file is the author's to see, unwrapped
  }
  const subjects = mod.SUBJECTS ?? mod.default;
  if (!Array.isArray(subjects) || subjects.length === 0) {
    throw new Error("watchlist.js must export a non-empty SUBJECTS array");
  }
  for (const s of subjects) {
    if (!s.name) throw new Error("every watchlist entry needs a name");
    if (!Array.isArray(s.matchNames) || !s.matchNames.length) {
      throw new Error(`"${s.name}" needs matchNames (surname stems used to filter outlet feeds)`);
    }
  }
  return subjects;
}

// Takes the loaded list explicitly instead of reaching for module state, so a
// caller can never get an empty answer because it forgot to load first.
export const matchNamesOf = (subjects, name) =>
  subjects.find((s) => s.name === name)?.matchNames ?? [];

// Disambiguation hints for one subject — namesakes, relatives, anyone the
// matcher might confuse them with. Optional: absent means the domain default.
export const confusablesOf = (subjects, name) =>
  subjects.find((s) => s.name === name)?.confusables ?? null;
