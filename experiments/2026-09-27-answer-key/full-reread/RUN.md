# Full blind re-read of the golden set: how to run it

Two blind readers label all 300 golden articles on all nine questions
under the labelling guide as it stood on 2026-10-03 (`guide.md`, a copy of
`../key-guide.md`). The point is to find articles whose labels no longer
agree with the rules decided since the original readers read them.

This file is the whole job. It is written for a session that has only
this repository. It needs no credentials, no database and no network. It
must not run the classifier, touch `golden/`, or change any file outside
this folder.

## Inputs

- `guide.md`: the labelling guide.
- `in-A-01.json` to `in-A-20.json`: reader A's batches, 15 articles each.
- `in-B-01.json` to `in-B-20.json`: reader B's batches. The same 300
  articles, grouped and ordered differently, under different made-up ids.

Article numbers are hidden: the guide names real article numbers as worked
examples, and the map from made-up id to real number is deliberately not
in the repository.

## What to do

For each of the 40 input files, start one subagent on the session's own
model with the prompt below, replacing `{IN}` with the input file name and
`{OUT}` with the same name with `in-` replaced by `out-` (so
`in-A-01.json` gives `out-A-01.json`). Run them a few at a time (about six
in parallel). The orchestrating session must not label anything itself and
must not read the article texts.

**Stop after the first six batches** (`in-A-01` to `in-A-06`): commit and
push their outputs, report the subagent tokens they used, and wait for a
go-ahead before starting the rest. This is a cost checkpoint.

After each subagent finishes, check that its output file is valid JSON, is
a list with one object per input article, in input order, with the same
ids, and that every value is one the guide names. If a file fails the
check, start a fresh subagent for that batch; do not repair answers by
hand.

When all 40 output files pass, commit them (only `out-*.json` in this
folder) and push the branch. Report: how many files, how many articles per
reader, any batch that had to be rerun, and the total subagent tokens.
Do not compare readers or draw conclusions; that is done elsewhere, with
the id map.

## Subagent prompt

```
You are a careful editor labelling news articles about MMA fighters. Work
alone, from the two files named below and nothing else.

1. Read the labelling guide in full:
   experiments/2026-09-27-answer-key/full-reread/guide.md
2. Read the articles:
   experiments/2026-09-27-answer-key/full-reread/{IN}
   (a JSON list; each item has id, watched_fighter, headline, published,
   article_text). The file is large; read all of it, in parts if needed.
   Read every article's whole text.

Do NOT open any other file in that folder or anywhere else in the
repository (no other inputs, no outputs of other readers, nothing under
golden/, no git history). Do not search the web. The ids in the guide's
examples (#123 style) are unrelated to the ids in your file; do not try
to match them.

For each article, label it for its watched_fighter exactly as the guide
instructs, answering all nine questions with exactly the value names the
guide uses. Judge each article on its own text.

Write your answers to
experiments/2026-09-27-answer-key/full-reread/{OUT}
as a JSON list, one object per article, in the input order:
{"id": "<id from the file>",
 "main_claim": "<one sentence: the article's one main claim>",
 "centrality": "...", "source": "...", "act": "...", "fact": "...",
 "firmness": "...", "reports_his_result": "yes|no",
 "reports_his_next_fight": "yes|no", "reports_his_health": "yes|no",
 "he_speaks": "yes|no",
 "unsure": [<questions where a careful editor could reasonably pick
            another value>],
 "note": "<one or two sentences naming the text that decided your
          answers; must explain every unsure and every none_of_these>"}

Check the file is valid JSON with one object per input article before you
finish. Your final reply is one line: how many articles you labelled.
```
