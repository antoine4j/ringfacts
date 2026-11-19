# Launch bar snapshot — 2026-11-18

Goal G1 (nothing real is missed) and Launch Map task 10.7 (the launch bar on
the scores page). Run 18 November 2026 (Pacific; the database was read at
05:55 UTC on the 19th), read-only, through the `v0_editor` role.

**Question.** The launch bar says the friends' group joins when the last two
weeks show no career event missed, no repeat in tier 1, and at most 1 in 10
posts or digests with a 👎. Where does v0 stand on each, today, and does the
hand-kept career-events list the first rule leans on still describe the world?

**Why.** The list had last been checked on 29 October. A list three weeks
old makes the page read "0 of 0 events", which looks like a pass and is
only silence. And the other two rules lean on the maintainer's reactions and
links; nobody had checked whether there were any.

## Method

1. **Bring the list up to date.** The web was searched for each watched
   fighter's career events from 30 October to 18 November: the fighter's name
   with next fight, booked, return, injury, retirement and contract, in
   English, Ukrainian, Russian and Spanish, then the pages that turned up
   were read for date, source and what exactly was said. The Spanish
   searches returned mostly the same English-language stories; Spanish
   outlets (Marca, ABC, Mundo Deportivo) were seen through v0's own
   readings, which is circular for recall and was used only to date a
   report. The announced 5 December card was read in full for Donchenko
   and Topuria; no full 12 December card was found. An event went on the
   list only with two independent sources and a first-report date.
   Rumours, call-outs and wishes did not. The result is
   `v0/pipeline/measure/career-events.json` (checked 2026-11-18); the new
   entries carry no extra field, because the page's reader accepts none, so
   "not yet confirmed by the maintainer" is in each entry's `note` and in the
   file's `how`.
2. **Recall check.** `snapshot.mjs` takes each event on the list that falls
   inside the time v0 has been live (from 2026-10-05), finds its articles
   (the claims the list names, plus any article of that fighter in the days
   around the event whose headline matches `probes.json`), and reads off
   what v0 did: whether an article arrived, the claim it joined, the tier,
   whether the claim went out as a tier-1 post or in a digest, and the hours
   from the earliest stored article. The earliest stored article stands in
   for "the first trusted report": it is never earlier than it, so a lateness
   below is a lower bound.
3. **Launch bar numbers.** The script runs the storyboard's own code
   (`liveScores` in `v0/storyboard/lib`) against the database for two windows,
   the last 14 days and the last 28, in Pacific days as the page counts them,
   then recounts the 👎 share and the unreacted messages by its own SQL.
   Every connection the script opens, including the page code's pool, is set
   read-only as it connects, and the script stops if either says otherwise.

Cost: $0. No paid call, no article text read into a file; `results.json`
holds ids, times, outlet names and counts.

## Result

**The list.** One event added; the list now holds three.

| Event | Date | Sources (two of several) |
|---|---|---|
| Amosov booked against Garry, five-round co-main of UFC Saudi Arabia, 5 Dec | 7 Nov | Cageside Press; Yahoo Sports. Also Agent MMA, MMA News, Bloody Elbow |

**Ruled out by the maintainer (18 Nov).** The UFC chief's statement that
Topuria returns in early 2027 (4 Nov; Heavy, Boxing News, Lance!, Agent
MMA, Marca) was first listed as a return-date event. A window with no date
and no opponent is not an "official return date": it is digest material,
and it is off the list. v0 gave it tier 2 (claim 575) and showed it in
digest 114 on 9 November, which is where the ruling puts it.

Donchenko had no career event in the window. His last event is the 5 September
win over Soriano; the call-out of Daniel Rodriguez he made that night, aimed
at UFC 335, has not become a booking, and he is on neither the 5 December
card nor any card found for 12 December. v0 agrees: two articles of his since
30 October, both about someone else.

**Borderline, not on the list:**

- Topuria's own interview of 5 to 6 November: he is "considering" returning
  from April 2027, wants Pimblett, and says he has had no talks with the UFC.
  A fighter's target with no promotion behind it. Posted by v0 as tier 1
  (claim 580, 6 Nov 02:47 UTC). The maintainer may promote it; the earlier
  entry for the trainer's February target is the precedent.
- Topuria "maybe I'll retire" in the same interview (claim 589): a remark
  about the future, not a retirement.
- Topuria's "The Matador is coming back" posts of 3 November (claims 571,
  572): a teaser with no date or opponent.
- Amosov "signed a contract for his next fight", one Ukrainian outlet on
  6 November (claim 587, posted as tier 1): no second source found; the
  Garry booking followed within a day.
- Pimblett and Dana White on a Topuria-Pimblett fight, 14 November: a
  call-out and an opinion. Gaethje's manager on "never a rematch": a
  statement from another camp.

**Recall check.** The new event arrived and got claims. The two before 5
October are not checkable (v0 was not live; their readings are the backfill).

| Event | First stored article | Claim, tier | Went out | After |
|---|---|---|---|---|
| Amosov-Garry, booked (7 Nov) | 112.ua, 7 Nov 11:35 UTC | 604, tier 1 | Post 7 Nov 12:47 UTC, from reports ahead of the announcement | 1.2 h |
| | Heavy, 8 Nov 03:32 UTC | 614, tier 1 | Post 8 Nov 05:47 UTC, from the announcement | about 2.3 h |

Six articles of the Amosov event had no claim, all for lack of text.

**Amosov-Garry went out twice: rumour, then confirmation (maintainer's
ruling, 18 Nov: one story).** Read-only, from the stored rows:

- **Claim 604** was started by 112.ua's report (7 Nov 11:35 UTC) and posted
  at 12:47 UTC from that reading, labelled "Next fight · reported". Its
  first readings are Ukrainian outlets (112.ua, XSPORT.ua, MY.UA) hours
  before the UFC's announcement, which the outlets place on the UFC Vegas 124
  broadcast; the announcement's first stored article is 8 Nov 03:32 UTC, so
  the first post preceded it by about 15 hours. Agent MMA's own pre-report
  says the pairing was not yet official.
- **Claim 614** was started by MMA Fighting's article of the announcement
  (8 Nov 05:00 UTC) and posted at 05:47 UTC, labelled "Next fight ·
  official". The grouping step saw claim 604 on its shortlist at similarity
  0.905 and chose none-of-these (0.76 against 0.23 for 604), though its own
  question says an official announcement of a rumour is the same story.
  Official readings then landed in both claims: 604 holds 14 readings (4
  official), 614 holds 43 (21 official).
- **What each post said.** The Telegram text is not stored; it is built by
  `tierOneMessage` (`v0/pipeline/workflow/post.ts`) from the posting
  reading, so it is reconstructed, not read back: an emoji and the surname
  with the label, the extract's one sentence, and the outlet link. The
  first read "Next fight · reported", then that Amosov "is scheduled to
  fight" Garry on 5 December at UFC Fight Night 295 in Saudi Arabia. The
  second read "Next fight · official", then that he "is scheduled to fight"
  Garry in the co-main event of UFC Saudi Arabia. Only the label changes; no
  word says "now confirmed", so it reads as the same news again with a
  firmer tag and a different event name.
- **Does v0 have a "now confirmed" follow-up?** No. `postNewClaims` posts each
  claim once, from its first tier-1 reading, and never again; a firmer
  reading that joins a claim later changes only its label in the storyboard
  (design D31) and feeds the digest. The grouping prompt does join a
  confirmation to its rumour's claim, which is what v0 intends: the
  confirmation is absorbed, not posted. A second tier-1 post on the same
  booking can therefore only come from a split into two claims, as here,
  and the launch bar counts it as a repeat once the maintainer links the two
  claims. Production had a confirmation path (`confirmClaim`, official sources
  bypassing the duplicate gate); v0 did not take it over. G4's secondary
  criterion (a posted rumour resolved within 48 hours of an official answer)
  has no v0 mechanism behind it.
- **Verdict.** The evidence supports rumour then confirmation, not a plain
  repeat: the first post was a "reported" item from before the announcement,
  the second the announcement itself. By the bar's rule it is still a second
  tier-1 post on one story, which G3 calls a repeat, so it is counted below
  as a repeat that nobody has marked yet. No mark was written; the link is
  the maintainer's to make on the storyboard. Claim 519 (24 Oct) had posted
  a report of the same pairing for UFC 335 on 12 December.

**Launch bar, as the page computes it today.** Pacific days, ends included.

| | Last 14 days (5 to 18 Nov) | Last 28 days (22 Oct to 18 Nov) |
|---|---|---|
| Tier-1 posts + digests sent | 9 + 6 = 15 | 14 + 12 = 26 |
| With a reaction | **1** (a 👍 on digest 113) | **2** (that, and a 👎 on post 498, 22 Oct) |
| With no reaction | **14** | **24** |
| With 👎 as the latest reaction | 0 of 15 | 1 of 26 (3.8%) |
| Repeats marked in tier 1 (the page) | 0 of 9 | 0 of 14 |
| Repeats if 604 and 614 are linked (not marked) | 1 of 9 (11%) | 1 of 14 (7%) |
| Career events not posted (late or missed) | 0 of 1 | 0 of 1 |
| Missed outright (no post, no digest) | 0 | 0 |

My recount by separate SQL equals the page's in both windows (sent,
with a reaction, 👎: 15, 1, 0 and 26, 2, 1). The page itself (on Vercel, behind its sign-in) was
not opened; its code was run against the same database.

Messages with no reaction, by Pacific day and id (post = claim id, digest =
digest id; Telegram message id in `results.json`):

- 14-day: 5 Nov post 580; 6 Nov posts 587, 598, 601; 7 Nov posts 604, 605,
  614; 8 Nov post 618; 9 Nov digests 112, 114; 16 Nov post 677 and digests
  115, 116, 117.
- 28-day, additionally: 24 Oct post 519; 25 Oct posts 525, 527; 26 Oct
  digests 106, 107, 108 and post 508; 2 Nov digests 109, 110, 111.

**Reading it.** On the numbers alone v0 passes the bar over 14 days (0 of 15
👎, the one event in the window posted in 1.2 hours) and over 28 (1 of 26 is
under 1 in 10; the one event posted). The repeat rule passes only as the
page counts it: with the maintainer's ruling on 604 and 614 it is 1 of 9
over 14 days, 1 of 14 over 28. And the bar's first condition, a reaction to
every tier-1 post and digest, is not met: 1 of 15 and 2 of 26. If every
unreacted message in the last 14 days were a 👎 the share would be 14 of 15;
the figure is bounded by nothing. The last reaction of any kind arrived on
9 November 21:47 UTC. The last grouping mark by the maintainer is from
20 October, and a single "same claim" link exists, from 5 October, so "0
repeats marked" says nobody has marked, not that there are none.

## What it does not settle

- **Whether the list is complete.** It holds what two independent sources
  support and the search found. An event only one outlet reported, or in
  a language not searched (Georgian for Topuria), is missing. The web search
  was a general one, not each outlet's feed.
- **The announcement hour of the Amosov booking.** The outlets say the UFC
  announced it on the UFC Vegas 124 broadcast on 7 November; no ufc.com page
  was fetched. Agent MMA's pre-report and the 112.ua report came earlier the
  same day.
- **The hours.** Counted from the earliest article v0 stored, which is not
  necessarily the earliest report anywhere.
- **Repeats.** Only marked ones are counted, as the page does. 604 and 614
  are one story by the maintainer's ruling, not yet a mark; other
  unmarked repeats may exist, none was searched for.
- **Stale or low-value tier-1 posts.** Reading headlines, post 601 (an
  article headed with a June 2025 win over Oliveira, posted 7 Nov) looks
  stale. That is a G2 question, outside this snapshot, and unverified.
- **Whether silence is a pass.** The page counts a message nobody reacted
  to as fine, by design; this snapshot only shows how many that is.

## Files

- `snapshot.mjs` — the script; usage in its header. Writes `results.json`.
- `probes.json` — the headline patterns and windows used to find each
  event's articles.
- `results.json` — the output behind every number above.
