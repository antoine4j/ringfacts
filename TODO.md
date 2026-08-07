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
- [ ] 2d. **NEXT: gray-zone dedup tiebreaker** — when nearest-neighbor similarity lands in the ambiguous band (~0.65–0.80), ask Haiku "same underlying story?" before posting. Catches retellings (e.g. heavy.com re-reporting MMA Junkie's Masvidal quote at 0.70 sim) that embeddings can't link and thresholds can't reach. Fires on a few items/day → cost ≈ pennies/month. First LLM call inside the hunter pipeline. Fail-open: judge error → post as normal.
- [ ] 3. Fighter filter (watchlist)
- [ ] 4. Relevance agent (importance scoring vs. threshold) — Mastra comes in here
  - **Alternative shape (2026-08-06, preferred so far):** classifier, not filter. Real feed volume is pleasant — nothing gets dropped; instead classify each item (fight announcement / result / interview / ...) and tier the *presentation*: announcements get their own ceremonial post (🚨🥊, bold card), possibly pinned (bot needs group admin) and loud, while digests deliver silently. First LLM call inside the hunter pipeline. "Where to watch" enrichment (Ukraine broadcast rights) joins later when web-search tools arrive (step 6) and appends into the announcement post.
- [ ] 5. Rumor/confirmed layer + claim lifecycle
  - Observed 2026-08-06: headline embeddings miss same-story-different-angle pairs (~0.70 sim, e.g. two articles on the same Masvidal quote). True fix is claim extraction: canonical claim + source list ordered by published_at (earliest ≈ original; translations/echoes append quietly as "also covered by").
- [ ] 6. Conversational follow-ups with memory + web search

## Deploy automation
- [ ] GitHub remote + Actions workflow: push to main → deploy to Cloud Run (spec §16.1). Retires manual `gcloud run deploy`.

## Open questions (spec §17)
- [ ] LLM model final choice (dummy uses Haiku 4.5)
- [ ] Source list per fighter (Fighter A/Fighter B coverage may be sparse; Google News RSS is source #1 as of 2a)
- [ ] Cron frequency — hourly chosen and running (2b); revisit only if limits or noise say otherwise
- [ ] Alias lists per fighter — first draft live in hunter.js (Latin + uk-Cyrillic); expand if coverage gaps show (e.g. ru-Cyrillic spellings)
- [ ] Bot output language (spec §17.5) — config line now, thanks to canonical-English storage design
