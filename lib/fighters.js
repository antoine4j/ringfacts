// The watchlist, in ONE place. Lived inside hunter.js until 2026-08-09, which
// forced audit-digest-tier.js to keep a hand-copied `matchNames` map (importing
// hunter.js runs a hunt). Sharing the thresholds of a name-matching rule while
// the names themselves stay forked closes half a gap.
//
// Aliases are search queries, not display names. First draft (spec §17.4 is
// still open): Cyrillic aliases matter most for the fighters western media
// ignores. Each alias pairs with a Google News language edition.
// matchNames (2e) filter outlet-wide direct feeds down to this fighter —
// surname stems only, so Ukrainian case endings still match (Fighter Cя/Fighter Cї
// both contain "Fighter C").
export const FIGHTERS = [
  {
    name: "Fighter A",
    aliases: [
      { query: '"Fighter A"', edition: "en" },
      { query: '"Fighter A"', edition: "uk" },
    ],
    matchNames: ["Fighter A", "Fighter A"],
  },
  {
    name: "Fighter B",
    aliases: [
      { query: '"Fighter B"', edition: "en" },
      { query: '"Fighter B"', edition: "uk" },
    ],
    matchNames: ["Fighter B", "Fighter B"],
  },
  {
    name: "Fighter C",
    aliases: [
      { query: '"Fighter C"', edition: "en" },
      // Same Latin spelling in Spanish — only the edition differs. Spain's
      // press covers him as a domestic athlete (added 2026-08-07).
      { query: '"Fighter C"', edition: "es" },
    ],
    matchNames: ["Fighter C", "Fighter C"],
  },
];

// Convenience for scripts that only need the name->matchNames mapping.
export const matchNamesOf = (name) =>
  FIGHTERS.find((f) => f.name === name)?.matchNames ?? [];
