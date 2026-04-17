import { z } from 'zod';

import { movementStateUpdateSchema } from './movement.js';
import { sessionStateUpdateSchema } from './session.js';

export const sessionStreamEventSchema = z.discriminatedUnion('type', [
  sessionStateUpdateSchema,
  movementStateUpdateSchema,
]);

export type SessionStreamEvent = z.infer<typeof sessionStreamEventSchema>;
