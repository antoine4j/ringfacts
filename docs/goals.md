# RingFacts — Goals and success criteria

Agreed with Anton 2026-09-04. This is what the project is *for*, stated so
that it can be measured. Every piece of work — autonomous or not — names which
goal it moves and reports the metric before and after. `TODO.md` ranks work
under these goals; `docs/self-improvement.md` says how autonomous runs decide.

**In one line:** the group hears about every real career event for the watched
fighters, hears nothing else, hears each one once, and "confirmed" always means
an official source said it.

Silence when there is no news is correct (self-improvement §5). None of the
targets below is ever met by posting more.

---

## G1. Nothing real is missed

A **career event** is one of: a fight booked, a fight result, a withdrawal or
injury, an official return date, a retirement, a promotion or contract move.

**Success:** every career event for a watched fighter posts within **6 hours**
of the first report by a trusted outlet. Target is **100%**. A miss is a bug
to investigate, never a statistic to accept.

**Measured** monthly by a recall probe: list the real events for the window
from the web (by hand until a search tool exists), check each against the
archive — did it arrive, did it post, how late. Recorded in
`docs/article-feedback.md`.

## G2. Nothing junk gets through

**Success:** at least **90%** of posted main-tier items are graded useful by
Anton, and **zero** posts that are spam, a namesake, or a stale event
re-published as fresh.

**Measured** monthly: Claude pre-grades every posted item — reads the body,
assigns a bucket, writes a one-line reason with the link — and puts the list
in front of Anton, who confirms or overrules (about 15 minutes; Anton,
2026-09-04: "you can label them yourself, I will just confirm"). His verdicts
go into `docs/article-feedback.md` verbatim.

### What "useful" means — the three buckets

Every article about a watched fighter lands in exactly one bucket.

1. **Career event** — the G1 list. Always posts, loud (🚨 ceremony).
2. **Substance about the fighter** — no event, but new information or opinion
   *about him specifically*. Posts as a digest main item. Examples: a career
   analysis (the Tribuna UA piece, item #191, Anton's 👍 of 2026-08-14); an
   interview where he talks about his own situation; a rival's coach breaking
   down his game; a camp or recovery update; grounded speculation about his
   next opponent.
3. **Not for the group** — he is in it, but the group learns nothing about
   him. Folds into the mentions line or drops. Examples from the archive: his
   favourite restaurant (corpus a25); a footballer photographed with him
   (a48); his loss retold as backdrop in someone else's preview (#116); his
   physio speaking at a conference (#115); a celebrity listicle naming him
   (#23).

**The test between 2 and 3 is whether the new information is about him.**
Two rulings from Anton (2026-09-04) that fix the line:

- He gives an interview but talks mostly about someone else (Topuria on
  Volkanovski's chances) → **bucket 3**. Spoken *by* him is not *about* him.
- A famous fighter or pundit names him in one sentence as a future threat →
  **bucket 3**. Mentioned *near* him is not *about* him.

The 2-versus-3 boundary is tuned from Anton's graded verdicts, not from
Claude's judgment. Each borderline verdict becomes a worked example here.

## G3. Nothing repeats

**Success:** **zero** posts about a story the group has already been shown —
same story, different outlet or language included.

**Measured** in the G2 grading pass (a "repeat" flag), plus an automated dedup
audit Claude can run without Anton (`scripts/replay-dedup.js`).

## G4. Confirmed means official

A fight is labeled **confirmed** only when an official source says so: the
promotion (ufc.com and its feeds) or the fighter's own account. Ten outlets
repeating the same rumor is still a rumor; corroboration can raise a rumor's
standing but never to confirmed.

**Success:** **zero** posts where the confirmed label came from anything but
an official source. **Secondary:** a posted rumor is resolved — confirmed or
denied — within **48 hours** of an official answer existing.

**Measured** automatically: claims older than 48 hours still at `reported`
while an official source has spoken; any `confirmed` claim whose evidence has
no `official` role.

---

## Constraints (not goals)

- Both spend caps stay at **$5/month** (GCP budget alert, Anthropic hard cap).
  Free tiers everywhere else.
- Silence is never a signal to loosen a threshold (self-improvement §5).
- Nothing that changes *what kind of thing* the group sees — a new post
  format, a new voice, a new cadence — ships without Anton seeing it first.

## How autonomy uses this

Anton is not watching in real time. The boundaries — what a session may
change in code, database, keys, Telegram, docs — are self-improvement.md §8.
The contract:

- Work that moves a goal metric proceeds under decide-act-report
  (self-improvement §2). The report names the goal, the metric before, and the
  metric after (measured, not estimated).
- The ask-first list is unchanged: destroying schema or data, adding paid
  services or vendors, contradicting a documented decision, anything touching
  the group's trust, and the constraint above on what the group sees.
- Anton's recurring time commitment is the monthly G2 grading pass. Everything
  else Claude measures alone.
