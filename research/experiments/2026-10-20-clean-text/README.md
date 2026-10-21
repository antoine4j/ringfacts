# Clean text for the golden set, and whether it moves v0's decisions — 2026-10-20

Launch Map tasks 3.12 (a clean text for every golden article) and 3.11
(does clean text change what the pipeline decides). Run 20–21 October 2026
from the laptop.

**Question.** A saved article text carries furniture: site menus, link
lists, captions, other stories on the page. Does that furniture change
what v0's pipeline decides about the article?

## Step 1 (3.12): a clean text for every golden article

No model calls in the texts themselves; the hand-cleaning was done by
Claude (Sonnet 5.5 helpers) marking which spans to keep.

**Method.**

1. `fetch.mjs` fetched each of the 300 pages again, Google's link decoded
   as production does (`lib/googlenews.js`). 234 came back; 55 were
   refused (403), 7 gone (404), 3 rate-limited, 1 failed to connect.
2. `readability.mjs` ran Mozilla Readability 0.6.0 (jsdom 26.1, installed
   in this folder only) and kept its text only when four checks held: the
   page's headline matches the saved one (the outlet's name at the end
   aside); it shares at least two sentences with the saved text; it names
   the fighter (`watchlist.js` matchNames); and it reaches 85% of the saved
   text without its furniture (estimated by classifier-v7's `cleaned()`
   rule) without dropping any sentence that names him. HTML codes in the
   saved text (`&nbsp;`, `&#x27;`) are decoded before comparing.
3. Every other article was cleaned by hand from its saved text. A helper
   read it and named each span to keep by its exact first and last words;
   `hand-clean.mjs` cuts those spans out, in order, and refuses any mark it
   cannot find, so a hand-cleaned text can only delete: nothing is added,
   reworded or reordered.
4. `build-clean.mjs` rechecked the Readability texts that failed only the
   length check, this time against the hand-cleaned text: kept when they
   hold every sentence of it that names the fighter and reach 90% of its
   length. 53 passed.
5. `record.json` holds, per article, the source of its clean text, every
   check's outcome and a one-line reason (no article text).

**Result.**

| Source of the clean text | Articles |
|---|---|
| Readability (106 on the four checks, 53 on the recheck) | **159** |
| Hand-cleaned from the saved text | **136** |
| Nothing usable (CSS only, a login page, a video stub, a comment policy) | **5** |

Hand-cleaning cut 32% of the saved characters (578k to 392k). 90 Readability texts
are longer than the saved one, and 8 recover articles that the saved copy
had cut at 10,000 characters. 35 clean texts equal the saved text. In 12
articles the saved text named the fighter only in furniture (a "LATEST
NEWS" line, a related headline); their clean text does not name him.

Why 136 are hand-cleaned: 64 pages did not come back; on 72, Readability's
text failed a check (34 took the wrong part of the page, 33 lost part of
the article, most often an embedded post the article relies on, 4 have a
different headline, 1 had no article).

**The spot check.** Eleven borderline texts, saved beside clean, word by
word: red for saved text the clean text lacks, blue for clean text the
saved one lacks, the fighter's name marked. `review-page.mjs` writes it to
`data/review.html` (git-ignored) and the same page as a private artifact.
The maintainer judged the clean text better in all eleven (21 Oct).

**What it does not settle.** The checks catch missing text, not extra
stories inside the same article: Readability keeps a roundup's other-news
sections (#261), which hand-cleaning cut. Hand-cleaning cannot be repeated
in production as it was done here; 3.9 decides which reproducible reader
wins, with these texts as its answer key.

**Two bugs found during the spot check, both fixed before Step 2:** the
headline check cut a headline at its own " | " ("Morning Report | …"), and
the sentence check compared saved sentences with their HTML codes still
in. Neither changed more than two sources.

**Cost: $0.** The texts, pages and review page stay off the repository
(docs/decisions.md#article-text-out-of-git): everything under `data/` is
git-ignored.

## Step 2 (3.11): does clean text move the decisions

**Method.** v0's own station code, imported unchanged (`run.ts`):
classifier v7.7 (`jev-1.13.0`), claim extractor p4 on Qwen3.8 Flash
through OpenRouter, and the decider with the live settings (v1, read once
in a read-only transaction by `read-settings.mjs`; identical to the
starting map). The experiments' test keys from `research/bench/.env.bench`,
never live v0's. Runs, each stored per article in `data/runs/`:

- `saved-a`: all 300 on the saved text;
- `saved-b`: all 300 on the saved text again, the **noise floor**;
- `clean-a`: the 260 articles whose clean text differs from the saved one
  (35 are identical; the 5 with nothing usable keep their saved answers).

A **production-like** text needs no run of its own: where code alone
accepted Readability (106 articles; 97 differ from the saved text), its
text is the clean text, so it takes `clean-a` there and `saved-a`
elsewhere. `compare.ts` counts and scores; `results.json` holds every
number, ids only, and none for the test side's articles.

**What counts as a change.** A classifier answer changes when any of the
nine differs. An extract changes when its kind, actor, opponent, event or
date differs (trimmed, case ignored); the claim's wording is counted
apart, since it is re-worded even on identical input. A tier crossing is
a move between post, digest and drop under the live settings. A career
fact is "what new fact" = result, next fight or health.

**Result, on the 260 articles whose text changed** (noise floor = the same
saved text sent twice, on the same 260):

| | Noise floor | Saved vs clean |
|---|---|---|
| Articles with any of the nine answers changed | 13 (5%) | **41 (16%)** |
| Answers changed, of 2,340 | 27 (1.2%) | **68 (2.9%)** |
| Extracts changed (kind, actor, opponent, event, date) | 69 (27%) | **91 (35%)** |
| Claims re-worded | 144 (55%) | 174 (67%) |
| Tier crossings (post / digest / drop) | 3 | **6 (2.3%)** |
| Career fact lost / invented | 3 / 1 | 1 / 5 |

Test side, counts only (93 of the 260): 18 articles changed an answer
(noise 7), 26 answers (noise 19), 25 extracts (noise 19), 2 tier
crossings (noise 2), 0 career facts lost and 1 invented (noise 2 and 0).

On the training side the four tier crossings are one false "post now"
removed (#494, Readability) and three added (#599, #619, #690, all
hand-cleaned: a next fight read into a text whose surrounding furniture
was cut); #690 also crosses a tier in the noise run.

**Production-like, on the 97 articles where it differs:** 9 articles
changed an answer (noise 4), 15 answers of 873 (noise 6), 32 extracts
(noise 18), **0 tier crossings** (noise 0), no career fact lost or
invented.

**Scores against the labels** (`golden/labels.json`, coin flips
accepted), all 300 articles:

| | Saved | Saved, sent again | Clean | Production-like |
|---|---|---|---|---|
| All nine right, training (195) | 115 | 110 | 116 | 113 |
| All nine right, test (105) | 41 | 40 | 41 | 41 |
| Answers right, training (of 1,755) | 1,606 | 1,595 | 1,599 | 1,598 |
| Answers right, test (of 945) | 822 | 828 | 812 | 818 |
| Career facts recognised, training (of 46) | 33 | 32 | 34 | 33 |
| Career facts recognised, test (of 15) | 10 | 10 | 10 | 10 |
| Career false alarms, training / test | 7 / 6 | 8 / 4 | 9 / 7 | 7 / 6 |

**Which way the changed answers moved**, against the labels, on the same
260 articles:

| | Same text twice | Clean text |
|---|---|---|
| Wrong → right | 9 | 21 |
| Right → wrong | 12 | 38 |
| Wrong → another wrong | 6 | 9 |

Clean text moves an answer away from the label more often than toward
it; of its 6 tier crossings, 2 move toward the label's tier, 3 away and 1
to neither. Split by who gave the label:

| Labelled by | Wrong → right | Right → wrong |
|---|---|---|
| The maintainer, who checks against the outlet's own page (124 articles) | 6 | 18 |
| Two blind readers, reading the saved text (176) | 15 | 20 |

The labels file marks the maintainer's 124 as opened (97) or confirmed
from a summary (27), but that split is not reliable, so they are counted
together. Where the key is independent of the furniture, clean text
breaks three answers for each one it fixes. That leans toward v7.7 being
fitted to the saved texts, furniture included (it was tuned over 18
passes on them, and its test score of 5 Oct already sat below training).
Small: 24 answers on 124 articles; a lean, not a proven cause.

**Conclusion.** Clean text changes about three times as many answers as
sending the same text twice does (41 articles against 13), but almost
none of what the pipeline decides: 6 tier crossings against 3 from noise
alone, and no score moves further than the saved text moves against
itself (all nine right 115 against 110 on training). The production-like
text crosses no tier at all. The furniture is noise to the classifier,
not a cause of its decisions; the extractor's detail fields move more
(91 against 69).

**Does not say.** That furniture never matters: #948-style articles,
which name the fighter only in a link, stay in the set as labelled; the
sample is one fight week. The test side was sent to v7.7 again for this
count, with the rule lifted (docs/decisions.md#classifier-pass-marks):
nothing was tuned on it and only counts are reported.

**Cost: $0.44 measured** for 860 article calls (JEV $0.21 at its
published $0.042 per million input tokens, 4.97 million tokens;
OpenRouter $0.23 as billed per call). Run 21 October 2026.
