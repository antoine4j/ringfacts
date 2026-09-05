# Story gate, replayed over the labelled archive

Source: the `feedback` table as of 2026-09-05 (current label per
article: user > claude > sonnet > haiku), embeddings from `items`
(gemini-embedding-001), window 7 days, same subject only. Earlier items
sit in their labelled stories, so the numbers isolate the thresholds from
cascade effects. 674 articles, 341 story members (later arrivals of a
labelled story), 333 first arrivals (story roots and singletons).

## What the thresholds must separate

| similarity of… | n | 5% | 25% | 50% | 75% | 95% |
|---|---|---|---|---|---|---|
| a true member to its story root | 284 | 0.678 | 0.762 | 0.817 | 0.870 | 1.000 |
| a true member to its nearest earlier member | 284 | 0.796 | 0.854 | 0.893 | 0.973 | 1.000 |
| a new story to its nearest earlier item | 329 | 0.591 | 0.665 | 0.718 | 0.782 | 0.904 |
| a new story that looks like an old one (nearest ≥ 0.80) to that story's root | 61 | 0.685 | 0.802 | 0.825 | 0.867 | 0.986 |

Members whose nearest earlier item is in another story: 57.
Members with no earlier item in the window: 0 (uncatchable by any threshold).

## Today's rule

| rule | held (caught + misplaced) | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|
| posted anchors >= 0.8 | 173 | 152 | 21 | 168 | 7 | 4 |

## The story gate: nearest member ≥ T_member, and root ≥ T_root

"caught" = joined to its own story; "misplaced" = joined to another story;
"missed" = posted again as if new. For the group, caught and misplaced are
the same outcome — the repeat is held; misplaced only muddles the story
bookkeeping. "useful swallowed" = a genuinely new bucket-1/2 story held as a
dup — the real cost. "junk swallowed" = a new bucket-3 item held as a dup —
harmless, it was not for the group anyway.
Of the 333 first arrivals, 54 are useful stories and 279 are junk.

| T_member | T_root | held | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|---|
| 0.75 | off | 335 | 280 | 55 | 6 | 37 | 79 |
| 0.75 | 0.55 | 335 | 280 | 55 | 6 | 37 | 79 |
| 0.75 | 0.60 | 333 | 278 | 55 | 8 | 37 | 78 |
| 0.75 | 0.65 | 330 | 275 | 55 | 11 | 36 | 78 |
| 0.75 | 0.70 | 302 | 258 | 44 | 39 | 32 | 71 |
| 0.75 | 0.75 | 249 | 218 | 31 | 92 | 26 | 66 |
| 0.78 | off | 318 | 274 | 44 | 23 | 27 | 57 |
| 0.78 | 0.55 | 318 | 274 | 44 | 23 | 27 | 57 |
| 0.78 | 0.60 | 316 | 272 | 44 | 25 | 27 | 56 |
| 0.78 | 0.65 | 314 | 270 | 44 | 27 | 26 | 56 |
| 0.78 | 0.70 | 292 | 254 | 38 | 49 | 23 | 51 |
| 0.78 | 0.75 | 243 | 215 | 28 | 98 | 20 | 49 |
| 0.80 | off | 302 | 264 | 38 | 39 | 19 | 42 |
| 0.80 | 0.55 | 302 | 264 | 38 | 39 | 19 | 42 |
| 0.80 | 0.60 | 300 | 262 | 38 | 41 | 19 | 42 |
| 0.80 | 0.65 | 298 | 260 | 38 | 43 | 18 | 42 |
| 0.80 | 0.70 | 279 | 245 | 34 | 62 | 16 | 40 |
| 0.80 | 0.75 | 234 | 208 | 26 | 107 | 15 | 38 |
| 0.82 | off | 292 | 258 | 34 | 49 | 13 | 33 |
| 0.82 | 0.55 | 292 | 258 | 34 | 49 | 13 | 33 |
| 0.82 | 0.60 | 290 | 256 | 34 | 51 | 13 | 33 |
| 0.82 | 0.65 | 288 | 254 | 34 | 53 | 13 | 33 |
| 0.82 | 0.70 | 272 | 240 | 32 | 69 | 12 | 32 |
| 0.82 | 0.75 | 229 | 205 | 24 | 112 | 11 | 30 |
| 0.85 | off | 247 | 223 | 24 | 94 | 5 | 25 |
| 0.85 | 0.55 | 247 | 223 | 24 | 94 | 5 | 25 |
| 0.85 | 0.60 | 245 | 221 | 24 | 96 | 5 | 25 |
| 0.85 | 0.65 | 244 | 220 | 24 | 97 | 5 | 25 |
| 0.85 | 0.70 | 231 | 209 | 22 | 110 | 5 | 24 |
| 0.85 | 0.75 | 199 | 182 | 17 | 142 | 4 | 22 |

## With cascade — the live shape, chains included

Here an earlier item sits in the story the gate itself gave it, so a wrong
join becomes an anchor for the next arrival. This is what the August
posted-anchors decision measured (docs/decisions.md#posted-anchors).

A swallowed first arrival drags its whole story into "misplaced" here: the
repeats are still held, but under the wrong root.

| rule | held | caught | misplaced | missed | useful swallowed | junk swallowed |
|---|---|---|---|---|---|---|
| today: posted anchors ≥ 0.80 | 173 | 106 | 67 | 168 | 7 | 4 |
| all anchors ≥ 0.80, root off | 302 | 98 | 204 | 39 | 19 | 42 |
| all anchors ≥ 0.80, root ≥ 0.65 | 296 | 98 | 198 | 45 | 19 | 42 |
| all anchors ≥ 0.80, root ≥ 0.70 | 291 | 106 | 185 | 50 | 17 | 42 |
| all anchors ≥ 0.82, root off | 292 | 114 | 178 | 49 | 13 | 33 |
| all anchors ≥ 0.82, root ≥ 0.65 | 291 | 114 | 177 | 50 | 13 | 33 |
| all anchors ≥ 0.82, root ≥ 0.70 | 281 | 114 | 167 | 60 | 13 | 33 |
| all anchors ≥ 0.85, root off | 247 | 97 | 150 | 94 | 5 | 25 |
| all anchors ≥ 0.85, root ≥ 0.65 | 247 | 97 | 150 | 94 | 5 | 25 |
| all anchors ≥ 0.85, root ≥ 0.70 | 246 | 97 | 149 | 95 | 5 | 25 |

## The useful new stories that look like old ones (nearest ≥ 0.80)

These are what the root guard must let through. Sorted by similarity to the
old story's root: the guard saves those below its T_root.

| id | bucket | nearest | sim | that story's root | sim to root |
|---|---|---|---|---|---|
| #445 | 2 | #443 | 0.867 | #443 | 0.867 |
| #364 | 2 | #321 | 0.857 | #321 | 0.857 |
| #121 | 2 | #82 | 0.852 | #82 | 0.852 |
| #642 | 1 | #474 | 0.851 | #474 | 0.851 |
| #34 | 2 | #30 | 0.846 | #30 | 0.846 |
| #82 | 2 | #77 | 0.838 | #77 | 0.838 |
| #521 | 2 | #490 | 0.832 | #490 | 0.832 |
| #100 | 2 | #82 | 0.822 | #82 | 0.822 |
| #254 | 2 | #191 | 0.821 | #191 | 0.821 |
| #337 | 2 | #293 | 0.816 | #293 | 0.816 |
| #243 | 2 | #205 | 0.840 | #135 | 0.816 |
| #302 | 2 | #298 | 0.814 | #298 | 0.814 |
| #341 | 2 | #246 | 0.803 | #243 | 0.801 |
| #266 | 2 | #257 | 0.803 | #256 | 0.793 |
| #54 | 2 | #40 | 0.826 | #30 | 0.788 |
| #594 | 2 | #567 | 0.932 | #474 | 0.736 |
| #620 | 1 | #592 | 0.822 | #572 | 0.685 |
| #226 | 2 | #177 | 0.809 | #121 | 0.683 |
| #107 | 2 | #86 | 0.814 | #43 | 0.625 |

## True members far from their root (sim to root < 0.65)

| id | root | sim to root | nearest member | sim |
|---|---|---|---|---|
| #12 | #1 | 0.579 | #4 | 0.853 |
| #96 | #1 | 0.585 | #12 | 0.981 |
| #26 | #1 | 0.609 | #12 | 0.772 |
| #650 | #620 | 0.644 | #626 | 0.836 |
| #86 | #43 | 0.645 | #84 | 0.857 |

