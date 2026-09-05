# Story matching — the menu, 2026-09-06

Written for Anton after the all-articles review and the story-gate
measurement ([2026-09-05-story-gate.md](grading/2026-09-05-story-gate.md)).
He asked: stepping back from the pipeline we have, what are all the ways
to match one story to another more precisely, including a different
architecture, with costs. Costs below are **estimates from list prices and
our volume** (about 30 articles a day, ~900 a month; the API cap is $20 a
month across all keys), not measurements. Anything that goes live is
scored first against the `feedback` table in the bench.

## What the evidence says the problem is

Three separate things fail today, and no single fix covers all three.

- **Retrieval sees too little.** Held items are compared by headline alone,
  because the embedding hold runs before the body is fetched (TODO 3h).
  197 of the 315 headline-only rows in the review exist for this reason.
- **The decider is a number.** A similarity score cannot tell "same fact"
  from "same topic". In the archive a genuinely new story that resembles
  an old one sits as close to that story's root (median 0.825) as a true
  repeat does (0.817). This is a ceiling, not a tuning problem: Kawa
  replying to Abdelaziz looks like Abdelaziz's callout; Makhachev's coach on
  Topuria looks like Makhachev on Topuria.
- **Stories are pairs, not objects.** The bot links an article to its
  nearest neighbour, so chains and garbage bags form (#308 held 23
  unrelated Gaethje items), and there is no place to record "this is a
  reaction to that".

## The options

| | Option | What changes | Effect on matching | Cost / month | Effort |
|---|---|---|---|---|---|
| A | **Turn the knobs** | All anchors, bar at 0.85 (`DUP_ANCHORS_ALL=1`, `SEMANTIC_DUP_THRESHOLD=0.85`). | Measured: holds 247 of 341 repeats instead of 173, swallows 5 useful new stories instead of 7. Connected stories still a coin toss. | $0 | An hour |
| B | **Bodies before the hold** | Decode the Google link and fetch the body before the early hold; embed body plus headline. | Better retrieval and real text for every later step. Gain by itself unknown — needs a bench run. | ~$0 (page fetches) | A day |
| C | **LLM referee for the grey band** | Between ~0.72 and ~0.90, ask Haiku with both texts: same fact, reaction, or different. | Directly attacks the ceiling. About 10–15 articles a day land in the band. | ~$1–2 | Two days |
| D | **Stories as objects** | Each story gets a root, an LLM-written one-line fact, a member list and a "reacts to" link. A new article retrieves the top three stories by embedding, then one Haiku call decides: join S, new story, or reaction to S. Embeddings retrieve; they never decide. | The real fix. Chains cannot form, reactions get their own place, and it is what Anton's review did by hand. We already pay one Haiku call per article in the matcher, so this reshapes that call rather than adding one. | ~$3–5 if it replaces the matcher's question; ~$6–8 beside it | One to two weeks |
| E | **Extract facts, match on fields** | The LLM pulls speaker, subject, claim type, event and date from each article; matching is rule-based on those fields. | Very precise on quotes and translations. Brittle where the schema does not fit; opinion pieces fit badly. | Same as D | Two weeks, plus schema upkeep |
| F | **A trained classifier on the labels** | Logistic regression on similarity to nearest, similarity to root, hours apart, same outlet, same language — trained on the 1178 feedback rows. | Cheap and measurable; may squeeze a few points over one threshold. Same ceiling as A for connected stories. | $0 | Two days |
| G | **Nightly reconciliation** | Keep hourly decisions; every night re-cluster the week's articles with an LLM and fix roots and memberships in the table. | Cleans the archive and the story bookkeeping. Does not stop a wrong post at the hour it happens. | ~$1 | Three days |
| H | **Anton's corrections feed the prompt** | The feedback bot (TODO 3e) plus retrieval of his closest past rulings as examples in the matcher's prompt. | The matcher learns his line (lifestyle is 2, a reply to a callout is 2) without a code change per rule. | ~$0.50 (longer prompts) | A week, mostly the bot |

Not on the menu: a paid reranker or a bigger embedding vendor. Both would
help retrieval, both are new paid vendors, and D gets the same effect from
the LLM call we already make.

## Recommendation

**A this week, B and D as the build, H right after.**

- A is free and measured.
- B is a precondition for anything that reads text.
- D is the architecture that matches how Anton thinks about the archive:
  stories with roots and reactions. It costs roughly what the matcher costs
  today because it reshapes that call, and the feedback table scores it in
  the bench before anything goes live.
- E is the alternative to D if D turns out too loose on quotes; try D first
  because it degrades gracefully.
- F and G are cheap add-ons, not a direction.
- C is the incremental path if the ceiling should be attacked without
  touching the architecture; it can live inside D later.

**One limit none of this fixes:** of the 23 held-but-real-news rows in the
review, 12 were held by the matcher with the body in hand (Donchenko
interviews, opinion pieces, lifestyle). That is the prompt not knowing
Anton's rules, and H is the fix for it.

Anton's decision: pending (2026-09-06 morning).
