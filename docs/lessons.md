# Lessons — what we know about the data and the models

What the experiments have taught us, across experiments and across two
independent projects, in a form a fresh agent can read in a few minutes.
**These are findings, not rules.** Design decisions live on the whiteboard
(`docs/design/system.excalidraw`) and in `docs/decisions.md`; how to work lives
in `docs/self-improvement.md`. This file says what was measured, so the next
agent can build on it — or doubt it and check.

## Provenance — two projects, kept apart on purpose

Two attempts at the same task were run in isolation, so that agreement between
them means something. Where both found a thing without contact, the entry says
**found independently by both** — that is the strongest signal in this file,
and the one neither project could produce alone.

| | **FB** — this repo (`fighter-bot`) | **RF** — `ringfacts-experiment` |
|---|---|---|
| Shape | Stage-by-stage experiments on a frozen sample; the whiteboard names the stages | One end-to-end pipeline, 11 full passes (runs A–N) |
| Corpus | 300 articles, stratified from the production archive (all 19 Amosov, all 99 Donchenko, 182 Topuria), 7 Aug – 17 Sep 2026 | 956 articles, 169 outlets, 34 days (7 Aug – 9 Sep 2026), four languages, replayed **one at a time in arrival order, no lookahead** |
| Models | JEV (`jev-latest`, closed-set classifier); Qwen3.8 Flash (extraction); `gemini-embedding-001` 768d | `qwen/qwen3.7-flash`, one call answering four questions per article; no embeddings |
| Human labels | ~23 bucket judgements project-wide; 1 of the 300 (#838) | 18 borderline articles, Y/N with reasons; a 40-article held-out sheet, unmarked |
| Spend | $0.81 classifier + $0.40 extraction | $1.30 |
| Ids | `#N` = article N of the 300 | `RF-L01…L29` lessons, `#N` = article N of the 956; the two numberings do not line up |

Full RF material: `LESSONS.md` and `DECISIONS.md` in that repo. Its open
questions are carried at the bottom of this file **unanswered**, as it asked.

## How to read and write this file

Every entry has the same parts:

- **Claim** — one sentence, in the heading.
- **Scope** — `general` (any LLM pipeline that filters by judgement) · `domain`
  (news feeds) · `corpus` (this feed; a hypothesis elsewhere) · `harness` (this
  model or stack; re-check before carrying).
- **Evidence** — the number, and where it came from, so it can be rerun.
- **Confidence** — `measured` (a number stands behind it; replicated where it
  matters) · `observed` (it happened, not quantified) · `hunch` (a reading).
- **Does not say / would overturn it** — what the finding does *not* license,
  and what result would retire it.

Rules for adding to it:

- An entry needs a number or a named counterexample. A hunch may go in, labelled.
- Dated. A finding about a model is a finding about that model on that day.
- **Not append-only.** When a later result overturns an entry, rewrite it in
  place and move the old claim to *Superseded*, with both dates.
- Group by subject, not by experiment or project. Keep it to roughly 35
  entries; past that, merge or retire — a file nobody finishes teaches nothing.
- A finding is not a decision. If you are writing "so we should", stop — that
  sentence belongs in `decisions.md` or on the whiteboard.
- On contradiction between projects, suspect the setup before the finding, and
  record both with the difference that explains them.

---

## 1. Method — how to run an experiment here

### Measure the noise floor before reading any delta
`general` · `measured` · **found independently by both** · *FB 2026-09-17, 09-21; RF-L22*
- **Evidence (FB):** JEV, byte-identical input: 42 of 1,500 answers moved
  (2.8%). Three per-question "movements" already written up were inside that
  band and had to be retracted. Qwen3.8 Flash at temperature 0 through
  OpenRouter: 136 of 300 claims re-worded, ±8 dedup errors, ±0.003 AUC.
  `experiments/2026-09-17-role-questions/ITERATIONS.md` pass 4;
  `experiments/2026-09-20-claim-extraction/ITERATIONS.md` pass 5.
- **Evidence (RF):** temperature 0, pinned seed, salted cache: two runs agreed
  on 86.8% of articles but shared only 33 of ~50 sent items. A borderline story
  has roughly a coin's chance of being told. RF called it *the largest error
  source in the project.*
- **Evidence (FB, 2026-10-03):** JEV noise belongs to the wording, not the
  call. Two identical calls of the standing fact question differed on 2 of
  155 training articles; a reworded version that left many articles near
  the line differed on 7. A variant that gained 9 on one run gained 3 on
  the next. `experiments/2026-10-03-classifier-v7/README.md`, E1.
- **Does not say:** that the noise is uniform — see §2. **Would overturn:** a
  replicate that moves nothing; then the model has changed.

### An agent grading its own system is not measuring anything; there is no ground truth
`general` · `measured` · **found independently by both** · *FB 2026-09-17; RF-L02, L03*
- **Evidence (FB):** ~23 articles project-wide carry Anton's own bucket
  judgement; 1 of the 300 (#838). Fable readers gave second opinions on ~90;
  labelled as such in `fable-verdicts.json`. "Accuracy" here means agreement
  with a model's reading.
- **Evidence (RF):** three times a correct decision was reported as a failure
  because a model probe disagreed with the pipeline and both were models. Once
  the owner's `Y` label for the article was already committed in the repo and
  was not consulted. Three prompt versions were tuned and scored on the same 18
  labels; 18/18 measured encoding, not correctness.
- **Carry (RF's rule):** before calling any item a failure, grep the label
  store. Split labels on arrival; never score on the tuning set.
- **Does not say:** that unlabelled work is worthless. Option-list coverage,
  escape-hatch weight, same-story separation and G4 (source domain) are all
  measurable without labels.

### A handful of labels beats months of engineering — for taste, not mechanics
`general` · `measured` · *RF-L01; FB agrees by omission, 2026-09-18*
- **Evidence (RF):** seven runs of real mechanical fixes left agreement with the
  owner at 12 of 18, where the untouched baseline was. Encoding his 18 labels as
  rules took it to 17–18 of 18 and cut output from 49 messages to 16. The fixes
  were real; what was wrong was *where the line sat*, and nothing in the data
  can tell you that.
- **Evidence (FB):** the 22-article blind set is exhausted; every open question
  in both experiment READMEs is one only Anton can answer.
- **Does not say:** that labels help with checkable facts (see G4 below).

### Confidence measures the menu, not the article
`harness` · `observed` · *FB 2026-09-18*
- **Evidence:** #817 was `assessing_him` at 0.97; once `he_fought` existed it
  was `he_fought` at 0.94. #829 went 0.24 → 0.99 when one option was added. A
  missing option is invisible in the numbers.
- **Does not say:** that confidence is useless — above 0.6 it is stable, §2.

### Guard the metric you tune toward
`general` · `observed` · *FB 2026-09-17*
- **Evidence:** `sourcing` read confident at 0.83 while answering `reported`
  81% of the time; entropy of its answer mix 0.99 bits. Measuring entropy
  beside confidence caught it. Name one guard per experiment, up front.

### Change one thing, then look at every article that moved
`general` · `measured` · *FB 2026-09-18, Anton's rule*
- **Evidence:** `whose_judgement` decides **0%** of buckets in the final rules,
  `sourcing` 12%, the other four 60–81%. `he_fought` was added, tested, and
  changed one bucket by accident. `evaluate.py` prints `<-- never` beside any
  question the rules do not consult.
- **Does not say:** that an unconsulted question is useless — `he_fought` was
  kept as a pressure valve so fight reports stop polluting `assessing_him`.

### Make absence visible: trace every item, print what the system believes
`general` · `measured` · *RF-L23, L25; FB agrees, 2026-09-18*
- **Evidence (RF):** 1,915 decision rows for 956 articles; two bugs found only
  because items were visibly missing from that table. A swallowed fight result
  sat undetected through three runs and two audits until every run printed the
  fights it believed happened beside the message that reported each.
- **Evidence (FB):** the sample's unusable bodies (#521, #653, #230) were found
  by reading the escape-hatch tail, not by an error.
- **Carry:** the log shows what was sent; it cannot show what should have been.

### Review extracts by convergence, and spot-check where convergence would lie
`general` · `observed` · *FB 2026-09-22, Anton's method*
- **Claim:** when each article is extracted in isolation, agreement between
  extracts of one story is evidence against invention, and a reviewer can
  judge extracts instead of reading articles.
- **Evidence:** Anton reviewed the extraction report by extracts alone,
  reading articles only to spot-check. His reasoning: each call sees one
  article and nothing else, so independent extracts that converge were not
  hallucinated. Story-125: three outlets, three claims agreeing on the fact;
  a check of the bodies confirmed the detail one claim kept was in all three.
- **Does not say:** that convergence catches a *shared* misreading. Pass 1's
  previews all converged on the booking they recalled; #817 converges with
  the 24 result articles because it restates the result; RF's seven invented
  bookings were each corroborated 3–10 times (RF-L17). Aim spot-checks at
  what all articles can repeat and still be wrong about: is it new, the
  where-and-when, the date against the article's date.

### Ask several questions in one call when they share a reading
`general` · `measured` · **found independently by both** · *FB 2026-09-17; RF-L18, A7*
- **Evidence:** JEV answers six closed questions per article in one call, ~4–5
  cents per 300. RF answered four (about him · already sent · when · what to
  say) in one call, ~810 per run, ~$0.09.
- **Does not say:** that unrelated questions should share a call.

### Cheap model, expensive discipline
`harness` · `measured` · **found independently by both** · *FB; RF-L26, M1*
- **Evidence:** RF, 11 full passes for $1.30; the worst quality problems were
  its own parsing bug and its own measurement. FB, 18 classifier passes for
  $0.81 and 5 extraction passes for $0.40; the money went to replicates and
  reversals, which is what bought the noise-floor finding.

---

## 2. JEV — the closed-set classifier (TypeSafe "systemone", `jev-latest`)

### What the vendor documents, read 2026-09-27 (docs.typesafe.ai)
`harness` · `documented` · *FB 2026-09-27*
- **Three question types**, not one: `choice` (one of a set), `score`
  (ordered levels, 2–10; returns a continuous position between levels plus
  a probability per level) and `noul` (a yes/no question; returns the
  probability of yes). Everything before 2026-09-27 used only `choice`.
- **Every question is evaluated in isolation**, and every choice option
  against the state on its own; a question never sees another's answer.
- **Options and levels can be structured objects** — `what`, `not_for`,
  `examples` for an option; `summary`, `signals` for a level; `true` /
  `false` definitions for a noul — "when the model confuses neighbours".
- **State is best sent as an object with named fields**, not one string.
- **Writing rules, re-read 2026-09-27** (docs.typesafe.ai/primitives,
  /choice, /noul): one condition per yes/no question (no "A and B");
  add `true` / `false` definitions when the yes/no boundary is subtle;
  phrase so a higher value means yes, no double negatives; an option is a
  plain string when it is distinct, `null` when its name says it all, an
  object with `what` / `not_for` / `examples` only where neighbours overlap;
  overlapping options are the first pitfall listed, because they lower
  confidence. Check every question edit against these pages, not notes.
- **English is the primary language**; others are "handled but not
  equally well". Of the 300 golden articles, 168 are English, 68 Spanish,
  63 Ukrainian, 1 French, none Russian (counted 2026-10-04).
- **Known weak spots of jev-1.13:** literal reading ("scoping words,
  negations, and implied conditions are read at face value"), multi-hop
  questions, contradictory criteria, and irrelevant context as distractor.
- **The vendor recommends an in-list "other / none of the above" option**,
  which the v3 run replaced with paired fit questions (lesson above: the
  escape shows gaps in its probability, not by winning).
- **Price:** $0.042 per million input tokens, output free — a 300-article
  pass of ten questions (1.24 M input tokens) is about $0.05.
- **Option order, re-read 2026-10-02** (docs.typesafe.ai/model-jaggedness/jev-1.13):
  the vendor now documents that the model "leans toward the option that
  comes first" and advises reordering the options to check the answer
  holds. That matches the 4–14% of answers option order moved in v3. The
  same page lists double negatives and indirection, and a state padded
  with unrelated content, as weak spots; the score page says each level is
  judged without seeing its number or its neighbours, and that a scale
  should measure one thing.
- **Re-read in full 2026-10-03** (state, structure, confidence, patterns,
  cookbooks): several questions in one call give the same answers as one
  call each (its parallel-questions cookbook, 5 repeats), so wordings side
  by side in one call are a fair comparison and cost a fraction of a
  round; identical calls mostly return identical answers, and the few that
  differ sit near a line (self-consistency cookbooks); instructions may be
  an object with the question in one field and guidance in others; a deep
  taxonomy is walked one level at a time with sub-options shown.
- **Does not say:** whether identical calls are cached (its own
  self-consistency recipe adds a throwaway `uid` field to each repeat).

### A 59-article blind answer key makes a question change measurable for about a cent
`harness` · `measured` · *FB 2026-09-27*
- **Evidence:** two Fable readers labelling blind from one guide agreed on
  511 of 531 answers (96%); an Opus reader settled 18 of the 20 splits. A
  variant run on the 39 tune articles cost about $0.01; four rounds moved
  act 56 → 72%, fact 59 → 82%, and the gains held on 20 held-back articles
  (act 65 → 80%, fact 55 → 75%).
- **Does not say:** that the key is right — it is the readers' reading of
  a guide written by the session; Anton's corrections make it a key.
- **Noise:** the same question moved 2 of 39 articles between identical
  runs. A gain of one or two articles is not a finding.

### A missing "nothing to say" option makes the classifier invent one; a modifier that only applies sometimes belongs in code
`harness` · `measured` · *FB 2026-09-27*
- **Evidence:** act had no value for "he is only mentioned, nobody does
  anything regarding him"; on those articles it was right 11 of 29 times.
  Adding `only_mentions_him` took act from 56% to 72%. How firm graded any
  claim, opinions included (26%); asking four levels and setting `none` in
  code where the fact answer is `no fact` took it to 79%, 85% held back.
- **Also seen:** `not_for` boundaries moved fact (the result option's
  swallowing fell from 12 wrong to 4); naming the fighter by the state
  field alone did not; a stronger `not_for` on source changed no answer.

### A yes/no "does the article report X" answers whether X is mentioned, not whether it is the news
`harness` · `measured` · *FB 2026-09-27*
- **Evidence:** axes v4 on 300 golden articles: "Does the article report the
  outcome of a fight of his?" said yes on 224, the fact choice (which asks
  for the main news) said result on 88; 57 got a strong yes with another
  fact as their news (#203, #1031). Health: 97 vs 28. Topuria's June loss
  and recovery are background in most of his articles.
- **Does not say:** that yes/no questions are unreliable — they were the
  steadiest answers in the run (0–3 changes in 300 on a repeat). The
  wording decides what they measure.
- **Would overturn:** the same question with `false` defined as "recalled as
  background" still firing on background mentions.

### Answers at confidence ≥ 0.6 are stable; below 0.4 they are near coin flips
`harness` · `measured` · *FB 2026-09-17*
- **Evidence:** across a rerun and a full reversal of every option list, 1,039
  answers at ≥0.6 moved 0 times; 277 at 0.4–0.6 flipped 2.9%; 184 below 0.4
  flipped 18.5%.
- **Does not say:** that 0.6 is the right *policy* threshold. **Would
  overturn:** a new model version; re-measure before reusing the number.

### Option order moves answers, but not toward the first position
`harness` · `measured` · *FB 2026-09-17*
- **Evidence:** reversing every list flipped 126 of 1,500 (3x the floor). But
  options moved earlier gained −0.6 answers on average, those moved later +0.9
  — no first-position bias. Flips sit where confidence is low (median 0.39).
- **Replicated, v7, 2026-10-03:** reversing or shuffling the options of
  three questions changed 6 to 11 of 155 answers each, against 2 to 3 for an
  identical copy. No order scored better in two runs, and averaging the
  probabilities over four orders scored lower than the standing order on
  two questions of three. Order is noise to control for, not a lever.

### Composing the bucket in code absorbs most of the jitter
`general` · `measured` · *FB 2026-09-17*
- **Evidence:** across three option orders only 58% of articles had every
  answer unanimous, yet 93% (279/300) landed in the same bucket.
- **Does not say:** that composition fixes wrong answers — it hides *unstable*
  ones. And one low answer can still decide alone: #55 went to bucket 3 on
  `role = background` at 0.24 over three answers above 0.9.

### An option defined by content instead of function becomes a sink
`general` · `measured` · *FB 2026-09-18*
- **Evidence:** `role = background` ("his past fight is used as backdrop")
  fired on 85/300, wrong ~60%, because every Topuria article mentions his June
  loss. The missing option — "he is the one being talked about" — was named by
  five Fable readers independently. Added: 101/300; `background` 85 → 17;
  escape weight on `role` fell 14x. Proof pair #476/#503, one interview at two
  outlets.

### The escape hatch finds missing options at the probability level, not the argmax
`harness` · `observed` · *FB 2026-09-17*
- **Evidence:** the hatch *won* 1 of 1,800 answers; it *carried weight* (>0.15)
  on 22 — and every real gap found was in those 22.

### "About him" is necessary, not sufficient — novelty was a missing question
`domain` · `measured` · *FB 2026-09-18*
- **Evidence:** blind check 17/22; all five misses were articles entirely about
  the fighter with nothing new (#605 restates a July booking). Adding `novelty`
  took bucket 2 from 69% to 51%, the blind check to 18/22. Cost: stability
  95% → 93%; novelty is the least confident question (0.55).
- **Does not say:** that novelty is one question. "Is it new *in the text*"
  is readable (the outlet's own framing, "нагадаємо"); "has the group been
  told" is not, and only dedup can answer it.

### Merging "how firm is it" into the news-kind question makes any mention of a booking a booking
`harness` · `measured` · *FB 2026-09-25*
- **Evidence:** a v2 question set folded sourcing into kind (booking official /
  reported / rumoured). On 300 golden articles the model answered a booking
  option for interviews that merely mention the booked fight: ten articles
  Anton graded 2 composed to bucket 1, accuracy on his 154 graded rows fell
  from 76% (six old questions) to 74%. Requiring in the *rule* that nobody is
  quoted, or the promotion speaks, or the act is fight-week coverage, took the
  same answers to 84% (`experiments/2026-09-25-answers-to-buckets/REPORT.html`).
- **Does not say:** that the merge is wrong; the firmness answers themselves
  were fine. It says the rule must ask who said it before it calls an event.

### "Has a follower already heard this" is not a question one article can answer
`general` · `measured` · *FB 2026-09-25*
- **Evidence:** the old `novelty` question's "restates known facts" option fired
  on nine of the 34 graded articles Anton called bucket 2: fresh quotes
  (Makhachev on Topuria three times, Pimblett) that read as old to a model
  with no memory. Its other half, "nothing about him / filler", was bucket 3 in
  23 of 24. A `depth` question that asks only how much *this* text says about
  him keeps the useful half. Of the six old questions, `sourcing` decided the
  bucket for 35 articles in 300 and `whose_judgement` for none; the escape
  hatch was chosen once in 1,800 answers.
- **Does not say:** that novelty is unimportant, only that it belongs to the
  claim store, which has the memory, not to the reader of one article.

### A rescue lane needs a condition that can fail — "about him", tested by function
`general` · `observed` · **found independently by both** · *FB 2026-09-21; RF-L19, D3*
- **Evidence (RF):** a rule rescuing dismissed items when a real event was
  detected sent a restaurant feature, an empty page and a third party's
  opinion, until it also required "the article is about the subject".
- **Evidence (FB):** deciding `kind` first over-fired "about someone else" on
  18 articles where another fighter talks *about* him. The delete test —
  "delete every sentence naming him; if the story still stands, it is about
  someone else" — recovered all 18. The same defect as `background`, found
  three times across two projects.

### An example lifted from a labelled article can carry its whole claim
`general` · `measured` · *FB 2026-10-03*
- **Evidence:** v7's "how firm" question had the signal "the promotion's
  president says he is ready to fight", a paraphrase of claim-113 (ten
  copies of one Dana White statement). Replaced by an invented example,
  nine of the ten fell from "official or done" to "reported"; stating the
  rule the example stood for ("the promotion or he himself states his
  status") brought them back with no loss elsewhere. Tracing all examples
  found 18 paraphrases of golden articles, several of them **test-set**
  articles cited in the labelling rules.
  `experiments/2026-10-03-classifier-v7/README.md`, E4.
- **Does not say:** that examples are bad: invented ones scored the same.
  It says a training score can measure memory of the prompt, and a test
  score can too if the prompt paraphrases test articles.

### Making "what new fact" more willing to see news gains on training and loses out of sample
`corpus` · `measured` · *FB 2026-10-03*
- **Evidence:** four times in v7: a rumour sentence (v7.2: training +12,
  validation −3), a definition of a fact that includes reported plans (E1:
  combined with two other changes, validation −3 to −5), one yes/no
  question per kind of fact (E6: training +12, validation 0, calling
  "no fact" articles health or next fight), and a fact question written
  from the rules alone (E9: validation −5). The fixes that held were
  narrower: aligning an option with its rule (previews are not fight-week
  events, E10: +5 / +1 in two runs).
- **Does not say:** that the rumoured-fight labels are unreachable; the
  rumour fix works on those articles. It says the validation set's "no
  fact" articles pay for it, and that set has no next-fight article to
  show the benefit.
- **Would overturn:** a new labelled slice with rumoured fights where the
  broader wording gains on both sides.

### Most of the "not for" text earns its place; some of it carries nothing
`harness` · `measured` · *FB 2026-10-03*
- **Evidence:** lean versions of the nine v7 questions (definitions only;
  8,100 characters against 16,800): "how central" without its level
  signals lost 17 training articles, "whose words" without its "not for"
  lines lost 6 on training and 6 on validation, "what new fact" 7, the
  yes/no questions without true/false text 1 to 10. "What the source does"
  and "how firm" scored the same on training and 1 to 2 better on
  validation in two runs, and are now lean. A question rewritten from
  scratch from the rules lost 5 validation articles (E9).
- **Does not say:** which lines matter; it was tested question by question,
  not line by line.

### A list of who may do something is read as the whole list
`harness` · `measured` · *FB 2026-10-03*
- **Evidence:** v7's main-subject level of "how central" named "a coach, an
  official or a pundit talking about him"; articles where another fighter
  talks about him read one level down (14 training misses). Adding
  "another fighter" to the list: +8 and +7 training, +2 and +3 validation,
  in two runs (E2). The vendor's "literal reading" weakness, in its
  plainest form.
- **The same in the other direction (FB 2026-10-04):** a rule sentence is
  read as widely as its words allow. "An article built on another
  fighter's wish to fight him is that other fighter's story" also caught
  articles where another fighter talks about his future (claims 014, 033,
  097, 112). Narrowed to "a callout alone, where another fighter names him
  as the opponent he wants": +4 and +5 training, validation within 1, the
  callouts kept (E12, E13). Without the sentence, the "what is new"
  opening was what held the callouts.
- **Does not say:** that every list needs to be complete; it says a list
  inside a definition is read as a boundary.

### Telling the classifier the setting changes nothing; non-English articles are not harder
`harness` · `measured` · *FB 2026-10-04*
- **Evidence:** v7.7 sent with an added field saying the articles are MMA
  news and the fighter is in the UFC, and again with a line on who the
  fighter is (nationality, UFC, weight class), beside v7.7 sent unchanged,
  on 195 training and validation articles. Both moved fewer training
  answers than the unchanged rerun did (11 and 5 against 9 of 1,395); all
  nine right sat between the two unchanged runs (94 and 94 against 92 and
  96 of 155). By language, within one fighter, Spanish trails English by
  10 points for Topuria (about one standard error) and Ukrainian leads
  English by 19 for Donchenko. `experiments/2026-10-04-classifier-framing/`.
- **Does not say:** that context never helps JEV; the articles already name
  the sport and the promotion in their first lines. A field that adds what
  the text lacks, such as a fact the article assumes, is untested.
- **Would overturn:** a framing field that moves more answers than an
  unchanged rerun and holds on validation.

---

## 3. The articles

### The FB sample is stratified, not proportional
`corpus` · `measured` · *FB 2026-09-17*
- 300 of 1,021 with text, drawn to keep rare fighters. Frozen at
  `experiments/2026-09-17-role-questions/data/articles.json`; never re-pull.
  Ratios measured on it do not transfer as ratios. RF's 956 is the whole feed:
  of its final 16 messages, 12 were one fighter, 4 another, **0 Amosov** in 34
  days (RF-L13). Coverage is as lumpy as the press.

### A fifth of the feed has no usable body
`corpus` · `measured` · **found independently by both** · *RF-L08; FB 2026-09-18*
- **Evidence (RF):** 182 of 956 arrived as headline only — paywalls, video,
  JS shells. A bug that crashed all 182 was found by their absence from the
  trace. **(FB):** #521, #653, #230 are video stubs or boilerplate;
  `not_in_the_article_body` is the weakest option (0.47). And a body can be
  *present and still empty*: #655, BetMGM's prediction page, was stored as
  10,000 characters of inline stylesheet — the "paragraphs" rung caught a
  `<p>` full of CSS. The extractor said NO CLAIM twice, correctly; the page
  itself predicts Donchenko wins. Anton found it by opening the page
  (2026-09-23). Three of 300 bodies read as CSS by brace density; #655 is
  the clear case. A scraping defect wearing a classifier costume.

### Boilerplate contaminates the text; a focused excerpt around the subject beats a prefix
`domain` · `measured` · **found independently by both, RF tested it** · *RF-L09; FB 2026-09-20*
- **Evidence (RF):** two unrelated stories scored 0.76 lexical overlap because
  both pages carried the same navigation menu. What worked was not a threshold
  but showing the model sentences naming the subject, their neighbours, and the
  lead — fewer tokens, no contamination. Bout opponents had to share a
  *sentence* with the tracked man (D7): a 320-char window still let "Pimblett
  submitted Saint Denis" pass in a Topuria piece.
- **Evidence (FB):** production embeds headline + first 1,500 chars
  (`hunter.js`) and the matcher sends 1,200 (`lib/matcher.js`); 92% of sample
  articles are longer, the model sees ~32% of the text, and on Sport.ua the
  first 1,500 chars are largely navigation. Anton proposed a name-centred
  window; FB has **not tested it** — RF's result says it is worth ~$0.06.
- **Also (FB, 2026-09-22):** furniture puts articles *into* the pipeline,
  not only noise into their text. #948, a Gaethje-on-Tsarukyan piece, is in
  the Topuria sample because a "LATEST NEWS" cross-link in its feed body
  names Topuria; the article itself says nothing about him.
- **Tested on JEV, 2026-10-03:** sending only the article's own text
  (menus before the repeated headline and lists of timestamped headlines
  removed) made no measurable difference to v7's nine answers: all nine
  right on 92 of 155 against 91, and 17 of 40 against 18. Cutting the text
  at 4,000 characters cost 8 training articles. Inline "LATEST NEWS:"
  headlines still make the model call him "only mentioned" where the key
  says absent (4 training, 2 validation). `states.py`, E7.
- **Does not say:** that a window works for embeddings — RF used no
  embeddings.

### Speculation outnumbers events by two orders of magnitude
`domain` · `measured` · *RF-L12; FB agrees, 2026-09-18*
- **Evidence (RF):** 34 days, three fighters: roughly one booking, one result,
  a handful of injuries; hundreds of articles discussing what might happen.
  **(FB):** bucket 2 (about him, no firm event) is 51% after novelty, 69%
  before; bucket 1 (a firm, new event) is 29 of 300.

### Cross-language duplication is most of the work
`domain` · `measured` · **found independently by both** · *RF-L11; FB 2026-09-18*
- **Evidence (RF):** 276 of 956 folded into stories already sent; six articles,
  five outlets, three languages, one happening. **(FB):** of 255 unposted
  sample articles, 143 were held for similarity, not for being bucket 3. One
  Sport.ua page reached the classifier twice via `/uk/news/` and
  `/uk/amp/news/` (#773/#790, TODO 3l).

### Inflected names break naive matching, invisibly
`domain` · `measured` · *RF-L10, D8 — **not checked in FB***
- **Evidence (RF):** Slavic surnames decline and the ending *replaces* rather
  than appends (Донченко → Донченка → Донченку). Prefix match on the nominative
  lost six articles, three real stories, with no trace — an article never
  judged is not a decision you can audit. Fix: stem + bounded ending, accept
  false positives.
- **Carry:** check what production's name matching does before trusting recall.

### Arrival order is not publication order
`corpus` · `measured` · *RF-L07 — **not checked in FB***
- **Evidence (RF):** median lag site-timestamp → arrival ≈ 1 h; 90th percentile
  7–16 h; max 23 h (a since-fixed collector defect). State which clock you quote.

### Question tokens, not article tokens, dominate JEV's bill
`harness` · `measured` · *FB 2026-09-17*
- 40% of billed tokens were the question set re-sent 300 times. Whether the API
  batches or caches is unchecked.

---

## 4. Extraction, facts and embeddings

### Extraction proposes; a rule must dispose — and "was it the article's own news" is that rule
`general` · `measured` · **found independently by both** · *RF-L17, D4; FB 2026-09-21 pass 2*
- **Evidence (RF):** asked for scheduled fights, the model invented **seven**
  bookings — opponents read off event posters, "who should he face" columns
  turned into fixtures. Each was mentioned 3–10 times, so corroboration could
  not separate them from the one real booking. What did: *was this fact ever an
  article's own reported news?* The real one was; none of the seven were.
- **Evidence (FB):** pass 1 claims came back as the well-known event the
  article recalls. Pass 2's fix was the same test in prompt form — "the
  article's own news, what a reader learns here and nowhere earlier" — and it
  was the best-scoring wording of the run.
- **Does not say:** that the prompt form catches everything: FB's #817 (next
  entry) slipped through five passes of it.

### Prompt wording cannot see dates; a fact memory can
`general` · `measured` · **found independently by both** · *FB 2026-09-21; RF-L28, A4, D1*
- **Evidence (FB):** #817, a column two days after a fight, is extracted as the
  result in all five passes through four prompt shapes. The extractor already
  returns `date`; fight date ≪ article date is a check code can make.
- **Evidence (RF):** ~45 articles reporting Donchenko's win were folded into
  the month-old booking story and the group was never told he won — the worst
  failure in that project. Fix: a `bout` table filled from **every** judged
  article, background mentions included, so a fight known to be completed can
  no longer be sent as a booking. What you have told people and what is true
  are different stores.

### A one-sentence claim alone does not separate stories better than production's text
`harness` · `measured` · *FB 2026-09-21*
- **Evidence:** on 136 story clusters, claim-alone AUC 0.925 vs headline+lead
  0.918 — but 0.896 vs 0.918 on hard stories. Short claims about one fighter
  crowd together. `experiments/2026-09-20-claim-extraction/README.md`.

### The claim in front of production's text beats production's text
`harness` · `measured` · *FB 2026-09-21*
- **Evidence:** claim + occasion prepended to headline + first 1,500 chars: AUC
  0.942 / 0.929 balanced, overlap 1.2%, 396 errors vs 542 on the identical pair
  set, against a ±8 floor. `occasion` alone +0.013 AUC; first beats appended
  (0.926 vs 0.918).
- **Does not say:** that it holds live, or at production's 0.80 threshold
  (arm 4's best is 0.90). Frozen sample, one model, never validated outside.

### Embeddings do not separate a fight's preview from its result, with or without the claim
`harness` · `measured` · *FB 2026-09-22*
- **Evidence:** Donchenko vs Soriano, UFC Paris. 216 pairs of a preview
  article and a result article published within 3 days of each other.
  Production's text (headline + lead): median cosine 0.775, max 0.926, **82
  of 216 above production's 0.80 threshold**. The claim-in-front arm (4,
  pass 4): median **0.813**, max 0.939, 118 above 0.80 and **18 above its own
  best threshold of 0.90**. The claim makes it *worse*, because both claims
  name the same two men and the same event. Top pair: "Donchenko will meet
  Soriano at UFC Paris" vs "Donchenko beat Soriano at UFC Fight Night" at
  0.939. Measured from `emb-cache/` in the extraction folder.
- **The classifier can tell them apart where the embedding cannot** (same
  day, consensus pass 16): all 24 Soriano result articles answer `result`,
  all 3 booking articles `announcement`, the 5 weigh-in pieces `preview`;
  no crossover. One fight, 42 articles — the complete set for that fight,
  since the sample holds every Donchenko article with text. Anton ruled it
  firm enough to build on: a single misread lands one article in the wrong
  pile; it does not silence a story.
- **Does not say:** that a booking and a result are one story — Anton's
  ruling is that they are not (different occasions). It says similarity
  alone cannot enforce that; the classifier's `news_kind` can, on this
  case, and the extractor's `date` is a second check. **Would overturn:** a
  fight where result articles read as `announcement` at confidence ≥0.6.

### One interview can be written up fifteen days apart — a short candidate window never sees the pair
`corpus` · `observed` · *FB 2026-09-25, ruler review of story-015*
- **Evidence:** Jesús Gallo (Topuria's conditioning coach) spoke once on
  Jorge Ebro's YouTube channel. Libertad Digital wrote it up on 2026-08-12
  (#152) and again on 2026-08-27 (#412), same outlet, same interview; Infobae
  the same day (#402) dates the interview "a few weeks ago". Anton ruled
  the two Gallo pieces one story by occasion. Production's dedup and every
  pair set in these experiments look back **3 days**; that window cannot
  put #152 and #412 in front of the same judge. Anton, ruling: *"fifteen
  days apart, which goes against the three-day window — something we need
  to take into account when architecting the solution."*
- **Does not say:** how common this is — one case, found by hand, in 300
  articles. Nor what the right look-back is: a late write-up of an old
  sitting is one story by occasion, but a three-day window is also what
  keeps a booking from being re-matched to itself a month later (RF's
  148-article topic bucket, §6). The join-or-start-a-story stage needs a
  candidate set that is not only "the last few days" — perhaps open stories
  of the same fighter, however old — and that is a design question, not a
  finding.

### Structured fields split into perfect-but-rare joins and broad-but-leaky filters
`corpus` · `measured` · *FB 2026-09-21, rescored on the v3 ruler 2026-09-25*
- **Evidence:** 6,542 same-fighter pairs within 3 days, 745 inside one golden
  claim. Same speaker + same host/interviewer name: precision 100%, recall 12%.
  Shared verbatim key quote: 100% / 10%. Identical free-text occasion: 93% /
  25%. Same kind + same actor: recall 84% but fires on 49% of different-claim
  pairs. Bout + occasion type: recall 61%, and it merges a fight week's
  columns, previews and predictions, which the ruler keeps apart
  (`experiments/2026-09-25-answers-to-buckets/scores-B.json`).
- **A person's name is the stable key, a programme's name is not.** Inside the
  47 multi-article claims, speaker is one value in 39, the occasion's host or
  interviewer in 35 (where filled), the free-text occasion in 4 (one podcast
  came back under six names), the occasion *type* in 24 (the same sitting is
  "podcast" to four outlets and "interview" to two).
- **Does not say:** that any field decides membership; the host field was
  filled on 63 of 300 articles, so its recall is a prompt problem before it
  is a data problem. Would overturn it: a matcher on fields alone reaching
  the reader's precision at above 50% recall.

### A label can change while the content does not
`general` · `measured` · *RF-L20, D2 — no FB counterpart yet*
- **Evidence (RF):** dedup could be overridden when a story "moved on",
  detected by its event label shifting soft → hard. The same vision-loss story,
  filed `personal_life` Monday and `injury` Tuesday, cleared the test and the
  group read it twice. A promotion past dedup must be earned by content.

---

## 5. Harness — the model and our own code

### Models echo your formatting back, and a swallowed exception eats the decision
`general` · `measured` · *RF-L14 — no FB counterpart yet*
- **Evidence (RF):** candidates rendered `[7] summary`; the model answered
  `duplicate_of: "[7]"`; `int("[7]")` raised; an `except` swallowed it; the
  duplicate was discarded and the group got the same news repeatedly. Nearly
  every apparent judgement failure in the early runs was this bug. The instinct
  was to buy a dearer model, which would have fixed nothing.

### Reasoning off for rubric classification; never cache a non-answer
`harness` · `measured` · **found independently by both** · *RF-L15, D9; FB 2026-09-20*
- **Evidence (RF):** all 11 calls of the first smoke test returned empty
  content, the whole 700-token budget spent on reasoning. **(FB):** extraction
  pass 1 ran with reasoning on, 837 of 917 completion tokens, 2.4x the cost
  estimate; aborted after 28 calls. FB also cached HTTP 429 errors and reused
  them as results until fixed.

### Never put database ids in a prompt
`harness` · `measured` · *RF-L16, D6 — check `lib/matcher.js` before assuming FB is clean*
- **Evidence (RF):** a global story-id sequence made every prompt unique;
  three runs shared 0 cache hits of 812 calls, read as "of course the prompt
  changed" for three runs. Numbering 1..n inside the prompt took the last run
  to 338 hits. The money is the small part: a run that cannot replay cannot be
  separated from the model's weather.

### Compare versions numerically
`general` · `measured` · *RF-L21*
- `"v10" >= "v8"` is false. A whole run executed with none of its rules and
  read as a regression from new wording. Print an assertion that the rules are
  present in the built prompt.

### Exactly one goal was provable: the one with an external referent
`general` · `measured` · *RF-L06, J8*
- "Confirmed" only if the source domain is `ufc.com`, computed from the input
  and enforced over the output text: 0 violations in every run, claimed
  absolutely. The three judgement goals were argued about for the whole project.
  When a requirement can be restated as a property of the input, do that.

---

## 6. The questions both projects reached and neither could answer

These are carried **unanswered**. An agent that resolves one by choosing for
itself has reintroduced the error in §1's second entry. Only Anton answers them.

- **What is one piece of news?** RF-L05, L27, M6 and FB's "fact versus
  occasion" are the same question. RF: one subject gave one outlet several
  interviews in a week — one piece or four? 22 articles in its final run turn
  on it. RF also built a *topic* bucket while believing it had built a *story*
  (148 articles absorbed, one message, a fight result 34 hours late in a
  subordinate clause) and names the *development* — a point at which a
  follower learns something new — as the right unit. FB: the ruler groups by
  occasion, the extractor by fact; three quarters of residual dedup error is
  that disagreement. **Both landed here independently. The answer may differ
  by stage** (digest vs reading app, TODO 7).
- **What volume is right?** RF-L04: the owner's objection was never that a
  message was wrong, but that forty defensible analyses make a group stop
  reading — a property of the stream, in none of the four goals. RF ended at
  16 messages in 34 days; FB's rules give ~5.6 digest items a day. Neither
  knows which is right.
- **Where does a pundit sit?** FB: `whose_judgement` decides nothing because
  the rules never consult it. RF's owner ruling O1 counts analysis only from
  his own coach or the booked opponent's coach; FB's earlier ruling admitted
  "the champion or a top authority". **Settled 2026-09-22, by voice: the
  coach line holds** — "managers are mostly showmen". Recorded verbatim in
  `experiments/2026-09-17-role-questions/verdicts.md`. Still open: whether it
  narrows only third-party *analysis* or every speaker category.
- **How much of the remaining variance is the model?** RF: a second salted run
  of its final config, not yet run. FB: the extraction replicate says ±8 errors
  on arm 4, but the classifier's 7% unstable articles sit on the 2-vs-3 line
  where the judgement is genuinely hard.

---

## Superseded

- *2026-09-17 → 2026-09-17 (FB):* "`official` became a sink partly because it
  sat first in its list." Withdrawn the same night by the reversal test; the
  23x enrichment of the literal word "official" still stands.
- *2026-09-17 → 2026-09-18 (FB):* "Bucket 2 is 69% of articles." Before the
  novelty question; 51% with it.
- *RF J4 → O1 (RF):* "Analysis by anyone counts as substance." Reversed by
  the owner — one breakdown is interesting, forty are why a group stops
  reading. The single largest correction in that project.
- *RF J5 → D1 (RF):* "Only the first sighting of a story is sent." Superseded
  by the development override after a fight result was never sent.

## Checking an answer key with blind re-reads (2026-10-03)

**What was done.** After 27 labelling rules had been decided card by card,
the 300 golden articles were re-read blind by two Fable readers under the
final guide, then the 26 articles where they differed by a third reader
that saw one article at a time, then 20 settled cards were read by Anton.
Records: `experiments/2026-09-27-answer-key/reread-1003` and `full-reread`.

- **A rule tested only on its own examples is not tested.** Each rule had
  passed on the articles it was written for. The full re-read still found
  21 unchecked cards whose answers predated a rule, and 10 checked cards
  where a later rule reached an earlier check. Confidence: high (measured).
- **Agreement inside one batch overstates the evidence.** Five similar
  callout articles sat in one batch; each reader answered all five the same
  way, in opposite directions. That was one reading against one reading,
  not five against five. Spreading look-alikes across batches and giving
  each reader a different grouping fixed it (95 of 95 on the rerun).
  Confidence: medium; one case.
- **A subagent has a fixed cost that dwarfs the articles.** Measured here:
  about 78,000 tokens per agent before any article, about 2,000 per
  article. 18 articles cost 112,000 tokens, 6 cost 90,000. In a cloud
  session a 15-article agent cost about 2 dollars and a one-article agent
  about 0.9. So independence (one article per agent) is bought per agent
  and is worth it only for the uncertain articles. Caveat: one model, one
  week, one guide length.
- **Readers split on about 1 article in 12 even under settled rules.** Of
  300 articles, A and B differed somewhere on 26. A third reading sided
  with the key on 32 of the 46 disputed answers. What is left is recorded
  as coin flips (8 answers), not argued further. Any score against the key
  should count either accepted value as right.
- **A silent agreement is invisible.** The review page first showed the
  new readers only where they disagreed with a card, so a corrected answer
  that both had confirmed looked unverified, and 75 hints from earlier
  passes still argued with answers the re-read had settled. Showing
  confirmations and retiring out-of-date hints made the cards readable.
