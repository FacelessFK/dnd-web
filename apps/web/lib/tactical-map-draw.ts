import type {
  GridDefinition,
  SceneCellIllumination,
  SceneTerrainTile,
} from '@dnd/protocol';

import {
  getTileStyle,
  getVisibleCellRange,
  hashCell,
  worldToScreen,
  type MapCamera,
  type ViewportSize,
} from './tactical-map-render';

// Canvas drawing for the terrain layer. Shared by the runtime tactical map and
// the map builder so painted terrain looks identical in play and in the editor.

export type TerrainDrawState = {
  camera: MapCamera;
  grid: GridDefinition;
  /**
   * Flat row-major tiles. `null` is a cell this viewer does not know about -
   * produced only by a projected scene omitting it - and is drawn as fog.
   */
  terrainTiles: (SceneTerrainTile | null)[];
  /**
   * Flat row-major illumination, parallel to `terrainTiles`. Omitted by callers
   * that have no lighting to express, such as the map builder, and then treated
   * as uniformly bright.
   */
  terrainIllumination?: SceneCellIllumination[];
  /** Milliseconds, used for liquid shimmer. */
  timestamp: number;
  viewport: ViewportSize;
};

/**
 * Unknown ground: one flat, opaque, deliberately unremarkable colour.
 *
 * Opaque matters. Anything translucent would let a viewer read the difference
 * between two kinds of nothing, and there is nothing underneath to read - the
 * cell was never in the payload. The final fog treatment is ROADMAP M3's later
 * wave; this is the honest minimum.
 */
const UNKNOWN_CELL_FILL = '#0b0b0e';

/** How much darker a dimly lit cell is drawn than a brightly lit one. */
const DIM_CELL_SHADE = 'rgba(4, 6, 14, 0.45)';

export type CellProjection = {
  cellScreenX: (x: number) => number;
  cellScreenY: (y: number) => number;
};

export function createCellProjection(
  camera: MapCamera,
  viewport: ViewportSize,
): CellProjection {
  const origin = worldToScreen({ x: 0, y: 0 }, camera, viewport);

  return {
    cellScreenX: (x: number) => origin.x + x * camera.scale,
    cellScreenY: (y: number) => origin.y + y * camera.scale,
  };
}

/** Terrain, wall shadows, and grid lines, in draw order. */
export function drawTerrainLayers(
  context: CanvasRenderingContext2D,
  state: TerrainDrawState,
  options: { showGridLines?: boolean } = {},
): void {
  const projection = createCellProjection(state.camera, state.viewport);
  const range = getVisibleCellRange(state.camera, state.viewport, state.grid);

  drawTerrain(context, state, range, projection);
  drawWallShadows(context, state, range, projection);

  if (options.showGridLines !== false) {
    drawGridLines(context, state, range, projection);
  }
}

type CellRange = ReturnType<typeof getVisibleCellRange>;

function tileAt(
  state: TerrainDrawState,
  x: number,
  y: number,
): SceneTerrainTile | null {
  return state.terrainTiles[y * state.grid.width + x] ?? null;
}

function isRaisedAt(state: TerrainDrawState, x: number, y: number): boolean {
  const tile = tileAt(state, x, y);

  return tile !== null && getTileStyle(tile).raised;
}

function illuminationAt(
  state: TerrainDrawState,
  x: number,
  y: number,
): SceneCellIllumination {
  return state.terrainIllumination?.[y * state.grid.width + x] ?? 'bright';
}

export function drawTerrain(
  context: CanvasRenderingContext2D,
  state: TerrainDrawState,
  range: CellRange,
  projection: CellProjection,
): void {
  const scale = state.camera.scale;
  const depth = Math.max(2, scale * 0.18);

  for (let y = range.startY; y <= range.endY; y += 1) {
    for (let x = range.startX; x <= range.endX; x += 1) {
      const tile = tileAt(state, x, y);
      const left = projection.cellScreenX(x);
      const top = projection.cellScreenY(y);

      if (!tile) {
        context.fillStyle = UNKNOWN_CELL_FILL;
        context.fillRect(left, top, scale + 1, scale + 1);
        continue;
      }

      const style = getTileStyle(tile);

      if (style.raised) {
        // Block side, then an inset top face lifted upward for a top-down
        // sense of height.
        context.fillStyle = style.shade;
        context.fillRect(left, top, scale + 1, scale + 1);

        const faceGradient = context.createLinearGradient(
          left,
          top - depth,
          left,
          top + scale - depth,
        );

        faceGradient.addColorStop(0, style.light);
        faceGradient.addColorStop(1, style.base);
        context.fillStyle = faceGradient;
        context.fillRect(left, top - depth, scale + 1, scale + 1);

        if (tile === 'wall_brick' && scale > 22) {
          drawBrickCourses(
            context,
            left,
            top - depth,
            scale,
            style.shade,
            x,
            y,
          );
        } else if (scale > 18) {
          drawSpeckles(
            context,
            left,
            top - depth,
            scale,
            style.speckle,
            x,
            y,
            5,
          );
        }

        continue;
      }

      context.fillStyle = style.base;
      context.fillRect(left, top, scale + 1, scale + 1);

      // Gentle per-cell brightness variation keeps large floors from looking
      // flat. Kept subtle on purpose: a strong value here reads as a checker
      // pattern rather than as texture.
      const variation = hashCell(x, y, 1);

      context.globalAlpha = 0.1 + Math.abs(variation - 0.5) * 0.14;
      context.fillStyle = variation > 0.5 ? style.light : style.shade;
      context.fillRect(left, top, scale + 1, scale + 1);
      context.globalAlpha = 1;

      // A soft inner edge gives each cell a shallow lip so the floor still
      // reads as tiled once the brightness variation is dialled back.
      if (scale > 20) {
        context.globalAlpha = 0.18;
        context.strokeStyle = style.shade;
        context.lineWidth = Math.max(1, scale * 0.045);
        context.strokeRect(
          left + context.lineWidth / 2,
          top + context.lineWidth / 2,
          scale - context.lineWidth,
          scale - context.lineWidth,
        );
        context.globalAlpha = 1;
      }

      if (style.liquid) {
        drawLiquid(context, left, top, scale, style, x, y, state.timestamp);
      } else if (scale > 18) {
        drawSpeckles(context, left, top, scale, style.speckle, x, y, 4);
      }

      // Dimly lit ground is drawn as itself, shaded. It is known - the viewer
      // can see it - just not well lit, which is a different thing from the fog
      // above and has to look different.
      if (illuminationAt(state, x, y) === 'dim') {
        context.fillStyle = DIM_CELL_SHADE;
        context.fillRect(left, top, scale + 1, scale + 1);
      }
    }
  }
}

export function drawWallShadows(
  context: CanvasRenderingContext2D,
  state: TerrainDrawState,
  range: CellRange,
  projection: CellProjection,
): void {
  const scale = state.camera.scale;
  const shadowDepth = Math.max(2, scale * 0.2);

  for (let y = range.startY; y <= range.endY; y += 1) {
    for (let x = range.startX; x <= range.endX; x += 1) {
      if (!isRaisedAt(state, x, y)) {
        continue;
      }

      const below = y + 1;

      // An unknown cell casts no shadow and receives none. A shadow falling
      // onto fog would be the client inferring that there is floor down there
      // to fall on, which is exactly what it has not been told.
      if (
        below >= state.grid.height ||
        !tileAt(state, x, below) ||
        isRaisedAt(state, x, below)
      ) {
        continue;
      }

      // Fading the cast shadow avoids the hard black band a flat fill leaves
      // along a wall run.
      const shadowTop = projection.cellScreenY(below);
      const gradient = context.createLinearGradient(
        0,
        shadowTop,
        0,
        shadowTop + shadowDepth,
      );

      gradient.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = gradient;
      context.fillRect(
        projection.cellScreenX(x),
        shadowTop,
        scale + 1,
        shadowDepth,
      );
    }
  }
}

export function drawGridLines(
  context: CanvasRenderingContext2D,
  state: TerrainDrawState,
  range: CellRange,
  projection: CellProjection,
): void {
  const scale = state.camera.scale;

  if (scale < 16) {
    return;
  }

  context.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  context.lineWidth = 1;
  context.beginPath();

  for (let x = range.startX; x <= range.endX + 1; x += 1) {
    const screenX = Math.round(projection.cellScreenX(x)) + 0.5;

    context.moveTo(screenX, projection.cellScreenY(range.startY));
    context.lineTo(screenX, projection.cellScreenY(range.endY + 1));
  }

  for (let y = range.startY; y <= range.endY + 1; y += 1) {
    const screenY = Math.round(projection.cellScreenY(y)) + 0.5;

    context.moveTo(projection.cellScreenX(range.startX), screenY);
    context.lineTo(projection.cellScreenX(range.endX + 1), screenY);
  }

  context.stroke();
}

export function drawMapFrame(
  context: CanvasRenderingContext2D,
  state: Pick<TerrainDrawState, 'camera' | 'grid'>,
  projection: CellProjection,
): void {
  context.strokeStyle = 'rgba(245, 197, 108, 0.35)';
  context.lineWidth = 2;
  context.strokeRect(
    projection.cellScreenX(0) - 1,
    projection.cellScreenY(0) - 1,
    state.grid.width * state.camera.scale + 2,
    state.grid.height * state.camera.scale + 2,
  );
}

export function drawSpeckles(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  scale: number,
  color: string,
  cellX: number,
  cellY: number,
  count: number,
): void {
  context.fillStyle = color;
  context.globalAlpha = 0.16;

  for (let index = 0; index < count; index += 1) {
    const offsetX = hashCell(cellX, cellY, index * 2 + 11) * scale;
    const offsetY = hashCell(cellX, cellY, index * 2 + 12) * scale;
    const size = Math.max(
      1,
      scale * 0.035 * (0.6 + hashCell(cellX, cellY, index + 40)),
    );

    context.fillRect(left + offsetX, top + offsetY, size, size);
  }

  context.globalAlpha = 1;
}

export function drawBrickCourses(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  scale: number,
  mortar: string,
  cellX: number,
  cellY: number,
): void {
  const courses = 3;
  const courseHeight = scale / courses;

  context.strokeStyle = mortar;
  context.globalAlpha = 0.5;
  context.lineWidth = Math.max(1, scale * 0.02);

  for (let index = 1; index < courses; index += 1) {
    const y = top + index * courseHeight;

    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(left + scale, y);
    context.stroke();
  }

  for (let index = 0; index < courses; index += 1) {
    const jointOffset = index % 2 === 0 ? scale * 0.5 : scale * 0.25;
    const x =
      left + jointOffset + hashCell(cellX, cellY + index, 7) * scale * 0.1;

    context.beginPath();
    context.moveTo(x, top + index * courseHeight);
    context.lineTo(x, top + (index + 1) * courseHeight);
    context.stroke();
  }

  context.globalAlpha = 1;
}

export function drawLiquid(
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  scale: number,
  style: ReturnType<typeof getTileStyle>,
  cellX: number,
  cellY: number,
  timestamp: number,
): void {
  const phase = timestamp * 0.0009 + hashCell(cellX, cellY, 21) * Math.PI * 2;

  // Short, per-cell offset ripples rather than full-width bands: bands that
  // span the cell line up across neighbours and read as stripes.
  context.fillStyle = style.light;

  for (let band = 0; band < 3; band += 1) {
    const bandPhase = phase + band * 1.7;
    const offsetY = (Math.sin(bandPhase) * 0.5 + 0.5) * scale * 0.78;
    const inset = scale * (0.1 + hashCell(cellX, cellY, band + 30) * 0.25);
    const thickness = Math.max(1, scale * 0.045);

    context.globalAlpha = 0.16 + Math.abs(Math.sin(bandPhase)) * 0.12;
    context.fillRect(left + inset, top + offsetY, scale - inset * 2, thickness);
  }

  context.globalAlpha = 0.18;
  context.fillStyle = style.speckle;
  context.fillRect(
    left + scale * (0.25 + hashCell(cellX, cellY, 44) * 0.3),
    top + (Math.sin(phase * 1.4) * 0.5 + 0.5) * scale * 0.8,
    scale * 0.28,
    Math.max(1, scale * 0.035),
  );
  context.globalAlpha = 1;
}
