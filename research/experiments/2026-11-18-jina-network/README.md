# Does the free reader reach the outlets that refuse Google's network? — 2026-11-18

Self-feeding architecture, the case for Jina's keyless reader as a second
network (Launch Map 3.8; the source review, 2026-10-30, and the 22 Oct
reading-order experiment). Informs how far below the measured ceilings
(Donchenko 59%, Amosov 74% readable) v0 will actually land. Run 18
November 2026 (UTC evening) from the laptop, on top of the source review's
branch.

**Question.** The source review found four outlets (DAZN, NDTV,
Eldesmarque and Champion.com.ua) that production stored as `http-403`
but that answered the laptop with the same reader and headers, which
points at Cloud Run's address, not the outlet (inferred). Untested: does
keyless Jina, a second network, actually return those outlets' articles?

## Set

- **Up to 12 addresses per outlet** from production's record (read-only,
  `v0_feed` role, a session that refuses writes): the newest the real
  address of which is at that outlet, the ones production failed to read
  first. 43 in all: DAZN 12, NDTV 12, Champion.com.ua 12, Eldesmarque 7
  (the only 7 production holds). 37 of the 43 are unread in production
  (all `http-403`); the 6 production did read are 4 Champion.com.ua and 2
  Eldesmarque (read before 10 Sep). Newest 17 Nov; 24 are from November.
  Fighters: DAZN, NDTV and 7 Eldesmarque are Topuria; Champion.com.ua is
  Donchenko 9, Amosov 3 (the review's table has fewer; production has
  stored more since).
- **Usable** is the 22 Oct experiment's bar: our extractor reads a reading
  rung (JSON-LD, `<article>` or paragraphs) of at least 400 characters
  naming the article's fighter, or Readability does; and, added here, the
  page is not a block page. The 22 Oct scripts check length and name only;
  the headline check is this experiment's own, and is reported
  separately: at least half of the stored headline's words of four
  letters or more appear in the page's title, headings or first 3,000
  characters of the extracted text.

## Method

1. `select.mjs` picks the addresses (ids, outlets and the production
   verdict are all that is tracked; addresses and headlines stay in
   `data/`).
2. `fetch-jina.mjs` asks `https://r.jina.ai/<address>` once per address,
   keyless, with `X-Respond-With: html` (the page's HTML, the mode the
   architecture names), `X-Timeout: 20` and `DNT: 1`, as
   `../2026-10-22-reading-order/jina-html.mjs` does. One request at a
   time, 3.2 seconds between the end of one call and the start of the
   next, with a stop at the first rate-limit sign (a 429, a `Retry-After`
   header, an exhausted `X-RateLimit-Remaining`, or the wording on an error
   response). The page is saved and read by our extractor and by
   Readability. The run's first scoring only recognised Cloudflare's
   wording as a block page; DAZN's two other block pages were added to the
   list, and the run was scored again from the same saved pages
   (`node fetch-jina.mjs --rescore`), with no further request.

43 requests to r.jina.ai, plus 4 plain page reads from jina.ai (its
Reader, legal and terms addresses, and r.jina.ai's own front page) for
the limits below. Cost: $0, no key,
no model call.

## Results

| Outlet | Requests | HTTP status | What came back | Usable | Also matching the headline | Rate limit |
|---|---|---|---|---|---|---|
| dazn.com | 12 | 200 x 12 | a "disable your VPN to continue" page 10, a CloudFront "request blocked" 403 page 2 | **0 of 12** | 0 | none |
| sports.ndtv.com | 12 | 200 x 12 | the article (JSON-LD, 2,400 to 3,800 characters) | **12 of 12** | 12 | none |
| eldesmarque.com | 7 | 200 x 7 | the article (JSON-LD, 790 to 2,400 characters) | **7 of 7** | 7 | none |
| champion.com.ua | 12 | 200 x 12 | Cloudflare's "you have been blocked" page 12 | **0 of 12** | 0 | none |

The HTTP status is 200 on all 43, including every block page: Jina reports
that it fetched something, not that the outlet let it in, so only the page
tells. Jina's replies carried `x-ratelimit-limit: 20, 20;w=60` and
`x-ratelimit-remaining: 19` on every call at this pace (no `Retry-After`,
no 429), so no rate limiting was met in 43 requests over about 3 minutes (about 15
a minute).
Median time per call: NDTV 1.3 s, Eldesmarque 1.2 s, DAZN 0.2 s,
Champion.com.ua 0.2 s (the block pages come back fast).

So Jina does serve as a second network for two of the four outlets
(NDTV, Eldesmarque: 19 of 19 usable, including all 17 of those production
failed to read), and does not for the other two: DAZN and Champion.com.ua
turn Jina's address away too (DAZN as a VPN or datacenter address,
Champion.com.ua at Cloudflare).

### What it means for the ceilings

NDTV, Eldesmarque and DAZN are Topuria outlets in the record, so
reaching them moves nothing for Amosov or Donchenko. Of the four, only
Champion.com.ua carries them: 11 of Donchenko's 144 articles and 1 of
Amosov's 58 in the source review's record, all counted as readable in its
ceilings. If none of those are read, the ceilings fall by that much:
Donchenko from 85 of 144 (59%) to 74 (51%), Amosov from 43 of 58 (74%) to
42 (72%). That is arithmetic on the review's table and an upper bound on
the loss: Champion.com.ua's free full-text feed (14 items, median 1,210
characters, the review) would still carry its new articles, and
production read 6 of the 11, the last on 7 Sep, before the outlet
refused it.

### Jina's stated limits and terms (read 18 Nov 2026)

From `https://jina.ai/reader/`: the Reader at `r.jina.ai` is **20 requests
a minute without an API key**, 500 a minute with a free key (the same
table says 500 with a paid key and 5,000 with a premium one). "Rate limits
are tracked in two ways: RPM (requests per minute) and TPM (tokens per
minute). Limits are enforced per IP or API key and trigger as soon as
either the RPM or the TPM threshold is reached." The page says the Reader
API "is available for free and offers flexible rate limit and pricing"; the
`DNT: 1` header "prevent[s] this request from being cached or logged on
our servers". `https://jina.ai/legal/` (modified 4 May 2026) has the terms
and conditions, which do not mention keyless use separately, and says Jina
AI GmbH was acquired by Elastic N.V. in October 2025. The TPM figure for
keyless use is not stated on the page. The limit is per IP: from Cloud
Run, whose outgoing addresses are shared, the allowance could be used by
other callers on the same address (a guess, not tested).

## What it suggests (findings, not decisions)

Keyless Jina is a real second network for NDTV and Eldesmarque and no help
at DAZN or Champion.com.ua, so "a second network reaches the four" does
not hold as stated; for the two quiet fighters the only outlet of the
four, Champion.com.ua, stays out of Jina's reach. The architecture's
"Jina's second network should reach them" is half confirmed.

## What it does not settle

- **Cloud Run.** How Jina treats a call from Cloud Run, or how the outlets
  treat Jina from there, was not tested: this ran from the laptop, and the
  only thing that reached the outlets was Jina's own address. The same
  holds for the claim that Cloud Run's address is why production is
  refused: the four refusals are still inferred, now with two of the four
  shown not to be solved by a different address.
- **A small sample.** 12 or fewer per outlet, one request each, at one
  time of day. Outlets' defences change by the hour (the source review saw
  Sport.ua's feed answer on one day and not the next); a DAZN or
  Champion.com.ua page could pass on another day or from another Jina
  server. Not repeated.
- **Rate limits beyond 43 requests.** At about 15 requests a minute the
  limit never showed. The architecture's budget (about ten pages a day)
  is far below that, but a burst after an outage, or other callers on the
  same address, were not tried.
- **Readers.** Only our extractor and Readability read Jina's HTML;
  Jina's own text mode was not asked for. NDTV's and Eldesmarque's pages
  all read through JSON-LD; the headline test is this experiment's own
  and not the 22 Oct bar.
- **The fighters.** The usable pages are Topuria articles; none was an
  Amosov or Donchenko article, so what they show about those two is only
  through the outlets.

Cost: $0 (Jina keyless, no model calls). The returned pages and the target
list (addresses, headlines) stay in the git-ignored `data/` of the main
checkout (docs/decisions.md#article-text-out-of-git); `results.json`
holds ids, outlets, status codes and yes/no verdicts.
