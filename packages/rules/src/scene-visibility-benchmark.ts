/**
 * A deterministic 100x100 visibility workload, and the timing harness for it.
 *
 * Separate from the test that runs it so the fixture is one thing and the
 * measurement is another: the fixture is also useful on its own for reasoning
 * about what the engine is being asked to do.
 *
 * The fixture is built from a seeded integer generator rather than
 * `Math.random`, so the same map, the same observers and the same lights come
 * out on every machine and every run. A benchmark whose input drifts measures
 * the input.
 */
import type { Scene, SceneEntity, SceneTerrainTile } from '@dnd/shared';

import { encodeSceneTerrain } from './scene-terrain.js';
import { computeSceneIllumination } from './scene-illumination.js';
import {
  countMarkedCells,
  computeScenePerception,
} from './scene-perception.js';
import { computeVisibleCells } from './scene-visibility-geometry.js';
import {
  buildObserverCells,
  buildSceneVisibilityIndex,
  type SceneVisibilityIndex,
} from './scene-visibility-index.js';
import { projectSceneViewForObservers } from './scene-view-projection.js';
import type { OccupancyShape } from './occupancy.js';

export const BENCHMARK_GRID_SIZE = 100;

/**
 * A linear congruential generator, so the fixture is identical everywhere.
 * Values are only ever used to place scenery, never to decide visibility.
 */
function createSeededSource(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state;
  };
}

export type BenchmarkFixture = {
  scene: Scene;
  /** Four observers, spread so their line of sight barely overlaps. */
  observers: OccupancyShape[];
};

/**
 * A 100x100 map with rooms, corridors, pillars, scattered tokens and torches.
 *
 * Deliberately not an open field: an empty map is the *cheap* case for a
 * supercover, because every ray runs to the grid edge but nothing branches, and
 * it is also the case where the projected payload compresses to almost nothing.
 * The walls here are what make the run counts and the ray terminations
 * realistic.
 */
export function buildBenchmarkFixture(): BenchmarkFixture {
  const size = BENCHMARK_GRID_SIZE;
  const grid = { cellSizeFeet: 5, width: size, height: size };
  const tiles: SceneTerrainTile[] = Array.from(
    { length: size * size },
    () => 'stone',
  );
  const nextValue = createSeededSource(20260802);

  const paint = (x: number, y: number, tile: SceneTerrainTile): void => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      tiles[y * size + x] = tile;
    }
  };

  // A grid of rooms with doorways, so most rays terminate on a wall instead of
  // running to the map edge.
  for (let wall = 20; wall < size; wall += 20) {
    for (let along = 0; along < size; along += 1) {
      const isDoorway = along % 20 >= 8 && along % 20 <= 11;

      if (!isDoorway) {
        paint(wall, along, 'wall');
        paint(along, wall, 'wall_brick');
      }
    }
  }

  // Free-standing pillars, which are the corner-policy workload.
  for (let index = 0; index < 120; index += 1) {
    paint(nextValue() % size, nextValue() % size, 'wall');
  }

  // Open ground variety, so terrain runs break and the projected payload has to
  // encode more than one tile value.
  for (let index = 0; index < 900; index += 1) {
    paint(nextValue() % size, nextValue() % size, 'flagstone');
  }

  const entities: SceneEntity[] = [];

  const buildEntity = (
    id: string,
    overrides: Partial<SceneEntity>,
  ): SceneEntity => ({
    id,
    type: 'object',
    name: id,
    position: { x: 0, y: 0 },
    footprint: { width: 1, height: 1 },
    blocksMovement: false,
    blocksVision: false,
    hidden: false,
    combatant: null,
    transition: null,
    meta: {},
    ...overrides,
  });

  // Entity blockers: crates and screens that are not terrain.
  for (let index = 0; index < 24; index += 1) {
    entities.push(
      buildEntity(`scene_entity_blocker_${index}`, {
        position: { x: nextValue() % size, y: nextValue() % size },
        footprint: { width: 2, height: 1 },
        blocksMovement: true,
        blocksVision: true,
        name: `Screen ${index}`,
      }),
    );
  }

  // 56 tokens on top of the 24 blockers takes the entity count past the 50 the
  // benchmark is required to carry. A quarter are concealed, so the projector
  // does concealment work as well as visibility work.
  for (let index = 0; index < 56; index += 1) {
    entities.push(
      buildEntity(`scene_entity_token_${index}`, {
        type: 'monster',
        name: `Creature ${index}`,
        position: { x: nextValue() % size, y: nextValue() % size },
        blocksMovement: true,
        hidden: index % 4 === 0,
        combatant: {
          kind: 'monster',
          hp: { max: 30, current: 20, temp: 0 },
          armorClass: 14,
          speed: 30,
          abilities: { str: 14, dex: 12, con: 13, int: 8, wis: 10, cha: 8 },
        },
      }),
    );
  }

  // Six torches, so the map has bright, dim and dark regions at once. Ambient is
  // dark, which is the expensive lighting case: every lit cell has to be earned
  // by a source rather than filled in by the ambient pass.
  for (let index = 0; index < 6; index += 1) {
    entities.push(
      buildEntity(`scene_entity_torch_${index}`, {
        name: `Torch ${index}`,
        position: { x: 10 + index * 15, y: 10 + (index % 3) * 30 },
        lightSource: { enabled: true, brightRadius: 4, dimRadius: 9 },
      }),
    );
  }

  return {
    scene: {
      id: 'scene_benchmark',
      sessionId: 'session_benchmark',
      name: 'Benchmark Warren',
      grid,
      terrain: encodeSceneTerrain(tiles),
      ambientLight: 'dark',
      entities,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    observers: [
      { position: { x: 5, y: 5 }, footprint: { width: 1, height: 1 } },
      { position: { x: 95, y: 5 }, footprint: { width: 1, height: 1 } },
      { position: { x: 5, y: 95 }, footprint: { width: 1, height: 1 } },
      { position: { x: 50, y: 50 }, footprint: { width: 2, height: 2 } },
    ],
  };
}

export type PhaseTimings = {
  indexing: number[];
  lineOfSight: number[];
  illumination: number[];
  projection: number[];
  total: number[];
};

export type BenchmarkResult = {
  timings: PhaseTimings;
  visibleCellCount: number;
  perceivedCellCount: number;
  projectedRunCount: number;
  projectedEntityCount: number;
  projectedPayloadBytes: number;
};

/**
 * Time each phase separately, over one shared fixture.
 *
 * Every phase keeps its result in `sink` and the caller reads it afterwards, so
 * an optimiser cannot decide the work is dead and delete it. That is not
 * theoretical: a benchmark whose output nothing observes is a benchmark of an
 * empty loop.
 */
export function runVisibilityBenchmark(params: {
  iterations: number;
  warmupIterations: number;
}): BenchmarkResult {
  const fixture = buildBenchmarkFixture();
  const timings: PhaseTimings = {
    indexing: [],
    lineOfSight: [],
    illumination: [],
    projection: [],
    total: [],
  };

  let sink = 0;
  let lastIndex: SceneVisibilityIndex | null = null;
  let lastVisible: Uint8Array | null = null;
  let lastPerceivedCount = 0;
  let lastPayload = '';
  let lastRunCount = 0;
  let lastEntityCount = 0;

  const iterate = (record: boolean): void => {
    // The real pipeline, and the only thing `total` covers: index the scene
    // once, then project it. The phase probes below re-do individual steps to
    // attribute cost, and are deliberately outside this window - `projection`
    // already contains a line-of-sight pass and an illumination pass, so adding
    // the standalone probes into the total would count that work twice and
    // report a recomputation as roughly double its real cost.
    const startedAt = performance.now();
    const index = buildSceneVisibilityIndex(fixture.scene);
    const indexEndedAt = performance.now();
    const view = projectSceneViewForObservers({
      scene: fixture.scene,
      observers: fixture.observers,
      projectedAt: '2026-08-02T12:00:00.000Z',
      index,
    });
    const endedAt = performance.now();

    // Attribution probes, on the index the pipeline just built.
    const lineOfSightStartedAt = performance.now();
    const visible = computeVisibleCells(
      index.blockers,
      buildObserverCells(index.blockers, fixture.observers),
      null,
    );
    const lineOfSightEndedAt = performance.now();

    const illuminationStartedAt = performance.now();
    const illumination = computeSceneIllumination(index);
    const illuminationEndedAt = performance.now();

    // Observed so none of the above can be optimised away.
    sink += visible.length + illumination.length + view.cells.length;

    if (!record) {
      return;
    }

    timings.indexing.push(indexEndedAt - startedAt);
    timings.lineOfSight.push(lineOfSightEndedAt - lineOfSightStartedAt);
    timings.illumination.push(illuminationEndedAt - illuminationStartedAt);
    timings.projection.push(endedAt - indexEndedAt);
    timings.total.push(endedAt - startedAt);

    lastIndex = index;
    lastVisible = visible;
    lastPerceivedCount = countMarkedCells(
      computeScenePerception(index, fixture.observers).perceived,
    );
    lastPayload = JSON.stringify(view);
    lastRunCount = view.cells.length;
    lastEntityCount = view.entities.length;
  };

  for (let index = 0; index < params.warmupIterations; index += 1) {
    iterate(false);
  }

  for (let index = 0; index < params.iterations; index += 1) {
    iterate(true);
  }

  if (sink === 0 || !lastIndex || !lastVisible) {
    throw new Error('The benchmark produced no observable work.');
  }

  return {
    timings,
    visibleCellCount: countMarkedCells(lastVisible),
    perceivedCellCount: lastPerceivedCount,
    projectedRunCount: lastRunCount,
    projectedEntityCount: lastEntityCount,
    projectedPayloadBytes: Buffer.byteLength(lastPayload, 'utf8'),
  };
}

export type PhaseSummary = {
  median: number;
  p95: number;
  maximum: number;
};

export function summarizePhase(samples: number[]): PhaseSummary {
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number): number =>
    sorted[
      Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))
    ]!;

  return {
    median: at(0.5),
    p95: at(0.95),
    maximum: sorted[sorted.length - 1]!,
  };
}
