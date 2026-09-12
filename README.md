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

**Nothing that fails takes the run down with it, and nothing is lost from the
archive** — but "fails open" would overstate it, because the fallbacks are
deliberately more cautious than the thing they replace. If the decider errors
or answers UNSURE, the old similarity threshold stands in, and at ≥ 0.85 it
*holds* an article the decider might well have posted; with no verdict there is
also no claim, so the mention-count rule decides the tier and can demote the
article to the mentions queue that nothing currently drains. A decider outage
therefore costs coverage, quietly, rather than spilling repeats into the group —
which is the right way round for a group of three people, and worth knowing
when reading a quiet hour. Below the threshold, or with no embedding to compare
against, the article does post.

The other degradations are genuinely open. No embeddings drops to URL-only
dedup and the story shortlist falls back to recency, so an embedder outage
cannot starve the decider into calling everything new. Body extraction is all
bonus: any failure leaves the item headline-only and the decider works from the
headline. A failed Telegram send walks its rows back to unposted and the next
run that can deliver picks them up — bounded by the same freshness window
discovery uses, so an outage delays news rather than silently eating it. Each
direct feed logs how many items it matched and discarded, so a dead name filter
reads as sustained `0 matched` instead of a quiet news day. A single subject's
hunt failing is survivable; only *every* subject failing marks the run red. The
one fatal condition is a configured-but-unreachable database — posting without
memory would re-spam the group every hour.

## Where it stands

Running hourly since 2026-08-07. **1,112 articles archived, grouped into 251
stories, 167 of them posted to the group.** Thresholds in the pipeline are
measured against that archive rather than guessed — [`lib/tier.js`](lib/tier.js)
carries the measurement and the two alternatives that were tested and rejected,
so they don't get reintroduced.

**What can be said about repeats:** of the 54 stories the live decider has
opened since it shipped, 45 reached the group and each arrived once. That
counts *story objects*, though, and the objects are the pipeline's own — read
one occasion as two stories and both post while the number stays clean. There
is measurable room for that: 15 pairs of posted articles sit in different
stories while being near-identical by embedding distance.

**What cannot be said yet: how often it sends the right thing.** That needs a
pair of numbers — of what it sent, how much was worth sending; of what was
worth sending, how much it sent — and the second has no denominator you can
query. A story the pipeline never recognised has no row to count. It only
exists once a person has read the archive and said what was there.

So that is what is being built now: a grading tool that shows the archive story
by story with the pipeline's own answer **hidden** until asked for, and records
the verdict plus the reasoning in the grader's words. 251 stories to work
through. Until it lands, this project quotes no effectiveness percentage,
because picking one would mean picking whichever denominator flattered it.

## Decisions that changed the shape

The interesting history is the reversals, not the additions.

**The unit moved from claims to stories** (2026-09-06). The system used to
remember *claims* — assertions it had extracted. It turned out the thing that
needs remembering is *"have we told the group this piece of news"*, which is a
story: one statement, one event, one day. Claims still exist and still track
rumour → confirmation, but they are no longer what dedup reasons about.

**Similarity stopped being the gate.** Cosine distance at a threshold decided
repeats for the first month. It cannot separate two outlets writing up one
press conference from two people reacting to one event — the vectors look the
same and the answers differ. An LLM now makes that call against a shortlist of
recent stories, and the threshold became the fallback for when it is
unavailable.

**Bodies moved ahead of the decision.** The pipeline used to dedup first and
fetch article text only for survivors, which is cheaper and wrong: the decider
reads the article, so the article has to exist before it can decide.

**A single measurement run cannot settle a comparison.** Repeat passes of the
same model on the same prompt disagree enough that one run is not evidence —
which is why [`bench/run.js`](bench/README.md) takes `--repeat` and the
scoreboard records every pass rather than the best one.

**The labelled corpus turned out to be mostly ratification.**
[`corpus/graded-2026-09.json`](corpus/README.md) holds 103 labelled articles,
but of the 45 in its tune split, 43 are a blanket "as graded" on a reviewer
model's label rather than a verdict written from scratch; the holdout is 44 of
44. A label the reviewer got wrong survives into the answer key, and other
models are then scored on reproducing it. Finding that is what started the
regrading described above — and why the new tool hides the machine's answer
until after a human one exists.

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
