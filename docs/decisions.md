# Decisions

Why the code is the way it is: measurements taken, incidents survived,
alternatives considered and rejected.

This file exists so the code doesn't have to carry it. Under
[code-style.md](code-style.md) rule 3, a function keeps a one-line pointer and
the reasoning lives here, where it reads as history instead of blocking the
thing it explains.

**Format.** One entry per decision, newest at the bottom:

```
## <slug> — <short title>
*<date>*

<what was decided, what was measured, what was considered and rejected>
```

Code references an entry by its slug:

```js
 * History: docs/decisions.md#dup-threshold
```

The slug is the contract. Renaming one breaks every pointer to it.

> **Status:** hunter.js's inline history was extracted here on 2026-08-13.
> Other files (lib/, server.js, the root scripts) may still carry history
> inline; extract it the same way when those files get their style pass.
>
> Entries whose date reads "recorded 2026-08-13" were lifted from undated code
> comments — the decision is older than the record, and the original date was
> not written down at the time.

---

## dup-threshold — Semantic duplicates are held at 0.80 cosine
*2026-08-06*

Two headlines scoring above 0.80 cosine similarity are treated as the same
story, and the later one is held rather than posted.

Tuned on real data rather than picked: a Ukrainian↔English translated pair of
the same story measured **0.841**, while unrelated stories about the same
fighter topped out at **0.702**. 0.80 sits in that gap with room on both sides.

The same method picked `CLAIM_DRIFT_GAP` — measure the two populations, put the
line in the space between them.

**Known limitation, unresolved.** The gate compares each new item against its
single nearest stored neighbour, and `nearestRecent` filters on neither `posted`
nor `held_reason` — so a *held* article is itself a valid neighbour for the next
one. Each hop only has to clear 0.80 against its immediate predecessor, and
cosine similarity is not transitive, so a cluster can walk away from the story
it started on. Observed live as a `0.802 → 0.869 → 0.974` chain. The existing
`inheritanceDrifts` guard prevents the wrong *claim link* but not the wrong
*hold*: the article still never reaches the group.

**Resolved 2026-08-14** — see [posted-anchors](#posted-anchors--only-posted-articles-anchor-the-dup-gate):
held articles are no longer neighbours, so the chain cannot form.

## tangential-line — Demoted items share one line, with numbered repeats
*2026-08-09*

Items the tier rule demotes as tangential are still stored and still linked, but
they are not worth a headline. They fold into a single "↘ Also mentioning" line
of source links, grouped by outlet so it stays scannable.

**Why repeats are numbered.** An outlet with two demoted stories in one run gets
both links, as `Bloody Elbow (1) · Bloody Elbow (2)`. The first version showed
only the newest, which read more cleanly but made the older story permanently
unreachable: this message is the only place a demoted article is ever offered,
and Gate 1 means a later run will never offer it again. A bare repeated outlet
name reads as a bug, so the index is what earns the second link its place.

Numbering appears only when an outlet actually has more than one — a lone
`Sherdog (1)` would imply a missing sibling.

**Two smaller cases.** The outlet name falls back to the URL hostname when
`source` is empty, which `parseRssItems` returns for a missing `<source>` tag;
without the fallback that link renders zero-width and invisible. And identical
URLs collapse — the same article reached twice is one story, and must not be
numbered as though it were two.

## claim-drift-gap — Held duplicates refuse a claim they have drifted from
*2026-08-08*

A held duplicate inherits its nearest neighbour's claim link instead of paying
for an LLM call. But dup-gate inheritance is transitive: B is held against A and
takes A's claim, then C is held against B and takes it too. Every hop clears
0.80 against the *previous* headline, so the chain can walk somewhere its
starting claim never was — observed live, where a story about a subject's
manager blasting Ali Abdelaziz rode a 0.802 → 0.869 → 0.974 chain onto an
unrelated matchmaking claim.

The fence: without re-reading the article, ask the cheaper question — does this
headline sit far closer to some *other* claim than the one it is about to join?
The refusal threshold is a 0.10 similarity gap, measured 2026-08-08 over all 28
live links: links that had drifted onto a foreign claim sat 0.107–0.214 below
the item's best-fitting claim, while links that were right but merely looked
wrong (claim 4, whose garbled canonical text under-scores its own evidence) sat
0.076–0.082 below. 0.10 splits the observed gap — the same method that picked
[dup-threshold](#dup-threshold).

On drift the hold stands and the item stays **unlinked**, which is already a
recognised state (`audit-swallowed-confirmations.js` calls unlinked held items
"reconciler candidates"). A drifted link would be worse than no link:
`claim_sources` rows are what corroboration counting reads and what a
confirmation ceremony lists as evidence, so a foreign article credited there
becomes a wrong statement to the group later.

What the guard does *not* do: it prevents the wrong claim link, not the wrong
hold — the article still never reaches the group. See the known limitation
under [dup-threshold](#dup-threshold) — resolved 2026-08-14 by
[posted-anchors](#posted-anchors--only-posted-articles-anchor-the-dup-gate).

## tier-keying — The digest tier keys on "is a real claim", not on a claim id
*2026-08-09*

The digest tier asks whether an article is *about* the subject or merely sits
next to news about them. The matcher's role judgement leads — it read the
sentence and can say a name was only background colour — and the measured
mention-count rule sits underneath as the fallback for every item the matcher
said nothing useful about. Demoted items still post, as a source link on the
shared [tangential line](#tangential-line) rather than a headline.

Claim sources are exempt by construction: whatever fed a claim earns its own
line. That exemption is keyed on *isRealClaim*, not on the claim id — the id is
null under a dry run and with no database, and the tier decision must come out
identical either way.

## send-failure-walkback — posted=true is written before the send, so failures walk it back
*2026-08-09, fenced 2026-08-10*

Rows are written `posted=true` before any message is built, because the send is
the last thing that happens and the row has to exist for a claim to link to. So
a send that fails leaves the archive asserting the group saw something it never
did — and that is not a bookkeeping detail: `held_reason` is documented as "why
the group never saw this" (schema.sql), bootstrap and the swallowed-confirmations
audit both read it that way, and `audit-digest-tier.js` partitions on `posted`
when re-measuring thresholds.

Not hypothetical. A deploy on 2026-08-09 blanked `TELEGRAM_CHAT_ID`; every send
for the next 20 hours returned "chat not found" while three items sat in the
archive marked `posted=true`. Nothing in the database disagreed with them, so no
query could have found the outage.

The fence: a send that fails — by throwing *or* by returning null, which is what
a Telegram 400 actually does — marks every item it carried
`held_reason='send_failed'`, `posted=false`, queueing them for the
[resend pass](#resend-pass). One message carries every line, so one failure
loses all of them. Claims survive: a claim is a fact we learned, not a message
we sent, and its null `tg_message_id` already means "nothing to thread a
confirmation under."

The suppression branch applies the same correction from the other direction: a
run whose only postable items were tangential broadcasts nothing (a header plus
an "also mentioning" line is exactly the noise the tier rule exists to remove),
and its rows — already written `posted=true` before the run knew its own total
shape — are corrected to `held_reason='tangential'` so the archive never claims
a broadcast that did not happen.

## official-exemption — Official sources skip the dup gate, then meet it again
*2026-08-10*

The embedding dup gate is most likely to fire exactly when it must not: an
official confirmation headline is *by construction* near-identical to the rumor
it confirms, so holding it as a duplicate would swallow the rumor → confirmed
transition — the one edge the claims layer exists to catch. This happened;
`audit-swallowed-confirmations.js` was written to measure the cost. So official
items are exempted from the gate and sent to the matcher instead: the confirm
decision rests on read meaning rather than on 0.80 cosine, and the loudest
thing the bot does earns the LLM call.

The exemption is a deferral, not a waiver. It buys the item a matcher call so it
can reach MATCH (→ confirm) or NEW (→ born-confirmed claim). If the matcher
answers UNSURE or NO_CLAIM there is no claim to act on, the reason to skip the
gate is gone, and the gate is re-applied — otherwise a matcher outage (fail-open
UNSURE, or a missing API key) turns every official echo into a duplicate post.

## resend-pass — Lost sends ride the next digest, rebuilt and not re-judged
*2026-08-10*

Items an earlier run stored but could not deliver are carried by the next run
that can. Gate 1 blocks rediscovery, so without this the group would simply
never see them.

They are fetched *above* the nothing-new early return, because the most likely
hour for a retry is a quiet one — an outage does not schedule itself around the
news, and returning early on "nothing new" would strand them until the next
hour that happened to find something, which could be days. They are read even
under `DRY_RUN`, so a dry run previews what a real one would carry; nothing is
written back, because the write only happens on a real send.

They ride the digest as ordinary bullets rather than getting a message of their
own: one message reads better than two, a separate scheduled job would race the
hourly digest and duplicate the whole formatting path, and `digestLine` stamps
each item with its real age — a recovered item announces its own lateness
instead of pretending to be fresh.

Rebuilt from the row, so only what the row stores is available — no body, no
embedding, no verdict. None of that is needed to render a bullet, and the tier
decision was already made and recorded on first pass. Deliberately *not*
re-judged: re-running the matcher would spend a call re-deriving an answer we
already have, and could quietly change it.

One fidelity cost, accepted knowingly: an item that first went out as a 🕵️
Rumor line comes back as an ordinary bullet, because the row stores the
publisher's headline while the claim sentence lives on the claim. Late and
plainer beats lost. And the pass is self-limiting — resends respect the
discovery window, so an outage that outlasts the news window stops trailing the
digest instead of posting week-old headlines forever.

## deps-seam — Every dependency arrives through `deps`; the store is faked as a namespace
*2026-08 (recorded 2026-08-13)*

Everything `huntSubject` reaches outside itself arrives through a `deps`
parameter whose every default is the real implementation — production behaviour
is exactly what it was before the parameter existed, and a test can substitute
one piece at a time. The four network-touching calls (embeddings, matcher, body
fetch, URL decode) plus Telegram and the database are the whole surface.
`dryRun`/`chatId`/`matcherEnabled` are read from the environment once at module
load — right for a job process, useless for a test — so they are overridable
through the same parameter.

The database is faked at the *namespace* level: `deps.store` swaps every
database call at once (`test/fake-store.js` answers the same calls from a Map).
Faking one level lower — a client that answers SQL strings — would be a fake
that drifts from Postgres in silence, which is the opposite of what a test is
for. The real queries are checked against real Postgres separately
(`test/sql.test.js`).

The seam's one known cost: a dependency key that is merely misnamed fails open
and stays quiet. That shipped once — `translateToEnglish` written as object
shorthand while the call site read `deps.translate`; every non-English headline
silently posted untranslated with all tests green, and a `DRY_RUN=1` run against
live feeds found it. `test/pipeline.test.js` now checks the deps wiring at the
source level.

## retry-delay — One 75-second retry rides out Google's load shedding
*2026-08 (recorded 2026-08-13)*

Google News intermittently sheds load from cloud-datacenter IPs — 503s,
observed one to two runs a day. `fetchFeed` retries once after `RETRY_DELAY_MS`
(default 75 seconds; 30 proved too short for Google's waves). Worst case —
every alias failing twice — stays within the Cloud Run job timeout.

## flood-cap-order — The cap applies to unseen items, after the known-URL check
*2026-08 (recorded 2026-08-13)*

`MAX_ITEMS_PER_SUBJECT` (5) is applied to *unseen* candidates, newest first —
not to the raw fetch. Capping before the known-URL check would let newer
already-known items permanently shadow older unseen ones; capping after means a
busy-day backlog drains at five per run across successive sweeps. For the same
reason `fetchFreshItems` applies no cap at all: the cap belongs on the far side
of Gate 1, in `huntSubject`.

## telegram-html-escaping — Everything in a message is escaped, because Telegram rejects silently
*2026-08 (recorded 2026-08-13)*

A digest bullet keeps the headline as plain text (calmer to read); the short
source name carries the link; a translated headline is labeled, never presented
as the original.

The href escaping is the load-bearing part. Both feed parsers decode HTML
entities into the URL, so a WordPress feed's `?utm_source=rss&utm_medium=rss`
arrives carrying a bare `&`. Telegram's HTML mode rejects that — and it fails
the *whole message* silently, even though every item in it is already stored
`posted=true`. One bad character in one link loses every item in the digest,
which is why `test/message.test.js` exists and why the
[send-failure walkback](#send-failure-walkback) treats a null send result as a
failure.

## translation-rules — Translate at posting time, label it, never guess
*2026-08 (recorded 2026-08-13)*

`GROUP_LANGUAGES` (en, uk) are what the group reads as-is; digest headlines in
any other edition are translated to English at posting time and labeled
"(translated from …)". The database keeps originals — translation is
presentation only. Tangential items are excluded: the shared line shows only
source names, so translating their headlines would be a wasted Gemini call.
Fail-open: a failed translation posts the original headline.

A resent row whose `edition` is null predates the edition column. Its language
is genuinely unknown, so it posts as filed — guessing would be worse than
plain, because a mislabelled "(translated from …)" claims a provenance that
is not true.

## outlet-match-counters — The one silently-failing filter gets a counter
*2026-08 (recorded 2026-08-13)*

Outlet feeds are name-filtered *before* anything is stored, so an item no
subject matches leaves no trace at all — unlike a Google News miss, which
reaches the matcher and is stored as WRONG_SUBJECT. A `matchNames` stem that
stopped working (an inflected surname the stem no longer covers) would
therefore look exactly like quiet news, which `docs/self-improvement.md` §5
tells runs *not* to act on. The per-outlet "N items, M matched, K discarded"
log line is the evidence that separates the two: a sustained "0 matched" is a
rotted stem, not a quiet day.

## posted-anchors — Only posted articles anchor the dup gate
*2026-08-14*

`nearestRecent` now requires `posted` on anchor rows; held articles stay
recorded but are nobody's neighbour. This closes the chain defect recorded
under [dup-threshold](#dup-threshold): with held items as anchors, B was held
for resembling A, C for resembling B, and clusters drifted onto genuinely
different news.

Decided by replaying the archive, not by taste (`scripts/replay-dedup.js`,
read-only; full output in a run's `tmp/replay-dedup.json`). Measured over 187
embedded items / 8 days:

- The replay of the *old* rule reproduced every recorded gate decision, so the
  instrument is trusted. (Four explainable exceptions: two early rows whose
  neighbours had no embeddings yet at decision time, and two Donchenko rows
  held at 0.798 — *below* the 0.80 threshold, most plausibly a tuning-era
  plain-env override on the job; the code has compared `>= 0.80` since
  2026-08-06.)
- **61 chains** of length ≥ 3 existed in the recorded nearest-pointers; the
  longest ran 9 hops.
- Under posted-only anchors, **13 holds flip to posts** (~1.6/day): mostly
  genuinely different stories the chain had wrongly blocked, plus the cost
  side — two same-story paraphrases sitting just under the threshold and one
  junk item now relying on the matcher's wrong-subject net. Anton accepted
  that trade explicitly.
- **The window stays 7 days, measured**: every held echo with a posted
  lookalike arrived within 6.0 days of it, and the 7/14/21/28-day variants
  produced identical results. The chain was the only thing extending memory.

Revertibility: `DUP_ANCHORS_ALL=1` restores held-as-anchor without a deploy;
`DUP_ANCHOR_WINDOW_DAYS` overrides the window. Both read at query time.

## dry-run-confirmation-preview — A dry run previews confirmations by reading, not flipping
*2026-08-14*

A confirmation is created when `confirmClaim` writes the rumor→confirmed flip,
and a dry run writes nothing — so for its first week the dry run silently
omitted confirmations from its preview, and the preview branch in the send
path was dead code. Since dry runs are the pre-deploy rehearsal and
confirmations are the rarest, least-rehearsed event in the system, Anton
decided the rehearsal must show them.

The mechanism keeps dry-run semantics exact: reads happen, writes never do.
`claimIfRumor` (lib/db.js) is the read half of `confirmClaim` — same row, same
rumor-only guard, no UPDATE — and the dry run uses it to build the same
preview a real run would send, while the rumor stays a rumor.

## gcs-backup — A daily copy of the evidence record, outside Neon
*2026-09-04*

Neon's free tier keeps six hours of point-in-time restore and nothing else.
Until today a mistaken migration, a bad script, or a poisoned autonomous
session had a six-hour window to be noticed before the archive — every
article, every verdict, every claim link since 2026-08-06 — was gone for good.
The boundaries Anton set for autonomous work (self-improvement §8) make a
backup the precondition for any destructive migration, so it went in first.

**Shape.** `lib/backup.js`, zero dependencies: `SELECT *` on the three tables,
gzipped JSON, one media upload to GCS through the JSON API with the job's own
service-account token from the metadata server. Restore is
`scripts/restore-backup.js` → `restoreTables` in `lib/db.js`, which inserts
rows with their original ids (`OVERRIDING SYSTEM VALUE`), skips rows that
already exist, and moves each identity sequence past the highest restored id.
Round-tripped on the Neon `test` branch: a vector and a jsonb value survive
the JSON round trip unchanged (test/sql.test.js).

**Daily, not hourly.** The 2026-08-08 design said hourly. Measured against the
free tier: 5 GB-months of storage, and the database is 8.5 MB with embeddings
that compress poorly — hourly with 30-day rotation would sit at ~2 GB and
climb with the archive; daily is ~100 MB. The gap a daily copy leaves is
covered by Neon's six-hour restore for anything recent. The backup runs on
the hourly hunt whose UTC hour matches `BACKUP_HOUR_UTC` (default 11, i.e.
04:17 Pacific), after the news is out, and never fails the run.

**The bucket by convention, not by config.** setup.sh refuses to deploy a job
carrying plain env vars (docs/self-improvement.md §6), so the bucket name is
derived: `<project-id>-backups`, project id from the metadata server. Locally
`BACKUP_BUCKET` overrides it; without either the backup is off.

**Rotation and protection are the bucket's, not the code's.** A lifecycle rule
deletes objects after 30 days; a 30-day retention policy stops anything —
including the job's own token — from deleting or overwriting one earlier.
Watch item: the hunter runs as the default compute service account, which
holds `roles/editor` on the project, so "create-only" is enforced by the
retention policy alone (unlocked; locking is irreversible and Anton's call),
not by IAM. Narrowing that account is separate work.
