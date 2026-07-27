import {
  buildBlockingTerrainOccupancies,
  calculateMovementDistanceFeet,
  doesDestinationOverlapBlockingOccupancy,
  doesOccupancyFitWithinGrid,
  type OccupancyShape,
} from '@dnd/rules';
import type { SessionErrorCode } from '@dnd/protocol';
import type {
  CharacterId,
  Participant,
  Scene,
  SceneId,
  ScenePosition,
  SessionSnapshot,
} from '@dnd/shared';

import type { StoredCharacterRecord } from './character-store.js';

export class MovementRuntimeError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MovementRuntimeError';
  }
}

export function requireActiveSceneId(snapshot: SessionSnapshot): SceneId {
  if (snapshot.session.activeSceneId) {
    return snapshot.session.activeSceneId;
  }

  throw new MovementRuntimeError(
    'no_active_scene',
    `Session "${snapshot.session.id}" does not have an active scene.`,
  );
}

export function requireAssignedCharacterId(
  participant: Participant,
): CharacterId {
  if (participant.characterId) {
    return participant.characterId;
  }

  throw new MovementRuntimeError(
    'no_assigned_character',
    `Participant "${participant.id}" does not have an assigned character.`,
  );
}

// `place_character_in_active_scene` is treated as an initial placement/spawn
// for the active scene. Re-sending the same position is tolerated so retries
// stay idempotent, but moving an already-placed character belongs to the
// dedicated movement command instead.
export function assertCharacterCanBeSpawnedInActiveScene(
  record: StoredCharacterRecord,
  activeSceneId: SceneId,
  targetPosition: ScenePosition,
): void {
  const existingPosition = record.overlay.position;

  if (!existingPosition || existingPosition.sceneId !== activeSceneId) {
    return;
  }

  if (
    existingPosition.x === targetPosition.x &&
    existingPosition.y === targetPosition.y
  ) {
    return;
  }

  throw new MovementRuntimeError(
    'invalid_character_state',
    `Character "${record.character.id}" is already placed in active scene "${activeSceneId}" and must use movement to change position.`,
  );
}

export function requireCharacterPlacedInActiveScene(
  record: StoredCharacterRecord,
  activeSceneId: SceneId,
): ScenePosition {
  const position = record.overlay.position;

  if (position && position.sceneId === activeSceneId) {
    return position;
  }

  throw new MovementRuntimeError(
    'character_not_placed',
    `Character "${record.character.id}" is not placed in active scene "${activeSceneId}".`,
  );
}

export function assertMovementWithinAllowance(params: {
  origin: ScenePosition;
  target: ScenePosition;
  speedFeet: number;
  cellSizeFeet: number;
  characterId: CharacterId;
}): void {
  const movementCostFeet = calculateMovementDistanceFeet(
    params.origin,
    params.target,
    params.cellSizeFeet,
  );

  if (movementCostFeet <= params.speedFeet) {
    return;
  }

  throw new MovementRuntimeError(
    'movement_exceeds_allowance',
    `Character "${params.characterId}" cannot move ${movementCostFeet} feet with a speed of ${params.speedFeet}.`,
  );
}

export function assertCharacterDestinationAvailable(params: {
  scene: Scene;
  footprint: StoredCharacterRecord['overlay']['footprint'];
  targetPosition: ScenePosition;
  blockingOccupancies: OccupancyShape[];
  characterId: CharacterId;
}): void {
  const destination: OccupancyShape = {
    position: params.targetPosition,
    footprint: params.footprint,
  };

  if (!doesOccupancyFitWithinGrid(params.scene.grid, destination)) {
    throw new MovementRuntimeError(
      'movement_out_of_bounds',
      `Character "${params.characterId}" does not fit at the requested position in scene "${params.scene.id}".`,
    );
  }

  if (
    doesDestinationOverlapBlockingOccupancy(
      destination,
      params.blockingOccupancies,
    )
  ) {
    throw new MovementRuntimeError(
      'movement_destination_blocked',
      `Character "${params.characterId}" cannot move into blocked occupancy in scene "${params.scene.id}".`,
    );
  }
}

export function buildMovementBlockingOccupancies(params: {
  scene: Scene;
  characterRecords: StoredCharacterRecord[];
  excludedCharacterId: CharacterId;
}): OccupancyShape[] {
  const sceneEntityBlockers = params.scene.entities
    .filter((entity) => entity.blocksMovement)
    .map((entity) => ({
      position: entity.position,
      footprint: entity.footprint,
    }));

  // Painted walls, chasms, deep water, and lava block movement exactly like a
  // blocking entity does, so terrain joins the same occupancy list instead of
  // needing a second validation path.
  const terrainBlockers = buildBlockingTerrainOccupancies(
    params.scene.grid,
    params.scene.terrain,
  );

  const characterBlockers = params.characterRecords
    .filter((record) => record.character.id !== params.excludedCharacterId)
    .flatMap((record) => {
      if (
        !record.overlay.position ||
        record.overlay.position.sceneId !== params.scene.id
      ) {
        return [];
      }

      return [
        {
          position: {
            x: record.overlay.position.x,
            y: record.overlay.position.y,
          },
          footprint: record.overlay.footprint,
        },
      ];
    });

  return [...sceneEntityBlockers, ...terrainBlockers, ...characterBlockers];
}

export function withCharacterPlacedInScene(params: {
  record: StoredCharacterRecord;
  sceneId: SceneId;
  position: ScenePosition;
}): StoredCharacterRecord {
  return {
    character: params.record.character,
    overlay: {
      ...params.record.overlay,
      footprint: structuredClone(params.record.overlay.footprint),
      position: {
        sceneId: params.sceneId,
        x: params.position.x,
        y: params.position.y,
      },
    },
  };
}
