import { z } from 'zod';

import {
  sceneCombatantKinds,
  sceneEntityTypes,
  sceneTerrainTiles,
  sceneTransitionKinds,
} from '@dnd/shared';

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
export const sceneTransitionKindSchema = z.enum(sceneTransitionKinds);
export const sceneTerrainTileSchema = z.enum(sceneTerrainTiles);

// Upper bound on encoded runs. A 500x500 grid is 250k cells, but a map that
// needs a run per cell is pathological rather than authored, so the cap keeps
// scene payloads bounded without constraining real map work.
const maxSceneTerrainRuns = 20000;

export const sceneTerrainRunSchema = z.object({
  tile: sceneTerrainTileSchema,
  length: z.number().int().min(1).max(250000),
});

export const sceneTerrainSchema = z.object({
  runs: z.array(sceneTerrainRunSchema).max(maxSceneTerrainRuns),
});

export const sceneTerrainCellSchema = z.object({
  position: z.object({
    x: z.number().int().min(0).max(499),
    y: z.number().int().min(0).max(499),
  }),
  tile: sceneTerrainTileSchema,
});

const sceneNameSchema = z.string().trim().min(1).max(80);
const sceneEntityNameSchema = z.string().trim().min(1).max(80);
const sceneTransitionLabelSchema = z.string().trim().min(1).max(80);
const sceneTransitionNotesSchema = z.string().trim().max(500);

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

export const sceneTransitionSchema = z.object({
  kind: sceneTransitionKindSchema,
  targetSceneId: sceneIdSchema,
  targetLabel: sceneTransitionLabelSchema.nullable(),
  notes: sceneTransitionNotesSchema.nullable(),
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
  transition: sceneTransitionSchema.nullable().optional(),
  meta: z.record(rulesConfigValueSchema),
});

export const sceneSchema = z.object({
  id: sceneIdSchema,
  sessionId: sessionIdSchema,
  name: sceneNameSchema,
  grid: gridDefinitionSchema,
  // Nullable rather than required so scenes stored before the terrain layer
  // still parse; consumers treat null as an unpainted map.
  terrain: sceneTerrainSchema.nullable().default(null),
  entities: z.array(sceneEntitySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const sceneStateUpdateReasonSchema = z.enum([
  // The subscriber just connected and is being told what the map looks like
  // now. Not a replay of anything they missed - it is the current state only.
  'initial_sync',
  'scene_activated',
  'entity_placed',
  'entity_updated',
  'entity_moved',
  'entity_removed',
  'terrain_painted',
  'transition_created',
  'transition_updated',
  'transition_removed',
  'combatant_placed',
  'combatant_moved',
  'combatant_hp_changed',
  // A combatant was concealed or revealed. For the DM the scene is unchanged;
  // for a player the entity appears or disappears entirely, which is the whole
  // reason this cannot be a client-side filter.
  'combatant_visibility_changed',
]);

/**
 * The active scene as one subscriber is allowed to see it.
 *
 * The payload is already projected when it reaches this schema: a player's
 * `scene.entities` never contains a hidden entity, so there is no hidden ID,
 * position, or HP in the bytes at all. The DM receives the authoritative scene.
 * Projecting before serialization is the point - a client that received the
 * full scene and filtered it would be one devtools tab away from omniscience.
 *
 * This is live delivery, not a log. There is no cursor, no replay, and no
 * ordering guarantee beyond the transport's own; a subscriber that misses a
 * frame recovers by reconnecting and receiving `initial_sync`.
 */
export const sceneStateUpdateSchema = z.object({
  type: z.literal('scene_state'),
  reason: sceneStateUpdateReasonSchema,
  sessionId: sessionIdSchema,
  scene: sceneSchema,
});

export const sceneInputSchema = z.object({
  name: sceneNameSchema,
  grid: gridDefinitionSchema,
  terrain: sceneTerrainSchema.nullable().optional(),
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

export const sceneTransitionInputSchema = z.object({
  kind: sceneTransitionKindSchema,
  name: sceneEntityNameSchema,
  position: scenePositionSchema,
  footprint: sceneEntityFootprintSchema,
  blocksMovement: z.boolean(),
  blocksVision: z.boolean(),
  hidden: z.boolean(),
  targetSceneId: sceneIdSchema,
  targetLabel: sceneTransitionLabelSchema.nullable().optional(),
  notes: sceneTransitionNotesSchema.nullable().optional(),
});

export const sceneTransitionUpdateInputSchema = z
  .object({
    kind: sceneTransitionKindSchema.optional(),
    name: sceneEntityNameSchema.optional(),
    footprint: sceneEntityFootprintSchema.optional(),
    blocksMovement: z.boolean().optional(),
    blocksVision: z.boolean().optional(),
    hidden: z.boolean().optional(),
    targetSceneId: sceneIdSchema.optional(),
    targetLabel: sceneTransitionLabelSchema.nullable().optional(),
    notes: sceneTransitionNotesSchema.nullable().optional(),
  })
  .superRefine((update, context) => {
    if (Object.keys(update).length > 0) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Scene transition update must include at least one editable field.',
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

// Sparse cell patch rather than a whole-map replace: the same command serves a
// single DM brush stroke during play and a full map-builder save, and a patch
// keeps concurrent edits from clobbering unrelated regions.
export const paintSceneTerrainCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('paint_scene_terrain'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    cells: z.array(sceneTerrainCellSchema).min(1).max(8192),
  }),
});

export const createSceneTransitionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('create_scene_transition'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    transition: sceneTransitionInputSchema,
  }),
});

export const updateSceneTransitionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('update_scene_transition'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    transitionId: sceneEntityIdSchema,
    transition: sceneTransitionUpdateInputSchema,
  }),
});

export const deleteSceneTransitionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('delete_scene_transition'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    transitionId: sceneEntityIdSchema,
  }),
});

export const activateSceneTransitionCommandSchema = z.object({
  commandId: commandIdSchema,
  type: z.literal('activate_scene_transition'),
  actor: sessionActorSchema,
  payload: z.object({
    sessionId: sessionIdSchema,
    sceneId: sceneIdSchema,
    transitionId: sceneEntityIdSchema,
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
  paintSceneTerrainCommandSchema,
  createSceneTransitionCommandSchema,
  updateSceneTransitionCommandSchema,
  deleteSceneTransitionCommandSchema,
  activateSceneTransitionCommandSchema,
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
export type SceneEntityType = z.infer<typeof sceneEntityTypeSchema>;
export type SceneTerrainTile = z.infer<typeof sceneTerrainTileSchema>;
export type SceneTerrainRun = z.infer<typeof sceneTerrainRunSchema>;
export type SceneTerrain = z.infer<typeof sceneTerrainSchema>;
export type SceneTerrainCell = z.infer<typeof sceneTerrainCellSchema>;
export type PaintSceneTerrainCommand = z.infer<
  typeof paintSceneTerrainCommandSchema
>;
export type ScenePosition = z.infer<typeof scenePositionSchema>;
export type SceneEntityFootprint = z.infer<typeof sceneEntityFootprintSchema>;
export type SceneCombatant = z.infer<typeof sceneCombatantSchema>;
export type SceneTransition = z.infer<typeof sceneTransitionSchema>;
export type SceneEntity = z.infer<typeof sceneEntitySchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneStateUpdateReason = z.infer<
  typeof sceneStateUpdateReasonSchema
>;
export type SceneStateUpdate = z.infer<typeof sceneStateUpdateSchema>;
export type SceneInput = z.infer<typeof sceneInputSchema>;
export type SceneEntityInput = z.infer<typeof sceneEntityInputSchema>;
export type SceneEntityUpdateInput = z.infer<
  typeof sceneEntityUpdateInputSchema
>;
export type SceneTransitionInput = z.infer<typeof sceneTransitionInputSchema>;
export type SceneTransitionUpdateInput = z.infer<
  typeof sceneTransitionUpdateInputSchema
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
export type CreateSceneTransitionCommand = z.infer<
  typeof createSceneTransitionCommandSchema
>;
export type UpdateSceneTransitionCommand = z.infer<
  typeof updateSceneTransitionCommandSchema
>;
export type DeleteSceneTransitionCommand = z.infer<
  typeof deleteSceneTransitionCommandSchema
>;
export type ActivateSceneTransitionCommand = z.infer<
  typeof activateSceneTransitionCommandSchema
>;
export type SceneCommand = z.infer<typeof sceneCommandSchema>;
export type SceneCommandSuccess = z.infer<typeof sceneCommandSuccessSchema>;
export type SceneActivationSuccess = z.infer<
  typeof sceneActivationSuccessSchema
>;
export type SceneCommandError = z.infer<typeof sceneCommandErrorSchema>;
export type SceneCommandResponse = z.infer<typeof sceneCommandResponseSchema>;
