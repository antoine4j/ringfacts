# Domains

A **domain** is everything the tracker knows about a subject area. The pipeline
itself — fetch, dedup, semantic dedup, body extraction, claim matching,
tiering, posting — never mentions MMA, fighters, or fights. Swap the domain and
the same machinery tracks musicians, politicians, or company executives.

Select one with the `DOMAIN` environment variable (default: `mma`).

## The contract

A domain module default-exports one object:

| Field | What it is |
|---|---|
| `id` | Must match the key in `domain/index.js`'s map. |
| `outlets` | `{id, name, url, lang}` records. Fetched once per run, filtered per subject by name. |
| `officialSource` | Regex tested against an item's source name. Matching sources *born-confirm* claims — a rumor from one arrives already confirmed. |
| `claimTypes` | The claim vocabulary. Single source of truth: the matcher builds both the tool enum and its validation gate from this. |
| `loudTypes` | Subset of `claimTypes` that earns its own message while still a rumor. Everything else rides the digest. |
| `ignoredTypes` | Subset treated as "asserts nothing worth tracking". |
| `ceremonyType` / `ceremonyLabel` | The type that gets a standalone post once confirmed, and its headline. |
| `prompt` | Nouns and example strings spliced into the matcher prompt. |

`domain/index.js` validates this at startup — missing fields and types routed
but absent from `claimTypes` throw immediately rather than failing mid-run.

## Two traps

**The outlet-name contract.** `officialSource` is tested against an outlet's
`name`, not its URL or id. In the MMA domain, the UFC feed is named exactly
`"UFC"` so that it matches — rename it and official confirmation silently stops
working. The two fields live in the same file for this reason. `index.js` warns
at startup if `officialSource` matches no outlet name, which is legal (the
authority may only appear via Google News) but usually a mistake.

**Prompt fragments are prompt text.** The strings under `prompt` are spliced
into sentences the model reads. Editing them changes model behavior as surely
as editing the prompt itself. They are worded to slot in verbatim — check the
rendered result, not just the fragment.

## Thresholds are not in here

`lib/tier.js` holds the tangential-mention thresholds, and the semantic-dedup
cutoff lives in `hunter.js`. Both were **measured** against a real MMA corpus,
not guessed. They are env-overridable (`TIER_MIN_BODY`, `TIER_MAX_MENTIONS`)
precisely because a new domain should re-measure rather than inherit numbers
derived from someone else's press conventions.

## Adding one

Copy `mma.js`, replace every value, then add an import and a map entry in
`index.js`. Nothing else in the codebase should need to change — if it does,
that's a domain assumption that leaked into the pipeline and belongs here.
