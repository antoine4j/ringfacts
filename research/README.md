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
| [labels/](labels/) | The tooling for the September labelling rounds: batch building, reviewer-output checks, story grouping. |

Article text stays on this machine. Each experiment keeps its record and
machinery in git; the sampled article bodies and anything built from them are
ignored by the rules in [.gitignore](../.gitignore)
([why](../docs/decisions.md#article-text-out-of-git)).

The production bot's own files (`hunter.js`, `server.js`, `lib/`, `domain/`,
`scripts/`, `test/`) stay at the repository root until production is retired
in favour of [v0/](../v0/README.md), so its deploy command and Dockerfile
keep working unchanged.
