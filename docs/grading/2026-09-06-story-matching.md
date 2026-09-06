# Story matching, options B and D measured

Measured 2026-09-06 on a local branch, no deploy, no production writes, no
posts. Companion to [2026-09-05-story-gate.md](2026-09-05-story-gate.md)
(option A) and [story-matching-options.md](../story-matching-options.md).
Same archive: the 674 labelled articles (the `feedback` table, current label
per article: user > claude > sonnet > haiku; 612 of the labels are Anton's),
341 story members, 333 first arrivals. Scoring is the cascade replay
(`labels/story-gate.js` → `simulate`): earlier articles sit where the rule
itself put them, so a wrong join becomes an anchor for the next one.

Columns: **held** = repeats not posted again (caught in the right story +
misplaced in another); **missed** = a repeat posted again; **useful
swallowed** = a genuinely new bucket-1/2 story held as a repeat, the real
cost; **junk swallowed** = a new bucket-3 item held, harmless.

## B — bodies before the hold

What it needed: bodies for the 315 articles that have none. Fetched
read-only with the live decoder and extractor (`labels/fetch-bodies.js`):

| outcome | articles |
|---|---|
| body extracted | **167 (53%)** |
| HTTP 403 (the site blocks our fetcher) | 127 |
| page had no extractable text | 19 |
| other (404, 406) | 2 |

So the ceiling of B in production is about half of the headline-only
holds; the sites that answer 403 to the hourly job answered 403 here too.

All 674 articles were then re-embedded on headline + the first 1500
characters of the body (450 with a body, 224 headline-only as today), TEST
Gemini key, ~171k tokens, free tier (a few per-minute waits, no daily cap
hit). `labels/embed-bodies.js`, replayed with
`node labels/measure-story-gate.js --vectors tmp/labels/vectors-body.json`.

What the body does to the distances (median similarity):

| similarity of… | headline only | headline + body |
|---|---|---|
| a true member to its story root | 0.817 | 0.853 |
| a true member to its nearest earlier member | 0.893 | 0.911 |
| a new story to its nearest earlier item | 0.718 | 0.760 |
| a new story that looks like an old one, to that story's root | 0.825 | 0.830 |

**Everything moves closer together.** Repeats look more alike, and so do
new stories about the same topic. The body helps the gate see repeats and
hurts it on connected stories in equal measure.

| vectors / rule | held | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|
| headline: today (posted anchors ≥ 0.80) | 173 | 106 | 67 | 168 | 7 | 4 |
| headline: all anchors ≥ 0.85 (option A) | 247 | 97 | 150 | 94 | 5 | 25 |
| headline: all anchors ≥ 0.88 | 174 | 62 | 112 | 167 | 1 | 20 |
| body: today's rule (posted anchors ≥ 0.80) | 224 | 120 | 104 | 117 | **13** | 21 |
| body: posted anchors ≥ 0.85 | 139 | 96 | 43 | 202 | 8 | 6 |
| body: all anchors ≥ 0.85 | 286 | 113 | 173 | 55 | **13** | 35 |
| body: all anchors ≥ 0.88 | 235 | 100 | 135 | 106 | 5 | 22 |
| body: all anchors ≥ 0.90 | 192 | 53 | 139 | 149 | 3 | 12 |

**Reading:** with bodies, today's rule holds 51 more repeats but swallows
nearly twice as many useful new stories (13 vs 7). Raising the bar to
0.88 on all anchors lands at 235 held / 106 missed / 5 swallowed, which
is the same trade as option A on headlines (247 / 94 / 5). **B by itself
does not move the threshold gate**; the ceiling is the number deciding,
not the text it sees. B's value is elsewhere: it gives the LLM step real
text for the 167 articles it could not read before, which is what D's
second run below measures.

## D — stories as objects, Haiku decides

`labels/measure-stories-llm.js`. Per subject, in arrival order: the stories
D has built so far (root article, one-line fact, members, reacts-to) are
ranked by embedding similarity to the arriving article; the top three of
the last 7 days go to Haiku 4.5 with the headline, source, date and the
first 1200 characters of the body when there is one. One forced tool call
answers join / new / reaction, and writes the fact line for a new story.
Stories are D's own, so a wrong join is an anchor for the next article,
exactly like the live bot. Two runs: headline only (the text today's early
hold sees) and with the bodies from B.

| rule | held | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|
| today: posted anchors ≥ 0.80, headline | 173 | 106 | 67 | 168 | 7 | 4 |
| A: all anchors ≥ 0.85, headline | 247 | 97 | 150 | 94 | 5 | 25 |
| B: all anchors ≥ 0.88, headline + body | 235 | 100 | 135 | 106 | 5 | 22 |
| **D, headline only** | **284** | **211** | 73 | **57** | 10 | 47 |
| **D, headline + body** | **307** | **244** | 63 | **34** | 10 | 62 |
| D, headline + body, Anton's 612 rows only | 279 of 304 | 223 | 56 | 25 | 9 | 56 |

Reactions D opened as connected stories: 33 (headline), 32 (body).

**What the numbers say**

- **D holds far more repeats and puts them in the right story.** With
  bodies it misses 34 of 341 repeats where today's rule misses 168 and
  option A 94. Correct placement goes from 97 (A) to 244: two and a half
  times as many stories kept whole, which is what the review sheets and
  any future "3 more sources" line depend on.
- **The cost side is 10 useful stories swallowed against 5 for A and 7
  today.** Nine of the ten are Anton's own labels, so this is a real
  disagreement, not me grading myself. The list is below; most are the
  "same topic, different piece" line: fight-week previews folded into the
  odds story (#490, #594, #598), a trainer's second interview folded into
  his first (#100, #135), Makhachev's praise folded into his coach's worry
  (#121, headline run). Two are D applying the "one interview is one
  story" rule where Anton kept the piece as its own post (#208, #300).
- **Bodies help D more than they help the gate**: 23 more repeats held,
  33 more placed correctly, the same 10 swallowed. B is worth building
  as D's input, not on its own.
- **The shortlist is the weak joint.** For 65 of 341 repeats the true
  story was not among the three offered (81% recall). When that happens
  Haiku joins a wrong story three times out of four; those 49 cases are
  most of the 63 misplaced. Offering five stories instead of three costs
  roughly 150 more input tokens per call and is the first knob to try.
- **Cost, measured**: 674 calls, 1.09M input + 130k output tokens, $1.74
  at list price for the body run ($1.51 headline only). Per month at our
  ~900 articles that is about $2.30, before prompt caching. The matcher
  already spends most of that on the same articles, so D's added cost is
  under a dollar a month. The options doc said $3–5; it was high.

Spent on the TEST Anthropic key for this measurement: $3.28 (two full runs
and a 12-article smoke test). Gemini: free tier.

### The ten useful stories D swallowed (body run)

| article | label | joined to | why Haiku said so (shortened) |
|---|---|---|---|
| #34 Abdelaziz: no UFC star beats Usman | user | #5 manager on Usman vs UFC lightweights | same claim by the same manager, two outlets |
| #100 Topuria's return worries the UFC | user | #77 trainer on Topuria's new version | quotes the same trainer interview |
| #208 Donchenko's grandmother on his earnings | user (2, lifestyle) | #203 Donchenko donating 50% of the bonus | same Sport.nv.ua interview, another excerpt |
| #300 Donchenko on TUF earnings | user | #298 Donchenko on TUF's manufactured conflicts | same interview, another excerpt |
| #382 analyst on why Topuria's next fight matters | user | #379 will Topuria return to title territory | same analyst, same argument |
| #445 Gaethje freezes the rematch | user | #443 Gaethje says no to Topuria this year | same remarks |
| #490 Donchenko got his wish (UFC.com) | user | #474 odds for Donchenko–Soriano | the fight is already a story |
| #594 Donchenko vs Soriano prediction | user | #474 odds | a preview of a known fight |
| #598 Donchenko's hardest fight, Paris preview | user | #474 odds | a preview of a known fight |
| #620 Topuria announces his return (Spanish) | haiku | #572 Topuria's plan to return | same announcement |

Whether #34, #382, #445 and #620 are wrong is arguable; #490–#598 are the
clear cost: fight week produces many pieces about one fight, and Anton
wants the distinct ones posted.

### Where the labels and D disagree on kind

D says "reaction" 32 times. The labels have no reaction field, so those are
scored as new stories (right when the labels also open a story there, a
miss when the labels call it a repeat). A reaction field in the feedback
table would let the next run score this properly.
