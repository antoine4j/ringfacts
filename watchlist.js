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
    // "Daniil", not "Daniel" — ufc.com/athlete/daniil-donchenko, and the
    // spelling every English outlet uses. The typo cost us the whole English
    // half of this subject: the alias is a quoted exact phrase, so it matched
    // nothing, and found_via never once recorded en "Daniel Donchenko" while
    // uk "Данило Донченко" brought in 5 items. His UFC Paris booking was
    // covered in English by Heavy, SI and Yahoo and we saw none of it.
    //
    // `name` is also the subject KEY in items and claims, so this rename came
    // with a migration (2026-08-13, 5 items + claim #11). It has to match the
    // spelling in the articles: the matcher is told to answer WRONG_SUBJECT
    // when the subject "appears NOWHERE in the headline or body", and would
    // have been holding the wrong first name against every English piece.
    name: "Daniil Donchenko",
    aliases: [
      { query: '"Daniil Donchenko"', edition: "en" },
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
