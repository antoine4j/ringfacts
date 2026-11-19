# Judge prompt (one week)

Sent to one strong model with the week's `judge-in-<monday>.json`: the
week's claims as v0 made them, and a reader's short account of every
article. The judge makes the same calls the maintainer makes on the
storyboard, with a sentence each. It does not see the maintainer's marks.

The rule of what one claim is comes from the v0 design (a claim is a group
of readings about one occasion) and from the maintainer's notes on claims of
other weeks, restated as rules; `docs/lessons.md` §6 records that "what is
one piece of news" is still his question, so these calls are proposals for
him to confirm or deny.

---

You are reviewing how a news pipeline grouped MMA articles into claims, for
the fighter named on each claim. Read {IN_PATH}. It holds one week of claims
(`claim_id`, `fighter`, `label`) and, for each article in a claim
(`reading_id`), a reader's account: `occasion`, `speaker`, `fact`,
`occasion_date`, `about` (how much the article is about the fighter),
`also`, `body_problem`, and `matches_label` with `why` (the reader's view of
whether it matches the claim's label). The label is one article's sentence
and can itself be the odd one out. When an account is unclear, the article
text is in the batch files in {BATCH_FOLDER} (`batch-NN.in.json`, find the
reading by `reading_id`); read it before deciding a hard case. A reading
may carry `earlier_call`, the call made on it when an earlier week was
reviewed: keep it unless this week's readings show it was wrong, and say so
in `why` when you change it.

**What one claim is.** One piece of news: one occasion and the reports of
it. An occasion is one sitting (an interview, a podcast episode, a show, a
press conference) of one speaker, one event (a fight, a weigh-in, a card), one
announcement, or one social post. Rules from the maintainer's past rulings:

1. The same sitting written up by many outlets is one claim, even when the
   write-ups are days or weeks apart and quote different lines from it.
2. Different people reacting to the same news are different claims: one
   claim per speaker's reaction. An article that reports several belongs
   with its main one.
3. A rumour about a possible fight and the denials and confirmations of that
   same rumour are one ongoing story: link such claims as one.
4. A fight's preview, its result, and the reactions after it are different
   claims. Each issue of a recurring column or ranking is its own occasion.
5. An article where the fighter appears only in passing (a link, a sidebar,
   a list, one line in a roundup) is not part of a claim about that
   occasion: call it its own claim.
6. A claim's core is the occasion most of its readings share (not
   necessarily its label). Readings outside the core do not belong.

**Your calls.** For every reading in every claim, one call:

- `belongs`: it reports the claim's core occasion.
- `does_not_belong` with `belongs_in_claim_id`: it reports the core occasion
  of another claim of the **same fighter** in this file.
- `does_not_belong` with `belongs_in_claim_id: null`: it does not belong, and
  no claim here fits.
- `own_claim`: it is a separate piece of news (rule 5 included).

And for claims: `same_claims`, one entry per pair of claims of the same
fighter whose cores are the same occasion or story (rules 1 and 3). Link
pairs so that a group of three is two links.

Each call carries `why`: one plain sentence naming the deciding fact (the
speaker, the sitting, the date), for a person checking it in seconds; and
`confidence`: `high`, `medium` or `low`.

Write JSON to {OUT_PATH} with the Write tool:

```json
{"readings": [{"claim_id": "…", "reading_id": "…", "verdict": "belongs", "belongs_in_claim_id": null, "why": "…", "confidence": "high"}],
 "same_claims": [{"claim_id": "…", "other_claim_id": "…", "why": "…", "confidence": "medium"}]}
```

Ids are strings. Every reading in the input gets exactly one call. Do not
copy article text into `why` beyond a few words. Reply with one line: how
many calls of each verdict, and how many same-claim links.
