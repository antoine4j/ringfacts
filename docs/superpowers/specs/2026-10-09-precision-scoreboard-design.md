# Precision scoreboard: technical design

**Status:** design, 9 Oct 2026. Not built. Closes the gaps in
[the scoreboard spec](2026-10-06-precision-scoreboard.md), whose ten
decisions (D1–D10) are settled and are not restated here; each is
pointed at by number. Goal moved: the showcase (end state 1 in
[goals.md](../../goals.md)), and the launch bar's dashboard. Three
questions remain open; they are at the end.

## 1. Route, serving and data loading

- **Route:** `/scores` in the storyboard (`v0/storyboard/app/scores/page.tsx`),
  added to the nav (`components/Nav.tsx`) right after Claims. The page
  ignores `?schema=`: its live sections always read `public`, its
  reference section reads files.
- **Live sections at request time.** The storyboard is already
  `force-dynamic` (`app/layout.tsx`): every load queries the database.
  The page does the same, no caching.
- **Reference section and career events at build time (D7).** Both are
  files in the repository, so they change only when a push builds
  (every push builds: docs/decisions.md#storyboard-builds-every-push).
  - `career-events.json` is a single file: a static JSON import, bundled
    at build.
  - The replay results are a directory, so the page lists it with `fs`
    at request time, and `next.config.ts` adds
    `outputFileTracingIncludes: { "/scores": ["../pipeline/measure/replay-results/*.json"] }`
    so Vercel ships the files with the page. The build job confirms it on
    a preview deployment; if the files are missing there, the fallback is
    a `prebuild` script that writes them into one generated JSON file.
- **The strip (D1)** sits under the `<h1>` of the claims list
  (`app/page.tsx`), live schema only, all time always (D5). It is one line
  of counts, no intervals, linking to `/scores`:

  > Scores, all time: over-merge 2 of 57 readings · over-split 1 of 14 claims ·
  > wrong tier 0 of 14 · tier-1 repeats 0 of 3 posts · 👎 1 of 12 · events
  > missed 0 of 2 → scores

  It calls the same functions as the page, with no period.

## 2. The numbers

**Shared rules.**

- A **sealed claim** is a claim whose review state is `reviewed`: every
  reading in it carries a mark in force (`claimReview` in
  `lib/reviews.ts`; D4).
- A **reopened claim** was sealed and then gained a reading: its state is
  `has_new`, and every unmarked reading joined after the claim's newest
  review mark (`groupings.created_at` later than the latest
  `review_readings.created_at` for that claim). The page counts these
  (D4).
- **Claims in the period:** at least one reading published in it, the
  claims list's rule (`claimFilter` with only the date keys; D5).
- **Messages in the period:** sent in it, by `posted_at` as a Pacific
  day. Messages are tier-1 posts (`readings.message_id`, the claim's
  `posted_reading_id`) and digests (`digests.message_id`). Daily count
  messages are not counted.
- A **claim's tier** is the best tier among its readings' latest
  decisions: any 1 is Post, else any 2 is Digest, else Drop.

**Headline numbers** get a Wilson 95% interval (D9). They are the
launch bar's three, live, and the replay's three pass marks:

| Number | Numerator | Denominator | Bar |
|---|---|---|---|
| Career events missed (G1) | events in the period with no claim found (§3) | events in the period on the list | 0 |
| Repeats in tier 1 (G3) | tier-1 posts beyond the first in a "same claim as" group; a group with 3 posted claims counts 2 | tier-1 posts in the period | 0 |
| 👎 share (G2) | messages whose latest reaction is 👎 (`latestReaction` in `lib/queries.ts`) | messages in the period | at most 1 in 10 |
| Replay: all nine answers right | `all_nine_right` | `articles` | (none) |
| Replay: G1 career stories recognised | first number of `g1_career_stories_recognised` | second number | docs/decisions.md#classifier-pass-marks |
| Replay: G2 false alarms | first number of `g2_false_alarms` | second number | same |

**Slices** show their count beside the share. A slice is greyed out when
its denominator is under 30 (D9).

| Number | Numerator | Denominator |
|---|---|---|
| Over-merge | readings in sealed claims whose mark in force is ✕ (`does_not_belong` or `own_claim`) | readings in sealed claims |
| Over-split | sealed claims that sit in a "same claim as" group (`sameClaimGroups`) | sealed claims |
| Wrong tier | sealed claims with a tier mark in force that differs from the claim's tier (§4) | sealed claims (see question 2) |
| Events arrived but not posted | events whose claims exist but none posted | events in the period |
| Messages without a reaction | messages with no reaction in force | messages in the period |
| Reopened claims | as defined above | (a count only) |
| Replay: G4 weaker called official | `g4_weaker_called_official` | (a count; bar 0) |
| Replay: pair precision, pair recall | pairs both put together ÷ pairs v0 / the rulings put together | pair counts, new in the file (§7) |
| Replay: ruled claims split, v0 claims mixing ruled | as stored | ruled claims, v0 claims |
| Replay: posting | `ruled_posted` of `ruled_should_post`; `v0_posts_not_due`; `ruled_posted_more_than_once` | as stored |
| Replay: right per question | `right_per_question[q]` | `articles` |

Over-merge counts readings; the other grooming numbers count claims.
That is why the spec's 3.5% (2 of 57) is a share of readings.

## 3. The career events list

**Home:** `v0/pipeline/measure/career-events.json`, beside the replay
results: a measurement record, public facts only, kept by hand and
changed by commit. A commit is the record of each check.

```json
{
  "checked": "2026-10-09",
  "how": "Searched the web for each watched fighter's news since the last check.",
  "events": [
    {
      "id": "2026-10-04-topuria-booked",
      "fighter": "Ilia Topuria",
      "kind": "booked",
      "happened": "2026-10-04",
      "what": "One plain sentence: who, what, which event.",
      "first_report": "https://… (the first trusted outlet found)",
      "claim_ids": [1234],
      "note": ""
    }
  ]
}
```

- `kind` is one of G1's six: `booked`, `result`, `withdrawal`,
  `return_date`, `retirement`, `contract`.
- `happened` is a Pacific day. An event is in the period when
  `happened` is.
- `claim_ids` lists the v0 claims that carry the event; a split gives
  more than one. An empty list means v0 never had it.

**The status is computed, never typed:**

- **posted:** any listed claim has a `posted_reading_id`;
- **arrived:** a listed claim exists but none posted;
- **missed:** `claim_ids` is empty.

The maintainer types facts, and the database says what the bot did with
them.

When `checked` is earlier than the period's last day, the card says
"list last checked 8 Oct; later events not counted". A unit test
(`lib/career-events.spec.ts`) checks the file: ids unique, `kind` in the
set, days valid, claim ids are numbers.

## 4. The tier mark (D3)

**Schema**, added to `v0/schema.sql`, so it exists in both `public` and
`replay`:

```sql
-- The maintainer's tier mark (scoreboard D3): the tier a claim had when
-- marked, and the tier it should have had. The newest row for a claim is
-- in force; "cleared" undoes the one before it.
CREATE TABLE IF NOT EXISTS review_tiers (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  claim_id    bigint NOT NULL REFERENCES claims(id),
  tier_had    text NOT NULL CHECK (tier_had IN ('post', 'digest', 'drop')),
  verdict     text NOT NULL CHECK (verdict IN ('post', 'digest', 'drop', 'cleared')),
  note        text NOT NULL DEFAULT '',
  author      text NOT NULL DEFAULT 'anton',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_tiers_claim_idx ON review_tiers (claim_id, id);
```

- `review_tiers` joins the `refuse_update` trigger list.
- **Grants**, in `v0/grants.sql`:
  `GRANT INSERT ON public.review_tiers TO v0_editor;`. Reading is covered
  by the existing `SELECT ON ALL TABLES`, once grants are re-run after
  the migration. No `replay` insert: review marks are live only, as for
  the other two marks.
- `replay.ts` adds `review_tiers` to `REPLAY_TABLES`, so the replay
  empties it like the rest.
- **The mark in force counts only while it is current.** If the claim's
  tier has changed since the mark (`tier_had` differs from the claim's
  tier today), the mark is stale, and the claim shows as unmarked for its
  tier, in the same way a new article reopens a sealed claim.
- **On the claim page** (`app/claims/[id]/page.tsx`): a row "Tier: Digest
  · should be: Post Digest Drop", with the mark in force tinted. Tapping
  another tier saves it at once. Tapping the claim's own tier while a
  correction is in force saves `cleared`. This is a server action in
  `app/review-actions.ts`, live data only.

**Order: the page ships first.** Until the table exists, the wrong-tier
row reads "not measured yet: the tier mark is being built", and the
strip leaves it out. The table is a schema change that needs the
owner's migration, so it is its own step and does not hold up the five
numbers that need nothing new.

## 5. The Wilson interval

`v0/storyboard/lib/wilson.ts`, one exported function, with tests in
`lib/wilson.spec.ts`:

```ts
/**
 * The Wilson 95% interval for a share: k successes out of n.
 *
 * @param successes  k.
 * @param trials  n; 0 gives null.
 * @returns { low, high } as shares between 0 and 1, or null when n is 0.
 */
export function wilson(successes: number, trials: number): { low: number; high: number } | null
```

The formula, with z = 1.96 and p = k/n:

- centre = (p + z²/2n) / (1 + z²/n)
- half-width = z·√(p(1−p)/n + z²/4n²) / (1 + z²/n)

The test cases are the worked examples below (checked to four places):

| k of n | Interval | Where it comes from |
|---|---|---|
| 2 of 57 | 0.97% to 11.92% | the spec's over-merge figure |
| 0 of 20 | 0% to 16.11% | zero repeats still allow up to 16% |
| 95 of 155 | 53.44% to 68.60% | the replay's training, all nine right |
| 8 of 9 | 56.50% to 98.01% | G1 on training: a small denominator, a wide bar |

Worked through for 2 of 57:

1. p = 0.0351, and z²/n = 3.8416/57 = 0.0674, so the divisor is 1.0674.
2. centre = (0.0351 + 0.0337) / 1.0674 = 0.0644.
3. half-width = 1.96 × √(0.000594 + 0.000296) / 1.0674 = 0.0548.
4. So the interval is 0.0097 to 0.1192.

## 6. Layout

```
Scores                                         [period: all time ▾]
  Two sentences: what this page measures, from which two sources, and
  that the sources are never mixed (D2, D10).

LIVE · THE LAUNCH BAR            judged over the last 14 days → [preset]
  Versions: classifier v7.7 · grouping g1 · settings 4
  ⚠ classifier v7.7 from 3 Oct, v7.6 before: these numbers mix the two   (only when true)
  ┌ Career events missed ┐ ┌ Repeats in tier 1 ┐ ┌ 👎 share           ┐
  │ 0 of 4  (0–49%)  ✓   │ │ 0 of 6  (0–39%) ✓ │ │ 1 of 12 (1–35%) ✓  │
  │ 3 posted · 1 arrived │ │ bar: 0            │ │ 3 without reaction │
  │ list checked 8 Oct   │ │                   │ │ bar: at most 1/10  │
  │ How · Weakness       │ │ How · Weakness    │ │ How · Weakness     │
  └──────────────────────┘ └───────────────────┘ └────────────────────┘

LIVE · GROOMING        over 14 claims reviewed, chosen by hand, not at random
  4 claims reopened by new articles
  Over-merge    2 of 57 readings   3.5%   How · Weakness
  Over-split    1 of 14 claims     7.1%   (greyed: under 30)
  Wrong tier    0 of 14 claims     0%     (greyed: under 30)

REFERENCE · THE GOLDEN REPLAY     stored result of 5 Oct 2026 · v7.7 · p4 · g1 · settings 1
                          Training (155)   Validation (40)   Test (105)
  All nine right          95 (53–69%)      19 (33–63%)       not yet run
  G1 stories recognised   8 of 9 (57–98%)  1 of 2 (…)        not yet run
  G2 false alarms         5 of 111 (…)     2 of 38 (…)       not yet run
  G4 weaker called official   0             0
  Pair precision / recall 0.62 / 0.83      0.93 / 0.70
  Posting                 2 of 4 posted…   1 of 1 …
  ▸ Right per question (details, closed)
  Earlier runs: one line each: date · versions · all nine right · pair precision (validation)
```

**Components:**

- `components/ScoreCard.tsx` is one headline card: the title, the count,
  the interval, a ✓ or ✕ against the bar, a slice line, and the "How" and
  "Weakness" lines.
- `components/ScoreRow.tsx` is one slice row, greyed under 30.
- `components/ScoreStrip.tsx` is the claims-list line.
- `components/PeriodPicker.tsx` is the date part of the filter bar alone.
  It reuses `PERIODS` from `lib/dates.ts`, which gains `last_14` ("last 14
  days") for the launch-bar preset.

**Rules for the page:**

- The picker narrows the two live sections. The replay section is
  fixed, and says so.
- The "How" and "Weakness" text for each number is a constant in
  `lib/scores.ts`, written for visitors (D10). For example, under
  Over-merge: "How: the share of reviewed readings the maintainer marked
  as not belonging in their claim. Weakness: only claims the maintainer
  chose to review are counted."

## 7. Versions

**Live (D6).** The versions are worked out from the readings counted,
not from the calendar. Two queries:

```sql
-- The versions behind the readings of the claims in the period, with how many readings each.
SELECT classifier_version, grouping_version, settings_version, count(*)
FROM reading_now WHERE claim_id = ANY($1::bigint[]) GROUP BY 1, 2, 3;

-- The day each version was first used.
SELECT 'classifier' AS station, version, min(created_at) AS first_used FROM classifications GROUP BY version
UNION ALL SELECT 'grouping', version, min(created_at) FROM groupings GROUP BY version
UNION ALL SELECT 'settings', version::text, created_at FROM settings;
```

- The newest version of each station is "in force".
- When any station has more than one version among the counted
  readings, the warning line names each version with its first day.
- The extractor is left out live, as D6 has it; it shows on the replay
  because the result file records it.

**Replay (D7).** Three changes are needed:

- **`replay.ts` writes a `versions` object into the result file,** read
  from the replay schema's own rows after the run, so it records what was
  used and not what the code says:
  ```sql
  SELECT (SELECT string_agg(DISTINCT version, ',') FROM classifications) AS classifier,
         (SELECT string_agg(DISTINCT version, ',') FROM extracts) AS extractor,
         (SELECT string_agg(DISTINCT version, ',') FROM groupings) AS grouping,
         (SELECT string_agg(DISTINCT settings_version::text, ',') FROM decisions) AS settings
  ```
  A comma in any value means a `--continue` run spanned a code change.
  The script prints a warning, and the page shows the mixed value as it
  is. The file also gains `run_started_at`.
- **`replay-score.ts`** adds `pairs: { v0_same, ruled_same, both_same }`
  to each side's grouping scores, so pair precision and recall have
  counts beside them (D2).
- **The existing files.** `2026-10-05T1019-earliest-on-tie.json` gets
  `versions` copied from its manifest in
  `golden/replays/2026-10-05T1019-earliest-on-tie/`. The 1013 file has
  no manifest, so it stays without versions and the page shows "versions
  not recorded".

**Order of the files.** The newest file name is the headline. The names
start with the run's timestamp, so sorting by name sorts by time.

## 8. Refresh

| What | When it changes |
|---|---|
| Live sections and the strip | on every page load (request time, no cache) |
| Versions line and warning | on every load, from the counted readings |
| Reference section | on a push that commits a new result file, after a station change (D7). No timer. |
| Career events | on a push that commits a new check of the list |

## 9. Public pages, when it ships

- **README, "How it is measured":** the closing paragraph stops calling
  the scoreboard "planned". The numbers table gains the three launch-bar
  rows and the three grooming rows, each with its count, its date, and
  "over claims chosen by hand". Visitors cannot open the storyboard (see
  question 1).
- **Public view of the headline numbers:** defers to the future public
  reading surface (TODO item 11, the reader-facing site), which is separate
  from the storyboard; until it exists, the README copy is the stopgap.
- **docs/architecture-overview.html:** the storyboard and review
  section names the scores page and the `review_tiers` mark. Section 13,
  "What is not measured", is re-read against §2.
- **docs/pages.html:** the Storyboard row's description adds "a scores
  page". The status line says it is private. The artifact is republished
  (AGENTS.md).
- **v0/storyboard/README.md:** a `/scores` row in the page table, and
  `review_tiers` under "Writes".
- **Re-read, probably unchanged:** docs/index.html and
  docs/funnel-walkthrough.html. Nothing in the pipeline changes.
- **TODO.md item 2 and the Launch Map:** marked done.

## 10. Build order

Each step is one commit and is testable on its own:

1. `lib/wilson.ts` and its spec.
2. `lib/scores.ts`: pure functions over rows (the sealed and reopened
   claims, the six live numbers, the versions in force), with a spec
   built on hand-made rows.
3. `career-events.json` (empty `events`, today's `checked` date),
   `lib/career-events.ts` and its spec.
4. The replay file changes (§7) and the backfilled versions.
5. `/scores`, its components, the `last_14` preset, the nav link, and
   the tracing include. A local `npm run build`, then a check on a
   Vercel preview that the reference section loads.
6. The strip on the claims list. Measure the list's load time before and
   after (ten loads each); report both numbers.
7. `review_tiers`: the schema, the grants, the owner's migration (the
   maintainer runs it), the claim-page control, and the wrong-tier row.
8. The public pages (§9).

## 11. Risks and open questions

**Risks**

- **Skew (D4).** Each grooming number describes the claims the
  maintainer chose to review. The page says so in words, and the strip
  carries no percentages, so its counts are not read as rates.
- **Reaction coverage.** Messages sent before reactions were stored, or
  never reacted to, are in the denominator of the 👎 share. The "without
  a reaction" slice shows how many there are. The launch bar assumes
  there are none.
- **Reactions have no chat id.** `reactions.message_id` is unique only
  within one chat. That is fine while v0 posts to one chat, but it must
  be fixed before the friends' group is added beside the test chat.
- **Load time of the strip.** It reads every claim's readings and marks
  on each load of the claims list. Step 6 measures this. If the cost
  shows, the strip moves into the page's existing member query rather
  than getting a cache.

**Open questions for the maintainer**

1. **How do visitors see the numbers before the public demo (TODO item
   9)?** The storyboard is behind Vercel Authentication, and D10 writes
   the page for visitors. Options:
   - (a) the README table is copied from the page by hand at each station
     change and at the launch decision;
   - (b) a script renders the page's numbers into a static page on the
     public site;
   - (c) nothing public until the demo.

   Recommended: **(a)**. It needs no new machinery, and the README is
   where visitors already read the numbers.
2. **What counts as "tier right"?** Options:
   - (a) a sealed claim with no tier mark counts as tier right, so the
     denominator is all sealed claims;
   - (b) only claims with an explicit tier mark count.

   Option (a) adds no taps but leans low, since a tier nobody looked at
   counts as right. Option (b) is exact but adds a tap to every review.
   Recommended: **(a)**, with the weakness stated on the card, because
   review time is the scarce resource (goals.md).
3. **Does an event that arrived but never posted as tier 1 fail the
   launch bar?** D2 names three states, but the bar counts only
   "missed". G1 says every career event *posts*. Recommended: **yes**.
   The card would show both counts, and the bar would need both to be
   zero.
