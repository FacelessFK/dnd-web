import assert from 'node:assert/strict';
import { cpus } from 'node:os';
import test from 'node:test';

import {
  BENCHMARK_GRID_SIZE,
  buildBenchmarkFixture,
  runVisibilityBenchmark,
  summarizePhase,
} from './scene-visibility-benchmark.js';
import { buildSceneVisibilityIndex } from './scene-visibility-index.js';

const ITERATIONS = 30;
const WARMUP_ITERATIONS = 5;

/**
 * A catastrophic-regression ceiling, not a frame budget.
 *
 * The recorded baseline on the development machine is far below this. The
 * ceiling is deliberately generous because CI hardware and a developer's laptop
 * are not the same machine and this number has to hold on both; it exists to
 * catch an accidental quadratic, not to police milliseconds.
 *
 * ROADMAP M3's final wave makes the frame-budget claim, on measured p95 from
 * the headed acceptance machine. Nothing here claims it.
 */
const CATASTROPHIC_REGRESSION_CEILING_MS = 2000;

test('the benchmark fixture is the workload it claims to be', () => {
  const fixture = buildBenchmarkFixture();
  const index = buildSceneVisibilityIndex(fixture.scene);

  assert.equal(fixture.scene.grid.width, BENCHMARK_GRID_SIZE);
  assert.equal(fixture.scene.grid.height, BENCHMARK_GRID_SIZE);
  assert.equal(fixture.scene.ambientLight, 'dark');
  assert.ok(
    fixture.observers.length >= 4,
    'at least four observers, per the M3 benchmark requirements',
  );
  assert.ok(
    fixture.scene.entities.length >= 50,
    `at least 50 entities, found ${fixture.scene.entities.length}`,
  );
  assert.ok(
    index.lightSources.length >= 4,
    'several light sources, so bright, dim and dark regions coexist',
  );

  const blockerCount = index.blockers.blocked.reduce(
    (total, value) => total + value,
    0,
  );

  assert.ok(
    blockerCount > 500,
    `terrain and entity blockers must be non-trivial, found ${blockerCount}`,
  );
});

test('the same fixture is produced on every run', () => {
  assert.deepEqual(
    JSON.stringify(buildBenchmarkFixture()),
    JSON.stringify(buildBenchmarkFixture()),
  );
});

test('a 100x100 recomputation stays far below the catastrophic ceiling', () => {
  const result = runVisibilityBenchmark({
    iterations: ITERATIONS,
    warmupIterations: WARMUP_ITERATIONS,
  });

  const phases = {
    indexing: summarizePhase(result.timings.indexing),
    lineOfSight: summarizePhase(result.timings.lineOfSight),
    illumination: summarizePhase(result.timings.illumination),
    projection: summarizePhase(result.timings.projection),
    total: summarizePhase(result.timings.total),
  };

  // Printed rather than asserted on: these are the recorded baseline, and the
  // machine that produced them is part of the record.
  console.log(
    [
      '',
      '=== M3 visibility benchmark (100x100) ===',
      `node: ${process.version}`,
      `cpu: ${cpus()[0]?.model ?? 'unknown'} x${cpus().length}`,
      `iterations: ${ITERATIONS} (after ${WARMUP_ITERATIONS} warm-up)`,
      'total = indexing + projection, the whole recomputation.',
      'lineOfSight and illumination are attribution probes and are already',
      'inside projection, so they do not sum into total.',
      ...Object.entries(phases).map(
        ([name, summary]) =>
          `${name.padEnd(13)} median ${summary.median.toFixed(3)} ms  p95 ${summary.p95.toFixed(3)} ms  max ${summary.maximum.toFixed(3)} ms`,
      ),
      `visible cells (line of sight): ${result.visibleCellCount}`,
      `perceived cells (lit and seen): ${result.perceivedCellCount}`,
      `projected runs: ${result.projectedRunCount}`,
      `projected entities: ${result.projectedEntityCount}`,
      `projected payload: ${result.projectedPayloadBytes} bytes`,
      '',
    ].join('\n'),
  );

  assert.ok(
    phases.total.maximum < CATASTROPHIC_REGRESSION_CEILING_MS,
    `a full recomputation took ${phases.total.maximum.toFixed(1)} ms, over the ${CATASTROPHIC_REGRESSION_CEILING_MS} ms catastrophic-regression ceiling`,
  );
});

test('the benchmark measures real work rather than an empty loop', () => {
  const result = runVisibilityBenchmark({
    iterations: 3,
    warmupIterations: 1,
  });

  // Every one of these would be zero if the work had been optimised away, and
  // each is a different part of the pipeline.
  assert.ok(result.visibleCellCount > 0, 'line of sight resolved nothing');
  assert.ok(result.perceivedCellCount > 0, 'nothing was both lit and seen');
  assert.ok(result.projectedRunCount > 0, 'the projection emitted no cells');
  assert.ok(result.projectedPayloadBytes > 0, 'the payload was empty');

  // Dark ambient with six bounded torches: most of what the observers can see
  // is unlit, so perception must be a strict subset of line of sight. If these
  // were equal, illumination would not be filtering anything.
  assert.ok(
    result.perceivedCellCount < result.visibleCellCount,
    'darkness withheld nothing, so the lighting pass did no work',
  );
});
