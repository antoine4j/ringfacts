# Do refused pages relent a week later? — 2026-10-30

Self-feeding architecture, spec unknown E7 (what the first weeks of fetch
attempts say about retry), informing two settings that today hold guessed
values: `retry_refused` (is a page that answered 403, 404, 406 or 451 ever
asked again; starting value "off, a guess") and `fetch_retries` (how many
later tries for a timeout, a 5xx or a connection failure; "3, a guess").
Run 29 October 2026 (30 October in UTC) from the laptop.

**Question.** If every page that failed on 20 or 22 October is fetched again
7 to 9 days later, how many answer this time, and are the ones that answer
worth reading? If refused pages stay refused, "off" is confirmed; if a
share relents, a retry is worth building.

## Sets

- **Failed on 20 October** (clean-text experiment, the 300 golden pages):
  66 pages. 55 refused (403), 7 gone (404), 3 rate-limited (429), 1 failed
  to connect.
- **Failed on 22 October** (reading-order experiment, 174 fresh pages):
  47 pages. 43 refused (403), 2 with 406, 1 with 400, 1 failed to connect.
- Together 113 failed rows, **109 distinct pages**: 4 pages failed on both
  dates, so they count twice in the combined table (once per date) and are
  fetched once. 14 ids were in both runs; the other 10 came back both times,
  so no page failed on one date and succeeded on the other.
- **Control:** 20 pages that came back on 22 October, a fixed seeded pick
  (the reading-order sample's `seeded` function over the ids, first 20),
  to see whether any now refuse.

No page was in a timeout or 5xx state on either date; those two failure
kinds from the settings' definition did not occur in either earlier run
(and not today: 0 timeouts in 129 requests).

## Method

1. `targets.mjs` builds the lists from the two earlier fetch records.
   Addresses are the ones those runs recorded (Google's wrapped links were
   decoded then); nothing is decoded again.
2. `fetch.mjs` fetches each distinct page once, the earlier runs' way:
   browser-like headers, redirects followed, 10-second limit (the
   reading-order run's; the clean-text run allowed 25), no retry, two
   requests in flight, 250 ms pause between a worker's requests. 129 requests in 31
   seconds. A response counts as Cloudflare's bot check if its body contains
   "Just a moment" or "cf-browser-verification", or its `cf-mitigated`
   header says "challenge".
3. `read.mjs` runs our extractor (`lib/extract.js`) on every page that came
   back. **Readable** is v0's bar (R2, D32): at least 400 characters that
   name the article's fighter, by `mentionsName` with the fighter's
   `matchNames` from `watchlist.js` (surname stems in both scripts), the same
   as the reading-order run.
4. `count.mjs` writes `results.json` (ids, hosts, status codes and counts
   only) and the tables below. Jina's verdicts are read from the
   reading-order record (`jina-record.json`, and the golden record for 20
   October): a page was "Jina-readable" then if Jina returned text of at
   least 400 characters naming the fighter. No Jina call and no model call
   was made today.

Outcome words, by the page's original failure: **same failure** (the same
status or error again), **different failure** (another one), **unreadable**
(came back, our extractor's text fails the bar), **readable**.

## Results

**Combined (113 failed rows; 109 distinct pages):**

| Original failure | Rows | Same failure | Different failure | Came back, unreadable | Came back, readable |
|---|---|---|---|---|---|
| 403 refused | 98 | 97 | 0 | 0 | **1** |
| 404 gone | 7 | 7 | 0 | 0 | 0 |
| 429 rate-limited | 3 | 3 | 0 | 0 | 0 |
| 406 | 2 | 2 | 0 | 0 | 0 |
| 400 | 1 | 1 | 0 | 0 | 0 |
| connect | 2 | 1 | 0 | 0 | **1** |
| timeout | 0 | - | - | - | - |
| **All** | **113** | **111** | **0** | **0** | **2** |

**By source date:**

| Failed on 20 October | Rows | Same failure | Different failure | Unreadable | Readable |
|---|---|---|---|---|---|
| 403 | 55 | 55 | 0 | 0 | 0 |
| 404 | 7 | 7 | 0 | 0 | 0 |
| 429 | 3 | 3 | 0 | 0 | 0 |
| connect | 1 | 0 | 0 | 0 | 1 |
| **All** | **66** | **65** | **0** | **0** | **1** |

| Failed on 22 October | Rows | Same failure | Different failure | Unreadable | Readable |
|---|---|---|---|---|---|
| 403 | 43 | 42 | 0 | 0 | 1 |
| 406 | 2 | 2 | 0 | 0 | 0 |
| 400 | 1 | 1 | 0 | 0 | 0 |
| connect | 1 | 1 | 0 | 0 | 0 |
| **All** | **47** | **46** | **0** | **0** | **1** |

**Two pages relented, both readable on the first try: 2 of 113 rows (1.8%).**
One 403 (as.com, 22 October) and one connection failure (duflu.org.ua,
20 October). Of the 98 refusals, 1 relented (1.0%). The 7 gone pages
(Yahoo Sports 6, Boxing News 1), the 3 rate-limited pages and the 3
refusals with other codes stayed as they were. No page changed from one
failure to another.

**Why the refusals persist.** Of today's 94 distinct 403 answers, 90 are
Cloudflare's bot check (body or header). The 4 that are not are all
fashionnetwork.com editions (uk, us, ww, es); the us edition was a control page.

**By outlet host** (hosts with 2 or more failed rows, then the rest as a
group; "came back earlier" is how many distinct pages of that host came
back in the two earlier runs):

| Host | Failed rows | Came back today | Came back earlier |
|---|---|---|---|
| bloodyelbow.com | 36 | 0 | 0 |
| sport.ua | 30 | 0 | 0 |
| ua.tribuna.com | 15 | 0 | 0 |
| sport.nv.ua | 10 | 0 | 0 |
| sports.yahoo.com (404) | 6 | 0 | 28 |
| 247sports.com (406) | 2 | 0 | 1 |
| as.com | 1 | **1** | 2 |
| duflu.org.ua | 1 | **1** | 0 |
| 12 other hosts, 1 row each (three fashionnetwork editions, the three local-news
sites that answered 429, boxingnews.com (404), enews.com.ua, facebook.com,
sportarena.ua, and others) | 12 | 0 | - |

The four hosts that account for 91 of the 113 rows (Bloody Elbow, Sport.ua,
Tribuna, NV Sport) have never answered us in either run (0 pages came back
earlier) and still do not: 91 of 91 stayed refused. The 404s are
article-level, not host-level: Yahoo Sports answered 28 other pages.

**The remaining connection failure** (enews.com.ua, 22 October) is a TLS
certificate that does not match the host name (`ERR_TLS_CERT_ALTNAME_INVALID`),
a fault on the site's side that a retry cannot fix. The one that relented
(duflu.org.ua) did not record its cause on 20 October.

**Against Jina (22 October refusals).** Of the 47 pages that failed on 22
October, Jina (keyless, called the same week) reached 20 and its text passed
the readable bar for 17. The one 22 October page that relents today (as.com)
was already Jina-readable then. The 20 October connection failure that
relents was also Jina-readable on the golden run. So **the gain of a retry
over Jina, for these 109 pages, is 0 pages**: both pages that relent were
reachable through Jina already. (For the 20 October set, Jina reached 43 of
66 and 37 passed the bar.)

**Control (20 pages that came back on 22 October).** 19 came back again
and their verdicts under our extractor match 22 October's (16 readable then
and now, 3 unreadable then and now: eurosport.es and two ukr.net items). **1 now refuses**: a
us.fashionnetwork.com page, 200 on 22 October and 403 today. On 22 October
the other three fashionnetwork pages had already refused, so that outlet
was mixed then and is refused throughout today.

## What it suggests (findings, not decisions)

- `retry_refused`: **off is confirmed** for 403, 404, 406 and 400. Over 7 to 9
  days 1 of 98 refusals relented, and the one that did was already
  readable through Jina. A retry costs one request per refused page for a
  yield near 1%, and the four big refusing outlets (91 rows) did not move
  at all. The 429 rate-limit pages (3 rows, three local-news sites) also
  stayed; three is too few to say more.
- `fetch_retries`: **the data is too thin to set a number.** There were 2
  connection failures, no timeouts and no 5xx in either run. One relented
  after 9 days; the other is a certificate fault that never will. What it
  supports: a connection failure is the one kind where a later try paid
  (1 of 2), and a TLS name mismatch should not be retried. The kept "3" is
  still a guess. The first weeks of attempt rows (E7) will say more.
- A 403 may be a mood for a few outlets: 1 of 20 control pages flipped to
  refused (fashionnetwork), and 1 refusal flipped to readable (as.com, a
  host that had answered 2 other pages). Both are single events; neither
  changes the picture for the Cloudflare-fronted outlets.

## What it does not settle

- **One gap.** 7 days (22 October) and 9 days (20 October), one try each.
  An outlet that lifts a block after a month, or whose rule resets at
  midnight, would not show here. A same-day or same-hour retry was not
  tested at all, so the within-run `fetch_retries` question (a try after
  seconds or minutes, for a timeout) is untested here; there were no
  timeouts or 5xx to test it on.
- **One client.** The laptop's home network and a browser's headers. Cloud
  Run's addresses may be treated differently by the same outlets, in
  either direction (inferred, not measured).
- **Small counts at the edges.** 2 connection failures, 3 rate-limited, 3
  other codes, 1 flipped control. The 1% relent rate for 403s is 1 page; a
  rate of a few percent cannot be ruled out.
- **Readable means our extractor and the 400-character name bar**, not that
  the text is the article; the read of the 2 relented pages was not
  spot-checked by hand.
- The fashionnetwork 403s are not Cloudflare's check; why they refuse was
  not investigated.

Cost: $0 (no Jina call, no model call). The pages and the fetch and read
records stay in the git-ignored `data/` (docs/decisions.md#article-text-out-of-git).
The record is `results.json`.
