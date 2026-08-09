# FighterBot

A Telegram bot that hunts MMA news about three fighters (Fighter A, Fighter B,
Fighter C) and posts what matters to a small private group. Runs as an hourly
Cloud Run Job on GCP (`${PROJECT_ID}`, `us-west1`), with Neon Postgres +
pgvector for memory. FighterBot is Anton's learning project as much as it is a
bot — explaining *why* beats delivering silently.

## Read these first

| File | What it holds |
|---|---|
| **[docs/self-improvement.md](docs/self-improvement.md)** | **How autonomous check-in runs decide things. Read before changing anything.** |
| [docs/checkin-log.md](docs/checkin-log.md) | What each 6-hourly run found and did. Newest on top. |
| [TODO.md](TODO.md) | Build sequence, open questions, and the triggers that promote a watch item into work. |
| [docs/architecture-overview.html](docs/architecture-overview.html) | Living architecture overview — the system as built (pipeline, claims layer, ops, autonomy). |
| [fighterbot-spec.md](fighterbot-spec.md) | The original spec. |

## How a run works

Hourly at :17 — fetch Google News RSS per fighter (multi-language aliases) →
drop URLs already seen → hold semantic duplicates (pgvector, cosine ≥ 0.80) →
ask a Haiku matcher what each survivor is about (`MATCH` / `NEW` / `NO_CLAIM` /
`WRONG_SUBJECT` / `UNSURE`) → post. Tables: `items`, `claims`, `claim_sources`.

Every gate fails open: no embeddings degrades to URL-only dedup, a matcher error
becomes `UNSURE` and the article posts as it always did. The one fatal condition
is a configured-but-unreachable database — posting without memory would re-spam
the group every hour.

## Working rules

- **Verify before claiming.** Code changes get a `DRY_RUN=1` local run before
  deploying; `DRY_RUN=1` prints instead of posting and skips DB writes.
- **Deploy with the exact command in [setup.sh](setup.sh)** — it carries the
  secret mounts, timeouts, and env vars.
- **Never post to the Telegram group** (`-${TELEGRAM_CHAT_ID}`) from a development or
  check-in session. Failure self-reports go to the admin DM only.
- **Never print secret values.** Use command substitution:
  `DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url)`.
- **Never delete data.** The items table is the evidence record.
- Comments explain reasoning, not syntax. Match the surrounding density.
