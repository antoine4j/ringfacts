# Precision scoreboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/scores` page in the storyboard, plus a one-line strip on
the claims list, showing the live launch-bar and grooming numbers and the
golden replay's stored result, each with its count, method and weakness.

**Design:** [the technical design](../specs/2026-10-09-precision-scoreboard-design.md)
(§1–§11, with the decisions Q1–Q3 of 2026-10-10). That design closes the
gaps in [the scoreboard spec](../specs/2026-10-06-precision-scoreboard.md)
(D1–D10). This plan cites both by section and decision number and does
not restate them.

**Two phases:**

- **Phase 1** ships the page without the new table: five live numbers
  (events not posted, repeats in tier 1, 👎 share, over-merge,
  over-split), the replay reference, the strip, Wilson intervals, and the
  README stopgap (Q1).
- **Phase 2** adds `review_tiers` (design §4), its grants, the
  claim-level tier control, and the wrong-tier rate.

**Tech stack:** Next 16 (App Router, server components, `pg`), TypeScript
run by Node 22 with type stripping, `node --test`.

## Global constraints

- **Code style:** follow [docs/code-style.md](../../code-style.md).
  - Every function gets a JSDoc block with `@param` and `@returns`.
  - Every block inside a function gets a one-line comment.
  - No decision history in code: write a pointer such as
    `docs/decisions.md#scores-page` instead.
  - Functions stay under ~50 lines, and names are never short.
- **Tests after every step.** All three must be green:
  - `npm test` at the repository root;
  - `npm test --prefix v0` (the pipeline and storyboard specs; the
    pre-commit hook runs it too);
  - from `v0/storyboard/`, `npm run build` for any step that touches
    `app/`, `components/` or `next.config.ts`.

  Never use `--no-verify`.
- **One finished change per commit.** Work on the local branch
  `scoreboard`. Write each commit message for a visitor, ending with the
  `Co-Authored-By` trailer.
- **Database:**
  - Local runs read the **development branch** with the editor role:
    `DATABASE_URL=$(grep '^V0_DEV_EDITOR_DATABASE_URL=' ../../.env.v0 | cut -d= -f2-) npm run dev`
    (v0/storyboard/README.md).
  - The scores page only reads. Never print the address.
- **No paid runs.** The golden replay is not re-run by this plan (D7: a
  re-run follows a station change, and there is none here). The test
  column stays "not yet run".

## Gates: what needs the maintainer's go

| Step | Why |
|---|---|
| P1.11 push → Vercel preview, then production | A push deploys the storyboard (every push builds) and publishes to the public repo |
| P1.12 README numbers | The numbers are copied from the deployed page, so this follows P1.11 and goes out in a push |
| P2.1 migration (development branch, then main) | Schema change, run with the owner's address |
| P2.6 push | Deploy |

Nothing here touches the golden set or its test split, the pipeline's
stations, the Telegram group, or Cloud Run. If a step seems to need any
of them, stop and ask.

## File map

| File | Phase | Responsibility |
|---|---|---|
| `v0/storyboard/next.config.ts` | 1 | `outputFileTracingIncludes` for `/scores` (design §1) |
| `v0/storyboard/lib/wilson.ts` (+ `.spec.ts`) | 1 | `wilson(successes, trials)` (§5) |
| `v0/pipeline/measure/career-events.json` | 1 | The hand-kept list (§3), shipped with an empty `events` |
| `v0/storyboard/lib/career-events.ts` (+ spec) | 1 | Validate the file; compute each event's status and cause (§3) |
| `v0/storyboard/lib/scores.ts` (+ spec) | 1, 2 | Pure functions for every live number (§2), plus the "How" and "Weakness" text |
| `v0/storyboard/lib/score-queries.ts` | 1, 2 | The SQL that feeds `scores.ts` |
| `v0/storyboard/lib/replay-results.ts` (+ spec) | 1 | List, parse and sort the result files; pick the headline and the history (§2, §7) |
| `v0/pipeline/measure/replay.ts`, `replay-score.ts` | 1 (2: `REPLAY_TABLES`) | Write `versions`, `run_started_at` and pair counts (§7) |
| `v0/storyboard/lib/dates.ts` (+ spec) | 1 | The `last_14` preset |
| `v0/storyboard/components/ScoreCard.tsx`, `ScoreRow.tsx`, `ScoreStrip.tsx`, `PeriodPicker.tsx` | 1 | The layout of design §6 |
| `v0/storyboard/app/scores/page.tsx` | 1, 2 | The page |
| `v0/storyboard/components/Nav.tsx` | 1 | A "Scores" link after Claims |
| `v0/storyboard/app/page.tsx` | 1, 2 | The strip |
| `v0/schema.sql`, `v0/grants.sql` | 2 | `review_tiers` and its grants (§4) |
| `v0/storyboard/lib/tier-marks.ts` (+ spec) | 2 | The tier mark in force, including stale and cleared marks (§4) |
| `v0/storyboard/app/review-actions.ts`, `components/TierReview.tsx`, `app/claims/[id]/page.tsx` | 2 | The claim-level control |
| Docs (see P1.10, P2.5) | 1, 2 | The record |

## Two gaps found while planning, decided here

Both are written into the design (§3, §2) in step P1.3's commit, so the
code and the design agree.

1. **A Digest claim still waiting for its digest is not a miss.**
   - Design §3 counts a Digest claim that reached no digest as a "digest
     omission" (missed). But digests are periodic: a claim whose
     fighter's next digest has not been written yet has not been left out.
   - **Decided:** such a claim's status is **"waiting for the digest"**
     when no digest for that fighter has `period_end` after the claim's
     first reading. It counts as not posted (it fails G1's timing either
     way), but its cause is not "omission".
   - This needs nothing new: `digests.fighter` and `period_end` exist.
2. **The strip's wording follows Q3.** Design §1's example says "events
   missed 0 of 2". After Q3 the strip shows **"events not posted 0 of
   2"**, the headline number of §2.

---

## Phase 1: the page, without the tier mark

### P1.1 De-risk first: ship the replay files with the page

**Files:**
- `v0/storyboard/next.config.ts`;
- a stub `v0/storyboard/app/scores/page.tsx`, which lists the result
  file names and nothing else;
- `v0/storyboard/lib/replay-results.ts`, its `resultFiles()` function only.

**Steps:**

- [ ] Add the tracing include to `next.config.ts`, with a block comment
  saying why:
  ```ts
  outputFileTracingIncludes: { "/scores": ["../pipeline/measure/replay-results/*.json"] },
  ```
- [ ] Write `resultFiles()`. It reads
  `path.join(process.cwd(), "../pipeline/measure/replay-results")` with
  `readdirSync` and returns the `.json` names, sorted.
- [ ] Have the stub page render that list.
- [ ] Run `npm run build` in `v0/storyboard`.
- [ ] Open `.next/server/app/scores/page.js.nft.json` and confirm that
  both `replay-results/2026-10-05T10*.json` paths are listed.
- [ ] Run `npm run dev` and open `/scores`. Both file names show.

**If the files are not in the trace,** use the fallback, a generated
file:

- Add `v0/storyboard/scripts/collect-replay-results.ts`. It reads the
  directory and writes `v0/storyboard/lib/generated/replay-results.json`
  (git-ignored) as `{ files: [{ name, content }] }`.
- Wire it in as `"prebuild"` and `"predev"` in the storyboard's
  `package.json`.
- `resultFiles()` then imports that JSON statically, so nothing is read
  from disk at request time.

**The local trace is evidence, not proof.** The deployed check is in
P1.11 and needs the maintainer's go. Record the outcome, include or
fallback, as `docs/decisions.md#scores-page` (one short entry: what was
tried, what the trace showed).

**Commit:** `Scores page: ship the replay result files with the page`

### P1.2 The Wilson interval

**Files:** `v0/storyboard/lib/wilson.ts` and `lib/wilson.spec.ts` (§5).

- [ ] Write the spec first. It covers the four worked examples of §5, to
  four places: 2/57 → 0.0097–0.1192, 0/20 → 0–0.1611, 95/155 →
  0.5344–0.6860, 8/9 → 0.5650–0.9801. It also covers `wilson(0, 0) ===
  null`, and `low` ≥ 0 and `high` ≤ 1 at k = 0 and k = n.
- [ ] Run it and watch it fail. Write the function. Run it and watch it
  pass.
- [ ] Mutation check: change 1.96 to 1.64. The spec must fail. Then
  restore it.

**Verify:** `npm test --prefix v0`.

### P1.3 The career events list

**Files:**
- `v0/pipeline/measure/career-events.json`: `checked` is today's date,
  the `how` sentence of §3, and `events: []`.
- `v0/storyboard/lib/career-events.ts` and its spec.
- The design doc, for the two planning gaps above.

**Interfaces:**

```ts
export type CareerEvent = { id: string; fighter: string; kind: EventKind; happened: string; what: string; first_report: string; claim_ids: number[]; note: string };
export type ClaimFacts = { tier: "post" | "digest" | "drop" | null; posted: boolean; inPostedDigest: boolean; digestStillDue: boolean };
export type EventStatus =
  | { status: "posted" }
  | { status: "late" }
  | { status: "missed"; cause: "never_found" | "tier_3_drop" | "digest_omission" | "waiting_for_digest" };
export function validateEvents(file: unknown): string[];                       // problems found; [] when the file is good
export function eventStatus(event: CareerEvent, facts: Map<number, ClaimFacts>): EventStatus;
export function eventsInPeriod(events: CareerEvent[], from: string | null, to: string | null): CareerEvent[];
```

**Steps:**

- [ ] Load the file with a static JSON import
  (`import events from "../../pipeline/measure/career-events.json" with { type: "json" }`).
- [ ] Write the spec. Its cases:
  - the real file validates;
  - each problem is caught: a duplicate id, an unknown `kind`, a bad
    day, a `claim_ids` entry that is not a number;
  - one event for each status and cause;
  - a split, where two claim ids, one posted, give `posted`;
  - the period edges, inclusive on both ends.
- [ ] Mutation check: make `late` win over `posted`. The spec must fail.
  Then restore it.

**Verify:** `npm test --prefix v0`.

### P1.4 The live numbers as pure functions

**Files:** `v0/storyboard/lib/scores.ts` and `lib/scores.spec.ts`.

**Interfaces** (all pure, over rows; ids are strings as `pg` returns
bigints):

```ts
export type Share = { count: number; of: number };
export function claimTier(memberTiers: (number | null)[]): "post" | "digest" | "drop" | null;   // §2, best tier
export function sealedClaims(views: Map<string, ClaimReviewView>): string[];                    // state "reviewed"
export function reopenedClaims(views, lastMarkAt: Map<string, Date>, joinedAt: Map<string, Map<string, Date>>): string[];
export function overMerge(sealed: string[], views): Share;                                     // readings ✕ over readings
export function overSplit(sealed: string[], groupOf: Map<string, string[]>): Share;
export function tier1Repeats(postedClaims: string[], groupOf: Map<string, string[]>): Share;   // extra posts per group over posts
export function thumbsDownShare(messages: { latest: string | null }[]): Share & { unreacted: number };
export function versionsInForce(rows: VersionRow[], firstUsed: FirstUsedRow[]): { inForce: Record<Station, string>; mixed: { station: Station; versions: { version: string; firstUsed: Date }[] }[] };
export function isThin(share: Share): boolean;                                                 // of < 30 (D9)
export const EXPLAIN: Record<NumberKey, { how: string; weakness: string }>;                    // visitor wording (D10)
```

**Steps:**

- [ ] Reuse `marksInForce`, `claimReview` and `sameClaimGroups` from
  `lib/reviews.ts`. Do not re-implement them.
- [ ] Write the spec on hand-made rows. One case per number, plus:
  - a reading marked `own_claim` counts as ✕;
  - a "same claim" group of three posted claims counts 2 repeats;
  - a reaction later removed (newest emoji `null`) counts as unreacted;
  - two classifier versions among the counted readings give a `mixed`
    entry with both first days;
  - a claim that has a new reading after its last mark is reopened, and
    is not sealed.
- [ ] Mutation check: count `own_claim` as belonging. Over-merge's spec
  must fail. Then restore it.

**Verify:** `npm test --prefix v0`.

### P1.5 The queries

**File:** `v0/storyboard/lib/score-queries.ts`.

Each function is one query, takes the day range from `dateFilter`, and
returns rows typed for `scores.ts`:

- [ ] `claimsInPeriod(range)`: use `claimFilter` with only
  `when`/`from`/`to` passed through (D5), then reuse `claimMembers` and
  `reviewsFor` from `lib/queries.ts`.
- [ ] `messagesInPeriod(range)`: tier-1 posts (`claims.posted_reading_id`
  → `readings.posted_at`, `message_id`) and digests (`posted_at`,
  `message_id`, not `backfill`). Each carries
  `latestReaction("<alias>.message_id")`. The day is the Pacific day of
  `posted_at`.
- [ ] `claimFacts(claimIds)`: the `ClaimFacts` of P1.3 for the claims the
  career events name.
  - `inPostedDigest` uses `digest_claims.used` on a digest with
    `posted_at`.
  - `digestStillDue` is true when no digest for the claim's fighter has
    `period_end` after the claim's first reading.
- [ ] `versionRows(claimIds)` and `firstUsedRows()`: the two queries of
  design §7, as written there.
- [ ] `lastMarkTimes(claimIds)` and `joinTimes(claimIds)`: for reopened
  claims.

**Verify:**

- `npm run build` checks the types.
- Then write a throwaway `/scores` body that prints each query's row
  count, run `npm run dev` against the development branch, and check
  each count by eye against a `psql` count of the same thing.
- Delete the throwaway body before committing. The repo has no SQL test
  tier for v0, so this local check is the verification. Say so in the
  commit body.

### P1.6 The replay result files carry their versions

**Files:**
- `v0/pipeline/measure/replay.ts`;
- `v0/pipeline/measure/replay-score.ts`;
- `v0/pipeline/measure/replay-results/2026-10-05T1019-earliest-on-tie.json`.

**Steps:**

- [ ] Add `runVersions(pool)` to `replay.ts`.
  - It runs the `string_agg` query of design §7 and returns
    `{ classifier, extractor, grouping, settings }`.
  - When any value contains a comma, it logs a warning naming the
    station.
  - Write `versions` and `run_started_at` (an ISO time taken when the run
    starts) into the result file, beside `scores`.
- [ ] In `groupingScores`, return
  `pairs: { v0_same, ruled_same, both_same }` beside the two ratios.
  These are the three counters the function already keeps.
- [ ] Backfill only the 1019 file: add `"versions": { "classifier":
  "v7.7", "extractor": "p4", "grouping": "g1", "settings": "1" }` and
  `"run_started_at": "2026-10-05T10:19:41Z"`, copied from
  `golden/replays/2026-10-05T1019-earliest-on-tie/manifest.json`.
  - Leave the 1013 file alone (design §7).
  - Neither old file gets `pairs`: the page shows "pair counts not
    recorded".
- [ ] Do **not** run the replay: it is paid, and D7 says no.
  `replay.ts` is checked by `node --check` and the build's types only.
  Say so in the commit body.

**Verify:** `npm test --prefix v0`. Then `node --check` (or `tsc
--noEmit`, if the pipeline has a tsconfig) on both files.

### P1.7 Reading the result files

**Files:** `v0/storyboard/lib/replay-results.ts` (built on P1.1's
`resultFiles()`) and `lib/replay-results.spec.ts`.

```ts
export type ReplayResult = { name: string; runDate: string; versions: Versions | null; sides: { training: SideScores; validation: SideScores; test: SideScores | null } };
export function parseResult(name: string, json: unknown): ReplayResult;   // "8 of 9" → { count: 8, of: 9 }
export function headlineAndHistory(results: ReplayResult[]): { headline: ReplayResult | null; history: ReplayResult[] };   // newest name first
```

- [ ] Write the spec. Its cases:
  - parse the two real files from disk;
  - the 1019 file is the headline, and it has versions;
  - the 1013 file has `versions === null`;
  - `"8 of 9"` parses;
  - a file without `test` gives `test: null`, which the page shows as
    "not yet run".

**Verify:** `npm test --prefix v0`.

### P1.8 The page

**Files:**
- `v0/storyboard/lib/dates.ts` (+ its spec), for the `last_14` preset,
  labelled "last 14 days";
- `components/PeriodPicker.tsx`, `ScoreCard.tsx` and `ScoreRow.tsx`;
- `app/scores/page.tsx`, which replaces the stub;
- `components/Nav.tsx`;
- `app/globals.css`.

**Steps:**

- [ ] Add `last_14` to `PERIODS` and `periodRange`, with a spec case.
  The preset also appears on the other pages' filter bars. That is
  intended.
- [ ] Build `PeriodPicker`: the date part of `FilterBar` alone. If
  `FilterBar`'s date controls cannot be separated cleanly, copy only
  their markup and reuse `PERIODS` and `linkWith`.
- [ ] Build the page in the section order of design §6. The live
  sections come first: the launch bar (three `ScoreCard`s, each with
  `wilson`, a ✓ or ✕ against its bar, its slice line, and `EXPLAIN`'s How
  and Weakness), then grooming.
  - Grooming shows over-merge and over-split as `ScoreRow`s, greyed when
    `isThin`. The wrong-tier row reads "not measured yet: the tier mark is
    being built" (§4).
  - Then the replay reference: the headline file's three columns,
    `<details>` for each question, and the history lines.
  - Under the launch-bar heading, a link to `?when=last_14`.
  - The versions line, and the warning line when `mixed` is not empty.
  - The career-events card shows "list last checked …" when `checked` is
    earlier than the period's last day.
- [ ] Add "Scores" to `Nav.tsx` after Claims. The page ignores
  `?schema=` (§1), so the replay switch has no effect there.
- [ ] Theme: use only the existing colour tokens, so dark mode works.
  The grey-out is the existing muted token.

**Verify:**

- `npm test --prefix v0` and `npm run build`.
- With `npm run dev` against the development branch, open `/scores`,
  `/scores?when=last_14` and `/scores?when=last_7`.
  - Each section renders.
  - Counts change with the period, and the replay section does not.
  - The page holds at 390 px wide without sideways scrolling, in light
    and dark.
- Take one screenshot of each width for the commit's check-in note.

### P1.9 The strip on the claims list

**Files:** `components/ScoreStrip.tsx` and `app/page.tsx`.

- [ ] **Before** changing anything, run the
  claims list ten times locally and note the median time:
  ```bash
  for i in $(seq 10); do curl -s -o /dev/null -w '%{time_total}\n' http://localhost:3000/; done | sort -n
  ```
- [ ] Add the strip under the `<h1>` for live data only (not when
  `?schema=replay`). It is all time (D5), counts only, and links to
  `/scores`. Its wording follows the planning gap above ("events not
  posted"), and it leaves out wrong tier until phase 2.
- [ ] Measure again the same way. Report both medians in the commit
  body.
  - If the strip adds more than ~300 ms, fold its claim and member rows
    into the page's existing member query (design §11, "Load time"), and
    measure again.
  - Do not add a cache.

**Verify:** `npm run build`; the two timings; the strip's counts equal
the `/scores` all-time numbers.

### P1.10 The record (docs that ship with phase 1)

- [ ] `v0/storyboard/README.md`: a `/scores` row in the pages table,
  saying the replay reference and career events change only on a push.
- [ ] `docs/architecture-overview.html`: the storyboard section names
  the scores page. Re-read §13 "What is not measured" against design §2,
  and correct any sentence the page now contradicts.
- [ ] `docs/pages.html`: the Storyboard row's description adds "a scores
  page". Then republish the pages artifact
  (https://claude.ai/artifact/1Rygvkb1d3UdMJaJBU2RQk) per AGENTS.md.
- [ ] `docs/index.html` and `docs/funnel-walkthrough.html`: re-read them.
  Change nothing unless a sentence is now false; the pipeline is
  untouched.
- [ ] `TODO.md` item 2 and `docs/launch-map.html`: phase 1 done, phase 2
  open.
- [ ] `docs/decisions.md#scores-page` exists from P1.1. Check that the
  code points to it, rather than repeating it.

**Verify:** `npm test` (root).

### P1.11 Deploy and confirm on Vercel — **needs the maintainer's go**

- [ ] Ask for the go to push the `scoreboard` branch, which gives a
  Vercel preview.
- [ ] On the preview, `/scores` shows the replay reference with the 5 Oct
  run. That confirms P1.1 on the real platform.
  - If the section is empty or errors, switch to P1.1's fallback,
    commit, and push again.
- [ ] With a second go, merge to `main`. Every push builds production.

### P1.12 The README stopgap (Q1) — **after P1.11**

- [ ] Copy the deployed page's numbers, all time and dated, into
  README's "How it is measured" table: three launch-bar rows and the two
  grooming rows that exist.
  - Each row gets its count, its interval where it is a headline, and
    the words "over claims chosen by hand".
  - Change the closing paragraph: the scoreboard is built, private, and
    copied here at each version change (design §9).
- [ ] The README goes out in the next push. That is the same gate as
  P1.11.

---

## Phase 2: the tier mark and the wrong-tier rate

### P2.1 The table and its grants — **the migration needs the maintainer's go**

**Files:**
- `v0/schema.sql`: the `review_tiers` block of design §4, verbatim, and
  `review_tiers` added to the `refuse_update` trigger array;
- `v0/grants.sql`:
  `GRANT INSERT ON public.review_tiers TO v0_editor;`, with a comment that
  it is live only, like the other marks;
- `v0/pipeline/measure/replay.ts`: `review_tiers` added to
  `REPLAY_TABLES`.

**Steps:**

- [ ] Commit the SQL. Then ask for the go to apply it:
  1. On the **development branch** first:
     `V0_OWNER_URL=<dev owner address> node v0/pipeline/store/migrate.ts`
     (migrate.ts applies schema.sql to both schemas, then grants.sql).
  2. Check that both tables exist, and that `v0_editor` can insert into
     `public.review_tiers` but not update it (the trigger refuses).
  3. Then on **main**, the same way.
- [ ] Never print either address.
- [ ] Until main is migrated, nothing below may be deployed: the claim
  page would query a missing table.

**Verify:** `npm test --prefix v0`; the two checks above on the
development branch.

### P2.2 The tier mark in force

**Files:** `v0/storyboard/lib/tier-marks.ts` and its spec.

```ts
export type TierWord = "post" | "digest" | "drop";
export type TierMark = { id: string; claim_id: string; tier_had: TierWord; verdict: TierWord | "cleared"; note: string };
export type TierJudgement = { state: "not_judged" } | { state: "right" } | { state: "wrong"; shouldBe: TierWord; junk: boolean };
export function tierJudgement(marks: TierMark[], claimTierNow: TierWord | null): TierJudgement;
```

- [ ] The newest mark is in force; `cleared` gives `not_judged`.
- [ ] A mark whose `tier_had` differs from `claimTierNow` is stale and
  gives `not_judged` (§4).
- [ ] A verdict equal to `tier_had` gives `right`.
- [ ] `junk` is true when the verdict is `drop` on a claim shown as Post
  or Digest. Over-promotion (a `digest` verdict on a Post claim) is
  wrong, but not junk (§4).
- [ ] Spec: one case per rule above.
- [ ] Mutation check: drop the stale rule. The spec must fail. Then
  restore it.

**Verify:** `npm test --prefix v0`.

### P2.3 The control on the claim page

**Files:**
- `v0/storyboard/app/review-actions.ts`;
- `components/TierReview.tsx`;
- `app/claims/[id]/page.tsx`;
- `lib/queries.ts`, for the claim's tier marks.

**Steps:**

- [ ] Add a `markTier({ claimId, tierHad, verdict, note })` server
  action, shaped like `markReading`.
  - Live data only.
  - Refused when the claim's tier now differs from `tierHad`, because
    the page is out of date.
- [ ] Build `TierReview`: "Tier: Digest · should be: Post Digest Drop",
  with the mark in force tinted, and a small "clear" link when a mark is
  in force (§4). Each tap saves at once.
- [ ] Hide the control for a claim with no decided tier.

**Verify:**

- `npm run build`.
- Locally against the development branch (migrated in P2.1), on one
  claim:
  - mark it right, and check the row and the tint;
  - mark it wrong, and check;
  - clear it, and check it is back to not judged.
- Read the three rows back with `psql` as the owner.

### P2.4 The wrong-tier rate on the page, the strip and the G2 card

**Files:** `lib/scores.ts` (+ spec), `lib/score-queries.ts`,
`app/scores/page.tsx` and `app/page.tsx`.

**Steps:**

- [ ] Add `wrongTier(sealed, judgements): Share & { unjudged: number }`.
  - The numerator is sealed claims judged wrong.
  - The denominator is sealed claims judged at all.
  - `unjudged` is sealed claims not judged (§2, Q2).
- [ ] Add `junkSurfaced(judgements): number` for the 👎 card's G2 line
  ("junk surfaced: n", §4).
- [ ] Replace the "not measured yet" row with the real wrong-tier row,
  greyed under 30, followed by "N reviewed claims not yet judged".
- [ ] Add wrong tier to the strip.
- [ ] Spec cases:
  - an unjudged sealed claim is in neither number;
  - over-promotion counts as wrong but not as junk.

**Verify:** `npm test --prefix v0`; `npm run build`; locally, the
wrong-tier row moves when a mark is set on the development branch.

### P2.5 The record

- [ ] `v0/storyboard/README.md`: add `review_tiers` under "Writes".
- [ ] `docs/architecture-overview.html`: name the tier mark beside the
  other review marks.
- [ ] `docs/superpowers/specs/2026-10-04-v0-design.md`, section 11
  ("Reviewing claims"): one line pointing to design §4.
- [ ] `TODO.md` item 2 and `docs/launch-map.html`: done.
- [ ] README's wrong-tier row: add it at the next copy (Q1), not
  specially.

**Verify:** `npm test` (root).

### P2.6 Deploy — **needs the maintainer's go**

- [ ] Only after P2.1 has migrated main: push, check `/scores` and one
  claim page on the preview, then merge to `main`.

---

## Done when

- `/scores` is live on the deployed storyboard. It shows:
  - the three launch-bar cards, with intervals;
  - over-merge, over-split and wrong tier, with counts and grey-outs;
  - the versions line;
  - the 5 Oct replay with its versions and its history line.
- The strip is on the claims list, and its added load time is measured
  and reported.
- `review_tiers` exists on main, and a tier mark set on a claim moves the
  wrong-tier row.
- The README, the architecture overview, pages.html and the storyboard
  README all say so, and the pages artifact is republished.
