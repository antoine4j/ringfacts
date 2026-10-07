# Iteration log — append only, never rewritten

One entry per pass: what changed, why, what it did, what it broke. Runs and
spot checks may be overwritten; **this file is the history and must not be.**
An entry is written *before* the next pass starts, so a failed idea is recorded
rather than quietly dropped.

Metrics come from `python3 compare.py <a> <b>`. "unsure" = answers where no
option clears 0.5. Entropy is of the chosen-answer mix, and guards against a
question becoming confident by losing its nuance.

---

## Pass 1 — baseline
**2026-09-17 · $0.0385 · 300 articles · 8 s · 0 errors**

Six questions: role, whose_judgement, what_is_done, news_kind, sourcing, timing.
Every one carrying an escape hatch worded identically, Anton's idea.

| | unsure | median conf | entropy |
|---|---|---|---|
| role | 36 | .86 | 1.71 |
| whose_judgement | 43 | .72 | 2.69 |
| what_is_done | 55 | .71 | 1.77 |
| news_kind | 22 | .87 | 2.14 |
| sourcing | 11 | .83 | 0.99 |
| timing | 32 | .56 | — |

Articles with any unsure answer: **132 of 300**. Escape weight >0.15: **22 of
1,800 answers**; the hatch *won* only once.

**Read:** the escape hatch is useless as an argmax and works as a probability.
Every real gap found later was visible in `escape p` while still losing the vote.

**Checked by Anton:** #838 only — 4 of 6 right, 1 genuinely ambiguous, 1 a bug in
my wording. Recorded verbatim in `verdicts.md`.

---

## Pass 2 — the five defects
**2026-09-17 · $0.0390 · 300 articles · 8 s · 0 errors**

**Changed, and why:**

1. `sourcing` — named its target. Pass 1 asked how well sourced "what this
   article asserts about him" is; an article asserts several things at different
   confidence. On #838 JEV judged the rumoured *fight* and Anton judged the
   reported *quote*, and both were right to different readings. Added
   `only_a_quote_no_event`.
2. `what_is_done` — added `he_tells_his_own_story`. Six articles were landing in
   `nothing_of_the_sort`, which composes to bucket 3; Anton ruled two of them
   (#291, #320) bucket **2**.
3. `whose_judgement` — widened `an_opponent_or_their_camp` to include a fighter
   *publicly linked* to a fight with him. A rumoured opponent was covered by
   nothing.
4. `whose_judgement` — added `a_pundit_or_commentator`. Joe Rogan (#917) and a UFC
   colour commentator (#866) were being absorbed into "top authority", which
   inflates them; Anton's speaker gradient puts pundits near the bottom.
5. `timing` — **cut**. Median confidence .56, two-thirds one answer. It asked the
   model to judge what a *reader* needed, which is not in the text.

**Result:**

| | unsure p1 → p2 | conf | entropy |
|---|---|---|---|
| **what_is_done** | **55 → 27** | .71 → **.79** | 1.77 → **2.11** |
| **sourcing** | **11 → 71** | .83 → **.52** | 0.99 → 1.73 |
| whose_judgement | 43 → 46 | .72 → .74 | 2.69 → 2.87 |
| role | 36 → 41 | .86 → .84 | 1.71 → 1.72 |
| news_kind | 22 → 23 | .87 → .87 | 2.14 → 2.15 |

Articles with any unsure answer **132 → 149**; excluding `sourcing`, **125 → 104**.
Escape weight **22 → 8**.

**What worked.** `what_is_done` halved its unsure pile *while entropy rose* —
the guard's signature for a real gain rather than sanded-off nuance.
`he_tells_his_own_story` took **58 of 300 (19%)**; reading by hand had suggested
six, so the option was ten times more needed than the evidence that found it.
`a_pundit_or_commentator` 24 (8%), `only_a_quote_no_event` 40 (13%).

**What broke.** `sourcing`. But entropy rose 0.99 → 1.73, and that is the tell:
**pass 1's .83 confidence was fake** — the question was vague enough to answer
`reported` 81% of the time and feel sure about it. A confidently-wrong question
was traded for an honestly-confused one. Closer to true, not yet useful.

Unexplained: `official` jumped **16 → 74**. No change in the articles justifies
that; it is a wording artefact and must be diagnosed, not averaged away.

**Next:** shorten `sourcing` to a single clause instead of defining it by
exclusion ("judge this, do NOT judge that" across two long sentences).

---
## Pass 3 — `sourcing`, anchored on the article's own news
**2026-09-17 night · written before the run**

**Diagnosis first.** The `official` 16 -> 74 jump was not noise. The migration
matrix says where they came from:

| pass 1 -> pass 2 | official | reported | rumored | only_a_quote | no_claim |
|---|---|---|---|---|---|
| official (16) | 13 | 3 | | | |
| reported (206) | **52** | 148 | 7 | 37 | |
| rumored (22) | | 3 | 18 | 1 | |
| no_factual_claim (18) | 9 | 4 | 1 | 2 | 2 |

Two separate faults, both mine:

1. **The question let background facts count as the answer.** I asked to judge
   "the sourcing of the EVENT this article claims." Nearly every article here
   mentions an officially booked UFC fight somewhere in it — so a roundtable
   preview (#65), a post-event report (#230) or a Makhachev quote piece (#170)
   all contain an officially announced event, and `official` is arguably right
   *by my own wording*. The question never said to judge the article's **own
   news**. That is the main cause.
2. **The option key is doing work its definition did not authorise.** Of the 52
   articles that moved `reported` -> `official`, **23% contain the literal word
   "official"**, against **1%** of the 148 that stayed `reported` — a 23x
   enrichment. `official` also had the vaguest definition in the set (four
   words: "The promotion announced it") and sits first in the list, so it became
   the residual sink the way `reported` was in pass 1. The sink moved; it did
   not close.

Median confidence of those 74 `official` answers is **0.50** — the model was
not sure, it was cornered.

**Changing in this pass (sourcing only, nothing else):**

- Instruction anchored on the article's own news rather than any event in it,
  and phrased positively instead of as two "do NOT judge" clauses.
- Every option definition made to do real work; `official` in particular now has
  to *be* the article's news, not merely be true of something it mentions.

**Deliberately NOT changed yet**, so the cause stays attributable:

- the key name `official` -> pass 4 tests the rename alone
- option order -> pass 5 tests the shuffle alone

**Prediction, recorded before the run:** `official` falls back toward 20-30.
If it stays near 70, the key name is the cause rather than the wording, and
pass 4 will show it.

**Note on #838**, the one article Anton ruled: pass 2 answered
`only_a_quote_no_event` 0.52 / `rumored` 0.47. He said `reported`, then
immediately took it apart himself — "the fact that Paddy said something, it's a
fact, it's reported. But then the fact that Paddy will fight Topuria, that is
rumored." Under a question anchored on the article's own news the answer should
be `rumored`: the news is a hedged rumour of a fight. That is a reading of his
verdict, not his verdict. **Still open for him.**

---

## Pass 4 — a replicate, to find the noise floor
**2026-09-17 night · written before the run**

**Nothing changes.** Pass 4 sends byte-identical questions to pass 3.

**Why this had to happen before anything else.** Only `sourcing` was edited
between passes 2 and 3, yet the four untouched questions each moved 5-9 answers
of 300. Two explanations, and they demand opposite responses:

- **noise** — JEV is not deterministic, so every delta under ~10 answers I have
  reported all night is inside the error bar and means nothing; or
- **coupling** — JEV is deterministic and the five questions travel in one
  prompt, so rewording one really does perturb the others.

A replicate separates them with no ambiguity: identical output means
deterministic (and the coupling is real), any difference is the noise floor
measured directly. Until this number exists I cannot honestly call a small
improvement an improvement.

**Result — JEV is NOT deterministic, and the floor is now measured.**

**42 of 1500 answers (2.8%) flipped on byte-identical input.** Per question,
4-14 of 300. But the noise is not spread evenly:

| pass-3 confidence | answers | flipped on replicate |
|---|---|---|
| < 0.4 | 184 | 34 (**18.5%**) |
| 0.4 - 0.6 | 277 | 8 (2.9%) |
| 0.6 - 0.8 | 302 | **0** |
| > 0.8 | 737 | **0** |

**Every one of the 1,039 answers at confidence 0.6 or above was identical across
the two runs.** All the jitter lives below 0.4. Median probability drift across
all 9,000 option probabilities is 0.0000; the maximum is 0.20.

**What this corrects.** The four untouched questions moved 5-9 answers between
passes 2 and 3 and I had two theories for it, coupling or noise. It is noise --
5-9 sits inside a measured floor of 4-14. More uncomfortably, it means several
numbers already in this log are unreadable:

| reported earlier | verdict |
|---|---|
| `what_is_done` 55 -> 27 | **real** - 28 is far outside the floor |
| `sourcing` 11 -> 71 -> 50, `official` 16 -> 74 -> 29 | **real** |
| `news_kind` 22 -> 23 -> 27 | **noise** (floor 3) |
| `role` 36 -> 41 -> 42 | **noise** (floor 3) |
| `whose_judgement` 43 -> 46 -> 45 | **noise** (floor 2) |

Those three were put in a table without an error bar, which invited reading them
as small movements. They are not movements at all.

**Two rules from here on.**

1. A per-question change counts only above ~8 answers; the article-level
   any-unsure count is stable to about +/-3.
2. **Confidence 0.6, not 0.5, is the real threshold.** 0.5 was picked by hand at
   the start of the experiment. 0.6 is where this model stops changing its mind,
   which is a property of the model rather than of my taste.

---

## Pass 5 — reverse every option list
**2026-09-17 night · written before the run**

**Changed:** the order of the real options in all five questions is reversed.
No wording changes at all. The escape hatch stays last, so exactly one variable
moves.

**Why reversal rather than a shuffle.** It displaces every option as far as it
can go, it is reproducible without a seed, and it directly tests the
first-position-sink idea that pass 3 raised: `official` became a sink while
sitting first in its list, and `reported` was the sink before it in the same
slot. Reversal puts the current first option last.

**What the answer means.** A well-built option list answers the question, not the
layout. Changes beyond the floor measured above mean the list is weak wherever
they concentrate, and that is a defect to fix rather than a curiosity.
**Prediction: flips stay near the 42/1500 floor.**

**Result — order matters, but not in the way I guessed.**

| flips vs pass 3 | replicate (p4) | reversed (p5) |
|---|---|---|
| sourcing | 14 | 30 |
| news_kind | 4 | 20 |
| role | 10 | 31 |
| what_is_done | 7 | 22 |
| whose_judgement | 7 | 23 |
| **total of 1500** | **42** | **126** |

**126 against a floor of 42 — three times the noise.** Order is a real effect in
every one of the five questions.

But the prediction I wrote above was wrong in an instructive way, and so was the
mechanism I proposed in pass 3. I said `official` became a sink partly because it
"sits first in the list". Testing it directly:

- options that moved **earlier** under reversal gained **-0.6** answers on average
- options that moved **later** gained **+0.9**

**There is no first-position bias.** The two figures are near zero and point
opposite ways. Reversal does not systematically feed the top of the list; it
jitters answers about at random. The pass-3 claim that position made `official` a
sink is **withdrawn** -- the 23x enrichment of the literal word "official" in the
migrating articles was measured and still stands, but the position half of that
explanation was a guess I did not test, and it is not true.

**Where the jitter lives is the finding.** Median pass-3 confidence of the 126
reordered flips is **0.39**, and only **12 of them sat above 0.6** -- about 1% of
the 1,039 answers in that band. Put beside the replicate result:

> **At confidence 0.6 and above, an answer survives both a rerun and a full
> reversal of its option list. Below 0.6 it is substantially an artefact of
> sampling and layout rather than a reading of the article.**

A low-confidence answer is therefore not "the model's best guess at a hard
article". It is close to a coin flip, and the argmax should not be read at all.
There is no systematic bias to subtract, so the remedy is not a correction -- it
is to stop using those answers as answers.

---

## Pass 6 — a third option order, for a consensus vote
**2026-09-17 night · written before the run**

**Changed:** option order only, a seeded shuffle (`random.Random(6)`), distinct
from both the original and the reversal. No wording changes.

**Why.** The two findings above turn into a tool. Three different orders of the
same questions give three votes per answer. Then:

- **unanimous across three orders** -- the answer is a property of the article,
  having survived two perturbations known to move weak answers;
- **split** -- the article is genuinely hard, or the option list does not fit it.

That is a far better hard-article detector than "no option clears 0.5", because
it is measured against perturbation rather than against a threshold I chose by
hand. The split pile is the right pile to spend Fable on, and it costs 4 cents to
produce.

**Result — three orders give a better hard-article detector than confidence.**

| question | unanimous | 2 of 3 | all differ |
|---|---|---|---|
| role | 264 | 35 | 1 |
| whose_judgement | 269 | 31 | 0 |
| what_is_done | 271 | 29 | 0 |
| news_kind | 272 | 26 | 2 |
| sourcing | 256 | 43 | 1 |
| **total** | **1332 (88.8%)** | **164** | **4** |

Mean confidence by agreement: unanimous **0.77**, split two ways **0.39**, split
three ways **0.28**. Confidence and stability are measuring the same thing.

**But the vote is the sharper instrument.** Of answers at confidence >= 0.6,
**98.7% are unanimous** -- so a confident answer is genuinely settled. The
converse fails: of the 461 answers below 0.6, **306 are unanimous anyway** and
only 155 actually move. **The "no option clears 0.5" metric I have optimised all
night over-flags by about three to one.** It is a proxy for instability; the
vote measures instability.

`consensus.py` writes `consensus.json`: per answer, the majority choice, how many
of three orders agreed, and mean confidence.

---

## Composing the buckets, and the finding that matters most
**2026-09-17 night · no new pass, `buckets.py` over the consensus answers**

Anton's ask: compose the bucket in code from the answers, then sample each bucket
and check the articles belong. `buckets.py` does the composing -- three rules,
readable and arguable, no model involved:

- **1** if `news_kind` is announcement/result/injury/negotiation **and**
  `sourcing` is official/reported **and** `role` is not background
- **3** if `role` = background, or `what_is_done` is naming_him_in_passing /
  nothing_of_the_sort, or `news_kind` = no_news_about_him, or he is a bystander
  in a story carrying no factual claim
- **2** otherwise

Distribution: **bucket 1 = 49 (16%), bucket 2 = 147 (49%), bucket 3 = 104 (35%)**.

### The composition absorbs the jitter

Running the same rules over each of the three option orders separately:

> **280 of 300 articles (93.3%) land in the same bucket in all three orders,
> although only 173 (58%) have all five answers unanimous.**

**107 articles have a wobbly answer but a steady bucket.** The rules collapse
many answers onto few buckets, so most of the low-confidence jitter never reaches
the output. This is the strongest argument yet for the shape of the experiment --
closed-set questions plus code you can read beats asking a model "which bucket?",
not because the model is better behaved but because **the errors do not survive
composition**.

The 20 that do flip are not spread evenly either: **12 move between 2 and 3**,
which is precisely the line Anton calls the hard one, and 8 between 1 and 2. The
instability sits where the judgement is genuinely difficult.

### Against production - a disagreement finder, not a score

Production's own decisions are in the sample. This is **not** ground truth:
production is a model too, and `research/corpus/README.md` warns against exactly this.
It is useful only for pointing at articles worth reading.

`posted` turns out to be near-useless for comparison -- of 255 unposted, most were
held for **dedup** (`embedding` 85, `story` 58), not for being bucket 3. Two
fields are comparable:

- **`subject_role` vs my `role`**: broad agreement (`central` -> `the_subject`
  79 of 99), but production's `supporting` maps to my `background` 28 of 37 and
  its `passing` maps to `background` 34 of 60. **My `background` is absorbing
  more than its definition allows.**
- **`digest_tier = main` (35 articles)**: I agree on 24, say bucket 1 on 3, and
  say **bucket 3 on 8**. Those 8 are the expensive kind of disagreement and read
  like real errors on my side -- #944 *"Gaethje Reveals Why Topuria Was Easy To
  Predict"* is Gaethje assessing Topuria, and calling that "backdrop" is simply
  wrong. #256 and #408 look the same way.

`role = background` fired on **85 of 300** and is now the prime suspect. Five
Fable readers are checking it and four other piles.

---

## Five Fable readers on five piles
**2026-09-17 night · 34 articles, ~82k tokens each, on the subscription**

Five reviewers, one per pile, each given the briefing and the full article text.
They did not see each other's work. **They converged on one defect.**

| pile | verdict |
|---|---|
| A - production digested it, I said 3 | right on 3 of 8; **4 of the 5 errors caused by `role = background`** |
| B - the `background` pile itself | **5 of 8 wrong, arguably 6**, every one 3 -> 2 |
| C - `he_tells_his_own_story` | right on **6 of 8**; the 20% is partly a real news cluster |
| D - bucket 1, the loud one | **5 true, 2 clear false positives, 1 dubious**; every failure is `announcement` |
| E - the bucket flippers | **7 of 10 are a defective option list, 3 are genuinely ambiguous articles** |

### The defect

`background` was defined by **content** - "his past fight, loss or record is used
as backdrop" - rather than by **function**. Topuria took his first career loss in
June, so every article about him for months mentions it. The option fired on the
*presence* of a past loss even when that loss was the very thing being judged.

Reviewer B put the proof in one pair: **#476 and #503 are the same Gaethje
interview at two outlets.** One uses him as scenery (correctly `background`), the
other builds the piece around his rematch. Both got `background`, one at 0.79
confidence with all three orders agreeing. The model was not reading what the
article *does* with the past fight.

Then the composition locked it in. On **#55**, `whose_judgement = his_camp` at
0.91 and `what_is_done = defending_him` at **0.99** - and the article still went
to bucket 3, because `role = background` at **0.24** was allowed to decide alone.
Four confident answers outvoted by the one the model was least sure of.

### The missing option, named independently by five readers

Reviewer A called it `the_object_of_a_judgement`, reviewer E called it
`the_one_being_talked_about`. Same thing: *somebody else is the speaker, and the
watched fighter is who their callout or assessment is about.* Neither
`the_subject` nor `background` describes that, so the model had to pick a wrong
one. Reviewer E: it alone fixes 5 of the 10 flips.

### The composition fixes, ablated before adopting

Against the 31 Fable verdicts, changing **only the rules**, not the questions:

| background fix | passing veto | agreement gate | agrees |
|---|---|---|---|
| no | no | no | 18/31 |
| **yes** | no | no | **26/31** |
| **yes** | **yes** | no | **28/31** |
| yes | yes | **yes** | 27/31 |

- **the `background` fix is worth +8** on its own
- the `naming_him_in_passing` veto on a shout is worth +2
- **the agreement gate costs 1 every time it runs** and was dropped. Reviewer D
  proposed it and the reasoning was sound - a false shout costs more than a late
  one - but it demoted two real wins to catch one preview. Measured, not argued.

---

## Passes 7, 8, 9 — the six missing options, in three orders
**2026-09-17 night · $0.0442 x 3 · 300 articles each · 0 errors**

Six options added, each traceable to a named finding: `the_one_being_talked_about`,
`mentioned_only`, `not_in_the_article_body` (role); `he_gives_his_view`,
`covering_his_event` (what_is_done); `preview` (news_kind). `background` rewritten
by function, with reviewer B's delete-test in the definition. Three orders again,
for the vote.

**Uptake:**

| new option | fired on |
|---|---|
| **`the_one_being_talked_about`** | **101 of 300** |
| `covering_his_event` | 27 |
| `preview` | 25 |
| `mentioned_only` | 21 |
| `not_in_the_article_body` | 12 |
| `he_gives_his_view` | 11 |

**`background` fell from 85 to 17.** `a_bystander` went to **zero** - it had been
a partial sink for the same articles. `he_tells_his_own_story` fell 62 -> 41 once
the definition excluded "his view of an upcoming fight".

**Stability held: 88.7% of answers unanimous across three orders, against 88.8%
before.** Six new options did not destabilise anything, which is the guard doing
its job - a wider list could easily have made the model waver and it did not.

**Buckets: 1 = 37 (12%), 2 = 208 (69%), 3 = 55 (18%).** Bucket survives all three
orders on **285 of 300 (95.0%)**, up from 93.3%.

### But the headline score is not trustworthy, and here is why

Against the 31 Fable verdicts this scores **27/31**, which is *worse* than the
28/31 that the old answers reached with only the rules fixed. Two reasons not to
read either number as accuracy:

1. **The sample is biased by construction.** Piles A and B were chosen *because*
   I suspected they were wrong, and both were full of articles that should have
   been 2. A sample enriched in "should be 2" rewards any change that says 2 more
   often. It cannot measure whether bucket 2 has grown too fat.
2. **The reviewers were shown the classifier's answer before judging**, which
   invites anchoring.

**Bucket 2 at 69% is the thing to worry about.** For a small private group that
is almost certainly too much. A blind check on a fresh random sample is running -
22 articles the reviewers have not seen, in random order, with no classifier
output shown and the buckets hidden.

---

## Blind check — and the question that was missing all along
**2026-09-18 early · 22 fresh articles, random, reviewer shown no classifier output**

Deliberately built to remove both flaws in the 31-verdict score: a random sample
instead of piles I already suspected, article order shuffled so the bucket
carried no hint, and **no classifier answers shown**, so nothing could anchor.

> **17 of 22 (77%). Excluding the three the reviewer itself flagged ambiguous,
> 16 of 19 (84%).**

That is the first honest accuracy-shaped number in this experiment, and it is
still only agreement with a model, not with Anton.

Reviewer tally **1=2, 2=10, 3=10**, against mine **1=4, 2=12, 3=6**. Every one of
the five disagreements runs the same way — I am too generous:

| | mine | blind | what it is |
|---|---|---|---|
| #605 | **1** | 3 | restates a booking known since July |
| #817 | 1 | 2 | round-by-round recap two days after the fight |
| #743 | 2 | 3 | content-farm filler - "he showed his skills in Paris" |
| #247 | 2 | 3 | a pundit floating a hypothetical booking |
| #609 | 2 | 3 | an opponent's generic praise |

### The reviewer stated the rule better than my briefing did

> *"It's a 2 if, from this article alone, a close follower could write one new
> sentence about the watched fighter - his condition, his plans, his own words,
> or a named person's stated view of him - and it's a 3 if the only new sentence
> is about someone else, **or is something the follower already knew**."*

And in four words: **"About him" is necessary but not sufficient.**

**All five of my questions ask who and what. Not one asks whether the information
is NEW.** That is why bucket 2 swelled to 69%: the rules correctly identify that
an article is about him and have no way to notice that it says nothing. #605 and
#743 are *entirely* about the watched fighter and are still worthless.

This is a missing **question**, not a missing option, and it is the most
important thing found tonight.

### It also splits cleanly across the pipeline

Novelty has two halves and they belong in different places:

- **"Does this article carry new information?"** - detectable in the text. The
  reviewer used the outlet's own framing as the tell ("recall that", "нагадаємо",
  a two-day-old result written as retrospect). **This is the classifier's job.**
- **"Has the group already been told?"** - not in the text at any confidence.
  **This is the dedup stage's job**, and production already does it: of the 255
  unposted articles in this sample, 143 were held for `embedding` or `story`
  similarity, not for being bucket 3.

Worth carrying to the whiteboard: the classifier should be asked what the article
*contains*, never what the reader has *already seen*.

---

## Passes 10, 11, 12 — a sixth question: novelty
**2026-09-18 · written before the run**

**Changed:** one question added, nothing else touched. Three orders again.

**Prediction, recorded before the run:** `restates_known_facts` and
`filler_no_information` together take 40-70 of 300, bucket 2 falls from 208
toward 150, and blind agreement rises above 17/22. If bucket 2 barely moves, the
question is not earning its tokens and should be cut rather than kept out of
attachment to the idea.

**Result — the sixth question earns its place, and costs something.**

| | 5 questions (p7-9) | 6 questions (p10-12) |
|---|---|---|
| bucket 1 | 37 (12%) | **27 (9%)** |
| bucket 2 | 208 (**69%**) | **154 (51%)** |
| bucket 3 | 55 (18%) | **119 (40%)** |
| bucket stable across 3 orders | **95.0%** | **90.0%** |
| blind check | 17/22 · 16/19 | **18/22 · 18/19** |

**Novelty uptake:** `new_and_substantial` 172, `restates_known_facts` 64,
`nothing_about_him` 32, `small_new_detail` 18, `filler_no_information` 14.

**Against my recorded predictions:** bucket 2 falling toward 150 - right (154).
Blind agreement rising above 17/22 - right (18). "40-70 carry nothing new" -
**wrong, and badly: 110 of 300.** A third of the corpus tells a close follower
nothing, which is far more than I guessed.

**What it cost.** Bucket stability fell **95.0% -> 90.0%**. Novelty is the least
confident question in the set (mean 0.47-0.64 against 0.84-0.91 for `role`), so
it wobbles more and drags the composition with it. That is a real price and it
is the right trade only because the thing it fixes is a systematic bias rather
than noise - but it should be said out loud rather than buried under the
improved score.

**How much to trust 18/19.** Not very much on its own. The blind set is 22
articles and has now judged two variants, so there is mild selection pressure,
and 17 -> 18 is a single article. The prediction was written down before the run,
which helps. **The stronger evidence is not the score but the distribution:**
bucket 2 fell from 69% to 51%, and all five of the original blind disagreements
were the same defect pointing the same way.

**The one unambiguous disagreement left is #247** - a pundit floating a
hypothetical booking. That is Anton's own open question about where a pundit
sits, so the last error standing is the one I was never able to decide without
him.

---

## Anton reads the report and finds two defects and a design idea
**2026-09-18 · from #829, browsing `REPORT.html`**

He opened the full-options view on #829 (a Donchenko fight report) and asked
three things. Two are confirmed defects; the third is a better idea than the
thing it replaces.

### 1. "Was faceoff interpreted as a literal face-off?" — YES

His suspicion, from seeing `covering his weigh-in or faceoff` at 40% on an
article about a fight that had already happened. The wording was mine:
*"routine fight-week coverage - a weigh-in, a faceoff, a press conference"*.

Measured: `covering_his_event` fired on 27 articles, and **10 of them were fight
results** — the fight itself, not the build-up. #737 *UFC Paris live results,
play-by-play*, #783 *Донченко одноголосним рішенням суддів переміг Соріано*.

**He found the mechanism for a gap already noted and not understood.** The
escape-hatch analysis on 2026-09-17 had flagged that `what_is_done` still wanted
an option and that the articles asking for it were all "Donchenko won the
fight" — but the reason was not obvious. It is that **there was no option for the
fighter actually fighting**, so the nearest-looking word, "faceoff", absorbed it.

**Probe (pass 13, one order, $0.0483):** added
`he_fought` — *"He competed. The article reports what he did in the fight itself
- the rounds, the finish, the decision, the scorecards"* — and narrowed
`covering_his_event` to build-up **before** the fight.

**`he_fought` took 46 of 300.** `covering_his_event` fell 27 → 18. But the
migration was not what the hypothesis predicted:

| previously answered | moved to `he_fought` |
|---|---|
| **assessing_him** | **21** |
| covering_his_event | 13 |
| naming_him_in_passing | 4 |
| calling_him_out | 4 |
| *escape hatch had won* | 2 |

The faceoff confusion was real but was **less than a third of it**. The larger
leak was `assessing_him` — a fight report describes how he performed, and with
no better option that read as "judging his ability". Under review by Fable.

### 2. "Isn't `none of the options fitted` the same as `nothing of the sort`?" — effectively YES

Both sit in `what_is_done`. `nothing_of_the_sort` means *the question applies and
the answer is that nothing is being done to him*; the hatch means *a fitting
answer exists and is not listed*. Different in principle. In practice they
compete:

- **46 answers of 900 give BOTH more than 0.05** — they split the same mass.
- Each is chosen outright exactly **once** in 300 articles.
- Mean escape-hatch probability in `what_is_done`: **0.015**.
- Mean escape-hatch probability in `role`, which has **no catch-all option**:
  **0.001** — fifteen times cleaner.

**A question that carries its own catch-all blunts the escape hatch**, because
the model has two places to put "none of these" and splits between them. The
hatch is a measuring instrument; putting a second, similar option beside it adds
noise to the measurement. Either `nothing_of_the_sort` goes, or the hatch is
given a meaning that cannot be confused with it — which is his third point.

### 3. His proposal: the hatch should mean "this question does not apply here"

Not yet tested. But it separates three things that are currently tangled, and
#829 is the case that shows why:

| meaning | example |
|---|---|
| **the answer is "nothing"** | nobody is doing anything to him — `nothing_of_the_sort` |
| **an answer exists, you didn't list it** | "he fought" before it was added — the hatch today |
| **the question itself is wrong here** | *whose judgement of him?* on a result report |

On #829 Fable's verdict was that **nobody judges him at all** and that *"a result
article like this will always produce this kind of muddle on a 'whose judgement'
question, because the question presumes somebody has an opinion."*

A question that can answer **"does not apply"** reports which *kind* of article
it is looking at. That is a per-article signal for the mode-differentiated
question set in TODO 3n, arriving from the opposite direction: rather than
deciding the mode up front and choosing a question set, ask everything and let
the questions that do not apply say so.

### Pass 13 reviewed, pass 14 tests the guard

Fable on the 8 articles that moved `assessing_him` → `he_fought`:
**5 clean, 1 mostly right, 1 pointing the wrong way (#817, a column two days
after the fight that really is an assessment), 2 new misfires** (#856, #6 — both
articles where a *past* fight is backdrop in somebody else's story).

Its diagnosis: `assessing_him` was never too broad by intent, it was **the
nearest home**. A fight report always says who looked better; before `he_fought`
existed there was nowhere honest to put that. But `he_fought` as I wrote it said
nothing about the fight needing to *be the news*, so it then over-collected.

**Pass 14 ($0.0489)** added its proposed guard — *"This fight is the article's
news… A past fight recalled to set up a story about somebody else is NOT this"* —
and narrowed `assessing_him` to judgements *reaching beyond any single fight*.

| | p10 (no option) | p13 (added) | p14 (+guard) |
|---|---|---|---|
| assessing_him | 128 | 108 | 108 |
| **he_fought** | 0 | **46** | **35** |
| covering_his_event | 27 | 18 | 22 |
| naming_him_in_passing | 35 | 25 | 38 |

**Partial success, stated as such.** All six genuine fight reports held. The
guard drained 11, mostly into `naming_him_in_passing`, which is right for
backdrop cases. But of the three articles Fable named, **it fixed one (#6) and
missed two** — #856 and #817 still answer `he_fought`. The wording moves the
population in the right direction without settling the specific cases.

### The finding that actually matters here

Fable read `buckets3.py` and checked whether any of this reaches a reader.
`what_is_done` touches the bucket in only two places: the two "not about him"
answers force bucket 3, and a **judgement** answer rescues an article whose
`role` came back `background`. `he_fought` is in neither set.

So for the Donchenko fight reports the whole distinction is **cosmetic** —
`result + reported + the_subject + new` lands them in bucket 1 regardless.

> **`he_fought` earns its place not as reader-facing precision but as a pressure
> valve.** It stops fight reports polluting `assessing_him`, and `assessing_him`
> is what the `background`-rescue rule keys on — the rule that lets a rival's
> real verdict on him get through. Without a fitting option the model picks the
> nearest wrong one, and here the nearest wrong one had bucket consequences.

On #6 it flipped the bucket 2 → 3, which is the right answer **reached by
accident**: `he_fought` is wrong for that article and only helped because it
happens to sit outside the rescue set.

**Keep it. Do not expect it to move buckets.** An option is cheap; a question is
not.

### A dedup case fell out of it

#773 and #790 are one Sport.ua article, id `904629`, fetched twice — the second
through `/uk/amp/`. Both were classified separately and both would have been
sent. Recorded against TODO 3l, which asked exactly this question and until now
had no live example.

