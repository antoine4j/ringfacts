-- FighterBot schema (slice 2b). Applied by migrate.js; safe to re-run.

-- pgvector: adds the `vector` column type + nearest-neighbor operators.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS items (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url           text NOT NULL UNIQUE,        -- exact-dup lock
  subject       text NOT NULL,
  title         text NOT NULL,
  source        text NOT NULL DEFAULT '',
  published_at  timestamptz NOT NULL,
  seen_at       timestamptz NOT NULL DEFAULT now(),
  posted        boolean NOT NULL,            -- false = held back as semantic dup
  -- Embeddings are model-locked (vectors from different models are not
  -- comparable), so the model name is stored next to its vectors.
  embedding     vector(768),                 -- null if embedding API failed
  embedding_model text
);

-- Speeds up "recent rows for this subject" semantic-dup lookups.
CREATE INDEX IF NOT EXISTS items_subject_seen_idx ON items (subject, seen_at);

-- Decision-audit + capture columns (added 2026-08-06, "collect data first").
-- nearest_* are recorded for EVERY item, posted or held — the similarity
-- distribution is what tunes dedup thresholds later.
ALTER TABLE items ADD COLUMN IF NOT EXISTS nearest_similarity real;
ALTER TABLE items ADD COLUMN IF NOT EXISTS nearest_item bigint REFERENCES items(id);
ALTER TABLE items ADD COLUMN IF NOT EXISTS held_reason text;      -- 'embedding' | 'llm' (2d)
ALTER TABLE items ADD COLUMN IF NOT EXISTS found_via text;        -- which query alias caught it
ALTER TABLE items ADD COLUMN IF NOT EXISTS rss_description text;  -- raw RSS <description>, mined later

-- 2e (2026-08-08): article bodies. `url` stays the identity (whatever the
-- discovery source handed us); resolved_url is the real article address when
-- we managed to unwrap Google's redirect (or same as url for direct-feed
-- items). body is extracted text, capped — null means headline-only, which
-- every consumer must tolerate.
ALTER TABLE items ADD COLUMN IF NOT EXISTS resolved_url text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS body_fetched_at timestamptz;
-- Which extraction rung produced `body` (or which failure stopped it) —
-- 'feed-content' | 'json-ld' | 'article-tag' | 'paragraphs' | 'og-description'
-- | 'no-extract' | 'decode-failed' | 'no-url' | 'not-html' | 'timeout' |
-- 'http-<status>' | 'error-<name>'. Without this an outlet can "succeed" with
-- a useless blurb (Sherdog: 4/4 og-description, ~100 chars) and look fine in
-- aggregate. null = pre-migration row, never means success.
ALTER TABLE items ADD COLUMN IF NOT EXISTS body_via text;
CREATE INDEX IF NOT EXISTS items_resolved_url_idx ON items (resolved_url);

-- Digest tier (2026-08-09, lib/tier.js): 'main' | 'tangential'. Set ONLY on
-- items that reached the posted path — never on held dups, WRONG_SUBJECT, or
-- MATCH-as-echo, so this column means "how the digest showed this item", not
-- "was this item judged relevant". Deliberately NOT held_reason, which must
-- keep meaning "why the group never saw this" (bootstrap-claims.js and
-- audit-swallowed-confirmations.js both read it that way).
ALTER TABLE items ADD COLUMN IF NOT EXISTS digest_tier text;

-- ============================================================================
-- Claims layer (step 5, phase 1 — docs/claims-architecture.html).
-- Articles (items) are immutable evidence; claims are living facts.

CREATE TABLE IF NOT EXISTS claims (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject        text NOT NULL,
  type           text NOT NULL,      -- announcement|result|injury|quote|prediction|negotiation|lifestyle|other
  canonical_text text NOT NULL,      -- one English sentence, quote-anchored
  facts          jsonb NOT NULL DEFAULT '{}',
  status         text NOT NULL,      -- rumor|confirmed|denied|stale|superseded
  embedding      vector(768),
  embedding_model text,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  confirmed_at   timestamptz,
  tg_message_id  bigint,             -- lets confirmations reply to the rumor post
  supersedes     bigint REFERENCES claims(id)
);

-- Join table: each row IS a relationship — "this article is evidence for
-- this claim, in this role". One claim <-> many articles and vice versa.
CREATE TABLE IF NOT EXISTS claim_sources (
  item_id   bigint NOT NULL REFERENCES items(id),
  claim_id  bigint NOT NULL REFERENCES claims(id),
  role      text NOT NULL,           -- origin|echo|corroboration|official
  stance    text NOT NULL DEFAULT 'asserts',
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, claim_id)
);

CREATE INDEX IF NOT EXISTS claims_subject_status_idx ON claims (subject, status);
