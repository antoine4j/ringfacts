# Stories as objects (option D, with B inside) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the headline-embedding duplicate hold with stories as objects: every article joins an existing story, opens a new one, or opens a reaction story, decided by the one Haiku call the pipeline already makes, with the article body in hand.

**Architecture:** A new `stories` table (root article, one-line fact, optional claim, `reacts_to`) and `items.story_id`. The hunter fetches bodies first, embeds headline + body, retrieves the top-3 stories of the last 7 days by embedding, and asks the matcher one reshaped question: join / new / reaction / wrong_subject, plus the bucket fields it answers today. Claims keep their lifecycle (rumor → confirmed, 🕵️ lines, ceremonies) unchanged; a story carries its claim when it minted one. The old threshold gate survives only as the fallback when the decider is unavailable.

**Tech Stack:** Node ESM, pg + pgvector, Anthropic SDK (Haiku 4.5, forced tool call), Gemini embeddings, `node --test`.

**Spec:** [docs/story-matching-options.md](../../story-matching-options.md) (the menu and the measured tables), [docs/grading/2026-09-06-story-matching.md](../../grading/2026-09-06-story-matching.md) (what D did on the archive, the noise band, Anton's rulings), [labels/measure-stories-llm.js](../../../labels/measure-stories-llm.js) (the measured prompt and replay — the reference implementation).

## Global Constraints

- **Additive database changes only.** New table, new nullable columns. Nothing dropped, nothing rewritten. Backfill runs with `DRY_RUN=1` first and prints counts before anything is written.
- **Keys.** Production database only via `DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url)`. Any Anthropic or Gemini call from a session uses the TEST keys from `bench/.env.bench` through `bench/env.js`. Never print a key.
- **Spend.** The Anthropic cap is $20/month across all keys; $10.47 was spent on the TEST key on 2026-09-06; a third of the cap (~$6.70) stays for production. **Budget for this build: about $2.80 on the TEST key** — one full archive pass (~$1.85) plus one bucket regression (~$0.30). Every paid run prints its tokens; if a run fails on the usage-limit error, stop everything paid and tell Anton.
- **Code style:** [docs/code-style.md](../../code-style.md) — JSDoc on every function, one-line comment per block, no history in code (pointer to `docs/decisions.md#stories-as-objects`), no short names, functions under ~50 lines.
- **Deps seam.** Every external call goes through `buildDeps` in hunter.js; the test `the deps seam is wired to itself` must stay green. The fake store (`test/fake-store.js`) must answer every function `lib/db.js` exports (`the fake store answers everything lib/db.js exports`).
- **Nothing deploys, nothing posts.** Branch `measure-story-matching`, local, not pushed. `DRY_RUN=1` for any hunter run.
- **Tests:** `npm test` green after every task (113 today). Commit after every task, message in plain words.

## The decision, in plain words

The unit of "have we seen this" becomes the **story**, not the nearest headline. A story is: the first article (its root), one English sentence saying what the news is (its fact), every later article that reports the same news (its members), and, when it is a reply to another story, the story it answers (`reacts_to`). Stories are what Anton's review did by hand and what the labels describe; D reproduced them on the archive at 311 of 346 repeats held, 256 placed in the right story, 6 useful stories swallowed (measured 2026-09-06).

**What stays the same:** claims and their lifecycle. A story whose fact is a claim-worthy event (a booking, a result, an injury, a quote) still mints a claim exactly as today (`isRealClaim`, born confirmed only on official sourcing); joining such a story links the article to the claim as `echo` or `official` and an official assertion still confirms a rumor. The bucket fields (`subject_role`, `news_for_followers`, claim type) are asked in the same call, so the tier rule and the reader's test are untouched.

**What changes:** (1) the body is fetched before anything is judged, and the embedding is of headline + body; (2) the early and late threshold holds are gone, replaced by the shortlist + decision; the threshold gate is kept only as the fallback when the decider cannot answer (no key, API failure); (3) the matcher's candidates are stories, not claims, and its verdict is join / new / reaction / wrong_subject; (4) a held article records which story it joined and why.

**Fight week as a shape:** the prompt carries a short block saying that around a fight each angle is its own story (odds per bookmaker, the promotion's feature with the fighter's quotes, a statistical preview, the weigh-in, the result, the post-fight bonus) and that the fighter's own announcement is never a repeat of a report that he was expected to do it. It is a flag on the prompt builder so the bench can score with and without it.

## File map

| File | Responsibility |
|---|---|
| `schema.sql` | `stories` table; `items.story_id`, `items.story_decision`; index. |
| `lib/db.js` | `insertStory`, `setItemStory`, `storyShortlist`, `storyOfItem`, `storyById`. `insertItem` writes `story_id` and `story_decision`. |
| `test/fake-store.js` | The same five functions on the in-memory rows. |
| `lib/matcher.js` | `VERDICT_TOOL` reshaped (decision / story_id / stance / fact / claim fields); `buildPrompt` takes `stories`; system block with the rules and `cache_control`; `normalizeVerdict` returns the compatibility shape (`verdict` MATCH/NEW/NO_CLAIM/WRONG_SUBJECT plus `decision`, `story_id`, `fact`, `reacts_to`). |
| `lib/matcher.test.js` | Prompt, schema, and normalizer tests updated. |
| `hunter.js` | Stage order: candidates → bodies → embed(headline + body) → classify (shortlist + decision) → record (story rows). Threshold gate as fallback only. |
| `test/pipeline.test.js` | Gate 2 tests move under "the fallback when the decider is unavailable"; new tests for join / new / reaction / url-dup inheriting a story. |
| `scripts/backfill-stories.js` | Stories from the `feedback` labels (roots and members), then every unlabelled item; `DRY_RUN=1` prints counts. |
| `bench/story.js` + `bench/README.md` | The archive replay through the real `matchItem`, scored against the labels, `--repeat K`; the ship gate. |
| `docs/decisions.md`, `docs/architecture-overview.html`, `TODO.md`, `docs/story-matching-options.md`, `docs/checkin-log.md` | The record. |

---

### Task 1: Schema and store — stories exist

**Files:**
- Modify: `schema.sql` (after the `claims_subject_status_idx` line)
- Modify: `lib/db.js` (`insertItem`; new functions after `claimOfItem`)
- Modify: `test/fake-store.js`
- Test: `test/sql.test.js` (SQL tier, runs only with `TEST_DATABASE_URL`), `test/pipeline.test.js` (`the fake store answers everything lib/db.js exports` — already exists, will fail until the fake has the new functions)

**Interfaces:**
- Produces:
  - `insertStory(client, { subject, rootItem, fact, reactsTo = null, claimId = null, decidedBy })` → `Promise<string>` (the id, a bigint string)
  - `setItemStory(client, itemId, storyId, decision)` → `Promise<void>` — writes `items.story_id` and `items.story_decision` (`"join" | "new" | "reaction"`)
  - `storyShortlist(client, subject, embedding, { top = 3, days = 7 } = {})` → `Promise<{ id, fact, root_item, root_title, claim_id, claim_type, claim_status, members, similarity }[]>` — stories of `subject` with at least one member seen in the last `days`, ranked by the highest cosine similarity of any member's embedding to `embedding`, first `top`.
  - `storyOfItem(client, itemId)` → `Promise<string|null>` — the `story_id` of a stored item.
  - `storyById(client, storyId)` → `Promise<{ id, fact, root_item, claim_id, reacts_to } | null>`.

- [ ] **Step 1: Schema**

Append to `schema.sql` after `CREATE INDEX IF NOT EXISTS claims_subject_status_idx ...`:

```sql
-- Stories (2026-09-06, docs/decisions.md#stories-as-objects): the unit of
-- "the group has seen this". One row per piece of news; every article that
-- reports it points here through items.story_id. `fact` is the decider's
-- one-sentence statement of the news; `claim_id` is set when the story
-- minted a claim (the lifecycle stays on claims); `reacts_to` links a
-- reply, rebuttal or follow-up to the story it answers; `decided_by` says
-- who placed the root: 'story' (the live decider), 'backfill' (the labels
-- or the archive's own record).
CREATE TABLE IF NOT EXISTS stories (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject       text NOT NULL,
  root_item     bigint NOT NULL REFERENCES items(id),
  fact          text NOT NULL,
  reacts_to     bigint REFERENCES stories(id),
  claim_id      bigint REFERENCES claims(id),
  decided_by    text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stories_subject_seen_idx ON stories (subject, first_seen_at);

-- Which story an article belongs to, and how it got there: 'join' (a
-- repeat, held), 'new' (it opened the story), 'reaction' (it opened a story
-- that answers another). Null on rows from before stories existed and on
-- rows that never reached the decider (wrong subject, untrusted source).
ALTER TABLE items ADD COLUMN IF NOT EXISTS story_id bigint REFERENCES stories(id);
ALTER TABLE items ADD COLUMN IF NOT EXISTS story_decision text;
CREATE INDEX IF NOT EXISTS items_story_idx ON items (story_id);
```

- [ ] **Step 2: Store functions**

In `lib/db.js`, `insertItem`: add `story_id, story_decision` to the column list as `$22, $23`, values `item.storyId ?? null, item.storyDecision ?? null`.

After `claimOfItem` add:

```js
/**
 * Opens a story rooted at an item. Returns the story id (a bigint string).
 *
 * @param {import("pg").Client} client
 * @param {{ subject: string, rootItem: string|number, fact: string, reactsTo?: string|number|null, claimId?: string|number|null, decidedBy: string }} story
 * @returns {Promise<string>}
 */
export async function insertStory(client, story) {
  const { rows } = await client.query(
    `INSERT INTO stories (subject, root_item, fact, reacts_to, claim_id, decided_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [story.subject, story.rootItem, story.fact, story.reactsTo ?? null, story.claimId ?? null, story.decidedBy]
  );
  return rows[0].id;
}

/**
 * Records which story an item belongs to and how it got there.
 *
 * @param {import("pg").Client} client
 * @param {string|number} itemId
 * @param {string|number} storyId
 * @param {"join"|"new"|"reaction"} decision
 * @returns {Promise<void>}
 */
export async function setItemStory(client, itemId, storyId, decision) {
  await client.query(`UPDATE items SET story_id = $2, story_decision = $3 WHERE id = $1`, [itemId, storyId, decision]);
}

/**
 * The stories the decider is offered: those of this subject with a member
 * seen in the window, ranked by the closest member to the given embedding.
 * Each row carries the root's title, the member count and, when the story
 * minted a claim, the claim's type and status.
 *
 * @param {import("pg").Client} client
 * @param {string} subject
 * @param {number[]} embedding
 * @param {{ top?: number, days?: number }} [options]
 * @returns {Promise<object[]>}
 */
export async function storyShortlist(client, subject, embedding, { top = 3, days = 7 } = {}) {
  const { rows } = await client.query(
    `WITH live AS (
       SELECT DISTINCT story_id FROM items
        WHERE subject = $1 AND story_id IS NOT NULL
          AND seen_at > now() - make_interval(days => $3)
     )
     SELECT s.id, s.fact, s.root_item, r.title AS root_title, s.claim_id, s.reacts_to,
            c.type AS claim_type, c.status AS claim_status,
            count(m.id)::int AS members,
            max(1 - (m.embedding <=> $2::vector)) AS similarity
       FROM stories s
       JOIN live ON live.story_id = s.id
       JOIN items r ON r.id = s.root_item
       JOIN items m ON m.story_id = s.id AND m.embedding IS NOT NULL
       LEFT JOIN claims c ON c.id = s.claim_id
      GROUP BY s.id, s.fact, s.root_item, r.title, s.claim_id, s.reacts_to, c.type, c.status
      ORDER BY similarity DESC
      LIMIT $4`,
    [subject, JSON.stringify(embedding), days, top]
  );
  return rows;
}

/**
 * The story a stored item belongs to, or null.
 *
 * @param {import("pg").Client} client
 * @param {string|number|null} itemId
 * @returns {Promise<string|null>}
 */
export async function storyOfItem(client, itemId) {
  if (!itemId) return null;
  const { rows } = await client.query(`SELECT story_id FROM items WHERE id = $1`, [itemId]);
  return rows[0]?.story_id ?? null;
}

/**
 * One story row, or null.
 *
 * @param {import("pg").Client} client
 * @param {string|number} storyId
 * @returns {Promise<object|null>}
 */
export async function storyById(client, storyId) {
  const { rows } = await client.query(`SELECT id, subject, fact, root_item, claim_id, reacts_to FROM stories WHERE id = $1`, [storyId]);
  return rows[0] ?? null;
}
```

- [ ] **Step 3: Fake store**

In `test/fake-store.js`: add `stories: []` to `rows`, `nextStoryId`, and the five functions. `storyShortlist` computes, per story with a member `seen_at` inside the window, `max(cosine(embedding, member.embedding))` over members with an embedding; sorts descending; slices `top`; returns rows shaped like the SQL (`id`, `fact`, `root_item`, `root_title`, `claim_id`, `reacts_to`, `claim_type`, `claim_status`, `members`, `similarity`), ids as strings. `insertItem` stores `story_id`/`story_decision` from `item.storyId`/`item.storyDecision`. Add `dumpTables`-style exposure if the fake has one (`rows.stories` reachable for assertions the way `rows.items` is).

- [ ] **Step 4: SQL-tier tests** in `test/sql.test.js`: a `describe("stories", { skip })` with (a) a story round-trips through `insertStory` / `storyById`; (b) `storyShortlist` ranks by the closest member (two stories, three items at `vectorAt(0)`, `vectorAt(30)`, `vectorAt(80)`; query at `vectorAt(25)` → the story holding the 30° item first) and excludes a story whose only member is older than the window; (c) `setItemStory` is read back by `storyOfItem`. Also extend `every column insertItem writes exists` if it enumerates columns.

- [ ] **Step 5: Run** `npm test` (the fake-store completeness test must pass); if `bench/.env.bench` names a reachable bench database, run `TEST_DATABASE_URL=<bench url> node --test test/sql.test.js` after `node migrate.js` against it (`DATABASE_URL` = the bench url). Report which tiers ran.

- [ ] **Step 6: Commit** — `Stories table and store functions: stories, items.story_id, shortlist by closest member`.

---

### Task 2: The matcher decides stories

**Files:**
- Modify: `lib/matcher.js`
- Modify: `lib/matcher.test.js`
- Modify: `domain/mma.js` (the fight-week block text, as `P.fightWeekShape`)

**Interfaces:**
- Consumes: `storyShortlist` rows (Task 1) as `stories`.
- Produces:
  - `matchItem({ subject, item, stories, confusables, subjectNames, fightWeekShape = true })` → normalized verdict.
  - Normalized verdict shape (the compatibility shape; everything downstream keys on `verdict`):
    ```js
    {
      verdict: "MATCH" | "NEW" | "NO_CLAIM" | "WRONG_SUBJECT" | "UNSURE",
      decision: "join" | "new" | "reaction" | "wrong_subject" | null,   // null only on UNSURE
      subject_role, news_for_followers,               // as today
      story_id: string|null,                          // join: the story joined; reaction: the story answered
      stance: "asserts"|"denies",                     // join only
      fact: string|null,                              // new / reaction: the story's one sentence
      new_claim: { type, canonical_text, facts, sourcing } | undefined,  // as today; canonical_text === fact
      reasoning
    }
    ```
    Mapping: `join` → `MATCH`; `new`/`reaction` with a claim that survives today's gates → `NEW`; `new`/`reaction` whose claim is dropped by a gate (no subject name, stale result) or whose `claim` is absent → `NO_CLAIM`; `wrong_subject` → `WRONG_SUBJECT`; an unparseable answer → `UNSURE` (decision null). A `join`/`reaction` naming a story that was not offered → `new` (an unoffered story is no story), logged.
  - `buildPrompt({ subject, item, stories, confusables, fightWeekShape })` → `{ system: string, user: string }`.
  - `STORY_RULES` exported (the system block) for the bench's cost line.

- [ ] **Step 1: Write the failing tests** in `lib/matcher.test.js` (replace the claim-candidate tests):

```js
test("the prompt lists stories most-similar first with their root title and member count, and marks booking claims", () => {
  const stories = [
    { id: "7", fact: "Topuria will fight Gaethje at UFC 330.", root_title: "Topuria vs Gaethje set", members: 4, claim_type: "announcement", claim_status: "confirmed" },
    { id: "9", fact: "Gaethje said Topuria is overrated.", root_title: "Gaethje: overrated", members: 1, claim_type: null, claim_status: null },
  ];
  const { system, user } = buildPrompt({ subject: "Ilia Topuria", item: ITEM, stories });
  assert.match(user, /\[7\] .*Topuria will fight Gaethje.*\(4 articles, first: "Topuria vs Gaethje set"\)/);
  assert.match(user, /\[9\] .*Gaethje said.*\(1 article, first:/);
  assert.match(user, /\[7\][^\n]*BOOKING/);
  assert.match(system, /join/); assert.match(system, /reaction/);
});

test("the fight-week block is in the system prompt by default and gone when switched off", () => {
  assert.match(buildPrompt({ subject: "X", item: ITEM, stories: [] }).system, /odds/i);
  assert.doesNotMatch(buildPrompt({ subject: "X", item: ITEM, stories: [], fightWeekShape: false }).system, /odds/i);
});

test("join on an offered story is MATCH with the story id and stance", () => {
  const v = normalizeVerdict({ reasoning: "r", decision: "join", story_id: 7, stance: "denies", subject_role: "central", news_for_followers: "yes" }, new Set(["7"]));
  assert.equal(v.verdict, "MATCH"); assert.equal(v.decision, "join"); assert.equal(v.story_id, 7); assert.equal(v.stance, "denies");
});

test("join on a story that was not offered becomes new (an unoffered story is no story)", () => {
  const v = normalizeVerdict({ reasoning: "r", decision: "join", story_id: 99, fact: "Topuria said X.", subject_role: "central", news_for_followers: "yes" }, new Set(["7"]), { subjectNames: ["Topuria"] });
  assert.equal(v.decision, "new"); assert.equal(v.verdict, "NO_CLAIM"); assert.equal(v.fact, "Topuria said X.");
});

test("new with a claim is NEW; the claim's canonical_text is the story fact", () => {
  const v = normalizeVerdict({ reasoning: "r", decision: "new", fact: "Topuria will fight Gaethje in December.", claim: { type: "announcement", sourcing: "reported", facts: { opponent: "Gaethje" } }, subject_role: "central", news_for_followers: "yes" }, new Set(), { subjectNames: ["Topuria"] });
  assert.equal(v.verdict, "NEW"); assert.equal(v.decision, "new"); assert.equal(v.new_claim.canonical_text, v.fact); assert.equal(v.new_claim.type, "announcement");
});

test("reaction keeps the story it answers and opens a NEW or NO_CLAIM of its own", () => {
  const v = normalizeVerdict({ reasoning: "r", decision: "reaction", story_id: 7, fact: "Kawa answered Abdelaziz about Topuria.", subject_role: "supporting", news_for_followers: "yes" }, new Set(["7"]), { subjectNames: ["Topuria"] });
  assert.equal(v.decision, "reaction"); assert.equal(v.story_id, 7); assert.equal(v.verdict, "NO_CLAIM");
});

test("a fact that never names the subject is NO_CLAIM but still opens a story", () => {
  const v = normalizeVerdict({ reasoning: "r", decision: "new", fact: "Gaethje broke his hand.", claim: { type: "injury", sourcing: "reported" }, subject_role: "passing", news_for_followers: "no" }, new Set(), { subjectNames: ["Topuria"] });
  assert.equal(v.verdict, "NO_CLAIM"); assert.equal(v.decision, "new"); assert.equal(v.fact, "Gaethje broke his hand.");
});

test("wrong_subject and garbage", () => {
  assert.equal(normalizeVerdict({ decision: "wrong_subject", subject_role: "passing", news_for_followers: "no" }, new Set()).verdict, "WRONG_SUBJECT");
  const v = normalizeVerdict({ decision: "maybe" }, new Set());
  assert.equal(v.verdict, "UNSURE"); assert.equal(v.decision, null);
});
```

Keep every existing gate test (announcement needs facts → other; stale result → NO_CLAIM; result without date → other; off-enum type/sourcing) but feed the new raw shape (`decision: "new", fact, claim: {...}`). Keep the `hasAnnouncementFacts` / `isStaleResult` / `hasResultDate` tests as they are.

- [ ] **Step 2: Run** `node --test lib/matcher.test.js` — expect failures on the new shape.

- [ ] **Step 3: Implement.** In `lib/matcher.js`:

`VERDICT_TOOL` (name stays `verdict`):
```js
properties: {
  reasoning: { type: "string", description: "One or two sentences, written BEFORE the decision: what this article's own news is, and whether a listed story already IS that news." },
  decision: { type: "string", enum: ["join", "new", "reaction", "wrong_subject"], description: "join: the same news as a listed story (a repeat, translation, retelling, or another passage of the same interview or statement). new: news no listed story has. reaction: someone ELSE replying to, rebutting or following up a listed story — its own news, connected to that story. wrong_subject: not about this person at all." },
  subject_role: { ...as today },
  news_for_followers: { ...as today },
  story_id: { type: "integer", description: "For join and reaction: the id of the listed story." },
  stance: { type: "string", enum: ["asserts", "denies"], description: "For join: does the article assert or deny the story's fact?" },
  fact: { type: "string", description: "For new and reaction: ONE English sentence stating this article's news, naming the subject. Only what the text supports — no invention." },
  claim: { type: "object", description: "For new and reaction, when the fact is a claim about the subject's career (a booking, result, injury, negotiation, quote, prediction, lifestyle piece, or other statement). Omit when the article asserts nothing claim-worthy about the subject.", properties: { type: { enum: domain.claimTypes }, facts: {...as today}, sourcing: {...as today} }, required: ["type", "sourcing"] },
},
required: ["reasoning", "decision", "subject_role", "news_for_followers"],
```

`buildPrompt` returns `{ system, user }`. `system` = `STORY_RULES(subject, confusables, fightWeekShape)`: the rules of today's prompt (WRONG_SUBJECT, NO_CLAIM/peer rules reworded as "new with no claim", the claim type guide, loud types, subject_role, news_for_followers with the examples, `P.sameFactGuide`) plus the story rules from `labels/measure-stories-llm.js` (join only for the SAME news; different remarks on different occasions are different stories; a story about a fight and a reaction to it are different; reaction when someone else responds; new otherwise) plus, when `fightWeekShape`, `P.fightWeekShape` from `domain/mma.js`:

```
Around a fight, each angle is its own story, and a piece joins only the story that reports the same angle:
  · betting odds — one story per bookmaker (DraftKings, FanDuel, Bet365, a local book each count separately)
  · the promotion's own feature or interview with the fighter (UFC.com, the UFC channel)
  · a preview or statistical breakdown by an outlet
  · the weigh-in and the face-off
  · the result, and afterwards the post-fight bonus, the medical suspension, the callout
The fighter's own announcement (a return, a booking, a retirement) is never a repeat of an earlier report that he was planning or expected to do it: the report teases, the announcement delivers — new.
```

`user` = the article block (headline, source, published, body excerpt 1200 chars or related-coverage fallback as today) and `KNOWN STORIES ABOUT ${subject} FROM THE LAST 7 DAYS (most similar first):` with lines `[id] fact (n article(s), first: "root_title")` plus `" " + P.bookingNote` when `claim_type` is in `P.bookingTypes`; `(none)` when empty.

`matchItem` sends `system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]` and `messages: [{ role: "user", content: user }]`; adds `cacheReadTokens` and `cacheWriteTokens` to `usage` from `response.usage.cache_read_input_tokens` / `cache_creation_input_tokens`; `usageTotals()` returns them too.

`normalizeVerdict(raw, offeredStoryIds, { subjectNames, publishedAt })`: role and news as today; `decision` off-enum → UNSURE (`decision: null`); `wrong_subject` → WRONG_SUBJECT; `join`/`reaction` with an unoffered `story_id` → logged, becomes `new`; `join` → MATCH with `story_id`, `stance`; `new`/`reaction` → `fact` required (missing → UNSURE); then the claim: `raw.claim` absent → NO_CLAIM (with `fact`, `decision`, `story_id` for reaction); present → run today's gates on `{ ...raw.claim, canonical_text: raw.fact }` (subject name → NO_CLAIM keeping the fact; off-enum type → other; announcement without facts → other; stale result → NO_CLAIM; result without date → other; off-enum sourcing → reported) → NEW with `new_claim`.

- [ ] **Step 4: Run** `node --test lib/matcher.test.js` → PASS. Then `npm test` — the pipeline tests will now fail on the changed call shape; that is Task 3's job, so commit only when `lib/matcher.test.js` and everything except `test/pipeline.test.js` pass. If pipeline tests break at import time rather than assertion time, fix the import and move on.

- [ ] **Step 5: Commit** — `Matcher decides stories: join / new / reaction / wrong_subject, stories as candidates, rules in a cached system block, fight-week angles`.

---

### Task 3: The hunter — bodies first, stories decided, stories recorded

**Files:**
- Modify: `hunter.js` (`huntSubject`, `embedTitles` → `embedCandidates`, `classifyItem`, `checkDuplicateGate`, `extractBody`, `askMatcher`, `recordOutcome`)
- Modify: `test/pipeline.test.js`
- Modify: `test/fake-store.js` if a helper is missing

**Interfaces:**
- Consumes: Task 1 store functions; Task 2 `matchItem({ subject, item, stories, ... })` and its verdict shape.
- Produces: outcome kinds unchanged (`held`, `wrong-subject`, `untrusted`, `match`, `post`); `held` gains `storyId`; `match` carries `storyId` and `claimId` (nullable); `post` carries `fact`, `decision`, `reactsTo`.

- [ ] **Step 1: Write the failing tests** in `test/pipeline.test.js`. Rename `describe("gate 2 — semantic duplicates")` to `describe("the threshold gate — only when the decider cannot answer")` and make every test in it run with `matcherEnabled: false` (or a throwing `matchItem`); the tests then assert the same holds as today. Add `describe("stories — the decider places every article")`:

```js
test("bodies are fetched before the decision and the embedding is of headline + body", async () => {
  // fetchArticleBody fake returns { body: "BODY TEXT", via: "fake" }; embedTexts fake records its input
  // assert embedTexts was called with ["<title>\n\nBODY TEXT"] and matchItem saw item.body === "BODY TEXT"
});
test("join: the item is held, records the story, and links the story's claim as echo", async () => {
  // seed: item #1 posted with story S1 (claim C1 rumor); matchItem → { verdict:"MATCH", decision:"join", story_id: S1, stance:"asserts" }
  // assert: new row posted=false, held_reason="story", story_id=S1, story_decision="join"; claimSources has (newId, C1, "echo"); nothing sent
});
test("join by an official source confirms the story's rumor", ...);   // mirrors today's official MATCH test
test("new: the item posts and opens a story rooted at itself; a real claim is minted and the story carries it", async () => {
  // matchItem → { verdict:"NEW", decision:"new", fact:"...", new_claim:{type:"result", ...} }
  // assert: stories has one row root_item=newId, fact, claim_id=newClaimId, decided_by="story"; items.story_id set, story_decision="new"
});
test("new without a claim still opens a story", ...);   // verdict NO_CLAIM, decision new → story row, no claim row
test("reaction: opens a story that points at the one it answers", ...);   // reacts_to === S1
test("the shortlist offered to the decider is the top 3 stories of the last 7 days by closest member", async () => {
  // seed 4 stories with members at vectorAt(0), (10), (20), (60); query at vectorAt(5); capture matchItem's `stories` arg → ids of the 3 nearest, in order; the 60° one absent
});
test("a url duplicate inherits its neighbour's story and claim", ...);
test("when the decider throws, the threshold gate holds a near duplicate and the item never posts twice", ...);
test("DRY_RUN writes no story", ...);
```

Every existing test that fakes `matchItem` with `{ verdict: "MATCH", match_claim_id }` becomes `{ verdict: "MATCH", decision: "join", story_id, stance }` with the seed carrying a story for that claim; `{ verdict: "NEW", new_claim }` gains `decision: "new", fact: new_claim.canonical_text`. Seeds: give `createFakeStore` a `stories` option.

- [ ] **Step 2: Run** `node --test test/pipeline.test.js` → the new tests fail.

- [ ] **Step 3: Implement** in `hunter.js`.

`huntSubject`: after `collectCandidates` and `loadPendingResends`:
```js
// Bodies first: decode Google's wrapper, catch the url duplicate, fetch the text.
const urlDuplicates = await fetchBodies(deps, db, subject, candidates);
// One batch embedding call: headline plus the first 1500 characters of the body.
const vectors = await embedCandidates(deps, db, subject, candidates);
for (const [index, item] of candidates.entries()) {
  const outcome = await classifyItem(deps, db, subject, item, vectors?.[index] ?? null, urlDuplicates.get(item));
  ...
```
`fetchBodies` loops `extractBody` (unchanged) and returns a `Map<item, duplicateId>`. `embedCandidates` embeds `embeddingText(item)` = `item.body ? \`${item.title}\n\n${item.body.slice(0, 1500)}\` : item.title` (export `embeddingText`).

`classifyItem(deps, db, subject, item, vector, urlDuplicateId)`:
1. stamp fields; `nearest` recorded as today (audit columns only).
2. `if (urlDuplicateId) return heldOutcome(item, "echo", urlDuplicateId, "url")`.
3. `const decision = await decideStory(deps, db, subject, item)` — `askMatcher` renamed: `stories = db ? await deps.store.storyShortlist(db, subject.name, item.embedding, { top: STORY_SHORTLIST, days: STORY_WINDOW_DAYS })` (constants from env `STORY_SHORTLIST` default 3, `STORY_WINDOW_DAYS` default 7), then `deps.matchItem({ subject, item, stories, confusables, subjectNames })`; on failure or matcher off → `{ verdict: "UNSURE", decision: null, unavailable: true }`; log the `matcher ... because:` lines as today with the decision word.
4. `WRONG_SUBJECT` → as today.
5. `decision === "join"` → `item.posted = false; item.heldReason = "story"; item.storyId = story_id; item.storyDecision = "join"; return { kind: "match", item, storyId, claimId: story.claim_id ?? null, official, stance }` — `story` found in the shortlist by id.
6. `decision.unavailable` → `const fallbackHold = checkDuplicateGate(subject, item, nearest, official, null); if (fallbackHold) return heldOutcome(...)` (log says "fallback").
7. untrusted gate as today.
8. post path as today; the outcome adds `fact: decision.fact ?? item.title`, `decision: decision.decision ?? "new"`, `reactsTo: decision.decision === "reaction" ? decision.story_id : null`.

Remove the late re-application of the threshold gate (the official exemption existed only for that gate; the decider sees official items like any other). Delete `checkDuplicateGate`'s second branch; keep the first as the fallback. Update the JSDoc and the `History:` pointer to `docs/decisions.md#stories-as-objects`.

`recordOutcome`:
- `held` (url dup): insert item; `storyId = await store.storyOfItem(db, neighborId)`; if found `setItemStory(db, itemId, storyId, "join")`; claim inheritance as today (drift check kept).
- `match` (join): insert item (with `storyId`/`storyDecision` already on the item); if `outcome.claimId` → `linkClaimSource` echo/official + the confirmation logic as today; dry run previews as today.
- `post`: insert item; mint the claim as today when `isRealClaim`; then `outcome.storyId = await store.insertStory(db, { subject, rootItem: itemId, fact: outcome.fact, reactsTo: outcome.reactsTo, claimId: outcome.claimId, decidedBy: "story" })`; `setItemStory(db, itemId, outcome.storyId, outcome.decision)`. Nothing on dry run.

`buildDeps` unchanged in shape (matchItem, embedTexts, fetchArticleBody, decodeGoogleNewsUrl, store). Remove `SEMANTIC_DUP_THRESHOLD`'s "Gate 2" comments; it is now `FALLBACK_DUP_THRESHOLD` reading the same env name (so A's config still applies to the fallback), default 0.85.

- [ ] **Step 4: Run** `npm test` → all green. Then a dry run on the bench keys: `DRY_RUN=1 HOURS_BACK=6 node -e 'import("./bench/env.js").then(m=>m.loadBenchEnv()).then(()=>import("./hunter.js")).then(h=>h.main())'` — expect `matcher join/new/...` lines and `because:` lines, no errors, nothing written (bench database, TEST keys; a handful of Haiku calls, under $0.05). Record the tokens printed.

- [ ] **Step 5: Commit** — `Hunter: bodies before the decision, headline+body embedding, stories decided and recorded; threshold gate is the fallback`.

---

### Task 4: Backfill — the archive gets its stories

**Files:**
- Create: `scripts/backfill-stories.js`
- Test: `scripts/backfill-stories.test.js` (pure planning function on fakes)

**Interfaces:**
- Produces: `planStories(items, labels)` → `{ stories: [{ rootItem, fact, members: [itemId], claimId, decidedBy }], skipped: number }` — pure; the script wraps it in SQL.

- [ ] **Step 1: Failing tests** for `planStories`:
```js
test("a labelled root with dups becomes one story with those members", ...)   // labels: #5 root, #34 dup_of 5 → story root 5 members [5, 34]
test("a labelled dup whose root is missing from the archive becomes its own story", ...)
test("an unlabelled posted item is its own story; an unlabelled held item joins its nearest item's story when that story exists, else its own", ...)
test("items that already have a story are skipped", ...)
test("the fact is the root's origin claim text when it has one, else the root's title", ...)
```

- [ ] **Step 2: Implement.** The script:
  - reads `items` (id, subject, title, posted, nearest_item, story_id, seen_at) and the current label per item (the `DISTINCT ON` query from `labels/export-stories.js`: `wanted_bucket, reason, dup_of, author`), and `claim_sources` rows with role `origin`/`official` joined to `claims.canonical_text`;
  - `planStories`: for items without `story_id`, in id order — labelled dups group under `dup_of` (resolve chains as `labels/story-gate.js rootOf`); every other item is a root; unlabelled held items with `nearest_item` whose root's story is planned or exists join it; fact = origin claim text of the root, else its title; `decidedBy: "backfill"`;
  - with `DRY_RUN=1` (default when the env var is absent — the script refuses to write unless `DRY_RUN=0`): prints `stories to create`, `members to place`, `skipped`, five sample stories;
  - otherwise, in one transaction: `insertStory` per story, `setItemStory` per member (`"new"` for roots, `"join"` for members); prints the counts written.

- [ ] **Step 3: Run the tests**, then `DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) node scripts/backfill-stories.js` (dry run) — report the counts. Then apply the schema (`node migrate.js`, additive) and run with `DRY_RUN=0`. Verify: `SELECT count(*) FROM stories; SELECT count(*) FROM items WHERE story_id IS NULL;` — the second should be the wrong-subject/untrusted rows only if the plan covers everything, else say what was left and why.

- [ ] **Step 4: Commit** — `Backfill stories from the labels and the archive's own record (dry run by default)`.

---

### Task 5: The bench gate — the archive through the real decider

**Files:**
- Create: `bench/story.js`
- Modify: `bench/README.md`
- Modify: `labels/measure-stories-llm.js` (header note: superseded by `bench/story.js`; kept for the measured caches)

**Interfaces:**
- Consumes: `lib/matcher.js` `matchItem`/`usageTotals`; `labels/story-gate.js` `cosine`, `storiesByArrival`; `tmp/labels/stories.json`, `bodies.json`, `vectors-body.json`.

- [ ] **Step 1: Implement** `bench/story.js` as `labels/measure-stories-llm.js` with these changes: `loadBenchEnv()` then import `../lib/matcher.js`; the in-memory shortlist built the same way `storyShortlist` ranks (live = a member within 7 days, similarity = max over members); each decision is `matchItem({ subject, item: { ...pipeline shape, body }, stories: candidates.map(toShortlistRow), subjectNames: [subject surname], fightWeekShape })`; stories keyed by the root item id, offered ids = `String(root)`; `--no-shape` switches the block off; `--repeat K` runs the whole cascade K times with caches `tmp/labels/bench-story-<tag>-r<k>.json`, prints one table row per run and the spread; `--limit N`; the tokens/cost line from `usageTotals()` including cache reads. Exit the run with a `## gate` line: `held ≥ 307 and useful swallowed ≤ 9 and none of #490/#594/#598 joined to #474` → `PASS`/`FAIL` with the reasons.

- [ ] **Step 2: README** — a section "The story gate" with the command, what it scores, the noise band (±4 held, ±3 swallowed), the budget rule.

- [ ] **Step 3: Run once** (`node bench/story.js --mode body`) — about $1.85. Record the table, the gate line, the cache-read tokens (state whether caching engaged at all: Haiku's minimum cacheable prefix is larger than our system block, so it may not).

- [ ] **Step 4: Commit** — `Bench: the story gate — the archive through the real decider, scored against the labels`.

---

### Task 6: Bucket regression and the record

- [ ] **Step 1:** `node bench/run.js --step bucket --from corpus/graded-2026-09.json --split tune --repeat 3` — the bucket step passes `stories: []` (update `bench/steps.js` `matcher`/`bucket` to call `matchItem` with `stories` instead of `candidates`; keep the `candidatesFor` hook name as `storiesFor`). Compare with the standing 38/45, false loud claims 0. About $0.30.
- [ ] **Step 2: Docs.** `docs/decisions.md#stories-as-objects` (what was chosen between, the measured numbers, the compatibility shape, the fallback gate, what the bench said today); `docs/architecture-overview.html` §3 (stories in the data model), §4 (the new stage order), §5 (the reshaped call); `TODO.md` 3f (BUILT on the branch, gate result), 3h (done by construction); `docs/story-matching-options.md` "Anton's decision" line; `docs/checkin-log.md` entry at the top with data / changes / proposals / next attention and the tokens spent.
- [ ] **Step 3:** `npm test`; commit — `Stories as objects: decision record, architecture, TODO, check-in`.

## What is NOT in this plan

- Deploying. The branch stays local until Anton sees the gate table.
- The reaction field in `feedback` and scoring reactions (Anton's 32 rulings).
- Authority levels (TODO 3j), odds extraction (3i), Eurosport links (3g).
- Re-labelling the 12 fight-week items and anything since 2026-09-05.
