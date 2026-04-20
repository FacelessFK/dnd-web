import { z } from 'zod';

export const sessionIdPattern = /^[A-Z0-9]{6}$/;
export const participantIdPattern = /^[a-zA-Z0-9_-]{2,64}$/;
export const rulesProfileIdPattern = /^[a-z0-9][a-z0-9_-]{2,63}$/;
export const characterIdPattern = /^char_[a-f0-9-]{36}$/;
export const sceneIdPattern = /^scene_[a-f0-9-]{36}$/;
export const sceneEntityIdPattern = /^scene_entity_[a-f0-9-]{36}$/;
export const encounterIdPattern = /^encounter_[a-f0-9-]{36}$/;

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
