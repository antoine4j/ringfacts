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
