# Wider search: who else carries Amosov and Donchenko — 2026-10-30

Extends the [source review](README.md), which left one item open: "only
Google News results and production's direct feeds were counted, so outlets
Google never surfaced are missing" (spec unknown E4). Run 30 October 2026
(UTC) from the laptop.

**Question.** Beyond Google News and production's feeds, which outlets carry
Amosov and Donchenko in the last 90 days (31 Jul to 30 Oct 2026), and can
any of them be read for free? The review found that Tribuna, Sport.ua and
Sport.nv.ua refuse every plain fetch and publish no full-text feed. Does a
different Ukrainian or international outlet cover these two and answer?

## Method

1. **Search.** 28 web searches (the `WebSearch` tool, standard mode, US
   index, relevance order, no date filter) in English, Ukrainian and Russian,
   spellings from `watchlist.js` (Amosov, Donchenko, Амосов, Донченк- forms;
   "Yaroslav"/"Daniil" and the Ukrainian "Ярослав"/"Данило" and Russian
   "Даниил" first names). Phrasings: name + UFC, + "бій"/"бой", + "новини",
   + the Paris fight (Soriano) and the callout (Rodriguez), + the reported
   Garry booking and UFC 335, + both fighters together, + "preview
   prediction picks". Every news address on the result lists was kept (24 of the 28 searches
   are in the saved list; the other four returned only addresses already on
   it or card-wide event pages). Profile and statistics pages (Rotowire, ESPN fighter pages,
   Sofascore, Wikipedia and similar, 23 pairs) were dropped; **117
   fighter-and-address pairs of news pages remained** (Amosov 66, Donchenko
   51; a page is counted once per fighter). The search tool's own summary
   text was not used.
2. **Candidates.** The host of each address, compared with every host in
   production's record (`data/items.json`, all three fighters, 2,341
   articles) plus production's direct feed hosts. **52 of the 117 pairs
   (44%) sit at 29 hosts production has never recorded** (Amosov 36 of 66,
   Donchenko 16 of 51). The 15 most frequent are the candidates (ties at one
   address broken toward the ones with a September article).
3. **Probe.** Same rules as the review's `probe.mjs`: browser headers, 10 s,
   no retries, one second between requests. For each candidate: up to three
   of its article addresses from the search (the first is "the" page status;
   the others give a second and third date), production's own reader
   (`lib/extract.js`) on each page that answered, with the review's bar (a
   reading rung, 400 characters or more, naming the article's fighter by
   `watchlist.js` matchNames), then the homepage and a feed (what the
   homepage announces, then `/rss`, `/feed`, `/rss.xml`, `/feed.xml`,
   `/news/rss`). A feed's "full text" is a median of 800 characters or more.
4. **Window.** An address counts as in the 90 days when the fetched page
   declares a date on or after 31 Jul, or the address carries it. Pages never
   fetched are placed by the event in their address (UFC 328 in May, the
   December debut, the Baku fight in June are all before the window).

Outside requests: 28 searches, 95 by the probe script, 9 by hand (3 agentmma
dates, 6 to look at what Sport24, Suspilne and RFE/RL answered). At most 10 to any
one host (the review capped at 8).

## Results

"Found" is distinct news addresses in the search, Amosov / Donchenko, with
the number dated inside the 90 days in brackets. Article page is the status
of the first address. "Readable" counts pages that passed the bar out of
those the reader was run on. "Feed" is the address, items and median text
characters; no feed named either fighter in today's copy (all 0 / 0).

| Outlet | Language | Found A / D (in 90 days) | Article page | Readable | Feed | Full text |
|---|---|---|---|---|---|---|
| agentmma.com | en (pages in 6 languages) | 4 / 7 (2 / 2) | 200 | yes, 3 of 3 | `/articles/feed.xml`, 75 | no, 266 |
| sport24.ru | ru | 3 / 1 (0 / 0) | **401** (Qrator script check, not Cloudflare); home 401 | no, not reached | `/rss`, 19, all sports | **yes**, 1,618 |
| rferl.org | en | 3 / 0 (0 / 0) | 200 | yes, 2 of 3 (AMP copy: no-extract) | `/api/`, 20, whole site | no, 275 |
| kyivpost.com | en, uk | 3 / 0 (0 / 0) | 200 | yes, 3 of 3 | `/feed`, 100 | no, 329 |
| fakty.com.ua | uk, ru | 3 / 0 (0 / 0) | 200 | yes, 3 of 3 | `/rss`, 20 | **yes**, 1,827 |
| ukrinform.ua | uk | 2 / 0 (0 / 0) | 200 | yes, 2 of 2 | none (5 paths: 404) | – |
| suspilne.media | uk | 2 / 0 (0 / 0) | **403** (Cloudflare block page); home 403 | no | none (all 403) | – |
| tsn.ua | uk | 0 / 1 (0 / 1) | 200 | yes, 1 of 1 | `/rss`, 235 | no, 123 |
| fightful.com | en | 0 / 1 (0 / 1) | 200 | **no**, 440 characters, does not name him | `/feed/`, 10 | **yes**, 1,403 |
| info.fr | fr | 0 / 1 (0 / 0) | 200 | yes, 1 of 1 | `/feed/`, 50 | no, 173 |
| english.nv.ua | en | 1 / 0 (0 / date unknown) | **403** Cloudflare check; home 403 | no | none (`/rss` 200 but not a feed; `/feed` 403) | – |
| sportsbettingdime.com | en | 0 / 1 (0 / 1) | 200 | yes, 1 of 1 | `/rss`, 20 | **yes**, 5,227 |
| docsports.com | en | 0 / 1 (0 / 1) | 200 | yes, 1 of 1 | none (5 paths: 404) | – |
| blog.youwager.lv | en | 0 / 1 (0 / 1) | 200 | yes, 1 of 1 | `/feed/`, 10 | **yes**, 57,110 |
| kyivindependent.com | en | 1 / 0 (0 / 0) | 200 | yes, 1 of 1 | `/news-archive/rss/`, 15 | no, 203 |

Not probed (past the cap of 15, one Amosov address each, none dated inside
the window): rubryka.com, bjjee.com, newsukraine.rbc.ua, mmainsight.com,
fight.tv, mmatown.com, rte.ie, nst.com.my, themaclife.com, glavred.net,
sportmail.ru, nur.kz, razomua.media, kungfukingdom.com. Production's own
big three came up again in the search, as production's hosts: Sport.ua 2 / 8
addresses, Tribuna 5 / 0.

What the table shows:

- **12 of the 15 answer a plain fetch and 11 read to the bar.** The three
  that refuse: Suspilne and English.nv.ua (Cloudflare) and Sport24 (Qrator's
  script check, 401). Fightful's page answers and reads, but its text did not
  name Donchenko.
- **Almost nothing is inside the window.** Of the 15, only agentmma.com
  (Amosov 2, Donchenko 2), tsn.ua, fightful.com, sportsbettingdime.com,
  docsports.com and blog.youwager.lv (one Donchenko page each) have an
  address dated after 30 Jul: **2 for Amosov, 7 for Donchenko.** Amosov's
  other candidate pages are about the December debut, the May fight and
  profile pieces; the dates read from them run from 2020 to 10 May 2026.
  Agentmma's Donchenko page for the Paris booking is dated 30 Jul, a day
  outside.
- **Agentmma is the one new source with a real route:** plain pages that
  read (json-ld, 741 to 1,928 characters), a site-wide feed of 75 items, but
  a teaser feed (median 266). Its two Amosov pages in the window are the
  Garry-at-UFC-335 booking (one dated 22 Oct, the other a neighbouring
  article number); production has five items naming Garry published 24 and
  25 Oct, from other hosts (a sixth, 14 Sep, may be another story).
- **Full-text feeds exist but carry nothing about the two fighters now:**
  Sport24 (all sports, 19 items), Fakty, Fightful (10 items), Sportsbettingdime,
  Youwager. A feed lists only its newest items, so this is also a measure of
  how fast they publish, not of how much they cover.

## What it adds to the review's ceiling

No candidate raises either share by more than two points (Amosov +2, Donchenko +1.3). Counting every
in-window candidate page as an article production lacks and as readable
(except Fightful's): Amosov 23 of 58 (40%) becomes 25 of 60 (42%), and
Donchenko 84 of 144 (58%) becomes 90 of 151 (60%), against v0's 75% floor.
That is an upper bound and a story-for-story swap, because the Garry booking
(and the Rodriguez callout: production has 8 Donchenko titles naming
Rodriguez) are stories production already holds from other hosts, so the share of stories with a readable article does not move. The
search also found no other Ukrainian-language outlet with volume for
Donchenko: Sport.ua and Tribuna still dominate the Ukrainian addresses, and
the one new Ukrainian host with a September article (tsn.ua, a feed of
123-character teasers) offers one. The ceiling in the review (Amosov 74%,
Donchenko 59%, set by the three refusing outlets) stands.

## What it does not settle

- **A web search is not production's feed.** It returned what a search index
  ranks highest for these queries (US index, no date filter), not everything
  published; an outlet that exists but ranks low would not show here.
  Counts come from one session of 28 searches and are not repeatable to the
  address.
- **The 90-day split is partly inferred.** Dates were read from the 15
  candidate pages (and 3 more agentmma pages) that were fetched; other
  addresses were placed by the event in their address. Addresses at hosts
  production already has were not dated or counted for the 90 days.
- **The candidate cap.** 15 of 29 new hosts were probed, most frequent
  first; the other 14 had one old Amosov address each.
- **Single probes.** One request per page and per feed address; Cloudflare
  and Qrator can answer differently by the hour and from another address
  (the review's network inference applies: these were fetched from the
  laptop, not from Cloud Run). Whether Sport24's feed has a MMA-only version
  was not looked for.
- **"Readable"** is production's reader on the page now, with the bar
  applied to the pages' own fighter; not v0's reader, and not the text
  production stored.

Cost: $0 (no model calls). Headlines, page texts and feed items stay in
`data/wider-search/` (git-ignored); this note holds hosts, counts and status
codes. The scripts there (`analyse.mjs`, `wider-probe.mjs`, `summarise.mjs`)
are one-offs; move them to the experiment folder if the search is repeated.
