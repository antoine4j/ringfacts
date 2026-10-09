# research/

Everything here measures the pipeline; nothing here runs in it. The hourly
job and the v0 pipeline never import from this folder (only tests read it, to
check that a station still uses the prompt an experiment scored), and Cloud
Build never uploads it (`.gcloudignore`).

| Folder | What it holds |
|---|---|
| [experiments/](experiments/) | One folder per experiment, named `<date>-<name>`: its README (question, method, result), the exact prompts each pass ran with, and the scripts. What was learned is collected in [docs/lessons.md](../docs/lessons.md). |
| [bench/](bench/README.md) | Runs a battery of articles through one pipeline step on the test keys and the bench database. |
| [corpus/](corpus/README.md) | The first labelled evaluation corpus (48 articles), superseded for scoring by the golden set in [golden/](../golden/README.md). |

`labels/` (removed 2026-10-08) held the tools of the first labelling round,
4–8 Sep: reviewer batches, answer checks, the review sheet, and the story-gate
measurements, with `bench/story.js`. The golden set replaced that round, and
the tools read data that no longer exists. Older docs still cite them;
`git log --diff-filter=D -- research/labels labels` finds the removal (the
folder sat at the root, as `labels/`, until 2026-10-06), and its parent commit
has every file.

Article text stays on this machine. Each experiment keeps its record and
machinery in git: the findings, prompts, scripts, answers, extracts and
scores. The sampled article bodies, the batches that carry them, the raw
per-call answers and pages rebuilt from them are ignored by the rules in
[.gitignore](../.gitignore) ([why](../docs/decisions.md#article-text-out-of-git));
the front-page README's "What is public, and what is not" says the same for
the whole repository.

The production bot's own files (`hunter.js`, `server.js`, `lib/`, `domain/`,
`scripts/`, `test/`) stay at the repository root until production is retired
in favour of [v0/](../v0/README.md), so its deploy command and Dockerfile
keep working unchanged.
