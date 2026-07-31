import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import type {
  Character,
  CharacterId,
  Encounter,
  EncounterId,
  EncounterOverlay,
  ParticipantId,
  ParticipantRole,
  Scene,
  SceneId,
  Session,
  SessionId,
} from '@dnd/shared';

export type StoredCharacterRecordDocument = {
  character: Character;
  overlay: EncounterOverlay;
};

export type StoredCharacterLibraryEntryDocument = {
  [key: string]: unknown;
};

export type PersistedSessionParticipantDocument = {
  characterId: CharacterId | null;
  displayName: string;
  id: ParticipantId;
  joinedAt: string;
  pendingCharacterId?: CharacterId | null;
  role: ParticipantRole;
};

export type PersistedSessionDocument = Session & {
  activeSceneId: SceneId | null;
};

export type PersistedSessionSnapshotDocument = {
  participants: PersistedSessionParticipantDocument[];
  session: PersistedSessionDocument;
};

export type StoredSceneRecordDocument = Scene;
export type StoredActiveEncounterRecordDocument = Encounter;
/**
 * The canonical protocol objects, stored opaquely.
 *
 * Modelled like `StoredCharacterLibraryEntryDocument` rather than by importing
 * the protocol types: `packages/protocol` owns those shapes, and a structural
 * copy here would be a second definition free to drift from the Zod schema that
 * the server and the browser actually agree on. The server validates on the way
 * out of the database, which is where a shape mismatch should surface.
 */
export type StoredResolutionRequestDocument = { [key: string]: unknown };
export type StoredDiceResolutionDocument = { [key: string]: unknown };
export type StoredPlayerIntentDocument = { [key: string]: unknown };
export type CommandEventOutboxEventType =
  | 'session_state'
  | 'character_state'
  | 'combat_event'
  | 'encounter_state'
  | 'movement_state'
  | 'resolution_state'
  | 'player_intent_state';
export type StoredCommandEventOutboxPayloadDocument = {
  sessionId: SessionId;
  type: CommandEventOutboxEventType;
} & Record<string, unknown>;

export const authUsers = pgTable('auth_users', {
  userId: text('user_id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  ownerParticipantId: text('owner_participant_id').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const authSessions = pgTable('auth_sessions', {
  sessionId: text('session_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => authUsers.userId, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked: boolean('revoked').default(false).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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

export const characterLibraryEntries = pgTable('character_library_entries', {
  entryId: text('entry_id').primaryKey(),
  ownerParticipantId: text('owner_participant_id').notNull(),
  ownerUserId: text('owner_user_id').references(() => authUsers.userId, {
    onDelete: 'cascade',
  }),
  entry: jsonb('entry').$type<StoredCharacterLibraryEntryDocument>().notNull(),
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

export const commandIdempotencyClaimRecords = pgTable(
  'command_idempotency_claim_records',
  {
    idempotencyKey: text('idempotency_key').primaryKey(),
    category: text('category').notNull(),
    commandType: text('command_type').notNull(),
    commandId: text('command_id').notNull(),
    actorParticipantId: text('actor_participant_id').notNull(),
    sessionId: text('session_id'),
    fingerprint: text('fingerprint').notNull(),
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

export const sceneRecords = pgTable('scene_records', {
  sceneId: text('scene_id').primaryKey().$type<SceneId>(),
  sessionId: text('session_id').$type<SessionId>().notNull(),
  record: jsonb('record').$type<StoredSceneRecordDocument>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const activeEncounterRecords = pgTable('active_encounter_records', {
  encounterId: text('encounter_id').primaryKey().$type<EncounterId>(),
  sessionId: text('session_id').$type<SessionId>().notNull().unique(),
  sceneId: text('scene_id').$type<SceneId>().notNull(),
  record: jsonb('record')
    .$type<StoredActiveEncounterRecordDocument>()
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const commandEventOutboxRecords = pgTable(
  'command_event_outbox_records',
  {
    outboxId: text('outbox_id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    sessionId: text('session_id').$type<SessionId>().notNull(),
    eventType: text('event_type').notNull(),
    eventOrder: integer('event_order').notNull(),
    payload: jsonb('payload')
      .$type<StoredCommandEventOutboxPayloadDocument>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => ({
    uniqueCommandEventOrder: uniqueIndex(
      'command_event_outbox_records_idempotency_key_event_order_idx',
    ).on(table.idempotencyKey, table.eventOrder),
  }),
);

export const sessionSeatOwnership = pgTable(
  'session_seat_ownership',
  {
    sessionId: text('session_id').$type<SessionId>().notNull(),
    participantId: text('participant_id').$type<ParticipantId>().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.userId, { onDelete: 'cascade' }),
    boundAt: timestamp('bound_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    seatPrimaryKey: primaryKey({
      columns: [table.sessionId, table.participantId],
    }),
  }),
);

export const sessionResolutionRequests = pgTable(
  'session_resolution_requests',
  {
    requestId: text('request_id').primaryKey(),
    sessionId: text('session_id').$type<SessionId>().notNull(),
    requestedByParticipantId: text('requested_by_participant_id')
      .$type<ParticipantId>()
      .notNull(),
    targetParticipantId: text('target_participant_id')
      .$type<ParticipantId>()
      .notNull(),
    targetCharacterId: text('target_character_id').$type<CharacterId>(),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    resolutionId: text('resolution_id'),
    request: jsonb('request')
      .$type<StoredResolutionRequestDocument>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index(
      'session_resolution_requests_session_created_idx',
    ).on(table.sessionId, table.createdAt, table.requestId),
  }),
);

export const sessionDiceResolutions = pgTable(
  'session_dice_resolutions',
  {
    resolutionId: text('resolution_id').primaryKey(),
    sessionId: text('session_id').$type<SessionId>().notNull(),
    requestId: text('request_id').references(
      () => sessionResolutionRequests.requestId,
      { onDelete: 'set null' },
    ),
    actorParticipantId: text('actor_participant_id')
      .$type<ParticipantId>()
      .notNull(),
    actorCharacterId: text('actor_character_id').$type<CharacterId>(),
    kind: text('kind').notNull(),
    commandId: text('command_id').notNull(),
    rulesProfileId: text('rules_profile_id').notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull(),
    resolution: jsonb('resolution')
      .$type<StoredDiceResolutionDocument>()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionOrderIdx: index('session_dice_resolutions_session_order_idx').on(
      table.sessionId,
      table.resolvedAt,
      table.resolutionId,
    ),
  }),
);

export const sessionPlayerIntents = pgTable(
  'session_player_intents',
  {
    intentId: text('intent_id').primaryKey(),
    sessionId: text('session_id').$type<SessionId>().notNull(),
    authorParticipantId: text('author_participant_id')
      .$type<ParticipantId>()
      .notNull(),
    authorCharacterId: text('author_character_id').$type<CharacterId>(),
    status: text('status').notNull(),
    intent: jsonb('intent').$type<StoredPlayerIntentDocument>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index('session_player_intents_session_created_idx').on(
      table.sessionId,
      table.createdAt,
      table.intentId,
    ),
    sessionAuthorIdx: index('session_player_intents_session_author_idx').on(
      table.sessionId,
      table.authorParticipantId,
    ),
  }),
);

export const dbSchema = {
  activeEncounterRecords,
  authSessions,
  authUsers,
  characterLibraryEntries,
  characterRecords,
  commandIdempotencyClaimRecords,
  commandEventOutboxRecords,
  completedCommandIdempotencyRecords,
  sceneRecords,
  sessionDiceResolutions,
  sessionPlayerIntents,
  sessionResolutionRequests,
  sessionSeatOwnership,
  sessionSnapshots,
};

export type DbSchema = typeof dbSchema;
export type ActiveEncounterRecordRow =
  typeof activeEncounterRecords.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type AuthUserRow = typeof authUsers.$inferSelect;
export type CharacterRecordRow = typeof characterRecords.$inferSelect;
export type CharacterLibraryEntryRow =
  typeof characterLibraryEntries.$inferSelect;
export type CommandEventOutboxRow =
  typeof commandEventOutboxRecords.$inferSelect;
export type CommandIdempotencyClaimRecordRow =
  typeof commandIdempotencyClaimRecords.$inferSelect;
export type CompletedCommandIdempotencyRecordRow =
  typeof completedCommandIdempotencyRecords.$inferSelect;
export type SceneRecordRow = typeof sceneRecords.$inferSelect;
export type SessionDiceResolutionRow =
  typeof sessionDiceResolutions.$inferSelect;
export type SessionPlayerIntentRow = typeof sessionPlayerIntents.$inferSelect;
export type SessionResolutionRequestRow =
  typeof sessionResolutionRequests.$inferSelect;
export type SessionSeatOwnershipRow = typeof sessionSeatOwnership.$inferSelect;
export type SessionSnapshotRow = typeof sessionSnapshots.$inferSelect;
