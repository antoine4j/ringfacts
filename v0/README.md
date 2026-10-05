# v0

The whiteboard design ([docs/design/system.excalidraw](../docs/design/system.excalidraw))
running end to end as its own hourly job beside production, with its own
database and its own Telegram chat. The design, and every decision behind it:
[docs/superpowers/specs/2026-10-04-v0-design.md](../docs/superpowers/specs/2026-10-04-v0-design.md).
The tasks, in build order: the "v0" filter of the Golden Set Map
([golden/plan.html](../golden/plan.html)).

## Layout

| Path | What it holds |
|---|---|
| `schema.sql` | The tables, the trigger that refuses to overwrite an answer, and the `reading_now` and `claim_now` views |
| `grants.sql` | What each role may do; no role may delete |
| `pipeline/store/` | Every query; the only code that touches the database. Also the setup scripts below |
| `pipeline/settings/` | The Decider (7): answers → tier, shared with the storyboard |
| `pipeline/stations/` | One file per station; no database |
| `pipeline/workflow/` | The Mastra workflow the hourly job runs |
| `pipeline/measure/` | Golden replay, daily counts, production comparison |

## The store

A database of its own, `v0`, in the same Neon project as production's
`prod` and `bench`, with two schemas: `public` (live) and `replay` (the
golden replay). Three login roles:

| Role | Can | Address in `.env.v0` |
|---|---|---|
| `v0_pipeline` | read everything; add rows; move a reading's stage | `V0_DATABASE_URL` |
| `v0_editor` | read everything; add feedback and settings | `V0_EDITOR_DATABASE_URL` |
| `v0_feed` | read production's `items`, read-only, nothing else | `V0_FEED_DATABASE_URL` |

Set up once (already done on 2026-10-05), with the owner's addresses from
`neonctl`, never printed:

```bash
export V0_OWNER_URL="$(neonctl connection-string main --project-id calm-mouse-60802247 --database-name v0 --role-name neondb_owner)"
export PROD_OWNER_URL="$(neonctl connection-string main --project-id calm-mouse-60802247 --database-name prod --role-name neondb_owner)"
node pipeline/store/roles.ts     # makes the roles; writes their addresses to ../.env.v0
node pipeline/store/migrate.ts   # tables, views, grants, fighters, settings v1; safe to re-run
```

Check that every role can do what it should and nothing more (each write is
rolled back):

```bash
node --env-file=../.env.v0 pipeline/store/check-roles.ts
```

## A run

`pipeline/run.ts` runs the Mastra workflow once: import production's new
articles, then Classifier (4), Claim extractor (5), Semantic dedup (6) and
Decider (7) over every reading waiting at each stage, then post tier 1.
A reading that fails stays at its stage with its error and is tried
again next run; after 24 failures in a row it is `stuck`. Each run writes
one row to `runs` with its counts.

```bash
cd pipeline
node --env-file=../../.env.v0 run.ts --dev --import-limit 5   # development: the v0-dev Neon branch, posts printed
node --env-file=../../.env.v0 run.ts --dev --no-import        # carry on with what is waiting
node --env-file=../../.env.v0 run.ts --kind hourly            # what the Cloud Run job runs; posts if TELEGRAM_CHAT_ID is set
```

`--dev` writes to the `v0-dev` branch (a copy of the database for
development); live tables refuse deletes, so test runs never go there.
Only `--kind hourly` without `--dev` and without `DRY_RUN` sends to
Telegram.

## Tests

```bash
npm install
npm test
```

Test files end in `.spec.ts`, so production's `npm test` at the repository
root does not pick them up; the pre-commit hook runs both.
