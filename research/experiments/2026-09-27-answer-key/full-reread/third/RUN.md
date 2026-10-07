# A third, independent reading of the 26 articles where the two readers differed

One fresh subagent per article, so no reading is made next to another
article. The guide is the one in force (`guide.md`, a copy of
`../../key-guide.md`). Article numbers are hidden and the id map is not in
the repository. This file is the whole job; it needs no credentials and
must not touch anything outside this folder.

For each of `in-01.json` to `in-26.json` (one article each), start one
subagent on the session's own model with the prompt below, replacing
`{IN}` with the input file name and `{OUT}` with the same name with `in-`
replaced by `out-`. About six in parallel. The orchestrating session does
not label anything and does not read the article texts.

Check each output file is valid JSON: a list with one object, the same id
as the input, every value one the guide names. If it fails, start a fresh
subagent for that file; do not repair answers by hand. When all 26 pass,
commit only the `out-*.json` files in this folder, push, and report the
count and the total subagent tokens. Do not compare or conclude.

## Subagent prompt

```
You are a careful editor labelling news articles about MMA fighters. Work
alone, from the two files named below and nothing else.

1. Read the labelling guide in full:
   research/experiments/2026-09-27-answer-key/full-reread/third/guide.md
2. Read the articles:
   research/experiments/2026-09-27-answer-key/full-reread/third/{IN}
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
research/experiments/2026-09-27-answer-key/full-reread/third/{OUT}
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
