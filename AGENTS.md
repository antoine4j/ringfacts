# RingFacts

A Telegram bot that hunts MMA news about three fighters (Fighter A, Fighter B,
Fighter C) and posts what matters to a small private group. Runs as an hourly
Cloud Run Job on GCP (`us-west1`; see [setup.sh](setup.sh)), with Neon Postgres +
pgvector for memory. RingFacts is Anton's learning project as much as it is a
bot — explaining *why* beats delivering silently.

## Read these first

| File | What it holds |
|---|---|
| **[docs/self-improvement.md](docs/self-improvement.md)** | **How autonomous check-in runs decide things. Read before changing anything.** |
| [docs/checkin-log.md](docs/checkin-log.md) | What each 6-hourly run found and did. Newest on top. |
| [TODO.md](TODO.md) | Build sequence, open questions, and the triggers that promote a watch item into work. |
| [docs/architecture-overview.html](docs/architecture-overview.html) | Living architecture overview — the system as built (pipeline, claims layer, ops, autonomy). |
| [ringfacts-spec.md](ringfacts-spec.md) | The original spec. |

## How a run works

Hourly at :17 — fetch Google News RSS per fighter (multi-language aliases) +
six direct publisher feeds (lib/feeds.js, filtered per fighter by name) →
drop URLs already seen (either identity: `url` or `resolved_url`) → hold
semantic duplicates (pgvector, cosine ≥ 0.80) → for survivors only: decode
Google's wrapped URL and fetch/extract the article body (lib/googlenews.js,
lib/extract.js — best-effort, headline-only on any failure) → ask a Haiku
matcher what each survivor is about, body excerpt included (`MATCH` / `NEW` /
`NO_CLAIM` / `WRONG_SUBJECT` / `UNSURE`) → post. Tables: `items`, `claims`,
`claim_sources`.

Every gate fails open: no embeddings degrades to URL-only dedup, a matcher error
becomes `UNSURE` and the article posts as it always did. The one fatal condition
is a configured-but-unreachable database — posting without memory would re-spam
the group every hour.

## Current mode: TEST (declared by Anton, 2026-08-08)

The bot and its Telegram group (name carries a "test" postfix) are in test
mode. **Posted-message lineage is not precious yet**: implementation and
post formats change on the go, threads may break, claims may be rebuilt,
earlier posts may not relate cleanly to later ones — all fine. Don't spend
effort preserving Telegram continuity (thread anchors, message references)
beyond what's cheap. This flips when Anton declares production: then the
code is expected stable and the group's post history becomes a contract.

## Working rules

- **Run the tests.** `npm test` — offline, no credentials, under a second. A
  `pre-commit` hook runs it automatically; enable it once per clone with
  `git config core.hooksPath .githooks`. `npm run test:sql` additionally checks
  the real queries against a Neon branch (`TEST_DATABASE_URL`), never main.
  Never commit with `--no-verify`: a red suite is a finding to report, not an
  obstacle to route around.
- **Verify before claiming.** Code changes get a `DRY_RUN=1` local run before
  deploying; `DRY_RUN=1` prints instead of posting and skips DB writes. The
  tests do not replace this — they stub the network by design, so only a dry
  run exercises the real feeds, the real matcher, and the default wiring
  between them. That distinction is not theoretical: a mis-keyed dependency
  once passed every test and was caught by the dry run.
- **Deploy with the exact command in [setup.sh](setup.sh)** — it carries the
  secret mounts, timeouts, and env vars.
- **Never post to the Telegram group** (the `group` id in `TELEGRAM_CHAT_IDS`)
  from a development or check-in session. Failure self-reports go to the admin
  DM only.
- **Deploy with `--region` stated explicitly.** A Cloud Run job name is unique
  only within a region; without the flag, `gcloud run jobs deploy` follows the
  ambient `run/region` config and will happily CREATE a second job of the same
  name elsewhere rather than update the one you meant.
- **Never pass config values to a deploy.** Both surfaces take every value by
  reference to Secret Manager. `--set-env-vars` replaces a service's whole
  variable list, so any deploy from a shell missing a value silently writes an
  empty one; `setup.sh` asserts no literal env vars survive.
- **Never print secret values.** Use command substitution:
  `DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url)`.
- **Never delete data.** The items table is the evidence record.
- Comments explain reasoning, not syntax. Match the surrounding density.
