# Lessons — what we know about the data and the models

What the experiments have taught us, across experiments, in a form a fresh
agent can read in a few minutes. **These are findings, not rules.** Design
decisions live on the whiteboard (`docs/design/system.excalidraw`) and in
`docs/decisions.md`; how to work lives in `docs/self-improvement.md`. This
file says what was measured, so the next agent can build on it — or doubt it
and check.

## How to read and write this file

Every entry has the same four parts:

- **Claim** — one sentence.
- **Evidence** — the number, and the folder it came from, so it can be rerun.
- **Confidence** — `measured` (replicated, noise floor known) · `observed
  once` (one run, no replicate) · `hunch` (a reading, not a measurement).
- **Does not say / would overturn it** — the caveat. What the finding does
  *not* license, and what result would retire it.

Rules for adding to it:

- An entry needs a number or a named counterexample. A hunch may go in, but
  labelled `hunch`.
- Dated. A finding about a model is a finding about that model on that day.
- **Not append-only.** When a later experiment overturns an entry, rewrite it
  in place and move the old claim to *Superseded* at the bottom, with both
  dates. Two contradicting entries are worse than none.
- Group by subject, not by experiment. Keep it to roughly 25 entries; past
  that, merge entries or retire them — a file nobody finishes teaches nothing.
- A finding is not a decision. If you find yourself writing "so we should",
  stop — that sentence belongs in `decisions.md` or on the whiteboard.

---

## 1. Method — how to run an experiment here

### Measure the noise floor before reading any delta
*2026-09-17, reinforced 2026-09-21*
- **Claim:** models here are not deterministic, and the noise is large enough to
  look like a result.
- **Evidence:** JEV, byte-identical input: 42 of 1,500 answers moved (2.8%).
  Three per-question "movements" already written up were inside that band and
  had to be retracted. Qwen3.8 Flash at temperature 0 through OpenRouter:
  136 of 300 claims re-worded on an identical prompt, ±8 dedup errors, ±0.003
  AUC. `experiments/2026-09-17-role-questions/ITERATIONS.md` pass 4;
  `experiments/2026-09-20-claim-extraction/ITERATIONS.md` pass 5.
- **Confidence:** measured, twice.
- **Does not say:** that the noise is uniform — see the next entry. **Would
  overturn:** a replicate that moves nothing; then this model has changed.

### There is no ground truth, and every accuracy number should say so
*2026-09-17*
- **Claim:** almost nothing is graded by Anton, so "accuracy" here means
  agreement with a model's reading, not with the truth.
- **Evidence:** ~23 articles project-wide carry his own bucket judgement; 1 of
  the 300 in the experiment sample (#838). Fable readers supplied second
  opinions on ~90 more; they are labelled as such in `fable-verdicts.json`.
- **Confidence:** measured (it is a count).
- **Does not say:** that unlabelled work is worthless. Coverage of an option
  list, escape-hatch weight, and same-story separation are all measurable
  without labels. **Would overturn:** a graded set of a few hundred articles.

### Confidence measures the menu, not the article
*2026-09-18*
- **Claim:** a closed-set model's confidence tells you how well the options
  fit, not how well it read. A missing option is invisible in the numbers.
- **Evidence:** #817 was `assessing_him` at 0.97; once `he_fought` existed it
  was `he_fought` at 0.94. #829 went 0.24 → 0.99 when one option was added.
  `experiments/2026-09-17-role-questions/ITERATIONS.md`, "Anton reads the
  report".
- **Confidence:** observed once (two articles, same direction).
- **Does not say:** that confidence is useless — above 0.6 it is stable, see
  §2. **Would overturn:** a case where adding a fitting option left a high
  confidence unchanged.

### Guard the metric you tune toward
*2026-09-17*
- **Claim:** a question can be made confident by stripping its nuance until one
  option swallows everything.
- **Evidence:** `sourcing` in pass 1 read confident at 0.83 while answering
  `reported` 81% of the time; the entropy of its answer mix was 0.99 bits.
  Measuring entropy beside confidence caught it.
- **Confidence:** observed once.
- **Does not say:** which guard fits a different metric. Name one per
  experiment, up front.

### Change one thing, then look at every article that moved
*2026-09-18, Anton's rule*
- **Claim:** tuning a question in isolation is misleading, because most
  question-level changes never reach a bucket.
- **Evidence:** `whose_judgement` decides **0%** of buckets in the final rules,
  `sourcing` 12%, the other four 60–81%. `he_fought` was added, tested, and
  found to change one bucket by accident. `evaluate.py` in the classifier
  folder prints `<-- never` beside any question the rules do not consult.
- **Confidence:** measured.
- **Does not say:** that an unconsulted question is useless — `he_fought` was
  kept as a pressure valve so fight reports stop polluting `assessing_him`.

---

## 2. JEV — the closed-set classifier (TypeSafe "systemone", `jev-latest`)

### Answers at confidence ≥ 0.6 are stable; below 0.4 they are near coin flips
*2026-09-17*
- **Evidence:** across a rerun and a full reversal of every option list,
  1,039 answers at ≥0.6 moved 0 times; 277 at 0.4–0.6 flipped 2.9%; 184 below
  0.4 flipped 18.5%. `ITERATIONS.md` passes 4–5.
- **Confidence:** measured.
- **Does not say:** that 0.6 is the right *policy* threshold — that is a
  decision. It says the model's own behaviour has an edge there. **Would
  overturn:** a new model version; re-measure before reusing the number.

### Option order moves answers, but not toward the first position
*2026-09-17*
- **Evidence:** reversing every option list flipped 126 of 1,500 answers, 3x
  the noise floor, in every question. But options moved *earlier* gained −0.6
  answers on average and those moved *later* +0.9 — no first-position bias.
  The flips sit where confidence is low (median 0.39; only 12 above 0.6).
- **Confidence:** measured (one reversal, against a replicate).
- **Does not say:** why the order matters. **Would overturn:** a shuffle that
  shows a consistent positional drift.

### Composing the bucket in code absorbs most of the jitter
*2026-09-17*
- **Evidence:** across three option orders only 58% of articles had every
  answer unanimous, yet 93% (279/300) landed in the same bucket. The rules
  collapse many answers onto three outputs. Final: passes 16–18.
- **Confidence:** measured.
- **Does not say:** that composition fixes wrong answers — it hides *unstable*
  ones. And a single low-confidence answer can still decide alone: #55 went to
  bucket 3 on `role = background` at 0.24 over three answers above 0.9.

### An option defined by content instead of function becomes a sink
*2026-09-18*
- **Evidence:** `role = background` ("his past fight is used as backdrop")
  fired on 85/300 and was wrong ~60% of the time, because every Topuria article
  mentions his June loss. The missing option — "he is the one being talked
  about" — was named independently by five Fable readers. Added, it took
  101/300; `background` fell to 17; escape-hatch weight on `role` fell 14x.
  #476/#503, one Gaethje interview at two outlets, is the proof pair.
- **Confidence:** measured (no labels needed for the escape-hatch figure).
- **Does not say:** that the current option lists are complete. `what_is_done`
  still carries the highest escape weight.

### The escape hatch finds missing options at the probability level, not the argmax
*2026-09-17*
- **Evidence:** the hatch *won* 1 of 1,800 answers; it *carried weight* (>0.15)
  on 22 — and every real gap found that night was in those 22.
- **Confidence:** observed once.
- **Does not say:** what the hatch should mean. Anton's reading — "this question
  does not apply here" — is a design choice, tested in pass 14.

### "About him" is necessary, not sufficient — novelty was a missing question
*2026-09-18*
- **Evidence:** a 22-article blind check scored 17/22, and all five misses were
  articles entirely about the fighter with nothing new in them (#605 restates a
  July booking; #743 is filler). Adding `novelty` took bucket 2 from 69% to 51%
  and the blind check to 18/22 (18/19 excluding the reviewer's own ambiguous
  calls). Cost: bucket stability 95% → 93%, because novelty is the least
  confident question (0.55).
- **Confidence:** measured, but on a 22-article blind set that is now exhausted.
- **Does not say:** that novelty should be asked of the classifier alone. "Is
  it new in the text" is readable; "has the group been told" is not — the
  outlet's own framing ("нагадаємо", a recap two days later) is the tell for
  the first, and only dedup can answer the second.

### The same article at two URLs reaches the classifier twice
*2026-09-19*
- **Evidence:** #773 and #790 are one Sport.ua article, `/uk/news/904629` and
  `/uk/amp/news/904629`. URL dedup missed it; both would have been sent. The AMP
  copy carries 3,196 characters against 10,000. TODO 3l.
- **Confidence:** observed once (one live pair).
- **Does not say:** how common it is.

---

## 3. The articles

### The sample is stratified, not proportional
*2026-09-17*
- 300 of 1,021 articles with text, drawn to keep rare fighters: all 19 Amosov,
  all 99 Donchenko, 182 Topuria, 7 Aug – 17 Sep. Frozen at
  `experiments/2026-09-17-role-questions/data/articles.json`; never re-pull.
- **Does not say:** anything about the production mix — Topuria dominates
  there. Ratios measured here do not transfer as ratios.

### Production sees a third of the text
*2026-09-20*
- **Evidence:** `hunter.js` embeds headline + `body.slice(0, 1500)`;
  `lib/matcher.js` sends `body.slice(0, 1200)`. 92% of sample articles are
  longer than that; the model sees ~32% of the text, and on Sport.ua pages the
  first 1,500 characters are largely site navigation.
- **Confidence:** measured (it is a count over the sample).
- **Does not say:** that more text helps. Untested — Anton's proposal is a
  window around the fighter's name; see the extraction README, "What's next".

### Some article bodies are unusable, and no question can fix that
*2026-09-18*
- **Evidence:** #521, #653, #230 are video stubs or pure boilerplate.
  `not_in_the_article_body` is the weakest option in the set (0.47, unanimous
  on 5 of 12). A scraping defect wearing a classifier costume.
- **Confidence:** observed once.

### Question tokens, not article tokens, dominate JEV's bill
*2026-09-17*
- **Evidence:** 40% of billed tokens were the question set re-sent 300 times
  (1,277 × 300 of 962,105). One pass over 300 costs ~4–5 cents; the whole
  18-pass experiment cost $0.81.
- **Confidence:** measured. Whether the API batches or caches is unchecked.

---

## 4. Extraction and embeddings (Qwen3.8 Flash; `gemini-embedding-001` 768d)

### A one-sentence claim alone does not separate stories better than production's text
*2026-09-21*
- **Evidence:** on 136 story clusters over the same 300 articles, claim-alone
  AUC 0.925 vs headline+lead 0.918 — but 0.896 vs 0.918 on the balanced (hard
  stories) view. Short claims about one fighter crowd together.
  `experiments/2026-09-20-claim-extraction/README.md`, result table.
- **Confidence:** measured against a ±0.003 floor.
- **Does not say:** that the claim is useless — next entry. **Would overturn:**
  a different extraction model or a longer claim format winning alone.

### The claim in front of production's text beats production's text
*2026-09-21*
- **Evidence:** claim + occasion prepended to headline + first 1500 chars:
  AUC 0.942 / balanced 0.929, tail overlap 1.2%, 396 errors vs 542 at the best
  threshold, on the identical pair set. Far outside the ±8 floor. The occasion
  field alone is worth +0.013 AUC, and putting it first beats appending it
  (0.926 vs 0.918).
- **Confidence:** measured, one replicate, one model, frozen sample.
- **Does not say:** that it holds live, or at production's 0.80 threshold
  (arm 4's best is 0.90). Never validated outside the frozen 300.

### Deciding the article's kind first reproduces the classifier's "background" defect
*2026-09-21*
- **Evidence:** a `kind` field filled before the claim (field order is fill
  order) over-fired "about someone else" on 18 articles where another fighter
  talks *about* him. The delete test — "delete every sentence naming him; if
  the story still stands, it is about someone else" — recovered all 18.
- **Confidence:** observed once, but it is the same defect as §2, found twice.

### The residual dedup error is definitional: fact versus occasion
*2026-09-21*
- **Evidence:** three quarters of remaining false merges and all large misses
  are one disagreement. The ruler (built by reading) groups by *occasion* — one
  interview, one fight, one column. The extractor separates by *fact* — six
  previews restating one booking are one claim; one interview in instalments is
  several.
- **Confidence:** measured on the error list, but the ruler is Fable's
  judgement, not Anton's.
- **Does not say:** which is right. "Have we told the group?" wants the fact;
  "show me everything in this story" wants the occasion. **Undecided; Anton's
  call, and it may differ by stage.**

### Prompt wording cannot see dates
*2026-09-21*
- **Evidence:** #817, a column published two days after a fight, is extracted
  as the fight result in all five passes through four prompt shapes.
- **Confidence:** measured (five passes).
- **Does not say:** that it cannot be caught — the extractor already returns a
  `date` field, and fight date ≪ article date is a check code can make.

### Structured fields agree on same-story pairs, but also on different ones
*2026-09-21*
- **Evidence:** exact-match agreement, same-story vs different-story pairs:
  actor 98% vs 36%; event 67% vs 43%; date 86% vs 63%, but date is filled on
  only part of the set.
- **Confidence:** observed once; never scored as a dedup.
- **Does not say:** whether field-matching could replace similarity. Untested.

---

## Superseded

- *2026-09-17 → 2026-09-17:* "`official` became a sink partly because it sat
  first in its list." Withdrawn the same night by the reversal test above; the
  23x enrichment of the literal word "official" in the migrating articles still
  stands.
- *2026-09-17 → 2026-09-18:* "Bucket 2 is 69% of articles." That was before
  the novelty question existed; it is 51% with it.
