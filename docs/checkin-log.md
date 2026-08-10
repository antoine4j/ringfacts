# RingFacts — autonomous check-in log

Append-only. One entry per scheduled self-improvement run (newest on top).
Each run MUST append its entry and commit, even when nothing was changed —
the log entry is the session's trace. Keep entries ≤ ~8 lines, same shape
as the chat report: data / changes / proposals / next attention.

---

## 2026-08-09 — digest tier shipped: tangential articles fold into one line (manual session, Anton driving; implementation on Sonnet 5 per an approved plan)

- 🔧 **Shipped** the tier rule measured earlier today: an article whose headline never names the fighter and whose body (≥300ch) names them ≤1× folds into a shared "↘ Also mentioning: Source1 · Source2" line instead of its own bullet. Nothing dropped — still `posted=true`, still stored and linked; just not a headline. Rule lives in `lib/tier.js`, imported by both `hunter.js` and `audit-digest-tier.js` so re-measurement can't drift from production. New `digest_tier` column, deliberately not `held_reason` (that column means "why the group never saw this"; tangential items are still shown).
- 🔧 **`body_via` also shipped** (schema + `insertItem` + hunter's body step + `backfill-bodies.js`): records which extraction rung produced a body or which failure stopped it. Closes the "Sherdog succeeds with a 75-char blurb and nothing shows it" gap. Rung-clustering check on the 6 archive demotions: 3 came from `feed-content` (the richest rung — full RSS content, not a page scrape), 3 from `json-ld`/`article-tag` (low truncation risk), none from the weak rungs. The mention counts are real, not a truncation artifact.
- 🔧 **Bug found and fixed while writing the new line:** `digestLine` and the other three send sites interpolated `item.url` into an `href` unescaped. Both parsers decode HTML entities into the URL, so a WordPress feed's `?utm_source=rss&utm_medium=rss` reached the href with a bare `&` — Telegram's HTML mode rejects that and `sendTelegramMessage` fails the WHOLE message silently, while every item in it is already stored `posted=true`. Bloody Elbow is WordPress. Escaped at all four sites.
- 🔧 Also: `lib/fighters.js` now holds the shared watchlist (`FIGHTERS` was private to hunter.js, forcing `audit-digest-tier.js` to hand-copy names); `matchesFighter` delegates to the same name-match function the tier rule uses instead of a parallel implementation.
- 🔧 Verified before deploy: 4 boundary cases direct against `lib/tier.js`; `digestLine`/`alsoMentioningLine` unit-checked for escaping/dedup/fallback (both exported, plus `huntFighter`, specifically so this kind of check doesn't need live news to cooperate); `audit-digest-tier.js` regression gate unchanged (6/36, 0 claim-bearing) after switching to import the live rule; `verify-digest-tier.js` (new, saved) drives `huntFighter` with synthetic candidates through the real matcher/embedder under DRY_RUN — confirms the full wiring (verdict → tier → line vs. suppression), not just the pieces; live probe to the admin DM confirmed Telegram accepts the new line's HTML.
- 📊 Deployed + one live execution (`fighterbot-hunter-p2bq6`, exit 0). Real traffic exercised `body_via` for the first time in production: a golf-highlights video namesake for "Yaroslav Amosov" got stamped `http-403` and was correctly caught as `WRONG_SUBJECT` by the existing matcher — never posted. `digest_tier` itself hasn't fired on live data yet (that was the run's only item, held before reaching the tier decision); mechanism is proven by `verify-digest-tier.js` and will show up next time a real tangential item lands.
- 👁 Watch: whether tangential demotion rate holds near the measured ~17%, or drifts once `body_via` accumulates on fresh rows and the archive can be re-measured on genuinely fresh data instead of the backfilled one. Cross-rail feed reuse (recovers the 5 Bloody Elbow 403s) stays backlog — Anton flagged that it must not hardcode per-outlet behaviour, since adding athletes may change which outlets/feeds/extraction matter at all.

---

## 2026-08-09 — bodies backfilled over the whole archive; digest tier threshold measured (manual session, Anton driving)

- 📊 Anton named a real asymmetry: claim-bearing articles get canonicalized and aggregated, everything else is passed to the group as the publisher's raw headline — so the items the system understood least are shown rawest. Measured: of 36 posted items, **24 are raw digest lines**, 11 naming no fighter in the headline. First pass said "defer, only 4/60 items have bodies"; Anton pushed back that 2e was hours old, not days — correctly. **`backfill-bodies.js`** replays the live decode+extract ladder over the pre-2e archive: body coverage 4/60 → **49/60**, no week-long wait.
- 📊 **Threshold read off the data.** Among items with a usable body, claim-bearing articles name the fighter 2–12×; the junk cluster 0–1×. Clean gap at 1|2, same shape as the 0.80 dup and 0.10 drift thresholds. Rejected: name-in-headline alone (#26 is a real Amosov story headlined "30-1 UFC welterweight") and first-mention position (#7 is legitimate at 71% depth). The 300ch floor is load-bearing — #12 is claim-bearing, headline-anonymous, 1× off a 141ch og-description blurb. Candidate rule demotes 6/36 posted, 0 claim-bearing, catching all three of today's complaints. **Not built** — it changes what the group sees; awaiting Anton.
- 🔧 Fetch telemetry, from the backfill's failures: **decode is 63/63, zero network** (the fragile half is holding; the batchexecute slow path still unused). All 11 remaining failures are publisher-side. **5 of 11 are Bloody Elbow 403s** — yet its RSS carries full article text, so the same outlet yields bodies free via the direct rail and 403s via Google News. **Sherdog is the silent one: 4/4 bodies are sub-300ch og-description blurbs** — counted as success, useless in practice. `mshale.com` produced both of the archive's pure-junk items (a Bravo talk-show clip, an iRacing entry list).
- 🔧 Fixed in the backfill: it was discarding a successful decode whenever the body fetch 403'd, leaving 9 rows without a `resolved_url` that Gate 1 dedups on. hunter.js:299 never had this bug. All 60 items now carry a resolved_url.
- 👁 Next fetch work, in value order: store the extraction rung per item (console-only today, so silent-thin outlets like Sherdog need a manual audit to spot); treat sub-300ch as no-body rather than success; reuse direct-feed content for Google-discovered articles from the same outlet (fixes Bloody Elbow outright).

---

## 2026-08-09 — 2e watch item fired: furniture mentions fixed (manual session, Anton reported)

- 📊 Anton read the group digest and couldn't find "Topuria" in the posted articles — correctly. Items #56/#58/#60 (Bloody Elbow direct feed) matched only through invisible markup: an image `alt` ("Topuria v Gaethje" photo caption, Cormier piece), an href URL slug (Ruffy piece), and a visible "LATEST NEWS" cross-promo block (Machado Garry piece). `matchesFighter` searched raw feed HTML; the matcher then jittered NO_CLAIM instead of WRONG_SUBJECT — the exact watch item logged at 2e ship, trigger ("digest bloats with tangential items") fired.
- 🔧 Two-layer fix (commit 5a48896): `matchesFighter` matches `htmlToText(feedContent)` — reader-visible words only, kills both markup vectors before Gate 1, item never enters the DB (same as any non-matching feed article). Matcher rules gain: fighter nowhere in shown text, or only in site furniture (link lists, captions, nav) → WRONG_SUBJECT.
- 🔧 Verified: captured-feed regression (Ruffy/Cormier flip to non-match; genuine manager article and prose-mention Usman article keep matching); live Haiku probes (#60 → WRONG_SUBJECT; Usman-manager body → MATCH claim 12, correctly — it's the Makhachev-successor story); full DRY_RUN clean; deployed and one live execution green (exit 0, nothing new, group untouched). Items #56/58/60 left as-is (immutable evidence; test mode).
- 👁 Opposite failure now possible: over-dropping. Watch that genuine peripheral-prose stories (rival targeting, division context) still post as NO_CLAIM.

---

## 2026-08-08 ~19:45 PDT — claim drift found and fenced

- 📊 Window 16:00–19:45 PDT: 4 runs, 1 failed (17:17 PDT — Google 503 on all three feeds, survived the 75s retry); 19:17 green, nothing new. That is 1 failure in the 7 runs since the retry shipped and it did NOT trip the 2-in-2h alert, so the documented escalation trigger (jitter / 2e feeds) has **not** fired — left alone deliberately. 3 items, 0 posted: 2 held as embedding dups, 1 WRONG_SUBJECT (Spanish Makhachev-vs-McGregor piece that never names Topuria — the known headline-blindness case, correct on headline-only evidence, more 2e ammunition). No new claims, no confirmations. Totals: 54 items, 8 claims, 28 links, 0 confirmed.
- 📊 Ran the predecessor's audit script: **the swallowed-confirmation bug never fired in production** (0 official items ever held). The 18:22 fix was preventive and is deployed; the Donchenko trap is armed for real now.
- 🔧 **Claim drift, found by measuring:** dup inheritance is transitive, and a 0.802 → 0.869 → 0.974 chain walked an "Ilia Topuria's manager blasts Ali Abdelaziz" story onto claim #4 (a matchmaking claim). 7 of 28 links sit on a claim that is not their nearest; claim 4 had 3 foreign sources. Held dups now compare to the claim's own canonical text before linking — if another claim fits ≥ 0.10 better, the item stays held but **unlinked** (a wrong evidence row is worse than none: phase 2 counts these for corroboration and a confirmation post shows them to the group). Threshold read off the data, not guessed: drifted links sat 0.107–0.214 below the best-fitting claim, correct-but-awkward ones 0.076–0.082. Replayed all 28 links: refuses exactly the 3 bad dup-gate links, keeps all 24 good ones. Matcher-made links are never second-guessed — only the cheap gate is. Deployed.
- 💡 Claim #4's canonical text is wrong in two ways — "Someone has requested…" (no actor) and "Khabib Makhachev" (a fusion of Khabib Nurmagomedov and Islam Makhachev). It is why that claim under-scores its own evidence. Fixing stored canonical text is a data edit, so proposing rather than doing: rewrite #4, or let a re-extraction pass own it.
- 👁 Whether the drift warning fires again (and on which claims), the armed Donchenko confirmation, and 503 frequency against the 2-in-2h alert.

---

## 2026-08-08 ~22:30 PDT — 2e shipped: direct feeds, bodies, full re-bootstrap (manual session, Anton driving)

- 🔧 **2e built and deployed** (commits 065ace8..c7ddc48): six verified outlet feeds (UFC official — ufc.com/rss/news EXISTS —, MMA Fighting, Bloody Elbow, Sherdog, Sport.ua uk, Marca es); Google wrapped-URL decode (base64 fast path covers all current tokens, batchexecute + breaker for new-style); zero-dep body ladder with rung telemetry; matcher reads 1200-char excerpts; bodies fetched only post-Gate-2 (shallow-before-deep). `prediction` joined the enum; official-source regex consolidated to lib/sources.js. Job timeout 600→900s.
- 🔧 **Full claims re-bootstrap** (RESET=1 COMMIT=1, snapshot kept, items untouched): 8 claims rebuilt as #9–16. Claim #4's garbled text ("Someone has requested… Khabib Makhachev") is gone; Prates thread anchor (tg 43) re-attached to claim #16. Bootstrap's inherit path got the same drift guard as the hunter (it had re-created 5 drifted links; deleted by the same measurement). Audit after: argmax mismatches 7→2 (both deliberate matcher links), verify-drift 0 refusable, swallowed-confirmations clean.
- 📊 First live run with 2e: 6 outlets fetched (180 items pooled), 5 unseen Topuria items, bodies 2.1–2.6k chars all via free feed-content rung, one 0.99 cross-outlet dup held, 3 digest posts. Sport.ua is already carrying the Donchenko UFC-Paris story — the confirmation trap (claim #11) now has a uk-language rail too.
- 👁 Watch: peripheral body-mention items from outlet feeds jitter between WRONG_SUBJECT (dropped) and NO_CLAIM (posted) — observed both verdicts on the same Cormier/Aspinall item in consecutive runs; if the digest bloats with tangential items or real ones get dropped, tighten the prompt contract. Also: decode success rate (fast path 3/3 so far), per-outlet 403s, dup-hold volume with feeds on.

---

## 2026-08-08 ~16:00 PDT — verdict validation gate (first autonomous run)

- 📊 Window 11:45–16:00 PDT: 3 runs, all green (75s retry never even fired — zero 503s since the fix). 3 items: 1 posted, 2 held as embedding dups (0.83, 0.87 — both correctly linked as echoes to claims 4 and 7). 1 new claim: #8 negotiation, "Carlos Prates warns against Ilia Topuria moving to welterweight" (1 source). No confirmations; Donchenko trap still armed. No WRONG_SUBJECT, no UNSURE this window (1 UNSURE at 10:53 PDT, fail-open worked).
- 📊 Donchenko/Amosov "0 fetched" all day is real, not a broken feed — verified all 6 alias feeds return 200 with items; freshest for those two are 45–57h old (the Masvidal cluster, already captured).
- 🔧 lib/matcher.js: `normalizeVerdict` validates every matcher answer before the pipeline trusts it (off-enum type → other, off-enum sourcing → reported so junk can't born-confirm, MATCH on an unoffered claim id → UNSURE). Closes TODO's "add code validation" AND an FK-error crash path that would have killed the rest of a fighter's hunt. 12-case unit check + live matcher call pass; deployed.
- 🔧 Caught in testing: pg returns claim bigints as strings ("7") while the model answers with a number (7) — a naive id check would have silently downgraded EVERY match to UNSURE. Compared as strings, verified live (MATCH → claim 7).
- 👁 'prediction' is the type the model reaches for and the enum lacks (coerced to other + warned). If that warning recurs, extend the enum + docs §5. Also still watching: 503s under the 75s retry, the armed Donchenko confirmation.

---

## 2026-08-08 ~11:45 PDT — retry tuned, alert de-noised (manual session)

- 📊 12:19 PDT run failed WITH retry: 503 persisted past the 30s wait — Google's throttle waves are longer. 3 failures today (14:17Z, 18:17Z, 19:19Z).
- 🔧 RETRY_DELAY 30s→75s; task-timeout 300→600s (worst-case retries fit). Alert policy replaced: fires on 2+ failures in 2h instead of every blip (isolated failed hour loses zero news thanks to the 24h window; the alert cost was inbox noise).
- 👁 If ≥2-in-2h alerts still fire, escalate: jittered delay or start 2e direct feeds early.

---

## 2026-08-08 ~11:30 PDT — 2f retry shipped (manual session)

- 📊 11:17 PDT run failed: Google 503s on all feeds (2nd failure today — pattern crossed the "build the retry" line).
- 🔧 hunter.js: one retry per feed after 30s pause (RETRY_DELAY_MS tunable). Deployed. TODO 2f done.
- 👁 Watch whether 503s survive the retry; if yes, escalate (jittered delay / alternate discovery source).

---

## 2026-08-08 ~11:00 PDT — step 5 phase 1 launch (manual session, baseline)

- 📊 Bootstrap: 7 claims, 23 evidence links from ~50-item archive. Masvidal cluster (5 src), Donchenko UFC-Paris announcement (5 src, rumor — awaiting ufc.com for first lifecycle confirmation). All claims born rumor (no official sources in archive yet).
- 🔧 Live: 3-gate ladder (URL → embedding 0.80 → Haiku matcher MATCH/NEW/NO_CLAIM/WRONG_SUBJECT/UNSURE); conservative lifecycle (confirm via ufc.com only); posts: 🚨 ceremonies / 🕵️ rumor lines / ✅ threaded confirmations. Commit ca977b9.
- 👁 Watch: WRONG_SUBJECT headline-blindness (drops division news that doesn't name the fighter — 2e fixes); type-enum drift ('prediction'); canonical name flubs (Islam/Khabib); Google 503s ~1/day (2f retry pending); UNSURE rate; the armed Donchenko confirmation trap.
