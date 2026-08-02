'use client';

/**
 * The runtime composition root.
 *
 * It chooses a shell and provides its dependencies. That is the whole job.
 *
 * There is deliberately nothing else here: no command construction, no stream
 * implementation, no derivation, no server entity held twice, and no large
 * visual section. `useRuntimeHud` assembles the model; `PlayerGameShell` and
 * `GameMasterGameShell` render it. This file used to be ~9,000 lines and the
 * largest known defect in the repository (ROADMAP M2), and keeping it this size
 * is the point rather than a side effect - a repository-shape test fails the
 * build if any component here grows past 500 lines.
 *
 * The only state it owns is presentational and UI-local: which panels are open,
 * which GM tool tab is selected, which demo scenario is chosen, and how wide the
 * viewport is. None of that is authoritative, so switching viewport or opening a
 * drawer cannot reset the table.
 */
import { useEffect, useState } from 'react';

import { defaultDemoScenario } from '../../lib/runtime-cockpit-helpers';
import {
  defaultGameMasterToolTab,
  drawerBreakpointPx,
  togglePanel,
  type GameMasterToolTab,
  type RuntimePanelRequest,
} from '../../lib/runtime-hud-layout';
import { useRuntimeHud } from '../../lib/use-runtime-hud';
import { usePrefersReducedMotion } from './m1-feedback-layer';
import { GameMasterGameShell } from './shells/game-master-game-shell';
import { PlayerGameShell } from './shells/player-game-shell';
import { RuntimeEntrySurface } from './shells/runtime-entry-surface';

/**
 * Wide enough that the columns layout is the server-rendered default.
 *
 * The real width arrives on the first client effect. Starting wide means a
 * desktop - the common case - never flashes the drawer layout before settling.
 */
const assumedInitialWidthPx = 1440;

export function RuntimeCockpit() {
  const [scenarioId, setScenarioId] = useState<string>(defaultDemoScenario.id);
  const [toolTab, setToolTab] = useState<GameMasterToolTab>(
    defaultGameMasterToolTab,
  );
  const [viewportWidthPx, setViewportWidthPx] = useState(assumedInitialWidthPx);
  const [panelRequest, setPanelRequest] = useState<RuntimePanelRequest>({
    inspector: true,
    tools: false,
  });

  const hud = useRuntimeHud(scenarioId);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const measure = (): void => setViewportWidthPx(window.innerWidth);

    measure();
    window.addEventListener('resize', measure);

    return () => window.removeEventListener('resize', measure);
  }, []);

  // On a narrow viewport the panels start closed so the map owns the screen; on
  // a wide one the inspector is a column and belongs open. This runs on the
  // crossing rather than on every resize, so someone who closed the inspector
  // on a desktop does not have it reopened by a few pixels of window drag.
  const isNarrow = viewportWidthPx < drawerBreakpointPx;

  useEffect(() => {
    setPanelRequest((current) => ({ ...current, inspector: !isNarrow }));
  }, [isNarrow]);

  const shared = {
    hud,
    onTogglePanel: (panel: keyof RuntimePanelRequest) =>
      setPanelRequest((current) => togglePanel(current, panel)),
    panelRequest,
    prefersReducedMotion,
    viewportWidthPx,
  };

  if (!hud.seats.sessionId) {
    return <RuntimeEntrySurface hud={hud} />;
  }

  if (hud.mode === 'player') {
    return <PlayerGameShell {...shared} />;
  }

  return (
    <GameMasterGameShell
      {...shared}
      activeTab={toolTab}
      onSelectScenario={setScenarioId}
      onSelectTab={setToolTab}
    />
  );
}
