# Decisions

Why the code is the way it is: measurements taken, incidents survived,
alternatives considered and rejected.

This file exists so the code doesn't have to carry it. Under
[code-style.md](code-style.md) rule 3, a function keeps a one-line pointer and
the reasoning lives here, where it reads as history instead of blocking the
thing it explains.

**Format.** One entry per decision, newest at the bottom:

```
## <slug> — <short title>
*<date>*

<what was decided, what was measured, what was considered and rejected>
```

Code references an entry by its slug:

```js
 * History: docs/decisions.md#dup-threshold
```

The slug is the contract. Renaming one breaks every pointer to it.

> **Status: incomplete.** Two entries so far. Roughly 260 lines of history are
> still inline in `hunter.js` awaiting extraction — that is its own piece of
> work, not something to do halfway.

---

## dup-threshold — Semantic duplicates are held at 0.80 cosine
*2026-08-06*

Two headlines scoring above 0.80 cosine similarity are treated as the same
story, and the later one is held rather than posted.

Tuned on real data rather than picked: a Ukrainian↔English translated pair of
the same story measured **0.841**, while unrelated stories about the same
fighter topped out at **0.702**. 0.80 sits in that gap with room on both sides.

The same method picked `CLAIM_DRIFT_GAP` — measure the two populations, put the
line in the space between them.

**Known limitation, unresolved.** The gate compares each new item against its
single nearest stored neighbour, and `nearestRecent` filters on neither `posted`
nor `held_reason` — so a *held* article is itself a valid neighbour for the next
one. Each hop only has to clear 0.80 against its immediate predecessor, and
cosine similarity is not transitive, so a cluster can walk away from the story
it started on. Observed live as a `0.802 → 0.869 → 0.974` chain. The existing
`inheritanceDrifts` guard prevents the wrong *claim link* but not the wrong
*hold*: the article still never reaches the group.

## tangential-line — Demoted items share one line, with numbered repeats
*2026-08-09*

Items the tier rule demotes as tangential are still stored and still linked, but
they are not worth a headline. They fold into a single "↘ Also mentioning" line
of source links, grouped by outlet so it stays scannable.

**Why repeats are numbered.** An outlet with two demoted stories in one run gets
both links, as `Bloody Elbow (1) · Bloody Elbow (2)`. The first version showed
only the newest, which read more cleanly but made the older story permanently
unreachable: this message is the only place a demoted article is ever offered,
and Gate 1 means a later run will never offer it again. A bare repeated outlet
name reads as a bug, so the index is what earns the second link its place.

Numbering appears only when an outlet actually has more than one — a lone
`Sherdog (1)` would imply a missing sibling.

**Two smaller cases.** The outlet name falls back to the URL hostname when
`source` is empty, which `parseRssItems` returns for a missing `<source>` tag;
without the fallback that link renders zero-width and invisible. And identical
URLs collapse — the same article reached twice is one story, and must not be
numbered as though it were two.
