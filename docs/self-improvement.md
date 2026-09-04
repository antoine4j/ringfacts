# How RingFacts improves itself

RingFacts audits itself every 6 hours: a scheduled Claude run reads the logs,
queries the database, judges the last window's behaviour, and is allowed to
change the code. This file is the standing instruction set for those runs —
the *how we decide*, as opposed to `TODO.md` (what to build next) and
`docs/checkin-log.md` (what each run actually found and did).

It is versioned in the repo on purpose. Working principles that live only in an
agent's private memory are invisible to Anton and evaporate if that memory is
reset; here they are reviewable, correctable in a pull request, and part of the
project's history. **Read this file at the start of every autonomous run.**
What the project is *for* is in [docs/goals.md](goals.md); what a session may
change is §8 below.

---

## 1. Instrument first, build on recurrence

When something unexpected happens for the first time, do **not** redesign around
it. Ship the cheap version:

1. a safe fallback so nothing breaks,
2. a warning log so every future occurrence leaves a trace,
3. a line in `TODO.md` naming exactly what would trigger the real fix.

Promote it into the design — new enum value, new branch, new routing, new doc
section — only once the log shows it recurring.

**The case that named this principle (2026-08-08).** The claim matcher was given
seven claim types to choose from. Asked to file *"Ali Abdelaziz predicts Usman
Nurmagomedov will finish Ilia Topuria"*, Haiku ignored the list and answered
`prediction` — a better word than any on offer, but not one we'd taught it. The
tempting move was to add an eighth type. The move we made was to coerce it to
`other`, log the coercion, and write down that a recurrence earns it a real box.
Sample size of one does not justify a routing decision plus a doc republish.

**Why this is the right default here.** Design changes carry costs the first
occurrence can't pay for, and one-off model weirdness is common. This project
already has two precedents where measurement, not intuition, picked the number:

- the 0.80 semantic-dup threshold — a translated pair measured 0.841, unrelated
  same-fighter pairs topped out at 0.702, so 0.80 splits the observed gap;
- the RSS retry delay — shipped at 30s, observed failing against a real Google
  throttle wave, then raised to 75s.

Neither was guessed. Both were read off the data.

**The failure mode to guard against:** instrumenting and never looking. A
warning nobody greps for is worse than no warning — it feels like diligence
while evidence piles up unread. Every check-in run must actively search the
logs for its predecessors' warnings, not wait to stumble across them.

## 2. Decide, act, report — don't stall

Anton's standing instruction for autonomous work. When a judgment call is
ambiguous, choose the best option from the project's documented context and
intent, **act**, and report the decision so it can be corrected afterwards. Git
makes code and doc changes reversible; a run that ends in a list of questions
has produced nothing.

Ask first only for: destroying schema or data, adding paid services or vendors,
contradicting an explicitly documented decision, or changing what the Telegram
group experiences in a way that wasn't already designed.

## 3. Every run leaves a trace

Append an entry to `docs/checkin-log.md` and commit — **every run, including
runs that changed nothing**. The log is how a future run reconstructs what its
predecessors saw without re-deriving it, and how Anton audits a system that
edits itself while he's asleep. A no-change entry is a valid commit.

## 4. Verify before claiming

Code changes get a `DRY_RUN=1` local run before deploying, and behaviour claims
in the report get evidence behind them.

**Since 2026-08-09 this is enforced, not merely asked for.** A `pre-commit` hook
runs `npm test` — the offline tiers, no credentials, under a second — so a run
that breaks something cannot commit it while Anton is asleep. Never bypass it
with `--no-verify`: a red suite is a finding to report in the check-in log, not
an obstacle to route around. If a test is genuinely wrong now, change it
deliberately and say why in the commit message.

**The tests do not replace the dry run, and the reason is worth remembering.**
They stub the network on purpose, which means they cannot see the wiring between
the real pieces. The seam refactor that introduced them shipped with a
dependency whose key was misspelled; every non-English headline silently posted
untranslated, all 27 pipeline tests passed, and a `DRY_RUN=1` run against live
feeds found it in one line of output. Stubs verify logic. Only a real run
verifies that the parts are plugged into each other. Two examples of why: the "Donchenko and
Amosov fetched 0 items" pattern looked like a broken feed and turned out to be
genuine quiet (verified by fetching all six alias feeds directly); and the
verdict-validation change nearly shipped with a bug where Postgres returns claim
ids as strings (`"7"`) while the model answers with numbers (`7`) — which would
have silently downgraded *every* real match. A live call caught it. Neither
would have been caught by reasoning alone.

**Measure it, don't estimate it (2026-08-13).** When a claim about this codebase
has a number behind it — how well covered something is, how big it is, how often
a thing happens — run the command that produces the number and report the
number. An impression formed by reading the code is not evidence, and it is
wrong often enough to matter:

- "the pipeline tests look thorough" — `node --test --experimental-test-coverage`
  put `hunter.js` at 79% of functions, with the entire Google News discovery
  layer at zero.
- "the comments are a bit verbose" — 35% of the file, thirteen blocks of eight
  lines or more.
- "these new tests cover that branch" — only a mutation check proves it. Break
  the branch, confirm the test fails, restore. A test that passes against broken
  code reports safety that is not there.

The cost is one command. The alternative is a confident sentence that turns out
to be false, which is worse than saying nothing.

**Scale verification to what the change can't see, not just to habit
(2026-08-10).** As the pipeline grows, "ran the offline tests" and "the code
looks right" stop being enough evidence on their own — use judgment about
which real-world check a given change actually needs:

- Touches a query, `schema.sql`, or anything in `lib/db.js` → run
  `npm run test:sql` (tier 3, real pgvector arithmetic and constraints
  against a Neon branch, never main). Tiers 1–2 fake the database and cannot
  catch a query that's wrong against the real one.
- Touches wiring between modules, a prompt, or anything network-facing →
  `DRY_RUN=1` against live feeds, per the misspelled-dependency and
  string/int-id cases above.
- A pure in-module logic change with no schema or cross-module surface
  (e.g. a threshold constant, a pure function) can reasonably rely on tiers
  1–2 alone.

The point is not "always run everything" — it's not skipping the one check
that would have actually caught the bug because the offline suite was green.

**Claims in the docs need sources too, and the matcher's verdict is not one
of the columns (2026-08-10).** The public walkthrough cited an article as a
NO_CLAIM example. It was a real article and a real archive row, so a database
check "passed" — but that row was ingested 2026-08-07 and the matcher did not
exist until 2026-08-08. The article had never received any verdict at all; it
posted because at that point everything posted.

The trap is that `items` records the *consequences* of a verdict, never the
verdict itself. `posted = true` with a null `held_reason` is the shared shape
of NO_CLAIM, UNSURE, a NEW whose type is ignored, and any row predating the
claims layer entirely. Reading a verdict back off that shape is a guess
wearing the costume of a query. **Cloud Logging is the only record of what the
matcher actually said** (`matcher NO_CLAIM: <title>`, 30-day retention,
scheduled runs only) — so a doc that names a verdict must cite a log line, and
a doc that names an article from before a feature shipped must check that
feature's commit date. `held_reason = 'wrong_subject'` is the one verdict the
database does record directly.

Generalised: when writing a factual claim into a tracked document, check it
against the artifact that *records* the fact, not one that merely correlates
with it — and prefer naming the real item over describing it, because a named
item can be re-verified by a reader and a paraphrase cannot.

## 5. Silence is a success state

A quiet group is not a broken bot. The point of this system is that the Telegram
group receives *substantial* updates only — Anton's standing preference, restated
2026-08-09: a day or two of silence is fine when there genuinely isn't news. Every
gate here exists to remove noise, so gates doing their job looks exactly like a
bot with nothing to say.

**Never loosen a threshold because output volume feels low.** The 0.80 dedup
cutoff, the digest tier rule in `lib/tier.js`, and the `ignoredTypes` routing were
each measured against real archived data (§1). "The group has been quiet" is not
evidence any of them is wrong — it is the expected reading when the news is quiet
or repetitive. Only a *specific item that should have posted and didn't* is
evidence, and that earns an investigation of why that item was dropped, not a
blanket adjustment.

**The one exception, and where to check it.** Outlet feeds are name-filtered
before storage, so a dead `matchNames` stem drops real coverage leaving no row
behind — indistinguishable from quiet news by any query. The hunter logs
`direct feed <outlet>: N items, M matched, K discarded` every run for exactly
this. An outlet reporting `0 matched` across many consecutive runs is a real
signal worth chasing; low posted-counts still are not. Note the logs are the
whole record here (Cloud Logging retains 30 days) — nothing about discarded
items reaches the database.

**The case that named this principle (2026-08-09).** The 18:17 run fetched 12
items for one subject, found 2 unseen, and posted nothing: one was held at 0.84
against a Spanish-language story it duplicated, the other at 0.98 against the
first. Zero posted was the correct outcome — the same story in three dresses. A
run reading only the summary line would have seen "0 posted" for many hours
straight and been tempted to fix something that was working.

## 6. Configuration is carried by reference, never by value

A deploy that carries a *value* can corrupt it. A deploy that carries a *name*
cannot. Everything the bot needs — tokens, keys, database URL, and now chat ids
— arrives as a Secret Manager reference, and `setup.sh` refuses to finish if any
literal value is left on either surface.

This is not about secrecy. A Telegram chat id is not sensitive, which is exactly
why it spent two months as a plain env var. The risk was never disclosure; it was
**custody**. `gcloud run deploy --set-env-vars` replaces a service's entire
variable list rather than merging into it, so every deploy had to retype every
value correctly, from whatever shell was running it.

**The case that named this principle (2026-08-09 → 08-10).** A deploy from a
shell missing `TELEGRAM_CHAT_ID` wrote an empty string. Every send for the next
twenty hours returned `400 chat not found` while the archive recorded each item
as delivered — the failure was invisible to every query, because rows are written
`posted=true` before the send, a failed send only logged, and the admin
self-report went through the same broken config. The recovery deploy then wrote
the ids as `['-4812309756']`, a shell array's string form, which is also a
perfectly good string and also rejected by Telegram, so the outage survived its
own fix. Three lessons, all now enforced in code rather than remembered:

1. **By reference, not by value** — the four secrets went through all of this
   untouched, because a deploy never held their contents.
2. **Refuse, don't limp** — `lib/chat-ids.js` rejects a chat id that is not a
   bare integer at startup, instead of letting Telegram reject it one message at
   a time. Every malformed value that actually shipped is now a unit test.
3. **State the region** — a Cloud Run job name is unique only within a region.
   Six deploys followed an ambient `run/region` that had changed, silently
   *creating* a second job in us-central1; every verified fix landed there while
   the scheduler kept running the broken build in us-west1. Verification that
   does not confirm *which* thing it inspected is not verification.

## 7. Explain changes in plain English

RingFacts is a learning project. Reports and commit messages say what changed
and *why it mattered*, in language that teaches rather than just logs.

**Announce every task switch in the chat** (Anton, 2026-09-04): one explicit
line — "Task switch: X is done, now on Y" — so the transcript reads as blocks
of work, one per task, when he browses it later. In the desktop app, mark a
chapter as well.

Code follows the same rule, but the *why* has its own home. Recording it inline
was tried and it failed: `hunter.js` reached 35% comments, thirteen blocks of
eight lines or more, and Anton could no longer review his own project — which
cost a real dedup bug that sat unnoticed in a 390-line function. So the
reasoning goes to [decisions.md](decisions.md) and the code keeps a one-line
pointer to it. Nothing is thrown away; it just stops standing between the reader
and the code. See [code-style.md](code-style.md).

---

*Amending this file is itself a legitimate outcome of a check-in run: if a
principle here proves wrong in practice, change it and say so in the log.*

## 8. Boundaries — what an autonomous session may change

Agreed with Anton 2026-09-04, alongside [docs/goals.md](goals.md). This is the
latitude, stated so a session does not have to guess it. The ask-first list in
§2 still applies on top.

**Code: full latitude.** Any change, including architectural ones, is fair
game because git makes it reversible. Experiment: deploy a change to Cloud
Run, let it run for a couple of days, measure what it caught against the
goals, change it again. Conditions: it follows [docs/code-style.md](code-style.md),
the tests pass, and the report says what was deployed and why. Anton reviews
the code periodically; readability is not optional because nobody is watching.

**Database: data is never lost.** Schema changes and migrations are allowed.
Prefer additive changes (new column, new table). A destructive migration —
dropping or rewriting columns, moving data between tables — is allowed only
with a backup taken immediately before it and checked to be restorable.
Neon's free tier keeps six hours of point-in-time restore and nothing else,
so the hourly backup to GCS in TODO.md (designed 2026-08-08) is the standing
safety net and should exist before any destructive migration runs.

**API keys: production and test are separate.** The deployed job reads its
keys from Secret Manager. Tests, the bench, replays, and any local experiment
use the test keys in `bench/.env.bench`, so Anton can read the production
cost apart from the development cost in each provider's console. Never point
a local run at the production keys.

**Telegram: the real group is off limits from a session.** Posting there is
what the deployed job does; a session verifies with `DRY_RUN=1` or the bench
group (`BENCH_CHAT_ID`). Anything that changes *what kind of thing* the group
sees — a new post format, a new voice, a new cadence — is shown to Anton
before it deploys (goals.md, constraints).

**External tools.** A web search tool may be used once Anton has provided the
key or enabled it and set a budget. Any other new vendor or paid service is
ask-first (§2).

**Documents a session keeps current.** Two records with different jobs, kept
apart on purpose:

- [docs/architecture-overview.html](architecture-overview.html) — the
  technical specification of the system *as it is now*. Current state only,
  no history. When the code changes shape, this changes with it.
- [docs/decisions.md](decisions.md) — the logical history: why the code is
  the way it is, what was measured, what was rejected. This is not the git
  log; a commit says what changed, a decision entry says what was chosen
  between and why.

Plus [TODO.md](../TODO.md) for what comes next, and
[docs/checkin-log.md](checkin-log.md) for what each run found and did.

**Spend caps are Anton's.** Both $5/month caps stay where they are; a session
never raises one.

## 9. Stay in the project folder; build every step testable

Two more boundaries from Anton, 2026-09-04.

**Filesystem: this repository only.** A session reads and writes inside
`/Users/anton/Projects/fighter-bot` (plus its own scratchpad and the Claude
memory directory). It does not browse or change anything else on the
machine. If a task seems to need a file from elsewhere — a screenshot, a
download — ask; do not go looking.

**Every step is testable in isolation, and there is a harness to prove it.**
The pipeline is wired the way Java's Spring wires beans, minus the XML: one
composition root builds a dependencies object, every external call (database,
embedder, translator, matcher, fetcher, Telegram, search) goes through it,
and nothing constructs its own client at import time. The rules:

1. **A step is a function of its inputs and its dependencies.** No module
   reaches for the network, the database, or an API key on its own; it is
   handed a client. `hunter.js`'s `buildDeps` is the pattern; the test
   `the deps seam is wired to itself` guards it. New modules follow it, and
   modules that still build a client at load time get converted when touched.
2. **Every step can be run alone against a battery of articles.** The bench
   (`bench/`, credentials present, runner not yet built) is the harness:
   from any fresh session Anton can ask for a run of N articles — from
   `corpus/`, from the archive, or pasted — through one named step (the
   matcher, the tier rule, the extractor, the dedup gate, the search
   verifier) with real or fake dependencies, and get a table back. It uses
   the test keys (§8) and the bench database, never production.
3. **Reading the wiring is enough to see what is plugged in.** The
   composition root is one readable literal; no hidden globals, no
   environment lookups scattered through modules. If a reader cannot tell
   from `buildDeps` what a run talks to, the seam has drifted.

## 10. Delegate bulk reading to a cheaper subagent

Anton, 2026-09-04. Work that is mostly reading and little judgment — grading
a hundred article bodies into buckets, tabulating a replay, summarising logs
— goes to a subagent on a cheaper model that returns a table, so the main
session's context stays about decisions and the cost stays proportionate.
Only when it makes sense: the judgment calls (a threshold, a design, a
borderline article) stay in the main session, and a subagent's output is
data to verify, not a verdict to trust. The first grading pass
(docs/grading/2026-09-04-posted-30d.md) was done in the main context; it is
the case this rule is for.
