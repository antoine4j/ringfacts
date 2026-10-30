# Which outlets carry each fighter, which refuse us, and what reaches them — 2026-10-30

Self-feeding architecture, spec unknown E4 ("which outlets carry each
fighter well but refuse us, and what other way reaches them"), plus the
architecture doc's open question of how long a feed keeps an article
listed. Informs Launch Map tasks 1.3 (add the MMAWeekly and Athlon feeds),
3.6 (v0 fetches the article text itself) and 3.8 (fall back to a reader
service when the fetch fails). Run 30 October 2026 (UTC) from the laptop.

**Question.** The 22 Oct reading-order experiment found that with every
free reader Amosov reaches 51% readable and Donchenko 56%, short of v0's
75% floor, and that what stays unread is mostly Tribuna and Sport.ua. Per
fighter, which outlets carry the news, how much of each can be read, and
for the ones that cannot: does the outlet refuse everyone, or only us, and
does it publish a feed that carries the text?

## Sets

- **Production's articles, 7 Aug to 30 Oct 2026** (the 90 days before the
  last article stored at 04:17 UTC on 30 Oct; production's record starts
  on 7 Aug, so this is all of it). Read-only through the `v0_feed` role.
  Mshale left out. Of 2,341 articles, the counted ones leave out two holds:
  `wrong_subject` (the matcher said it is not about the fighter) and `url`
  (an address already stored, the same article twice). Counted: **Amosov
  58, Donchenko 144, Topuria 1,594.**
- **Outlet** is the host of the address the article resolved to, without
  `www.`. When Google's link never decoded, the article goes under the host
  that outlet name most often resolved to.
- **Readable** is v0's bar (R2, D32), applied to the text production
  stored: a reading rung (`feed-content`, `json-ld`, `article-tag`,
  `paragraphs`), at least 400 characters, naming the article's fighter
  (`watchlist.js` matchNames). This is production's reader on Cloud Run,
  not the reading order the 22 Oct experiment proposed, so it is lower than
  that experiment's figures.

## Method

1. `pull.mjs` reads the articles once; the text is reduced to its length
   and the readable verdict. `outlets.mjs` counts per fighter and outlet,
   over the window and its last 30 days, and picks the outlets to probe:
   any carrying 3 or more of a fighter's articles that are mostly (over
   half) unreadable, plus any carrying 3 or more of Amosov's or
   Donchenko's, readable or not, since a feed there is a direct route too.
   23 outlets.
2. `probe.mjs` asks each outlet once: its homepage, its newest article
   page, then feed addresses in order until one is a feed (the feed already
   known for the outlet, the ones the homepage announces with
   `<link rel="alternate">`, then `/rss`, `/feed`, `/rss.xml`, `/feed.xml`,
   `/rss/all`, `/news/rss`). Browser headers, 10 s, no retries, one second
   between requests. "Cloudflare's check" means a 403 or 503 carrying "Just
   a moment" or Cloudflare's challenge markers. A feed's text is the
   richest body field per item, tags stripped; **full text** means a median
   of 800 characters or more.
3. `reread.mjs` fetches each article page that answered once more, with
   production's own reader (`lib/extract.js`), because a page that answers
   is not a page that reads.
4. `copies.mjs`: for each unreadable article, is there a readable article
   about the same fighter with the same story? Strictest test first: same
   slug (`../2026-10-22-addresses/slugs.mjs`), same story in production's
   own grouping (`story_id`, decided by a model, across languages),
   headlines sharing 60% of their words within 48 hours. "Nearby" (any
   readable article about the fighter within 48 hours) is an upper bound
   only. It also computes the ceiling: every article counted readable
   except those at outlets that answered with Cloudflare's check and have
   no full-text feed.
5. `retention.mjs` reads each feed production reads (six Google News
   searches, six outlet feeds) and MMAWeekly's and Athlon's once: item
   count, ages. Then, from the saved copy, how many of the articles
   production found through each Google search the search still lists
   today.

Outside requests: 110 by the probe (at most 8 to one host), 15 by the
re-read, 14 per retention run, 3 by hand to look for feed links on pages
that answered at `/rss`. About 160 in all.

## Results

### Per fighter, outlet by outlet

"Last 30 days" is readable / articles in the window's last 30 days.
Failure kinds are production's: `http-403` refused, `decode-failed`
Google's link not decoded (our side), `og-description` only the page's
one-line summary, `no-extract` page read but no text found,
`short-or-unnamed` text under 400 characters or not naming the fighter.

**Amosov: 58 articles, 23 readable (40%); last 30 days 6 of 21 (29%).**

| Outlet | Articles | Share | Readable | Last 30 days | Why the rest failed |
|---|---|---|---|---|---|
| ua.tribuna.com | 10 | 17% | 0 | 0/4 | http-403 9, decode-failed 1 |
| ukr.net | 5 | 9% | 0 | 0/4 | og-description 5 |
| 247sports.com | 4 | 7% | 0 | 0/2 | http-406 4 |
| bloodyelbow.com | 4 | 7% | 2 | – | http-403 1, decode-failed 1 |
| sport.ua | 3 | 5% | 0 | 0/3 | http-403 3 |
| sports.yahoo.com | 3 | 5% | 2 | – | og-description 1 |
| sport-express.ua | 2 | 3% | 0 | – | decode-failed 2 |
| sport.nv.ua | 2 | 3% | 0 | – | http-403 2 |
| 24tv.ua, boxingnews.com, glavcom.ua, mmasucka.com, xsport.ua | 2 each | 3% each | 2 each | 2/2 (mmasucka) | – |
| 15 others, one each | 15 | 26% | 9 | 4/6 | decode-failed 3, http-403 2, og-description 1 |

**Donchenko: 144 articles, 84 readable (58%); last 30 days 1 of 6.**

| Outlet | Articles | Share | Readable | Last 30 days | Why the rest failed |
|---|---|---|---|---|---|
| ua.tribuna.com | 27 | 19% | 0 | 0/3 | http-403 27 |
| sport.ua | 17 | 12% | 16 | – | timeout 1 |
| sport.nv.ua | 15 | 10% | 8 | – | http-403 7 |
| champion.com.ua | 11 | 8% | 6 | 0/1 | http-403 5 |
| ukr.net | 10 | 7% | 0 | 0/1 | og-description 10 |
| ufc.com | 6 | 4% | 6 | – | – |
| 112.ua | 5 | 3% | 5 | – | – |
| mmafighting.com | 4 | 3% | 4 | – | – |
| mmajunkie.usatoday.com | 3 | 2% | 2 | – | no-extract 1 |
| sport-express.ua, xsport.ua | 3 each | 2% each | 3 each | 1/1 (xsport) | – |
| boxingnews.com, sport24.ua, sports.yahoo.com | 2 each | 1% each | 2 each | – | – |
| 34 others, one each | 34 | 24% | 25 | – | http-403 4, og-description 2, short-or-unnamed 2, no-extract 1 |

**Topuria (comparison): 1,594 articles, 1,244 readable (78%); last 30
days 327 of 429 (76%).** 150 outlets; the biggest is 9%. The mostly
unreadable ones with 3 or more: eurosport.es 0 of 63, sherdog.com 2 of
30, dazn.com 1 of 28, mmaweekly.com 0 of 15, sports.ndtv.com 0 of 15,
athlonsports.com 0 of 8, mmanews.com 0 of 3, and bloodyelbow.com 43 of 108
(its pages refuse; of its 62 refused articles across fighters, 48 came
through Google and 14 through its own feed, where production still ended
up asking the page). Full table
in `results.json` (`outlets.per_fighter`).

**When the doors closed** (production's own record): Sport.ua was read
until 15 Sep and has refused since 30 Sep; Sport.nv.ua last read 22 Aug;
Champion.com.ua 7 Sep, refused from 9 Sep; DAZN 8 Sep, refused from 10
Sep; Eldesmarque 4 Sep, refused from 10 Sep. Tribuna refused from its
first article (14 Aug). Donchenko's 58% leans on his September fight week,
when Sport.ua still answered: 16 of his 84 readable articles are Sport.ua's.

### The probes

Counts are readable / articles for Amosov, Donchenko, Topuria. "Re-read" is
production's reader on the article page from the laptop today. Feed
"names" is items naming Amosov / Donchenko / Topuria in today's copy.

| Outlet | A | D | T | Home | Article | Re-read | Feed | Full text | Names |
|---|---|---|---|---|---|---|---|---|---|
| ua.tribuna.com | 0/10 | 0/27 | – | 403 check | 403 check | – | **no** (all 6 addresses: 403 check) | – | – |
| sport.ua | 0/3 | 16/17 | – | 403 check | 403 check | – | yes, `/uk/rss/mma`, 20 items | **no**, median 73 | 2/3/0 |
| sport.nv.ua | 0/2 | 8/15 | – | 403 check | 403 check | – | **no** | – | – |
| bloodyelbow.com | 2/4 | – | 43/108 | 200 | 403 check | – | yes, `/feed/`, 20 | **yes**, 2,473 | 1/0/6 |
| ukr.net | 0/5 | 0/10 | – | 200 | 200 | og-description | no | – | – |
| 247sports.com | 0/4 | – | – | 200 | 406 | – | no | – | – |
| champion.com.ua | 0/1 | 6/11 | – | 200 | 200 | **read** | yes, `/rss`, 14 | **yes**, 1,210 | 0/0/0 |
| sports.yahoo.com | 2/3 | 2/2 | 103/113 | 200 | 200 | read | yes, `/rss/`, 50 (all sports) | yes, 3,112 | 0/0/0 |
| ufc.com | – | 6/6 | – | 200 | 200 | read | yes, `/rss/news`, 30 | no, 152 | 0/0/0 |
| 112.ua | – | 5/5 | – | 200 | 200 | read | yes, `/rss.xml`, 50 | no, 300 | 0/0/0 |
| mmafighting.com | 1/1 | 4/4 | 43/45 | 200 | 200 | read | yes, 10 | yes, 1,728 | 0/0/2 |
| mmajunkie.usatoday.com | 1/1 | 2/3 | 31/36 | 200 | 200 | read | no | – | – |
| sport-express.ua | 0/2 | 3/3 | – | 200 | 200 | read | yes, `/rss.xml`, 40 | no, 166 | 0/0/0 |
| xsport.ua | 2/2 | 3/3 | – | 200 | 200 | read | no | – | – |
| eurosport.es | – | – | 0/63 | 200 | 200 | no-extract | no | – | – |
| sherdog.com | 0/1 | 0/1 | 2/30 | 200 | 200 | og-description | yes, 50 | no, 128 | 0/0/2 |
| dazn.com | – | – | 1/28 | 200 | 200 | **read** | no | – | – |
| sports.ndtv.com | – | – | 0/15 | 200 | 200 | **read** | yes (announced, feedburner), 20 | no, 209 | 0/0/0 |
| eldesmarque.com | – | – | 2/5 | 200 | 200 | **read** | yes, `/rss.xml`, 30 | no, 156 | 0/0/0 |
| mmaweekly.com | – | – | 0/15 | 403 | 403 | – | yes, `/feed`, 50 | **yes**, 1,492 | 0/0/2 |
| athlonsports.com | – | – | 0/8 | 403 | 403 | – | yes, `/rss`, 50 | **yes**, 3,070 | 0/0/1 |
| mmanews.com | – | – | 0/3 | 403 | 403 | – | yes, `/feed`, 50 | no, 155 | 0/0/2 |
| sportsnaut.com | – | – | 1/3 | 200 | 200 | read | yes, `/feed`, 25 | yes, 3,420 | 0/0/0 |

Four kinds of loss, from this table:

1. **Refuses everyone, no full-text feed:** ua.tribuna.com, sport.nv.ua,
   and sport.ua's article pages. Cloudflare's check from the laptop, with a
   browser's headers. Sport.ua's MMA feed answers (the 22 Oct run saw it
   refused too; today it answered, and production's direct rail stored 12
   items from it in the window), but it carries a 73-character teaser.
2. **Refuses production, answers the laptop:** champion.com.ua, dazn.com,
   sports.ndtv.com, eldesmarque.com. Production stored `http-403` for 24 of
   DAZN's 28 and 14 of NDTV's 15; today production's own reader read each
   from the laptop. Same code, same headers, different network: production
   runs on Cloud Run, a datacenter address (inferred, not tested here; a
   September probe from Google's network, docs/checkin-log.md, found 144 of
   315 pages open against 186 from the laptop).
3. **Refuses everyone, but a full-text feed carries it:** bloodyelbow.com
   (already a direct feed), mmaweekly.com, athlonsports.com (task 1.3).
   Champion.com.ua also has one (14 items, median 1,210 characters).
4. **Answers, but the text is not in the page:** ukr.net (an aggregator:
   one line, the 22 Oct run followed it to the original), sherdog.com
   (one-line summary, teaser feed), eurosport.es (no text found).

### News we have anyway

Of each fighter's unreadable articles, how many have a readable article
about the same fighter with the same story (strictest test that matched):

| Fighter | Unreadable | Same slug | Same story (production's grouping) | Headline ≥ 60% | Same story, total | Only "nearby" | None |
|---|---|---|---|---|---|---|---|
| Amosov | 35 | 0 | 20 | 0 | **20 (57%)** | 7 | 8 |
| Donchenko | 60 | 0 | 30 | 2 | **32 (53%)** | 25 | 3 |
| Topuria | 350 | 5 | 243 | 13 | 261 (75%) | 89 | 0 |

Counted by story instead of article, the share of stories with at least
one readable article: **Amosov 9 of 19 (47%), Donchenko 28 of 44 (64%),
Topuria 389 of 465 (84%).** Tribuna's are the biggest block: for
Donchenko 13 of its 27 have a readable same-story article, the other 14
only "nearby" ones.

### The ceiling with free routes

If every article were read except those at the outlets in kind 1
(Cloudflare's check and no full-text feed: ua.tribuna.com, sport.ua,
sport.nv.ua), counting every article there as lost whether production read
it earlier or not:

| Fighter | Articles | Ceiling, articles | Ceiling, stories |
|---|---|---|---|
| Amosov | 58 | **43 (74%)** | 15 of 19 (79%) |
| Donchenko | 144 | **85 (59%)** | 27 of 44 (61%) |
| Topuria | 1,594 | 1,594 (100%) | 465 of 465 |

An upper bound: it assumes every other page is read (DAZN-type refusals
from a second network, Ukr.net followed to its original, decode failures
fixed, 247sports' 406 solved).

### Which direct feeds would add most (measure 5)

Of the 202 Amosov and Donchenko articles, 161 (80%) came through Google
News from 55 outlets production does not read as a direct feed (74
readable); 17 came through a direct feed. The outlets with 2 or more,
Amosov + Donchenko, readable / articles, and what step 3 found:

| Outlet | A | D | Readable | Feed |
|---|---|---|---|---|
| ua.tribuna.com | 10 | 27 | 0/37 | none (check) |
| sport.nv.ua | 2 | 15 | 8/17 | none (check) |
| ukr.net | 5 | 10 | 0/15 | none (aggregator) |
| champion.com.ua | 1 | 11 | 6/12 | **full text** |
| 112.ua | 0 | 5 | 5/5 | teaser |
| sport-express.ua | 2 | 3 | 3/5 | teaser |
| sports.yahoo.com | 3 | 2 | 4/5 | full text, all sports |
| 247sports.com | 4 | 0 | 0/4 | none |
| xsport.ua | 1 | 3 | 4/4 | none |
| boxingnews.com | 2 | 2 | 4/4 | not probed (5 Oct spike: full text) |
| mmajunkie.usatoday.com | 0 | 3 | 2/3 | none |
| mmasucka.com | 2 | 1 | 3/3 | not probed |
| 24tv.ua, football24.ua, glavcom.ua, sport24.ua | 2 each | | 2 each | not probed |
| 39 others | | | 27/39 | – |

The two biggest outlets have no route. Of the rest, champion.com.ua is the
one feed that would add text the pages do not already give production.

### How long a feed keeps an article listed

One read of each feed, 30 Oct about 06:05 UTC. Ages in days.

| Feed | Items | Newest | Median | Oldest | Within 1 day | Within 7 days |
|---|---|---|---|---|---|---|
| Google en "Daniil Donchenko" | 39 | 53 | 412 | 527 | 0 | 0 |
| Google uk "Данило Донченко" | 100 | 28 | 59 | 316 | 0 | 0 |
| Google en "Yaroslav Amosov" | 100 | 5.1 | 178 | 1,705 | 0 | 2 |
| Google uk "Ярослав Амосов" | 59 | 4.9 | 211 | 2,255 | 0 | 2 |
| Google en "Ilia Topuria" | 102 | 0 | 18 | 138 | 11 | 34 |
| Google es "Ilia Topuria" | 101 | 0.2 | 10 | 236 | 5 | 42 |
| ufc.com | 30 | 0.1 | 2.6 | 6.6 | 9 | 27 |
| mmafighting.com | 10 | 0.3 | 0.6 | **0.7** | 10 | 10 |
| bloodyelbow.com | 20 | 0.1 | 0.5 | **0.8** | 20 | 20 |
| sherdog.com | 50 | 0.1 | 1.4 | 3.0 | 15 | 50 |
| sport.ua (MMA) | 20 | 3.7 | 13.8 | 50.8 | 0 | 7 |
| marca.com (MMA) | 50 | 0.4 | 9.6 | 20.5 | 2 | 20 |
| mmaweekly.com (1.3) | 50 | 0.1 | 7.1 | 12.1 | 4 | 24 |
| athlonsports.com (1.3) | 50 | 0 | 0.2 | **0.3** | 50 | 50 |
| *found by the probe:* champion.com.ua | 14 | 0 | 0.3 | 0.4 | 14 | 14 |
| 112.ua | 50 | 0 | 0.1 | 0.2 | 50 | 50 |
| sport-express.ua | 40 | 0.4 | 0.8 | 1.8 | 28 | 40 |
| mmanews.com | 50 | 0.6 | 2.6 | 5.5 | 8 | 50 |
| sportsnaut.com | 25 | 0.1 | 0.5 | 0.6 | 25 | 25 |
| sports.yahoo.com | 50 | 0 | 0 | 0 | 50 | 50 |

Noise: the feeds were read twice about 10 minutes apart (the first run did
not yet count the 1- and 7-day columns); item counts and ages matched to
0.1 day. NDTV's and Eldesmarque's dates did not parse.

**Still listed today**, of the articles production found through each
Google search, by how long ago it stored them (found / still listed; a
lower bound, matched on the feed address or the headline):

| Search | 0–7 days | 7–30 days | 30–90 days |
|---|---|---|---|
| en "Yaroslav Amosov" | 5 / 4 | 3 / 2 | 13 / 7 |
| uk "Ярослав Амосов" | 3 / 3 | 15 / 7 | 27 / 6 |
| en "Daniil Donchenko" | – | – | 42 / 15 |
| uk "Данило Донченко" | – | 6 / 3 | 106 / 59 |
| en "Ilia Topuria" | 84 / 39 | 197 / 48 | 747 / 38 |
| es "Ilia Topuria" | 58 / 43 | 189 / 42 | 474 / 13 |

A Google search returns about 100 articles ordered by relevance, not date.
For a quiet fighter that reaches back months or years, and about half the
articles stay listed for over a month. For Topuria the 100 fill fast:
fewer than half of the last week's English articles are still listed.
An outlet feed is a fixed count of the newest items, so its window is how
fast it publishes: under a day for Athlon (7 hours), MMA Fighting (17
hours), Bloody Elbow (19 hours), Champion.com.ua and 112.ua; 3 days for
Sherdog; a week or more for UFC, MMAWeekly, Marca and Sport.ua.

Production's own record agrees from the other side: the longest delay
between an article's publication and production storing it is at most
1.0 day for every feed (medians 0 to 0.3 day), because production only takes items
published in the last 24 hours (`hunter.js` `HOURS_BACK`). After an outage
longer than a day, production would skip whatever the feeds still list.

## What it suggests (findings, not decisions)

The 75% floor is out of reach for Donchenko with free routes while
Tribuna, Sport.ua and Sport.nv.ua keep Cloudflare's check up: those three
carry 41% of his articles, and the ceiling is 59% of articles, 61% of
stories. For Amosov the ceiling is 74%, and reaching it means reading
everything else. About half of what is lost has a readable article about
the same story elsewhere; for Donchenko's Tribuna articles the rest is
unknown. Some of the loss is ours to fix: four outlets refuse production
but answer the laptop, which points at the network rather than the outlet,
so a second way to fetch (Jina as a fetcher, per the 22 Oct experiment, or
any non-datacenter address) would reach them. Champion.com.ua's full-text
feed is a free route worth adding beside MMAWeekly and Athlon (1.3). For
an outage: outlet feeds hold under a day for the fast publishers, so v0's
catch-up window (and production's 24 hours) is what decides what is lost,
not the feed; Google's searches keep a quiet fighter's articles for weeks.

For a future fighter the method is the five scripts: count by outlet, probe
the big ones once, re-read what answers, check feeds, and set the ceiling
from the outlets that refuse everyone.

## What it does not settle

- **The network inference.** That DAZN, NDTV, Eldesmarque and
  Champion.com.ua refuse production because of Cloud Run's address is
  inferred from one fetch per outlet from the laptop and production's
  record; not tested from Cloud Run today. The timing (four outlets started
  refusing between 9 and 10 September) could also be a change on our side;
  not checked.
- **A wider search** was run afterwards ([wider-search.md](wider-search.md)):
  28 web searches in three languages found 29 hosts production has never
  recorded, 15 probed. Counting every page in the window as readable moves
  Amosov to 42% and Donchenko to 60%, and none of those pages carries a
  story production lacks; the ceiling above stands. Only agentmma.com adds a
  readable route (plain pages that read, a teaser feed).
- **Paid or account routes** (a Jina key, a headless browser, a residential
  proxy) were not tried; whether any passes Tribuna's check is open.
- **The sample is thin** for Donchenko in the last 30 days (6 articles) and
  Amosov overall (58, 19 stories). One probe per outlet; Cloudflare's
  behaviour can change by the hour (Sport.ua's feed answered today and not
  on 22 Oct).
- **"Same story"** leans on production's story grouping, which a model
  decides; a story there is an event (a fight), so a "same story" article
  may not carry the same facts. The slug and headline tests found almost
  nothing beyond it.
- **Feed retention** is one snapshot: a feed's window moves with how much
  is published that day. The Google "still listed" match is a lower bound
  (Google's addresses and headlines can change).
- **Readable** here is production's stored text, not v0's reader; the
  ceiling is the more useful number for v0.

Cost: $0 (no model calls, no Jina). Headlines, addresses, the re-read
texts and the feeds' items stay in the git-ignored `data/`
(docs/decisions.md#article-text-out-of-git); the tracked `results.json`
holds ids, hosts, counts and status codes.
