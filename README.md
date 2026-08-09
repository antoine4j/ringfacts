# FighterBot

A Telegram bot that hunts MMA news about a small watchlist of fighters and posts
what actually matters to a private group — filtering out the near-duplicate
re-posts, the wrong-subject stories, and the articles that merely mention a
fighter in passing.

It runs as an hourly Cloud Run Job on GCP with Neon Postgres + pgvector for
memory, and costs effectively nothing (everything sits inside free tiers).

This is a learning project as much as a working bot. The commit history, the
[spec](fighterbot-spec.md), and the [check-in log](docs/checkin-log.md) are kept
deliberately verbose about *why* decisions were made — including the ones that
were measured and then rejected.

## What a run does

Every hour, the hunter:

1. **Fetches** Google News RSS per fighter (with multi-language name aliases)
   plus six direct publisher feeds.
2. **Drops** anything already seen, by URL or by resolved URL after unwrapping
   Google's redirect links.
3. **Holds semantic duplicates** — the same story from a different outlet, or in
   a different language — using pgvector cosine similarity at ≥ 0.80.
4. **Reads the article** for survivors only: decodes the wrapped URL and
   extracts the body through a zero-dependency ladder (feed content → JSON-LD →
   article tag → paragraphs → og:description), recording which rung produced it.
5. **Asks a Haiku matcher** what each article is actually about, body excerpt
   included — is this a new claim, an echo of a claim already tracked, no claim
   at all, or a different subject entirely?
6. **Posts**, threading follow-ups under the original story and folding merely
   tangential articles into one shared line.

Every gate fails open. No embeddings degrades to URL-only dedup; a matcher error
posts the article as it always would have. The single fatal condition is a
configured-but-unreachable database — posting without memory would re-spam the
group every hour.

## Design notes worth reading

The interesting parts aren't the plumbing, they're the judgment calls:

- **[docs/architecture-overview.html](docs/architecture-overview.html)** — the
  system as actually built: pipeline, claims layer, ops, autonomy.
- **[lib/tier.js](lib/tier.js)** — thresholds measured against real archived
  data rather than guessed, with the two rejected alternatives documented so
  they don't get reintroduced.
- **[docs/self-improvement.md](docs/self-improvement.md)** — how the scheduled
  autonomous check-in runs are allowed to decide things.
- **[fighterbot-spec.md](fighterbot-spec.md)** — the original spec, including
  empirically verified Telegram behavior (privacy mode, group→supergroup ID
  changes) that shaped the design.

## Running it

Requires Node 22+ (uses `--env-file-if-exists`), a GCP project, a Neon Postgres
database, and a Telegram bot token.

```bash
npm ci
cp .env.example .env    # then fill in your chat ids
npm run dev
```

Deployment lives entirely in [setup.sh](setup.sh) — a rerunnable record of every
CLI call that provisions the stack (Cloud Run service + job, Secret Manager,
Cloud Scheduler, IAM, the Telegram webhook). It requires a handful of
environment variables identifying *your* project and chats:

```bash
PROJECT_ID=... NEON_PROJECT_ID=... TELEGRAM_CHAT_ID=... \
ADMIN_CHAT_ID=... ALLOWED_CHAT_IDS=... ./setup.sh
```

Any unset variable aborts the script rather than half-deploying.

## On secrets

No credentials live in this repository, and none ever have. The bot token, API
keys, and database connection string are stored in GCP Secret Manager and
fetched at the moment they're needed:

```bash
DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) node hunter.js
```

Values are piped straight into the command and never written to disk or echoed.
The `.env` file holds only non-secret identifiers (chat IDs), and is gitignored.

## License

MIT — see [LICENSE](LICENSE).
