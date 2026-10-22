# The "seen" rule on production's addresses — 2026-10-22

Self-feeding architecture, spec unknown E5 and requirements S1–S3. Run 22
October 2026 from the laptop, read-only through the `v0_feed` role.

**Question.** v0 will decide whether it has seen an article by three keys:
the feed link exactly as given, the real address, and the slug (the page's
own name in the address, with the protocol, host, any `amp/` part, the
trailing slash and the query dropped). Does the slug catch the copies
production missed, does it ever merge two different articles, and does any
outlet keep an article's identity after the `?` (E5)?

**Set.** Every article production stored: 2,223 rows, 102 of them still a
wrapped Google link (no real address, so no slug).

**Method.** `pull.mjs` copies production's addresses and headlines into the
git-ignored `data/`; `slugs.mjs` groups the rows by each key and counts the
repeats. A group whose headlines share under half their words is counted
as a false merge.

**Result.**

| Key | Articles it would have called seen | Groups | Spanning several hosts | False merges |
|---|---|---|---|---|
| Feed link | 0 (production already refuses a stored one) | 0 | 0 | 0 |
| Real address | 162 | 154 | 0 | 0 |
| **Slug** | **223** | 208 | 7 | **0** |
| Any of the three | 223 | | | |

All eleven known pairs from the spec (S1–S3: a trailing slash, http and
https, `amp/` in the path, `amp.` and `jp.` hosts, ESPN Argentina and Peru,
two papers of one chain, and the three same-run pairs) share a slug.

**E5: yes, two outlets keep the article in the query.**
`agencianova.com/nota.asp?n=…&id=172435&…` and
`enews.com.ua/?page=news&slug=…`. Dropping the whole query would turn every
article of those outlets into the slug `nota.asp` or an empty one, merging
them all. So the rule keeps the query when the path names no page (it is
empty, or its last part is a script: `.asp`, `.aspx`, `.php`, `.jsp`,
`.cgi`), with tracking keys (`utm_*`, `ref`, `si`, `fbclid`, `format`, …)
removed and the rest sorted. Elsewhere the query is dropped:
`?utm_source=rss`, `?ref=…`, `?format=embed`, `?si=…` carry no identity.

What that refinement costs: agencianova listed one article six days running
with only a date (`n=2026_9_10`, `…_11`, …) changed, and those six stay six.
Grouping (station 6) is what catches a repeat of that kind.

**What it does not settle.** The slug is compared across hosts. Four slugs
are under 12 characters (three YouTube ids, one bare number), short enough
that two unrelated sites could share one; none did here. 102 rows had no
real address, so their copies are invisible to this count.

Cost: $0. No article text is read or kept; headlines stay in `data/`.
