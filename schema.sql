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
