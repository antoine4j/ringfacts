# Role questions on JEV — experiment state

Started 2026-09-17. Nothing here is committed. Nothing touches production except
one read-only `SELECT` (`pull.mjs`, which sets `default_transaction_read_only`).

## The idea

Stop asking a model "which bucket is this article?" — article formats are an
open set and you can never finish enumerating them. Ask instead about the
**fighter's role and who is speaking**, which are closed sets whatever shape the
page takes, then compose the bucket in code from those answers.

Anton's addition, which is what makes it testable: **give every question an
explicit "none of these" option**, then read the articles where the model takes
it. That is how you find an option you never thought of, without having to
enumerate anything up front.

## What has been run

**Pass 1** — 300 articles, 6 questions, 1 call each, whole article text.
300 HTTP requests, 7 seconds wall, **$0.0385**, zero errors.

Sample: `pull.mjs` took a stratified draw from the production archive (1,324
articles, 1,021 with text). Stratified rather than proportional so the rare
fighters are not lost: **all 19 Amosov, all 99 Donchenko, 182 Topuria** spread
evenly across 7 Aug – 17 Sep.

### Results

| detector | finding |
|---|---|
| escape hatch **wins** | 1 of 1,800 answers — a null as a straight signal |
| escape hatch **gets weight** (>0.15) | 22 answers — **and every real gap is in here** |
| no option above 0.5 | `what_is_done` 18%, `whose_judgement` 14%, `timing` 11% |
| median confidence | role .86 · news_kind .87 · sourcing .83 · whose .72 · what .71 · **timing .56** |
| articles confident on all six | **0 of 300**; best mean confidence in the run is 0.95 |

**The method works, but at the probability level, not the argmax level.** Read
`escape p`, not the choice.

### Confirmed defects, in priority order

1. **`sourcing` is under-specified.** It asks how well sourced "what this article
   asserts about him" is — but an article asserts several things at once. On #838
   JEV judged the rumoured *fight* (`rumored` 0.89) and Anton judged the reported
   *quote* (`reported`). Both correct to different readings. This is also why 81%
   of answers are `reported`: an ambiguous question collapses to a default.
   **Fix:** name the target in the instruction; give "only a quote, no event
   claimed" its own option.
2. **`what_is_done` has no "he tells his own story."** Six articles land in
   `nothing_of_the_sort`, which composes to bucket 3. Anton ruled #291 and #320
   **bucket 2** on 2026-09-04. A live bug, not a theoretical one.
3. **`whose_judgement` has no prospective opponent.** The definition says "faces
   him or has faced him"; a rumoured opponent is neither. JEV split 0.56/0.28
   across the two options Anton himself named.
4. **`whose_judgement` has no pundit or commentator.** Joe Rogan (#917) and a UFC
   colour commentator (#866) both got absorbed into `the_champion_or_a_top_authority`
   with the hatch at 0.28–0.29. Anton's own speaker gradient puts pundits near
   the bottom and champions near the top, so conflating them inflates the wrong
   articles.
5. **`timing` is the weakest question** — median confidence 0.56, two-thirds one
   answer. It asks the model to judge what a *reader* needed, which is not in the
   text.

### Things learned about method, not about the questions

- **A spread answer is not automatically a failure.** On `role` for #838 Anton's
  own reading was "it's all three." The distribution was reporting real ambiguity
  in the article. An ambiguous article and a bad option list must be read apart.
- **The option labels mislead where the definitions do not.** Anton first leaned
  "no rush" on `timing`, then changed to "same day" after reading the definition.
  The model always sees the definition; a human skimming labels does not.
- **40% of the tokens billed were the questions, re-sent 300 times** (1,277
  tokens x 300 = 383,100 of 962,105). At 900 articles a month in production that
  ratio matters more than article length. Whether the API supports batching or
  caching has not been checked.

## Ground truth — the binding constraint

Almost none of this is graded by Anton. Counted 2026-09-17:

- **~23 articles** in the whole project carry his own independent bucket
  judgement. Not 47 — of the 47 in `docs/grading/2026-09-08-first-hundred.md`,
  **37 are duplicate rulings**, gold for dedup and worthless for classification.
- **7 stories** carry a verdict in the grader (`grader/data/events-2026-09-11-frozen.jsonl`,
  on branch `measure-story-matching`). The seven `why` texts he wrote there are
  the best reasoning in the project.
- **1 article of the 300 in this run** has been checked by him (#838).

**Consequence: there is no target to tune toward.** Any accuracy number computed
here means "agreement with a ratified model," which is what `corpus/README.md`
warns about. Work that improves *coverage of the option lists* is measurable
without labels; work that claims to improve *accuracy* is not.

## What can be done without Anton

Measurable with no labels at all:

- Fix defects 1–5 and re-measure escape weight, spread, and confidence. The
  question is "do the option lists cover reality better", which needs no target.
- **Shuffle option order per pass.** An answer that changes when only the order
  changed means the option list is weak. Never tested.
- Read the high-escape and high-spread articles and look for further gaps.
- Check whether the TypeSafe API supports many documents per call or prompt
  caching (see the 40% overhead above).

Not doable without him: anything that scores a bucket.

## Open questions for Anton

1. **Pile D**, seven articles left. Is JEV simply *right*? Suspected error
   already found: #320, a 2022 war story, answered `news_kind = announcement`.
2. **The six self-story articles** (#291, #320, #717, #636, #659, #771) — #291
   and #320 he ruled bucket 2. Are the other four also 2? #636 and #659 are the
   same story in two outlets and must land together.
3. **Where does a famous pundit sit?** Is Joe Rogan warning Topuria worth what
   Makhachev saying it is worth?

## Files

See `GUARD.md` for what must never be overwritten. `verdicts.md` is the durable
record of Anton's rulings and is append-only; `spotcheck-p*.md` is regenerated
per pass and numbered.

---

---

# WHERE THIS GOT TO OVERNIGHT (2026-09-17 → 18)

Nine JEV passes, **$0.36 all in**, five Fable readers on the subscription, zero
errors. Full blow-by-blow in `ITERATIONS.md`; this is the short version.

## The three things that changed my mind

### 1. JEV is not deterministic, and that invalidated some of my own numbers

A replicate pass with byte-identical input moved **42 of 1500 answers (2.8%)**.
So a per-question change under about 8 answers means nothing. Several figures I
had already written down — `news_kind` 22→23→27, `role` 36→41→42,
`whose_judgement` 43→46→45 — are **inside the error bar and are not movements
at all.** They are corrected in the log.

But the noise has a sharp edge:

| confidence | answers | flipped on a rerun |
|---|---|---|
| < 0.4 | 184 | 18.5% |
| 0.4 – 0.6 | 277 | 2.9% |
| **≥ 0.6** | **1039** | **0** |

**Nothing at or above 0.6 moved, on a rerun or under a full reversal of the
option lists.** Below 0.4 the answer is closer to a coin flip than to a reading
of the article. So 0.6 is the real threshold, and it is a property of the model
rather than a number I picked.

### 2. Composition absorbs the noise — which is the case for this whole design

Asking the five questions in three different option orders and composing the
bucket from each:

> **285 of 300 articles (95%) land in the same bucket in all three orders,
> although only 58% have all five answers unanimous.**

The rules collapse many answers onto three buckets, so most of the jitter never
reaches the output. That is the real argument for closed-set questions plus code
over asking a model "which bucket?" — not that the model behaves better, but that
**its errors do not survive composition.** The 15 that do flip sit mostly on the
2-vs-3 line, which is where the judgement is genuinely hard.

### 3. One option was missing, and five readers found it independently

`role = background` fired on **85 of 300** and was wrong about 60% of the time.
It was defined by content — "his past fight, loss or record is used as backdrop"
— and Topuria took his first loss in June, so every article about him mentions
it. The option fired on the *presence* of a past loss even when that loss was the
thing being judged.

The proof is a pair: **#476 and #503 are the same Gaethje interview at two
outlets.** One uses him as scenery, the other is built around his rematch. Both
got `background`, one at 0.79 confidence with all three orders agreeing.

Then the composition locked it in. On **#55**, `his_camp` scored 0.91 and
`defending_him` **0.99** — and the article still went to bucket 3, because
`role = background` at **0.24** decided alone. Four confident answers outvoted by
the one the model was least sure of.

The missing option, named independently by five readers: **"he is the one being
talked about"** — somebody else is speaking, and the watched fighter is who the
callout or assessment is *about*. Neither `the_subject` nor `background` says
that. Added, it took **101 of 300**, `background` fell to **17**, `a_bystander`
went to **zero**, and the escape-hatch weight on `role` fell **14x** to 0.0004 —
which is the one measurement here that needs no labels at all.

### 4. "About him" is necessary but not sufficient — a missing question, not an option

A blind check closed the night: 22 fresh random articles, shuffled, with no
classifier output shown so nothing could anchor the reader. **17 of 22.** Every
one of the five disagreements ran the same way — I was too generous — and they
were all the same defect:

| | mine | blind | what it is |
|---|---|---|---|
| #605 | **1** | 3 | restates a booking known since July |
| #817 | 1 | 2 | round-by-round recap two days after the fight |
| #743 | 2 | 3 | content-farm filler — "he showed his skills in Paris" |

**All five questions asked who and what. None asked whether the information was
NEW.** #605 and #743 are entirely about the watched fighter and still worthless.
That is why bucket 2 had swollen to 69%.

Adding a sixth question, `novelty`, took bucket 2 from **69% to 51%** and the
blind check to **18 of 22 — 18 of 19 excluding the three the reviewer itself
called ambiguous**. It cost something: bucket stability fell 95% to 90%, because
novelty is the least confident question in the set.

**And it splits across the pipeline, which matters for the whiteboard.** Novelty
has two halves that belong in different places:

- *"Does this article carry new information?"* — in the text. The tell is the
  outlet's own framing: "recall that", "нагадаємо", a result written up two days
  later as retrospect. **The classifier's job.**
- *"Has the group already been told?"* — not in the text at any confidence.
  **Dedup's job**, and production already does it: of 255 unposted articles here,
  143 were held for `embedding` or `story` similarity, not for being bucket 3.

> Ask the classifier what the article **contains**, never what the reader has
> already **seen**.

## What the numbers are now

| | pass 1 | final (passes 10–12) |
|---|---|---|
| questions | 6 | 6 (one cut, two added) |
| buckets 1 / 2 / 3 | — | **27 / 154 / 119** |
| bucket stable across three option orders | — | **270 of 300 (90%)** |
| answers unanimous across three orders | — | 88.4% |
| blind check, 22 fresh articles | — | **18/22 · 18/19 excl. ambiguous** |
| escape-hatch weight on `role` | 0.0057 | **0.0004** |
| cost per pass | $0.0385 | $0.0478 |

**Twelve passes, $0.52 of JEV, six Fable readers on the subscription, zero
errors.**

## What neither I nor Fable could crack — the short list

1. **Where a pundit sits.** The last unambiguous blind-check error (#247) is a
   commentator floating a hypothetical booking. `whose_judgement` changes **zero**
   buckets today — not because it is uninformative but because **my rules never
   consult it.** Your speaker gradient is the rule to write; only you can say
   where the line goes.
2. **Is 51% bucket 2 right?** It was 69% and is now 51%. I have no way to know
   what a digest should actually be.
3. **The same story at two outlets.** #476/#503, #408/#431, #368/#327 are one
   interview each, twice. The classifier is right both times and the group wants
   one. That is dedup's problem, not the classifier's, but it shapes what the
   classifier should be asked.
4. **Articles whose text is unusable.** #521, #653 and #230 are video stubs or
   pure site boilerplate. `not_in_the_article_body` exists but is the weakest
   option in the set (confidence 0.47, unanimous on only 5 of 12). This is a
   scraping problem wearing a classifier costume.
5. **The fighter-saturation axis.** Unchanged from the start and still unsolved:
   the same article is bucket 2 for Amosov and bucket 3 for Topuria. No
   article-level question can see it. Your grader already splits this into
   fighter-neutral `worth` and fighter-specific `interest`.
6. **One option still missing.** `what_is_done` has the highest remaining
   escape-hatch weight, and the articles asking for it are #783, #780, #826,
   #829 — all "Donchenko won the fight". **There is no option for the fighter
   actually fighting**, so `covering_his_event` is being stretched to cover it.
   Untested; cheap to add.

## Still needs Anton

1. **Where does a pundit sit?** See above — this is the binding one.
2. **The six self-story articles** (#291 #320 #717 #636 #659 #771). You ruled
   #291 and #320 bucket 2. The other four? #636 and #659 are one story at two
   outlets and must land together.
3. **#838** — under a question anchored on the article's own news it should be
   `rumored`, not the `reported` you first said before taking it apart yourself.
   That is my reading of your verdict, not your verdict.
4. **Is 51% bucket 2 acceptable?**
