# FighterBot — Next Steps

## Safety (Anton, console)
- [ ] **GCP budget alert (~$5):** console → Billing → Budgets & alerts → Create budget. Email-only tripwire; `max-instances=1` already caps compute physically.
- [ ] **Anthropic hard spend cap (~$10/mo):** console.anthropic.com → Settings → Limits. The one cap that truly matters — LLM API is the only real runaway risk (spec §16.4).

## Housekeeping
- [x] Hunter failure notifications (2026-08-06): Cloud Monitoring alert → email on failed job executions; plus in-code self-report — hunter DMs Anton (never the group) on fatal errors. Sentry evaluated, skipped: error volume too small to gain from it; revisit if multi-agent steps make failures subtle.
- [ ] Destroy webhook-secret v1 (the newline-bugged dead version): `gcloud secrets versions destroy 1 --secret=telegram-webhook-secret`. Frees a Secret Manager free-tier version slot (we're at 6/6).
- [ ] **Hourly DB backups to GCS (designed 2026-08-08, not built):** Neon free tier = 6h point-in-time restore only, no external backups. Design: after each hunt, the hunter dumps all tables (plain SELECTs → gzipped JSON, no pg_dump) to a GCS bucket in us-west1 — inside GCS's always-free 5GB, so $0 forever (DB <1MB). Rotation via bucket lifecycle rule (30d auto-delete, enforced by Google, no code). Security: hunter's SA gets object-CREATE only, never delete — a poisoned agent can add snapshots but not destroy them. ~30 lines in hunter.js + `gsutil mb` + lifecycle rule in setup.sh.
- [x] Delete the `hello` crash-course service (2026-08-06)

## Build sequence (spec §9, cloud-first per §16)
- [x] 1. Delivery rail — dummy bot live end to end (2026-08-06)
- [x] 2a. Raw hunter: Cloud Run Job `fighterbot-hunter`, Google News RSS per fighter (Latin + Cyrillic aliases), posts raw to group, manual trigger (2026-08-06)
- [x] 2b. Hunter memory + schedule: Neon Postgres + pgvector, URL dedup, hourly Cloud Scheduler cron (2026-08-06). Supabase → Neon (spec amendment: free-tier fit, auto-resume).
- [x] 2c. Semantic dedup live (2026-08-06): gemini-api-key mounted, 9 rows backfilled, threshold tuned 0.85→0.80 on measured data (translated pair 0.841, unrelated ≤0.702). First production catch: re-issued URL held at 0.98 similarity. Revisit threshold if false holds appear.
- [x] 2d. Gray-zone dedup — ABSORBED by step 5 matcher (MATCH-as-echo verdict IS the dedup decision); never built standalone.
- [x] 2f. RSS retry with backoff (2026-08-08): one retry per feed after 30s on non-OK response. Escalation path if 503s persist: jittered delay, then alternate discovery source (2e direct feeds).
- [ ] 3. Fighter filter (watchlist) — evidence 2026-08-08: namesakes are real (iRacing "Fighter B", brother Fighter C's brother, keyword-stuffed junk). Identity check absorbed into the claims matcher contract (WRONG_SUBJECT verdict, see docs/architecture-overview.html §5); watchlist-as-data remains here.
- [ ] 4. Relevance agent (importance scoring vs. threshold) — NOTE 2026-08-08: Mastra does NOT come in here or at step 5 (single structured calls don't need an agent framework); Mastra + TypeScript enter at step 6 (conversational responder = real agent shape). Step 4's classifier is absorbed by the step-5 matcher (claim type = classification).
  - **Alternative shape (2026-08-06, preferred so far):** classifier, not filter. Real feed volume is pleasant — nothing gets dropped; instead classify each item (fight announcement / result / interview / ...) and tier the *presentation*: announcements get their own ceremonial post (🚨🥊, bold card), possibly pinned (bot needs group admin) and loud, while digests deliver silently. First LLM call inside the hunter pipeline. "Where to watch" enrichment (Ukraine broadcast rights) joins later when web-search tools arrive (step 6) and appends into the announcement post.
- [x] 5. **Phase 1 LIVE (2026-08-08)**: claims + claim_sources tables; Haiku matcher (MATCH/NEW/NO_CLAIM/WRONG_SUBJECT/UNSURE, forced tool use); conservative lifecycle (confirm ONLY via ufc.com; no independence counting until 2e); posts: 🚨 ceremonies, 🕵️ rumor lines, ✅ threaded confirmations; bootstrap over archive done (7 claims, 23 links; Masvidal ×5, Fighter A ×5 clusters correct). Watch items: WRONG_SUBJECT is headline-limited (drops division news that doesn't name the fighter — 2e bodies fix); minor canonical hallucinations (Khabib/Islam flub) — Sonnet escalation if pattern.
  - [x] Verdict validation (2026-08-08): `normalizeVerdict` in lib/matcher.js gates every matcher answer — off-enum type → `other`, off-enum sourcing → `reported` (junk can never born-confirm), MATCH on a claim id that was never offered → UNSURE (also closes an FK-error path that would have killed the rest of that fighter's hunt). Ids compare as strings: pg returns bigints as `"7"`, the model answers `7`.
  - [x] Official sources bypass the dup gate (2026-08-08): Gate 2 ran before `isOfficialSource`, so an official confirmation — by construction a near-restatement of the rumor — was held as an echo and never reached `confirmClaim`. Audit says the bug never fired in production (0 official items ever held), so the fix is preventive; the Fighter A trap is now actually armed.
  - [x] Claim-drift guard on dup inheritance (2026-08-08): inheritance is transitive, so a 0.802 → 0.869 → 0.974 chain of held dups walked an Ali-Abdelaziz story onto an unrelated matchmaking claim (claim 4, 7 sources of which 3 were foreign). Held dups are now compared to the claim's own canonical text before linking; if another claim fits ≥ 0.10 better the item stays held but unlinked. Threshold measured over all 28 live links (drifted 0.107–0.214 vs correct-but-awkward 0.076–0.082). Matcher links untouched.
  - Open: `prediction` is the type the model keeps reaching for (claim 5) and the enum lacks it. Coerced to `other` for now; if the coercion warning recurs, add `prediction` to the enum + digest routing and amend docs §5.
- [ ] 5-phase-2 (needs 2e bodies): independence-based corroboration, official denials → denied, supersede flow, edit-vs-reply for corroboration display
  - Observed 2026-08-06: headline embeddings miss same-story-different-angle pairs (~0.70 sim, e.g. two articles on the same Masvidal quote). True fix is claim extraction: canonical claim + source list ordered by published_at (earliest ≈ original; translations/echoes append quietly as "also covered by").
- [ ] 6. Conversational follow-ups with memory + web search

## Deploy automation
- [ ] GitHub remote + Actions workflow: push to main → deploy to Cloud Run (spec §16.1). Retires manual `gcloud run deploy`.
- [ ] **Sandboxed autonomy (parked 2026-08-08, Anton sitting on it):** move the self-improvement routine into an ephemeral sandbox (GitHub Actions cron preferred) with scoped credentials so even a fully poisoned run is harmless. Full spec: docs/sandboxed-autonomy.md. Until then: local scheduled task + manual approvals.

## Open questions (spec §17)
- [ ] LLM model final choice (dummy uses Haiku 4.5)
- [ ] Source list per fighter (Fighter A/Fighter B coverage may be sparse; Google News RSS is source #1 as of 2a)
- [ ] Cron frequency — hourly chosen and running (2b); revisit only if limits or noise say otherwise
- [ ] Alias lists per fighter — first draft live in hunter.js (Latin + uk-Cyrillic); expand if coverage gaps show (e.g. ru-Cyrillic spellings)
- [ ] Bot output language (spec §17.5) — precedent set 2026-08-07: uk/en headlines post as-is; other languages translate to **English**, labeled "(translated from xx)", via Gemini free tier. Still open: language of the bot's own voice (announcements, replies).
