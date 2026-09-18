# Anton's verdicts on pass 1

**This file is the record. `spotcheck.md` gets regenerated and anything written
in it is lost** — the same hazard that wiped the whiteboard. Verdicts go here,
in his own words, and are never paraphrased away.

---

## #838 · Ilia Topuria · 2026-09-07 · Bloody Elbow

*Paddy Pimblett reacts to rumor he is set to fight Ilia Topuria next: 'I'd love
to smash his head in'*
<https://bloodyelbow.com/2026/09/07/paddy-pimblett-reacts-to-rumor-he-is-set-to-fight-ilia-topuria-next-id-love-to-smash-his-head-in/>

| question | JEV | Anton | |
|---|---|---|---|
| role | `a_bystander` 0.58 | bystander, but also one of several subjects | **ambiguous, JEV's top pick right** |
| whose_judgement | `another_fighter` 0.56 | another fighter **and** a potential opponent | **option missing** |
| what_is_done | `calling_him_out` 0.78 | "close to calling him out" | **right** |
| news_kind | `quote` 0.77 | "definitely a quote" | **right** |
| sourcing | `rumored` 0.89 | `reported`, with highest confidence | **question is broken** |
| timing | `same_day_is_fine` 0.63 | same day is best | **right** |

**In his words:**

> **role** — "I think a bystander is the best option because the article is about
> Paddy Pimblett and about his remarks that he would like to smash Topuria...
> when I read it I kind of forget about Topuria. You feel like it's more about
> what Pimblett says... And then he goes on to talk about other fighters, and
> when he's going to fight next time. So I feel like it's all three. He is a
> bystander. I guess he is a subject that is being talked about, but like one of
> many subjects."

> **whose_judgement** — "Paddy is just another fighter, but he is also a
> potential opponent."

> **what_is_done** — "A potential opponent talks about his willingness to fight
> Topuria, essentially. So I think it's close to calling him out in a sense. But
> it's not naming him in passing. It's not like assessment."

> **sourcing** — "That should be reported with highest confidence, because the
> article says that Paddy Pimblett was asked at a certain event and that's what
> he said. So this should be certain and reported, but it shouldn't be rumored or
> hedged. But I guess the classifier might have thought... that Paddy fighting
> Topuria is rumored, and that might be true. But then — what is sourced? The
> fact that Paddy said something, it's a fact, it's reported. But then the fact
> that Paddy will fight Topuria, that is rumored. And that is definitely hedged,
> because Paddy said that he hasn't had any calls about it."

> **timing** — "Same day is fine. I would actually split it between same day is
> fine and no rush... if I look at what it really means, then I think same day is
> the best option."

### What this changes

1. **`sourcing` is asking about an unnamed thing.** An article asserts several
   things at once at different confidence levels — *Paddy said this* (certain)
   and *Paddy will fight him* (hedged). The question never says which one to
   judge, so JEV judged the fight and Anton judged the quote. **Both answers are
   correct to different readings of my question.** This is the cause of the 81%
   `reported` degeneracy: an under-specified question collapses to a default.
   **Fix:** name the target in the instruction — judge the sourcing of the
   *event*, and give "only a quote, no event claimed" its own option.

2. **`whose_judgement` has no prospective opponent.** The definition reads "a
   fighter who faces him or has faced him." A rumoured or proposed opponent is
   neither. JEV split 0.56 / 0.28 across `another_fighter` and
   `an_opponent_or_their_camp` — the same two Anton named. **Fix:** widen the
   opponent definition to include a fighter being publicly linked to a fight
   with him.

3. **A spread answer is not automatically a failure.** On `role` Anton's own
   reading was "it's all three." The distribution was reporting real ambiguity in
   the article, not confusion in the model. Detector 2 ("no option above 0.5")
   therefore finds two different things, and they must be read apart:
   an ambiguous *article* and a bad *option list*.

4. **The option labels mislead where the definitions do not.** On `timing` Anton
   first leaned to "no rush", then changed to "same day" once he read what the
   options actually said. A human reading the label alone got it wrong; the model
   always sees the definition. Worth remembering when judging its answers.

**Running score on #838: 4 of 6 right, 1 genuinely ambiguous, 1 my fault.**

---

## Speaker ranking · 2026-09-18

**In his words:**

> "I want to see by default 1, 2, 4, 5. But for some fighters I'd like to see
> more, but we can make those setting in the end of the pipeline, not now. Like,
> I'd like to hear about Donchenko and Amosov all of the categories."

> "Also it may be hard to decide just based on the speaker maybe I feel like it
> has to be a combination of all those questions answers so like yes he is
> talking about himself but is it like a fight related thing or a lifestyle thing"

**Default digest speakers:** `himself`, `an_opponent_or_their_camp`,
`the_champion_or_a_top_authority`, `his_camp`.
**Dropped by default:** `another_fighter`, `a_pundit_or_commentator`,
`the_article_author`, `no_one_judges_him`.

### What this changes

1. **The speaker filter IS the per-fighter follow level.** He did not ask for a
   global rule - he asked for a default plus an exception for the fighters he
   follows closely. A saturated fighter hears only from people with standing; a
   closely-followed one hears from everyone. **That is the same dial as the
   fighter-saturation problem** (his S2 finding: the same article is bucket 2 for
   Amosov and bucket 3 for Topuria). Implemented in `speakers.py` as
   `FOLLOW_ALL`, deliberately a setting and not a law. It also matches the
   standing TODO commit c58d2f8, "a per-fighter follow level, applied in code".
2. **Speaker alone is not enough, and he is right.** Recorded as an open design
   point, not yet solved.

