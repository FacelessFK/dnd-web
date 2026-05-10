CREATE TABLE IF NOT EXISTS character_library_entries (
  entry_id text PRIMARY KEY,
  owner_participant_id text NOT NULL,
  entry jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_library_entries_owner_updated_idx
  ON character_library_entries (owner_participant_id, updated_at DESC);
