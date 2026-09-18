# Role questions for JEV — wording for review

**Status: draft, not yet run.** Anton reviews and edits this file; the runner
reads the questions from `questions.json`, which is generated from this file's
option names. Change anything here.

**What this test is for.** Not accuracy. We are auditing whether the *option
lists* cover reality. Every question carries an escape hatch; afterwards we read
the articles where JEV took it, and find the options we failed to think of.

**What this test is NOT.** It never mentions buckets, posting, the group, or
whether anything is worth sending. Every question is descriptive of the article
alone. The bucket is composed later, in code, from these answers — so the
answers must not be contaminated by the thing they are meant to predict.

---

## The prompt (the `state` blob)

One article per call. Whole text, not an excerpt: a coach quoted in paragraph
twelve is invisible in a 1,200-character excerpt, and these questions are about
who is quoted.

```
WATCHED FIGHTER: {display name}

HEADLINE: {headline}
OUTLET: {source}
PUBLISHED: {date}

ARTICLE TEXT:
{whole clean text}
```

Notes on each field, so the choices are deliberate:

- **WATCHED FIGHTER** is required — every question is asked relative to him,
  and several articles name three or four fighters.
- **OUTLET** is kept. It is real information the pipeline has, and a reader
  weighs it. It does risk teaching the model that certain domains are junk;
  if that shows up we drop it and re-run.
- **PUBLISHED** is required by the `timing` question: "already old" can only be
  judged against when the article appeared.

## The escape hatch

Worded **identically in all six questions**, so the rates are comparable
question to question:

> *None of the above fits. Choose this only when a fitting answer exists but is
> not in this list — not when you are merely unsure.*

The second clause is the important one. It tells the model where to put
confusion — anywhere but here — so the hatch stays a signal about our option
lists rather than a place uncertainty collects.

Two different things get read afterwards, and they are not the same finding:

1. **The hatch wins with real probability** → an option is missing. Read these.
2. **No option gets much mass** → the model is lost, usually thin text. A
   different problem, read separately.

---

## Q1 · role

**Instructions:** What is the watched fighter in this article? Judge by what the
article is actually reporting, not by whose name is in the headline.

| option | wording shown to the model |
|---|---|
| `the_subject` | The article is about him. He is the person it reports on. |
| `one_of_several_subjects` | He shares the article with others — it reports on two or more people and none of them is the single focus. |
| `a_bystander` | The article reports an exchange, argument or event between other people. He is named but is not a party to it. |
| `background` | His past fight, loss or record is used as backdrop in a story about someone else. |
| `not_in_this_list` | *(escape)* |

## Q2 · whose judgement

**Instructions:** Whose judgement of the watched fighter does this article
carry? If more than one, pick the one with the most standing to judge him.

| option | wording shown to the model |
|---|---|
| `himself_or_his_camp` | The fighter himself, or his own coach, trainer, manager or promoter. |
| `an_opponent_or_their_camp` | A fighter who faces him or has faced him, or that fighter's coach or manager. |
| `a_neutral_authority` | The champion of his division, a top coach with no stake in him, a doctor, or the promotion and its officials. |
| `the_article_author` | The judgement is the writer's own, in their own voice, not quoted from anyone. |
| `no_one_judges_him` | Nobody, the author included, passes judgement on him. The article only reports facts. |
| `not_in_this_list` | *(escape)* |

> **Fixed from the first draft.** "The journalist" previously read *"nobody is
> quoted — the assessment is the author's own opinion"*, which collides with
> "no one judges him" sitting beside it. Any opinionated piece would split its
> probability across two options that both fit, and read as uncertainty when it
> was nothing of the kind.

## Q3 · what is done about him

**Instructions:** What is being done with respect to the watched fighter?

| option | wording shown to the model |
|---|---|
| `calling_him_out` | Asking to fight him, challenging him, or demanding him as an opponent. |
| `assessing_him` | Judging his ability, his game, his career, his chances or his condition. |
| `defending_him` | Replying on his behalf to an attack or a callout aimed at him. |
| `steering_him_elsewhere` | Saying he should fight somebody else, or advising him about his division or weight class. |
| `naming_him_in_passing` | Mentioning him without saying anything substantial about him. |
| `nothing_of_the_sort` | None of these happens. Nobody acts on him or speaks about him in any of these ways. |
| `not_in_this_list` | *(escape)* |

> **Fixed from the first draft.** The question assumed somebody was speaking. If
> nobody is, the question has no answer and the escape hatch would fill with
> articles that are simply quiet. `nothing_of_the_sort` is a real answer and is
> deliberately kept distinct from the escape hatch, which means *"something is
> being done that is not on this list."*

## Q4 · kind of news

Wording taken from the grader's own hover text, so the vocabulary matches what
`lib/matcher.js` can already emit.

**Instructions:** What kind of news is this about the watched fighter?

| option | wording shown to the model |
|---|---|
| `announcement` | A specific fight for him is booked or set — an opponent, event or date is named. |
| `result` | The outcome of a fight he fought in the last few days. |
| `injury` | His own new injury, surgery or medical status. |
| `negotiation` | The promotion or both camps working on a fight for him — an offer, terms, talks. |
| `quote` | He, or someone notable, says something substantial about him — an opinion, an assessment, a callout, a stated intention. |
| `prediction` | A forecast about his fight or his path. |
| `other_career_fact` | A career fact fitting nothing else — a contract, a camp change, a ranking move. |
| `lifestyle` | Personal life, not career. |
| `no_news_about_him` | Nothing has happened to him and nothing is forecast about him. |
| `not_in_this_list` | *(escape)* |

> **Risk worth watching.** Ten options is a lot; probability spreads thin and
> everything can look uncertain. If Q4's confidences come back uniformly low
> while the other five are sharp, that is the cause, and the answer is to split
> it into two questions rather than to trust the numbers.

## Q5 · sourcing

**Instructions:** How well sourced is what this article asserts about him?

| option | wording shown to the model |
|---|---|
| `official` | The promotion announced it. |
| `reported` | An outlet states it as fact. |
| `rumored` | Hedged — in talks, targeted, sources say. |
| `no_factual_claim` | The article asserts no fact about him to source. It is opinion, analysis or commentary. |
| `not_in_this_list` | *(escape)* |

> **Fixed from the first draft.** Official / reported / rumoured all assume a
> factual claim exists. A pure opinion piece fits none of them, so it would land
> in the escape hatch and we would read it as a missing option when it is really
> a missing *non-answer*.

## Q6 · timing

**Instructions:** How fast did a follower of this fighter need this? Judge the
news itself, not when the article was published.

| option | wording shown to the model |
|---|---|
| `within_hours` | Breaking — it loses its value within hours. |
| `same_day_is_fine` | It can wait for a daily digest. |
| `no_rush` | Evergreen — as good next week as today. |
| `already_old` | It was already stale when published: it retells something reported days or months ago. |
| `not_in_this_list` | *(escape)* |

---

## Sample

300 articles with text, drawn from the production archive, **stratified rather
than proportional**:

| fighter | taken | why |
|---|---|---|
| Yaroslav Amosov | all of them | Anton's S2 note puts the interesting judgement here; proportional sampling would give about five |
| Daniil Donchenko | all of them | same |
| Ilia Topuria | the balance, spread evenly across the window by id | he is most of the archive; taking him consecutively would sample two news storms |

## Passes

**One pass first**, then a decision. If a second and third pass follow, the
**option order is shuffled per pass**: an answer that changes when only the
order changed tells us the option list is weak, which is a better consistency
test than asking the same question three times the same way.

## What is written where

```
experiments/2026-09-17-role-questions/
  questions.md     this file — the wording, reviewed by hand
  questions.json   generated from it; what the runner actually sends
  pull.mjs         read-only SELECT against production; writes data/articles.json
  run.py           the JEV calls; writes raw/ and results.json
  data/            the sampled articles
  raw/             one file per call, so a re-run costs nothing
  FINDINGS.md      written after, by hand
```

`data/` and `raw/` are article text and model output — gitignored, not
committed.
