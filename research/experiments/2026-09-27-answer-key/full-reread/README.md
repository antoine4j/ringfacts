# Full blind re-read of the golden set (2026-10-03)

Two blind Fable readers labelled all 300 articles on all nine questions
under the labelling guide as it stood on 3 October (`guide.md`), to find
labels that no longer agree with the rules decided since the original
readers read the set. Run in a cloud session from `RUN.md`: 40 subagents,
15 articles each, each reader with its own grouping, order and made-up
ids. `id-map.json` was kept out of the repository until the run ended.
Cost: about 79 dollars of promotional cloud credit.

`compare.py <dump of the corrections>` lays Anton's corrections over the
original readers' answers (`key-now.json`, as of this run) and writes one
row per differing answer to `result.json`.

Of 2,700 answers, the two readers agree with each other on 2,658 and both
give the key's answer on 2,613. **On 244 of the 300 articles both readers
give the key's answer on all nine questions.** The other 56 articles:

| Kind | Answers | Articles |
|---|---|---|
| both readers agree, against the key, on a card Anton has not checked | 28 | 21 |
| both readers agree, against the key, on a card Anton has checked | 17 | 10 |
| the two readers differ | 42 | 26 |

Nothing in the key was changed by this run.

## The third reading (2026-10-03)

`third/`: the 26 articles where readers A and B differed, each read once
more by a fresh agent that saw only that one article (`third/RUN.md`;
about 24 dollars of credit). `third/result.json` has one row per answer
where the three readings and the key are not all the same: 46 answers on
the 26 articles. On 32 of them two of the three readings give the key's
answer; on 12 two of three agree on another answer; on 2 all three
differ.
