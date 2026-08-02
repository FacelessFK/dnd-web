import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
