# The golden set

The one labelled set every station of the pipeline is scored against.
What it is for, its caveats and the tune/test split are in
[docs/golden-set.md](../docs/golden-set.md). This folder is the data.

**Data flows out of here, never in.** Experiments read these files as
their input. Nothing here points at an experiment; the files below were
copied once, by `tools/import.py`, and the source of each is recorded in
the file itself under `source`. The only way anything here changes is a
ruling by Anton in `verdicts.md`.

| file | what | rows |
|---|---|---|
| `articles.json` | the 300 articles: id, subject, title, source, url, published_at, body | 300 |
| `claims.json` | the ruler, v4: one claim = one occasion with its articles; keys `claim-NNN`, `.x` = children of a split; `fable` = Fable's stored confidence and doubts from its grouping passes; `from` = the keys a rebuilt claim came from; `same_page_as` = articles saved twice (copy → original). Built by `tools/ruler-v4.py` from `claims-v3.json` (kept) | 128 |
| `axes.md` | the axes labels are given on: gate (about him yes / partly / no), source, act, fact asserted, and how firm; each value defined with its boundary cases. DRAFT until Anton approves | |
| `verdicts.md` | Anton's rulings, verbatim, **append only**. One heading per claim: `## YYYY-MM-DD — story-NNN (#ids): <ruling>` (headings keep the `story-` spelling they were written with) | 65 headings |
| `answers/classifier.json` | the six classifier answers per article, majority of three readers, plus the tier; `readers` = each of the three readers' probability over every option | 300 |
| `answers/questions.json` | the six questions as asked: instructions and every option's text | 6 |
| `answers/classifier-v2.json` | the five v2 questions from the answers-to-buckets experiment (role, speaker, act, kind, depth), majority of three orders; shown on the board, decides nothing | 300 |
| `answers/classifier-v3.json` | the classifier on the approved axes of `axes.md`: gate, source, act, fact, firmness, each with a paired 'does an option fit' question; majority of three option orders, `readers` = each order's probabilities. From experiments/2026-09-27-axes-v3; machine answers, not labels | 300 |
| `answers/classifier-v4.json` | the classifier with three question types: centrality and firmness as scores, source / act / fact as choices, four yes/no questions (result, next fight, health, he speaks); choices by majority of three option orders, scores and yes/no averaged. Its result and health yes/no read background as news. From experiments/2026-09-27-axes-v4; machine answers, not labels | 300 |
| `answers/classifier-v5.json` | v4 with the four yes/no questions reworded; **one pass only** so far. Every answer carries a sliceable `choice` (a score's nearest level; a yes/no as yes / unsure / no) beside its number. Read by the claim map. From experiments/2026-09-27-axes-v5; machine answers, not labels | 300 |
| `answers/classifier-v6.json` | v5 tuned on a 59-article answer key (experiments/2026-09-27-answer-key): act gains `only_mentions_him`, fact gets boundaries, how firm is four levels with `none` set where fact is `no_fact`; **one pass only**. Read by the claim map. Machine answers, not labels | 300 |
| `answers/classifier-v7.json` | v7.7, the version tuned against the frozen key (experiments/2026-10-03-classifier-v7, `consolidate.py`): each answer as scored, with the ties of the rules applied, beside its raw numbers; **training and validation articles only**, the test set not yet sent; one pass. Read by the claim map, which grades its training answers against labels.json. Machine answers, not labels | 195 |
| `answers/readers-v1.json` | **provisional labels for all 300**: two Fable readers, blind, from experiments/2026-09-27-answer-key/key-guide.md; an Opus reader on their differences (`status` agreed / majority / split). `part` = tune or held_back for the 59 answer-key articles, not_key for the rest (never tuned on); `body_ruling` flags saved text ruled unusable or cut. For Anton to correct on the correction page; not his labels | 300 |
| `answers/types-fable.json` | Fable's sorting of the 129 v3 claims (claim-067 is now inside claim-054) into four families and 28 types (the types report); a pre-fill to check against the text, not a ruling | 129 |
| `answers/bout-prefill.json` | the extractor's most common `bout` per claim; a pre-fill, not a ruling | 63 filled |
| `answers/extractor.json` | the extractor's answer per article: kind, extract (field `claim`), occasion, actor, opponent, event, date; `second_run` = the same prompt run again unchanged; `fields` and `kind_options` = the prompt's own definitions | 300 |
| `labels.json` | *not yet written* — per claim: kind, speaker, bout, tier; per article: body_unusable, same_page_as, primary_source | |
| `split.json` | **tune / check / test by claim**, drawn 2026-10-01 by `tools/split.py` (seed 20261001): tune 155 articles (38 claims: forced, the classifier questions were tuned on their key articles), check 40 (27 claims: tune-side, never looked at while changing questions), test 105 (63 claims: scored once, at the end). Balanced by fighter and the claim's fact; results are thin in test (6) because the forced tune claims hold most of them | 300 |
| `plan.html` | the big picture: every pipeline station, what the golden set still needs for it, each task's status (done / next / to do / parked) and why it matters. Hand-edited: the `PATH`, `NOW` and `STATIONS` blocks at the bottom. **Update it in the same commit whenever a task changes status**; published as a private artifact at https://claude.ai/artifact/L412VXv6JRP2kFKQogBo7v (republish after editing) | |
| `pages.html` | the table of contents of every published golden-set page (plan, answer key check, claim map, report, questions), what each is for, and how the pages save and share Anton's input. Hand-edited; published at https://claude.ai/artifact/1Rygvkb1d3UdMJaJBU2RQk. **Add a row whenever a new page is published**, and republish | |
| **`labels.json`**, `labels.test.js` | **the frozen answer key (3 Oct 2026): nine answers for each of the 300 articles**, the first readers' answers with Anton's corrections folded in. Each article says how it was checked: read by Anton, confirmed by him from a summary, or left to the two blind readers of the full re-read. The test recomputes a checksum of the answers, so a change must update it and add a line to `errata`; it also checks the ties between answers (no fact means firmness none, and so on) | 300 articles; 97 read, 27 by summary, 176 readers only; 240 corrected answers |
| `rules.md` | the labelling rules in force, each under a plain name with its full description, the date Anton decided it and the nickname it had while under discussion ("rule 3", "rule A"). The index; the readers' exact wording is in the labelling guide | 27 rules |
| `rules.json`, `rules.test.js` | for every rule in `rules.md`, the exact sentences the labelling guide must contain, its example articles, and whether the classifier's questions carry it yet. The test, part of `npm test`, fails when a listed sentence is no longer in the guide or when the two lists name different rules | 27 rules, 31 tests |
| `coin-flips.json` | answers where careful readers still split after the rules and Anton accepted two values; the key carries one, either counts as right when scoring | 9 answers |
| `answers/corrections-snapshot.json` | a copy of Anton's corrections from the Answer Key Check page's database, taken at the freeze: value and why per corrected answer, checked or not, and how. It keeps the why that `labels.json` does not | 166 cards, 264 corrected answers |
| `rule-backlog.md` | proposed labelling and classifier rules Anton has not decided yet, parked or not yet discussed, each with its source article and what it would change. Nothing in it is applied; a ruled item moves to the guide, axes.md and verdicts.md | |
| `board/map.py` + `board/map-template.html` → `board/map.html` | the claim map: every claim described on eight dimensions from the answers (a gate — about him yes / partly / no — plus who, what regarding him, fact asserted, depth, role, the extractor's kind, fighter; a claim takes the value most of its articles give). Any two on the axes, filter chips on every value, click a cell to spot-check its claims, doubtful first. Built from stored answers only; the page stamps which answer versions built it. Under v7 the training articles show the key beside each answer, graded as `score.py` grades it; validation articles show no key, and test claims are left out until their one scoring run. A Distribution | Errors switch in the v7 view puts the nine questions against how many answers each training article gets wrong (validation as counts only); a cell opens its articles with the answer in question outlined, and a claim split across cells opens on the articles in the clicked cell, the rest one click away. Git-ignored like the board | |
| `board/build.py` → `board/board.html` | the review board: every claim with its articles, every classifier and extractor answer as a chip, Anton's ruling and Fable's doubts under the header, "suspected" pre-flags for body problems and exact copies. Reads only this folder; writes nothing back. `python3 golden/board/build.py` regenerates it (the page is git-ignored) | |

Words: **tier** is what the older docs (goals.md, the September grading) call *bucket*: tier 1 posts now, tier 2 goes to the digest, tier 3 does not reach the group. We speak in tier numbers (Anton, 2026-09-27). A speaker who is *in* for a fighter can reach tier 1 or 2; one who is *out* is always tier 3. A **claim** is a group of articles about one occasion (one
interview, one fight, one column), the unit the ruler groups by and the
unit production's `claims` table stores. An **extract** is the
extractor's one-sentence answer for a single article. A **story** is the
larger thing several claims may belong to; not labelled here yet.

`tools/import.py` is the import. Keep it for provenance; re-run it only
when the import itself changes, never because an experiment did.
