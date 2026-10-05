-- v0's tables, the trigger that keeps answers from being overwritten, and the
-- two views the storyboard reads. Applied twice by pipeline/store/migrate.ts:
-- once into the `public` schema (live data) and once into `replay` (the golden
-- replay), so nothing here names a schema. Who may do what: grants.sql.
-- Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 3.

-- One row per web page, as production stored it in its items table.
CREATE TABLE IF NOT EXISTS articles (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  production_item_id  bigint NOT NULL UNIQUE,
  url                 text NOT NULL,
  outlet              text NOT NULL DEFAULT '',
  headline            text NOT NULL,
  published_at        timestamptz NOT NULL,
  body                text,
  body_via            text,
  production_subject  text NOT NULL,
  production_outcome  text,
  backfill            boolean NOT NULL DEFAULT false,
  imported_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS articles_published_idx ON articles (published_at);

-- The watched fighters; each run adds any name in watchlist.js that is missing.
CREATE TABLE IF NOT EXISTS fighters (
  name      text PRIMARY KEY,
  added_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per article and fighter: the stations read the article for him.
CREATE TABLE IF NOT EXISTS readings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id  bigint NOT NULL REFERENCES articles(id),
  fighter     text NOT NULL REFERENCES fighters(name),
  found_by    text NOT NULL CHECK (found_by IN ('production', 'name_in_text')),
  stage       text NOT NULL CHECK (stage IN ('no_body', 'classify', 'extract', 'group', 'decide', 'done', 'stuck')),
  stuck_from  text,
  attempts    int NOT NULL DEFAULT 0,
  last_error  text,
  posted_at   timestamptz,
  message_id  bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, fighter)
);
CREATE INDEX IF NOT EXISTS readings_stage_idx ON readings (stage, fighter);

-- Classifier (4): the nine answers with the tie rules applied, and JEV's whole reply.
CREATE TABLE IF NOT EXISTS classifications (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reading_id  bigint NOT NULL REFERENCES readings(id),
  version     text NOT NULL,
  answers     jsonb NOT NULL,
  raw         jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classifications_reading_idx ON classifications (reading_id, id);
CREATE INDEX IF NOT EXISTS classifications_answers_idx ON classifications USING gin (answers);

-- Claim extractor (5): kind, the one-sentence claim and its details, and the model's whole reply.
CREATE TABLE IF NOT EXISTS extracts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reading_id  bigint NOT NULL REFERENCES readings(id),
  version     text NOT NULL,
  answers     jsonb NOT NULL,
  raw         jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extracts_reading_idx ON extracts (reading_id, id);

-- A group of readings about one occasion; labelled by its first reading's extract.
CREATE TABLE IF NOT EXISTS claims (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fighter            text NOT NULL REFERENCES fighters(name),
  grouping_version   text NOT NULL,
  label              text NOT NULL,
  first_reading_id   bigint NOT NULL REFERENCES readings(id),
  posted_reading_id  bigint UNIQUE REFERENCES readings(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claims_fighter_idx ON claims (fighter, grouping_version);

-- Semantic dedup (6): the vector, the shortlist JEV was shown, its pick, and the claim joined or started.
CREATE TABLE IF NOT EXISTS groupings (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reading_id  bigint NOT NULL REFERENCES readings(id),
  extract_id  bigint NOT NULL REFERENCES extracts(id),
  version     text NOT NULL,
  embedding   vector(768) NOT NULL,
  shortlist   jsonb NOT NULL,
  pick        jsonb NOT NULL,
  claim_id    bigint NOT NULL REFERENCES claims(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS groupings_reading_idx ON groupings (reading_id, id);
CREATE INDEX IF NOT EXISTS groupings_claim_idx ON groupings (claim_id);

-- Every version of the tier mapping and the digest schedule; a change is a new row.
CREATE TABLE IF NOT EXISTS settings (
  version             int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author              text NOT NULL,
  note                text NOT NULL DEFAULT '',
  classifier_version  text NOT NULL,
  tiers               jsonb NOT NULL,
  digest_schedule     jsonb NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Decider (7): the tier, the settings cell that gave it, and the settings version.
CREATE TABLE IF NOT EXISTS decisions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reading_id         bigint NOT NULL REFERENCES readings(id),
  classification_id  bigint NOT NULL REFERENCES classifications(id),
  settings_version   int NOT NULL REFERENCES settings(version),
  tier               smallint NOT NULL CHECK (tier IN (1, 2, 3)),
  cell               text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_reading_idx ON decisions (reading_id, id);

-- Digest writer (8): every digest, and every claim it was given, used or left out.
CREATE TABLE IF NOT EXISTS digests (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fighter         text NOT NULL REFERENCES fighters(name),
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  text            text NOT NULL,
  items           jsonb NOT NULL,
  raw             jsonb NOT NULL,
  posted_at       timestamptz,
  message_id      bigint,
  backfill        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS digests_fighter_idx ON digests (fighter, period_end);

CREATE TABLE IF NOT EXISTS digest_claims (
  digest_id  bigint NOT NULL REFERENCES digests(id),
  claim_id   bigint NOT NULL REFERENCES claims(id),
  used       boolean NOT NULL,
  PRIMARY KEY (digest_id, claim_id)
);

-- Anton's notes: a correction when should_be is filled, a comment when not; exactly one target.
CREATE TABLE IF NOT EXISTS feedback (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reading_id  bigint REFERENCES readings(id),
  claim_id    bigint REFERENCES claims(id),
  digest_id   bigint REFERENCES digests(id),
  field       text NOT NULL,
  should_be   text,
  note        text NOT NULL DEFAULT '',
  author      text NOT NULL DEFAULT 'anton',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(reading_id, claim_id, digest_id) = 1)
);

-- One row per run of the job: its kind, how long it took, and its numbers.
CREATE TABLE IF NOT EXISTS runs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('hourly', 'archive', 'replay', 'local')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  seconds      real,
  counts       jsonb NOT NULL DEFAULT '{}'
);

-- The daily counts message, once a day.
CREATE TABLE IF NOT EXISTS daily_reports (
  day         date PRIMARY KEY,
  text        text NOT NULL,
  posted_at   timestamptz,
  message_id  bigint,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 👍 and 👎 on v0's posts, as Telegram reported them (section 10).
CREATE TABLE IF NOT EXISTS reactions (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  update_id    bigint NOT NULL UNIQUE,
  message_id   bigint NOT NULL,
  emoji        text,
  old_emoji    text,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- Answers are never overwritten: an UPDATE on an answer table is refused.
CREATE OR REPLACE FUNCTION refuse_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are never changed; write a new row instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  answer_table text;
BEGIN
  FOREACH answer_table IN ARRAY ARRAY['articles', 'classifications', 'extracts', 'groupings', 'decisions', 'settings', 'digest_claims', 'feedback', 'reactions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_never_updated ON %I', answer_table, answer_table);
    EXECUTE format('CREATE TRIGGER %I_never_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION refuse_update()', answer_table, answer_table);
  END LOOP;
END $$;

-- A claim's posted reading is set once; nothing else about a claim changes.
CREATE OR REPLACE FUNCTION claim_posted_once() RETURNS trigger AS $$
BEGIN
  IF OLD.posted_reading_id IS NOT NULL THEN
    RAISE EXCEPTION 'claim % was already posted', OLD.id;
  END IF;
  IF (NEW.fighter, NEW.grouping_version, NEW.label, NEW.first_reading_id)
     IS DISTINCT FROM (OLD.fighter, OLD.grouping_version, OLD.label, OLD.first_reading_id) THEN
    RAISE EXCEPTION 'only a claim''s posted reading can be set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS claims_posted_once ON claims;
CREATE TRIGGER claims_posted_once BEFORE UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION claim_posted_once();

-- How firm a reading is, as a number to rank claims' readings by (D27).
CREATE OR REPLACE FUNCTION firmness_rank(answers jsonb) RETURNS int AS $$
  SELECT CASE answers->>'firmness'
    WHEN 'official_or_done' THEN 4
    WHEN 'reported' THEN 3
    WHEN 'rumour' THEN 2
    WHEN 'wish' THEN 1
    ELSE 0
  END
$$ LANGUAGE sql IMMUTABLE;

-- Each reading with its latest answer from every station, as one flat row.
CREATE OR REPLACE VIEW reading_now AS
SELECT
  r.id AS reading_id, r.fighter, r.found_by, r.stage, r.stuck_from, r.attempts, r.last_error,
  r.posted_at, r.message_id,
  a.id AS article_id, a.production_item_id, a.url, a.outlet, a.headline, a.published_at,
  a.body IS NOT NULL AS has_body, a.body_via, a.production_subject, a.production_outcome, a.backfill,
  c.id AS classification_id, c.version AS classifier_version, c.answers AS classification,
  e.id AS extract_id, e.version AS extractor_version, e.answers AS extract,
  g.id AS grouping_id, g.version AS grouping_version, g.shortlist, g.pick, g.claim_id,
  d.id AS decision_id, d.tier, d.cell, d.settings_version
FROM readings r
JOIN articles a ON a.id = r.article_id
LEFT JOIN LATERAL (SELECT * FROM classifications WHERE reading_id = r.id ORDER BY id DESC LIMIT 1) c ON true
LEFT JOIN LATERAL (SELECT * FROM extracts WHERE reading_id = r.id ORDER BY id DESC LIMIT 1) e ON true
LEFT JOIN LATERAL (SELECT * FROM groupings WHERE reading_id = r.id ORDER BY id DESC LIMIT 1) g ON true
LEFT JOIN LATERAL (SELECT * FROM decisions WHERE reading_id = r.id ORDER BY id DESC LIMIT 1) d ON true;

-- Each claim with its current label: the extract of its firmest reading, the earliest on a tie (D27, D31).
CREATE OR REPLACE VIEW claim_now AS
SELECT
  cl.*,
  coalesce(firmest.claim_sentence, cl.label) AS current_label,
  firmest.reading_id AS current_label_reading_id,
  members.readings, members.outlets, members.first_published, members.last_published
FROM claims cl
LEFT JOIN LATERAL (
  SELECT g.reading_id, e.answers->>'claim' AS claim_sentence
  FROM groupings g
  JOIN extracts e ON e.id = g.extract_id
  JOIN readings r ON r.id = g.reading_id
  JOIN articles a ON a.id = r.article_id
  LEFT JOIN LATERAL (SELECT answers FROM classifications WHERE reading_id = g.reading_id ORDER BY id DESC LIMIT 1) c ON true
  WHERE g.claim_id = cl.id AND e.answers->>'claim' IS NOT NULL AND e.answers->>'claim' <> 'NO CLAIM'
  ORDER BY firmness_rank(c.answers) DESC, a.published_at, g.reading_id
  LIMIT 1
) firmest ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS readings, count(DISTINCT a.outlet) AS outlets,
         min(a.published_at) AS first_published, max(a.published_at) AS last_published
  FROM groupings g
  JOIN readings r ON r.id = g.reading_id
  JOIN articles a ON a.id = r.article_id
  WHERE g.claim_id = cl.id
) members ON true;
