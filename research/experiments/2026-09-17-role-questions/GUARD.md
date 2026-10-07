# Files that must never be overwritten

- `verdicts.md` — Anton's rulings, in his words. Append only. **The only real
  ground truth in this folder** (one article, #838).
- `ITERATIONS.md` — the history: what changed each pass, why, what it broke.
  Append only. Runs and spot checks may be regenerated; this may not. A failed
  idea gets an entry too, so it is not quietly dropped and retried later.
- `fable-verdicts.json` — the Fable readers' judgements. **A second opinion, not
  ground truth**; Fable is a model too. Header says so; keep it there.
- `spotcheck-p*.md`, `spotcheck/*.md` — one set per pass, numbered. A generator
  that finds its target already present must stop, not overwrite.
- `raw/{id}-p{N}.json` — already write-once; an existing file is reused, so a
  re-run costs nothing and cannot change history.
- `questions-p{N}.json` — the exact prompt each pass was run with. Without these
  a result cannot be reproduced.
- `data/articles.json` — the sample. Re-pulling would silently change what the
  numbers refer to. A new sample gets a new experiment folder.

Everything else is regenerable.

## How to reproduce a pass

    ORDER=""            python3 build-questions.py     # or reverse / shuffle:N
    PASS=n              python3 run.py                 # ~8 s, ~4 cents, cached
    python3 compare.py 1 2 3                           # metrics side by side
    python3 consensus.py                               # vote across three orders
    python3 buckets2.py                                # compose and score

`run.py` reads the key straight from `.env` and never prints it. `pull.mjs` is
the only thing that touches production, it sets `default_transaction_read_only`,
and **it must not be run again** — the sample is frozen.
