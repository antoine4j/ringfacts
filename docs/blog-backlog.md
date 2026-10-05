# Blog post ideas — RingFacts

Ideas for posts about building this project in public: problems that are
general to building AI applications, and with AI tools, told through what
happened here. A backlog, not drafts. This project only; newest at the bottom.

Each entry: the problem in one line, why someone building with AI would care,
what happened here (with pointers to the evidence in the repo), what a post
still needs, and a status: `idea` → `briefed` (an evidence-checked brief in
`docs/blog-briefs/`, made with the `developing-post-briefs` skill) →
`drafting` → `posted` (with the link), or `tentative` while it is unclear the
idea is worth a post.

Two themes, one tag each:

- **building AI applications**: working with models that are not
  deterministic: testing, precision, measuring success, and designs that keep
  the variation and the loss of information small.
- **building with AI tools**: coding with an agent such as Claude Code
  effectively, without a lot of rework.

---

## 1. Over-merging vs over-splitting: grouping news into stories when you cannot have both
*Added 2026-10-05 · status: idea · building AI applications*

- **The problem.** Every article must be grouped into the story it reports, one
  at a time, as it arrives. Two failures pull against each other: an
  **over-merge** folds a different story into an existing one, and the news is
  swallowed; an **over-split** gives one story two groups, and it is posted
  twice. Models are not deterministic and the news is varied, so some of both
  always happens. Chaining (a group drifting through its most similar member)
  and a stale leader (a group described forever by its first article) are the
  named ways it goes wrong.
- **Why people would care.** Anyone deduplicating, clustering or "grouping by
  meaning" with embeddings and an LLM meets this: support tickets, news, logs,
  product reviews. The usual framing is one accuracy number; the useful one is
  two numbers and a decision about which failure costs more.
- **What happened here.** v0's replay on the labelled set: pair precision 0.62,
  pair recall 0.83 on training (it leans toward merging); anchoring a story's
  label to its earliest firm article took recall from 0.55 to 0.83 at almost no
  cost in precision. Then a product decision, not a model one: a repeat costs
  the reader a second look, a swallowed booking costs the reason the bot
  exists, so grouping is tuned to split and the splits are absorbed
  downstream (the weekly digest merges what is one story; a check before
  posting catches repeats). Evidence: `docs/goals.md` (G3, "When G1 and G3
  pull apart"), `v0/pipeline/measure/replay-results/`, the Golden Set Map tasks
  6.9 and 6.12.
- **Angle.** "Pick which mistake you can live with, then design so the other
  one gets caught later."

## 2. Why a 300-article golden set: an agent grading its own system measures nothing
*Added 2026-10-05 · status: idea · building AI applications*

- **The problem.** When an AI judges the output of an AI pipeline, with no
  human answer key behind it, it mostly agrees with itself: the numbers look
  like measurement and are not.
- **Why people would care.** "LLM as a judge" is the default way teams
  evaluate; most never build the small human-labelled set that would tell
  them whether the judge is right.
- **What happened here.** How the project came to need the golden set: 300
  articles stratified from the archive, 128 claims, Anton's rulings, a
  training / validation / test split, every station scored against it.
  Evidence: `docs/lessons.md` ("An agent grading its own system is not
  measuring anything"), `docs/golden-set.md`, the September grading passes.
- **Needs.** Anton's own account of the moment the agent-graded numbers stopped
  being trusted.

## 3. Run it twice before you believe it: the noise floor of an LLM pipeline
*Added 2026-10-05 · status: idea · building AI applications*

- **The problem.** The same input through the same model gives different
  answers; a "+3%" after a prompt change can be noise.
- **Why people would care.** Prompt tuning by eyeballing one run is how most
  teams work, and it chases noise.
- **What happened here.** Identical runs compared before any delta was read;
  changes accepted only on two agreeing runs (the classifier v7 tuning).
  Evidence: `docs/lessons.md` ("Measure the noise floor before reading any
  delta"), `experiments/2026-10-03-classifier-v7/`.

## 4. One honest number: spending a test set exactly once
*Added 2026-10-05 · status: idea · building AI applications · pairs with 2*

- **The problem.** Every look at a test set while still tuning turns it into a
  second training set (leakage), and the final number flatters the system.
- **Why people would care.** The training / validation / test discipline from
  machine learning is rarely applied to prompts, and prompts overfit too.
- **What happened here.** The classifier's test score was taken once, when
  tuning was finished (40 of 105 all nine right, below training's range:
  fitted to training, honestly reported). The extractor's test was
  pre-registered and came out "does not hold", and v0 shipped anyway, as a
  finding rather than a block. Grouping's test score is kept unspent until
  its design settles. Evidence: `docs/decisions.md#classifier-pass-marks`,
  the extraction experiment's README, Golden Set Map tasks 4.7, 5.7, 6.7.

## 5. The classifier invents an answer when "nothing" is not on the menu
*Added 2026-10-05 · status: idea · building AI applications*

- **The problem.** A closed-set classifier must pick an option; when none fits,
  it picks the nearest one, confidently. Option wording and order bend
  answers in ways nobody sees.
- **Why people would care.** Every "classify this into one of N" prompt has
  this failure, and confidence scores hide it ("confidence measures the
  menu, not the article").
- **What happened here.** Evidence in `docs/lessons.md`, section 2 (JEV): a
  missing "nothing to say" option, an option defined by content becoming a
  sink, option order effects.
- **Needs.** Concrete before/after examples dug up from the classifier
  experiments, with the articles they moved.

## 6. Scraping is the real bottleneck
*Added 2026-10-05 · status: tentative (not AI-specific) · building AI applications*

- **The problem.** The models were fine; the pipeline could not read the
  articles. Outlets block fetchers, aggregators give summaries only.
- **What happened here.** Over the whole archive v0 could not read 72% of
  Amosov's articles and 42% of Donchenko's, so their digests were near
  empty. Evidence: `docs/lessons.md` ("A fifth of the feed has no usable
  body"), the body-fetch spike of 5 October.
- **Why tentative.** It is a data-collection problem more than an AI one;
  worth a post only if the spike finds a general fix.

## 7. Building on a dime: what an AI news pipeline actually costs
*Added 2026-10-05 · status: idea · building AI applications*

- **The problem.** People, software engineers included, assume a system like
  this costs a lot to run. It runs on free tiers plus cents of model calls.
- **Why people would care.** Cost is the first objection to building with
  LLMs; real numbers, monthly and a year out, answer it.
- **What happened here.** Running costs kept inside Google Cloud's free tiers
  (six secrets merged into one to fit the free six; Cloud Run's free CPU
  budgeted per job); embeddings on Gemini's free tier, with a same-model
  paid fallback measured at $0.00008 a reading; cheaper models where they
  were good enough, and why v0's design moved from Haiku (production's
  matcher) to cheaper models; the digest
  model chosen blind on real output, at $0.008 to $0.08 a digest. Running
  cost kept apart from development and testing cost, which is higher.
  Evidence: `docs/decisions.md` (one-config-secret, v0-embedding-fallback),
  the v0 design spec's cost tables, the runs table's measured spend.
- **Needs.** Measured monthly running cost for production and v0 (from the
  runs table and the billing pages), development spend to date, and the
  reasoning for leaving Haiku in v0's design.

## 8. A design doc in hours, a build overnight: building v0 with an autonomous agent
*Added 2026-10-05 · status: idea · building with AI tools*

- **The problem.** Where the human's time goes when an agent writes the code:
  most of it into the design, very little into the build.
- **Why people would care.** It shows a working division of labour with a
  coding agent, and the rework it avoids.
- **What happened here.** Many hours of back-and-forth to write and approve
  the v0 design (34 decisions), then the agent built, tested and deployed it
  unattended in one night under a written contract (check-in log, commit per
  task, no destructive action without a yes), and the morning's fixes: a
  skip rule that cancelled every deploy, a label rule that split one story
  four ways. Evidence: `docs/superpowers/specs/2026-10-04-v0-design.md`,
  `docs/checkin-log.md`, the v0 branch history.
- **Needs.** Measured, not remembered: Anton's hours and the number of turns
  on the design, and the agent's wall-clock time for the build (session
  transcripts and commit timestamps).

## 9. Never overwrite a model's answer
*Added 2026-10-05 · status: idea · building AI applications*

- **The problem.** When a pipeline overwrites a model's earlier answer, a bad
  decision can no longer be traced to the step and the version that made it.
- **Why people would care.** Debugging an LLM pipeline is mostly asking
  "what did it think, and when"; an overwritten answer erases that.
- **What happened here.** In v0 every station's answer is a versioned row,
  and the database refuses any update to an answer table, so the storyboard
  shows every step of every article. Evidence: `v0/schema.sql`
  (`refuse_update`), the storyboard.
- **Needs.** A real example of the pain without it: a case from production
  where an overwritten or missing answer made a wrong post untraceable.
