# Search verification — design for review

*Drafted 2026-09-04 by Claude for Anton's review. Nothing here is built.
TODO.md priority 4; serves goals G4 (confirmed means official), G2's
stale-event clause, and the G1 recall probe.*

## The idea, in one paragraph

When the matcher mints a new fight claim (a booking, a result, a withdrawal),
the pipeline today waits for an official source to arrive by feed. Search
turns that wait into a question: one web search for the claim, the results
sorted by **domain trust in code**, the claim's status updated from what the
trusted domains say. The same call can pull the event date, which unblocks
the stale-event rule, and run on a schedule as the recall probe.

## What the spike showed (2026-09-04, test search key)

One Haiku call with the built-in web search tool, asking whether Donchenko vs
Soriano is officially scheduled:

| | |
|---|---|
| searches | 1 |
| input tokens (results injected by the tool) | 10,798 |
| output tokens | 172 |
| wall time | 3.8 s |
| results | rotowire, sofascore, tapology, heavy.com, mmatown, next-fight, threads, a betting blog, yahoo |
| the model's own answer | **"Status: Official"** |

No ufc.com page was among the results, and the model still said "official".
That is the whole design constraint: **the model finds and summarises; code
decides what a source is worth.** A verification that let the model set the
status would break G4 on its first run.

Cost per verification at Haiku rates: about a cent of tokens plus the
per-search fee (rate to be read off the console after the first real batch —
not quoted from memory). A handful of claims a week is cents a month. Both
spend caps stay where they are.

## Shape

### 1. Domain trust list — `domain/mma.js`, data not code

Three tiers, matched on the result URL's hostname (`lib/untrusted.js`
`domainOf`, the same reading the spam rule uses):

| tier | means | examples (to be filled by Anton and the archive) |
|---|---|---|
| **official** | can confirm | `ufc.com` and its editions, the fighter's own accounts (already `domain.officialSource`) |
| **reputable** | can corroborate, never confirm | mmafighting.com, mmajunkie, bloodyelbow, sherdog, sport.ua, tribuna.com … the outlets already in `lib/feeds.js` plus the ones the archive shows delivering real bodies |
| **noise** | ignored | betting sites, aggregators (tapology, sofascore, next-fight), social posts, everything unlisted |

Unlisted is noise by default. The list is the real work; the search call is
the easy part. The archive is the starting point: every domain with ≥5 items
and a real body rate is a candidate for reputable; the spam rule's record
says which are not.

### 2. The verifier — `lib/verify.js`, one function, dependencies handed in

```
verifyClaim({ claim, subject, search, trust }) →
  { status: "official" | "corroborated" | "unverified",
    evidence: [{ url, domain, tier, snippet }],
    facts: { date?, event?, opponent? } }
```

- `search` is a dependency: the Anthropic web search tool on **its own key**
  (`ANTHROPIC_SEARCH_KEY`, test twin in `bench/.env.bench`), so console cost
  splits LLM from search. Never the matcher's key.
- One search per claim, `max_uses: 1`. The query is built from the claim's
  canonical text and the subject's name.
- The model's job is narrow: return the result URLs it saw and, for each, a
  one-line snippet and any date it states. **It does not return a status.**
- Code maps each URL to a tier. `official` if any official-tier result
  asserts the claim; `corroborated` if ≥2 reputable domains do;
  `unverified` otherwise. Ten noise results are still `unverified`.
- Results are untrusted text: the tool output is parsed with the same forced
  tool-use shape the matcher uses (`normalizeVerdict`'s discipline), and
  nothing in a snippet can change a tier.

### 3. Where it plugs in

- **New claim of a lifecycle type** (`announcement`, `result`, `injury`,
  `negotiation`): `recordOutcome` calls the verifier after the claim row
  exists. `official` → `confirmClaim` (the existing path, same ✅ thread);
  `corroborated` → the rumor line gains "· corroborated by X, Y" (a display
  change: **shown to Anton before it ships**, per goals.md); `unverified` →
  nothing changes.
- **Event date**: a date found on an official or reputable result is written
  to `claims.facts.date` when the matcher left it empty — this is what the
  stale-event rule (priority 5) needs.
- **Re-check**: claims still `rumor` after 48 h are re-verified once a day
  from the mentions job's sweep (already scheduled daily), which is also the
  G4 "resolved within 48 h" measurement.
- **Recall probe** (monthly, by hand at first): "career events for <subject>
  in the last 30 days" through the same search dependency, compared against
  the archive. Same trust list, same code.

### 4. Testable, per self-improvement §9

`verifyClaim` is pure given `search` and `trust`; `test/verify.test.js` feeds
canned result sets (the spike's nine URLs are the first fixture) and asserts
the tier logic. The bench gets a `verify` step (`needs: ["search"]`) so Anton
can run "verify these claims" on the test key. The trust list gets a test
that every outlet in `lib/feeds.js` is in it.

### 5. Kill switch and cost ceiling

`SEARCH_VERIFY_OFF=1` disables the call; `SEARCH_MAX_PER_RUN` (default 5)
caps searches per hunt so a runaway claim burst cannot spend. Every call logs
`web_search_requests` from the usage block, so the check-in runs can add up
the month.

## Open questions for Anton

1. **The reputable list.** Seed it from `lib/feeds.js` plus the archive's
   readable domains, or hand-pick? (Claude's lean: seed from data, you prune.)
2. **Corroborated display.** Append to the rumor line, or leave the display
   alone and only use corroboration for ranking? (Lean: leave display alone
   in v1 — G4 is about not over-claiming, and "corroborated" is a new label.)
3. **Denials.** Search will surface "fight is off" stories. v1 records them as
   evidence with `stance: denies` (the column exists) and does nothing else;
   the denied transition stays phase 2.

## Not in v1

Verifying non-claim articles, translating results, a second model for the
search, any search provider other than the Anthropic tool.
