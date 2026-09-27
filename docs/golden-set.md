# The golden set

The one labelled data set every station is scored against. Decided by
Anton on 2026-09-24: it supersedes [corpus/](../corpus/README.md) (48
articles, `tune` + `holdout`) and
[docs/article-feedback.md](article-feedback.md) as evaluation data. Those
stay as history; nothing new is measured on them.

## What it is

**Everything lives in [`golden/`](../golden/README.md)** since 2026-09-25.
The experiments keep their working copies; golden holds the frozen ones.

- **300 articles**, 31 July – 17 September 2026, drawn from the archive of
  articles that had text. Topuria 182, Donchenko 99, Amosov 19. Frozen:
  `golden/articles.json` (copied once from the role-questions experiment;
  `pull.mjs` never runs again).
- **128 claims** — Fable's grouping of those articles by occasion, three
  passes, then Anton's rulings applied: every multi-article claim (v3), then
  the singleton pass (v4, one join): `golden/claims.json`.
  47 claims hold more than one article, 81 are singletons. A *claim* is
  one occasion with its articles; *story* is reserved for the larger
  thing that may span several claims, not yet labelled.
- **Anton's rulings**, claim by claim, verbatim and append-only:
  `golden/verdicts.md`. He reviews in the
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

**Changed 2026-09-27.** Labels record what an article *is*, never what a
reader wants: a gate (about him yes / partly / no), who is the source, what
is done regarding him, the fact asserted and how firm it is, and the bout.
They are given by correcting the claim map (`golden/board/map.py`), whose
axes are defined first so every claim fits one value on each. Tiers are
not labelled per claim any more: they come from a per-fighter settings
table (cell → tier), checked against Anton's tier on a sample of claims.
The table below is the earlier plan, kept for its bout, extract and
per-article fields; `kind`, `speaker` and `tier` are superseded. Current
order of work: [golden/plan.html](../golden/plan.html).

Per **story** (the occasion is the unit, so one word covers its articles):

| field | values | feeds |
|---|---|---|
| `kind` | booking · result · quote · prediction · preview · lifestyle · injury · other | Classifier; the tier-1 rule |
| `speaker` | himself · his_coach · opponent_coach · manager · pundit · another_fighter · none — quote stories only | Classifier (the "only the coach" rule) |
| `bout` | a bout id such as `donchenko-soriano-2026-09-06`, or none | Join-or-start guard; predictions merge; post-fight window; the arc |
| `tier` | 1 (post now) · 2 (weekly digest) · 3 (never) | Decider; the digest writer's "did it skip the right stories" |
| `extract_ok` | yes, or a note of what the extract missed | Extractor |
| `grouping` | right, or which articles belong elsewhere | Join-or-start |

Per **article**, only where it applies:

| field | values | feeds |
|---|---|---|
| `body_unusable` | true when the body is CSS, navigation or a video stub (~10–15 expected) | Body extractor's quality check |
| `same_page_as` | id of the article this is an exact copy of (the AMP edition case) | URL dedup |
| `primary_source` | the article, or an outside link, the digest should point to | Digest writer's "link the essay, not the write-up" |

Anton's words stay in `golden/verdicts.md`. A derived `golden/labels.json`
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
  `golden/split.json` beside `labels.json`.
- The ten Soriano prediction stories merge into one at rebuild and fall on
  one side together.
- **Replay everything, score the test third.** The join-or-start test
  must replay all 300 in date order, because a test-side result article
  must see the tune-side booking as a candidate. Only the test-side
  decisions count; tuning looks only at tune-side errors.

## Order of work

1. Finish the rulings: all 47 multi-article claims ruled (2026-09-25); the
   seven singleton pairs Fable could not place ruled (2026-09-27, v4). The
   other 74 singletons stand as built and are checked in passing while labelling.
2. Pre-flag body suspects and exact copies so Anton only confirms: done,
   14 settled on the live pages (2026-09-27).
3. Add `kind`, `speaker`, `bout`, `tier` to each ruled story; derive
   `labels.json`.
4. Freeze. Draw the split. Record `split.json`.
5. Score each station once on the test third; write the number into
   [decisions.md](decisions.md) beside the design.

## Growing it

A later slice — Topuria's next fight, a headline-only week — joins the
same way: same report, same rulings file, same fields, then a fresh split
that keeps every old story on the side it was on. Never a new grader.
