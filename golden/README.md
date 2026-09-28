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
| `answers/readers-v1.json` | **provisional labels for all 300**: two Fable readers, blind, from experiments/2026-09-27-answer-key/key-guide.md; an Opus reader on their differences (`status` agreed / majority / split). `part` = tune or held_back for the 59 answer-key articles, not_key for the rest (never tuned on); `body_ruling` flags saved text ruled unusable or cut. For Anton to correct on the correction page; not his labels | 300 |
| `answers/types-fable.json` | Fable's sorting of the 129 v3 claims (claim-067 is now inside claim-054) into four families and 28 types (the types report); a pre-fill to check against the text, not a ruling | 129 |
| `answers/bout-prefill.json` | the extractor's most common `bout` per claim; a pre-fill, not a ruling | 63 filled |
| `answers/extractor.json` | the extractor's answer per article: kind, extract (field `claim`), occasion, actor, opponent, event, date; `second_run` = the same prompt run again unchanged; `fields` and `kind_options` = the prompt's own definitions | 300 |
| `labels.json` | *not yet written* — per claim: kind, speaker, bout, tier; per article: body_unusable, same_page_as, primary_source | |
| `split.json` | *not yet written* — tune/test by claim, fixed seed. **Must put the 58 claims of experiments/2026-09-27-answer-key/key-articles.json on the tune side**: the classifier questions were tuned on them | |
| `plan.html` | the big picture: every pipeline station, what the golden set still needs for it, each task's status (done / next / to do / parked) and why it matters. Hand-edited: the `PATH`, `NOW` and `STATIONS` blocks at the bottom. **Update it in the same commit whenever a task changes status**; published as a private artifact at https://claude.ai/artifact/L412VXv6JRP2kFKQogBo7v (republish after editing) | |
| `board/map.py` + `board/map-template.html` → `board/map.html` | the claim map: every claim described on eight dimensions from the answers (a gate — about him yes / partly / no — plus who, what regarding him, fact asserted, depth, role, the extractor's kind, fighter; a claim takes the value most of its articles give). Any two on the axes, filter chips on every value, click a cell to spot-check its claims, doubtful first. Built from stored answers only; the page stamps which answer versions built it. Git-ignored like the board | |
| `board/build.py` → `board/board.html` | the review board: every claim with its articles, every classifier and extractor answer as a chip, Anton's ruling and Fable's doubts under the header, "suspected" pre-flags for body problems and exact copies. Reads only this folder; writes nothing back. `python3 golden/board/build.py` regenerates it (the page is git-ignored) | |

Words: **tier** is what the older docs (goals.md, the September grading) call *bucket*: tier 1 posts now, tier 2 goes to the digest, tier 3 does not reach the group. We speak in tier numbers (Anton, 2026-09-27). A speaker who is *in* for a fighter can reach tier 1 or 2; one who is *out* is always tier 3. A **claim** is a group of articles about one occasion (one
interview, one fight, one column), the unit the ruler groups by and the
unit production's `claims` table stores. An **extract** is the
extractor's one-sentence answer for a single article. A **story** is the
larger thing several claims may belong to; not labelled here yet.

`tools/import.py` is the import. Keep it for provenance; re-run it only
when the import itself changes, never because an experiment did.
