-- FighterBot schema (slice 2b). Applied by migrate.js; safe to re-run.

-- pgvector: adds the `vector` column type + nearest-neighbor operators.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS items (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url           text NOT NULL UNIQUE,        -- exact-dup lock
  fighter       text NOT NULL,
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

-- Speeds up "recent rows for this fighter" semantic-dup lookups.
CREATE INDEX IF NOT EXISTS items_fighter_seen_idx ON items (fighter, seen_at);

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
CREATE INDEX IF NOT EXISTS items_resolved_url_idx ON items (resolved_url);

-- ============================================================================
-- Claims layer (step 5, phase 1 — docs/claims-architecture.html).
-- Articles (items) are immutable evidence; claims are living facts.

CREATE TABLE IF NOT EXISTS claims (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fighter        text NOT NULL,
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

CREATE INDEX IF NOT EXISTS claims_fighter_status_idx ON claims (fighter, status);
