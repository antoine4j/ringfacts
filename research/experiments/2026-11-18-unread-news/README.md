# Career events first reported only in articles v0 could not read — 2026-11-18

Goal G1 (nothing real is missed). Counts the "before" number for Launch Map task
10.9, and informs the self-feeding architecture's decision 3 (what readable floor
to accept for Donchenko) and Launch Map task 3.10 (whether stations should judge
headline and summary when there is no text). It makes none of those decisions.

**Question.** v0 cannot read some articles (the page refuses, or nothing usable
comes back), so its classifier never sees them. The three-judges run
([2026-11-05](../2026-11-05-three-judges/README.md)) screened those unread
articles by headline and counted career-looking ones. What nobody counted is the
thing G1 turns on: how many distinct career events were first reported in the feed
only through an unread article, and by how many hours did the first *read* article
about the same event trail it? If every unread career headline had a read twin
within the hour, unread text costs nothing; if some events were only in unread
articles, that is news the group lost.

**Why.** The earlier count (about 41 fight booked, 16 injury, 4 result among 821
unread) counts articles. Most are repeats of one story in six outlets, and some
are not events at all. Only the events and their first-report gaps say what G1
loses.

**Everything here is an agent's call.** One Claude Code agent, not the maintainer,
read the headlines to group them, judged each group, and matched it to a read
article. No model API was called and nothing was spent. These are silver labels
built on other silver labels (the three screeners' headline-only calls, which an
agent then re-read), so every number below carries both weaknesses.

## Method

Inputs (read-only): the three-judges weekly exports (17 weeks, 27 Jul to the
export of 2026-11-19T05:46Z, 821 unread readings, 2,350 read and grouped), the
three screeners' answers on each unread headline, and v0's own tier and posting
record for each read reading. Nothing from the three-judges folders was changed.

1. **Candidates** (`unread-news.mjs`). Every unread article with a career kind from
   the screen. *Core* is the three-judges rule: a majority of the three screeners
   say it looks like news, and the majority career kind is fight booked, fight
   changed, result, injury, retirement or contract move (61 articles: Amosov 38,
   Donchenko 6, Topuria 17, the same 41 + 16 + 4 as the earlier count). *Extra* is
   any other unread article where at least one screener gave one of those kinds,
   or title, or ranking (62 more), so a lone screener's call is not dropped. 123
   in all.
2. **Groups** (`events.json`, by the agent, from headlines). Every one of the 123
   belongs to exactly one group, and the script refuses to run if one does not. A
   group is *event* (the headline announces a fact of one of G1's kinds as done:
   booked, signed, official, a result, an injury disclosed, a medical clearance,
   a return window stated by the fighter's team or the promotion), *borderline*
   (talk, a rumour or a denial, a promotion statement with no date, a
   retrospective, or an opponent the headline does not name) or *not event* (a
   false positive of the screen: a video of an older fight, odds, another
   person's contract, opinion, a reaction, ranking talk).
   One rule applies to all three fighters: **a firmer step of the same fight
   (reported, signed, official) is a new event only when its headline announces
   the step itself; reactions, interviews and explainers about a step are not.**
   One line of reasoning per group is in `data/unread-news.md` (git-ignored; it
   quotes headlines).
3. **Read twin.** For each event or borderline group, the earliest *read* reading
   (v0 saved its text and grouped it) about the same fact, any outlet or language,
   found by searching the read readings of all three fighters in a window from
   some days before the first unread report to about two weeks after, then
   confirming by headline and, for the first twin, the saved text where the
   headline was not enough. The matching rule: **same fact, same fighter (or the
   same booking seen from the opponent's side), and a read headline that states
   it** (names the fight, the clearance, the window). When the unread headline
   does not name the opponent or date, the match is marked *medium*: it rests on
   timing and the story, not on a shared name.
4. **Gap.** Hours from the earliest unread report to the earliest read twin, by
   the publish times in the export; negative when a read article came first.
   G1's window is 6 hours.

## Result

Of 123 articles, the agent put 42 in event groups, 46 in borderline groups and 35
in not-event groups. The groups: 10 events, 10 borderline groups, 10 not-event
groups. With counts this small no percentages are given.

**Events** (clear calls only), against G1's 6-hour window:

| Fighter | Events | Read first or within 6 h | Read only later | Never read |
|---|---|---|---|---|
| Amosov | 3 | 1 (1.2 h behind) | 2 (7.8 h, 17.1 h) | 0 |
| Donchenko | 2 | 1 (read first, by 3 minutes) | 1 (18.8 h) | 0 |
| Topuria | 5 | 5 (all read first) | 0 | 0 |
| All | 10 | 7 | 3 | 0 |

Four of the ten events (three of Amosov's, one of Donchenko's) had an unread
article as the first report in the feed; three of those four trailed by more than
6 hours, one by 1.2 hours. No event was only ever in unread articles.

Adding the ten borderline groups (20 in all): 16 within the window, 4 late (the
three above and one Topuria group, 12.2 h), 0 never read. Amosov 4 (2 late),
Donchenko 3 (1 late), Topuria 13 (1 late).

The late events:

| Event | Unread first report | First read twin | Delay | What v0 did |
|---|---|---|---|---|
| Amosov's next opponent named as Garry, UFC 335 (A-2) | Sport.ua, 23 Oct 23:32 | MMA Sucka, 24 Oct 16:39 | 17.1 h | tier 1, posted 17:47, 18.3 h after the first report. Medium match |
| Amosov says his bout agreement is signed (A-3) | MiddleEasy, 6 Nov 02:24 | XSPORT.ua, 6 Nov 10:14 | 7.8 h | tier 1, posted 11:47, 9.4 h after |
| Donchenko booked against Soriano (D-1) | ukr.net, 30 Jul 15:01 | Sport.ua, 31 Jul 09:51 | 18.8 h | tier 1; v0 was not posting yet (tier-1 posting began 9 Oct). Reading ids 1 and 2: the very start of the history |

The one event within the window but behind: Amosov vs Garry confirmed for 5 Dec in
Saudi Arabia (A-4), Sport.ua 7 Nov 10:21 against 112.ua 11:35 (1.2 h), posted
12:47. Then the official card at 03:32 on 8 Nov was read within the hour.

The ones read first include Donchenko's win over Soriano (D-2: Tribuna 20:44
against Sport.ua 20:41), Topuria's medical clearance (T-12: 20 minutes), his essay
disclosing new injuries (T-4: 1.8 h), the trainer's return window (T-11: 3 h) and
Dana White's "early 2027" (T-17: 7.9 h).

**What reached the group, as far as the export shows.** Tier-1 posting began on 9
Oct (30 posts to 16 Nov), so only Amosov's three events could have been posted;
all three were, 0.8 to 1.6 hours after their first read article. Donchenko's two
events were tier 1 as classified. All five Topuria events were tier 2 at best
(health and return news goes to the digest under the starting tier map). The
export does not say which digest a tier-2 reading landed in, so "reached the
group" for those means digest-eligible, not confirmed.

**The borderline late one** is Topuria's trainer saying no camp had started,
contradicting Dana White (T-10b): Eurosport 12 Sep 19:36 against Diario AS 13 Sep
07:50 (12.2 h).

Per-event numbers (ids, outlets, times, hours, tiers) are in
`results/unread-news.json`; reasons and headlines in the git-ignored
`data/unread-news.md`. Re-run:
`node research/experiments/2026-11-18-unread-news/unread-news.mjs <judges data dir> <out data dir>`.

## What it does not settle

- **The sample is small.** Ten events (twenty with borderline groups), three of them
  late. One more or fewer late event moves any ratio a lot; none is given. Amosov's
  two late events are the same fight at two firmness steps; counted with A-4 as one
  story it is one booking whose first feed report came 17.1 h before v0 read
  anything about it.
- **The calls are one agent's, from headlines.** The screen saw headlines only; the
  agent grouped from the same headlines. Reading the saved text of the read twins checked
  the match for some, but no unread text exists to check what the unread articles
  said. A different agent could draw event and borderline lines differently (T-8
  "ready to fight" and T-17 "early 2027" are the thinnest events; A-3 as a separate
  event rather than part of the booking is a choice).
- **Medium matches.** A-2 and A-4's unread headlines do not name the opponent, so
  "the same event" rests on timing and the story around it. If either is not the
  same story, the delay for that event is not measured.
- **Gaps are publish-time gaps, not v0-seen gaps.** The export carries each
  article's published time, not when v0 first saw it, and aggregators' times
  (Ukr.net, Google News) can be off. Any of the gaps could shrink or
  grow with the true fetch times.
- **"First report" means first in v0's feed.** An earlier article that never
  reached the feed is invisible, in either direction. The first feed report is not
  necessarily a *trusted outlet's* (G1's wording); the late firsts are Ukrainian
  outlets (Sport.ua, ukr.net) and MiddleEasy, whose standing was not judged.
- **The screen may have missed some.** Only articles whose headline a screener
  called a career kind are counted. An unread career event with a plain headline is
  not in these numbers, so "never read: 0" is a floor on what was lost, not a
  proof of none lost.
- **Start of history.** D-1 is reading ids 1 and 2, when v0 had just begun
  collecting; it may measure start-up rather than steady state. Without it, two
  late events remain, both Amosov's.
- **Not a measure of what is readable.** Whether the delayed articles could have
  been read by another route, or what a paid reader would have added, was not
  tested here.

Cost: $0. No article text is kept in tracked files; headlines are in `data/`.
