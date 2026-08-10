// The live watchlist — the real one this bot runs on. Tracked deliberately:
// the walkthroughs quote real headlines about these three, so hiding the list
// would only have been theatre. See watchlist.example.js for the format.
//
// Aliases are search queries, not display names. Cyrillic aliases matter most
// for the subjects western media ignores. matchNames filter outlet-wide direct
// feeds down to one subject — surname stems only, so Ukrainian case endings
// still match (Топурія/Топурії both contain "Топурі").

export const SUBJECTS = [
  {
    name: "Daniel Donchenko",
    aliases: [
      { query: '"Daniel Donchenko"', edition: "en" },
      { query: '"Данило Донченко"', edition: "uk" },
    ],
    matchNames: ["Donchenko", "Донченко"],
  },
  {
    name: "Yaroslav Amosov",
    aliases: [
      { query: '"Yaroslav Amosov"', edition: "en" },
      { query: '"Ярослав Амосов"', edition: "uk" },
    ],
    matchNames: ["Amosov", "Амосов"],
    // Was in the shared prompt until 2026-08-09, so every subject paid for it.
    confusables: "a namesake (e.g. an esports driver also named Yaroslav Amosov)",
  },
  {
    name: "Ilia Topuria",
    aliases: [
      { query: '"Ilia Topuria"', edition: "en" },
      // Same Latin spelling in Spanish — only the edition differs. Spain's
      // press covers him as a domestic athlete (added 2026-08-07).
      { query: '"Ilia Topuria"', edition: "es" },
    ],
    matchNames: ["Topuria", "Топурі"],
    confusables: "a relative (Aleksandre Topuria is Ilia's brother — a different fighter)",
  },
];
