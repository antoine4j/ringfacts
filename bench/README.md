# The bench

Run a battery of articles through **one** pipeline step, on the test keys and
the bench database, from any fresh session. Ask for it in plain words —
"run the tune corpus through the matcher", "check what the tier rule does
with a18 and a25" — and this is what runs.

```bash
node bench/run.js --step tier                         # free, offline: the tier rule over corpus/tune.json
node bench/run.js --step matcher --keys a16,a18       # real Haiku calls, on the TEST key
node bench/run.js --step extract --limit 5            # live fetches: which rung produced a body
node bench/run.js --step untrusted --from my.json     # the bench database's record for each domain
node bench/run.js --step bucket --from corpus/graded-2026-09.json --split tune --repeat 5
                                                      # which goals.md bucket the pipeline gives each
                                                      # graded article, 5 runs each, modal answer scored
node bench/reset.js                                   # empty tables, current schema
node bench/reset.js --from /tmp/backup.json.gz        # ...then a daily backup restored into it
```

Every run prints a table (`ok` / `XX` against the corpus label when there is
one, `!!` for an error), a per-label line, and the tokens spent, and writes
the full rows to `bench/runs/` (gitignored).

## Scoring as a rate

The matcher is not deterministic, so a single run is a sample. `--repeat K`
asks the step K times per article and scores the **modal** answer; each row
shows `[agree/K]`, and the summary counts how many rows gave the same answer
every time. Four calls run at once for the paid steps. `--split tune` narrows
a corpus file to one split — keep `holdout` closed until a change is done, and
never put `prompt` items in a scored run once they are in the prompt.

The `spent:` line is measured tokens (the API reports them on every reply)
times Haiku's list price from memory; the Anthropic console is the number
that counts.

## What it will never touch

- **Production keys.** `bench/.env.bench` (gitignored) holds keys named
  `ANTHROPIC_TEST_API_KEY` and `GEMINI_TEST_API_KEY`; `bench/env.js` maps them
  onto the SDK names and refuses a file that carries the unprefixed names.
- **The production database.** The `DATABASE_URL` in that file must name the
  `bench` database; `reset.js` checks again before its one `TRUNCATE`.
- **The group.** Nothing here posts. (`BENCH_CHAT_ID` is reserved for a
  future `--sink` that posts to the throwaway group.)

## Where the pieces are

| File | What it holds |
|---|---|
| `steps.js` | The steps, each a function of an article and a context of dependencies, with `needs` saying what it touches (`anthropic`, `network`, `db`, or nothing). Add a step here. |
| `items.js` | Corpus rows → pipeline items; subject resolution by name or name stem. |
| `env.js` | The TEST-key mapping and the two refusals. |
| `args.js` | The command line. |
| `run.js` | Glue: env, real modules, table, run record. |
| `reset.js` | Empty schema, optional restore from a backup. |

Tests: `test/bench.test.js`, all on fakes. The steps take their dependencies
from the context, which is why they can be tested without a key.

## Not built yet

A `full` step that drives `huntSubject` end to end into the bench database,
recorded-LLM replay, and `--sink`. TODO.md lists them in order.

## The story gate

The labelled archive (674 articles Anton graded, `tmp/labels/`) replayed
through the **real** matcher — `lib/matcher.js`, the same code the hunt runs —
and scored against his labels.

```bash
node bench/story.js --decider fake --mode body --limit 60   # free: no key, no calls, checks the wiring
node bench/story.js --mode body                             # the paid pass, about $1.85
node bench/story.js --mode body --repeat 3                  # three passes and the spread
node bench/story.js --mode title                            # headline-only, the old hold's shape
node bench/story.js --top 5 --no-shape                      # a bigger shortlist, fight-week rules off
```

Articles arrive in the order they really arrived, per subject. Each one is
offered the top-3 stories of the last 7 days by embedding similarity (max over
all of a story's members) and the matcher answers join / new / reaction /
wrong_subject. The stories are the matcher's **own** — a cascade, not an
oracle, so an early mistake is still there ten articles later.

What the table counts:

- **held** — labelled repeats the matcher folded into some story: `caught`
  (the right story) plus `misplaced` (the wrong one).
- **never posted** — every labelled repeat the group never sees a second
  time: `held` plus the repeats the matcher called `wrong_subject`. A
  `wrong_subject` verdict drops the article before it can post, so
  production never shows it as a repeat either — that is why this, not
  `held` alone, is the number the gate checks.
- **missed** — a labelled repeat it opened a new story for. A
  `wrong_subject` repeat is counted here too, since it also failed to join.
- **useful / junk swallowed** — a labelled first arrival it folded into an
  existing story. Useful means Anton's bucket said it was worth posting; that
  is a story the readers never see, and the number the gate cares about.
- **useful dropped as wrong subject** — a labelled first arrival worth
  posting (bucket 1 or 2) that the matcher called `wrong_subject`: a real
  article dropped before anyone saw it, not just swallowed into another
  story.
- **reactions**, and **true story in shortlist** — how often the right story
  was even on the menu, which separates a shortlist failure from a model one.

`wrong_subject` and UNSURE are reported under the table. Each opens a story of
its own, so they neither join nor anchor a repeat.

The ship gate: **held ≥ 307**, **useful swallowed ≤ 9**, and none of #490,
#594 or #598 folded into #474 (the three Anton ruled separate stories). The
run ends in a `## gate` line, `PASS` or `FAIL` with the reasons.

### The noise band

The matcher is not deterministic. A single run cannot show a change smaller
than about **±4 held** or **±3 useful swallowed** — that is drift, not your
edit. For a real comparison run `--repeat 3` and read the spread line, or
compare modal answers. One run is a sample; say so when you report it.

### The budget rule

A full pass is about **$1.85** on the TEST key, and the Anthropic monthly cap
is shared with production — spending it here takes it away from the live hunt.
So: run the free `--decider fake` pass first to check the wiring, run the paid
pass once, and reread the cache. Verdicts are cached per run in
`tmp/labels/bench-story-<tag>-r<k>.json`, so a rerun of the same settings
costs nothing; delete the cache file to pay for a fresh sample.
