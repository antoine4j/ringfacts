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
| `claims.json` | the ruler, v3: one claim = one occasion with its articles; keys `claim-NNN`, `.x` = children of a split; `fable` = Fable's stored confidence and doubts from its grouping passes; `from` = the v2 keys a rebuilt claim came from | 129 |
| `verdicts.md` | Anton's rulings, verbatim, **append only**. One heading per claim: `## YYYY-MM-DD — story-NNN (#ids): <ruling>` (headings keep the `story-` spelling they were written with) | 65 headings |
| `answers/classifier.json` | the six classifier answers per article, majority of three readers, plus the bucket | 300 |
| `answers/extractor.json` | the extractor's answer per article: kind, extract (field `claim`), occasion, actor, opponent, event, date | 300 |
| `labels.json` | *not yet written* — per claim: kind, speaker, bout, tier; per article: body_unusable, same_page_as, primary_source | |
| `split.json` | *not yet written* — tune/test by claim, fixed seed | |
| `board/build.py` → `board/board.html` | the review board: every claim with its articles, every classifier and extractor answer as a chip, Anton's ruling and Fable's doubts under the header, "suspected" pre-flags for body problems and exact copies. Reads only this folder; writes nothing back. `python3 golden/board/build.py` regenerates it (the page is git-ignored) | |

Words: a **claim** is a group of articles about one occasion (one
interview, one fight, one column), the unit the ruler groups by and the
unit production's `claims` table stores. An **extract** is the
extractor's one-sentence answer for a single article. A **story** is the
larger thing several claims may belong to; not labelled here yet.

`tools/import.py` is the one-time import. Keep it for provenance; do not
re-run it.
