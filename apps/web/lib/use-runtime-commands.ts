'use client';

/**
 * Assembles the command families over one shared context.
 *
 * The cockpit gets stable callbacks and never builds a payload, picks a command
 * ID, or calls `fetch`. That is the point: a component that constructs its own
 * command is a component that can quietly diverge from the protocol, and the
 * only place that divergence shows up is a running browser.
 *
 * `run` is the single funnel. It owns the pending label, clears the previous
 * error before starting, and converts a thrown error into presentation-safe
 * text, so no individual command has to remember to - and none of them can
 * report success by forgetting to.
 */
import { useMemo, useRef } from 'react';

import {
  createCharacterCommands,
  type CharacterCommands,
} from './runtime-character-commands';
import {
  createCombatantCommands,
  type CombatantCommands,
} from './runtime-combatant-commands';
import { createDemoCommands, type DemoCommands } from './runtime-demo-commands';
import {
  createEncounterCommands,
  type EncounterCommands,
} from './runtime-encounter-commands';
import {
  createSceneCommands,
  type SceneCommands,
} from './runtime-scene-commands';
import {
  createSessionCommands,
  type SessionCommands,
} from './runtime-session-commands';
import {
  createRuntimeCommandContext,
  type RuntimeCommandActors,
} from './runtime-command-runner';
import type { RuntimeSessionAction } from './runtime-session-state';

export type RuntimeCommands = {
  character: CharacterCommands;
  combatant: CombatantCommands;
  demo: DemoCommands;
  encounter: EncounterCommands;
  scene: SceneCommands;
  session: SessionCommands;
};

export type UseRuntimeCommandsParams = {
  dispatch: (action: RuntimeSessionAction) => void;
  /** Read fresh per command so a command never acts as a stale seat. */
  getActors: () => RuntimeCommandActors;
  getSessionId: () => string;
  /** Diagnostics sink for the debug ledger. Never receives a credential. */
  onSettled?: (label: string, payload: unknown) => void;
};

export function useRuntimeCommands(
  params: UseRuntimeCommandsParams,
): RuntimeCommands {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  return useMemo(() => {
    // Every accessor reads through the ref so the whole command surface keeps a
    // stable identity across renders: the cockpit passes these straight to
    // memoized panels, and rebuilding them each keystroke would defeat that.
    const ctx = createRuntimeCommandContext({
      dispatch: (action) => paramsRef.current.dispatch(action),
      getActors: () => paramsRef.current.getActors(),
      getSessionId: () => paramsRef.current.getSessionId(),
      onSettled: (label, payload) =>
        paramsRef.current.onSettled?.(label, payload),
    });

    return {
      character: createCharacterCommands(ctx),
      combatant: createCombatantCommands(ctx),
      demo: createDemoCommands(ctx),
      encounter: createEncounterCommands(ctx),
      scene: createSceneCommands(ctx),
      session: createSessionCommands(ctx),
    };
  }, []);
}
