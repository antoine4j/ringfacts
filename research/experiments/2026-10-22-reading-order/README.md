# Which reader goes first, and what Readability costs — 2026-10-22

Self-feeding architecture, spec unknowns E1 (the reading order, and how
clean Jina's text is), E2 (Readability's CPU on Cloud Run) and E10 (following
Ukr.net to the original outlet). Run 22 October 2026 from the laptop.

**Question.** v0 will fetch its own article text. Three readers are on the
table: our extractor (`lib/extract.js`), Mozilla Readability, and Jina
Reader (keyless). In what order should they run, and does Readability need
a machine of its own?

## Sets

- **Fresh:** every Amosov and Donchenko article production stored in the
  last 45 days and 90 random Topuria articles from the last 14 (seeded):
  174 articles, ids in `sample.json`. Mshale left out. Read-only through the
  `v0_feed` role.
- **Golden:** the 234 golden pages the clean-text experiment downloaded
  (`../2026-10-20-clean-text/data/pages/`), scored against its clean texts
  (3.12's answer key: 159 are Readability's own text, 136 hand-cleaned).

"Readable" is v0's bar (R2, D32): at least 400 characters naming the
article's fighter.

## Method

1. `sample.mjs` picks the sample. `fetch.mjs` decodes Google's link as
   production does and downloads each page once (browser headers, 10 s).
2. `read.mjs` runs our extractor and Readability on the same HTML, timing
   each in CPU milliseconds (`process.cpuUsage`). `memory.mjs` reads every
   page in one process with garbage collection between pages.
3. `jina.mjs` calls Jina keyless for every article (refused ones included),
   one call started every 3.2 seconds.
4. `ukrnet.mjs` follows each Ukr.net item's link to the outlet that wrote it.
5. `compare.mjs` and `route.mjs` count; `route.mjs` merges copies first
   (same slug, by the rule in `../2026-10-22-addresses/`), as v0 will.
6. `jina-html.mjs` asks Jina for the page's HTML instead of its text and runs
   our readers on it.
7. `review-page.mjs` writes the spot-check page (ten pages where the readers
   disagree) for the maintainer.

## Results

**Downloads.** 127 of 174 pages came back; 43 refused (403), 2 with 406,
1 with 400, 1 failed to connect. All 154 Google links decoded. Median
download 290 ms (90th percentile 982 ms).

**Readable, on the 127 downloaded pages:** our extractor 96, Readability 87,
either 99. Readability alone read 3 that ours could not (#869, #1616,
#2150); ours alone read 12. Ours' rung on its 96: JSON-LD 69, `<article>`
paragraphs 17, all paragraphs 10.

**The route test, copies merged** (spec section 2; production's figure is
its stored text of 400 characters or more without the name check, an upper
bound):

| Fighter | Articles | Production | Our extractor | + Readability | + Jina |
|---|---|---|---|---|---|
| Amosov | 35 | 12 (34%) | 14 (40%) | 14 (40%) | **18 (51%)** |
| Donchenko | 27 | 9 (33%) | 11 (41%) | 13 (48%) | **15 (56%)** |
| Topuria | 89 | 71 (80%) | 67 (75%) | 68 (76%) | **80 (90%)** |

What stays unread is mostly Tribuna (15 sampled) and Sport.ua (9). Both
answer every request, article pages and RSS feeds alike, with Cloudflare's
bot check ("Just a moment…"), from the laptop, with a browser's headers and
without; Jina is refused there too.

**Against the clean text (golden pages)**, median share of the reader's
words that belong to the clean text / share of the clean text kept:

| Golden pages | Our extractor | Readability | Jina's own text |
|---|---|---|---|
| 159 where Readability passed 3.12's checks (its text is the key) | 0.99 / 0.95 | (the key) | 0.35 / 1.00 |
| 71 cleaned by hand, Readability having failed | 0.85 / 1.00 | 0.86 / **0.24** | 0.30 / 0.97 |

By rung on the hand-cleaned set, our extractor's words that belong: JSON-LD
1.00 (24 pages), `<article>` 0.84 (19), all paragraphs 0.72 (27). The two
sets are biased opposite ways (the hand-cleaned keys start from our
extractor's saved text; the others are Readability's), so read the table
across, not down: on the pages Readability gets right, ours is nearly the
same text; on the pages it gets wrong, it loses three quarters of the
article, where ours keeps all of it plus some furniture.

On the fresh pages where both pass (84), ours' sentences are all in
Readability's text (median) and Readability holds 92% of ours'. Where
Readability and Jina both pass (76), Readability's sentences are all in
Jina's, but only 48% of Jina's are in Readability's.

**Jina (E1, E3).** 123 of 174 calls returned text, 40 a warning that the
page hides its content in a frame (about 190 characters, which fails the
bar), 8 that the outlet refused Jina too. Median 5.7 s a call, 90th
percentile 22 s. It read 5 of 15 Ukr.net items keyless (the 5 Oct spike
needed a key for Ukr.net).

**Jina as a fetcher, not a reader.** Asked for the page's HTML instead
(`X-Respond-With: html`), with our extractor and Readability run on it:
all 25 fresh articles that only Jina could read came back, and 23 passed
the bar from our readers. On 60 golden articles, ours on Jina's HTML
scored 0.98 / 0.98 against the clean text, where Jina's own text on the
same pages scored 0.35 / 1.00. So Jina can be the second way to get the
page, with the same readers after it, and its own text kept only as a
last resort.

**Ukr.net (E10).** Of 17 sampled Ukr.net items, 9 link to an article the
sample already holds directly (a copy), 6 to an outlet that refuses us
(Sport.ua 5, one regional site), and 7 originals are readable, of which 1 is
not already in the sample.

**Readability's cost (E2).** On the laptop (Apple silicon), median 36 ms of
CPU a page, mean 54, worst 497, on the fresh pages; mean 67 on the golden
ones. Our extractor: median 0.1 ms. Memory: read 127 pages in one process
without closing each page's window and the heap reached 652 MB; under a
256 MB heap limit the golden run died. With `window.close()` and one turn
of the event loop after each page, the process peaked at 230 MB and ended
with a 30 to 51 MB heap.

## What it suggests (findings, not decisions)

Our extractor first, Readability only when ours has nothing usable. Jina
as the second way to get a page (its HTML, read by the same readers), and
its own text only as a last resort: it reaches pages nobody else does, but
its own text brings the page around the article. Readability is cheap
enough to run inside the job. The 75%
floor is out of reach for Amosov and Donchenko with these readers. The
decisions are in the self-feeding architecture doc's log.

## What it does not settle

The Cloud Run CPU is not measured: the laptop is faster, so a factor of
two or three is assumed (inferred). The fresh sample is small for Amosov
and Donchenko (35 and 27 articles once copies merge), one quiet month for
Donchenko. The spot check of the texts (`review-page.mjs`, published as a
private page) is the maintainer's, still open.

Cost: $0 (Jina keyless; no model calls). The pages, texts and the review
page stay in the git-ignored `data/` (docs/decisions.md#article-text-out-of-git).
