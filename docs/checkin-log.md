# FighterBot — autonomous check-in log

Append-only. One entry per scheduled self-improvement run (newest on top).
Each run MUST append its entry and commit, even when nothing was changed —
the log entry is the session's trace. Keep entries ≤ ~8 lines, same shape
as the chat report: data / changes / proposals / next attention.

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

- 📊 Bootstrap: 7 claims, 23 evidence links from ~50-item archive. Masvidal cluster (5 src), Fighter A UFC-Paris announcement (5 src, rumor — awaiting ufc.com for first lifecycle confirmation). All claims born rumor (no official sources in archive yet).
- 🔧 Live: 3-gate ladder (URL → embedding 0.80 → Haiku matcher MATCH/NEW/NO_CLAIM/WRONG_SUBJECT/UNSURE); conservative lifecycle (confirm via ufc.com only); posts: 🚨 ceremonies / 🕵️ rumor lines / ✅ threaded confirmations. Commit ca977b9.
- 👁 Watch: WRONG_SUBJECT headline-blindness (drops division news that doesn't name the fighter — 2e fixes); type-enum drift ('prediction'); canonical name flubs (Islam/Khabib); Google 503s ~1/day (2f retry pending); UNSURE rate; the armed Fighter A confirmation trap.
