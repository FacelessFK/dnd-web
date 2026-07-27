import { DEFAULT_SCENE_TERRAIN_TILE, encodeSceneTerrain } from '@dnd/rules';
import type {
  GridDefinition,
  SceneTerrain,
  SceneTerrainTile,
} from '@dnd/protocol';

// Authored maps are written as ASCII rows so a layout can be read and edited as
// a picture rather than as coordinate maths. The map builder saves terrain as
// painted cells; these presets exist so shipped scenes (like the demo scenario)
// start from a real room instead of a blank floor.

export const terrainLayoutLegend: Record<string, SceneTerrainTile> = {
  '#': 'wall_brick',
  '=': 'wall',
  '.': 'flagstone',
  ',': 'stone',
  ':': 'dirt',
  '"': 'grass',
  _: 'wood',
  '~': 'water',
  '≈': 'deep_water',
  '*': 'rubble',
  '^': 'sand',
  '%': 'ice',
  '!': 'lava',
  X: 'chasm',
  ' ': 'void',
};

export type TerrainLayout = {
  grid: GridDefinition;
  terrain: SceneTerrain;
};

/**
 * Converts ASCII rows into a terrain document. Rows shorter than the widest row
 * are padded with `fallbackTile` so a layout does not have to be
 * right-justified by hand.
 */
export function parseTerrainLayout(
  rows: readonly string[],
  options: {
    cellSizeFeet?: number;
    fallbackTile?: SceneTerrainTile;
    legend?: Record<string, SceneTerrainTile>;
  } = {},
): TerrainLayout {
  const legend = options.legend ?? terrainLayoutLegend;
  const fallbackTile = options.fallbackTile ?? DEFAULT_SCENE_TERRAIN_TILE;
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const height = rows.length;
  const tiles: SceneTerrainTile[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = rows[y] ?? '';

    for (let x = 0; x < width; x += 1) {
      const symbol = row[x];

      tiles.push((symbol && legend[symbol]) || fallbackTile);
    }
  }

  return {
    grid: {
      cellSizeFeet: options.cellSizeFeet ?? 5,
      height: Math.max(1, height),
      width: Math.max(1, width),
    },
    terrain: encodeSceneTerrain(tiles),
  };
}

// The demo scenario's flagship room: a walled training hall with a sparring
// floor, a water trough along the east wall, and collapsed rubble in a corner.
const trainingRoomRows = [
  '################',
  '#,,,,,,,,,,,,,,#',
  '#,..........,~~#',
  '#,.________.,~~#',
  '#,.________.,~~#',
  '#,.________.,,,#',
  '#,.________.,,,#',
  '#,.________.,,,#',
  '#,..........,**#',
  '#,,,,,,,,,,,,**#',
  '#,,,,,,,,,,,,,,#',
  '################',
] as const;

export function buildTrainingRoomLayout(): TerrainLayout {
  return parseTerrainLayout(trainingRoomRows);
}
