// ⚠️ ILLUSTRATIVE EXAMPLE — NEVER RUN. Read this before borrowing anything.
//
// This domain exists to answer one question honestly: is the MMA-specific part
// of this tracker really just configuration, or does the pipeline secretly
// assume a sport? Writing a second domain is the only way to find out, and the
// answer is yes — nothing outside this file needed to change to add it.
//
// What it is NOT:
//   - It has never been run. No database, no feeds fetched, no verdicts.
//   - The feed URLs are plausible but UNVERIFIED. Assume some are dead or
//     blocked; the MMA list took a round of live checking to settle.
//   - The claim types are reasoned about, not measured. The MMA vocabulary
//     earned its shape from real verdicts (see the note on `prediction` in
//     domain/mma.js); this one is a guess.
//   - The thresholds in lib/tier.js and the 0.80 dedup cutoff were measured
//     against MMA press conventions. Music coverage has different habits —
//     album reviews name an artist constantly, tour listings barely at all —
//     so those numbers should be RE-MEASURED, not inherited.
//
// Use it as a template and a proof that the seam is real. Do not use it as
// working configuration.

export default {
  id: "example-music",

  outlets: [
    { id: "pitchfork",   name: "Pitchfork",      url: "https://pitchfork.com/feed/feed-news/rss",     lang: "en" },
    { id: "billboard",   name: "Billboard",      url: "https://www.billboard.com/feed/",              lang: "en" },
    { id: "stereogum",   name: "Stereogum",      url: "https://www.stereogum.com/feed/",              lang: "en" },
  ],

  // The MMA analogue is the promotion announcing a fight: the party whose word
  // settles the question. For a musician that is the label or the artist's own
  // channel — a press release is not a rumour. Note the same trap applies here:
  // this regex is matched against an outlet's `name`, so adding a label's own
  // feed above means naming it to match.
  officialSource: /^(label|artist)[- ]?official$/i,

  // Reasoned by analogy with the MMA set, NOT observed:
  //   announcement/result/injury/negotiation -> release/tour/chart/signing
  // "quote" and "lifestyle" carry over unchanged; both are about how the press
  // covers a public figure, not about what they do for a living.
  claimTypes: [
    "release", "tour", "chart", "signing", "collaboration", "quote", "lifestyle", "other",
  ],
  loudTypes: ["release", "tour", "signing"],
  ignoredTypes: ["lifestyle"],
  ceremonyType: "release",
  ceremonyLabel: "Release confirmed",

  prompt: {
    domainNoun: "music",
    subjectNoun: "artist",
    peerPlural: "artists",
    peerGroupNoun: "scene",
    careerNoun: "music or career",
    offTopicExamples: "lifestyle, restaurants, vacations, celebrity spotting",
    factFields: "title, label, release date, format, collaborators",
    sourcingHint:
      "official = the label or artist announced it; reported = outlet states as fact; rumored = hedged (in the studio, expected, sources say)",
    confusables:
      "a namesake (an unrelated person who happens to share the name), a band whose name contains the artist's name",
  },
};
