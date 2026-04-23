CREATE TABLE IF NOT EXISTS completed_command_idempotency_records (
  idempotency_key text PRIMARY KEY,
  category text NOT NULL,
  command_type text NOT NULL,
  command_id text NOT NULL,
  actor_participant_id text NOT NULL,
  session_id text,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
