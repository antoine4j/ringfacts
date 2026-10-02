# An answer key for the classifier, and the loop it makes possible

**Status:** run 2026-09-27, autonomous session. The key is **provisional**:
Fable and Opus readers, not Anton. Every accuracy below means "agrees with
the readers' reading of key-guide.md", not "right". Anton's corrections
turn it into a real key; then everything is rescored with `score.py`.

**Question.** v1–v5 were judged by plausibility (counts that looked wrong,
questions contradicting each other). That catches a 224-of-300 blow-up but
cannot tell a 70% question from a 90% one. Can a small answer key make each
question change measurable, cheaply, and which changes help?

## The key

- **59 articles** (`key-articles.json`, `select.py`): the 10 hand-checked
  v5 articles and 2 known fact traps, then a seeded draw that fills quotas
  by fighter × language and makes every v5 option of fact, source and act
  appear twice; one article per claim. **39 tune, 20 held back** — the
  held-back 20 were never looked at while changing questions.
- **These 58 claims must fall on the tune side when the split is drawn**
  (golden/README.md, `split.json`): the questions were tuned on them.
- **Labelled blind** from `key-guide.md` (the approved axes plus the v4/v5
  changes) by two Fable readers (A, B; about 120–132 k tokens per 20
  articles). They agreed on **511 of 531 answers (96%)**; an Opus reader,
  also blind, settled 18 of the 20 differences; **2 are split** (#10, #740,
  both source) and left for Anton. `build_key.py` → `key.json`.
- **Checked against my own answers written before v5 ran** on 10 articles:
  23 of 25 match; both differences (#833, #620) read as defensible for the
  readers.
- **Judgement calls of mine the readers inherit:** how firm is `none` when
  the fact is `no fact`; a coach or manager saying it will happen is
  `reported`; act is `none of these` when he is only mentioned.

## The loop

`run.py` sends question variants for the key articles only — several
wordings of one question ride in one request, since JEV evaluates each
question in isolation — and books every call in `ledger.json`. `score.py`
scores each variant per part, counts what each option **swallows** (taken,
and wrong by the key), and composes how firm from the fact answer.

| round | changed | result on tune (39) |
|---|---|---|
| 1 | fact: `not_for` on result / next fight / fight week; act: an `only_mentions_him` option; how firm: 4 levels | fact 59 → 76%, act 59 → 74% (the new option is the key's "none of these"), how firm composed with fact 26 → 72% |
| 2 | source `not_for` on himself / promotion; centrality level wording; fact "about another fighter is no fact"; act steers vs news | +1 article each: inside the noise |
| 3 | how firm by "is it settled" | no better than plain 4 levels; the same fact question moved 2 articles between identical runs, so **± 2 articles (5%) is noise** |
| 4 | source: stronger "himself" boundary | identical answers; not kept |

## v5 → v6, the whole set (full-pass answers on the key)

| question | tune | held back |
|---|---|---|
| act | 56% → 72% | 65% → 80% |
| fact | 59% → 82% | 55% → 75% |
| how firm (composed with fact) | 59% → 79% | 70% → 85% |
| centrality | 79% → 85% | 95% → 95% |
| source | 79% → 84% | 74% → 74% |
| four yes/no | 92–100% | 85–100% (unchanged) |

- **The gains hold on the held-back 20**, so they are not fitted to the 39.
- **Source is stuck at about 80%.** Most misses are articles where he is
  only mentioned, where "whose words are the news about him" has no real
  answer (the readers themselves used media / no one / none of these
  interchangeably). Where he is central it is 25 of 31 both before and
  after; the rest are borderline (#732 a fight report with his callout in
  the headline).
- **How firm needed composition, not wording**: the classifier grades any
  claim, even an opinion; the key says `none` when there is no fact. Asked
  in four levels and set to `none` in code where fact is `no fact`.
- **Independent of the key, the map's consistency checks improved** from v5
  to v6 (claims): source/act contradictions 22 → 13, fact vs its yes/no
  twin 40 → 29.

**Cost:** $0.10 of the $1 JEV budget (`ledger.json`): $0.04 on the loop,
$0.06 on one v6 pass of all 300. Fable/Opus readers ran on the subscription.

## All 300 labelled the same way

At Anton's go-ahead, the other 241 golden articles were labelled by the
same readers from the same guide (26 Fable agents, 3 Opus tie-breakers;
`batches-rest/`, `readers-rest/`, `build_key.py --rest` → `labels-rest.json`),
and `build_labels.py` merges both into `golden/answers/readers-v1.json`.

- **Agreement 2,052 of 2,169 answers (95%)** on the 241; across all 300,
  2,563 agreed, 132 settled by Opus, 5 split. Fact and how firm split most
  (213 and 215 of 241 agreed).
- **The six exact-copy pairs got identical answers, 54 of 54**, from
  different readers in different batches.
- **v6 on the 241 it was never tuned on** (agreement with the readers, not
  a test score — no question was changed on these):

  | question | v5 | v6 |
  |---|---|---|
  | fact | 61% | 74% |
  | how firm | 56% | 74% |
  | act | 80% | 87% |
  | source | 81% | 85% |
  | centrality | 85% | 84% |
  | yes/no | 87–97% | 87–97% |

- #134, #655 (saved text unusable) and #230 (cut before his mention) are
  flagged: their answers describe what was saved, not the article.
- Tokens on the subscription: about 4.3 million for all readers and
  tie-breakers (0.88 M for the key, 3.46 M for the rest).

## Overnight re-reads, to cut the review down (2026-10-02)

Three unattended jobs on the subscription (23 Fable agents, about 2.9 M
tokens, no JEV), inputs and outputs under `overnight/`. All three produce
hints for Anton's review, never labels; nothing in `readers-v1.json` changed.

- **Boundary briefs** (`briefs/out-<group>.json`, one per group in
  `boundaries.json`): the 75 articles where the readers differed, grouped
  by the judgement they split on; for each group, the ways to read the
  question, the signals in the text, and 2–3 candidate rules with the
  answer each gives per article, formed from tune/check articles only.
  Recommended rules and how many disputed majorities they would change:
  next fight "own news" 16 of 30 (and it would overturn 9 unanimous
  "yes" answers on Paris fight previews); camp "reported as news" 3 of 7;
  health "someone named says how he is" 2 of 6; result "lead clause"
  2 of 5; act "firm and aimed at him" 1 of 8; firmness "done is done"
  1 of 4; centrality "whose news" 0 of 10; other 0 of 5. Thin evidence
  on the small groups: act and firmness each rest on two non-test
  articles.
- **Rule A recheck** (`recheck/A-n.json`, `B-n.json`): two blind readers
  re-answered centrality on the 59 articles labelled "one of several"
  before rule A existed. **They agree on 57 of 59; both move 9 to "only
  mentioned"** (#34, #342, #588, #820, #843, #856, #871, #892, #921: the
  guide's own #856 example, two roundups, and the Pimblett call-out
  pieces); the two splits are #423 and #525, both call-outs.
- **Triage** (`triage/out-n.json`): a third blind reader chose between
  the readers' answer and classifier v6's on the 321 answers where they
  differ, without knowing which was which. **277 sided with the readers,
  44 with the classifier**, none "neither"; 64 low confidence. By
  question the classifier is backed most on fact (13 of 55) and firmness
  (9 of 58), least on health, result and he speaks (2 of 51). Read as:
  the labels are mostly right where the classifier differs, and the 44
  are the first answers to check in step 2.

The correction page shows all of it: step 1 grouped by boundary with the
brief on top and a one-line "brief:" verdict per card, the two rechecks
under "how central" (flagged when rule A may change it), and the triage
pick under each answer the classifier disputes. One brief contradicts a
settled ruling (#740 source: it suggests no one; Anton ruled himself):
the ruling stands.

## Next

1. Anton corrects the key (the correction page), starting with the 2 split
   answers and the 18 settled by the tie-breaker; `build_key.py` then
   `score.py` rescore v4–v6.
2. If the scores hold: passes 2–4 of v6 for stability (about $0.19).
3. The correction page carries all 300; after the key, the 75 articles
   where the readers differed anywhere are the next most useful to check,
   now grouped by boundary so each rule is decided once. The 9 rule A
   moves and the 44 triage picks for the classifier are the shortest list.
