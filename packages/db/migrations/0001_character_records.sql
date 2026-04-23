CREATE TABLE IF NOT EXISTS character_records (
  character_id text PRIMARY KEY,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
