import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFocusRestorer,
  defaultGameMasterToolTab,
  drawerBreakpointPx,
  gameMasterToolTabs,
  isDiagnosticsTab,
  isMapDominant,
  mapDominanceMinimumShare,
  minimumSupportedWidthPx,
  selectLayoutMode,
  selectMapRowTemplate,
  selectPanelPresentation,
  togglePanel,
  type RuntimePanelRequest,
} from './runtime-hud-layout';

test('the layout switches to drawers only below the breakpoint', () => {
  assert.equal(selectLayoutMode(drawerBreakpointPx), 'columns');
  assert.equal(selectLayoutMode(drawerBreakpointPx + 1), 'columns');
  assert.equal(selectLayoutMode(drawerBreakpointPx - 1), 'drawer');
  assert.equal(selectLayoutMode(minimumSupportedWidthPx), 'drawer');

  // 1366x768 is the desktop the acceptance journey uses, and a 950px window is
  // half a 1920 desktop - what a two-profile playtest actually runs at. Both
  // must be columns, or the inspector hides on a screen wide enough for it.
  assert.equal(selectLayoutMode(1366), 'columns');
  assert.equal(selectLayoutMode(950), 'columns');
});

test('the map keeps the free track whether or not the inspector is open', () => {
  // The point of the assertion is the leading `minmax(0, 1fr)`: whatever the
  // inspector does, the map is the track that absorbs the remaining width, so
  // a side panel can never squeeze it below what is left over.
  assert.match(
    selectMapRowTemplate({ inspectorOpen: true, layout: 'columns' }),
    /^minmax\(0, 1fr\) /,
  );
  assert.equal(
    selectMapRowTemplate({ inspectorOpen: false, layout: 'columns' }),
    'minmax(0, 1fr)',
  );
  // In drawer form the inspector is an overlay, so the map owns the whole row
  // even while it is open.
  assert.equal(
    selectMapRowTemplate({ inspectorOpen: true, layout: 'drawer' }),
    'minmax(0, 1fr)',
  );
});

test('map dominance is measured, not asserted by eye', () => {
  assert.equal(isMapDominant({ mapWidthPx: 900, rowWidthPx: 1366 }), true);
  assert.equal(isMapDominant({ mapWidthPx: 683, rowWidthPx: 1366 }), true);
  assert.equal(isMapDominant({ mapWidthPx: 682, rowWidthPx: 1366 }), false);
  // A row with no width cannot have a dominant anything; it must not divide by
  // zero into a passing `NaN`.
  assert.equal(isMapDominant({ mapWidthPx: 500, rowWidthPx: 0 }), false);
  assert.equal(mapDominanceMinimumShare, 0.5);
});

test('a panel toggle changes only that panel', () => {
  const request: RuntimePanelRequest = { inspector: true, tools: false };

  assert.deepEqual(togglePanel(request, 'tools'), {
    inspector: true,
    tools: true,
  });
  assert.deepEqual(togglePanel(request, 'inspector'), {
    inspector: false,
    tools: false,
  });
  // The original is untouched: panel state is derived, never mutated in place.
  assert.deepEqual(request, { inspector: true, tools: false });
});

test('a viewport change re-presents the panels without forgetting the request', () => {
  const request: RuntimePanelRequest = { inspector: true, tools: true };

  const wide = selectPanelPresentation({ request, viewportWidthPx: 1440 });
  const narrow = selectPanelPresentation({ request, viewportWidthPx: 430 });

  assert.equal(wide.layout, 'columns');
  assert.equal(wide.inspectorAsDrawer, false);
  assert.equal(narrow.layout, 'drawer');
  assert.equal(narrow.inspectorAsDrawer, true);

  // The same panel, presented differently. What must never change across the
  // resize is *whether it was asked for* - that is the property that keeps a
  // viewport change from being a second, incompatible state path.
  assert.equal(wide.inspectorOpen, narrow.inspectorOpen);
  assert.equal(wide.toolsOpen, narrow.toolsOpen);
});

test('the GM lands on a game tool group, never on diagnostics', () => {
  assert.ok(gameMasterToolTabs.includes(defaultGameMasterToolTab));
  assert.equal(isDiagnosticsTab(defaultGameMasterToolTab), false);
  assert.equal(isDiagnosticsTab('diagnostics'), true);
  // Diagnostics remain reachable. Preserving them is the requirement; landing
  // on them is what makes a GM view read as a server console.
  assert.ok(gameMasterToolTabs.includes('diagnostics'));
});

test('focus returns to the opener, and never to a detached node', () => {
  let focused = 0;
  const connected = {
    focus: () => {
      focused += 1;
    },
    isConnected: true,
  } as unknown as HTMLElement;

  createFocusRestorer(connected)();
  assert.equal(focused, 1);

  // A drawer whose opener was removed while it was open must neither throw nor
  // move focus to a node that is no longer in the document.
  let detachedFocused = 0;
  const detached = {
    focus: () => {
      detachedFocused += 1;
    },
    isConnected: false,
  } as unknown as HTMLElement;

  createFocusRestorer(detached)();
  assert.equal(detachedFocused, 0);

  assert.doesNotThrow(() => createFocusRestorer(null)());
});
