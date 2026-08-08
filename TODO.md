# FighterBot — Next Steps

## Safety (Anton, console)
- [ ] **GCP budget alert (~$5):** console → Billing → Budgets & alerts → Create budget. Email-only tripwire; `max-instances=1` already caps compute physically.
- [ ] **Anthropic hard spend cap (~$10/mo):** console.anthropic.com → Settings → Limits. The one cap that truly matters — LLM API is the only real runaway risk (spec §16.4).

## Housekeeping
- [x] Hunter failure notifications (2026-08-06): Cloud Monitoring alert → email on failed job executions; plus in-code self-report — hunter DMs Anton (never the group) on fatal errors. Sentry evaluated, skipped: error volume too small to gain from it; revisit if multi-agent steps make failures subtle.
- [ ] Destroy webhook-secret v1 (the newline-bugged dead version): `gcloud secrets versions destroy 1 --secret=telegram-webhook-secret`. Frees a Secret Manager free-tier version slot (we're at 6/6).
- [x] Delete the `hello` crash-course service (2026-08-06)

## Build sequence (spec §9, cloud-first per §16)
- [x] 1. Delivery rail — dummy bot live end to end (2026-08-06)
- [x] 2a. Raw hunter: Cloud Run Job `fighterbot-hunter`, Google News RSS per fighter (Latin + Cyrillic aliases), posts raw to group, manual trigger (2026-08-06)
- [x] 2b. Hunter memory + schedule: Neon Postgres + pgvector, URL dedup, hourly Cloud Scheduler cron (2026-08-06). Supabase → Neon (spec amendment: free-tier fit, auto-resume).
- [x] 2c. Semantic dedup live (2026-08-06): gemini-api-key mounted, 9 rows backfilled, threshold tuned 0.85→0.80 on measured data (translated pair 0.841, unrelated ≤0.702). First production catch: re-issued URL held at 0.98 similarity. Revisit threshold if false holds appear.
- [x] 2d. Gray-zone dedup — ABSORBED by step 5 matcher (MATCH-as-echo verdict IS the dedup decision); never built standalone.
- [x] 2f. RSS retry with backoff (2026-08-08): one retry per feed after 30s on non-OK response. Escalation path if 503s persist: jittered delay, then alternate discovery source (2e direct feeds).
- [ ] 3. Fighter filter (watchlist) — evidence 2026-08-08: namesakes are real (iRacing "Fighter B", brother Fighter C's brother, keyword-stuffed junk). Identity check absorbed into the claims matcher contract (WRONG_SUBJECT verdict, see docs/claims-architecture.html §5); watchlist-as-data remains here.
- [ ] 4. Relevance agent (importance scoring vs. threshold) — NOTE 2026-08-08: Mastra does NOT come in here or at step 5 (single structured calls don't need an agent framework); Mastra + TypeScript enter at step 6 (conversational responder = real agent shape). Step 4's classifier is absorbed by the step-5 matcher (claim type = classification).
  - **Alternative shape (2026-08-06, preferred so far):** classifier, not filter. Real feed volume is pleasant — nothing gets dropped; instead classify each item (fight announcement / result / interview / ...) and tier the *presentation*: announcements get their own ceremonial post (🚨🥊, bold card), possibly pinned (bot needs group admin) and loud, while digests deliver silently. First LLM call inside the hunter pipeline. "Where to watch" enrichment (Ukraine broadcast rights) joins later when web-search tools arrive (step 6) and appends into the announcement post.
- [x] 5. **Phase 1 LIVE (2026-08-08)**: claims + claim_sources tables; Haiku matcher (MATCH/NEW/NO_CLAIM/WRONG_SUBJECT/UNSURE, forced tool use); conservative lifecycle (confirm ONLY via ufc.com; no independence counting until 2e); posts: 🚨 ceremonies, 🕵️ rumor lines, ✅ threaded confirmations; bootstrap over archive done (7 claims, 23 links; Masvidal ×5, Fighter A ×5 clusters correct). Watch items: WRONG_SUBJECT is headline-limited (drops division news that doesn't name the fighter — 2e bodies fix); occasional type-enum drift ('prediction') — add code validation; minor canonical hallucinations (Khabib/Islam flub) — Sonnet escalation if pattern.
- [ ] 5-phase-2 (needs 2e bodies): independence-based corroboration, official denials → denied, supersede flow, edit-vs-reply for corroboration display
  - Observed 2026-08-06: headline embeddings miss same-story-different-angle pairs (~0.70 sim, e.g. two articles on the same Masvidal quote). True fix is claim extraction: canonical claim + source list ordered by published_at (earliest ≈ original; translations/echoes append quietly as "also covered by").
- [ ] 6. Conversational follow-ups with memory + web search

## Deploy automation
- [ ] GitHub remote + Actions workflow: push to main → deploy to Cloud Run (spec §16.1). Retires manual `gcloud run deploy`.

## Open questions (spec §17)
- [ ] LLM model final choice (dummy uses Haiku 4.5)
- [ ] Source list per fighter (Fighter A/Fighter B coverage may be sparse; Google News RSS is source #1 as of 2a)
- [ ] Cron frequency — hourly chosen and running (2b); revisit only if limits or noise say otherwise
- [ ] Alias lists per fighter — first draft live in hunter.js (Latin + uk-Cyrillic); expand if coverage gaps show (e.g. ru-Cyrillic spellings)
- [ ] Bot output language (spec §17.5) — precedent set 2026-08-07: uk/en headlines post as-is; other languages translate to **English**, labeled "(translated from xx)", via Gemini free tier. Still open: language of the bot's own voice (announcements, replies).
