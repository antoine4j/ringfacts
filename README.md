# RingFacts

> **Status, 6 October 2026.** Two bots run side by side. Production has
> posted hourly since August, from the files at the top of this repository.
> Its successor, [v0](v0/README.md), runs beside it with its own database and
> its own test chat, and is the design going forward. Production retires once
> v0 fetches its own articles. This page describes both; the two published
> walkthroughs describe production.

I follow a few athletes, and keeping up meant opening an app built to keep me
scrolling. I didn't want to go where the news is — I wanted the news to come to
me. Only the parts that matter, gathered from all the coverage, in the chat I
already have with my friends.

That is what this is. It watches a small list of people (three MMA fighters,
the [watchlist](watchlist.js)), works out which articles are actually *about*
them and what new fact each one reports, groups the articles that report the
same thing, and posts the result to a Telegram group: the important news at
once, the rest in a digest, and nothing for the near-duplicates, the
wrong-subject stories and the passing mentions.

This is a learning project as much as a working bot, made by directing Claude
Code and using it as a design partner. The commit history,
[docs/decisions.md](docs/decisions.md) and [TODO.md](TODO.md) are kept
deliberately verbose about *why* each decision was made, including the ones
that were measured and then rejected. Where this file and the code disagree,
the code is right.

## What it does

The group should hear about every real career event for the watched fighters
(a result, a next fight, a health problem), hear nothing else, hear each one
once, and see "confirmed" only when an official source said it. Those four
goals, G1 to G4, are in [docs/goals.md](docs/goals.md) with how each is
measured. Silence when there is no news is correct; none of the goals is met
by posting more.

The unit is a **claim**: one occasion, one piece of news, with every article
that reports it. Nine outlets writing up the same press conference are nine
articles and one claim. A fight recap and the booking it settles are two claims
that share every name in them. Similarity alone cannot tell those apart, which
is why a model is asked.

## How it works

### v0, the design going forward

v0 is a pipeline of numbered stations, one function each, drawn first on a
whiteboard ([docs/design/system.excalidraw](docs/design/system.excalidraw)).
Every decision behind it is in the
[v0 design](docs/superpowers/specs/2026-10-04-v0-design.md).

| # | Station | What it does | Model |
|---|---|---|---|
| 1–3 | RSS reader, URL dedup, body extractor | Find each fighter's articles, drop links already seen, fetch the article text | production's, reused for now |
| 4 | Classifier | Answers nine questions about the article: how central the fighter is, whose words these are, what new fact it reports, how firm that fact is, and five more | JEV `jev-1.13.0`, a hosted model for fixed-choice questions |
| 5 | Claim extractor | Writes the article's news as one sentence with its details | Qwen3.8 Flash, on OpenRouter |
| 6 | Semantic dedup | Joins the article to an existing claim or starts a new one: embeds it, shortlists the fighter's recent claims, asks JEV to pick | `gemini-embedding-001`, then JEV |
| 7 | Decider | Looks the nine answers up in the settings: tier 1 posts now, tier 2 waits for the digest, tier 3 is dropped | none |
| 8 | Digest writer | One digest per fighter, weekly to start, from the period's claims | DeepSeek V4 Pro, on OpenRouter |
| 9 | Telegram and storyboard | Posts tier 1 and the digests; a private web app shows every reading and takes review marks | none |

It runs as its own Cloud Run job, hourly at :47, with its own Postgres
database (Neon, with pgvector) and its own test chat. Each reading moves
through the stations one stage at a time and keeps every answer; the database
refuses to overwrite or delete one. A reading that fails stays where it is
and is tried again next hour.

v0 still takes its articles from production's table. Fetching feeds and
bodies itself is the next large piece of work, and production retires after
it (TODO.md, item 5).

### Production, running today

The bot the group reads. Every hour, per fighter, it:

1. **Fetches** Google News RSS once per name alias (English, plus Ukrainian or
   Google's Spanish edition) and six direct publisher feeds, 24 hours back.
2. **Drops** links already seen: the feed's link at once, and the real address
   behind a Google link after it is decoded in the next step.
3. **Reads the article** through a zero-dependency extraction ladder (feed
   content, JSON-LD, article tag, paragraphs, og:description), recording
   which rung produced the text. Failure leaves the item headline-only.
4. **Embeds** the headline and the first 1,500 characters of the body
   (`gemini-embedding-001`).
5. **Asks a decider** (Claude Haiku 4.5, one forced tool call) which of the
   fighter's three closest stories of the last 7 days this article is:
   `join`, `new`, `reaction` or `wrong_subject`, plus how prominent the
   fighter is in it.
6. **Falls back to a similarity threshold** (cosine 0.85) only when the
   decider errors or is unsure, so an outage holds articles rather than
   posting repeats.
7. **Posts** what is new, threading follow-ups under the story they answer.
   Articles that only mention the fighter in passing are kept in the archive
   and not posted.

The one fatal condition is a database that is configured but unreachable:
posting without memory would re-send everything every hour. Two published
pages walk through it with real articles:
**[The Funnel](https://antoine4j.github.io/ringfacts/funnel-walkthrough.html)**
([source](docs/funnel-walkthrough.html)) and the
**[Architecture Overview](https://antoine4j.github.io/ringfacts/architecture-overview.html)**
([source](docs/architecture-overview.html)).

### Two kinds of configuration

The pipeline knows nothing about MMA. Two things do, kept apart on purpose.
**The domain** ([`domain/`](domain/README.md)) is *what kind of thing* is
tracked: which outlets to read, whose word counts as official, the claim
vocabulary. [`domain/example-music.js`](domain/example-music.js) is a second
one, written to prove the seam is real and labelled as never run.
**The watchlist** ([`watchlist.js`](watchlist.js)) is *who* is tracked, with
search aliases per language and the namesakes to watch out for;
[`watchlist.example.js`](watchlist.example.js) documents the shape for anyone
starting their own.

## How it is measured

Every station is scored against one labelled set, the **golden set**
([docs/golden-set.md](docs/golden-set.md)): 300 articles from 31 July to
17 September 2026, grouped into 128 claims, with Anton's rulings. It is split
once, before any scoring, into a training set (155 articles), a validation
set (40) and a test set (105). Prompts are tuned on the first two; the test
set is scored once per version, so its score is not flattered by tuning.

The numbers so far, each with its date and how it was measured:

| What | Result | When and how |
|---|---|---|
| Classifier v7.7, all nine answers right | **40 of 105 test articles (38%**, 95% interval 29–48%); 96 of 155 training (62%), 20 of 40 validation (50%) | 2026-10-05, test set scored once; [research/experiments/2026-10-03-classifier-v7](research/experiments/2026-10-03-classifier-v7/README.md) |
| Classifier v7.7, the goals' pass marks on the test set | G1: 7 of 9 career-event stories caught (**fails**); G4: 0 rumours called official (**passes**); G2: 5 of 90 articles with no career event called one, 5.6% against a 5% mark (**fails** by under one article) | 2026-10-05; the marks are in [docs/decisions.md](docs/decisions.md#classifier-pass-marks) |
| Semantic dedup, right claim in the shortlist of 5 | **97.6%** of 42 joins on the test set; 98.5% of 130 on training and validation | 2026-10-05, run once; [research/experiments/2026-09-20-claim-extraction](research/experiments/2026-09-20-claim-extraction/README.md) |
| Claim sentence as a grouping signal | No gain confirmed on the test set: separation 0.942 with the sentence against 0.950 with headline and lead alone (AUC), a gap smaller than the error | same run |
| Articles v0 cannot read for lack of text | 72% of Amosov's, 42% of Donchenko's | 2026-10-05, over the archive; [research/experiments/2026-10-05-body-fetch-spike](research/experiments/2026-10-05-body-fetch-spike/README.md) |
| v0 live | 36 articles read since going live, none tier 1 yet | 2026-10-06, [check-in log](docs/checkin-log.md) |

The failing pass marks are reported as they are: the classifier was fitted
to the training set, and 9 career-event stories make a small test. A precision
scoreboard, planned next (TODO.md, item 2), will put live rates from Anton's
reactions beside these; what [docs/lessons.md](docs/lessons.md) records is
what the experiments taught.

## How to run it

**Tests**, offline and without credentials:

```bash
npm test                            # production: 548 tests, about a second
npm install --prefix v0 && npm test --prefix v0   # v0: 51 + 58 tests
git config core.hooksPath .githooks # once per clone: run both before each commit
```

A third tier, `npm run test:sql`, checks production's real queries against a
Neon *branch* (`TEST_DATABASE_URL`), never the main database: pgvector's
arithmetic and the schema, which a fake cannot check. The
[test-suite design](docs/superpowers/specs/2026-08-09-test-suite-design.md)
says why the tiers are split by what they need.

The hook also runs `scripts/article-text-guard.js`, which refuses a commit
that would copy other outlets' article text into this repository
([why](docs/decisions.md#article-text-out-of-git)). The models are
deliberately not asserted in tests: they return different answers for the
same input, so they are measured in experiments, as above.

**Production** needs Node 22+, a GCP project, a Neon Postgres database and a
Telegram bot token:

```bash
npm ci
cp .env.example .env                    # then fill in your chat ids
cp watchlist.example.js watchlist.js    # replaces the shipped watchlist with yours
npm run dev
```

Deployment lives in [setup.sh](setup.sh), a rerunnable record of every call
that provisions the stack (Cloud Run service and job, Secret Manager, Cloud
Scheduler, IAM, the Telegram webhook). Any unset variable aborts it rather
than half-deploying:

```bash
PROJECT_ID=... NEON_PROJECT_ID=... ./setup.sh
```

**v0** has its own setup, run and measurement commands in
[v0/README.md](v0/README.md), and its own deploy script, `v0/setup-v0.sh`,
separate on purpose: running `setup.sh` redeploys production.

**The experiments and the bench** are in [research/](research/README.md).

**What is public, and what is not.** The articles themselves are other
outlets' copyrighted text, so they stay on the maintainer's machine and are
never committed: `golden/articles.json`, the corpus files, and the batches of
article text sent to models. Everything measured from them is here: the
labels and rulings, each model's answers per article, the extracts, the
scores, and the scripts and prompts that produced them. Each article is
listed with its headline, outlet and URL (`golden/articles-meta.json`), so
the set can be rebuilt from its sources. The models' raw per-call answers
are kept out too, for their bulk rather than their content; the results
built from them are here. A commit hook (`scripts/article-text-guard.js`)
refuses any commit that copies article text.

**Further reading.** [docs/self-improvement.md](docs/self-improvement.md),
how scheduled check-in sessions are allowed to decide things;
[docs/sandboxed-autonomy.md](docs/sandboxed-autonomy.md), the parked design
for letting them run fully unattended with credentials scoped so that even a
prompt-injected run is harmless; [lib/tier.js](lib/tier.js), thresholds
measured on archived data with the rejected alternatives written down;
[docs/blog-backlog.md](docs/blog-backlog.md), problems from this project
that apply to building with AI generally.

Renamed from *FighterBot* on 2026-08-10; the deployed GCP resource names
(`fighterbot`, `fighterbot-hunter`) still carry the old name (see
[setup.sh](setup.sh)). Deploys are manual, so `main` can be ahead of what
runs.

## Scope, and what this isn't

This tracks **public figures** through **published news**: RSS feeds and article
pages that anyone can read. There is nothing here that accesses private data,
and it would be a poor tool for surveilling a private individual — it works by
reading what the press has already printed about someone.

## On secrets

No credentials live in this repository, and none ever have. The bot token, API
keys and database connection string are in GCP Secret Manager and fetched at
the moment they're needed:

```bash
DATABASE_URL=$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .DATABASE_URL) node hunter.js
```

Values are piped straight into the command and never written to disk or
echoed. Each bot keeps all of its values in one secret (`ringfacts-config`,
`v0-config`), because Secret Manager's free tier holds six secret versions
([why](docs/decisions.md#one-config-secret)). Deploys pass every value by
reference, never as a literal: on 2026-08-09/10 two deploys that carried
values corrupted them and cost twenty hours of silent non-delivery.

## License

MIT — see [LICENSE](LICENSE).
