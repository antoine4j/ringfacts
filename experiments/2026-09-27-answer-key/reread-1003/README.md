# Blind re-read after step 1 of the answer-key review (2026-10-03)

Checks that the rules Anton decided on 3 October are carried by the
labelling guide's text, not only by the discussion that produced them.
Two blind Fable readers, 35 articles (25 that the changed rules touch,
10 controls that should not move; `sets.json`), five questions only
(how central, what the source does, what fact, reports his result, he
speaks). Article numbers were hidden (`id-map.json`), because the guide
names articles as worked examples. `guide.md` is the guide as the readers
saw it; `key-now.json` is the readers' original answers with Anton's
corrections laid over them, as of this run. No classifier run. About
457,000 subagent tokens.

**Both readers gave the key's answer on 161 of 175 answers.**

| Rule | Result |
|---|---|
| Result only for an account of the fight itself | lands: #851, #778, #1172 and two real fight reports, both readers |
| He speaks only when his words are there | lands: 35 of 35 |
| Talking about someone else | lands: #1260, #373 |
| A callout is not only a literal callout | lands: #287, #889 |
| An act needs a plain statement about him | lands on #457, #484, #492, #975, #1045, #462, #856; both readers give none of these on #516 (key said steers him) and gives news of him on #1089 |
| A callout is the other fighter's story | does not land: one reader gives only mentioned on all five Pimblett callouts (#273, #843, #871, #921, #892), the other one of several on all five; both give one of several on #913 (key said main subject) |

What followed: the guide said such an article is "never main subject" but
not that a callout alone leaves him only mentioned; that sentence was
added. #913 moved to one of several and #516 to none of these on Anton's
word. #1089 stays no fact against both readers (the fourth reader of four
to say status update).

A caution on the callout result: all five callouts sat in one batch, so
each reader was one agent staying consistent with itself across five
near-identical texts. It is one reading against one reading, not five
against five.

Other differences, each flagged by the reader as unsure: #148 fact (both
health, key no fact), #1172 fact, #1260 act, #361 fact, #492 how central.

## Round 2: the callout sentence, rerun the same day

`round2/`: the seven callout articles (#273, #843, #871, #921, #892, #953,
#913) under the guide with the added sentence, how it is in force now.
Built to avoid the flaw above: three batches per reader, no batch with
more than three callouts, each mixed with four unrelated articles, and a
different grouping and order for each reader (six agents, about 542,000
subagent tokens).

**Both readers gave the key's answer on 95 of 95 answers**: only mentioned
on the six plain callouts, one of several on #913, and all twelve unrelated
articles unchanged.

Also from round 1: #148 went back to health on Anton's word (a named
trainer states his recovery, under its own subheading; all five readers
who ever read it said health).
