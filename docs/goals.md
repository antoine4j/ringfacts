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

**Both directions, every time** (Anton, 2026-09-04). Every pipeline decision
is stored with its reason (`held_reason`, `digest_tier`, `subject_role`), so
the pass grades what was **held** as well as what posted: a sample of the
wrong-subject, tangential, untrusted-source and duplicate holds from the same
window, each asked "should this have posted?". A real story wrongly held is a
G1 failure and is found only by looking at the holds. The pipeline stays
traceable for this reason: nothing is dropped without a row and a reason.

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

**Worked examples from the first grading pass** (2026-09-04, items in
`docs/grading/2026-09-04-posted-30d.md`):

| item | what it was | bucket | the line it draws |
|---|---|---|---|
| #21 | Usman's camp asks for Topuria as a first fight | 2 | A callout — *I want to fight him* — is about him (Anton, evening ruling). |
| #50 | Prates warns him off a welterweight move | 3 | Advice or a callout aimed at him is not information about him. |
| #256 | Tsarukyan names his next opponent | 3 | A rival saying *he should fight someone else* is not about him. The champion or the champion's coach saying it would be 2, within limits. |
| #43 | His manager fires back at the manager who called him out | 2 | A reaction to a callout at him is about him, like the callout itself (Anton, 2026-09-05, reversing the 09-04 ruling of 3). |
| #318, #340 | His trainers on vision drills and muscle | 3 | Training trivia; compare #547. |
| #194, #226 | Makhachev on his loss and the face-off | 2 | The champion assessing him is substance about him. |
| #279 | Mendez: he needs several wins before Makhachev | 2 | A top coach on his path. |
| #523 | A doctor on his nose damage | 2 | Injury analysis, like #341. |
| #291, #320 | His childhood; joining territorial defence in 2022 | 2 | His own substantial account of his life. (#380, one lesson from his divorce, stayed 3 — depth matters.) |
| #547 | His boxing coach on what sets him apart | 2 | Breaking down his game. |

Reading of the line (confirmed by Anton the same evening): **a callout at
him → 2, and his camp's reply to it → 2; others steering him elsewhere → 3,
unless it is an authority such as the champion or his coach → 2 within
limits; others assessing him → 2; him on himself → 2 when substantial.**

**Possible fourth bucket, "lifestyle"** (Anton, 2026-09-04, on #366 —
Donchenko's fishing and breakdance hobbies): personal-life updates that are
not junk but do not belong in the main digest. Not a rule yet; the next pass
should count how many bucket-3 items are really this.

### The reason codes — why an article got its bucket

One code per label, stored in the `feedback` table next to the bucket. The
bucket says *where* an article belongs; the reason says *what went wrong*
(or right). Added 2026-09-05 for the all-articles grading pass.

| code | meaning | goes with |
|---|---|---|
| `fine` | bucket 1 or 2 content that posted, or would have been right to post | bucket 1–2 |
| `missed` | bucket 1 or 2 content that was **held** — the group never saw it (a G1 failure) | bucket 1–2 |
| `junk` | not about him: backdrop, one name in a list, spam, a namesake, a listicle | bucket 3 |
| `dup` | the same story the group already saw — same fact, any outlet or language; `dup_of` names the earlier article | bucket 3 |
| `old` | a stale event re-reported as fresh: an old fight, a caption of a past event | bucket 3 |
| `wrong` | the facts are wrong, or a rumor was presented as official (a G4 failure) | bucket 3 |
| `loud` | a 🚨 alert for something that is not a career event | bucket 3 |
| `other` | none of the above; the note says what | bucket 3 |

**Same story** means the same *fact*, not the same topic: two outlets on one
Masvidal quote are a dup; a weigh-in, the result and the post-fight bonus are
three different facts about one fight; a new quote from the same person on a
new day is a new story; a translation is a dup.

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
