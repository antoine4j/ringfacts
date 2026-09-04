// The MMA domain. Everything in this file is knowledge about a subject area,
// not about how the pipeline works — swap it and the same machinery tracks
// musicians or politicians. See domain/README.md for the contract.
//
// The prompt fragments exist so lib/matcher.js can stay domain-blind. They are
// worded to slot into its sentences verbatim; changing one changes what the
// model is told, so they carry the same weight as prompt text and should be
// edited with the same care.

export default {
  id: "mma",

  // --- Discovery -----------------------------------------------------------
  // Outlet-wide feeds, fetched once per run and filtered per subject by name.
  // Every URL verified live 2026-08-08 (200 + parseable XML with a browser UA).
  // Casualties of that verification: MMA Junkie (Gannett killed their feeds),
  // XSPORT.ua (410 gone), AS/Mundo Deportivo (404/403). Grow or prune freely.
  //
  // LOAD-BEARING: an outlet's `name` is what `officialSource` below is tested
  // against, so "UFC" here is what lets this feed born-confirm claims. The two
  // fields are adjacent on purpose — they used to live in separate files with
  // nothing tying them together.
  outlets: [
    { id: "ufc",         name: "UFC",          url: "https://www.ufc.com/rss/news",              lang: "en" },
    { id: "mmafighting", name: "MMA Fighting", url: "https://www.mmafighting.com/rss/index.xml", lang: "en" }, // Atom
    { id: "bloodyelbow", name: "Bloody Elbow", url: "https://bloodyelbow.com/feed/",             lang: "en" },
    { id: "sherdog",     name: "Sherdog",      url: "https://www.sherdog.com/rss/news.xml",      lang: "en" }, // 403s non-browser UAs
    { id: "sportua",     name: "Sport.ua",     url: "https://sport.ua/uk/rss/mma",               lang: "uk" }, // XSPORT has no feed
    { id: "marca",       name: "Marca",        url: "https://e00-marca.uecdn.es/rss/mma.xml",    lang: "es" },
  ],

  // --- Authority -----------------------------------------------------------
  // Official sources born-confirm claims (docs §6), so this is the most
  // consequential value in the file. v1 = ufc.com only (resolved 2026-08-08):
  // every watched subject competes there. pflmma.com parked until one signs
  // elsewhere. Record trackers (Tapology, Sherdog, ESPN) are high-credibility
  // media, never official.
  officialSource: /^ufc(\.com)?$/i,

  // --- Claim vocabulary ----------------------------------------------------
  // The single source of truth: lib/matcher.js builds both the tool enum and
  // its validation gate from this list, and hunter.js routes on the two
  // subsets below. These used to be three hand-synced copies.
  //
  // 'prediction' added 2026-08-08: the type the model kept reaching for
  // (coercion warnings recurred; claim #5 already carries it from the
  // pre-validation bootstrap). Predictions route like quotes — digest-grade.
  claimTypes: [
    "announcement", "result", "injury", "quote", "prediction", "negotiation", "lifestyle", "other",
  ],
  // Loud enough for their own line when still a rumor; everything else rides
  // the digest.
  loudTypes: ["announcement", "result", "injury", "negotiation"],
  // Asserts nothing claim-worthy — treated as NO_CLAIM (docs §5).
  ignoredTypes: ["lifestyle"],
  // The type that earns a standalone post once confirmed, and its headline.
  ceremonyType: "announcement",
  ceremonyLabel: "Fight announced",

  // --- Prompt fragments ----------------------------------------------------
  prompt: {
    domainNoun: "MMA",           // "You match MMA news articles..."
    subjectNoun: "fighter",      // "...about the fighter X"
    peerPlural: "fighters",      // "an article mainly about OTHER fighters..."
    peerGroupNoun: "division",   // "...or the division"
    careerNoun: "fights or career",
    offTopicExamples: "lifestyle, restaurants, vacations, celebrity spotting",
    factFields: "opponent, event, date, location, method",
    sourcingHint:
      "official = promotion announced it; reported = outlet states as fact; rumored = hedged (in talks, targeted, sources say)",
    // What each claim type means, in the words the model reads. The loud
    // types (loudTypes above) earn their own alert line in the group, so
    // they are defined narrowly: a concrete, new event about the subject
    // himself. Everything softer is quote / prediction / other. Written
    // 2026-09-04 after the graded month showed the matcher minting
    // "announcement" for a public appearance and "injury" for an opponent's
    // damaged hands (TODO 3c).
    claimTypeGuide: [
      "announcement — a specific fight FOR THE SUBJECT is booked, targeted, or officially set: an opponent and/or an event or date is named. A return \"expected\" or \"planned\", a training-camp date, a trainer's estimate, a public appearance, or a wish to fight someone is NOT an announcement.",
      "result — the outcome of a fight the subject fought in the last few days, reported as news. The subject's earlier win or loss mentioned in a profile, a preview, a photo caption, or another fighter's story (\"after beating the subject\", \"since losing to the subject\") is NOT a result: NO_CLAIM. A result always gives the fight's date in facts.date (YYYY-MM-DD, or YYYY-MM if only the month is known).",
      "injury — the subject's OWN injury, surgery, or medical status, reported as new. An expert or doctor analysing an injury already known, or an update on recovery, is a quote. Another fighter's injury, even one sustained against the subject, is not the subject's injury: NO_CLAIM.",
      "negotiation — the promotion or both camps working on a specific fight for the subject: an offer, terms, a bout agreement in progress. A fighter or manager merely calling the subject out (\"I want to fight him\") is a quote.",
      "quote — the subject, or someone notable, says something substantive ABOUT the subject: an opinion, an assessment, a callout, a stated intention. This is the default for interviews. If the subject is only one name inside someone else's story — a third fighter is called out, the subject is on a list or used as a comparison — that is not a quote about the subject: NO_CLAIM, role passing.",
      "prediction — a forecast about the subject's fight or path.",
      "other — a career fact that fits nothing above (a contract, a camp change, a ranking move, a status update).",
    ],
    // The reader's own test (goals.md, "what useful means"): would a follower
    // of the subject learn something new about HIM from this article? The
    // examples are Anton's rulings from the first grading pass — the
    // `prompt` split of corpus/graded-2026-09.json, reserved for this use.
    newsGuide:
      "\"yes\" when a follower learns something new about the subject himself: his fights, career, status, health, a notable person's assessment of him, a callout at him, his own substantial account of his life. \"no\" when the article is about ANOTHER fighter and the subject appears as that fighter's past opponent, a comparison, or a name inside that fighter's quotes — even if the subject is discussed at length, the news is about the other fighter. Also \"no\" when a peer names who the subject should fight, when the piece is lifestyle or training trivia, or when it retells an old fight (a photo caption, a highlights clip, a recap).",
    newsExamples: [
      ["A rival's camp asks for the subject as the rival's first opponent", "yes"],
      ["The champion gives his honest take on the subject's loss", "yes"],
      ["A famous coach says the subject needs several wins before a title shot", "yes"],
      ["A doctor explains what the subject's nose damage means", "yes"],
      ["The subject recalls being bullied as a child, at length", "yes"],
      ["A rival names a surprising next opponent for the subject", "no"],
      ["Another fighter's manager discusses that fighter's future; the subject is the man he beat", "no"],
      ["A fighter thanks the champion for beating the subject", "no"],
      ["A boxing star says MMA stars like the subject would be welcome in boxing", "no"],
      ["Two managers trade insults over criticism of the subject", "no"],
      ["A fighter warns the subject against moving up a weight class", "no"],
      ["The subject's trainer explains a vision-training gadget", "no"],
      ["The subject shares one lesson from his divorce", "no"],
    ],
    // How to read subject_role when the article's substance is someone's
    // words about the subject: named in the headline and discussed at
    // length is supporting, not passing. Passing is reserved for background
    // colour. Same origin as claimTypeGuide.
    roleGuide:
      "When the article's substance is a notable person's assessment OF the subject — a champion on the subject's loss, a rival's coach breaking down the subject's game, a doctor on the subject's injury — the subject is \"supporting\" even though someone else is speaking. \"passing\" is for background colour only: a comparison, a name in a list, an opponent's teammate.",
    // Fallback for watchlist entries that supply no `confusables` of their
    // own. Deliberately names nobody: concrete hints belong on the subject
    // they describe, in the (private) watchlist. Naming real people here put
    // one subject's namesake in every other subject's prompt as pure noise,
    // and put those names in a public file.
    confusables:
      "a namesake (an unrelated person who happens to share the name), a relative who competes in the same sport",
  },
};
