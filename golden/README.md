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
| `verdicts.md` | Anton's rulings, verbatim, **append only**. One heading per claim: `## YYYY-MM-DD — story-NNN (#ids): <ruling>` (headings keep the `story-` spelling they were written with) | 65 headings |
| `answers/classifier.json` | the six classifier answers per article, majority of three readers, plus the tier; `readers` = each of the three readers' probability over every option | 300 |
| `answers/questions.json` | the six questions as asked: instructions and every option's text | 6 |
| `answers/classifier-v2.json` | the five v2 questions from the answers-to-buckets experiment (role, speaker, act, kind, depth), majority of three orders; shown on the board, decides nothing | 300 |
| `answers/types-fable.json` | Fable's sorting of the 129 v3 claims (claim-067 is now inside claim-054) into four families and 28 types (the types report); a pre-fill to check against the text, not a ruling | 129 |
| `answers/bout-prefill.json` | the extractor's most common `bout` per claim; a pre-fill, not a ruling | 63 filled |
| `answers/extractor.json` | the extractor's answer per article: kind, extract (field `claim`), occasion, actor, opponent, event, date; `second_run` = the same prompt run again unchanged; `fields` and `kind_options` = the prompt's own definitions | 300 |
| `labels.json` | *not yet written* — per claim: kind, speaker, bout, tier; per article: body_unusable, same_page_as, primary_source | |
| `split.json` | *not yet written* — tune/test by claim, fixed seed | |
| `plan.html` | the big picture: every pipeline station, what the golden set still needs for it, each task's status (done / next / to do / parked) and why it matters. Hand-edited: the `PATH`, `NOW` and `STATIONS` blocks at the bottom. **Update it in the same commit whenever a task changes status**; published as a private artifact at https://claude.ai/artifact/L412VXv6JRP2kFKQogBo7v (republish after editing) | |
| `board/build.py` → `board/board.html` | the review board: every claim with its articles, every classifier and extractor answer as a chip, Anton's ruling and Fable's doubts under the header, "suspected" pre-flags for body problems and exact copies. Reads only this folder; writes nothing back. `python3 golden/board/build.py` regenerates it (the page is git-ignored) | |

Words: **tier** is what the older docs (goals.md, the September grading) call *bucket*: tier 1 posts now, tier 2 goes to the digest, tier 3 does not reach the group. We speak in tier numbers (Anton, 2026-09-27). A speaker who is *in* for a fighter can reach tier 1 or 2; one who is *out* is always tier 3. A **claim** is a group of articles about one occasion (one
interview, one fight, one column), the unit the ruler groups by and the
unit production's `claims` table stores. An **extract** is the
extractor's one-sentence answer for a single article. A **story** is the
larger thing several claims may belong to; not labelled here yet.

`tools/import.py` is the import. Keep it for provenance; re-run it only
when the import itself changes, never because an experiment did.
