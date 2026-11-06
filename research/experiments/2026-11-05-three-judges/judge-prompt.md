# Judge prompt (one week)

Sent to one judge agent with the week's `judge-in-<monday>.json`: the week's
claims as v0 made them, and the same model's readers' account of every
article in them. The judge makes the calls the maintainer makes on the
storyboard, each with a sentence, and names the rule behind every split, so a
later ruling can flip those calls without a rerun. It does not see the
maintainer's marks, and it never sees another model's readers or judge.
Prompt version: j1 (2026-11-05). Rules 2 and 4 carry the maintainer's rulings
of {RULINGS_DATE}.

---

You are reviewing how a news pipeline grouped MMA articles into claims, for
the fighter named on each claim. Read {IN_PATH} with the Read tool. It holds
one week of claims (`claim_id`, `fighter`, `label`: one article's sentence,
which can itself be the odd one out) and, for each article in a claim
(`reading_id`), a reader's account: `occasion`, `speaker`, `occasion_date`,
`also`, `centrality` (how central he is: `main_subject`, `one_of_several`,
`only_mentioned`, `not_in_content`), `kind`, `claim` (the one fact it
reports, or NO CLAIM), `career_event`, `body_problem`. When an account is
unclear, the article text is in the batch files under {BATCH_FOLDER}
(`batch-NN.in.json`, find the article by `reading_id`): read it before
deciding a hard case. A reading may carry `earlier_call`, the call made on it
when an earlier week was reviewed: keep it unless this week's readings show
it was wrong, and say so in `why` when you change it. Open no other file.

**What one claim is.** One piece of news: one occasion and the reports of
it. An occasion is one sitting (an interview, a podcast episode, a show, a
press conference) of one speaker, one event (a fight, a weigh-in, a card),
one announcement, or one social post. The rules:

1. The same sitting written up by many outlets is one claim, even when the
   write-ups are days or weeks apart and quote different lines from it.
2. {RULE_2}
3. A rumour about a possible fight and the denials and confirmations of that
   same rumour are one ongoing story: link such claims as one.
4. A fight's preview, its result, and the reactions after it are different
   claims. {RULE_4}
5. An article where the fighter appears only in passing (a link, a sidebar,
   a list, one line in a roundup; the reader's `centrality` is
   `only_mentioned` or `not_in_content`) is not part of a claim about that
   occasion: call it its own claim.
6. A claim's core is the occasion most of its readings share (not
   necessarily its label). Readings outside the core do not belong.
7. A reading whose saved text is not the article (`body_problem` set) is
   judged on what the text does say; when nothing can be told, call it
   `own_claim` with `rule` 7 and low confidence.

**Your calls.** For every claim, one line, and for every reading in it, one call.

Per claim: `core`: one sentence naming the claim's core occasion (speaker,
sitting or event, date), the way the maintainer would label it.

Per reading:

- `belongs`: it reports the claim's core occasion.
- `does_not_belong` with `belongs_in_claim_id`: it reports the core occasion
  of another claim of the **same fighter** in this file.
- `does_not_belong` with `belongs_in_claim_id: null`: it does not belong, and
  no claim here fits.
- `own_claim`: it is a separate piece of news (rules 5 and 7 included).

For claims: `same_claims`, one entry per pair of claims of the same fighter
whose cores are the same occasion or story (rules 1 and 3). Link pairs so
that a group of three is two links.

Each call carries `why`: one plain sentence naming the deciding fact (the
speaker, the sitting, the date), for a person checking it in seconds;
`rule`: the number of the rule that decided it (1–7), or 0 for a plain
`belongs`; and `confidence`: `high`, `medium` or `low`.

**Rule gaps.** When the rules do not settle a case, decide it anyway and add
one line to `rule_gaps`: the `claim_id`, the `reading_id` when one, the
question in one sentence, and the two ways it could go. These become
questions for the maintainer.

Write JSON to {OUT_PATH} with the Write tool:

```json
{"claims": [{"claim_id": "…", "core": "…"}],
 "readings": [{"claim_id": "…", "reading_id": "…", "verdict": "belongs", "belongs_in_claim_id": null, "why": "…", "rule": 0, "confidence": "high"}],
 "same_claims": [{"claim_id": "…", "other_claim_id": "…", "why": "…", "rule": 1, "confidence": "medium"}],
 "rule_gaps": [{"claim_id": "…", "reading_id": "…", "question": "…", "options": ["…", "…"]}]}
```

Ids are strings. Every reading in the input gets exactly one call. Do not
copy article text into `why` beyond a few words. Reply with one line: how
many calls of each verdict, how many same-claim links, how many rule gaps.
