# Reader pilot for the "status update" wording (2026-10-02)

Tests the proposed wording in `../wording-proposal.json` (rule backlog item
12) with blind Fable readers before it is adopted into `../key-guide.md`.
Readers answered three questions only (fact, how firm, reports his next
fight); the other six are untouched. Article numbers were hidden from the
readers, because the guide names some articles as worked examples. No
classifier run, no JEV spend. Nothing here changes the answer key or
Anton's corrections.

| Step | Articles | Readers | Result |
|---|---|---|---|
| `round1/` | 40 (the affected ones and their neighbours) | two | readers agree on 118 of 120 answers; 9 of 10 wanted moves land with both; two personal-life articles (#627, #651, his video letter to his son) are swallowed by "back in public"; #402 splits health / status update |
| `round2/` | 14 (the four problems and ten neighbours), wording tightened in two lines | two | readers agree on 42 of 42; both problems fixed |
| `full/` | the other 260 | one, then a second on the 20 that differed from today's key plus 6 controls | 240 of 260 unchanged; of the 20, both readers give the same new answer on 10, the second reader keeps today's on 9, one splits three ways; controls 6 of 6 unchanged |

Across all 300 (`result.json`, one row per article where a reader left
today's answer): **21 articles where both readers give the same new
answer**, 9 where only the first reader moved, 1 three-way split.

Of the 21, 16 are the moves the wording was written for: 12 to status
update (ten Dana White "ready, not on the schedule" pieces, #572 and #592
back in public view), #152 and #402 to health, #412 loses its next-fight
yes, #129 to no fact. Two more go to status update that nobody predicted
(#620, #1089). Three are not about status update: #342 and #851 (rule 3
readings) and #913, where both readers answer no fact against Anton's
ruling of the same day (next fight, rumour).

`make_guide.py` writes the readers' guide from the proposal; `compare.py
round1` prints one round against today's key (`key-now.json`: the readers'
answers with Anton's corrections laid over them, as of this run).
About 1.8 million subagent tokens in total.
