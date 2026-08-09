// Copy this file to watchlist.js and replace the entries with your own.
// watchlist.js is gitignored — who you track is yours, not the repo's.
//
// The people below are examples chosen for being well known; they are not
// anyone's actual watchlist, and the pipeline has never been run against them.
//
// Each entry has three required fields and one optional one:
//
//   name        The canonical display name. This is written into the database
//               `subject` column and is how claims are grouped, so treat it as
//               a stable key — renaming it orphans existing rows.
//
//   aliases     Search QUERIES, not display names, each paired with a Google
//               News language edition. Quoting the query is what stops Google
//               from matching either word alone. Non-Latin aliases matter most
//               for subjects the English-language press ignores.
//
//   matchNames  Surname STEMS used to filter the outlet-wide direct feeds down
//               to this subject. Stems, not full names, so inflected languages
//               still match — Ukrainian "Fighter Cя" and "Fighter Cї" both contain
//               "Fighter C". Case-insensitive substring, so keep them long enough
//               to be unambiguous.
//
//   confusables Optional. Disambiguation hints spliced into the matcher prompt
//               for THIS subject only: namesakes, relatives, anyone the model
//               might mistake for them. Write it as a sentence fragment that
//               reads naturally after "the article is not about this fighter
//               AT ALL:". Omit it and the domain's default is used.

export const SUBJECTS = [
  {
    name: "Example Athlete",
    aliases: [
      { query: '"Example Athlete"', edition: "en" },
      // Same Latin spelling, different edition: use this when a subject is
      // covered as a domestic athlete by a second country's press.
      { query: '"Example Athlete"', edition: "es" },
    ],
    matchNames: ["Athlete"],
    confusables:
      "a namesake (there is a chess player of the same name), a relative (their brother competes in the same promotion)",
  },
  {
    name: "Приклад Спортсмен",
    aliases: [
      { query: '"Example Sportsman"', edition: "en" },
      { query: '"Приклад Спортсмен"', edition: "uk" },
    ],
    // Both scripts: outlet feeds arrive in whichever language the outlet uses.
    matchNames: ["Sportsman", "Спортсме"],
  },
];
