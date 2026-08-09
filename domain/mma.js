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
    // Fallback for watchlist entries that supply no `confusables` of their
    // own. Deliberately names nobody: concrete hints belong on the subject
    // they describe, in the (private) watchlist. Naming real people here put
    // one subject's namesake in every other subject's prompt as pure noise,
    // and put those names in a public file.
    confusables:
      "a namesake (an unrelated person who happens to share the name), a relative who competes in the same sport",
  },
};
