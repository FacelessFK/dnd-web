import { z } from 'zod';

import { skillIds } from '@dnd/shared';

export const sessionIdPattern = /^[A-Z0-9]{6}$/;
export const participantIdPattern = /^[a-zA-Z0-9_-]{2,64}$/;
export const rulesProfileIdPattern = /^[a-z0-9][a-z0-9_-]{2,63}$/;
export const characterIdPattern = /^char_[a-f0-9-]{36}$/;
export const characterLibraryEntryIdPattern = /^charlib_[a-f0-9-]{36}$/;
export const sceneIdPattern = /^scene_[a-f0-9-]{36}$/;
export const sceneEntityIdPattern = /^scene_entity_[a-f0-9-]{36}$/;
export const encounterIdPattern = /^encounter_[a-f0-9-]{36}$/;

/**
 * A canonical skill ID. Never a display label - see `skillIds` in
 * `@dnd/shared` for why that distinction is load-bearing.
 */
export const skillIdSchema = z.enum(skillIds);

// Re-exported so the browser can enumerate the canonical list without taking a
// direct dependency on `@dnd/shared`, which it does not have.
export { skillIds };

export const sessionIdSchema = z
  .string()
  .trim()
  .regex(sessionIdPattern, 'Session ID must be 6 uppercase letters or digits.');

export const participantIdSchema = z
  .string()
  .trim()
  .regex(
    participantIdPattern,
    'Participant ID must be 2-64 characters and use letters, numbers, "_" or "-".',
  );

/**
 * Server-issued proof of participant identity, returned by create/join/reconnect
 * and required on every session-scoped command and stream subscription.
 *
 * A participant ID is a public name - session snapshots publish every one of
 * them, including the GM's - so it cannot double as a bearer secret. This can.
 * Never log it, never put it in an error message, and never derive a display
 * value from it.
 */
export const participantTokenSchema = z
  .string()
  .trim()
  .min(32, 'Participant token is too short to be a server-issued credential.')
  .max(256, 'Participant token is too long.');

export const rulesProfileIdSchema = z
  .string()
  .trim()
  .regex(
    rulesProfileIdPattern,
    'Rules profile ID must be 3-64 lowercase characters and may use digits, "_" or "-".',
  );

export const characterIdSchema = z
  .string()
  .trim()
  .regex(
    characterIdPattern,
    'Character ID must be a server-generated ID like "char_<uuid>".',
  );

export const characterLibraryEntryIdSchema = z
  .string()
  .trim()
  .regex(
    characterLibraryEntryIdPattern,
    'Character library entry ID must be a server-generated ID like "charlib_<uuid>".',
  );

export const sceneIdSchema = z
  .string()
  .trim()
  .regex(
    sceneIdPattern,
    'Scene ID must be a server-generated ID like "scene_<uuid>".',
  );

export const sceneEntityIdSchema = z
  .string()
  .trim()
  .regex(
    sceneEntityIdPattern,
    'Scene entity ID must be a server-generated ID like "scene_entity_<uuid>".',
  );

export const encounterIdSchema = z
  .string()
  .trim()
  .regex(
    encounterIdPattern,
    'Encounter ID must be a server-generated ID like "encounter_<uuid>".',
  );

export const displayNameSchema = z.string().trim().min(1).max(48);
export const characterNameSchema = z.string().trim().min(1).max(80);
export const revisionSchema = z.number().int().min(1);
export const levelSchema = z.number().int().min(1).max(20);
export const commandIdSchema = z.string().trim().min(1).max(128);
