# Test suite design (2026-08-09)

## Why now

RingFacts has no test framework. What it has is four scripts at the repo root,
each written the day an incident happened: `verify-body-dedup.js`,
`verify-digest-tier.js`, and two `audit-*.js` scripts that read production data.
None of them run together, most need live credentials, and nothing fails when
they break.

That was survivable while Anton typed every commit. It stops being survivable
now that **autonomous check-in runs commit code every six hours**.
`docs/self-improvement.md` §4 tells those runs to verify before claiming, but
nothing enforces it — the principle is aspirational, not mechanical. A test
suite that runs on every commit makes it mechanical.

## What must be true for that to work

If tests run on every commit — including commits made by an unattended agent at
04:00 — then the commit-gating tests must be:

- **offline** (no network, no API keys, no database),
- **fast** (under a couple of seconds),
- **deterministic**.

That constraint is what produces the tiering below. It is not an aesthetic
preference; it is the only shape that survives contact with an autonomous
committer.

## The tiers

| Tier | Needs | Speed | When it runs |
|---|---|---|---|
| **1. Unit + fixture** | nothing | ms | every commit |
| **2. Pipeline** | nothing (fake store, stubbed matcher/embeddings) | ms | every commit |
| **3. Real SQL** | `TEST_DATABASE_URL` | seconds | manually, before deploy |
| *(not a tier)* **Matcher eval** | `ANTHROPIC_API_KEY`, costs money | minutes | on demand, when tuning the prompt |

Tier 3 skips itself when the env var is absent, so tiers 1–2 remain the commit
gate and never fail for want of a credential.

### Tier 1 — unit and fixture

Pure functions, exercised against reduced fixtures. In priority order, ranked by
how *invisible* the failure would be:

1. **`matchesSubject`** (`lib/feeds.js`). §5 of self-improvement.md states the
   problem plainly: outlet feeds are name-filtered before storage, so a dead
   `matchNames` stem drops real coverage leaving no row behind —
   indistinguishable from quiet news by any database query. This is the highest
   value test in the repo and the function is pure.
2. **`normalizeVerdict`** (`lib/matcher.js`). §4 records this nearly shipping
   with the `"7"`-vs-`7` bug that would have silently downgraded every real
   match. Every downgrade path gets a case.
3. **The extraction ladder** (`lib/extract.js`). Five rungs; which one fires is
   the whole question, and today only two are covered.
4. **`parseRssItems` / `parseFeedItems`** — Google's regular XML and the
   publishers' messier CDATA/Atom variants.
5. **`decodeFast`** (`lib/googlenews.js`), `isTangential` boundaries,
   `digestLine`, `alsoMentioningLine`, `cleanTitle`.

### Tier 2 — pipeline

Drives the real `huntSubject` end to end with a scripted world and asserts what
came out: posted, held as a duplicate, folded into the "also mentioning" line,
or dropped as the wrong subject — with reasons and ordering.

This is where edge cases accumulate over time. It covers, specifically:

- the URL gate under both identities (`url` and `resolved_url`),
- the 0.80 semantic-duplicate gate and the official-source exemption,
- the exemption's re-application on `UNSURE` / `NO_CLAIM`,
- the digest tier split and the suppression branch when *everything* was
  tangential,
- claim lifecycle: `NEW` → rumor, official → confirmed, `MATCH` → held echo,
- **fail-open behaviour**, which AGENTS.md asserts and nothing currently
  verifies: embeddings throwing must degrade to URL-only dedup; a matcher
  throwing must become `UNSURE` and post as before.

### Tier 3 — real SQL

The queries a fake cannot check: the dual-identity `knownUrls`, `nearestRecent`'s
pgvector cosine, the claims round-trip, and whether `schema.sql` still matches
what the code expects. Runs against a Neon branch.

### The matcher eval — deliberately not a test

The matcher is nondeterministic. `TODO.md` records four runs of byte-identical
code returning `NO_CLAIM`×3 and `NEW`×1. Assertions built on that will flake,
and a suite you learn to ignore is worse than no suite. So the matcher is
stubbed everywhere in tiers 1–3, and its real behaviour is measured separately:

- a labelled corpus (~30 items drawn from the real `items` archive),
- each item run K times, scored as a **pass rate with spread**, never pass/fail,
- run on demand, never on commit.

**Its first job is a question already sitting open in TODO.md**: `temperature`
is unset, and setting it to 0 was deferred because the `lib/tier.js` thresholds
were measured against sampled behaviour. Run the corpus at default temperature
and at 0, compare pass rates, and the decision stops being a guess. This is §1's
"measurement, not intuition" applied to the one component a test cannot pin.

Built second, after the deterministic suite. Building it first would be
instrumenting-and-never-looking — the failure mode §1 names.

## Fixtures: reduced, not captured whole

Fixtures are **reduced structural skeletons**, not saved article pages.

The obvious alternative — download the real page, commit the HTML — was
rejected for two reasons. First, this repo is public and MIT-licensed;
committing full article HTML from Sports Illustrated or MMA Fighting is
republishing their content. Second, today's `verify-body-dedup.js` already
demonstrates the better pattern by accident: it reconstructs the Sports
Illustrated paragraph-doubling pathology from three paragraphs rather than
saving the page. The result is smaller, faster, and self-documenting — the
fixture *names the pathology it targets*, so a reader learns why it exists.

Each fixture carries a header comment recording its source URL, the date
observed, and the pathology it encodes. A fixture without a stated pathology is
a fixture nobody can maintain.

## Seams the suite requires

Two things block tier 2 as the code stands, and both are real design problems
independent of testing:

1. **`hunter.js` reads `DRY_RUN`, `TELEGRAM_CHAT_ID`, and `HOURS_BACK` at import
   time** (lines 35–38), and `domain/index.js` reads `DOMAIN` at import. Nothing
   can vary them per case.
2. **`huntSubject` calls `matchItem`, `embedTexts`, `sendTelegramMessage` and
   the `lib/db.js` functions directly**, so none can be substituted.

The fix is one optional parameter:

```js
export async function huntSubject(db, subject, directItems = [], deps = {})
```

`deps` defaults to the real implementations and the env-derived config, so
production behaviour is unchanged. Database access is injected as a single
**store** object (the `lib/db.js` module namespace by default), because faking at
the client level would mean a fake that answers SQL strings — brittle, and it
would drift from Postgres silently. Faking at the store level makes the seam
honest: the store is an interface, the real one talks Postgres, the fake one
talks to a `Map`, and tier 3 tests the real one.

Feeding items needs no seam at all. A subject with `aliases: []` and items
passed as `directItems` already bypasses all network fetching — and routes
through `matchesSubject`, so the name filter gets exercised on the way in.

## Runner and gate

`node --test`. Built into Node, zero dependencies. This repo has two production
dependencies and no dev dependencies; adding Vitest to test 1,900 lines would be
the wrong trade. Test files sit next to what they test as `lib/*.test.js`.

A `pre-commit` hook runs `npm test`. Installed via `git config core.hooksPath
.githooks` so the hook is version-controlled rather than living untracked in
`.git/`. `docs/self-improvement.md` §4 gains a line saying the gate exists and
that an autonomous run must not bypass it with `--no-verify`.

## Migration of the existing scripts

- `verify-body-dedup.js` → `lib/extract.test.js`. It is already this shape; it
  loses its hand-rolled `check()` harness and gains `node:test` structure.
- `verify-digest-tier.js` → tier 2. It stops needing three API keys and a live
  database, and stops being nondeterministic.
- `audit-*.js` stay exactly where they are. They measure production data to tune
  thresholds — that is instrumentation, not testing, and conflating the two
  would break §1's measurement discipline.

## What this design deliberately does not do

- **No CI.** The commit hook is the gate. Cloud Run deploys from `setup.sh`, not
  from a pipeline, so a GitHub Actions workflow would test code that is already
  committed and add a second place for the rules to live.
- **No coverage threshold.** A percentage target rewards testing whatever is
  easiest, which here would be the formatting helpers rather than the name
  filter that can lose coverage silently.
- **No mocking library.** The seams are plain function parameters with defaults.
