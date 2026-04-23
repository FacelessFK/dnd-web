CREATE TABLE IF NOT EXISTS active_encounter_records (
  encounter_id text PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  scene_id text NOT NULL,
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
