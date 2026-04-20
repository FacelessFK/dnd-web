import { z } from 'zod';

import { encounterStateUpdateSchema } from './encounter.js';
import { movementStateUpdateSchema } from './movement.js';
import { sessionStateUpdateSchema } from './session.js';

export const sessionStreamEventSchema = z.discriminatedUnion('type', [
  sessionStateUpdateSchema,
  movementStateUpdateSchema,
  encounterStateUpdateSchema,
]);

export type SessionStreamEvent = z.infer<typeof sessionStreamEventSchema>;
