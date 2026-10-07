# Axes v6 — v5 tuned on the answer key, one pass

**Status:** pass 1 on all 300, 2026-09-27, `jev-1.13.0`, 0 errors, $0.06.
How it was chosen, and its scores against the provisional key:
[../2026-09-27-answer-key/README.md](../2026-09-27-answer-key/README.md).
On the claim map as version **v6**.

**What changed from v5** (questions as sent: `classifier-v6/questions.json`;
rendered: `questions-review.html`):

- **act** gains `only_mentions_him` (he is only named; nobody does anything
  regarding him), in place of forcing an act on such articles.
- **fact**: `result`, `next_fight` and `fight_week_event` carry `not_for`
  and made-up examples (his past fight as background; another fighter's
  result; a booked fight's fight week), and the instructions name the
  fighter by the state field and say that news about another fighter is no
  fact.
- **firmness** has four levels (wish → official or done); `none` is set in
  code where fact is `no_fact` (`consolidate.py`). The asked grade stays in
  the answer file.
- **centrality**: "one of several" needs real content of his own; signals
  for "not in the content" and "only mentioned" added.
- **source**: `not_for` on himself, promotion; an instruction for articles
  with nothing new about him.
- The four yes/no questions are v5's.

**Counts (300):** fact result 88 → 46 (the result yes/no says 50), no fact
75 → 135; act only mentions him 49; how firm none 135, official 101,
reported 39, rumour 17, wish 8.

## Proposed, not adopted: source composed with "he speaks"

When "he speaks" says no, drop "himself" from the source answer and take
the next most likely option (a few lines in consolidate.py; the questions
do not change). On stored answers, against the Fable readers' labels, it
changed 8 tune-side answers, all 8 for the better (fight reports become
"no one", a writer's piece "media"); it breaks video pages whose words are
not in the saved text (#521). **Parked by the owner (2026-10-01):** to be
reviewed separately once more articles carry his labels. Not applied.
