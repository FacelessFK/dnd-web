import { randomUUID } from 'node:crypto';

import {
  doesSceneEntityFitWithinGrid,
  doSceneEntitiesOverlap,
  isGridDefinitionValid as isValidGridDefinition,
} from '@dnd/rules';
import type { SceneEntityInput, SceneInput } from '@dnd/protocol';
import type {
  GridDefinition,
  SceneCombatant,
  Scene,
  SceneEntity,
  SceneEntityId,
  SceneId,
  SessionId,
  SessionSnapshot,
} from '@dnd/shared';

import { SceneStoreError } from './scene-store.js';

export function createSceneRecord(
  sessionId: SessionId,
  sceneInput: SceneInput,
): Scene {
  const now = createTimestamp();

  return {
    id: createSceneId(),
    sessionId,
    name: sceneInput.name,
    grid: structuredClone(sceneInput.grid),
    entities: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createSceneEntity(entityInput: SceneEntityInput): SceneEntity {
  return {
    id: createSceneEntityId(),
    type: entityInput.type,
    name: entityInput.name,
    position: structuredClone(entityInput.position),
    footprint: structuredClone(entityInput.footprint),
    blocksMovement: entityInput.blocksMovement,
    blocksVision: entityInput.blocksVision,
    hidden: entityInput.hidden,
    combatant: null,
    meta: structuredClone(entityInput.meta ?? {}),
  };
}

export function createCombatantSceneEntity(params: {
  name: string;
  position: SceneEntity['position'];
  footprint: SceneEntity['footprint'];
  hidden: boolean;
  combatant: SceneCombatant;
}): SceneEntity {
  return {
    id: createSceneEntityId(),
    type: 'monster',
    name: params.name,
    position: structuredClone(params.position),
    footprint: structuredClone(params.footprint),
    blocksMovement: true,
    blocksVision: false,
    hidden: params.hidden,
    combatant: structuredClone(params.combatant),
    meta: {
      source: 'dm_combatant',
    },
  };
}

export function assertSceneBelongsToSession(
  snapshot: SessionSnapshot,
  scene: Scene,
): void {
  if (scene.sessionId === snapshot.session.id) {
    return;
  }

  throw new SceneStoreError(
    'invalid_scene_session_association',
    `Scene "${scene.id}" belongs to session "${scene.sessionId}" and cannot be used in session "${snapshot.session.id}".`,
  );
}

export function assertGridDefinitionIsValid(grid: GridDefinition): void {
  if (isValidGridDefinition(grid)) {
    return;
  }

  throw new SceneStoreError(
    'invalid_grid_size',
    'Scene grids must use positive integer dimensions and cell sizes.',
  );
}

export function assertSceneEntityPlacement(
  scene: Scene,
  entity: SceneEntity,
): void {
  if (
    entity.position.x < 0 ||
    entity.position.y < 0 ||
    entity.footprint.width < 1 ||
    entity.footprint.height < 1
  ) {
    throw new SceneStoreError(
      'invalid_entity_position',
      `Scene entity "${entity.id}" must use non-negative grid coordinates and a positive footprint.`,
    );
  }

  if (
    !doesSceneEntityFitWithinGrid(scene.grid, entity.position, entity.footprint)
  ) {
    throw new SceneStoreError(
      'scene_entity_out_of_bounds',
      `Scene entity "${entity.id}" does not fit within scene "${scene.id}".`,
    );
  }

  const overlappingEntity = scene.entities.find((existingEntity) =>
    doSceneEntitiesOverlap(existingEntity, entity),
  );

  if (overlappingEntity) {
    throw new SceneStoreError(
      'scene_entity_overlap',
      `Scene entity "${entity.id}" overlaps with "${overlappingEntity.id}" in scene "${scene.id}".`,
    );
  }
}

function createSceneId(): SceneId {
  return `scene_${randomUUID()}`;
}

function createSceneEntityId(): SceneEntityId {
  return `scene_entity_${randomUUID()}`;
}

function createTimestamp(): string {
  return new Date().toISOString();
}
