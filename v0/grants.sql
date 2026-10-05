-- Who may do what in the v0 database, for both the live schema and the replay
-- schema. No role is ever granted DELETE: nothing in v0 is deleted.
-- The roles themselves are made by pipeline/store/roles.ts, since they need
-- passwords; v0_feed lives in production's database and is granted there.
-- Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 3, "Roles".

GRANT CONNECT ON DATABASE v0 TO v0_pipeline, v0_editor;
GRANT USAGE ON SCHEMA public, replay TO v0_pipeline, v0_editor;

-- Both roles read everything.
GRANT SELECT ON ALL TABLES IN SCHEMA public, replay TO v0_pipeline, v0_editor;

-- The job adds rows to the pipeline's tables.
GRANT INSERT ON
  public.articles, public.fighters, public.readings, public.classifications, public.extracts,
  public.groupings, public.claims, public.decisions, public.digests, public.digest_claims,
  public.runs, public.daily_reports, public.reactions,
  replay.articles, replay.fighters, replay.readings, replay.classifications, replay.extracts,
  replay.groupings, replay.claims, replay.decisions, replay.digests, replay.digest_claims,
  replay.runs, replay.daily_reports, replay.reactions
TO v0_pipeline;

-- The job moves a reading along, sets a claim's posted reading once, and marks what it sent.
GRANT UPDATE (stage, stuck_from, attempts, last_error, posted_at, message_id, updated_at) ON public.readings, replay.readings TO v0_pipeline;
GRANT UPDATE (posted_reading_id) ON public.claims, replay.claims TO v0_pipeline;
GRANT UPDATE (posted_at, message_id) ON public.digests, replay.digests TO v0_pipeline;
GRANT UPDATE (posted_at, message_id) ON public.daily_reports, replay.daily_reports TO v0_pipeline;
GRANT UPDATE (finished_at, seconds, counts) ON public.runs, replay.runs TO v0_pipeline;

-- The replay starts from its own first settings, like the live schema.
GRANT INSERT ON replay.settings TO v0_pipeline;

-- The storyboard, and Claude, add feedback, new settings, and grouping reviews (live only:
-- the golden replay's rulings are the golden set's).
GRANT INSERT ON public.feedback, public.settings, replay.feedback, public.review_readings, public.review_same_claims TO v0_editor;
