'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import { decodeSceneTerrain } from '@dnd/rules';
import { sceneTerrainTileSchema } from '@dnd/protocol';
import type {
  SceneEntityType,
  SceneTerrainTile,
  ScenePosition,
} from '@dnd/protocol';

import { LanguageSwitcher, useI18n, type MessageKey } from '../../lib/i18n';
import { sendSceneCommand } from '../../lib/runtime-api';
import { cockpitStorageKey } from '../../lib/runtime-cockpit-helpers';
import { buildTrainingRoomLayout } from '../../lib/scene-terrain-presets';
import {
  createCellProjection,
  drawMapFrame,
  drawTerrainLayers,
} from '../../lib/tactical-map-draw';
import {
  createFitCamera,
  getCameraAfterPan,
  getCameraAfterZoom,
  getTileStyle,
  screenToCell,
  type MapCamera,
  type ViewportSize,
} from '../../lib/tactical-map-render';
import {
  addEntity,
  canRedo,
  canUndo,
  clampDimension,
  commit,
  createEmptyDocument,
  createInitialState,
  findEntityAt,
  getBrushCells,
  getFloodFillCells,
  getLineCells,
  getRectangleCells,
  mapBuilderTools,
  paintCells,
  parseDocument,
  redo,
  removeEntityAt,
  resizeDocument,
  serializeDocument,
  undo,
  type MapBuilderDocument,
  type MapBuilderEntity,
  type MapBuilderTool,
} from '../../lib/map-builder-state';

const builderStorageKey = 'dnd-web.map-builder';

const paintableTiles = sceneTerrainTileSchema.options;

const tileLabelKeys = {
  chasm: 'maps.tile.chasm',
  deep_water: 'maps.tile.deep_water',
  dirt: 'maps.tile.dirt',
  flagstone: 'maps.tile.flagstone',
  grass: 'maps.tile.grass',
  ice: 'maps.tile.ice',
  lava: 'maps.tile.lava',
  rubble: 'maps.tile.rubble',
  sand: 'maps.tile.sand',
  stone: 'maps.tile.stone',
  void: 'maps.tile.void',
  wall: 'maps.tile.wall',
  wall_brick: 'maps.tile.wall_brick',
  water: 'maps.tile.water',
  wood: 'maps.tile.wood',
} as const satisfies Record<SceneTerrainTile, MessageKey>;

const toolLabelKeys = {
  brush: 'maps.tool.brush',
  entity: 'maps.tool.entity',
  eraser: 'maps.tool.eraser',
  fill: 'maps.tool.fill',
  line: 'maps.tool.line',
  rectangle: 'maps.tool.rectangle',
  select: 'maps.tool.select',
} as const satisfies Record<MapBuilderTool, MessageKey>;

const entityPresets: Array<{
  blocksMovement: boolean;
  blocksVision: boolean;
  id: string;
  labelKey: MessageKey;
  type: SceneEntityType;
}> = [
  {
    blocksMovement: true,
    blocksVision: true,
    id: 'pillar',
    labelKey: 'maps.entity.pillar',
    type: 'object',
  },
  {
    blocksMovement: true,
    blocksVision: false,
    id: 'crate',
    labelKey: 'maps.entity.crate',
    type: 'object',
  },
  {
    blocksMovement: false,
    blocksVision: false,
    id: 'decor',
    labelKey: 'maps.entity.decor',
    type: 'terrain',
  },
  {
    blocksMovement: false,
    blocksVision: false,
    id: 'spawn',
    labelKey: 'maps.entity.spawn',
    type: 'player_spawn',
  },
  {
    blocksMovement: true,
    blocksVision: false,
    id: 'monster',
    labelKey: 'maps.entity.monster',
    type: 'monster',
  },
];

const entityFillByType: Record<
  SceneEntityType,
  { fill: string; stroke: string }
> = {
  object: { fill: 'rgba(120, 84, 44, 0.85)', stroke: '#c9975a' },
  terrain: { fill: 'rgba(56, 92, 56, 0.8)', stroke: '#7fbe72' },
  player_spawn: { fill: 'rgba(38, 92, 128, 0.75)', stroke: '#6cc4f5' },
  monster: { fill: 'rgba(122, 31, 31, 0.85)', stroke: '#ff9b86' },
};

type PublishState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'done'; sceneId: string }
  | { status: 'error'; message: string };

export function MapBuilder() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [state, setState] = useState(() => createInitialState());
  const [tool, setTool] = useState<MapBuilderTool>('brush');
  const [tile, setTile] = useState<SceneTerrainTile>('flagstone');
  const [brushSize, setBrushSize] = useState(1);
  const [outlineOnly, setOutlineOnly] = useState(false);
  const [entityPresetId, setEntityPresetId] = useState(entityPresets[0]!.id);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>({
    height: 0,
    width: 0,
  });
  const [camera, setCamera] = useState<MapCamera | null>(null);
  const [hoveredCell, setHoveredCell] = useState<ScenePosition | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    from: ScenePosition;
    to: ScenePosition;
  } | null>(null);
  const [publishState, setPublishState] = useState<PublishState>({
    status: 'idle',
  });
  const [hydrated, setHydrated] = useState(false);

  const strokeRef = useRef<{
    kind: 'paint' | 'shape' | 'pan';
    lastCell: ScenePosition | null;
    origin: ScenePosition | null;
    pointerId: number;
    startDocument: MapBuilderDocument;
    lastX: number;
    lastY: number;
  } | null>(null);

  const document_ = state.document;
  const grid = document_.grid;
  const terrainTiles = useMemo(
    () => decodeSceneTerrain(grid, document_.terrain),
    [grid, document_.terrain],
  );
  const selectedEntity = useMemo(
    () =>
      document_.entities.find((entity) => entity.id === selectedEntityId) ??
      null,
    [document_.entities, selectedEntityId],
  );

  // Restore the in-progress map so a refresh does not lose unsaved work.
  useEffect(() => {
    const raw = window.localStorage.getItem(builderStorageKey);
    const restored = raw ? parseDocument(raw) : null;

    if (restored) {
      setState(createInitialState(restored));
    }

    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(
      builderStorageKey,
      serializeDocument(document_),
    );
  }, [document_, hydrated]);

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

  const gridKey = `${grid.width}x${grid.height}`;

  useEffect(() => {
    if (viewport.width === 0 || viewport.height === 0) {
      return;
    }

    // Refit only when the map dimensions or the surface change, so painting
    // never yanks the camera away from the user.
    setCamera(createFitCamera(grid, viewport));
  }, [gridKey, viewport.width, viewport.height]);

  const applyEdit = useCallback(
    (next: MapBuilderDocument) => setState((current) => commit(current, next)),
    [],
  );

  const cellFromEvent = useCallback(
    (event: { clientX: number; clientY: number }): ScenePosition | null => {
      const container = containerRef.current;

      if (!container || !camera) {
        return null;
      }

      const rect = container.getBoundingClientRect();

      return screenToCell(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        camera,
        viewport,
        grid,
      );
    },
    [camera, grid, viewport],
  );

  const paintAt = useCallback(
    (document: MapBuilderDocument, cells: ScenePosition[]) =>
      paintCells(document, cells, tool === 'eraser' ? 'void' : tile),
    [tile, tool],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      container.setPointerCapture(event.pointerId);

      // Middle button and right button always pan, whatever tool is active.
      if (event.button === 1 || event.button === 2) {
        strokeRef.current = {
          kind: 'pan',
          lastCell: null,
          lastX: event.clientX,
          lastY: event.clientY,
          origin: null,
          pointerId: event.pointerId,
          startDocument: document_,
        };
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const cell = cellFromEvent(event);

      if (!cell) {
        return;
      }

      if (tool === 'select') {
        setSelectedEntityId(findEntityAt(document_, cell)?.id ?? null);
        return;
      }

      if (tool === 'entity') {
        const preset = entityPresets.find(
          (candidate) => candidate.id === entityPresetId,
        )!;

        if (event.shiftKey || findEntityAt(document_, cell)) {
          applyEdit(removeEntityAt(document_, cell));
          return;
        }

        applyEdit(
          addEntity(
            document_,
            {
              blocksMovement: preset.blocksMovement,
              blocksVision: preset.blocksVision,
              footprint: { width: 1, height: 1 },
              hidden: false,
              name: t(preset.labelKey),
              position: cell,
              type: preset.type,
            },
            `map_entity_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          ),
        );
        return;
      }

      if (tool === 'fill') {
        applyEdit(paintAt(document_, getFloodFillCells(document_, cell)));
        return;
      }

      if (tool === 'rectangle' || tool === 'line') {
        strokeRef.current = {
          kind: 'shape',
          lastCell: cell,
          lastX: event.clientX,
          lastY: event.clientY,
          origin: cell,
          pointerId: event.pointerId,
          startDocument: document_,
        };
        setDragPreview({ from: cell, to: cell });
        return;
      }

      const painted = paintAt(document_, getBrushCells(cell, brushSize));

      strokeRef.current = {
        kind: 'paint',
        lastCell: cell,
        lastX: event.clientX,
        lastY: event.clientY,
        origin: cell,
        pointerId: event.pointerId,
        startDocument: document_,
      };
      // Painting updates live but only commits one undo step on release, so a
      // drag is a single edit rather than dozens.
      setState((current) => ({ ...current, document: painted }));
    },
    [
      applyEdit,
      brushSize,
      cellFromEvent,
      document_,
      entityPresetId,
      paintAt,
      t,
      tool,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const cell = cellFromEvent(event);

      setHoveredCell(cell);

      const stroke = strokeRef.current;

      if (!stroke || stroke.pointerId !== event.pointerId) {
        return;
      }

      if (stroke.kind === 'pan') {
        const deltaX = event.clientX - stroke.lastX;
        const deltaY = event.clientY - stroke.lastY;

        stroke.lastX = event.clientX;
        stroke.lastY = event.clientY;
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
        return;
      }

      if (!cell) {
        return;
      }

      if (stroke.kind === 'shape' && stroke.origin) {
        setDragPreview({ from: stroke.origin, to: cell });
        return;
      }

      if (stroke.kind === 'paint') {
        const from = stroke.lastCell ?? cell;

        if (from.x === cell.x && from.y === cell.y) {
          return;
        }

        // Interpolating between samples keeps fast drags from leaving gaps.
        const strokeCells = getLineCells(from, cell).flatMap((step) =>
          getBrushCells(step, brushSize),
        );

        stroke.lastCell = cell;
        setState((current) => ({
          ...current,
          document: paintAt(current.document, strokeCells),
        }));
      }
    },
    [brushSize, cellFromEvent, grid, paintAt, viewport],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const stroke = strokeRef.current;

      strokeRef.current = null;
      setDragPreview(null);

      const container = containerRef.current;

      if (container?.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }

      if (!stroke || stroke.pointerId !== event.pointerId) {
        return;
      }

      if (stroke.kind === 'pan') {
        return;
      }

      if (stroke.kind === 'shape' && stroke.origin) {
        const cell = cellFromEvent(event) ?? stroke.origin;
        const cells =
          tool === 'line'
            ? getLineCells(stroke.origin, cell)
            : getRectangleCells(stroke.origin, cell, { outlineOnly });

        setState((current) =>
          commit(
            { ...current, document: stroke.startDocument },
            paintAt(stroke.startDocument, cells),
          ),
        );
        return;
      }

      // Fold the live-painted result into one undoable step.
      setState((current) =>
        commit(
          { ...current, document: stroke.startDocument },
          current.document,
        ),
      );
    },
    [cellFromEvent, outlineOnly, paintAt, tool],
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
          anchor: { x: event.clientX - rect.left, y: event.clientY - rect.top },
          camera,
          delta: -event.deltaY * 0.0015,
          grid,
          viewport,
        }),
      );
    },
    [camera, grid, viewport],
  );

  // Undo/redo shortcuts, scoped to the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'z') {
        event.preventDefault();
        setState((current) => (event.shiftKey ? redo(current) : undo(current)));
        return;
      }

      if (key === 'y') {
        event.preventDefault();
        setState(redo);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Draw loop.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || !camera || viewport.width === 0) {
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

    let frame = 0;

    const render = (timestamp: number) => {
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);
      context.fillStyle = '#050405';
      context.fillRect(0, 0, viewport.width, viewport.height);

      const projection = createCellProjection(camera, viewport);

      drawTerrainLayers(context, {
        camera,
        grid,
        terrainTiles,
        timestamp,
        viewport,
      });

      for (const entity of document_.entities) {
        const palette =
          entityFillByType[entity.type] ?? entityFillByType.object;
        const left =
          projection.cellScreenX(entity.position.x) + camera.scale * 0.12;
        const top =
          projection.cellScreenY(entity.position.y) + camera.scale * 0.12;
        const size = camera.scale * 0.76;

        context.fillStyle = palette.fill;
        context.fillRect(
          left,
          top,
          size * entity.footprint.width,
          size * entity.footprint.height,
        );
        context.strokeStyle =
          entity.id === selectedEntityId ? '#ffd67a' : palette.stroke;
        context.lineWidth = entity.id === selectedEntityId ? 3 : 1.5;
        context.strokeRect(
          left,
          top,
          size * entity.footprint.width,
          size * entity.footprint.height,
        );
      }

      if (dragPreview) {
        const cells =
          tool === 'line'
            ? getLineCells(dragPreview.from, dragPreview.to)
            : getRectangleCells(dragPreview.from, dragPreview.to, {
                outlineOnly,
              });

        context.fillStyle = 'rgba(255, 214, 122, 0.28)';

        for (const cell of cells) {
          context.fillRect(
            projection.cellScreenX(cell.x),
            projection.cellScreenY(cell.y),
            camera.scale,
            camera.scale,
          );
        }
      }

      if (hoveredCell) {
        context.strokeStyle = 'rgba(255, 236, 190, 0.6)';
        context.lineWidth = 2;
        context.strokeRect(
          projection.cellScreenX(hoveredCell.x) + 1,
          projection.cellScreenY(hoveredCell.y) + 1,
          camera.scale - 2,
          camera.scale - 2,
        );
      }

      drawMapFrame(context, { camera, grid }, projection);
      frame = window.requestAnimationFrame(render);
    };

    frame = window.requestAnimationFrame(render);

    return () => window.cancelAnimationFrame(frame);
  }, [
    camera,
    document_.entities,
    dragPreview,
    grid,
    hoveredCell,
    outlineOnly,
    selectedEntityId,
    terrainTiles,
    tool,
    viewport,
  ]);

  const publishToSession = useCallback(async () => {
    setPublishState({ status: 'working' });

    try {
      const raw = window.localStorage.getItem(cockpitStorageKey);
      const stored = raw
        ? (JSON.parse(raw) as {
            dmParticipantId?: string;
            sessionId?: string;
          })
        : null;

      if (!stored?.sessionId || !stored.dmParticipantId) {
        setPublishState({
          message: t('maps.publish.noSession'),
          status: 'error',
        });
        return;
      }

      const commandSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const created = await sendSceneCommand({
        actor: { participantId: stored.dmParticipantId },
        commandId: `map-builder-create-scene-${commandSeed}`,
        payload: {
          scene: {
            grid,
            name: document_.name,
            terrain: document_.terrain,
          },
          sessionId: stored.sessionId,
        },
        type: 'create_scene',
      });

      if (!created.ok) {
        setPublishState({
          message: `${created.error.code}: ${created.error.message}`,
          status: 'error',
        });
        return;
      }

      if (!('scene' in created.response.data)) {
        setPublishState({ message: t('maps.publish.failed'), status: 'error' });
        return;
      }

      const sceneId = created.response.data.scene.id;

      // Entities are placed one command at a time; the scene is already usable
      // if a later prop is rejected, and the error names the entity.
      for (const [index, entity] of document_.entities.entries()) {
        const placed = await sendSceneCommand({
          actor: { participantId: stored.dmParticipantId },
          commandId: `map-builder-place-entity-${commandSeed}-${index}`,
          payload: {
            entity: {
              blocksMovement: entity.blocksMovement,
              blocksVision: entity.blocksVision,
              footprint: entity.footprint,
              hidden: entity.hidden,
              name: entity.name,
              position: entity.position,
              type: entity.type,
            },
            sceneId,
            sessionId: stored.sessionId,
          },
          type: 'place_entity_in_scene',
        });

        if (!placed.ok) {
          setPublishState({
            message: `${entity.name}: ${placed.error.message}`,
            status: 'error',
          });
          return;
        }
      }

      setPublishState({ sceneId, status: 'done' });
    } catch (error) {
      setPublishState({
        message: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
    }
  }, [document_.entities, document_.name, document_.terrain, grid, t]);

  const exportMap = useCallback(() => {
    const blob = new Blob([serializeDocument(document_)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');

    anchor.download = `${document_.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    anchor.href = url;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [document_]);

  const importMap = useCallback(
    async (file: File) => {
      const parsed = parseDocument(await file.text());

      if (parsed) {
        applyEdit(parsed);
      }
    },
    [applyEdit],
  );

  return (
    <main className="flex h-screen flex-col bg-[#0a0806] text-amber-50">
      <header className="flex flex-wrap items-center gap-3 border-b border-amber-500/20 bg-black/50 px-4 py-2.5">
        <Link
          className="rounded-lg border border-amber-500/25 px-2.5 py-1 text-xs font-bold text-amber-200/80 transition hover:border-amber-300 hover:text-amber-100"
          href="/"
        >
          ←
        </Link>
        <h1 className="text-sm font-black uppercase tracking-wider text-amber-200">
          {t('maps.title')}
        </h1>

        <input
          aria-label={t('maps.mapName')}
          className="w-48 rounded-lg border border-amber-500/25 bg-black/40 px-2.5 py-1 text-sm text-amber-50 focus:border-amber-300 focus:outline-none"
          onChange={(event) =>
            applyEdit({ ...document_, name: event.target.value })
          }
          value={document_.name}
        />

        <label className="flex items-center gap-1.5 text-xs text-amber-100/70">
          {t('maps.width')}
          <input
            aria-label={t('maps.width')}
            className="w-16 rounded-lg border border-amber-500/25 bg-black/40 px-2 py-1 text-sm"
            onChange={(event) =>
              applyEdit(
                resizeDocument(document_, {
                  height: grid.height,
                  width: clampDimension(Number(event.target.value)),
                }),
              )
            }
            type="number"
            value={grid.width}
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-amber-100/70">
          {t('maps.height')}
          <input
            aria-label={t('maps.height')}
            className="w-16 rounded-lg border border-amber-500/25 bg-black/40 px-2 py-1 text-sm"
            onChange={(event) =>
              applyEdit(
                resizeDocument(document_, {
                  height: clampDimension(Number(event.target.value)),
                  width: grid.width,
                }),
              )
            }
            type="number"
            value={grid.height}
          />
        </label>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button
            className={toolbarButtonClassName}
            disabled={!canUndo(state)}
            onClick={() => setState(undo)}
            type="button"
          >
            {t('maps.undo')}
          </button>
          <button
            className={toolbarButtonClassName}
            disabled={!canRedo(state)}
            onClick={() => setState(redo)}
            type="button"
          >
            {t('maps.redo')}
          </button>
          <button
            className={toolbarButtonClassName}
            onClick={() => {
              const layout = buildTrainingRoomLayout();

              applyEdit({
                entities: [],
                grid: layout.grid,
                name: t('maps.preset.trainingRoom'),
                terrain: layout.terrain,
              });
            }}
            type="button"
          >
            {t('maps.preset.trainingRoom')}
          </button>
          <button
            className={toolbarButtonClassName}
            onClick={() =>
              applyEdit(
                createEmptyDocument({
                  baseTile: 'flagstone',
                  height: grid.height,
                  name: t('maps.newMap'),
                  width: grid.width,
                }),
              )
            }
            type="button"
          >
            {t('maps.newMap')}
          </button>
          <button
            className={toolbarButtonClassName}
            onClick={exportMap}
            type="button"
          >
            {t('maps.export')}
          </button>
          <button
            className={toolbarButtonClassName}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {t('maps.import')}
          </button>
          <input
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void importMap(file);
              }

              event.target.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="rounded-lg border border-amber-300/60 bg-amber-400 px-3 py-1.5 text-xs font-black text-stone-950 transition hover:bg-amber-300 disabled:opacity-50"
            disabled={publishState.status === 'working'}
            onClick={() => void publishToSession()}
            type="button"
          >
            {t('maps.publish')}
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      {publishState.status !== 'idle' ? (
        <p
          className={`px-4 py-1.5 text-xs ${
            publishState.status === 'error'
              ? 'bg-red-950/60 text-red-200'
              : 'bg-emerald-950/50 text-emerald-200'
          }`}
          role="status"
        >
          {publishState.status === 'working'
            ? t('maps.publish.working')
            : publishState.status === 'done'
              ? t('maps.publish.done', { sceneId: publishState.sceneId })
              : publishState.message}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 overflow-y-auto border-e border-amber-500/20 bg-black/40 p-3">
          <p className={sidebarHeadingClassName}>{t('maps.tools')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {mapBuilderTools.map((candidate) => (
              <button
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                  tool === candidate
                    ? 'border-amber-300 bg-amber-400/20 text-amber-100'
                    : 'border-amber-500/20 bg-black/30 text-amber-100/60 hover:border-amber-400/50'
                }`}
                key={candidate}
                onClick={() => setTool(candidate)}
                type="button"
              >
                {t(toolLabelKeys[candidate])}
              </button>
            ))}
          </div>

          {tool === 'brush' || tool === 'eraser' ? (
            <label className="mt-3 block text-[11px] text-amber-100/70">
              {t('maps.brushSize', { size: String(brushSize) })}
              <input
                className="mt-1 w-full accent-amber-400"
                max={9}
                min={1}
                onChange={(event) => setBrushSize(Number(event.target.value))}
                step={2}
                type="range"
                value={brushSize}
              />
            </label>
          ) : null}

          {tool === 'rectangle' ? (
            <label className="mt-3 flex items-center gap-2 text-[11px] text-amber-100/70">
              <input
                checked={outlineOnly}
                className="accent-amber-400"
                onChange={(event) => setOutlineOnly(event.target.checked)}
                type="checkbox"
              />
              {t('maps.outlineOnly')}
            </label>
          ) : null}

          {tool === 'entity' ? (
            <>
              <p className={sidebarHeadingClassName}>{t('maps.entities')}</p>
              <div className="grid gap-1.5">
                {entityPresets.map((preset) => (
                  <button
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                      entityPresetId === preset.id
                        ? 'border-amber-300 bg-amber-400/20 text-amber-100'
                        : 'border-amber-500/20 bg-black/30 text-amber-100/60 hover:border-amber-400/50'
                    }`}
                    key={preset.id}
                    onClick={() => setEntityPresetId(preset.id)}
                    type="button"
                  >
                    <span
                      className="size-3 rounded-sm"
                      style={{
                        backgroundColor: entityFillByType[preset.type].stroke,
                      }}
                    />
                    {t(preset.labelKey)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-4 text-amber-100/40">
                {t('maps.entityHint')}
              </p>
            </>
          ) : null}

          <p className={sidebarHeadingClassName}>{t('maps.tiles')}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {paintableTiles.map((candidate) => {
              const style = getTileStyle(candidate);

              return (
                <button
                  aria-label={t(tileLabelKeys[candidate])}
                  aria-pressed={tile === candidate}
                  className={`flex h-11 flex-col items-center justify-end rounded-lg border p-1 text-[9px] font-bold transition ${
                    tile === candidate
                      ? 'border-amber-300 text-amber-100'
                      : 'border-amber-500/20 text-amber-100/50 hover:border-amber-400/50'
                  }`}
                  key={candidate}
                  onClick={() => {
                    setTile(candidate);

                    if (
                      tool === 'eraser' ||
                      tool === 'entity' ||
                      tool === 'select'
                    ) {
                      setTool('brush');
                    }
                  }}
                  style={{
                    backgroundImage: `linear-gradient(160deg, ${style.light}, ${style.base} 55%, ${style.shade})`,
                  }}
                  title={t(tileLabelKeys[candidate])}
                  type="button"
                >
                  <span className="w-full truncate rounded bg-black/60 px-0.5 text-center">
                    {t(tileLabelKeys[candidate])}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedEntity ? (
            <EntityInspector
              entity={selectedEntity}
              onChange={(next) =>
                applyEdit({
                  ...document_,
                  entities: document_.entities.map((entity) =>
                    entity.id === next.id ? next : entity,
                  ),
                })
              }
              onRemove={() => {
                applyEdit(removeEntityAt(document_, selectedEntity.position));
                setSelectedEntityId(null);
              }}
              t={t}
            />
          ) : null}
        </aside>

        <div
          className="relative min-w-0 flex-1 touch-none"
          data-map-builder-canvas
          onContextMenu={(event) => event.preventDefault()}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerLeave={() => setHoveredCell(null)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          ref={containerRef}
        >
          <canvas className="block" ref={canvasRef} />

          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-amber-500/20 bg-black/70 px-2.5 py-1 text-[11px] text-amber-100/60 backdrop-blur-sm">
            {hoveredCell
              ? t('maps.cursor', {
                  tile: t(
                    tileLabelKeys[
                      terrainTiles[
                        hoveredCell.y * grid.width + hoveredCell.x
                      ] ?? 'stone'
                    ],
                  ),
                  x: String(hoveredCell.x),
                  y: String(hoveredCell.y),
                })
              : t('maps.hint')}
          </div>
        </div>
      </div>
    </main>
  );
}

const toolbarButtonClassName =
  'rounded-lg border border-amber-500/25 bg-black/40 px-2.5 py-1.5 text-xs font-bold text-amber-100/80 transition hover:border-amber-300 hover:text-amber-50 disabled:opacity-40';

const sidebarHeadingClassName =
  'mb-1.5 mt-4 text-[10px] font-black uppercase tracking-wider text-amber-300/70 first:mt-0';

function EntityInspector({
  entity,
  onChange,
  onRemove,
  t,
}: {
  entity: MapBuilderEntity;
  onChange: (entity: MapBuilderEntity) => void;
  onRemove: () => void;
  t: (key: MessageKey, values?: Record<string, string>) => string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-amber-500/20 bg-black/40 p-2.5">
      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-amber-300/70">
        {t('maps.inspector')}
      </p>
      <input
        aria-label={t('maps.entityName')}
        className="w-full rounded-lg border border-amber-500/25 bg-black/40 px-2 py-1 text-xs"
        onChange={(event) => onChange({ ...entity, name: event.target.value })}
        value={entity.name}
      />
      <label className="mt-2 flex items-center gap-2 text-[11px] text-amber-100/70">
        <input
          checked={entity.blocksMovement}
          className="accent-amber-400"
          onChange={(event) =>
            onChange({ ...entity, blocksMovement: event.target.checked })
          }
          type="checkbox"
        />
        {t('maps.blocksMovement')}
      </label>
      <label className="mt-1 flex items-center gap-2 text-[11px] text-amber-100/70">
        <input
          checked={entity.blocksVision}
          className="accent-amber-400"
          onChange={(event) =>
            onChange({ ...entity, blocksVision: event.target.checked })
          }
          type="checkbox"
        />
        {t('maps.blocksVision')}
      </label>
      <label className="mt-1 flex items-center gap-2 text-[11px] text-amber-100/70">
        <input
          checked={entity.hidden}
          className="accent-amber-400"
          onChange={(event) =>
            onChange({ ...entity, hidden: event.target.checked })
          }
          type="checkbox"
        />
        {t('maps.hidden')}
      </label>
      <button
        className="mt-2 w-full rounded-lg border border-red-400/40 bg-red-950/40 px-2 py-1 text-[11px] font-bold text-red-200 transition hover:border-red-300"
        onClick={onRemove}
        type="button"
      >
        {t('maps.removeEntity')}
      </button>
    </div>
  );
}
