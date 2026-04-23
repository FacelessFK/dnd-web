import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type {
  Character,
  CharacterId,
  EncounterOverlay,
  ParticipantId,
  ParticipantRole,
  SceneId,
  Session,
  SessionId,
} from '@dnd/shared';

export type StoredCharacterRecordDocument = {
  character: Character;
  overlay: EncounterOverlay;
};

export type PersistedSessionParticipantDocument = {
  characterId: CharacterId | null;
  displayName: string;
  id: ParticipantId;
  joinedAt: string;
  role: ParticipantRole;
};

export type PersistedSessionDocument = Session & {
  activeSceneId: SceneId | null;
};

export type PersistedSessionSnapshotDocument = {
  participants: PersistedSessionParticipantDocument[];
  session: PersistedSessionDocument;
};

export const characterRecords = pgTable('character_records', {
  characterId: text('character_id').primaryKey().$type<CharacterId>(),
  record: jsonb('record').$type<StoredCharacterRecordDocument>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const completedCommandIdempotencyRecords = pgTable(
  'completed_command_idempotency_records',
  {
    idempotencyKey: text('idempotency_key').primaryKey(),
    category: text('category').notNull(),
    commandType: text('command_type').notNull(),
    commandId: text('command_id').notNull(),
    actorParticipantId: text('actor_participant_id').notNull(),
    sessionId: text('session_id'),
    fingerprint: text('fingerprint').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

export const sessionSnapshots = pgTable('session_snapshots', {
  sessionId: text('session_id').primaryKey().$type<SessionId>(),
  snapshot: jsonb('snapshot')
    .$type<PersistedSessionSnapshotDocument>()
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const dbSchema = {
  characterRecords,
  completedCommandIdempotencyRecords,
  sessionSnapshots,
};

export type DbSchema = typeof dbSchema;
export type CharacterRecordRow = typeof characterRecords.$inferSelect;
export type CompletedCommandIdempotencyRecordRow =
  typeof completedCommandIdempotencyRecords.$inferSelect;
export type SessionSnapshotRow = typeof sessionSnapshots.$inferSelect;
