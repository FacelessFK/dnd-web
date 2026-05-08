import { z } from 'zod';

import { sceneCombatantKinds, sceneEntityTypes } from '@dnd/shared';

import {
  commandIdSchema,
  participantIdSchema,
  sceneEntityIdSchema,
  sceneIdSchema,
  sessionIdSchema,
} from './common.js';
import { commandErrorSchema } from './errors.js';
import { rulesConfigValueSchema } from './rules-profile.js';
import { sessionSnapshotSchema } from './session.js';

export const sceneEntityTypeSchema = z.enum(sceneEntityTypes);
export const sceneCombatantKindSchema = z.enum(sceneCombatantKinds);

const sceneNameSchema = z.string().trim().min(1).max(80);
const sceneEntityNameSchema = z.string().trim().min(1).max(80);

export const gridDefinitionSchema = z.object({
  cellSizeFeet: z.number().int().min(1).max(20).default(5),
  width: z.number().int().min(1).max(500),
  height: z.number().int().min(1).max(500),
});

export const scenePositionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

export const sceneEntityFootprintSchema = z.object({
  width: z.number().int().min(1).max(20),
  height: z.number().int().min(1).max(20),
});

export const sceneCombatantSchema = z.object({
  kind: sceneCombatantKindSchema,
  hp: z
    .object({
      max: z.number().int().min(1).max(999),
      current: z.number().int().min(0).max(999),
      temp: z.number().int().min(0).max(999),
    })
    .superRefine((value, ctx) => {
      if (value.current > value.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Current HP cannot exceed max HP.',
          path: ['current'],
        });
      }
    }),
  armorClass: z.number().int().min(0).max(99),
  speed: z.number().int().min(0).max(200),
  abilities: z.object({
    str: z.number().int().min(1).max(30),
    dex: z.number().int().min(1).max(30),
    con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30),
    wis: z.number().int().min(1).max(30),
    cha: z.number().int().min(1).max(30),
  }),
});

export const sceneEntitySchema = z.object({
  id: sceneEntityIdSchema,
  type: sceneEntityTypeSchema,
  name: sceneEntityNameSchema,
  position: scenePositionSchema,
  footprint: sceneEntityFootprintSchema,
  blocksMovement: z.boolean(),
  blocksVision: z.boolean(),
  hidden: z.boolean(),
  combatant: sceneCombatantSchema.nullable().default(null),
  meta: z.record(rulesConfigValueSchema),
});

export const sceneSchema = z.object({
  id: sceneIdSchema,
  sessionId: sessionIdSchema,
  name: sceneNameSchema,
  grid: gridDefinitionSchema,
  entities: z.array(sceneEntitySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const sceneInputSchema = z.object({
  name: sceneNameSchema,
  grid: gridDefinitionSchema,
});

export const sceneEntityInputSchema = z.object({
  type: sceneEntityTypeSchema,
  name: sceneEntityNameSchema,
  position: scenePositionSchema,
  footprint: sceneEntityFootprintSchema,
  blocksMovement: z.boolean(),
  blocksVision: z.boolean(),
  hidden: z.boolean(),
  meta: z.record(rulesConfigValueSchema).optional(),
});

export const sceneEntityUpdateInputSchema = z
  .object({
    type: sceneEntityTypeSchema.optional(),
    name: sceneEntityNameSchema.optional(),
    footprint: sceneEntityFootprintSchema.optional(),
    blocksMovement: z.boolean().optional(),
    blocksVision: z.boolean().optional(),
    hidden: z.boolean().optional(),
    meta: z.record(rulesConfigValueSchema).optional(),
  })
  .superRefine((update, context) => {
    if (Object.keys(update).length > 0) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Scene entity update must include at least one editable field.',
    });
  });

const sessionActorSchema = z.object({
  participantId: participantIdSchema,
});

export const createSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('create_scene'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    scene: sceneInputSchema,
  }),
});

export const getSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('get_scene'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
  }),
});

export const activateSceneForSessionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('activate_scene_for_session'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
  }),
});

export const placeEntityInSceneCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('place_entity_in_scene'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    entity: sceneEntityInputSchema,
  }),
});

export const updateSceneEntityCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('update_scene_entity'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    entityId: sceneEntityIdSchema,
    entity: sceneEntityUpdateInputSchema,
  }),
});

export const repositionSceneEntityCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('reposition_scene_entity'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    entityId: sceneEntityIdSchema,
    position: scenePositionSchema,
  }),
});

export const deleteSceneEntityCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('delete_scene_entity'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    entityId: sceneEntityIdSchema,
  }),
});

export const sceneCommandSchema = z.discriminatedUnion('type', [
  createSceneCommandSchema,
  getSceneCommandSchema,
  activateSceneForSessionCommandSchema,
  placeEntityInSceneCommandSchema,
  updateSceneEntityCommandSchema,
  repositionSceneEntityCommandSchema,
  deleteSceneEntityCommandSchema,
]);

export const sceneCommandSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    scene: sceneSchema,
  }),
});

export const sceneActivationSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    state: sessionSnapshotSchema,
  }),
});

export const sceneCommandErrorSchema = commandErrorSchema;

export const sceneCommandResponseSchema = z.union([
  sceneCommandSuccessSchema,
  sceneActivationSuccessSchema,
  sceneCommandErrorSchema,
]);

export type GridDefinition = z.infer<typeof gridDefinitionSchema>;
export type ScenePosition = z.infer<typeof scenePositionSchema>;
export type SceneEntityFootprint = z.infer<typeof sceneEntityFootprintSchema>;
export type SceneCombatant = z.infer<typeof sceneCombatantSchema>;
export type SceneEntity = z.infer<typeof sceneEntitySchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneInput = z.infer<typeof sceneInputSchema>;
export type SceneEntityInput = z.infer<typeof sceneEntityInputSchema>;
export type SceneEntityUpdateInput = z.infer<
  typeof sceneEntityUpdateInputSchema
>;
export type CreateSceneCommand = z.infer<typeof createSceneCommandSchema>;
export type GetSceneCommand = z.infer<typeof getSceneCommandSchema>;
export type ActivateSceneForSessionCommand = z.infer<
  typeof activateSceneForSessionCommandSchema
>;
export type PlaceEntityInSceneCommand = z.infer<
  typeof placeEntityInSceneCommandSchema
>;
export type UpdateSceneEntityCommand = z.infer<
  typeof updateSceneEntityCommandSchema
>;
export type RepositionSceneEntityCommand = z.infer<
  typeof repositionSceneEntityCommandSchema
>;
export type DeleteSceneEntityCommand = z.infer<
  typeof deleteSceneEntityCommandSchema
>;
export type SceneCommand = z.infer<typeof sceneCommandSchema>;
export type SceneCommandSuccess = z.infer<typeof sceneCommandSuccessSchema>;
export type SceneActivationSuccess = z.infer<
  typeof sceneActivationSuccessSchema
>;
export type SceneCommandError = z.infer<typeof sceneCommandErrorSchema>;
export type SceneCommandResponse = z.infer<typeof sceneCommandResponseSchema>;
