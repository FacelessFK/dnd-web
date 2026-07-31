-- M1 durability: who owns which seat, and what the table remembers.
--
-- Seat ownership is the durable half of participant identity. The credential a
-- client presents stays ephemeral and per-process - it is never stored here in
-- any form - so a restart forces a re-issue without costing a player their
-- chair. The binding below is what lets the server tell "the account that was
-- sitting here" from "someone who read a participant ID out of a broadcast
-- snapshot".
--
-- The table state is modelled relationally rather than as one JSON document per
-- session, because the reads it has to serve are relational: pending requests
-- for one seat, an ordered audit slice, one intent by ID. The canonical
-- protocol object still lives in a jsonb column - that object is the unit the
-- server and the browser agree on, and splitting it into columns would create a
-- second place for the schema to drift from `packages/protocol`.
--
-- `session_id` carries no foreign key, matching `scene_records` and
-- `active_encounter_records`. Session snapshots are written by their own
-- transaction boundary, and a constraint here would impose an ordering the rest
-- of the schema does not have.

CREATE TABLE IF NOT EXISTS session_seat_ownership (
  session_id text NOT NULL,
  participant_id text NOT NULL,
  user_id text NOT NULL REFERENCES auth_users(user_id) ON DELETE CASCADE,
  bound_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, participant_id)
);

-- Answers "which seats does this account hold?" without scanning the table.
-- Also the lookup a future account-deletion or session-cleanup path needs.
CREATE INDEX IF NOT EXISTS session_seat_ownership_user_idx
  ON session_seat_ownership (user_id);

CREATE TABLE IF NOT EXISTS session_resolution_requests (
  request_id text PRIMARY KEY,
  session_id text NOT NULL,
  requested_by_participant_id text NOT NULL,
  target_participant_id text NOT NULL,
  target_character_id text,
  kind text NOT NULL CHECK (kind IN ('ability_check', 'saving_throw')),
  status text NOT NULL CHECK (status IN ('pending', 'resolved', 'cancelled')),
  resolution_id text,
  request jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A resolved request must point at the roll that answered it, and an
  -- unresolved one must not. Without this a cancelled request could carry a
  -- dice result, which is exactly the corruption the audit exists to rule out.
  CONSTRAINT session_resolution_requests_resolved_has_resolution
    CHECK ((status = 'resolved') = (resolution_id IS NOT NULL))
);

-- Recovery reads the most recent slice of one session in order.
CREATE INDEX IF NOT EXISTS session_resolution_requests_session_created_idx
  ON session_resolution_requests (session_id, created_at, request_id);

-- "What is this seat still waiting on?" stays a partial-index lookup rather
-- than a scan over every request the table has ever produced.
CREATE INDEX IF NOT EXISTS session_resolution_requests_pending_idx
  ON session_resolution_requests (session_id, target_participant_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS session_dice_resolutions (
  resolution_id text PRIMARY KEY,
  session_id text NOT NULL,
  -- SET NULL rather than CASCADE: a die that landed on the table happened. If a
  -- request row is ever removed, the roll it produced must survive as audit.
  request_id text REFERENCES session_resolution_requests(request_id) ON DELETE SET NULL,
  actor_participant_id text NOT NULL,
  actor_character_id text,
  kind text NOT NULL CHECK (kind IN ('ability_check', 'saving_throw', 'attack_roll')),
  command_id text NOT NULL,
  rules_profile_id text NOT NULL,
  resolved_at timestamptz NOT NULL,
  resolution jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One roll per request, enforced by the database and not only by the state
-- layer. Re-rolling a failed check under a fresh command ID is the attack this
-- refuses at the last possible boundary.
CREATE UNIQUE INDEX IF NOT EXISTS session_dice_resolutions_request_idx
  ON session_dice_resolutions (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS session_dice_resolutions_session_order_idx
  ON session_dice_resolutions (session_id, resolved_at, resolution_id);

CREATE TABLE IF NOT EXISTS session_player_intents (
  intent_id text PRIMARY KEY,
  session_id text NOT NULL,
  author_participant_id text NOT NULL,
  author_character_id text,
  status text NOT NULL
    CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),
  intent jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_player_intents_session_created_idx
  ON session_player_intents (session_id, created_at, intent_id);

-- The projection rule is "an intent is a note between its author and the GM",
-- so filtering by author is a first-class read, not an afterthought.
CREATE INDEX IF NOT EXISTS session_player_intents_session_author_idx
  ON session_player_intents (session_id, author_participant_id);
