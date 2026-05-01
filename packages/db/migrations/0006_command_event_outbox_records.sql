CREATE TABLE IF NOT EXISTS command_event_outbox_records (
  outbox_id text PRIMARY KEY,
  idempotency_key text NOT NULL,
  session_id text NOT NULL,
  event_type text NOT NULL,
  event_order integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS command_event_outbox_records_idempotency_key_event_order_idx
  ON command_event_outbox_records (idempotency_key, event_order);
