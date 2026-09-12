# RingFacts

A news tracker for public figures. It watches a small list of people, works out
which stories are actually *about* them, tracks each claim from rumour to
confirmation, and posts the result to a private Telegram group — dropping the
near-duplicate re-posts, the wrong-subject stories, and the articles that only
mention someone in passing.

It ships configured for combat sports (MMA), which is what it runs as in
production: an hourly Cloud Run Job on GCP with Neon Postgres + pgvector for
memory, both inside free tiers, plus two LLM providers doing different jobs —
Claude Haiku 4.5 makes the judgment call (the story decider), Gemini does the
mechanical ones (`gemini-embedding-001` for the embeddings,
`gemini-flash-lite-latest` for headline translation). LLM spend is the one
real cost.

**On this document and the running system.** Deploys here are manual and
deliberate, so `main` is routinely ahead of what is live. This file describes
the code on `main`; where the two differ, the difference is a pending deploy
rather than a description of behaviour you would observe in the group.

Renamed from *FighterBot* on 2026-08-10 — the commit history and the deployed
GCP resource names (`fighterbot`, `fighterbot-hunter`) still carry the old
name; see the note in [setup.sh](setup.sh) for why the resources keep it.

This is a learning project as much as a working bot. The commit history and
[TODO.md](TODO.md) are kept deliberately verbose about *why* decisions were
made — including the ones that were measured and then rejected.

This project is being created by directing Claude Code and using it as a
design partner.

## The unit: a story

A **story** is one piece of news — one statement, one event, on one day — and
every article reporting it points at the same row. It is the unit of "the group
has already seen this", and it is what the hourly run is really deciding about:
not *is this article a duplicate of that article*, but *is this article the
story we are already telling*.

That matters because the two questions have different answers. Nine outlets
writing up the same press conference are nine articles and one story. A fight
recap and the booking it settles are two stories that share every name in them.
Similarity cannot tell those apart; the decider is asked to.

## What a run does

Every hour, the hunter:

1. **Fetches** Google News RSS per subject (with multi-language name aliases)
   plus a set of direct publisher feeds, `HOURS_BACK=24` of freshness, first
   sighting winning within a run.
2. **Drops** anything already seen, by URL or by resolved URL after unwrapping
   Google's redirect links.
3. **Reads the article**, before deciding anything about it: decodes the
   wrapped URL, catches the same address arriving under a second wrapper, and
   extracts the body through a zero-dependency ladder (feed content → JSON-LD →
   article tag → paragraphs → og:description), recording which rung produced
   it. This runs ahead of the dedup decision rather than after it, which is the
   order it was in before 2026-09-06 — the decider reads the article, so the
   article has to exist first.
4. **Embeds** the headline plus the first 1500 characters of the body, one
   batch call. The nearest already-posted neighbour is recorded for every item,
   posted or held, but it is audit data: on its own it now decides nothing.
5. **Asks the decider** — one forced Haiku tool call — which of this subject's
   recent stories this article is. It sees a shortlist of the 3 closest stories
   from the last 7 days, ranked by embedding distance, and answers `join` (a
   repeat of one of them, held), `new` (news no listed story has), `reaction`
   (someone answering a listed story — its own news, linked to that one), or
   `wrong_subject`. The same call reports how prominently the subject figures
   in the article's own text (`central` / `supporting` / `passing`) and whether
   a follower would learn anything from it.
6. **Falls back to the threshold** only when the decider is unavailable or
   answers UNSURE: pgvector cosine similarity at ≥ 0.85 holds the article as a
   near-duplicate. This was the main gate until 2026-09-06 and is now the net
   under a decider outage — a matcher error must not turn every echo into a
   second post.
7. **Posts**, threading follow-ups under the story they answer. A new story can
   mint a claim, born `rumor` unless the source is official. Merely tangential
   articles — the fighter named in passing in someone else's story — never ride
   the hourly message. Demotion is decided by the decider's prominence verdict
   first, then by a mention-count rule measured on the live archive.

**The mentions digest is built but not scheduled.** Tangential articles are
written to the archive with `held_reason = 'tangential'` and the
`fighterbot-mentions` job exists to collect them, but no Cloud Scheduler entry
fires it (Anton, 2026-09-04). In production today those articles are recorded
and never shown — dropped, in effect, not queued. Turning them on is one
scheduler entry; nobody has decided they are wanted.

Every gate fails open. No embeddings degrades to URL-only dedup; a matcher error
posts the article as it always would have. A failed Telegram send walks its rows
back to unposted, and the next run that can deliver picks them up — bounded by
the same freshness window discovery uses, so an outage delays news rather than
silently eating it. Each direct feed also logs how many items it matched and
discarded, so a dead name filter reads as sustained `0 matched` instead of a
quiet news day. The single fatal condition is a configured-but-unreachable
database — posting without memory would re-spam the group every hour.

## How it is measured

Claims about a pipeline like this are cheap, so the numbers here are read out
of the live database and the repo rather than remembered.

**Does it post a story once?** The live decider has opened **54 stories** since
it shipped on 2026-09-06. **45 of them reached the Telegram group, each exactly
once; the other 9 were held in full.** Across the whole archive, which includes
the months before the decider existed, 145 stories posted once and 9 posted
more than once — every repeat from the earlier threshold-only era. Reproduce it
by joining `items` to `stories` where `decided_by = 'story'` and counting
`posted` per story.

**And that number is narrower than it sounds.** It says no *story object* was
posted twice. It is measured against the pipeline's own grouping, which is the
very thing under test: if the decider reads one occasion as two stories, both
get posted, the group sees the same news twice, and this metric still reads
clean. The question it answers is internal consistency, not whether a reader
saw a repeat.

There is measurable room for that. Among articles the group saw, **15 pairs sit
in two different stories the live decider opened while being 0.80 or closer by
embedding distance**, the nearest two at 0.927 and 0.918 — for instance one
Matt Brown remark about rebooking Gaethje–Topuria filed as S214 and again as
S216, and Gaethje's "easy to predict" line posted in English as S223 and S236
and possibly a third time in Spanish as S244. Similarity is not proof of a
repeat; two people reacting to the same event on the same day are genuinely two
pieces of news, and only a person reading them can say which is which. That is
precisely the judgement the regrading below exists to collect.

So: no story posted twice, an upper bound of 15 places where that might not
mean what it sounds like, and no effectiveness figure yet. Reproduce the bound
by joining `items` to itself on `nearest_item` where both rows are `posted` and
their `story_id`s differ.

**Is it actually hourly?** 143 of the last 168 hours produced archived items.
The job is a Cloud Scheduler entry firing at `:17`.

**The labelled corpus** is [`corpus/graded-2026-09.json`](corpus/README.md):
103 articles posted between Aug 5 and Sep 4, each carrying the
[goals.md](docs/goals.md) bucket it should have had, split into `prompt` (14
worked examples, reserved as few-shot material), `tune` (45) and `holdout`
(44). [`bench/`](bench/README.md) runs a battery of articles through **one**
pipeline step at a time, on test keys and a separate database, so a change to
the tier rule can be scored without touching production or waiting for news.

**What there is no number for yet: whether it sends the right things.** That
needs a pair, and each half needs a denominator:

- **Precision** — *of the stories it sent, how many were worth sending?* The
  denominator is readable from the database today: 45.
- **Recall** — *of the stories worth sending, how many did it send?* This
  denominator cannot be read from the database at all. A story the pipeline
  never recognised has no row in `stories`; it is sitting unnoticed among the
  articles held as off-subject. The denominator only exists once a person has
  read the archive and said what was there.

That asymmetry is the whole reason for the regrading described next. Until it
is done, quoting a single percentage would mean picking whichever denominator
flattered the result — and a system can score perfectly on either half alone by
sending nothing, or by sending everything.

**What is weak about the corpus, stated plainly.** Its labels were produced by
a model and then reviewed, and most of the review was acceptance rather than
independent judgement: of the 45 articles in the tune split, 43 carry a blanket
"as graded" and 2 are written in a person's own words; the holdout split is 44
of 44 acceptances. That is a real limit on what any score against it means — a
label the reviewer model got wrong survives into the answer key, and models are
then scored on whether they reproduce it. A story-by-story regrading is
underway to replace it, and until that lands, scores against this corpus should
be read as agreement with a ratified model rather than agreement with a person.

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
| Pipeline | nothing | the wiring: the story decider and the threshold fallback under it, the digest tier, claim lifecycle, and every fail-open path |
| SQL | `TEST_DATABASE_URL` | what a fake can't check: pgvector's arithmetic, dual-identity lookups, schema agreement |

The first two run on every commit, which is the whole point — commits here come
from scheduled check-in sessions as well as from a person at a keyboard, so the
gate cannot depend on anyone remembering to run it. The SQL tier is opt-in and
expects a Neon
*branch*, never `main`:

```bash
TEST_DATABASE_URL=$(neonctl connection-string test --project-id <id>) npm run test:sql
```

The decider is deliberately **not** asserted anywhere: it is an LLM call
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
