import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  formatSmokeStep,
  formatSmokeWaitFailure,
  getAbsentVisibleTextsExpression,
  getAbsentVisibleTextsOutsideSelectorExpression,
  findMismatchedHarnessServerUrl,
  formatHarnessServerUrlMismatch,
  getChromeDisplayArgs,
  getCockpitModeSelectionExpression,
  getPresentVisibleTextsExpression,
  getSessionInputAssignmentExpression,
  getStoredCockpitSessionIdExpression,
  summarizeCockpitState,
} from '../apps/web/scripts/runtime-smoke-diagnostics.mjs';

const root = process.cwd();

const requiredPaths = [
  'apps/web',
  'apps/server',
  'packages/shared',
  'packages/protocol',
  'packages/rules',
  'packages/db',
  '.env.example',
  'pnpm-workspace.yaml',
  'README.md',
  'PRD.md',
  'ROADMAP.md',
];

for (const relativePath of requiredPaths) {
  test(`exists: ${relativePath}`, () => {
    assert.equal(existsSync(join(root, relativePath)), true);
  });
}

test('root package manager is pnpm', () => {
  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );

  assert.match(packageJson.packageManager, /^pnpm@/);
});

// Node 22 is a hard floor, not a preference: the web test script passes a
// quoted glob to `node --test` so that it resolves identically on Windows and
// Linux, and Node's own glob expansion for the test runner does not exist in
// Node 20. Lowering this makes `pnpm --filter @dnd/web test` fail to find any
// test files at all rather than fail loudly.
test('root node engine targets Node 22 or newer', () => {
  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );

  assert.equal(packageJson.engines?.node, '>=22');
});

test('the pinned .nvmrc version satisfies the declared engine range', () => {
  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );
  const nvmrc = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
  const engineFloor = Number(
    /^>=(\d+)$/.exec(packageJson.engines?.node ?? '')?.[1],
  );

  assert.ok(
    Number.isInteger(engineFloor),
    'engines.node should be a ">=<major>" range',
  );
  assert.match(nvmrc, /^\d+$/);
  // CI installs Node from .nvmrc, so a drift between these two files means CI
  // silently stops testing the version the project claims to support.
  assert.ok(
    Number(nvmrc) >= engineFloor,
    `.nvmrc pins Node ${nvmrc} but engines.node requires >=${engineFloor}`,
  );
});

// CI and the plain `test:smoke*` commands must keep launching Chrome headless.
// Only an explicit RUNTIME_SMOKE_HEADED opt-in may open a real window, so the
// default has to stay pinned by a test rather than by reviewer memory.
test('browser harnesses launch headless unless explicitly opted out', () => {
  // Headless still gets an explicit viewport. Chrome's headless default is
  // 800x600, which is neither the desktop the layout assertions describe nor
  // the phone the mobile ones do - so a harness that said nothing would be
  // asserting against whichever viewport Chrome happened to pick, and the M2
  // shells legitimately render a different layout at each.
  assert.deepEqual(getChromeDisplayArgs({ env: {} }), [
    '--headless=new',
    '--window-size=1600,1000',
  ]);
  assert.deepEqual(
    getChromeDisplayArgs({ env: { RUNTIME_SMOKE_HEADED: '' } }),
    ['--headless=new', '--window-size=1600,1000'],
  );
  assert.deepEqual(
    getChromeDisplayArgs({ env: { RUNTIME_SMOKE_HEADED: '0' } }),
    ['--headless=new', '--window-size=1600,1000'],
  );
  // A requested size is honoured headless; the window *position* still is not,
  // because there is no window to place.
  assert.deepEqual(
    getChromeDisplayArgs({
      env: {},
      windowPosition: { x: 960, y: 0 },
      windowSize: { height: 1040, width: 950 },
    }),
    ['--headless=new', '--window-size=950,1040'],
  );
});

test('an explicit headed opt-in drops headless and places the window', () => {
  for (const raw of ['1', 'true', 'yes', 'YES', ' true ']) {
    assert.deepEqual(
      getChromeDisplayArgs({ env: { RUNTIME_SMOKE_HEADED: raw } }),
      [],
      `RUNTIME_SMOKE_HEADED=${JSON.stringify(raw)} should launch headed`,
    );
  }

  assert.deepEqual(
    getChromeDisplayArgs({
      env: { RUNTIME_SMOKE_HEADED: '1' },
      windowPosition: { x: 960, y: 0 },
      windowSize: { height: 1040, width: 950 },
    }),
    ['--window-size=950,1040', '--window-position=960,0'],
  );
});

test('a display backend is passed only when the run explicitly names one', () => {
  // Chrome chooses its own backend by default. Naming the wrong one does not
  // degrade to a working window - it fails to open one - so this must never be
  // inferred from the machine.
  assert.deepEqual(
    getChromeDisplayArgs({ env: { RUNTIME_SMOKE_HEADED: '1' } }),
    [],
  );
  assert.deepEqual(
    getChromeDisplayArgs({
      env: { RUNTIME_SMOKE_HEADED: '1', RUNTIME_SMOKE_OZONE_PLATFORM: '  ' },
    }),
    [],
  );
  assert.deepEqual(
    getChromeDisplayArgs({
      env: {
        RUNTIME_SMOKE_HEADED: '1',
        RUNTIME_SMOKE_OZONE_PLATFORM: 'wayland',
      },
      windowSize: { height: 1040, width: 950 },
    }),
    ['--ozone-platform=wayland', '--window-size=950,1040'],
  );
  // A headless run ignores the backend: there is no window to place on one.
  // It still carries the explicit viewport.
  assert.deepEqual(
    getChromeDisplayArgs({
      env: { RUNTIME_SMOKE_OZONE_PLATFORM: 'wayland' },
    }),
    ['--headless=new', '--window-size=1600,1000'],
  );
});

// Next inlines NEXT_PUBLIC_SERVER_URL into the client chunks, and every harness
// compiles into the same apps/web/.next. A second `next dev` on this working
// tree - a leftover from a killed run, a developer's `pnpm dev`, or a second
// harness - recompiles those chunks against ITS server URL, so the harness's
// browser posts commands to a port owned by a different (or dead) server. That
// surfaced as "Failed to fetch" and a wait timing out on state that was never
// coming. The harness must name that mis-wiring instead of flaking on it.
test('a harness detects a web UI wired to a different server', () => {
  const expected = 'http://127.0.0.1:47311';

  assert.equal(
    findMismatchedHarnessServerUrl(`<div>Server ${expected}</div>`, expected),
    null,
    'the run’s own server URL is not a mismatch',
  );

  assert.equal(
    findMismatchedHarnessServerUrl(
      '<div>Server http://127.0.0.1:35513</div>',
      expected,
    ),
    'http://127.0.0.1:35513',
    'a foreign server URL is reported',
  );

  // A page that renders no origin at all cannot contradict the expectation, and
  // must not fail the run.
  assert.equal(
    findMismatchedHarnessServerUrl('<div>loading</div>', expected),
    null,
  );

  // The expected URL being present wins even when other origins also appear.
  assert.equal(
    findMismatchedHarnessServerUrl(
      `<div>${expected}</div><div>http://127.0.0.1:1234</div>`,
      expected,
    ),
    null,
  );
});

test('the harness server mismatch message names both servers', () => {
  const message = formatHarnessServerUrlMismatch(
    'http://127.0.0.1:47311',
    'http://127.0.0.1:35513',
  );

  assert.match(message, /127\.0\.0\.1:47311/);
  assert.match(message, /127\.0\.0\.1:35513/);
  assert.match(message, /NEXT_PUBLIC_SERVER_URL/);
});

// The observed flake: the cockpit re-reads its persisted state in a mount
// effect, so a Next dev on-demand compile that remounts the page mid-run
// replays the stored mode over the harness's click. The run then died far
// later, waiting for a "Join Session" button that only renders in player mode.
// The selection expression must therefore report success only from stored
// state, and must re-click whenever that state disagrees.
test('cockpit mode selection is confirmed against stored state', () => {
  const expression = getCockpitModeSelectionExpression(
    'dnd-runtime-cockpit',
    ['Player Mode', 'حالت بازیکن'],
    'player',
  );

  // Success is read from the persisted mode, never from the click landing.
  assert.match(expression, /localStorage\.getItem\("dnd-runtime-cockpit"\)/);
  assert.match(expression, /\.mode === "player"/);
  // It re-clicks rather than giving up, which is what survives a remount.
  assert.match(expression, /button\.click\(\)/);
  // Both locales reach the same control.
  assert.match(expression, /Player Mode/);
  assert.match(expression, /حالت بازیکن/);
});

test('cockpit mode selection re-clicks when storage disagrees', () => {
  const expression = getCockpitModeSelectionExpression(
    'dnd-runtime-cockpit',
    ['DM Mode'],
    'dm',
  );
  const clicked = [];
  const evaluate = (storedMode) =>
    new Function('localStorage', 'document', `return ${expression};`)(
      {
        getItem: () =>
          storedMode === undefined
            ? null
            : JSON.stringify({ mode: storedMode }),
      },
      {
        querySelectorAll: () => [
          {
            click: () => clicked.push(storedMode ?? 'none'),
            disabled: false,
            offsetParent: {},
            textContent: 'DM Mode',
          },
        ],
      },
    );

  assert.equal(evaluate('dm'), true, 'already in the requested mode');
  assert.deepEqual(clicked, [], 'no redundant click when storage agrees');

  assert.equal(evaluate('player'), false, 'reverted mode is not success');
  assert.equal(evaluate(undefined), false, 'absent state is not success');
  assert.deepEqual(
    clicked,
    ['player', 'none'],
    're-clicks whenever stored mode disagrees',
  );
});

test('runtime smoke diagnostics summarize the active cockpit state', () => {
  const summary = summarizeCockpitState(
    JSON.stringify({
      roleMode: 'player',
      sceneId: 'scene-123',
      selectedParticipantId: 'player-001',
      sessionId: 'session-123',
    }),
  );

  assert.equal(
    summary,
    'sessionId=session-123, sceneId=scene-123, roleMode=player, selectedParticipantId=player-001',
  );
});

test('runtime smoke diagnostics format failed waits with actionable context', () => {
  assert.equal(
    formatSmokeStep({
      index: 3,
      label: 'validating recovery after reload',
      total: 7,
    }),
    '[runtime-smoke] 3/7 validating recovery after reload',
  );

  const message = formatSmokeWaitFailure({
    diagnostics: {
      cockpitState: 'sessionId=session-123, sceneId=scene-123',
      enabledButtons: ['Recover', 'Player Mode'],
      url: 'http://127.0.0.1:3000/runtime',
      visibleText: 'Runtime War Table\nRecovery status',
    },
    label: 'recovery status summary',
    lastErrorMessage: 'document is not ready',
  });

  assert.match(message, /Timed out waiting for recovery status summary\./);
  assert.match(message, /Last evaluation error: document is not ready/);
  assert.match(message, /Current URL: http:\/\/127\.0\.0\.1:3000\/runtime/);
  assert.match(
    message,
    /Cockpit state: sessionId=session-123, sceneId=scene-123/,
  );
  assert.match(message, /Enabled buttons: Recover, Player Mode/);
  assert.match(
    message,
    /Visible page text:\nRuntime War Table\nRecovery status/,
  );
});

test('runtime smoke diagnostics can assert stale visible text is gone', () => {
  const expression = getAbsentVisibleTextsExpression(['Training Room', 'Aria']);
  const evaluate = Function('document', `return ${expression};`);

  assert.equal(evaluate({ body: { innerText: 'Runtime War Table' } }), true);
  assert.equal(
    evaluate({ body: { innerText: 'Runtime War Table\nTraining Room' } }),
    false,
  );
});

test('runtime smoke diagnostics can ignore static demo scenario text', () => {
  const expression = getAbsentVisibleTextsOutsideSelectorExpression(
    ['Training Room', 'Aria'],
    '[data-runtime-demo-scenario]',
  );
  const evaluate = Function('document', 'NodeFilter', `return ${expression};`);
  const nodeFilter = {
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2,
    SHOW_TEXT: 4,
  };
  const visibleElement = {
    closest: () => null,
    getClientRects: () => [true],
  };
  const ignoredElement = {
    closest: (selector) =>
      selector === '[data-runtime-demo-scenario]' ? true : null,
    getClientRects: () => [true],
  };
  const nodes = [
    {
      nodeValue: 'Runtime War Table',
      parentElement: visibleElement,
    },
    {
      nodeValue: 'Training Room\nAria',
      parentElement: ignoredElement,
    },
  ];

  assert.equal(
    evaluate(
      {
        createTreeWalker: (_body, _showText, filter) => {
          const acceptedNodes = nodes.filter(
            (node) => filter.acceptNode(node) === nodeFilter.FILTER_ACCEPT,
          );

          return {
            nextNode: () => acceptedNodes.shift() ?? null,
          };
        },
        body: {
          nodeType: 1,
        },
      },
      nodeFilter,
    ),
    true,
  );
});

test('runtime smoke diagnostics can assert required visible text is present', () => {
  const expression = getPresentVisibleTextsExpression([
    'Training Room',
    'Recovery status',
  ]);
  const evaluate = Function('document', `return ${expression};`);

  assert.equal(
    evaluate({
      body: { innerText: 'Runtime War Table\nTraining Room\nRecovery status' },
    }),
    true,
  );
  assert.equal(
    evaluate({ body: { innerText: 'Runtime War Table\nTraining Room' } }),
    false,
  );
});

test('runtime smoke diagnostics read and restore the recover session input', () => {
  const storedSessionIdExpression = getStoredCockpitSessionIdExpression(
    'dnd-runtime-cockpit',
  );
  const evaluateStoredSessionId = Function(
    'localStorage',
    `return ${storedSessionIdExpression};`,
  );

  assert.equal(
    evaluateStoredSessionId({
      getItem: () => JSON.stringify({ sessionId: 'session-restore-123' }),
    }),
    'session-restore-123',
  );

  const dispatchedEvents = [];
  const input = {
    dispatchEvent: (event) => {
      dispatchedEvents.push(event.type);
    },
    getAttribute: (name) =>
      name === 'placeholder' ? 'Paste an existing session ID to recover' : '',
    value: '',
  };
  const assignmentExpression = getSessionInputAssignmentExpression(
    'session-restore-123',
  );
  const evaluateAssignment = Function(
    'document',
    'Event',
    `return ${assignmentExpression};`,
  );

  assert.equal(
    evaluateAssignment(
      {
        querySelectorAll: () => [input],
      },
      class TestEvent {
        constructor(type) {
          this.type = type;
        }
      },
    ),
    true,
  );
  assert.equal(input.value, 'session-restore-123');
  assert.deepEqual(dispatchedEvents, ['input', 'change']);
});
// --- M2 Game HUD shape ------------------------------------------------------

/**
 * Every React component file stays under this.
 *
 * The number is the M2 acceptance rule, and the rule exists because of what it
 * is measured against: `runtime-cockpit.tsx` reached ~9,000 lines and became
 * the largest known defect in the repository. A component that large cannot be
 * reviewed, cannot be tested except through a browser, and hides duplicated
 * server state inside itself.
 *
 * Enforced here rather than in a linter because it is a product decision about
 * this repository's history, not a style preference.
 */
const componentLineLimit = 500;

/**
 * The surface M2 owns, and therefore the surface the limit is unconditional on.
 *
 * Everything under `app/runtime/` is a Game HUD shell, a runtime panel, the
 * composition root, or diagnostics - except the renderer component, which is
 * listed as an exemption below with its own milestone. Membership is decided by
 * path because that is what "M2 owns this file" actually means here: the
 * milestone rebuilt that directory.
 */
const m2OwnedPrefixes = ['apps/web/app/runtime/'];

/** Milestones that may own an exemption. An unknown owner is a failure. */
const owningMilestones = new Set(['M4', 'M5', 'M6']);

/**
 * Components that were already over the limit when the rule landed.
 *
 * Not technical debt in general: each is a bounded, named, temporary obligation
 * with an owning milestone that will decompose it. The record is deliberately
 * verbose - a path alone would let the next oversized file in without anyone
 * having to say who owns it or why it is not M2's problem.
 *
 * `maxLines` pins the file against growth. `allowedInPlayerGraph` and
 * `allowedInGameMasterGraph` are asserted in *both* directions, so a stale
 * entry fails as loudly as a violated one: claiming a file is unreachable when
 * it is reachable is a boundary breach, and claiming it is reachable when it is
 * not is configuration nobody re-checked.
 */
const legacyOversizedComponents = [
  {
    allowedInGameMasterGraph: false,
    allowedInPlayerGraph: false,
    maxLines: 1211,
    owner: 'M5',
    path: 'apps/web/app/maps/map-builder.tsx',
    reason:
      'The /maps builder route. Reachable only from app/maps/page.tsx and from no runtime shell; ROADMAP M5 completes the map builder.',
  },
  {
    // The one exemption that *is* in the runtime graph, and the only one that
    // may be. It is the renderer component behind the RuntimeMapStage seam -
    // camera maths and canvas art already live in lib/tactical-map-render.ts
    // and lib/tactical-map-draw.ts, and this owns pointers and React state.
    // ROADMAP M4 may swap the drawing layer behind that seam, which is the
    // whole reason M2 was told not to replace the renderer.
    allowedInGameMasterGraph: true,
    allowedInPlayerGraph: true,
    maxLines: 1097,
    owner: 'M4',
    path: 'apps/web/app/runtime/tactical-map.tsx',
    reason:
      'The tactical renderer surface, reached only through runtime-map-stage.tsx. ROADMAP M4 owns renderer quality and may replace the drawing layer behind that seam.',
  },
  {
    allowedInGameMasterGraph: false,
    allowedInPlayerGraph: false,
    maxLines: 818,
    owner: 'M6',
    path: 'apps/web/app/characters/simple-builder/components/sheet/CharacterSheet.tsx',
    reason:
      'The Character Builder review sheet, reachable only from simple-builder/App.tsx. It is not the Player HUD character surface - that is app/runtime/panels/character-summary.tsx - and ROADMAP M6 owns character foundations.',
  },
  {
    allowedInGameMasterGraph: false,
    allowedInPlayerGraph: false,
    maxLines: 688,
    owner: 'M6',
    path: 'apps/web/app/characters/character-builder-ui.tsx',
    reason:
      'The /characters builder routes. Reachable only from those pages; ROADMAP M6 owns character foundations.',
  },
  {
    allowedInGameMasterGraph: false,
    allowedInPlayerGraph: false,
    maxLines: 532,
    owner: 'M6',
    path: 'apps/web/app/characters/simple-builder/components/steps/ClassStep.tsx',
    reason:
      'A Character Builder wizard step, reachable only from simple-builder/App.tsx. ROADMAP M6 owns character foundations.',
  },
];

/**
 * Files the component rule does not describe at all, with the reason for each.
 *
 * `i18n.tsx` is the message catalogue. It is `.tsx` only because it also
 * exports the provider and the language switcher; the length is two locales of
 * translation strings, and splitting them would make the `Messages = typeof
 * messages.en` parity check - the only thing enforcing that every English key
 * has a Persian one - harder to state rather than easier.
 */
const componentLimitExemptions = new Map([
  ['apps/web/lib/i18n.tsx', 'bilingual message catalogue, not a component'],
]);

const shellEntryPoints = {
  gameMaster: 'apps/web/app/runtime/shells/game-master-game-shell.tsx',
  player: 'apps/web/app/runtime/shells/player-game-shell.tsx',
};

/** Directories whose components must never enter a runtime shell's graph. */
const builderSurfacePrefixes = [
  'apps/web/app/characters/',
  'apps/web/app/maps/',
];

function listComponentFiles() {
  const found = [];

  const walkTree = (relativeDirectory) => {
    const absolute = join(root, relativeDirectory);

    for (const item of readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDirectory}/${item.name}`;

      if (item.isDirectory()) {
        if (item.name !== 'node_modules' && item.name !== '.next') {
          walkTree(relative);
        }

        continue;
      }

      if (item.name.endsWith('.tsx') && !item.name.endsWith('.test.tsx')) {
        found.push(relative);
      }
    }
  };

  walkTree('apps/web/app');
  walkTree('apps/web/lib');

  return found.sort();
}

/** Newline-terminated lines, so the number matches what `wc -l` reports. */
function countLines(relativePath) {
  const source = readFileSync(join(root, relativePath), 'utf8');
  const lines = source.split('\n');

  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function isM2Owned(relativePath) {
  return m2OwnedPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function findExemption(relativePath) {
  return legacyOversizedComponents.find((entry) => entry.path === relativePath);
}

/**
 * Every local module reachable from an entry point, with the path that reached
 * it.
 *
 * Walked rather than grepped so a transitive import counts. The failures this
 * guards against - a player reaching diagnostics, a builder component reaching
 * a shell - are exactly the ones that arrive through a third file nobody
 * thought about.
 */
function collectImportGraph(entryPath) {
  const reached = new Map([[entryPath, [entryPath]]]);
  const queue = [entryPath];

  const resolveLocal = (fromPath, specifier) => {
    const base = join(dirname(fromPath), specifier);

    for (const candidate of [
      `${base}.tsx`,
      `${base}.ts`,
      `${base}/index.tsx`,
      `${base}/index.ts`,
    ]) {
      if (existsSync(join(root, candidate))) {
        return candidate;
      }
    }

    return null;
  };

  while (queue.length > 0) {
    const current = queue.shift();
    const source = readFileSync(join(root, current), 'utf8');

    for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
      const next = resolveLocal(current, match[1]);

      if (next && !reached.has(next)) {
        reached.set(next, [...reached.get(current), next]);
        queue.push(next);
      }
    }
  }

  return reached;
}

test('every exemption names an owning milestone and a reason', () => {
  for (const entry of legacyOversizedComponents) {
    assert.ok(
      entry.owner && owningMilestones.has(entry.owner),
      `${entry.path} is exempt but its owner ${JSON.stringify(entry.owner)} is not one of ${[...owningMilestones].join(', ')}. An exemption without a milestone that will remove it is permanent debt.`,
    );
    assert.ok(
      typeof entry.reason === 'string' && entry.reason.length > 40,
      `${entry.path} is exempt without saying why it is outside M2.`,
    );
    assert.equal(
      typeof entry.maxLines,
      'number',
      `${entry.path} is exempt without a pinned size.`,
    );
    assert.equal(
      typeof entry.allowedInPlayerGraph,
      'boolean',
      `${entry.path} must state whether the Player shell may reach it.`,
    );
    assert.equal(
      typeof entry.allowedInGameMasterGraph,
      'boolean',
      `${entry.path} must state whether the GM shell may reach it.`,
    );
  }

  const paths = legacyOversizedComponents.map((entry) => entry.path);

  assert.equal(
    paths.length,
    new Set(paths).size,
    'the exemption list holds a duplicate path',
  );
});

test('no M2-owned component exceeds the line limit', () => {
  const offenders = [];

  for (const relativePath of listComponentFiles()) {
    if (
      !isM2Owned(relativePath) ||
      componentLimitExemptions.has(relativePath)
    ) {
      continue;
    }

    const lines = countLines(relativePath);

    if (lines <= componentLineLimit) {
      continue;
    }

    const exemption = findExemption(relativePath);

    // An M2-owned file may only be over the limit if it has been explicitly
    // reassigned to a later milestone with a reason - which is what the
    // renderer component is. Anything else is the milestone regressing.
    if (exemption) {
      assert.ok(
        lines <= exemption.maxLines,
        `${relativePath} grew to ${lines} lines against a pinned ${exemption.maxLines}.`,
      );
      continue;
    }

    offenders.push(`${relativePath} (${lines} lines)`);
  }

  assert.deepEqual(
    offenders,
    [],
    `These Game HUD components exceed ${componentLineLimit} lines. Extract instead of adding to them:\n${offenders.join('\n')}`,
  );
});

test('no unknown component anywhere exceeds the line limit', () => {
  const offenders = [];

  for (const relativePath of listComponentFiles()) {
    if (componentLimitExemptions.has(relativePath)) {
      continue;
    }

    const lines = countLines(relativePath);

    if (lines <= componentLineLimit) {
      continue;
    }

    if (findExemption(relativePath)) {
      continue;
    }

    offenders.push(`${relativePath} (${lines} lines)`);
  }

  assert.deepEqual(
    offenders,
    [],
    `These components exceed ${componentLineLimit} lines and are not on the exemption list. Either decompose them or add an entry naming the milestone that will:\n${offenders.join('\n')}`,
  );
});

test('an exempt component may not grow', () => {
  for (const entry of legacyOversizedComponents) {
    assert.ok(
      existsSync(join(root, entry.path)),
      `${entry.path} is exempt but does not exist; remove the stale entry.`,
    );

    const lines = countLines(entry.path);

    assert.ok(
      lines <= entry.maxLines,
      `${entry.path} is ${lines} lines but is pinned at ${entry.maxLines}. ${entry.owner} owns decomposing it; it may not get worse first.`,
    );
  }
});

test('an exemption disappears once its component is compliant', () => {
  // Keeps the list from outliving the problem. Once a milestone decomposes a
  // file, its entry has to go - otherwise the next oversized component can be
  // hidden behind an entry nobody re-checked.
  for (const entry of legacyOversizedComponents) {
    const lines = countLines(entry.path);

    assert.ok(
      lines > componentLineLimit,
      `${entry.path} is now ${lines} lines and no longer needs an exemption; remove the entry and let the limit apply.`,
    );
  }
});

test('the runtime composition root stays a composition root', () => {
  const source = readFileSync(
    join(root, 'apps/web/app/runtime/runtime-cockpit.tsx'),
    'utf8',
  );
  const lines = source.split('\n').length;

  assert.ok(
    lines < 200,
    `runtime-cockpit.tsx is ${lines} lines; it exists to choose a shell and provide its dependencies.`,
  );

  // The three things that made the old cockpit unreviewable. None of them may
  // come back, whatever the file's length.
  assert.doesNotMatch(source, /\bfetch\s*\(/, 'no request building here');
  assert.doesNotMatch(source, /EventSource/, 'no stream implementation here');
  assert.doesNotMatch(
    source,
    /useReducer|createCommandId/,
    'no state machine or command construction here',
  );
});

test('the Player shell imports no diagnostics module, directly or otherwise', () => {
  const reachable = collectImportGraph(shellEntryPoints.player);
  const diagnostics = [...reachable.keys()].filter((file) =>
    file.includes('/runtime/diagnostics/'),
  );

  assert.deepEqual(
    diagnostics,
    [],
    `The Player shell can reach diagnostics UI through:\n${diagnostics
      .map((file) => reachable.get(file).join(' -> '))
      .join('\n')}`,
  );

  // The check is only meaningful if the walk actually found the graph.
  assert.ok(
    reachable.size > 10,
    `the import walk only reached ${reachable.size} files; it is not proving anything`,
  );
});

test('the GM shell does reach diagnostics, so the boundary is real', () => {
  // The inverse assertion. Without it, a walk that silently resolved nothing
  // would pass the Player test for the wrong reason.
  const reachable = collectImportGraph(shellEntryPoints.gameMaster);

  assert.ok(
    [...reachable.keys()].some((file) =>
      file.includes('/runtime/diagnostics/'),
    ),
    'the GM shell should reach the diagnostics panel',
  );
});

test('no builder surface enters a runtime shell import graph', () => {
  for (const [role, entry] of Object.entries(shellEntryPoints)) {
    const reachable = collectImportGraph(entry);
    const builders = [...reachable.keys()].filter((file) =>
      builderSurfacePrefixes.some((prefix) => file.startsWith(prefix)),
    );

    assert.deepEqual(
      builders,
      [],
      `The ${role} shell reaches a builder surface:\n${builders
        .map((file) => reachable.get(file).join(' -> '))
        .join('\n')}`,
    );
  }
});

test('an exempt component is reachable from exactly the shells it declares', () => {
  const graphs = {
    allowedInGameMasterGraph: collectImportGraph(shellEntryPoints.gameMaster),
    allowedInPlayerGraph: collectImportGraph(shellEntryPoints.player),
  };

  for (const entry of legacyOversizedComponents) {
    for (const [flag, reachable] of Object.entries(graphs)) {
      const isReachable = reachable.has(entry.path);

      if (entry[flag]) {
        assert.ok(
          isReachable,
          `${entry.path} declares ${flag}: true but no shell path reaches it; the entry is stale.`,
        );
        continue;
      }

      assert.equal(
        isReachable,
        false,
        `${entry.path} declares ${flag}: false but is reachable through:\n${(reachable.get(entry.path) ?? []).join(' -> ')}`,
      );
    }
  }
});

test('the renderer is reached only through the map stage seam', () => {
  // The one exempt component inside the runtime graph. M2 was told not to
  // replace the renderer, so what it had to prove instead is that the shells
  // depend on it through one seam - which is what lets M4 swap the drawing
  // layer without either shell noticing.
  const rendererPath = 'apps/web/app/runtime/tactical-map.tsx';
  const seamPath = 'apps/web/app/runtime/shells/runtime-map-stage.tsx';

  for (const [role, entry] of Object.entries(shellEntryPoints)) {
    const path = collectImportGraph(entry).get(rendererPath);

    assert.ok(path, `the ${role} shell should render the map`);
    assert.equal(
      path.at(-2),
      seamPath,
      `the ${role} shell reaches the renderer through ${path.at(-2)} rather than the map stage seam.`,
    );
  }
});
