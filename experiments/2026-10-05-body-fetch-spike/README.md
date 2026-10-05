# Body-fetch spike, 2026-10-05

**Question.** v0 cannot read 72% of Amosov's articles and 42% of Donchenko's
(docs/lessons.md, "A fifth of the feed has no usable body"). Which free ways
of fetching would read them, outlet by outlet, so that a fix could apply to
new articles from then on? A spike: read-only, throwaway, no backfill, no
article text kept (only lengths and whether the fighter is named).

**Set.** Every article v0 marked `no_body`, Mshale left out (a spam site
production already holds): 452 articles. "Usable" means at least 400
characters that name one of the article's fighters, v0's own bar (D32).

**Ways tried** (`spike.mjs`; per-article results in `results.json`, per-outlet
feeds in `rss.json`):

| Way | Usable, of 452 | What it shows |
|---|---|---|
| Google's wrapped link decoded again | 93 of 93 decoded; 78 then usable | The "decode-failed" ones were temporary refusals; a retry later works |
| Production's own fetcher again, today | 126 | Mostly the decoded ones, plus outlets that were down for a moment |
| Jina Reader, keyless (free, 20 pages a minute) | 233 | Bloody Elbow 70 of 70 (production 0); sport.nv.ua 9 of 9; Sherdog 7 of 47 |
| Either of the last two | **251 (56%)** | |
| The outlet's RSS feed | MMAWeekly (16) and Athlon (7) carry full text: medians 1,944 and 2,860 characters | Feeds hold only recent items, so this counts the route, not these articles |

**Still unreadable by any free way:** Eurosport 41, Sherdog 40, Tribuna 36,
Ukr.net 22, DAZN 14, Sport.ua 6: no full-text feed, and Jina refused (403)
or, for Ukr.net, needs a key to read the framed article (401 keyless).

**By fighter** (recovered by retry or Jina, of his unread articles):
Topuria 211 of 339 (62%), Amosov 17 of 43 (40%), Donchenko 24 of 75 (32%).
The Ukrainian outlets that carry most of Amosov's and Donchenko's news are
the ones no free way reads.

**What it suggests, for after v0** (a finding, not a decision): retry a
failed link decode on the next run instead of giving up; try Jina Reader
when production's own fetch fails; read MMAWeekly and Athlon from their
feeds. Not tried: a Jina key (an account), paid readers, a headless browser.

Cost: $0. Run 5 October 2026, 12:00–13:20 Pacific, from the laptop.

**The text is not kept.** `keep-bodies.mjs` can fetch the readable articles
again, each by the way that read it, into a git-ignored `bodies/` folder (other
outlets' text stays off this repository: docs/decisions.md#article-text-out-of-git).
It was started on 5 October and stopped after one article: not needed for now.
