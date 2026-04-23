CREATE TABLE IF NOT EXISTS session_snapshots (
  session_id text PRIMARY KEY,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
