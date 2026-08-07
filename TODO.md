# FighterBot — Next Steps

## Safety / housekeeping
- [ ] **GCP budget alert (~$5):** console → Billing → Budgets & alerts → Create budget. Email-only tripwire; `max-instances=1` already caps compute physically. (Anton, console)
- [ ] **Anthropic hard spend cap (~$10/mo):** console.anthropic.com → Settings → Limits. The one cap that truly matters — LLM API is the only real runaway risk (spec §16.4). (Anton, console)
- [x] Delete the `hello` crash-course service (2026-08-06)
- [ ] Decide bot output language (spec §17.5) — config line now, thanks to canonical-English storage design

## Build sequence (spec §9, cloud-first per §16)
- [x] 1. Delivery rail — dummy bot live end to end (2026-08-06)
- [x] 2a. Raw hunter: Cloud Run Job `fighterbot-hunter`, Google News RSS per fighter (Latin + Cyrillic aliases), posts raw to group, manual trigger (2026-08-06)
- [ ] 2b. Hunter memory + schedule: Supabase (Postgres + pgvector) for dedup, Cloud Scheduler hourly cron. Until then every run re-posts the same items.
- [ ] 3. Fighter filter (watchlist)
- [ ] 4. Relevance agent (importance scoring vs. threshold) — Mastra comes in here
- [ ] 5. Rumor/confirmed layer + claim lifecycle
- [ ] 6. Conversational follow-ups with memory + web search

## Deploy automation
- [ ] GitHub remote + Actions workflow: push to main → deploy to Cloud Run (spec §16.1). Retires manual `gcloud run deploy`.

## Open questions (spec §17)
- [ ] LLM model final choice (dummy uses Haiku 4.5)
- [ ] Source list per fighter (Fighter A/Fighter B coverage may be sparse)
- [ ] Cron frequency (hourly = reference point)
- [ ] Alias lists per fighter (cross-script: Cyrillic/Latin)
