CREATE TABLE IF NOT EXISTS scene_records (
  scene_id text PRIMARY KEY,
  session_id text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
