# Which golden articles have an unusable saved text — 2026-11-18

Launch Map task 3.3, the part that needs no decision: an automatic check
flags the suspects, an agent reads every one and proposes a mark, and the
maintainer later confirms that list instead of reading all 300 articles.
No model was called and nothing was scored; the reading was the agent's own.
Goals G1 and G2, through the extractor theme.

**Question.** For which of the 300 golden articles is the saved text not the
article, so that a station's wrong answer on it says nothing about the station?

**Why.** A score should tell "the station was wrong" apart from "its input
was garbage". The confirmed marks are the answer key for tuning the
extractor (task 3.4) and for any check that calls a text unusable.

**The marks are the agent's proposals, not the maintainer's.** Every mark
in `premarks.json` carries `by: "agent"`. A mark becomes the maintainer's
only when he confirms or changes it on the review page.

## The marks

Four marks, in order of how much they hurt a score:

| Mark | Meaning |
|---|---|
| `unusable` | Not the article at all: styling code, login or comment-policy text, a caption, or a video page whose text is only its blurb and a list of other videos. |
| `partial` | Part of the real article is there but a real part is missing: an intro only, or a cut at the 10,000-character cap that loses a paragraph or more. |
| `furniture` | The whole article is there, but buried in or mixed with menus, link lists, comments, markup or other stories, or the fighter is named only in that furniture. |
| `fine` | A false alarm: the saved text is the article, as complete as can be told. |

Where a text has two defects the worse mark is used and the reason names both
(#1172: a 1,900-character menu and a cut at the cap, marked `partial`).

## Method

1. `premark.mjs` reads the 300 saved texts and the clean-text experiment's
   `record.json` (2026-10-20: where each clean text came from, which Readability
   checks failed, how much hand-cleaning removed) and gives each article
   reason codes. Thresholds are in the script and in `premarks.json`; each was
   a round number chosen before looking at what it caught.
   - **Any one of these makes a suspect:** `nothing_usable` (the clean-text
     step found no article), `styling_code` (20 or more braces, densely),
     `short` (under 800 characters), `video_thin` (a video address or headline
     and under 1,500 characters of running prose), `no_name` (the text never
     names him), `name_only_in_furniture` (the saved text names him but the clean
     text, or the text without its furniture, does not), `clean_much_longer`
     (the clean text is 1.5 times the saved one, 1.2 at the cap), `cut_at_cap`
     (at the cap, and the cleaned text still fills it or the cleaning step noted
     a truncation).
   - **Two of these make a suspect, one alone does not:** `at_cap`,
     `menu_opening` (1,500 characters of menu before the running text, or 40%
     of the text), `mostly_furniture` (under half the text reads as prose),
     `much_removed` (cleaning took away half), `video_page`.
   - Noted only: `check_failed` (Readability failed one of its four checks).
2. The agent read every suspect's saved text, and where there was one the
   clean text and the record's reason, and gave it a mark and a one-line
   reason in `premarks.json`. Rerunning `premark.mjs` keeps the marks already
   given and refuses an unknown one.
3. `review-page.mjs` writes the maintainer's private page.

Run it from a worktree: `ARTICLE_TEXT_ROOT=<checkout with golden/articles.json> node premark.mjs`.
`node --test premark.test.js` checks each signal on invented text.

## Result

**76 of the 300 articles are suspects** (68 distinct pages: several are the
same article saved at two addresses, for example #687 and #688, or three times,
#490, #491 and #494).

| Agent's mark | Articles |
|---|---|
| `unusable` | **9** |
| `partial` | **13** |
| `furniture` | **37** |
| `fine` (false alarm) | **17** |

`unusable` are #3, #44, #521, #647, #653, #655, #740, #746 and #1045. Counting
the two intro-only texts (#134, #654), as the card's own list does, gives 11.
`partial` also holds 10 cuts at the cap (#204, #230, #238, #297, #353, #563,
#714, #737, #1172, #1200) and #937.

**Against the card's expectation** (10 to 15 unusable among 20 to 30 suspects):
the unusable count fits (9, or 11 with intro-only texts). The suspect list does
not: 76, not 20 to 30. Most of the excess is furniture, which the card
did not count: 37 `furniture` marks, 23 of them articles that only the
two-code rule lists. The maintainer's real decisions are the 22 `unusable` and
`partial` calls; the other 54 can be skimmed.

**Reason codes against the agent's marks** (a suspect can carry several codes):

| Code | Suspects | unusable | partial | furniture | fine |
|---|---|---|---|---|---|
| `nothing_usable` | 5 | 5 | 0 | 0 | 0 |
| `styling_code` | 1 | 1 | 0 | 0 | 0 |
| `clean_much_longer` | 5 | 0 | 5 | 0 | 0 |
| `cut_at_cap` | 14 | 0 | 10 | 0 | 4 |
| `video_thin` | 10 | 5 | 0 | 2 | 3 |
| `short` | 8 | 2 | 2 | 1 | 3 |
| `no_name` | 8 | 1 | 3 | 0 | 4 |
| `name_only_in_furniture` | 19 | 2 | 1 | 12 | 4 |
| `at_cap` | 24 | 1 | 10 | 9 | 4 |
| `menu_opening` | 23 | 1 | 1 | 21 | 0 |
| `mostly_furniture` | 8 | 1 | 0 | 6 | 1 |
| `much_removed` | 19 | 0 | 0 | 19 | 0 |
| `video_page` | 5 | 0 | 1 | 4 | 0 |

The signals that read the record or the page's own failure (`nothing_usable`,
`styling_code`, `clean_much_longer`) were exact. The furniture signals (menu,
mostly furniture, much removed) never pointed at a `partial` or `unusable` text
on their own: the 23 suspects listed only because two of them agree are all
`furniture`. The noisy ones are `short` (3 of 8 whole short news items),
`no_name` (4 of 8 are complete articles about someone else, a gate question)
and a cap hit alone (24 hits, 10 lost part of the article). Seven more articles
carry one supporting code and are not listed, and 16 non-suspects open with a
shorter menu (1,000 to 1,500 characters, mostly Yahoo).

**Catch rate on the known cases** (`knownCases` in `premarks.json`):

- The card's seven (#134, #655, #647, #44, #1045, #1172, #230): **7 of 7**.
- Task 3.2 and 3.4's #937 and the video and boilerplate cases named in the
  labelling notes (#521, #653, #492, #740): **5 of 5**.
- #852 (one line lost) and #385 (an embedded post the text cannot show): **0 of
  2**, as expected. Their articles are whole in the saved text, so no text check
  can see what is missing.

The thresholds were set by looking at the card's cases, so this is a check that
they are covered, not an independent test.

## What it does not settle

- **The marks are one reader's calls, not the maintainer's.** The video
  blurbs (#44, #1045, #323, #96, #1027, #492, #782) are the least clear: a
  blurb can hold the whole news fact and still not be the article. #44 and #1045
  follow his earlier call on the card; #323 is marked `fine` and #96, #1027,
  #492 and #782 `furniture`, which he may rule otherwise.
- **No page was reopened.** The marks rest on the saved text, the clean text
  and the record's reasons. #937's "second article never fetched" is taken from
  the card, not seen. How much a cut text lost is known only where Readability
  returned the whole page (#230, #238, #297, #714, #1200, #65); for #353, #563
  and #737 it is unknown.
- **Recall is not measured beyond the known cases.** A text no signal
  flagged, with nothing wrong that these signals can see, is not in the list. A
  look at the non-suspects' endings and boilerplate words found no further
  unusable text, but that was a skim, not a reading.
- **`fine` is not "about him".** Four texts that never name him (#38, #158,
  #316, #1161) are complete articles about other fighters: a question for the
  "about him" label, not a text defect.

## How the maintainer confirms

Open the private page `data/review.html` (git-ignored: it holds the outlets'
text; the same page is written as `data/review-artifact.html` for a private
claude.ai page). One folded card per suspect, `unusable` first. Each shows the
agent's call and reason, the saved text and the clean text side by side (red:
only in the saved text; blue: only in the clean text; his name in bold with a
gold underline). Press **Confirm** to accept the call or pick another mark
(or "can't tell"), and add a note if useful. Picks save as he goes, on
claude.ai with the page itself and in the browser otherwise; **Copy verdicts**
gives the list to paste back. Only then are the marks his, and only then do
they become the answer key for 3.4.
