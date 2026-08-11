// Rebuilds test/corpus/{tune,holdout}.json — the labelled evaluation corpus.
//
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node corpus/build.js
//
// The JSON files are the artifact and are committed; this script is the record of
// HOW they were labelled, so a label can be argued with in review rather than
// discovered by reading JSON. Article text is pulled live from the items table —
// only the labels and the synthetic items live here.
//
// Labels are what the system SHOULD answer, not what it answers today. Several
// deliberately disagree with the `production` block recorded alongside them; that
// disagreement is the point (see README.md).
//
// Read-only against the database. Never writes, never deletes.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../lib/db.js";

const db = await openDb();
const { rows: archive } = await db.query(
  `SELECT id, url, resolved_url, subject, title, source, published_at,
          posted, held_reason, digest_tier, subject_role, body_via, edition, body
     FROM items ORDER BY id`
);
await db.end();
const byId = new Map(archive.map((r) => [Number(r.id), r]));

// ---------------------------------------------------------------------------
// Labels for archive-sourced items. `a<N>` refers to items.id = N.
// verdict/role/tier/kind are the DESIRED answers (see README).

const L = (archive_id, cls, expect, note) => ({ archive_id, cls, expect, note });

const TUNE_ARCHIVE = [
  // --- announcement (real: the only fight announcement the archive holds) ---
  L(16, "announcement",
    { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: "Punahele Soriano", event: "UFC Fight Night 287", date: "2026-09-05", location: "Paris" } },
    "Cleanest of the Donchenko cluster: opponent, event, date and location all in 1,145 chars of Ukrainian prose. The reference case for announcement extraction."),
  L(17, "announcement",
    { verdict: "MATCH", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: "Punahele Soriano", event: "UFC Fight Night", date: "2026-09-05", location: "Paris" } },
    "Same announcement, second outlet, same day. Should MATCH #16's claim as an echo, not open a second claim."),
  L(20, "announcement",
    { verdict: "MATCH", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: "Punahele Soriano", event: "UFC Fight Night 287", date: "2026-09-05", location: "Paris" } },
    "149-char body truncated mid-sentence ('Суперником Донченка стане') — the opponent is in the HEADLINE only. Tests whether extraction reads title+body together."),

  // --- claim_news: subject is central and something is asserted ---
  L(1, "claim_news",
    { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "prediction", sourcing: "reported", facts: {} },
    "Masvidal tips Amosov as future welterweight champion. Origin of claim #9 in the live archive."),
  L(44, "claim_news",
    { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "quote", sourcing: "official",
      facts: { opponent: "Justin Gaethje", method: "TKO round 4" } },
    "Topuria's own first statement after the Gaethje loss, quoting his Instagram. Subject speaking about himself — the strongest sourcing tier short of a promotion."),
  L(50, "claim_news",
    { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "quote", sourcing: "reported", facts: { opponent: "Carlos Prates" } },
    "Prates warns Topuria off welterweight. Headline names him; body is about him throughout."),
  L(43, "claim_news",
    { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "quote", sourcing: "reported", facts: {} },
    "Manager war: Kawa vs Abdelaziz over Topuria. Central even though the speakers are managers, not fighters."),

  // --- assessment: someone notable evaluates the subject, inside another story ---
  L(110, "assessment",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "assessment",
      claim_type: null, sourcing: null, facts: {} },
    "Tsarukyan's coach rates Ruffy's arsenal above Topuria's. Posted as a full headline on 2026-08-11 — the case that started the tier rework. Useful to the group, but not a headline."),
  L(8, "assessment",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "assessment",
      claim_type: null, sourcing: null, facts: {} },
    "Makhachev on what he took from the Topuria and Chimaev upsets. A champion assessing the subject, inside his own fight preview."),

  // --- context: the subject's career as backdrop in someone else's story ---
  L(116, "context",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "context",
      claim_type: null, sourcing: null, facts: {} },
    "UFC 330 preview; Topuria is one of two cautionary examples in a 'curse of the first defence' narrative. Note the Topuria passage sits past char 1,500 — beyond today's matcher excerpt."),
  L(9, "context",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "context",
      claim_type: null, sourcing: null, facts: {} },
    "Same underlying story as #8 from a different outlet, but framed as Makhachev's motivation — context rather than assessment. The pair tests the assessment/context boundary."),

  // --- orbit: the subject's people, not the subject ---
  L(115, "orbit",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "orbit",
      claim_type: null, sourcing: null, facts: {} },
    "City news about a sports conference in León; Topuria appears only as a credential in his performance doctor's bio. Posted as a full headline on 2026-08-11."),
  L(37, "orbit",
    { verdict: "NO_CLAIM", subject_role: "supporting", digest_tier: "tangential", mention_kind: "orbit",
      claim_type: null, sourcing: null, facts: {} },
    "Profile of the technician behind Topuria's facial-injury recovery. Orbit, but genuinely about his recovery — the class's upper bound, and a fair place to disagree with the label."),

  // --- lifestyle: domain.ignoredTypes, always NO_CLAIM ---
  L(23, "lifestyle",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "orbit",
      claim_type: "lifestyle", sourcing: null, facts: {} },
    "Celebrity listicle: Ibiza as a VIP summer refuge, Topuria one name among DiCaprio and others. Headline names him — the residual-#23 case tier.js documents."),
  L(48, "lifestyle",
    { verdict: "NO_CLAIM", subject_role: "central", digest_tier: "tangential", mention_kind: null,
      claim_type: "lifestyle", sourcing: null, facts: {} },
    "Topuria partying with Ferran Torres in Ibiza. Genuinely central to the article and still worthless to the group — role=central must not rescue a lifestyle item."),

  // --- wrong_subject: not about this fighter at all ---
  L(39, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "An iRacing entry list carrying a namesake 'Yaroslav Amosov'. The confusable the watchlist names explicitly."),
  L(65, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "UFC 330 roundtable about Makhachev vs Garry, filed under Amosov. 9,513 chars of feed content that never concerns him."),
  L(95, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "A betting site's UFC events index. 10,000 chars that are almost entirely navigation furniture — the extraction ladder's worst case."),
  L(3, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "A wire PHOTO CAPTION naming Amosov and Alvarez at UFC 328, plus newspaper boilerplate. No article exists. matcher.js says furniture-only mentions are WRONG_SUBJECT — this is the canonical instance, and it posted anyway."),
  L(105, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "Keyword-stuffed junk: a helicopter crash headline with 'Yaroslav Amosov' appended. Headline-only (403) — the matcher gets nothing but the title."),

  // --- duplicate: Gate 2 should hold these against an item already stored ---
  L(111, "duplicate",
    { verdict: "MATCH", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {}, dedup_against: "a110" },
    "Sherdog's own version of the story boxingnews.com echoed. Held at 0.888 in production — and note the ORIGINAL was held against the echo, because the aggregator's timestamp was 7 minutes fresher."),
  L(13, "duplicate",
    { verdict: "MATCH", subject_role: "supporting", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {}, dedup_against: "a4" },
    "boxingnews.com's rewrite of the Masvidal-on-Amosov quote. Same claim, different words."),
];

const HOLDOUT_ARCHIVE = [
  // --- announcement ---
  L(18, "announcement",
    { verdict: "MATCH", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: "Punahele Soriano", event: "UFC", date: null, location: "Paris" } },
    "8,230 chars of which the first ~1,900 are a site-wide navigation menu; the actual story starts past the matcher's excerpt window. The hard extraction case in the cluster."),
  L(19, "announcement",
    { verdict: "MATCH", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: null, event: null, date: null, location: "Paris" } },
    "95-char stub: 'a Ukrainian fighter will meet an American opponent in Paris in the autumn.' Names nobody. Expects an honest partial — inventing Soriano here is a hallucination, not a win."),

  // --- claim_news ---
  L(4, "claim_news",
    { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "prediction", sourcing: "reported",
      facts: { opponent: "Islam Makhachev" } },
    "Masvidal calls Amosov a nightmare for Makhachev. Origin of live claim #10, which correctly gathered five echoes."),
  L(67, "claim_news",
    { verdict: "NEW", subject_role: "supporting", digest_tier: "main", mention_kind: null,
      claim_type: "negotiation", sourcing: "rumored",
      facts: { opponent: "Usman Nurmagomedov" } },
    "Abdelaziz calls out Topuria for Nurmagomedov's UFC debut. A callout is a negotiation-grade claim, and the hedging ('wants', 'if he goes to the UFC') should read as rumored, not reported."),
  L(30, "claim_news",
    { verdict: "NEW", subject_role: "supporting", digest_tier: "main", mention_kind: null,
      claim_type: "prediction", sourcing: "rumored",
      facts: { opponent: "Usman Nurmagomedov", method: "head kick KO round 3" } },
    "Abdelaziz predicts a third-round KO of Topuria among four named fights. Facts are extractable from a prediction, which the live archive never once managed."),

  // --- assessment ---
  L(79, "assessment",
    { verdict: "NO_CLAIM", subject_role: "supporting", digest_tier: "tangential", mention_kind: "assessment",
      claim_type: null, sourcing: null, facts: {} },
    "French outlet relaying Prates' welterweight warning. Tests the same assessment through a third language and a weak extraction rung (paragraphs, HTML entities intact)."),
  L(24, "assessment",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "assessment",
      claim_type: null, sourcing: null, facts: {} },
    "Tsarukyan's title wait; Topuria appears as the ranking he sits behind. Ranking-position mentions are the thinnest form of assessment."),

  // --- context ---
  L(72, "context",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "context",
      claim_type: null, sourcing: null, facts: {} },
    "Salkilld's post-fight ambitions; Topuria is division scenery. Posted as a full headline on 2026-08-09."),
  L(22, "context",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "context",
      claim_type: null, sourcing: null, facts: {} },
    "Gaethje's plans after taking Topuria's title. The subject is the man the champion beat — backdrop, not story."),

  // --- orbit ---
  L(31, "orbit",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "orbit",
      claim_type: null, sourcing: null, facts: {} },
    "345-char notice that Topuria's physio joins a León conference line-up. Same event as #115 from a second outlet — the weakest useful item in the corpus."),
  L(93, "orbit",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "orbit",
      claim_type: null, sourcing: null, facts: {} },
    "Zuckerberg spars with Merab Dvalishvili, described as 'a friend of Ilia Topuria'. Orbit at two hops — the only tie is a friendship."),
  L(73, "orbit",
    { verdict: "NO_CLAIM", subject_role: "passing", digest_tier: "tangential", mention_kind: "orbit",
      claim_type: null, sourcing: null, facts: {} },
    "Kutateladze headlines a new promotion, described as a teammate of Chimaev and Topuria. The item tier.js cites as why 'passing' had to outrank the mention-count rule: two mentions, pure background."),

  // --- lifestyle ---
  L(25, "lifestyle",
    { verdict: "NO_CLAIM", subject_role: "central", digest_tier: "tangential", mention_kind: null,
      claim_type: "lifestyle", sourcing: null, facts: {} },
    "Topuria's favourite restaurant in Spain, with a career recap attached. Central, well-extracted, and still not news."),

  // --- wrong_subject ---
  L(83, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "MMA Fighting's morning roundup, led by Dakota Ditcheva's hand injuries. A real MMA article about other people entirely."),
  L(59, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "Josh Fremd's PFL knockout. Arrived on a Topuria query and concerns him nowhere."),
  L(104, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "A veteran's medical fundraiser with 'Yaroslav Amosov' stuffed in. Production recorded subject_role=central here — a live example of the matcher's role field going wrong under headline-only input."),
  L(29, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "'When will Aleksandre Topuria fight again?' — Ilia's BROTHER, the confusable the watchlist names. Ilia appears only in the surrounding survey of Spain's UFC roster. The hardest wrong_subject in the set."),
  L(108, "wrong_subject",
    { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    "Japanese-language video junk with the name appended. Headline-only, non-Latin script."),

  // --- duplicate ---
  L(112, "duplicate",
    { verdict: "MATCH", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {}, dedup_against: "a111" },
    "The direct-feed copy of #111 — same Sherdog article reached by a second discovery route. Held at 0.989. Cross-source dedup, not semantic dedup."),
  L(55, "duplicate",
    { verdict: "MATCH", subject_role: "central", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {}, dedup_against: "a43" },
    "Yahoo's syndication of the Kawa-vs-Abdelaziz story. Longer body, same claim."),
];

// ---------------------------------------------------------------------------
// Synthetic items. FABRICATED — see README. All carry .invalid URLs so they can
// never resolve, and synthetic:true so no loader can mistake them for evidence.
//
// Written against facts the archive establishes: Topuria lost to Gaethje by 4th-round
// TKO at the UFC White House card and wants a rematch; Amosov is 30-1, 2-0 in the UFC
// after submitting Neil Magny and Joel Alvarez (UFC 328). Fights below are INVENTED.

const SYNTHETIC = [
  {
    key: "s1", split: "tune", cls: "announcement", subject: "Yaroslav Amosov",
    title: "Yaroslav Amosov to face Michael Morales at UFC 334 in December - MMA Junkie",
    source: "MMA Junkie", edition: "en",
    url: "https://synthetic-fixture.invalid/amosov-morales-ufc334",
    published_at: "2026-11-02T14:10:00.000Z",
    body:
      "Yaroslav Amosov will return to the octagon against Michael Morales at UFC 334 on Dec. 12 in Las Vegas, " +
      "two people with knowledge of the matchup told MMA Junkie on Monday. The promotion has not yet made a formal " +
      "announcement. Amosov (30-1 MMA, 2-0 UFC) has looked untouchable since arriving from Bellator, submitting Neil " +
      "Magny with an anaconda choke on debut and finishing Joel Alvarez with a second-round arm-triangle at UFC 328 in " +
      "May. The 32-year-old Ukrainian has not lost since 2021. Morales (18-0 MMA, 6-0 UFC) brings an unbeaten record of " +
      "his own and is coming off a first-round knockout of Gilbert Burns in September. The welterweight bout is expected " +
      "to serve as the UFC 334 co-main event, beneath a lightweight title fight yet to be confirmed. A win would likely " +
      "put Amosov in the top five at 170 pounds and, according to his American Top Team coaches, within one fight of a " +
      "title shot. \"He has been ready for this for a year,\" teammate Jorge Masvidal said of the matchup.",
    expect: { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: "Michael Morales", event: "UFC 334", date: "2026-12-12", location: "Las Vegas" } },
    note: "The Amosov announcement the archive is missing. Reported-not-official ('has not yet made a formal announcement') so it should be born a rumor, not confirmed.",
  },
  {
    key: "s2", split: "tune", cls: "announcement", subject: "Ilia Topuria",
    title: "Ilia Topuria buscará la revancha ante Justin Gaethje en Madrid - Marca",
    source: "Marca", edition: "es",
    url: "https://synthetic-fixture.invalid/topuria-gaethje-revancha-madrid",
    published_at: "2026-11-04T09:30:00.000Z",
    body:
      "Ilia Topuria tendrá su revancha. El hispano-georgiano se medirá de nuevo a Justin Gaethje el 27 de febrero en el " +
      "Movistar Arena de Madrid, en el que será el primer evento numerado de la UFC celebrado en España, según confirmaron " +
      "a Marca fuentes cercanas a la negociación. El combate, que encabezará UFC 336, pondrá en juego el cinturón del peso " +
      "ligero que Gaethje arrebató a Topuria el pasado junio en la Casa Blanca, donde El Matador cayó por TKO en el cuarto " +
      "asalto y sufrió la primera derrota de su carrera profesional. Topuria, que reveló haber perdido visión en ambos ojos " +
      "durante aquel combate, recibió el alta médica completa en octubre. Su equipo llevaba meses reclamando públicamente la " +
      "revancha inmediata. \"Nunca hubo otra opción\", declaró su mánager, Malki Kawa. La UFC no ha emitido todavía un " +
      "comunicado oficial, aunque Dana White adelantó en septiembre que el regreso de Topuria se produciría en España.",
    expect: { verdict: "NEW", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: "Justin Gaethje", event: "UFC 336", date: "2027-02-27", location: "Madrid" } },
    note: "Spanish-language announcement. Also tests translation: the digest must label the headline '(translated from es)'.",
  },
  {
    key: "s3", split: "tune", cls: "announcement", subject: "Ilia Topuria",
    title: "Topuria's team in talks over February return, no bout agreement signed - Bloody Elbow",
    source: "Bloody Elbow", edition: "en",
    url: "https://synthetic-fixture.invalid/topuria-february-return-talks",
    published_at: "2026-11-04T16:45:00.000Z",
    body:
      "Ilia Topuria's return may be closer than expected, but nothing is signed. Sources indicate the former two-division " +
      "champion's management has held preliminary discussions with the UFC about a February date, with a rematch against " +
      "lightweight champion Justin Gaethje the outcome both camps are said to prefer. No bout agreement has been sent to " +
      "either fighter, and a person close to Gaethje cautioned that the champion has also been offered alternatives. " +
      "Topuria has not competed since losing the title at the promotion's White House card in June, a fourth-round TKO " +
      "that ended a nine-fight unbeaten run. He has spent the intervening months recovering from facial injuries and, by " +
      "his own account, temporary vision loss. Madrid has been repeatedly floated as a venue, though the UFC has not " +
      "committed to a Spanish event and no arena has been booked. Talks are described as ongoing.",
    expect: { verdict: "MATCH", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "negotiation", sourcing: "rumored",
      facts: { opponent: "Justin Gaethje", event: null, date: null, location: "Madrid" } },
    note: "Deliberately hedged version of s2 — 'in talks', 'nothing signed', 'no bout agreement'. Must come back sourcing=rumored with null date/event, and MATCH s2's claim rather than opening a rival one.",
  },
  {
    key: "s4", split: "holdout", cls: "announcement", subject: "Yaroslav Amosov",
    title: "Ярослав Амосов проведе бій проти Майкла Моралеса на UFC 334 - Sport.ua",
    source: "Sport.ua", edition: "uk",
    url: "https://synthetic-fixture.invalid/amosov-morales-ukr",
    published_at: "2026-11-02T18:20:00.000Z",
    body:
      "Український боєць змішаних єдиноборств Ярослав Амосов проведе свій наступний поєдинок 12 грудня на турнірі UFC 334 " +
      "у Лас-Вегасі. Суперником 32-річного українця стане непереможний американець еквадорського походження Майкл Моралес. " +
      "Бій стане для Амосова третім під егідою UFC. Українець залишається непереможним у промоушені: у дебютному поєдинку " +
      "він задушив Ніла Мегні, а у травні на UFC 328 достроково переміг іспанця Хоела Альвареса больовим прийомом у другому " +
      "раунді. Загальний рекорд Амосова становить 30 перемог при одній поразці. Моралес підходить до бою із серією з " +
      "вісімнадцяти перемог поспіль і жодної поразки у професійній кар'єрі. Очікується, що поєдинок стане співголовною " +
      "подією вечора. Перемога може вивести українця до п'ятірки найкращих напівсередньоваговиків світу.",
    expect: { verdict: "MATCH", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "reported",
      facts: { opponent: "Michael Morales", event: "UFC 334", date: "2026-12-12", location: "Las Vegas" } },
    note: "Ukrainian rendering of s1 — same fight, transliterated names ('Майкл Моралес'). Tests cross-language dedup and whether facts normalise back to the Latin spelling.",
  },
  {
    key: "s5", split: "holdout", cls: "announcement", subject: "Yaroslav Amosov",
    title: "UFC 334: Amosov vs. Morales official for December 12 in Las Vegas",
    source: "UFC", edition: "en",
    url: "https://synthetic-fixture.invalid/ufc-334-amosov-morales-official",
    published_at: "2026-11-05T17:00:00.000Z",
    body:
      "The UFC today announced that Yaroslav Amosov will meet Michael Morales in a welterweight bout at UFC 334 on " +
      "Saturday, December 12, at T-Mobile Arena in Las Vegas. The matchup has been finalised as the evening's co-main " +
      "event. Amosov, the former Bellator welterweight champion, is unbeaten in the UFC following submission victories " +
      "over Neil Magny and Joel Alvarez. Morales enters the contest undefeated across eighteen professional bouts. " +
      "Tickets for UFC 334 go on sale to the general public on Friday, November 13. The full card will be announced in " +
      "the coming weeks.",
    expect: { verdict: "MATCH", subject_role: "central", digest_tier: "main", mention_kind: null,
      claim_type: "announcement", sourcing: "official",
      facts: { opponent: "Michael Morales", event: "UFC 334", date: "2026-12-12", location: "Las Vegas" } },
    note: "The confirmation half of the announcement arc, and the ONLY official-source item in the corpus. source is exactly 'UFC' so domain.officialSource (/^ufc(\\.com)?$/i) matches: this must confirm s1's rumor and fire a 🚨 ceremony post. The live archive has zero confirmations, so nothing else exercises this path.",
  },
  {
    key: "s6", split: "holdout", cls: "wrong_subject", subject: "Ilia Topuria",
    title: "Aleksandre Topuria targets December return after shoulder surgery - Sherdog",
    source: "Sherdog", edition: "en",
    url: "https://synthetic-fixture.invalid/aleksandre-topuria-december-return",
    published_at: "2026-11-03T11:15:00.000Z",
    body:
      "Aleksandre Topuria is aiming for a December return, his coach said this week. The bantamweight, who is 3-0 in the " +
      "UFC, has been sidelined since April following surgery on his right shoulder. \"He has been cleared to train fully " +
      "and we are targeting the last card of the year,\" said Agustin Guerra at Climent Club in Alicante. Topuria signed " +
      "with the promotion in 2024 and has stopped all three of his opponents inside the distance. No opponent has been " +
      "named. The 29-year-old is the younger brother of former two-division champion Ilia Topuria, with whom he trains.",
    expect: { verdict: "WRONG_SUBJECT", subject_role: "passing", digest_tier: null, mention_kind: null,
      claim_type: null, sourcing: null, facts: {} },
    note: "A well-formed announcement about the WRONG Topuria. Everything reads like a fight-news item — the only tell is the first name. Deliberately adversarial: this is the confusable the watchlist names, in the shape most likely to fool an extractor tuned for announcements.",
  },
];

// ---------------------------------------------------------------------------

function fromArchive(entry, split) {
  const r = byId.get(entry.archive_id);
  if (!r) throw new Error(`archive item ${entry.archive_id} not found`);
  return {
    key: `a${r.id}`,
    split,
    synthetic: false,
    class: entry.cls,
    archive_id: Number(r.id),
    subject: r.subject,
    title: r.title,
    source: r.source,
    url: r.resolved_url ?? r.url,
    published_at: r.published_at,
    edition: r.edition,
    body: r.body,
    body_chars: r.body ? r.body.length : 0,
    body_via: r.body_via,
    production: {
      posted: r.posted,
      held_reason: r.held_reason,
      digest_tier: r.digest_tier,
      subject_role: r.subject_role,
    },
    expect: entry.expect,
    note: entry.note,
  };
}

function fromSynthetic(s) {
  return {
    key: s.key,
    split: s.split,
    synthetic: true,
    class: s.cls,
    archive_id: null,
    subject: s.subject,
    title: s.title,
    source: s.source,
    url: s.url,
    published_at: s.published_at,
    edition: s.edition,
    body: s.body,
    body_chars: s.body.length,
    body_via: "synthetic",
    production: null,
    expect: s.expect,
    note: s.note,
  };
}

const tune = [
  ...TUNE_ARCHIVE.map((e) => fromArchive(e, "tune")),
  ...SYNTHETIC.filter((s) => s.split === "tune").map(fromSynthetic),
];
const holdout = [
  ...HOLDOUT_ARCHIVE.map((e) => fromArchive(e, "holdout")),
  ...SYNTHETIC.filter((s) => s.split === "holdout").map(fromSynthetic),
];

const outDir = join(dirname(fileURLToPath(import.meta.url)));
mkdirSync(outDir, { recursive: true });
for (const [name, items] of [["tune", tune], ["holdout", holdout]]) {
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify({
    split: name,
    generated_from: "items table (RingFacts archive)",
    item_count: items.length,
    items,
  }, null, 2) + "\n");
}

// Report
const tally = (items) => items.reduce((m, i) => ((m[i.class] = (m[i.class] || 0) + 1), m), {});
console.log("tune   ", tune.length, tally(tune));
console.log("holdout", holdout.length, tally(holdout));
const noBody = [...tune, ...holdout].filter((i) => !i.body);
console.log("headline-only items:", noBody.length, noBody.map((i) => i.key).join(" "));
console.log("synthetic:", [...tune, ...holdout].filter((i) => i.synthetic).length);
