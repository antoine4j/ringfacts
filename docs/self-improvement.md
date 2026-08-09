# How FighterBot improves itself

FighterBot audits itself every 6 hours: a scheduled Claude run reads the logs,
queries the database, judges the last window's behaviour, and is allowed to
change the code. This file is the standing instruction set for those runs —
the *how we decide*, as opposed to `TODO.md` (what to build next) and
`docs/checkin-log.md` (what each run actually found and did).

It is versioned in the repo on purpose. Working principles that live only in an
agent's private memory are invisible to Anton and evaporate if that memory is
reset; here they are reviewable, correctable in a pull request, and part of the
project's history. **Read this file at the start of every autonomous run.**

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
Nurmagomedov will finish Fighter C"*, Haiku ignored the list and answered
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
verifies that the parts are plugged into each other. Two examples of why: the "Fighter A and
Fighter B fetched 0 items" pattern looked like a broken feed and turned out to be
genuine quiet (verified by fetching all six alias feeds directly); and the
verdict-validation change nearly shipped with a bug where Postgres returns claim
ids as strings (`"7"`) while the model answers with numbers (`7`) — which would
have silently downgraded *every* real match. A live call caught it. Neither
would have been caught by reasoning alone.

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

## 6. Explain changes in plain English

FighterBot is a learning project. Reports and commit messages say what changed
and *why it mattered*, in language that teaches rather than just logs. Code
comments in this repo follow the same rule — they explain the reasoning behind a
decision, not the syntax on the line below.

---

*Amending this file is itself a legitimate outcome of a check-in run: if a
principle here proves wrong in practice, change it and say so in the log.*
