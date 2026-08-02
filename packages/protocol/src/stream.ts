import { z } from 'zod';

import { combatEventSchema } from './combat.js';
import { characterStateUpdateSchema } from './dm.js';
import { encounterStateUpdateSchema } from './encounter.js';
import { playerIntentStateUpdateSchema } from './intent.js';
import { resolutionStateUpdateSchema } from './resolution.js';
import { movementStateUpdateSchema } from './movement.js';
import {
  authoritativeSceneStateUpdateSchema,
  projectedSceneStateUpdateSchema,
} from './scene.js';
import { sessionStateUpdateSchema } from './session.js';

// The two `scene_state` variants are listed individually rather than as
// `sceneStateUpdateSchema`, because a discriminated union cannot be a member of
// another discriminated union. They still discriminate cleanly here: both carry
// `type: 'scene_state'`, so a consumer narrows to the pair on `type` and then
// on `view`.
export const sessionStreamEventSchema = z.union([
  combatEventSchema,
  characterStateUpdateSchema,
  sessionStateUpdateSchema,
  movementStateUpdateSchema,
  authoritativeSceneStateUpdateSchema,
  projectedSceneStateUpdateSchema,
  encounterStateUpdateSchema,
  resolutionStateUpdateSchema,
  playerIntentStateUpdateSchema,
]);

export type SessionStreamEvent = z.infer<typeof sessionStreamEventSchema>;
