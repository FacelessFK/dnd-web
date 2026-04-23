import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type { Character, CharacterId, EncounterOverlay } from '@dnd/shared';

export type StoredCharacterRecordDocument = {
  character: Character;
  overlay: EncounterOverlay;
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

export const dbSchema = {
  characterRecords,
};

export type DbSchema = typeof dbSchema;
export type CharacterRecordRow = typeof characterRecords.$inferSelect;
