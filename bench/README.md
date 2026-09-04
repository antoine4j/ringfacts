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
