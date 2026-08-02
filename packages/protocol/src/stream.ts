import { z } from 'zod';

import { combatEventSchema } from './combat.js';
import { characterStateUpdateSchema } from './dm.js';
import { encounterStateUpdateSchema } from './encounter.js';
import { playerIntentStateUpdateSchema } from './intent.js';
import { resolutionStateUpdateSchema } from './resolution.js';
import { movementStateUpdateSchema } from './movement.js';
import { sceneStateUpdateSchema } from './scene.js';
import { sessionStateUpdateSchema } from './session.js';

export const sessionStreamEventSchema = z.discriminatedUnion('type', [
  combatEventSchema,
  characterStateUpdateSchema,
  sessionStateUpdateSchema,
  movementStateUpdateSchema,
  sceneStateUpdateSchema,
  encounterStateUpdateSchema,
  resolutionStateUpdateSchema,
  playerIntentStateUpdateSchema,
]);

export type SessionStreamEvent = z.infer<typeof sessionStreamEventSchema>;
