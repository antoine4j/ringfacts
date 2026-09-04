# Evaluation corpus

48 labelled articles for tuning the matcher, the tier rule, and fact extraction
without waiting for the news cycle. Announcements are rare — Donchenko's was the
only one the bot has ever seen, and it arrived before most of the current
pipeline existed — so the rarest and most important class is topped up with
fabricated items rather than left as a single example.

| File | What it is |
|---|---|
| `tune.json` | 25 items. Iterate against these freely. |
| `holdout.json` | 23 items. **Control set — do not tune against it.** Run it once when you think you're done. |
| `build.js` | Regenerates both from the live `items` table. The record of how each label was chosen. |
| `measure-tier.js` | Scores both tier orderings against the labels. No LLM, no writes, free, instant. |
| `measure-matcher.js` | Asks Haiku the same question K times per item and reports stability + accuracy. Costs money. Superseded by `bench/run.js --repeat`, which does the same on the test keys. |
| `graded-2026-09.json` | 103 posted articles from Aug 5 – Sep 4, each with the goals.md **bucket** Anton confirmed (`expect.bucket`), in three splits: `prompt` (the 14 worked examples from goals.md, reserved as few-shot material), `tune` (45) and `holdout` (44), balanced per bucket. |
| `graded.js`, `build-graded.js` | Regenerate that file from the grading doc and the archive. The labels are Anton's, not Claude's. |

Both measure scripts are **read-only** — `measure-tier.js` makes no database call
that isn't a `SELECT`, `measure-matcher.js` opens the database only to read
candidate claims and closes it before the first LLM call. Neither imports
anything that writes or posts. Findings from both are recorded in `TODO.md`.

```bash
# free, offline apart from one SELECT
DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
  node corpus/measure-tier.js

# ~$0.30 for 48 items x 5 runs; set K to change
DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret=anthropic-api-key) \
  K=5 node corpus/measure-matcher.js
```

## The one thing to understand before reading a label

**Labels say what the system *should* answer, not what it does.** Several
deliberately contradict production, and every item carries a `production` block
so you can see the disagreement:

```json
"production": { "posted": true, "digest_tier": "main", "subject_role": "passing" },
"expect":     { "digest_tier": "tangential", "mention_kind": "assessment" }
```

That row is `a110`. Production gave it a full headline; the corpus says it should
have been folded. A green run against this corpus is therefore a change to the
code, never a change to the labels — **if you find yourself editing an `expect`
to make a run pass, stop.** Argue the label in review, in `build.js`, on its
merits; then regenerate.

## Fields

| Field | Meaning |
|---|---|
| `key` | `a<N>` = archive item N. `s<N>` = synthetic. Stable; referenced by `dedup_against`. |
| `class` | One of the eight below. |
| `body` | Extracted article text, or `null` for headline-only items (6 of 48 — a real and common case). |
| `body_via` | Which extraction rung produced it, straight from the archive. |
| `production` | What the live pipeline actually recorded. `null` for synthetic items. |
| `expect` | The desired answer: `verdict`, `subject_role`, `digest_tier`, `mention_kind`, `claim_type`, `sourcing`, `facts`, and `dedup_against` where relevant. |
| `note` | Why this item is in the corpus and what it tests. |

`mention_kind` is not yet a field the code produces — it is the assessment /
context / orbit gradient, recorded here so the corpus is ready if that judgment
gets built. Scoring should skip it until then.

## Classes

| Class | What it means | Desired handling |
|---|---|---|
| `announcement` | A fight is scheduled or being negotiated | `NEW`/`MATCH`, full facts, ceremony post once official |
| `claim_news` | Subject is central and something is asserted | `NEW`/`MATCH`, `main` |
| `assessment` | Someone notable evaluates the subject, inside another story | `NO_CLAIM`, `passing`, folded — but the most useful thing in the fold |
| `context` | The subject's career as backdrop in someone else's story | `NO_CLAIM`, `passing`, folded |
| `orbit` | The subject's coach, doctor, manager, brother, friends | `NO_CLAIM`, `passing`, folded |
| `lifestyle` | Restaurants, holidays, celebrity spotting | `NO_CLAIM` (`domain.ignoredTypes`) |
| `wrong_subject` | Namesakes, keyword junk, other fighters' news, site furniture | `WRONG_SUBJECT`, dropped |
| `duplicate` | A story already stored under another key | Held at Gate 2 against `dedup_against` |

The assessment / context / orbit split is the gradient found by reading the three
items posted on 2026-08-11, all of which the matcher correctly called `passing`
and the tier rule promoted anyway. They are not equally useful: a rival coach
breaking down Topuria's arsenal (`a110`) is worth a link; his physio speaking at
a conference (`a115`) is close to nothing.

## Synthetic items (⚗ — 6 of 48)

`s1`–`s6` are **fabricated**. They are not reporting, were never published, and
describe fights that have not been booked.

Three guards keep them contained: `synthetic: true` on every item, a
`synthetic-fixture.invalid` URL that cannot resolve, and `production: null`.
They exist only because the archive cannot supply what they cover:

- **an Amosov and a Topuria announcement** — the archive has neither
- **a confirmation** (`s5`, source exactly `UFC`, so `domain.officialSource`
  matches) — the archive has **zero**, so nothing else exercises the
  rumor → confirmed path or the 🚨 ceremony post
- **the rumor/official distinction** — `s1` reported, `s3` hedged, `s5` official,
  all describing the same two fights
- **cross-language duplicates of a known fight** (`s1`/`s4`, `s2`/`s3`)
- **an adversarial near-miss** (`s6`): a well-formed announcement about
  *Aleksandre* Topuria, the brother the watchlist names as a confusable

They are written against facts the archive establishes — Topuria's fourth-round
TKO loss to Gaethje at the White House card and his stated wish for a rematch;
Amosov at 30-1, 2-0 in the UFC via Magny and Alvarez — so only the future fights
are invented. Real fighter names are used deliberately: a fixture full of
placeholders would not test a matcher whose job is recognising real people.

## Using it

The bench reads these files: `node bench/run.js --step <step> --from
corpus/<file>.json [--split s] [--repeat K]` (bench/README.md). The `bucket`
step scores `expect.bucket`; `tier` and `matcher` score the older fields.

Two rules for scoring:

1. **Score as a rate, not pass/fail.** The matcher samples at the API default
   temperature and has returned different verdicts for the same input
   (`TODO.md`). Run each item K times and report a rate with spread; a single
   run proves nothing.
2. **Keep the holdout closed.** Its only value is having never been tuned
   against. Run it at the end of a change, not during.

## Known gaps

Honest about what 48 items do not cover:

- **`lifestyle` has 3 items and `assessment`/`context` have 4 each.** The archive
  simply doesn't hold more clean examples. Thin classes give noisy rates.
- **Every subject is one of the three on the current watchlist**, so the corpus
  cannot detect rules that are secretly Topuria-shaped.
- **One real announcement cluster.** Five of the ten announcement items are
  fabricated, and fabricated prose is more regular than the real thing.
- **No `injury`, `result`, or `denial` items** — the archive has no clean
  instance of any. Results in particular will matter once a watched fighter
  actually fights.
- **Frozen at 2026-08-11.** Re-run `build.js` to pick up new archive rows; the
  labels for existing keys carry over untouched.

---

## Items

#### `announcement`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a16` | tune | Donchenko | sport24.ua | 1145 | NEW / central / main | Cleanest of the Donchenko cluster: opponent, event, date and location all in 1,145 chars of Ukrainian prose. The reference case for announcement extraction. |
| `a17` | tune | Donchenko | Футбол 24 | 1375 | MATCH / central / main | Same announcement, second outlet, same day. Should MATCH #16's claim as an echo, not open a second claim. |
| `a20` | tune | Donchenko | ukr.net | 149 | MATCH / central / main | 149-char body truncated mid-sentence ('Суперником Донченка стане') — the opponent is in the HEADLINE only. Tests whether extraction reads title+body together. |
| `s1` ⚗ | tune | Amosov | MMA Junkie | 982 | NEW / central / main | The Amosov announcement the archive is missing. Reported-not-official ('has not yet made a formal announcement') so it should be born a rumor, not confirmed. |
| `s2` ⚗ | tune | Topuria | Marca | 917 | NEW / central / main | Spanish-language announcement. Also tests translation: the digest must label the headline '(translated from es)'. |
| `s3` ⚗ | tune | Topuria | Bloody Elbow | 879 | MATCH / central / main | Deliberately hedged version of s2 — 'in talks', 'nothing signed', 'no bout agreement'. Must come back sourcing=rumored with null date/event, and MATCH s2's claim rather than opening a rival one. |
| `a18` | holdout | Donchenko | Sport.ua | 8230 | MATCH / central / main | 8,230 chars of which the first ~1,900 are a site-wide navigation menu; the actual story starts past the matcher's excerpt window. The hard extraction case in the cluster. |
| `a19` | holdout | Donchenko | ua.korrespondent.net | 95 | MATCH / central / main | 95-char stub: 'a Ukrainian fighter will meet an American opponent in Paris in the autumn.' Names nobody. Expects an honest partial — inventing Soriano here is a hallucination, not a win. |
| `s4` ⚗ | holdout | Amosov | Sport.ua | 782 | MATCH / central / main | Ukrainian rendering of s1 — same fight, transliterated names ('Майкл Моралес'). Tests cross-language dedup and whether facts normalise back to the Latin spelling. |
| `s5` ⚗ | holdout | Amosov | UFC | 568 | MATCH / central / main | The confirmation half of the announcement arc, and the ONLY official-source item in the corpus. source is exactly 'UFC' so domain.officialSource (/^ufc(\.com)?$/i) matches: this must confirm s1's rumor and fire a 🚨 ceremony post. The live archive has zero confirmations, so nothing else exercises this path. |

#### `claim_news`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a1` | tune | Amosov | heavy.com | 2179 | NEW / central / main | Masvidal tips Amosov as future welterweight champion. Origin of claim #9 in the live archive. |
| `a44` | tune | Topuria | Yahoo Sports | 685 | NEW / central / main | Topuria's own first statement after the Gaethje loss, quoting his Instagram. Subject speaking about himself — the strongest sourcing tier short of a promotion. |
| `a50` | tune | Topuria | MMA Sucka | 3454 | NEW / central / main | Prates warns Topuria off welterweight. Headline names him; body is about him throughout. |
| `a43` | tune | Topuria | MMA Sucka | 2450 | NEW / central / main | Manager war: Kawa vs Abdelaziz over Topuria. Central even though the speakers are managers, not fighters. |
| `a4` | holdout | Amosov | MMA Junkie | 1134 | NEW / central / main | Masvidal calls Amosov a nightmare for Makhachev. Origin of live claim #10, which correctly gathered five echoes. |
| `a67` | holdout | Topuria | boxingnews.com | 1568 | NEW / supporting / main | Abdelaziz calls out Topuria for Nurmagomedov's UFC debut. A callout is a negotiation-grade claim, and the hedging ('wants', 'if he goes to the UFC') should read as rumored, not reported. |
| `a30` | holdout | Topuria | MMA Sucka | 2438 | NEW / supporting / main | Abdelaziz predicts a third-round KO of Topuria among four named fights. Facts are extractable from a prediction, which the live archive never once managed. |

#### `assessment`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a110` | tune | Topuria | boxingnews.com | 1692 | NO_CLAIM / passing / tangential / assessment | Tsarukyan's coach rates Ruffy's arsenal above Topuria's. Posted as a full headline on 2026-08-11 — the case that started the tier rework. Useful to the group, but not a headline. |
| `a8` | tune | Topuria | boxingnews.com | 1732 | NO_CLAIM / passing / tangential / assessment | Makhachev on what he took from the Topuria and Chimaev upsets. A champion assessing the subject, inside his own fight preview. |
| `a79` | holdout | Topuria | lasueur.com | 1715 | NO_CLAIM / supporting / tangential / assessment | French outlet relaying Prates' welterweight warning. Tests the same assessment through a third language and a weak extraction rung (paragraphs, HTML entities intact). |
| `a24` | holdout | Topuria | Mundo Deportivo | 2095 | NO_CLAIM / passing / tangential / assessment | Tsarukyan's title wait; Topuria appears as the ranking he sits behind. Ranking-position mentions are the thinnest form of assessment. |

#### `context`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a116` | tune | Topuria | SPORT | 4394 | NO_CLAIM / passing / tangential / context | UFC 330 preview; Topuria is one of two cautionary examples in a 'curse of the first defence' narrative. Note the Topuria passage sits past char 1,500 — beyond today's matcher excerpt. |
| `a9` | tune | Topuria | BJPenn.com | 5425 | NO_CLAIM / passing / tangential / context | Same underlying story as #8 from a different outlet, but framed as Makhachev's motivation — context rather than assessment. The pair tests the assessment/context boundary. |
| `a72` | holdout | Topuria | Sports Illustrated | 5799 | NO_CLAIM / passing / tangential / context | Salkilld's post-fight ambitions; Topuria is division scenery. Posted as a full headline on 2026-08-09. |
| `a22` | holdout | Topuria | Diario AS | 2216 | NO_CLAIM / passing / tangential / context | Gaethje's plans after taking Topuria's title. The subject is the man the champion beat — backdrop, not story. |

#### `orbit`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a115` | tune | Topuria | Digital de León | 2709 | NO_CLAIM / passing / tangential / orbit | City news about a sports conference in León; Topuria appears only as a credential in his performance doctor's bio. Posted as a full headline on 2026-08-11. |
| `a37` | tune | Topuria | El Comercio | 3004 | NO_CLAIM / supporting / tangential / orbit | Profile of the technician behind Topuria's facial-injury recovery. Orbit, but genuinely about his recovery — the class's upper bound, and a fair place to disagree with the label. |
| `a31` | holdout | Topuria | Diario de León | 345 | NO_CLAIM / passing / tangential / orbit | 345-char notice that Topuria's physio joins a León conference line-up. Same event as #115 from a second outlet — the weakest useful item in the corpus. |
| `a93` | holdout | Topuria | OkDiario | 2446 | NO_CLAIM / passing / tangential / orbit | Zuckerberg spars with Merab Dvalishvili, described as 'a friend of Ilia Topuria'. Orbit at two hops — the only tie is a friendship. |
| `a73` | holdout | Topuria | Bloody Elbow | 2347 | NO_CLAIM / passing / tangential / orbit | Kutateladze headlines a new promotion, described as a teammate of Chimaev and Topuria. The item tier.js cites as why 'passing' had to outrank the mention-count rule: two mentions, pure background. |

#### `lifestyle`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a23` | tune | Topuria | HOLA | 1025 | NO_CLAIM / passing / tangential / orbit | Celebrity listicle: Ibiza as a VIP summer refuge, Topuria one name among DiCaprio and others. Headline names him — the residual-#23 case tier.js documents. |
| `a48` | tune | Topuria | MMA Sucka | 2539 | NO_CLAIM / central / tangential | Topuria partying with Ferran Torres in Ibiza. Genuinely central to the article and still worthless to the group — role=central must not rescue a lifestyle item. |
| `a25` | holdout | Topuria | ABC | 2521 | NO_CLAIM / central / tangential | Topuria's favourite restaurant in Spain, with a career recap attached. Central, well-extracted, and still not news. |

#### `wrong_subject`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a39` | tune | Amosov | Mshale | — | WRONG_SUBJECT / passing / — | An iRacing entry list carrying a namesake 'Yaroslav Amosov'. The confusable the watchlist names explicitly. |
| `a65` | tune | Amosov | MMA Fighting | 9513 | WRONG_SUBJECT / passing / — | UFC 330 roundtable about Makhachev vs Garry, filed under Amosov. 9,513 chars of feed content that never concerns him. |
| `a95` | tune | Topuria | Bwin | 10000 | WRONG_SUBJECT / passing / — | A betting site's UFC events index. 10,000 chars that are almost entirely navigation furniture — the extraction ladder's worst case. |
| `a3` | tune | Amosov | The Lufkin Daily News | 2055 | WRONG_SUBJECT / passing / — | A wire PHOTO CAPTION naming Amosov and Alvarez at UFC 328, plus newspaper boilerplate. No article exists. matcher.js says furniture-only mentions are WRONG_SUBJECT — this is the canonical instance, and it posted anyway. |
| `a105` | tune | Amosov | mshale.com | — | WRONG_SUBJECT / passing / — | Keyword-stuffed junk: a helicopter crash headline with 'Yaroslav Amosov' appended. Headline-only (403) — the matcher gets nothing but the title. |
| `a83` | holdout | Topuria | MMA Fighting | 5104 | WRONG_SUBJECT / passing / — | MMA Fighting's morning roundup, led by Dakota Ditcheva's hand injuries. A real MMA article about other people entirely. |
| `a59` | holdout | Topuria | Bloody Elbow | 2140 | WRONG_SUBJECT / passing / — | Josh Fremd's PFL knockout. Arrived on a Topuria query and concerns him nowhere. |
| `a104` | holdout | Amosov | Mshale | — | WRONG_SUBJECT / passing / — | A veteran's medical fundraiser with 'Yaroslav Amosov' stuffed in. Production recorded subject_role=central here — a live example of the matcher's role field going wrong under headline-only input. |
| `a29` | holdout | Topuria | ABC | 3039 | WRONG_SUBJECT / passing / — | 'When will Aleksandre Topuria fight again?' — Ilia's BROTHER, the confusable the watchlist names. Ilia appears only in the surrounding survey of Spain's UFC roster. The hardest wrong_subject in the set. |
| `a108` | holdout | Amosov | Mshale | — | WRONG_SUBJECT / passing / — | Japanese-language video junk with the name appended. Headline-only, non-Latin script. |
| `s6` ⚗ | holdout | Topuria | Sherdog | 564 | WRONG_SUBJECT / passing / — | A well-formed announcement about the WRONG Topuria. Everything reads like a fight-news item — the only tell is the first name. Deliberately adversarial: this is the confusable the watchlist names, in the shape most likely to fool an extractor tuned for announcements. |

#### `duplicate`
| key | split | subject | source | body | expect | note |
|---|---|---|---|---|---|---|
| `a111` | tune | Topuria | Sherdog | — | MATCH / passing / — | Sherdog's own version of the story boxingnews.com echoed. Held at 0.888 in production — and note the ORIGINAL was held against the echo, because the aggregator's timestamp was 7 minutes fresher. |
| `a13` | tune | Amosov | boxingnews.com | 1597 | MATCH / supporting / — | boxingnews.com's rewrite of the Masvidal-on-Amosov quote. Same claim, different words. |
| `a112` | holdout | Topuria | Sherdog | — | MATCH / passing / — | The direct-feed copy of #111 — same Sherdog article reached by a second discovery route. Held at 0.989. Cross-source dedup, not semantic dedup. |
| `a55` | holdout | Topuria | Yahoo Sports | 4923 | MATCH / central / — | Yahoo's syndication of the Kawa-vs-Abdelaziz story. Longer body, same claim. |

<sub>⚗ = fabricated fixture, not reporting. `body` column is character count.</sub>
