'use client';

/**
 * What this browser is currently pointing at.
 *
 * A selection is not state about the table - two people looking at the same
 * session select different tokens - so none of it is ever sent anywhere. What
 * it does have to be is *valid*: a selected combatant that has since been
 * removed, or a target that is now the actor, produces a command the server
 * will reject for a reason the person cannot see.
 *
 * So every selection here is reconciled against the projected scene whenever
 * that scene changes. The reconciliation deliberately keeps the current value
 * when it is still valid rather than resetting to the first entry, because a GM
 * mid-edit should not lose their selection because an unrelated token moved.
 */
import { useEffect, useState } from 'react';

import {
  getActingParticipantId,
  getAttackableCombatantEntities,
  getCombatantEntities,
  getPassiveSceneEntities,
  getTransitionSceneEntities,
  samplePlayers,
  type Cell,
  type RuntimeMode,
} from './runtime-cockpit-helpers';
import type { RuntimeScene } from './runtime-scene-view';

export type RuntimeSelection = {
  actorParticipantId: string;
  cell: Cell;
  combatantId: string;
  sceneEntityId: string;
  targetCombatantId: string;
  targetParticipantId: string;
  transitionId: string;
};

type UseRuntimeSelectionParams = {
  mode: RuntimeMode;
  playerParticipantId: string;
  playerParticipantIds: string[];
  scene: RuntimeScene | null;
};

export function useRuntimeSelection(params: UseRuntimeSelectionParams) {
  const { mode, playerParticipantId, playerParticipantIds, scene } = params;

  const [actorParticipantId, setActorParticipantId] = useState<string>(
    samplePlayers[0].participantId,
  );
  const [targetParticipantId, setTargetParticipantId] = useState<string>(
    samplePlayers[1].participantId,
  );
  const [targetCombatantId, setTargetCombatantId] = useState('');
  const [cell, setCell] = useState<Cell>({ x: 0, y: 0 });
  const [combatantId, setCombatantId] = useState('');
  const [sceneEntityId, setSceneEntityId] = useState('');
  const [transitionId, setTransitionId] = useState('');

  /**
   * Who a command acts as.
   *
   * A player always acts as themselves; a GM acts as whichever seat they have
   * selected. Derived here rather than by the caller because it depends on this
   * hook's own selection, and computing it outside made the two disagree for a
   * render after a seat switch.
   */
  const actingParticipantId = getActingParticipantId({
    mode,
    playerParticipantId,
    selectedActor: actorParticipantId,
  });

  useEffect(() => {
    if (mode !== 'dm' || !playerParticipantIds.length) {
      return;
    }

    const firstPlayerParticipantId = playerParticipantIds[0];

    if (!firstPlayerParticipantId) {
      return;
    }

    setActorParticipantId((current) =>
      playerParticipantIds.includes(current)
        ? current
        : firstPlayerParticipantId,
    );
  }, [mode, playerParticipantIds]);

  // A target that is also the actor is a command nobody meant to issue, so the
  // reconciliation prefers any other seat before falling back.
  useEffect(() => {
    if (!playerParticipantIds.length) {
      return;
    }

    const firstTargetParticipantId =
      playerParticipantIds.find(
        (participantId) => participantId !== actingParticipantId,
      ) ?? playerParticipantIds[0];

    if (!firstTargetParticipantId) {
      return;
    }

    setTargetParticipantId((current) =>
      playerParticipantIds.includes(current) && current !== actingParticipantId
        ? current
        : firstTargetParticipantId,
    );
  }, [actingParticipantId, playerParticipantIds]);

  useEffect(() => {
    const combatants = getCombatantEntities(scene);
    const attackableCombatants = getAttackableCombatantEntities(scene);
    const passiveEntities = getPassiveSceneEntities(scene);
    const transitions = getTransitionSceneEntities(scene);

    setCombatantId((current) =>
      current && combatants.some((combatant) => combatant.id === current)
        ? current
        : (combatants[0]?.id ?? ''),
    );

    setTargetCombatantId((current) =>
      current &&
      attackableCombatants.some((combatant) => combatant.id === current)
        ? current
        : '',
    );

    setSceneEntityId((current) =>
      current && passiveEntities.some((entity) => entity.id === current)
        ? current
        : (passiveEntities[0]?.id ?? ''),
    );

    setTransitionId((current) =>
      current && transitions.some((entity) => entity.id === current)
        ? current
        : (transitions[0]?.id ?? ''),
    );
  }, [scene]);

  /** Selecting a passive entity clears the transition selection, and vice versa. */
  function selectPassiveSceneEntity(entityId: string): void {
    setSceneEntityId(entityId);

    if (entityId) {
      setTransitionId('');
    }
  }

  function selectSceneTransitionNode(nextTransitionId: string): void {
    setTransitionId(nextTransitionId);

    if (nextTransitionId) {
      setSceneEntityId('');
    }
  }

  const selection: RuntimeSelection = {
    actorParticipantId,
    cell,
    combatantId,
    sceneEntityId,
    targetCombatantId,
    targetParticipantId,
    transitionId,
  };

  const actions = {
    selectActor: setActorParticipantId,
    selectCell: setCell,
    selectCombatant: setCombatantId,
    /**
     * The map reports one entity ID; route it to whichever selection the entity
     * actually belongs to so the GM's panels stay in sync with the board.
     */
    selectMapSceneEntity: (entityId: string) => {
      const entity = scene?.entities.find(
        (candidate) => candidate.id === entityId,
      );

      if (entity?.transition) {
        selectSceneTransitionNode(entityId);
        return;
      }

      selectPassiveSceneEntity(entityId);
    },
    selectPassiveSceneEntity,
    selectSceneTransitionNode,
    selectTarget: setTargetParticipantId,
    selectTargetCombatant: setTargetCombatantId,
    updateCell: (update: (current: Cell) => Cell) => setCell(update),
  };

  return { actingParticipantId, actions, selection };
}

export type RuntimeSelectionActions = ReturnType<
  typeof useRuntimeSelection
>['actions'];
