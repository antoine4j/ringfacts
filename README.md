# RingFacts

A news tracker for public figures. It watches a small list of people, works out
which stories are actually *about* them, tracks each claim from rumour to
confirmation, and posts the result to a private Telegram group — dropping the
near-duplicate re-posts, the wrong-subject stories, and the articles that only
mention someone in passing.

It ships configured for combat sports (MMA), which is what it runs as in
production: an hourly Cloud Run Job on GCP with Neon Postgres + pgvector for
memory, both inside free tiers, plus two LLM providers doing different jobs —
Claude Haiku 4.5 makes the judgment call (the claim matcher), Gemini does the
mechanical ones (`gemini-embedding-001` for the semantic dedup gate,
Flash-Lite for headline translation). LLM spend is the one real cost.

Renamed from *FighterBot* on 2026-08-10 — the commit history and the deployed
GCP resource names (`fighterbot`, `fighterbot-hunter`) still carry the old
name; see the note in [setup.sh](setup.sh) for why the resources keep it.

This is a learning project as much as a working bot. The commit history and
[TODO.md](TODO.md) are kept deliberately verbose about *why* decisions were
made — including the ones that were measured and then rejected.

This project is being created by directing Claude Code and using it as a
design partner.

## What a run does

Every hour, the hunter:

1. **Fetches** Google News RSS per subject (with multi-language name aliases)
   plus a set of direct publisher feeds.
2. **Drops** anything already seen, by URL or by resolved URL after unwrapping
   Google's redirect links.
3. **Holds semantic duplicates** — the same story from a different outlet, or in
   a different language — using pgvector cosine similarity at ≥ 0.80.
4. **Reads the article** for survivors only: decodes the wrapped URL and
   extracts the body through a zero-dependency ladder (feed content → JSON-LD →
   article tag → paragraphs → og:description), recording which rung produced it.
5. **Asks a Haiku matcher** what each article is actually about, body excerpt
   included — is this a new claim, an echo of a claim already tracked, no claim
   at all, or a different subject entirely? The same forced-tool call also
   records how prominently the subject figures in the article's own text
   (`central` / `supporting` / `passing`).
6. **Posts**, threading follow-ups under the original story and folding merely
   tangential articles into one shared "Also mentioning" line — demotion
   decided by the matcher's prominence verdict first, then by a mention-count
   rule measured on the live archive.

Every gate fails open. No embeddings degrades to URL-only dedup; a matcher error
posts the article as it always would have. A failed Telegram send walks its rows
back to unposted, and the next run that can deliver picks them up — bounded by
the same freshness window discovery uses, so an outage delays news rather than
silently eating it. Each direct feed also logs how many items it matched and
discarded, so a dead name filter reads as sustained `0 matched` instead of a
quiet news day. The single fatal condition is a configured-but-unreachable
database — posting without memory would re-spam the group every hour.

## Two kinds of configuration

The pipeline above knows nothing about MMA. Two things do, and they are
deliberately separate:

**The domain** ([`domain/`](domain/README.md)) is *what kind of thing* is being
tracked: which outlets to read, whose word counts as authoritative, the claim
vocabulary, and the nouns spliced into the matcher prompt. `DOMAIN=mma` is the
default. [`domain/example-music.js`](domain/example-music.js) is a second one,
written to prove the seam is real — it is clearly labelled as never having been
run, with unverified feeds and unmeasured thresholds.

**The watchlist** ([`watchlist.js`](watchlist.js)) is *who* is tracked — the
real one this bot runs on, three fighters, checked in. It carries the search
aliases per language edition and the per-subject `confusables` hints that tell
the matcher which namesakes and relatives to watch out for.

It was briefly gitignored, on the theory that the machinery was the interesting
part and the list was private. That turned out to be a fiction: the walkthroughs
below quote real headlines about these people, and a repo that hides the list
while showing the coverage is only pretending. Everything is public and
consistent instead. [`watchlist.example.js`](watchlist.example.js) documents the
shape for anyone starting their own.

## Design notes worth reading

The interesting parts aren't the plumbing, they're the judgment calls:

- **[The Funnel](https://antoine4j.github.io/ringfacts/funnel-walkthrough.html)**
  ([source](docs/funnel-walkthrough.html)) — start here: real articles from the
  live archive followed through every stage of the funnel, discovery to claim,
  with the verdicts production actually recorded — including the ones that were
  wrong.
- **[Architecture Overview](https://antoine4j.github.io/ringfacts/architecture-overview.html)**
  ([source](docs/architecture-overview.html)) — the system as actually built:
  pipeline, claims layer, ops, autonomy.
- **[lib/tier.js](lib/tier.js)** — thresholds measured against real archived
  data rather than guessed, with the two rejected alternatives documented so
  they don't get reintroduced.
- **[docs/self-improvement.md](docs/self-improvement.md)** — how scheduled
  check-in runs are allowed to decide things.
- **[docs/sandboxed-autonomy.md](docs/sandboxed-autonomy.md)** — the parked
  design for letting those runs go fully unattended: scope the credentials so
  that even a fully prompt-injected run is harmless. Written down,
  deliberately not built yet.
- **[TODO.md](TODO.md)** — the build sequence as it actually unfolded,
  measured decisions and rejected alternatives included, plus the open
  question that challenges the project's own framing.

## Running it

Requires Node 22+ (uses `--env-file-if-exists`), a GCP project, a Neon Postgres
database, and a Telegram bot token.

```bash
npm ci
cp .env.example .env                    # then fill in your chat ids
cp watchlist.example.js watchlist.js    # replaces the shipped watchlist with yours
npm run dev
```

Deployment lives entirely in [setup.sh](setup.sh) — a rerunnable record of every
CLI call that provisions the stack (Cloud Run service + job, Secret Manager,
Cloud Scheduler, IAM, the Telegram webhook). It requires a handful of
environment variables identifying *your* project and chats:

```bash
PROJECT_ID=... NEON_PROJECT_ID=... ./setup.sh
```

Any unset variable aborts the script rather than half-deploying.

The first run additionally needs `TELEGRAM_CHAT_ID` and `ADMIN_CHAT_ID`, used
once to seed the `telegram-chat-ids` secret. After that no deploy reads them
again: both surfaces receive every value by *reference* to Secret Manager, and
`setup.sh` refuses to finish if either one is left carrying a literal value.
That is not tidiness — a deploy that carries a value can corrupt it, and on
2026-08-09/10 two did, costing twenty hours of silent non-delivery.

Note that [.gcloudignore](.gcloudignore) exists so gcloud does not derive its
upload rules from `.gitignore`. It mattered acutely when the watchlist was
gitignored — the deploy succeeded and the container died at startup — and it
still guards every other ignored file that production needs.

## Tests

```bash
npm test                            # offline, no credentials, ~0.4s
git config core.hooksPath .githooks # once per clone: run them before each commit
```

Three tiers, split by what they need rather than by what they're called — see
[the test-suite overview](https://antoine4j.github.io/ringfacts/test-suite-overview.html) for the tour and
[the design note](docs/superpowers/specs/2026-08-09-test-suite-design.md) for why.

| Tier | Needs | Covers |
|---|---|---|
| Unit + fixture | nothing | the pure functions: name filtering, verdict validation, the extraction ladder, the tier rule |
| Pipeline | nothing | the wiring: both dedup gates, the digest tier, claim lifecycle, and every fail-open path |
| SQL | `TEST_DATABASE_URL` | what a fake can't check: pgvector's arithmetic, dual-identity lookups, schema agreement |

The first two run on every commit, which is the whole point — commits here come
from scheduled check-in sessions as well as from a person at a keyboard, so the
gate cannot depend on anyone remembering to run it. The SQL tier is opt-in and
expects a Neon
*branch*, never `main`:

```bash
TEST_DATABASE_URL=$(neonctl connection-string test --project-id <id>) npm run test:sql
```

The claim matcher is deliberately **not** asserted anywhere: it is an LLM call
that returns different verdicts for identical input. Stubbing it everywhere is
what keeps the suite trustworthy; measuring it belongs in a separate eval scored
as a pass rate, not a pass/fail test.

## Scope, and what this isn't

This tracks **public figures** through **published news**: RSS feeds and article
pages that anyone can read. There is nothing here that accesses private data,
and it would be a poor tool for surveilling a private individual — it works by
reading what the press has already printed about someone.

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
