# Code style

## Why this exists

Anton is the primary reader of this code, and he could not read it. That is a
measurement, not a matter of taste: `hunter.js` was 726 lines at **35% comments
and 57% code**, with thirteen comment blocks of eight lines or more. Finding out
what a function *did* meant reading three paragraphs about what went wrong in
August first.

The cost was not hypothetical. The semantic dedup gate chains — a held article
becomes a valid nearest neighbour for the next one, so clusters walk away from
the story they started on — and nobody spotted it by reading the file, because
the file could not be read. A project whose owner cannot review it cannot be
directed.

So this document is written for a smart reader who is not a working JavaScript
developer, and the code should be too.

---

## The seven rules

### 1. Every function gets a JSDoc block

What it does, its parameters, what it returns. One or two sentences. Never an
essay.

{% raw %}
```js
/**
 * Groups items by outlet, keeping input order within each group.
 *
 * @param {Item[]} items
 * @returns {{ name: string, urls: string[] }[]}
 */
```
{% endraw %}

The `@param` and `@returns` tags are not decoration — they make the editor show
you what a variable is when you hover it. That is most of TypeScript's help with
no build step, which is the reason this project stays plain JavaScript.

### 2. Every block inside a function gets a one-line comment

A blank line above it, then one line — two at the outside — saying **what the
block does**. Not why history made it that way; see rule 3.

```js
// Number the links only when an outlet has more than one, so a lone
// "Sherdog (1)" never implies a missing sibling.
for (const { name, urls } of outlets) {
```

### 3. No decision history in code

Measurements, dated incidents, rejected alternatives — all of it goes to
[decisions.md](decisions.md). The function keeps one pointer line:

```js
 * History: docs/decisions.md#dup-threshold
```

The reasoning is not being thrown away. It is being moved somewhere it can be
read as history instead of blocking the code.

### 4. One operation per line

No stacked chains. This, from the old `fetchFreshItems`, is the thing to avoid:

```js
// Don't:
return items
  .filter((item) => item.publishedAt.getTime() > cutoff)
  .sort((a, b) => b.publishedAt - a.publishedAt)
  .filter((item) => !seen.has(item.url) && seen.add(item.url));
```

Three different ideas — freshness, ordering, deduplication — fused into one
expression, with a `Set.add` smuggled inside a filter for its side effect. Each
step gets its own named line.

### 5. Name intermediate values

If a condition is worth testing, it is worth a name.

```js
const isDuplicate = nearest && nearest.similarity >= SEMANTIC_DUP_THRESHOLD;
```

### 6. No short names

`nc`, `r`, `c`, `mid`, `i` all appeared in `hunter.js`. A returning reader cannot
guess that `nc` meant `newClaim`. Write `newClaim`, `result`, `ceremony`,
`messageId`, `index`.

The exception is a genuinely conventional loop counter in a two-line loop, and
even then prefer the real name.

### 7. Functions fit on a screen

Roughly 50 lines. Past that, split. `huntSubject` was 390.

---

## Where history goes

[decisions.md](decisions.md) holds one entry per decision:

```
## <slug> — <short title>
*<date>*

<what was decided, what was measured, what was considered and rejected>
```

Code references an entry by its slug. The slug is the contract — renaming one
breaks every pointer to it, so don't.

---

## The worked example

This is the load-bearing part of this document. The rules above are just words
describing this change.

### Before

19 lines of code under a 17-line comment:

```js
export function alsoMentioningLine(items) {
  const bySource = new Map();
  for (const item of items) {
    const name = item.source.trim() || hostOf(item.resolvedUrl ?? item.url);
    const key = name.toLowerCase();
    const url = item.resolvedUrl ?? item.url;
    if (!bySource.has(key)) bySource.set(key, { name, urls: [] });
    const outlet = bySource.get(key);
    if (!outlet.urls.includes(url)) outlet.urls.push(url);
  }
  const links = [];
  for (const { name, urls } of bySource.values()) {
    for (const [i, url] of urls.entries()) {
      const label = urls.length > 1 ? `${name} (${i + 1})` : name;
      links.push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    }
  }
  return `↘ Also mentioning: ${links.join(" · ")}`;
}
```

### After

{% raw %}
```js
/**
 * Renders the one shared line carrying every demoted item, as source links
 * rather than headlines.
 *
 * @param {Item[]} items  Demoted items, newest first.
 * @returns {string}      Telegram HTML: "↘ Also mentioning: Sherdog · ESPN (1) · ESPN (2)"
 *
 * History: docs/decisions.md#tangential-line
 */
export function alsoMentioningLine(items) {
  const outlets = groupByOutlet(items);
  const links = [];

  // Number the links only when an outlet has more than one, so a lone
  // "Sherdog (1)" never implies a missing sibling.
  for (const { name, urls } of outlets) {
    for (const [index, url] of urls.entries()) {
      const label = urls.length > 1 ? `${name} (${index + 1})` : name;
      links.push(anchor(url, label));
    }
  }

  return `↘ Also mentioning: ${links.join(" · ")}`;
}

/**
 * Groups items by outlet, keeping input order within each group.
 * Identical URLs collapse — the same article reached twice is one story.
 *
 * @param {Item[]} items
 * @returns {{ name: string, urls: string[] }[]}
 */
function groupByOutlet(items) {
  const byName = new Map();

  for (const item of items) {
    // Fall back to the hostname: a missing <source> tag would otherwise
    // render an invisible, zero-width link.
    const name = item.source.trim() || hostOf(articleUrl(item));
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name, urls: [] });

    const outlet = byName.get(key);
    const url = articleUrl(item);
    if (!outlet.urls.includes(url)) outlet.urls.push(url);
  }

  return [...byName.values()];
}

/** The real article URL, once Google's wrapper has been decoded. */
function articleUrl(item) {
  return item.resolvedUrl ?? item.url;
}

/** An escaped Telegram HTML anchor. */
function anchor(url, label) {
  return `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
}
```
{% endraw %}

### The trade, stated plainly

The "after" is **more** total lines, across four functions instead of one. What
it buys: no piece exceeds about fifteen lines, every piece has a name that says
what it is, and `item.resolvedUrl ?? item.url` appears once rather than three
times.

That is the trade this whole document makes. If it ever stops being worth it,
change this file and say why.

---

## The target shape for `huntSubject`

`huntSubject` is the biggest function in the project and the reason rule 7
exists. It becomes eight named stages:

| Stage | Does |
|---|---|
| `collectCandidates` | Fetch the feeds, drop URLs already stored, apply the 5-per-subject cap |
| `loadPendingResends` | Items an earlier failed send stranded |
| `embedTitles` | One batch embedding call; degrades to none on failure |
| `classifyItem` | Per item: nearest neighbour → dup gate → body → matcher → one named outcome |
| `recordOutcome` | Every database write for one item |
| `assembleMessages` | Sort outcomes into ceremonies / rumors / digest / tangential, fold in resends |
| `translateForeignHeadlines` | The Gemini pass, digest bullets only |
| `deliver` | Send the three message types; mark rows unposted if a send fails |

`classifyItem` is the largest and carries its own helpers — `checkDuplicateGate`,
`extractBody`, `askMatcher`.

The payoff is that `huntSubject` itself becomes about ten lines: the eight calls
in order, plus the early return. You can read the whole pipeline on one screen,
then open whichever stage you are questioning.

**Order the stages in the file in the order they run.** More functions can mean
more jumping around while reading; laying them out top-to-bottom in pipeline
order is what prevents that.

---

## What is not enforced, and why

**There is no linter.** Decided 2026-08-13, deliberately.

Roughly four of the seven rules are mechanically checkable — ESLint's
`require-jsdoc`, `id-length`, `max-lines-per-function`, `max-depth`. The other
three are judgment.

Two reasons not to:

1. This project has **zero dev dependencies**. `npm test` is `node --test`, no
   build step, nothing to maintain. A lint config is real added weight.
2. A linter enforces the floor, not the goal. It can tell you a function has no
   JSDoc; it cannot tell you the JSDoc is useless. It can tell you a function is
   80 lines; it cannot tell you it was split in the wrong place. The two things
   that actually made `hunter.js` unreadable — essay comments and one giant
   function — are exactly what a linter judges worst.

Review is the gate. If that stops working, revisit — but revisit deliberately,
rather than adding ESLint because it seemed tidy.

## What tests a change needs

Agreed with Anton 2026-09-04. Three tiers, each catching a failure the others
cannot; a change needs the tiers that apply to it.

1. **Unit tests with fake dependencies — always.** Synthetic inputs, seconds,
   run by the pre-commit hook. They test logic: parsing, threshold arithmetic,
   claim state transitions, the verdict validator. Every new function gets
   one. They cannot see wiring — the misspelled translator key passed all 27
   of them (self-improvement §4).
2. **Corpus score with real articles — for anything that judges.** The
   labelled corpus (`corpus/`, real archive items with Anton's verdict
   attached) is the ground truth for the matcher, the tier rule, and any
   future judgment step such as a search verifier. The output is a score, not
   pass/fail — the model is not deterministic and "64% → 88%" is the useful
   answer. A change to a judgment step reports the score before and after.
   Real data only: synthetic articles have no keyword-stuffed spam, no site
   navigation menus, no Ukrainian blogs, and those are what break things. The
   corpus grows from Anton's monthly grading pass (goals.md, G2).
3. **Live smoke — before deploy, then observe after.** The order matters:
   first a local `DRY_RUN=1` run against the real feeds (fetches, decides,
   posts nothing) — that is the gate, and a change does not deploy until it
   passes. Then deploy, then the deploy-and-observe window from
   self-improvement §8 to see what it actually catches over a few days. The
   only tier that sees whether the parts are plugged into each other.

The bench runner (TODO.md, priority 6) is what lets Anton run tier 2 himself
from a fresh session.

## Commits

This is a public repository, and the history is part of what it shows. Rules:

1. **One logical change per commit.** A feature, a fix, a doc decision — not
   a working session. Fix-ups to something not yet pushed get folded into the
   commit they fix (`git commit --amend`, or an interactive squash), never
   pushed as "fix typo". Once pushed, history is not rewritten.
2. **The subject line names the change for a stranger.** Plain English,
   under 72 characters, what changed and — when it fits — what it was for:
   *"Confirmation posts link the decoded article URL, not Google's wrapper"*.
   No prefixes, no ticket codes, no "WIP", no "update docs".
3. **The body says why.** What was wrong or missing, what was measured, what
   was considered and rejected — enough that the commit teaches, per
   self-improvement §7. Decisions worth finding later also get an entry in
   [decisions.md](decisions.md); the commit body is not the only record.
4. **Nothing private.** No secret values, no personal data, no chat-ids or
   keys — command substitution and env names only. The Telegram group and
   its members are never described in a way that identifies them.
5. **Tests pass before the commit exists.** The pre-commit hook enforces it;
   `--no-verify` is not used (self-improvement §4).
6. **Attribution line at the end** when Claude wrote it:
   `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
