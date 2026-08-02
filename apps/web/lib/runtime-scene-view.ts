/**
 * The two shapes a map can arrive in, and how the browser is allowed to read
 * them.
 *
 * A GM receives the authoritative `Scene`: the whole terrain layer, every
 * entity, the lighting configuration. A player receives a `SceneView`: only the
 * cells and entities their characters can currently perceive, with everything
 * else *absent* rather than blanked.
 *
 * Nothing here reconstructs what is missing. A cell the payload does not name is
 * unknown, and the only thing this module will say about it is that it is
 * unknown - there is no inference from neighbours, no cached previous frame, and
 * no request for the authoritative scene as a fallback. Visibility is decided by
 * the server; the browser renders the answer.
 */
import type {
  Scene,
  SceneCellIllumination,
  SceneEntity,
  SceneTerrainTile,
  SceneView,
  SceneViewEntity,
} from '@dnd/protocol';
import { decodeSceneTerrain } from '@dnd/rules';

/** Whichever of the two shapes this seat is entitled to. */
export type RuntimeScene = Scene | SceneView;

export type RuntimeSceneEntity = SceneEntity | SceneViewEntity;

export function isProjectedScene(scene: RuntimeScene): scene is SceneView {
  return 'view' in scene && scene.view === 'player_projection';
}

export function isAuthoritativeScene(scene: RuntimeScene): scene is Scene {
  return !isProjectedScene(scene);
}

/**
 * Whether an arriving map should replace the one already held.
 *
 * Two separate orderings, because the payloads mean different things:
 *
 *  - An authoritative scene is ordered by `updatedAt`, which changes whenever
 *    the map changes. That has been the rule since M2 and still is.
 *  - A projected view is ordered by `projectedAt`, because `updatedAt` cannot
 *    order two projections of the *same* map: an observer walking around
 *    changes what a player may see without touching the scene, so both frames
 *    carry the same `updatedAt` and comparing only that would discard the
 *    newer one.
 *
 * Equal `projectedAt` replaces. A tie is two frames stamped in the same
 * millisecond, and of the two ways to be wrong, keeping the older view is the
 * one that leaves a player looking at fog that has already lifted.
 *
 * A shape change always replaces. Switching seats hands this a payload the
 * previous role's map cannot be compared against, and keeping the old one would
 * leave a player looking at a GM's map.
 */
export function shouldReplaceRuntimeScene(
  current: RuntimeScene | null,
  next: RuntimeScene,
): boolean {
  if (!current || current.id !== next.id) {
    return true;
  }

  if (isProjectedScene(current) !== isProjectedScene(next)) {
    return true;
  }

  if (isProjectedScene(current) && isProjectedScene(next)) {
    return Date.parse(next.projectedAt) >= Date.parse(current.projectedAt);
  }

  return Date.parse(next.updatedAt) > Date.parse(current.updatedAt);
}

/**
 * Whether the GM has concealed this entity.
 *
 * Only an authoritative entity carries the flag. A projected one does not, and
 * absence reads as `false` - not because the answer is unknown, but because a
 * concealed entity is *absent from a player's payload entirely*. Anything a
 * player was sent is something they are allowed to see.
 */
export function isSceneEntityHidden(entity: RuntimeSceneEntity): boolean {
  return 'hidden' in entity && entity.hidden;
}

/**
 * Row-major render input for a map, whichever shape it arrived in.
 *
 * `tiles[i] === null` is the fog state, and it is produced only by absence: a
 * cell the projected payload never named. It is deliberately not a terrain
 * tile, so no drawing code can accidentally treat unknown ground as stone.
 *
 * The two arrays are parallel and always the same length as the grid, so the
 * renderer indexes both with one offset and never has to branch on which shape
 * the map arrived in.
 */
export type RenderedTerrain = {
  tiles: (SceneTerrainTile | null)[];
  illumination: SceneCellIllumination[];
};

/**
 * The authoritative scene expands through the existing terrain decoder and is
 * uniformly lit - a GM sees the map as authored, and fog is not a GM concern.
 * A projected view starts entirely unknown and is filled in only where the
 * server named a cell.
 */
export function buildRenderedTerrain(
  scene: RuntimeScene | null,
): RenderedTerrain {
  if (!scene) {
    return { tiles: [], illumination: [] };
  }

  const cellCount = scene.grid.width * scene.grid.height;

  if (isAuthoritativeScene(scene)) {
    return {
      tiles: decodeSceneTerrain(scene.grid, scene.terrain),
      illumination: Array.from({ length: cellCount }, () => 'bright' as const),
    };
  }

  const tiles: (SceneTerrainTile | null)[] = Array.from(
    { length: cellCount },
    () => null,
  );
  const illumination: SceneCellIllumination[] = Array.from(
    { length: cellCount },
    () => 'dark' as const,
  );

  for (const run of scene.cells) {
    if (run.y < 0 || run.y >= scene.grid.height) {
      continue;
    }

    for (let offset = 0; offset < run.length; offset += 1) {
      const x = run.x + offset;

      if (x < 0 || x >= scene.grid.width) {
        continue;
      }

      const index = run.y * scene.grid.width + x;

      tiles[index] = run.tile;
      illumination[index] = run.illumination;
    }
  }

  return { tiles, illumination };
}

/**
 * How much of the map this seat currently knows, as whole cells.
 *
 * Used for the one line of player-facing copy fog needs in this wave. It counts
 * what the payload contains and never what it omits, so it cannot become a
 * channel for the size of the unexplored map.
 */
export function countKnownCells(scene: RuntimeScene | null): number {
  if (!scene) {
    return 0;
  }

  if (isAuthoritativeScene(scene)) {
    return scene.grid.width * scene.grid.height;
  }

  return scene.cells.reduce((total, run) => total + run.length, 0);
}
