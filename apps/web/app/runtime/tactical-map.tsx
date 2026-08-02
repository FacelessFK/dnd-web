'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import type { ActiveSceneState, ScenePosition } from '@dnd/protocol';

import { useI18n } from '../../lib/i18n';
import {
  createCellProjection,
  drawMapFrame,
  drawTerrainLayers,
} from '../../lib/tactical-map-draw';
import {
  buildBlockedCellKeys,
  buildMapDecor,
  buildMapTokens,
  createFitCamera,
  getCameraAfterPan,
  getCameraAfterZoom,
  getHealthColor,
  getReachableCells,
  getTokenPalette,
  getVisibleCellRange,
  screenToCell,
  toCellKey,
  worldToScreen,
  type MapCamera,
  type MapDecor,
  type MapToken,
  type ViewportSize,
} from '../../lib/tactical-map-render';
import { buildRenderedTerrain } from '../../lib/runtime-scene-view';
import type { RuntimeScene } from '../../lib/runtime-scene-view';

export type TacticalMapProps = {
  activeScene: ActiveSceneState | null;
  characterNamesByParticipant: Record<
    string,
    { name: string; hp: { current: number; max: number } } | undefined
  >;
  currentTurnCombatantId: string | null;
  currentTurnParticipantId: string | null;
  /** Feet of movement the acting token has left, or null when not moving. */
  movementBudgetFeet: number | null;
  /** Token whose movement range is previewed. */
  movingParticipantId: string | null;
  mode: 'dm' | 'player';
  onSelectCell: (cell: ScenePosition) => void;
  onSelectCombatant: (entityId: string) => void;
  onSelectSceneEntity: (entityId: string) => void;
  onSelectParticipant: (participantId: string) => void;
  ownParticipantId: string | null;
  scene: RuntimeScene | null;
  selectedCell: ScenePosition;
  selectedCombatantId: string;
  selectedSceneEntityId: string;
  targetCombatantId: string;
  targetParticipantId: string;
};

export function TacticalMap(props: TacticalMapProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>({
    height: 0,
    width: 0,
  });
  const [camera, setCamera] = useState<MapCamera | null>(null);
  const [hoveredCell, setHoveredCell] = useState<ScenePosition | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  const grid = props.scene?.grid ?? { cellSizeFeet: 5, height: 1, width: 1 };
  const gridKey = `${props.scene?.id ?? 'none'}:${grid.width}x${grid.height}`;

  const tokens = useMemo(
    () =>
      buildMapTokens({
        activeScene: props.activeScene,
        characterNamesByParticipant: props.characterNamesByParticipant,
        currentTurnCombatantId: props.currentTurnCombatantId,
        currentTurnParticipantId: props.currentTurnParticipantId,
        ownParticipantId: props.ownParticipantId,
        scene: props.scene,
        selectedCombatantId: props.selectedCombatantId || null,
        selectedParticipantId: null,
        targetCombatantId: props.targetCombatantId || null,
        targetParticipantId: props.targetParticipantId || null,
      }),
    [
      props.activeScene,
      props.characterNamesByParticipant,
      props.currentTurnCombatantId,
      props.currentTurnParticipantId,
      props.ownParticipantId,
      props.scene,
      props.selectedCombatantId,
      props.targetCombatantId,
      props.targetParticipantId,
    ],
  );

  // Concealment is enforced on the server: `get_scene` already strips hidden
  // entities for a player, so this flag is a rendering choice for the DM's own
  // view, not the boundary that keeps secrets from players. Do not reintroduce
  // hidden entities into a player payload on the assumption that this filter
  // protects them.
  const decor = useMemo(
    () => buildMapDecor(props.scene, { includeHidden: props.mode === 'dm' }),
    [props.mode, props.scene],
  );

  const terrain = useMemo(
    () => buildRenderedTerrain(props.scene),
    [props.scene],
  );

  const movingToken = useMemo(
    () =>
      props.movingParticipantId
        ? (tokens.find(
            (token) => token.participantId === props.movingParticipantId,
          ) ?? null)
        : null,
    [props.movingParticipantId, tokens],
  );

  const reachableCellKeys = useMemo(() => {
    if (!movingToken || props.movementBudgetFeet == null || !props.scene) {
      return new Set<string>();
    }

    const blocked = buildBlockedCellKeys({
      excludeTokenId: movingToken.id,
      scene: props.scene,
      tokens,
    });

    return new Set(
      getReachableCells({
        blockedCellKeys: blocked,
        budgetFeet: props.movementBudgetFeet,
        grid: props.scene.grid,
        origin: movingToken.position,
      }).map(toCellKey),
    );
  }, [movingToken, props.movementBudgetFeet, props.scene, tokens]);

  // Measure the drawing surface so camera maths always works in real pixels.
  useEffect(() => {
    const container = containerRef.current;

    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setViewport({
        height: Math.max(1, Math.round(entry.contentRect.height)),
        width: Math.max(1, Math.round(entry.contentRect.width)),
      });
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Frame the map on first measure and whenever a different map is loaded.
  useEffect(() => {
    if (viewport.width === 0 || viewport.height === 0) {
      return;
    }

    // Refitting on every camera change would fight the user's panning, so this
    // deliberately keys on the map identity and viewport size only.
    setCamera(createFitCamera(grid, viewport));
  }, [gridKey, viewport.width, viewport.height]);

  const resetView = useCallback(() => {
    if (viewport.width > 0 && viewport.height > 0) {
      setCamera(createFitCamera(grid, viewport));
    }
  }, [grid, viewport]);

  const zoomBy = useCallback(
    (delta: number) => {
      setCamera((current) =>
        current
          ? getCameraAfterZoom({
              anchor: { x: viewport.width / 2, y: viewport.height / 2 },
              camera: current,
              delta,
              grid,
              viewport,
            })
          : current,
      );
    },
    [grid, viewport],
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const container = containerRef.current;

      if (!container || !camera) {
        return;
      }

      const rect = container.getBoundingClientRect();

      setCamera(
        getCameraAfterZoom({
          anchor: {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          },
          camera,
          delta: -event.deltaY * 0.0015,
          grid,
          viewport,
        }),
      );
    },
    [camera, grid, viewport],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }

      dragStateRef.current = {
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        pointerId: event.pointerId,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;

      if (!container || !camera) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const localPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      setHoveredCell(screenToCell(localPoint, camera, viewport, grid));

      const dragState = dragStateRef.current;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragState.lastX;
      const deltaY = event.clientY - dragState.lastY;

      if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
        dragState.moved = true;
      }

      dragState.lastX = event.clientX;
      dragState.lastY = event.clientY;

      setCamera((current) =>
        current
          ? getCameraAfterPan({
              camera: current,
              deltaScreenX: deltaX,
              deltaScreenY: deltaY,
              grid,
              viewport,
            })
          : current,
      );
    },
    [camera, grid, viewport],
  );

  const selectAtCell = useCallback(
    (cell: ScenePosition) => {
      props.onSelectCell(cell);

      // Clicking a token selects the thing on the cell, which is what a DM
      // expects from a map; the cell itself stays selected underneath.
      const tokenAtCell = tokens.find(
        (token) =>
          cell.x >= token.position.x &&
          cell.x < token.position.x + token.footprint.width &&
          cell.y >= token.position.y &&
          cell.y < token.position.y + token.footprint.height,
      );

      if (tokenAtCell?.entityId) {
        props.onSelectCombatant(tokenAtCell.entityId);
        return;
      }

      if (tokenAtCell?.participantId) {
        props.onSelectParticipant(tokenAtCell.participantId);
        return;
      }

      const decorAtCell = decor.find(
        (item) =>
          cell.x >= item.position.x &&
          cell.x < item.position.x + item.footprint.width &&
          cell.y >= item.position.y &&
          cell.y < item.position.y + item.footprint.height,
      );

      if (decorAtCell) {
        props.onSelectSceneEntity(decorAtCell.id);
      }
    },
    [decor, props, tokens],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;

      dragStateRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (!dragState || dragState.moved || !camera) {
        return;
      }

      const container = containerRef.current;

      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const cell = screenToCell(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        camera,
        viewport,
        grid,
      );

      if (cell) {
        selectAtCell(cell);
      }
    },
    [camera, grid, selectAtCell, viewport],
  );

  // Keyboard navigation lives on the container so the map stays operable
  // without a pointer; arrow keys walk the selected cell, +/- zoom.
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const deltas: Record<string, [number, number]> = {
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
      };
      const delta = deltas[event.key];

      if (delta) {
        event.preventDefault();
        props.onSelectCell({
          x: Math.min(
            grid.width - 1,
            Math.max(0, props.selectedCell.x + delta[0]),
          ),
          y: Math.min(
            grid.height - 1,
            Math.max(0, props.selectedCell.y + delta[1]),
          ),
        });
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectAtCell(props.selectedCell);
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(0.25);
        return;
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomBy(-0.25);
        return;
      }

      if (event.key === '0') {
        event.preventDefault();
        resetView();
      }
    },
    [grid, props, resetView, selectAtCell, zoomBy],
  );

  // Draw loop. Runs continuously so liquids shimmer and the turn ring pulses.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !camera || viewport.width === 0 || viewport.height === 0) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(viewport.width * devicePixelRatio);
    canvas.height = Math.round(viewport.height * devicePixelRatio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    let frameHandle = 0;

    const renderFrame = (timestamp: number) => {
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      drawMap(context, {
        camera,
        decor,
        grid,
        hoveredCell,
        reachableCellKeys,
        selectedCell: props.selectedCell,
        selectedSceneEntityId: props.selectedSceneEntityId,
        terrain,
        timestamp,
        tokens,
        viewport,
      });
      frameHandle = window.requestAnimationFrame(renderFrame);
    };

    frameHandle = window.requestAnimationFrame(renderFrame);

    return () => window.cancelAnimationFrame(frameHandle);
  }, [
    camera,
    decor,
    grid,
    hoveredCell,
    props.selectedCell,
    props.selectedSceneEntityId,
    reachableCellKeys,
    terrain,
    tokens,
    viewport,
  ]);

  // Only cells currently on screen get an accessibility button, so a large map
  // does not create tens of thousands of DOM nodes.
  const accessibleCells = useMemo(() => {
    if (!camera || viewport.width === 0) {
      return [];
    }

    const range = getVisibleCellRange(camera, viewport, grid, 0);
    const cells: Array<{ cell: ScenePosition; left: number; top: number }> = [];

    for (let y = range.startY; y <= range.endY; y += 1) {
      for (let x = range.startX; x <= range.endX; x += 1) {
        const screen = worldToScreen({ x, y }, camera, viewport);

        cells.push({ cell: { x, y }, left: screen.x, top: screen.y });
      }
    }

    return cells;
  }, [camera, grid, viewport]);

  const zoomPercent = camera
    ? `${Math.round((camera.scale / 64) * 100)}%`
    : '100%';

  return (
    <div className="grid gap-3">
      <div
        className="relative h-[clamp(360px,58vh,720px)] w-full touch-none overflow-hidden rounded-3xl border border-amber-500/25 bg-[#0a0806] shadow-[inset_0_2px_40px_rgba(0,0,0,0.9)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        data-tactical-map
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => setHoveredCell(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        ref={containerRef}
        role="application"
        aria-label={t('runtime.map.label')}
        tabIndex={0}
      >
        <canvas className="block" ref={canvasRef} />

        <div
          aria-label={t('runtime.board.gridLabel')}
          className="pointer-events-none absolute inset-0"
          role="grid"
        >
          {accessibleCells.map(({ cell, left, top }) => (
            <button
              aria-label={buildCellAriaLabel({
                cell,
                decor,
                isSelected:
                  cell.x === props.selectedCell.x &&
                  cell.y === props.selectedCell.y,
                labels: {
                  movementTarget: t('runtime.board.badge.move'),
                  selected: t('runtime.board.badge.selected'),
                  target: t('runtime.board.badge.target'),
                  turn: t('runtime.board.badge.turn'),
                },
                reachableCellKeys,
                tokens,
              })}
              className="pointer-events-auto absolute opacity-0 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
              key={toCellKey(cell)}
              onClick={() => selectAtCell(cell)}
              style={{
                height: `${camera?.scale ?? 0}px`,
                left: `${left}px`,
                top: `${top}px`,
                width: `${camera?.scale ?? 0}px`,
              }}
              tabIndex={-1}
              type="button"
            />
          ))}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          <div className="rounded-xl border border-amber-500/20 bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <p className="text-[11px] font-black uppercase tracking-wider text-amber-200/90">
              {props.scene?.name ?? t('runtime.map.noScene')}
            </p>
            <p className="text-[11px] text-amber-100/50">
              {t('runtime.map.gridSummary', {
                height: String(grid.height),
                width: String(grid.width),
              })}
            </p>
          </div>

          <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-amber-500/20 bg-black/60 p-1 backdrop-blur-sm">
            <button
              aria-label={t('runtime.board.zoomOut')}
              className={mapControlClassName}
              onClick={() => zoomBy(-0.25)}
              title={t('runtime.board.zoomOut')}
              type="button"
            >
              −
            </button>
            <span className="min-w-14 text-center text-[11px] font-bold text-amber-100">
              {zoomPercent}
            </span>
            <button
              aria-label={t('runtime.board.zoomIn')}
              className={mapControlClassName}
              onClick={() => zoomBy(0.25)}
              title={t('runtime.board.zoomIn')}
              type="button"
            >
              +
            </button>
            <button
              aria-label={t('runtime.board.resetView')}
              className={`${mapControlClassName} px-2`}
              onClick={resetView}
              title={t('runtime.board.resetView')}
              type="button"
            >
              {t('runtime.map.fit')}
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-0 left-0 p-3">
          <p className="rounded-lg border border-amber-500/15 bg-black/60 px-2.5 py-1 text-[11px] text-amber-100/60 backdrop-blur-sm">
            {hoveredCell
              ? t('runtime.map.cursor', {
                  x: String(hoveredCell.x),
                  y: String(hoveredCell.y),
                })
              : t('runtime.map.hint')}
          </p>
        </div>
      </div>
    </div>
  );
}

const mapControlClassName =
  'flex h-7 min-w-7 items-center justify-center rounded-lg border border-amber-400/25 bg-black/40 text-xs font-black text-amber-100 transition hover:border-amber-200 hover:bg-amber-300/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200';

function buildCellAriaLabel(params: {
  cell: ScenePosition;
  decor: MapDecor[];
  isSelected: boolean;
  labels: {
    movementTarget: string;
    selected: string;
    target: string;
    turn: string;
  };
  reachableCellKeys: ReadonlySet<string>;
  tokens: MapToken[];
}): string {
  const parts: string[] = [`Cell ${params.cell.x}, ${params.cell.y}`];
  const token = params.tokens.find(
    (candidate) =>
      candidate.position.x === params.cell.x &&
      candidate.position.y === params.cell.y,
  );

  if (token) {
    parts.push(token.name);

    if (token.isCurrentTurn) {
      parts.push(params.labels.turn);
    }

    if (token.isTarget) {
      parts.push(params.labels.target);
    }
  }

  const decorItem = params.decor.find(
    (candidate) =>
      candidate.position.x === params.cell.x &&
      candidate.position.y === params.cell.y,
  );

  if (decorItem) {
    parts.push(decorItem.name);
  }

  if (params.isSelected) {
    parts.push(params.labels.selected);
  }

  if (params.reachableCellKeys.has(toCellKey(params.cell))) {
    parts.push(params.labels.movementTarget);
  }

  return parts.join(', ');
}

type DrawState = {
  camera: MapCamera;
  decor: MapDecor[];
  grid: { cellSizeFeet: number; height: number; width: number };
  hoveredCell: ScenePosition | null;
  reachableCellKeys: ReadonlySet<string>;
  selectedCell: ScenePosition;
  selectedSceneEntityId: string;
  terrain: ReturnType<typeof buildRenderedTerrain>;
  timestamp: number;
  tokens: MapToken[];
  viewport: ViewportSize;
};

function drawMap(context: CanvasRenderingContext2D, state: DrawState): void {
  const { camera, grid, viewport } = state;

  context.clearRect(0, 0, viewport.width, viewport.height);

  // Backdrop beyond the map edge.
  context.fillStyle = '#050405';
  context.fillRect(0, 0, viewport.width, viewport.height);

  const projection = createCellProjection(camera, viewport);
  const { cellScreenX, cellScreenY } = projection;

  drawTerrainLayers(context, {
    camera,
    grid,
    terrainIllumination: state.terrain.illumination,
    terrainTiles: state.terrain.tiles,
    timestamp: state.timestamp,
    viewport,
  });
  drawMovementRange(context, state, cellScreenX, cellScreenY);
  drawDecor(context, state, cellScreenX, cellScreenY);
  drawCellHighlights(context, state, cellScreenX, cellScreenY);
  drawTokens(context, state, cellScreenX, cellScreenY);
  drawLighting(context, state, cellScreenX, cellScreenY);
  drawMapFrame(context, { camera, grid }, projection);
}

function drawMovementRange(
  context: CanvasRenderingContext2D,
  state: DrawState,
  cellScreenX: (x: number) => number,
  cellScreenY: (y: number) => number,
): void {
  if (state.reachableCellKeys.size === 0) {
    return;
  }

  const scale = state.camera.scale;
  const pulse = 0.14 + Math.sin(state.timestamp * 0.003) * 0.04;

  context.fillStyle = `rgba(94, 234, 212, ${pulse})`;
  context.strokeStyle = 'rgba(94, 234, 212, 0.5)';
  context.lineWidth = Math.max(1, scale * 0.03);

  for (const key of state.reachableCellKeys) {
    const [rawX, rawY] = key.split(',');
    const x = Number(rawX);
    const y = Number(rawY);
    const left = cellScreenX(x);
    const top = cellScreenY(y);

    context.fillRect(left, top, scale, scale);

    // Outline only the boundary of the region so the interior stays readable.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (state.reachableCellKeys.has(`${x + dx},${y + dy}`)) {
        continue;
      }

      context.beginPath();

      if (dx === 1) {
        context.moveTo(left + scale, top);
        context.lineTo(left + scale, top + scale);
      } else if (dx === -1) {
        context.moveTo(left, top);
        context.lineTo(left, top + scale);
      } else if (dy === 1) {
        context.moveTo(left, top + scale);
        context.lineTo(left + scale, top + scale);
      } else {
        context.moveTo(left, top);
        context.lineTo(left + scale, top);
      }

      context.stroke();
    }
  }
}

const decorPalette: Record<
  MapDecor['kind'],
  { fill: string; stroke: string; glyph: string }
> = {
  object: { fill: 'rgba(120, 84, 44, 0.85)', stroke: '#c9975a', glyph: '▩' },
  terrain: { fill: 'rgba(56, 92, 56, 0.8)', stroke: '#7fbe72', glyph: '❋' },
  spawn: { fill: 'rgba(38, 92, 128, 0.7)', stroke: '#6cc4f5', glyph: '✦' },
  transition: { fill: 'rgba(92, 56, 132, 0.8)', stroke: '#c69cf5', glyph: '⌘' },
};

function drawDecor(
  context: CanvasRenderingContext2D,
  state: DrawState,
  cellScreenX: (x: number) => number,
  cellScreenY: (y: number) => number,
): void {
  const scale = state.camera.scale;

  for (const item of state.decor) {
    const palette = decorPalette[item.kind];
    const left = cellScreenX(item.position.x) + scale * 0.1;
    const top = cellScreenY(item.position.y) + scale * 0.1;
    const width = item.footprint.width * scale - scale * 0.2;
    const height = item.footprint.height * scale - scale * 0.2;
    const radius = Math.min(scale * 0.18, 10);
    const isSelected = item.id === state.selectedSceneEntityId;

    context.save();

    if (item.hidden) {
      context.setLineDash([
        Math.max(3, scale * 0.12),
        Math.max(3, scale * 0.1),
      ]);
      context.globalAlpha = 0.6;
    }

    context.beginPath();
    roundedRect(context, left, top, width, height, radius);
    context.fillStyle = palette.fill;
    context.fill();
    context.strokeStyle = isSelected ? '#ffd67a' : palette.stroke;
    context.lineWidth = isSelected
      ? Math.max(2, scale * 0.06)
      : Math.max(1, scale * 0.03);
    context.stroke();

    if (scale > 26) {
      context.setLineDash([]);
      context.globalAlpha = item.hidden ? 0.7 : 0.95;
      context.fillStyle = palette.stroke;
      context.font = `${Math.round(scale * 0.42)}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(palette.glyph, left + width / 2, top + height / 2);
    }

    context.restore();
  }
}

function drawCellHighlights(
  context: CanvasRenderingContext2D,
  state: DrawState,
  cellScreenX: (x: number) => number,
  cellScreenY: (y: number) => number,
): void {
  const scale = state.camera.scale;

  if (state.hoveredCell) {
    context.strokeStyle = 'rgba(255, 236, 190, 0.35)';
    context.lineWidth = Math.max(1, scale * 0.03);
    context.strokeRect(
      cellScreenX(state.hoveredCell.x) + 1,
      cellScreenY(state.hoveredCell.y) + 1,
      scale - 2,
      scale - 2,
    );
  }

  const left = cellScreenX(state.selectedCell.x);
  const top = cellScreenY(state.selectedCell.y);
  const corner = scale * 0.28;

  context.strokeStyle = '#ffd67a';
  context.lineWidth = Math.max(2, scale * 0.05);
  context.beginPath();
  // Corner brackets read as a reticle without hiding what is on the cell.
  context.moveTo(left, top + corner);
  context.lineTo(left, top);
  context.lineTo(left + corner, top);
  context.moveTo(left + scale - corner, top);
  context.lineTo(left + scale, top);
  context.lineTo(left + scale, top + corner);
  context.moveTo(left + scale, top + scale - corner);
  context.lineTo(left + scale, top + scale);
  context.lineTo(left + scale - corner, top + scale);
  context.moveTo(left + corner, top + scale);
  context.lineTo(left, top + scale);
  context.lineTo(left, top + scale - corner);
  context.stroke();
}

function drawTokens(
  context: CanvasRenderingContext2D,
  state: DrawState,
  cellScreenX: (x: number) => number,
  cellScreenY: (y: number) => number,
): void {
  const scale = state.camera.scale;

  for (const token of state.tokens) {
    const palette = getTokenPalette(token.kind);
    const centerX =
      cellScreenX(token.position.x) + (token.footprint.width * scale) / 2;
    const centerY =
      cellScreenY(token.position.y) + (token.footprint.height * scale) / 2;
    const radius =
      (Math.min(token.footprint.width, token.footprint.height) * scale) / 2 -
      scale * 0.12;

    if (radius <= 1) {
      continue;
    }

    context.save();

    if (token.defeated) {
      context.globalAlpha = 0.45;
    }

    // Contact shadow.
    context.fillStyle = 'rgba(0, 0, 0, 0.55)';
    context.beginPath();
    context.ellipse(
      centerX,
      centerY + radius * 0.5,
      radius * 0.95,
      radius * 0.42,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();

    if (token.isCurrentTurn && !token.defeated) {
      const pulse = 0.5 + Math.sin(state.timestamp * 0.004) * 0.5;

      context.strokeStyle = `rgba(255, 208, 112, ${0.35 + pulse * 0.45})`;
      context.lineWidth = Math.max(2, scale * 0.07);
      context.beginPath();
      context.arc(
        centerX,
        centerY,
        radius + scale * 0.1 + pulse * scale * 0.05,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }

    const bodyGradient = context.createRadialGradient(
      centerX - radius * 0.35,
      centerY - radius * 0.45,
      radius * 0.15,
      centerX,
      centerY,
      radius,
    );

    bodyGradient.addColorStop(0, palette.fillLight);
    bodyGradient.addColorStop(1, palette.fill);

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = bodyGradient;
    context.fill();

    context.strokeStyle = token.isTarget ? '#ff8a75' : palette.ring;
    context.lineWidth = Math.max(1.5, scale * 0.05);
    context.stroke();

    if (token.hp && token.hp.max > 0 && !token.defeated) {
      const ratio = Math.min(1, Math.max(0, token.hp.current / token.hp.max));

      context.beginPath();
      context.arc(
        centerX,
        centerY,
        radius + scale * 0.02,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * ratio,
      );
      context.strokeStyle = getHealthColor(ratio);
      context.lineWidth = Math.max(2, scale * 0.055);
      context.stroke();
    }

    if (scale > 24) {
      context.fillStyle = '#f6efe4';
      context.font = `700 ${Math.round(radius * 0.85)}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(token.initials, centerX, centerY + radius * 0.03);
    }

    if (token.defeated) {
      context.strokeStyle = '#f2d5d5';
      context.lineWidth = Math.max(2, scale * 0.05);
      context.beginPath();
      context.moveTo(centerX - radius * 0.55, centerY - radius * 0.55);
      context.lineTo(centerX + radius * 0.55, centerY + radius * 0.55);
      context.moveTo(centerX + radius * 0.55, centerY - radius * 0.55);
      context.lineTo(centerX - radius * 0.55, centerY + radius * 0.55);
      context.stroke();
    }

    context.restore();
  }
}

function drawLighting(
  context: CanvasRenderingContext2D,
  state: DrawState,
  cellScreenX: (x: number) => number,
  cellScreenY: (y: number) => number,
): void {
  const { viewport } = state;
  const scale = state.camera.scale;

  // Warm pool of light around whoever is acting, then a global vignette. This
  // is atmosphere only: it never hides information, since nothing is fully
  // occluded and there is no line-of-sight system behind it.
  const activeToken = state.tokens.find((token) => token.isCurrentTurn);

  if (activeToken) {
    const centerX =
      cellScreenX(activeToken.position.x) +
      (activeToken.footprint.width * scale) / 2;
    const centerY =
      cellScreenY(activeToken.position.y) +
      (activeToken.footprint.height * scale) / 2;
    const flicker = 1 + Math.sin(state.timestamp * 0.005) * 0.03;
    const lightRadius = scale * 5.5 * flicker;
    const glow = context.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      lightRadius,
    );

    glow.addColorStop(0, 'rgba(255, 196, 110, 0.16)');
    glow.addColorStop(0.55, 'rgba(255, 160, 70, 0.06)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');

    context.fillStyle = glow;
    context.fillRect(0, 0, viewport.width, viewport.height);
  }

  const vignette = context.createRadialGradient(
    viewport.width / 2,
    viewport.height / 2,
    Math.min(viewport.width, viewport.height) * 0.35,
    viewport.width / 2,
    viewport.height / 2,
    Math.max(viewport.width, viewport.height) * 0.75,
  );

  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, viewport.width, viewport.height);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const limit = Math.min(radius, width / 2, height / 2);

  context.moveTo(x + limit, y);
  context.lineTo(x + width - limit, y);
  context.quadraticCurveTo(x + width, y, x + width, y + limit);
  context.lineTo(x + width, y + height - limit);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - limit,
    y + height,
  );
  context.lineTo(x + limit, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - limit);
  context.lineTo(x, y + limit);
  context.quadraticCurveTo(x, y, x + limit, y);
}
