CREATE TABLE IF NOT EXISTS auth_users (
  user_id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  owner_participant_id text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_token_active_idx
  ON auth_sessions (token_hash, expires_at)
  WHERE revoked = false;
