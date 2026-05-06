CREATE TABLE IF NOT EXISTS command_idempotency_claim_records (
  idempotency_key text PRIMARY KEY,
  category text NOT NULL,
  command_type text NOT NULL,
  command_id text NOT NULL,
  actor_participant_id text NOT NULL,
  session_id text,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
