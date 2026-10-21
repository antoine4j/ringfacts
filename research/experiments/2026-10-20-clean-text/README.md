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
