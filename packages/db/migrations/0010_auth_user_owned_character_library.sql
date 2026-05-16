ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

UPDATE auth_sessions
SET revoked_at = updated_at
WHERE revoked = true
  AND revoked_at IS NULL;

ALTER TABLE character_library_entries
  ADD COLUMN IF NOT EXISTS owner_user_id text;

UPDATE character_library_entries
SET owner_user_id = auth_users.user_id
FROM auth_users
WHERE character_library_entries.owner_user_id IS NULL
  AND character_library_entries.owner_participant_id = auth_users.owner_participant_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'character_library_entries_owner_user_id_auth_users_user_id_fk'
  ) THEN
    ALTER TABLE character_library_entries
      ADD CONSTRAINT character_library_entries_owner_user_id_auth_users_user_id_fk
      FOREIGN KEY (owner_user_id)
      REFERENCES auth_users(user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS character_library_entries_owner_user_updated_idx
  ON character_library_entries (owner_user_id, updated_at DESC)
  WHERE owner_user_id IS NOT NULL;
