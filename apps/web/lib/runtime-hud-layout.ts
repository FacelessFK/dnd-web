/**
 * Where the panels go, and what stays true when the viewport changes.
 *
 * The rule this module exists to enforce: **panel open/closed is UI-local, and
 * authoritative state is not.** Resizing a window, opening a drawer or
 * switching a tool tab must never touch the session, the scene, the encounter
 * or the M1 table. A responsive layout that reset the table would be a second,
 * incompatible state path - which is exactly the defect class M2's structural
 * work spent its time removing.
 *
 * Everything here is therefore pure and takes the viewport as an argument. The
 * components own a width from a resize listener and nothing else; the decisions
 * are made here so they can be tested without a browser.
 */

/** Below this the side panels become drawers rather than columns. */
export const drawerBreakpointPx = 1024;

/** The narrowest supported viewport. Every layout must fit inside it. */
export const minimumSupportedWidthPx = 430;

export type RuntimeLayoutMode = 'drawer' | 'columns';

export function selectLayoutMode(viewportWidthPx: number): RuntimeLayoutMode {
  return viewportWidthPx < drawerBreakpointPx ? 'drawer' : 'columns';
}

/**
 * The grid template for the map row.
 *
 * The map keeps the free-sized track in every case, so a side panel can never
 * squeeze it below the space left over. Collapsing the inspector gives the
 * whole row to the map rather than leaving a gap where it was.
 */
export function selectMapRowTemplate(params: {
  inspectorOpen: boolean;
  layout: RuntimeLayoutMode;
}): string {
  if (params.layout === 'drawer') {
    return 'minmax(0, 1fr)';
  }

  return params.inspectorOpen
    ? 'minmax(0, 1fr) minmax(300px, 380px)'
    : 'minmax(0, 1fr)';
}

/**
 * Whether the map is the dominant region of the layout.
 *
 * Used by the acceptance harness as the definition it measures against, so the
 * threshold lives in the product rather than in the test: the map must hold at
 * least half the width of the row it shares.
 */
export const mapDominanceMinimumShare = 0.5;

export function isMapDominant(params: {
  mapWidthPx: number;
  rowWidthPx: number;
}): boolean {
  if (params.rowWidthPx <= 0) {
    return false;
  }

  return params.mapWidthPx / params.rowWidthPx >= mapDominanceMinimumShare;
}

/** The GM's tool groups. Only one is shown at a time, on purpose. */
export const gameMasterToolTabs = [
  'scene',
  'combatants',
  'roster',
  'table',
  'diagnostics',
] as const;

export type GameMasterToolTab = (typeof gameMasterToolTabs)[number];

/**
 * Diagnostics are never the tab a GM lands on.
 *
 * They are reachable, and they are one click away for whoever needs them, but a
 * GM opening their tools should see a game surface rather than a server
 * console.
 */
export const defaultGameMasterToolTab: GameMasterToolTab = 'scene';

export function isDiagnosticsTab(tab: GameMasterToolTab): boolean {
  return tab === 'diagnostics';
}

/**
 * Restore focus to whatever opened a panel.
 *
 * Returned as a callback rather than performed here so the caller can run it in
 * a cleanup or an event handler. Guards on the element still being connected:
 * a drawer whose opener was removed while it was open must not throw, and must
 * not steal focus to a detached node either.
 */
export function createFocusRestorer(opener: HTMLElement | null): () => void {
  return () => {
    if (!opener || !opener.isConnected) {
      return;
    }

    opener.focus();
  };
}

/**
 * Which panels are open, given a viewport and what the person asked for.
 *
 * A request to open the inspector is remembered across a resize. Dropping to a
 * narrow viewport presents it as a drawer instead of a column - the same panel,
 * a different presentation - and widening again restores the column without
 * having lost the request.
 */
export type RuntimePanelRequest = {
  inspector: boolean;
  tools: boolean;
};

export type RuntimePanelPresentation = {
  inspectorAsDrawer: boolean;
  inspectorOpen: boolean;
  layout: RuntimeLayoutMode;
  toolsAsDrawer: boolean;
  toolsOpen: boolean;
};

export function selectPanelPresentation(params: {
  request: RuntimePanelRequest;
  viewportWidthPx: number;
}): RuntimePanelPresentation {
  const layout = selectLayoutMode(params.viewportWidthPx);
  const isDrawer = layout === 'drawer';

  return {
    inspectorAsDrawer: isDrawer,
    inspectorOpen: params.request.inspector,
    layout,
    toolsAsDrawer: isDrawer,
    toolsOpen: params.request.tools,
  };
}

/**
 * What a panel toggle changes - and, by omission, what it must not.
 *
 * Returns a new request only. There is deliberately no way to express "close
 * the inspector and also clear the scene" from here.
 */
export function togglePanel(
  request: RuntimePanelRequest,
  panel: keyof RuntimePanelRequest,
): RuntimePanelRequest {
  return { ...request, [panel]: !request[panel] };
}
