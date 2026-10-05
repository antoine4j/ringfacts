# Blog post ideas — RingFacts

Ideas for posts about building this project in public: problems that are
general to building AI applications, and with AI tools, told through what
happened here. A backlog, not drafts. This project only; newest at the bottom.

Each entry: the problem in one line, why someone building with AI would care,
what happened here (with pointers to the evidence in the repo), and a status:
`idea` → `drafting` → `posted` (with the link).

---

## 1. Over-merging vs over-splitting: grouping news into stories when you cannot have both
*Added 2026-10-05 · status: idea*

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
