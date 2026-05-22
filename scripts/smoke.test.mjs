import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  formatSmokeStep,
  formatSmokeWaitFailure,
  getAbsentVisibleTextsExpression,
  getAbsentVisibleTextsOutsideSelectorExpression,
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
  'docs/decisions/0001-initial-stack.md',
  '.env.example',
  'pnpm-workspace.yaml',
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

test('root node engine targets Node 20 or newer', () => {
  const packageJson = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  );

  assert.equal(packageJson.engines?.node, '>=20');
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
