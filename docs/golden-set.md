# The golden set

The one labelled data set every station is scored against. Decided by
Anton on 2026-09-24: it supersedes [corpus/](../corpus/README.md) (48
articles, `tune` + `holdout`) and
[docs/article-feedback.md](article-feedback.md) as evaluation data. Those
stay as history; nothing new is measured on them.

## What it is

- **300 articles**, 31 July – 17 September 2026, drawn from the archive of
  articles that had text. Topuria 182, Donchenko 99, Amosov 19. Frozen:
  `experiments/2026-09-17-role-questions/data/articles.json`; `pull.mjs`
  never runs again.
- **136 stories** — Fable's grouping of those articles by occasion, three
  passes: `experiments/2026-09-20-claim-extraction/clusters.json`.
  48 stories hold more than one article, 88 are singletons.
- **Anton's rulings**, story by story, verbatim and append-only:
  `experiments/2026-09-20-claim-extraction/verdicts.md`. He reviews in the
  extraction report (`report.py` → `REPORT.html`), judging by the
  extracted claims: when independent extracts converge, the article is
  what they say it is.

Why this set: one review flow covers every station, and reading extracts
is the fastest way Anton can verify 300 articles by hand.

## Caveats, stated once

- **It has been used for tuning.** The classifier prompt went through 18
  passes against Fable's verdicts on these same articles. A number
  measured on the whole set is a tuning number. The split below exists
  because of this.
- **It is one fight week.** Every result article is the Donchenko–Soriano
  fight. A rule that passes here may be tuned to that fight.
- **Text only.** The sample was drawn from articles with a body, so it
  cannot test the headline-only path. The other project measured 19% of
  the raw feed headline-only ([lessons.md](lessons.md)).
- **Topuria was thinned**, so his time gaps read long.

## Labels

Per **story** (the occasion is the unit, so one word covers its articles):

| field | values | feeds |
|---|---|---|
| `kind` | booking · result · quote · prediction · preview · lifestyle · injury · other | Classifier; the tier-1 rule |
| `speaker` | himself · his_coach · opponent_coach · manager · pundit · another_fighter · none — quote stories only | Classifier (the "only the coach" rule) |
| `bout` | a bout id such as `donchenko-soriano-2026-09-06`, or none | Join-or-start guard; predictions merge; post-fight window; the arc |
| `tier` | now · weekly · never | Decider; the digest writer's "did it skip the right stories" |
| `extract_ok` | yes, or a note of what the extract missed | Extractor |
| `grouping` | right, or which articles belong elsewhere | Join-or-start |

Per **article**, only where it applies:

| field | values | feeds |
|---|---|---|
| `body_unusable` | true when the body is CSS, navigation or a video stub (~10–15 expected) | Body extractor's quality check |
| `same_page_as` | id of the article this is an exact copy of (the AMP edition case) | URL dedup |
| `primary_source` | the article, or an outside link, the digest should point to | Digest writer's "link the essay, not the write-up" |

Anton's words stay in `verdicts.md`. A derived `labels.json` next to it
holds one row per story with the fields above, written from his rulings,
never by hand. The report collects the fields as he rules so nothing is
typed twice.

## The split

By **story**, never by article — the articles of one story would leak
across otherwise.

- **Tune**: about two thirds of the stories. Prompts, thresholds and
  rules may be adjusted while looking at these.
- **Test**: about one third. Nobody adjusts anything while looking at
  these. Each station's design is scored on them once, and the score is
  recorded with the design it belongs to.
- Drawn with a fixed seed, stratified by fighter and by `kind`, so the
  test third holds results, bookings, quotes and predictions. Recorded in
  `split.json` beside `labels.json`.
- The ten Soriano prediction stories merge into one at rebuild and fall on
  one side together.
- **Replay everything, score the test third.** The join-or-start test
  must replay all 300 in date order, because a test-side result article
  must see the tune-side booking as a candidate. Only the test-side
  decisions count; tuning looks only at tune-side errors.

## Order of work

1. Finish the rulings: 102 stories remain (88 singletons go fast).
2. Pre-flag body suspects and exact copies so Anton only confirms.
3. Add `kind`, `speaker`, `bout`, `tier` to each ruled story; derive
   `labels.json`.
4. Freeze. Draw the split. Record `split.json`.
5. Score each station once on the test third; write the number into
   [decisions.md](decisions.md) beside the design.

## Growing it

A later slice — Topuria's next fight, a headline-only week — joins the
same way: same report, same rulings file, same fields, then a fresh split
that keeps every old story on the side it was on. Never a new grader.
