'use client';

/**
 * Every command the runtime surface can issue, as the call site's arguments.
 *
 * Each function here is the arguments and nothing else. Payload construction,
 * command IDs, credential handling and error mapping belong to the command
 * families in `runtime-*-commands.ts`; nothing in this module builds a request
 * or calls `fetch`, and no shell that consumes it can either.
 *
 * The one piece of real logic is the character-ID lookup, and it exists because
 * a few commands cannot be *named* without one. Those failures are routed
 * through the same `command_failed` state the families use, so there is one
 * error surface rather than a second, quieter one that only some panels show.
 */
import type { CharacterResource } from '@dnd/protocol';

import {
  defaultDemoScenario,
  samplePlayers,
  type RuntimeMode,
} from './runtime-cockpit-helpers';
import type { RuntimeCommands } from './use-runtime-commands';
import type { RuntimeSessionAction } from './runtime-session-state';
import type { SimpleEncounterCommandType } from './runtime-encounter-commands';
import type { RuntimeDrafts } from './runtime-hud-drafts';
import type { RuntimeSelection } from './runtime-hud-selection';
import type { RuntimeSceneModel } from './runtime-hud-scene-model';
import type { RuntimePlayerModel } from './runtime-hud-player-model';
import type { M1ResolutionTarget } from '../app/runtime/m1-gm-panel';

export type RuntimeHudActionsInput = {
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  commands: RuntimeCommands;
  dispatch: (action: RuntimeSessionAction) => void;
  drafts: RuntimeDrafts;
  knownCharacterIds: Record<string, string | undefined>;
  mode: RuntimeMode;
  ownerUserId: string | null;
  player: RuntimePlayerModel;
  playerDisplayName: string;
  playerParticipantId: string;
  scene: RuntimeSceneModel;
  sceneId: string;
  sceneTarget: { activeSceneId: string; loadedSceneId: string | null };
  selectedDemoScenario: typeof defaultDemoScenario;
  selectedLibraryEntryId: string;
  selection: RuntimeSelection;
  signInRequiredMessage: string;
  selectRequiredMessage: string;
};

export function createRuntimeHudActions(input: RuntimeHudActionsInput) {
  const {
    charactersByParticipant,
    commands,
    dispatch,
    drafts,
    knownCharacterIds,
    mode,
    ownerUserId,
    player,
    playerDisplayName,
    playerParticipantId,
    scene,
    sceneId,
    sceneTarget,
    selectRequiredMessage,
    selectedDemoScenario,
    selectedLibraryEntryId,
    selection,
    signInRequiredMessage,
  } = input;

  function fail(error: unknown): void {
    dispatch({
      message: error instanceof Error ? error.message : String(error),
      type: 'command_failed',
    });
  }

  function characterIdFor(participantId: string): string | null {
    return (
      knownCharacterIds[participantId] ??
      charactersByParticipant[participantId]?.character.id ??
      null
    );
  }

  function withCharacterTarget(
    participantId: string,
    run: (target: { characterId: string; participantId: string }) => void,
  ): void {
    const characterId = characterIdFor(participantId);

    if (!characterId) {
      fail(new Error(`No assigned character is known for ${participantId}.`));
      return;
    }

    run({ characterId, participantId });
  }

  function withPlayerCharacterId(run: (characterId: string) => void): void {
    const characterId =
      charactersByParticipant[playerParticipantId]?.character.id ??
      knownCharacterIds[playerParticipantId] ??
      null;

    if (!characterId) {
      fail(new Error(signInRequiredMessage));
      return;
    }

    run(characterId);
  }

  return {
    // --- session -----------------------------------------------------------
    createSession: () =>
      commands.session.createSession({ rulesProfileId: 'dnd5e-2024-core' }),
    joinCurrentPlayer: () =>
      commands.session.joinSession({
        displayName: playerDisplayName,
        participantId: playerParticipantId,
      }),
    moveSelectedActor: () =>
      commands.session.moveActingCharacter({ cell: selection.cell }),

    // --- demo scaffolding --------------------------------------------------
    createAndActivateScene: () =>
      commands.scene.createAndActivateScene({
        scene: defaultDemoScenario.scene,
      }),
    createSampleCharacters: () => commands.demo.createSampleCharacters(),
    finalizeAndAssignCharacters: () =>
      commands.demo.finalizeAndAssignCharacters({
        characterIdByParticipant: Object.fromEntries(
          samplePlayers.map((samplePlayer) => [
            samplePlayer.participantId,
            characterIdFor(samplePlayer.participantId) ?? undefined,
          ]),
        ),
      }),
    joinSamplePlayers: () => commands.demo.joinSamplePlayers(),
    placeSampleCharacters: () =>
      commands.demo.placeSampleCharacters({
        positions: {
          'player-001': { x: 0, y: 0 },
          'player-002': { x: 1, y: 0 },
        },
      }),
    runFreshDemoSetup: () => commands.demo.runScenario(selectedDemoScenario),

    // --- scene -------------------------------------------------------------
    activateSceneTransition: () =>
      commands.scene.activateSceneTransition({
        target: sceneTarget,
        transitionId: selection.transitionId,
      }),
    activateSelectedScene: () =>
      commands.scene.activateSelectedScene({
        sceneId:
          drafts.sceneActivationId || sceneTarget.loadedSceneId || sceneId,
      }),
    createCustomScene: () =>
      commands.scene.createCustomScene({
        draft: drafts.scene,
        errors: scene.sceneDraftErrors,
      }),
    createSceneTransition: () =>
      commands.scene.createSceneTransition({
        cell: selection.cell,
        draft: drafts.sceneTransition,
        errors: scene.localizedTransitionDraftErrors,
        target: sceneTarget,
      }),
    deleteSceneEntity: () =>
      commands.scene.deleteSceneEntity({
        entityId: selection.sceneEntityId,
        target: sceneTarget,
      }),
    deleteSceneTransition: () =>
      commands.scene.deleteSceneTransition({
        target: sceneTarget,
        transitionId: selection.transitionId,
      }),
    placeSceneEntity: () =>
      commands.scene.placeSceneEntity({
        cell: selection.cell,
        draft: drafts.sceneEntity,
        errors: scene.sceneEntityDraftErrors,
        target: sceneTarget,
      }),
    repositionSceneEntity: () =>
      commands.scene.repositionSceneEntity({
        cell: selection.cell,
        entityId: selection.sceneEntityId,
        target: sceneTarget,
      }),
    updateSceneEntity: () =>
      commands.scene.updateSceneEntity({
        draft: drafts.sceneEntityEdit,
        entityId: selection.sceneEntityId,
        errors: scene.sceneEntityEditDraftErrors,
        target: sceneTarget,
      }),
    updateSceneTransition: () =>
      commands.scene.updateSceneTransition({
        draft: drafts.sceneTransitionEdit,
        errors: scene.localizedTransitionEditDraftErrors,
        target: sceneTarget,
        transitionId: selection.transitionId,
      }),

    // --- combatants --------------------------------------------------------
    createCombatant: () =>
      commands.combatant.createCombatant({
        cell: selection.cell,
        draft: drafts.combatant,
        errors: scene.combatantDraftErrors,
      }),
    dmCombatantAttackTarget: () =>
      commands.combatant.combatantAttack({
        combatantId: selection.combatantId,
        targetParticipantId: selection.targetParticipantId,
      }),
    repositionCombatant: () =>
      commands.combatant.repositionCombatant({
        cell: selection.cell,
        combatantId: selection.combatantId,
      }),
    setCombatantHidden: (combatantId: string, hidden: boolean) =>
      commands.combatant.setCombatantHidden({ combatantId, hidden }),
    setCombatantHp: () =>
      commands.combatant.setCombatantHp({
        combatantId: selection.combatantId,
        currentHp: drafts.combatantHp,
      }),

    // --- encounter ---------------------------------------------------------
    attackTarget: () =>
      commands.encounter.attack({
        sceneId,
        targetCombatantId: mode === 'player' ? selection.targetCombatantId : '',
        targetParticipantId: selection.targetParticipantId,
      }),
    dmEndEncounter: () => commands.encounter.endEncounter(),
    dmSetTurnCombatant: () =>
      commands.encounter.setCurrentTurnCombatant({
        combatantId: selection.combatantId,
      }),
    dmSetTurnParticipant: () =>
      commands.encounter.setCurrentTurnParticipant({
        participantId: selection.actorParticipantId,
      }),
    dmSetTurnUsage: () =>
      commands.encounter.setCurrentTurnUsage({ turnUsage: drafts.turnUsage }),
    runEncounterCommand: (type: SimpleEncounterCommandType) =>
      commands.encounter.runSimpleEncounterCommand(type),
    startEncounter: () => commands.encounter.startEncounter(),

    // --- GM overrides ------------------------------------------------------
    dmRepositionSelected: () =>
      withCharacterTarget(selection.actorParticipantId, (target) => {
        void commands.character.repositionCharacter({
          cell: selection.cell,
          characterId: target.characterId,
          participantId: target.participantId,
        });
      }),
    dmSetConditions: () =>
      withCharacterTarget(selection.actorParticipantId, (target) => {
        void commands.encounter.setCharacterConditions({
          activeConditions: drafts.conditions
            .split(',')
            .map((condition) => condition.trim())
            .filter(Boolean),
          target,
        });
      }),
    dmSetCurrentHp: () =>
      withCharacterTarget(selection.actorParticipantId, (target) => {
        void commands.encounter.setCharacterCurrentHp({
          currentHp: Number.parseInt(drafts.hp, 10),
          target,
        });
      }),
    /**
     * Apply or clear `poisoned` without disturbing the rest of the list.
     *
     * The next list is built from the authoritative conditions rather than from
     * a local toggle, which is what makes applying it twice a no-op instead of
     * two stacked entries.
     */
    setPoisoned: (target: M1ResolutionTarget, poisoned: boolean) => {
      const withoutPoisoned = target.activeConditions.filter(
        (condition) => condition !== 'poisoned',
      );

      return commands.encounter.setCharacterConditions({
        activeConditions: poisoned
          ? [...withoutPoisoned, 'poisoned']
          : withoutPoisoned,
        target: {
          characterId: target.characterId,
          participantId: target.participantId,
        },
      });
    },

    // --- characters --------------------------------------------------------
    dmAssignPendingCharacter: (participantId: string, characterId: string) =>
      commands.character.assignPendingCharacter({ characterId, participantId }),
    dmAssignSelectedLoadedCharacter: () => {
      const characterId = characterIdFor(selection.actorParticipantId);

      if (!characterId) {
        fail(
          new Error(
            `No loaded character is known for ${selection.actorParticipantId}.`,
          ),
        );
        return;
      }

      void commands.character.assignCharacterToParticipant({
        characterId,
        participantId: selection.actorParticipantId,
      });
    },
    createPlayerCharacter: () =>
      void commands.character.createPlayerCharacter({
        draft: drafts.character,
        errors: player.characterDraftErrors,
      }),
    finalizePlayerCharacter: () =>
      withPlayerCharacterId((characterId) => {
        void commands.character.finalizePlayerCharacter({ characterId });
      }),
    submitPlayerCharacterForAssignment: () =>
      withPlayerCharacterId((characterId) => {
        void commands.character.submitPlayerCharacterForAssignment({
          characterId,
        });
      }),
    submitSelectedLibraryEntry: () => {
      if (!ownerUserId) {
        fail(new Error(signInRequiredMessage));
        return;
      }

      if (!selectedLibraryEntryId) {
        fail(new Error(selectRequiredMessage));
        return;
      }

      void commands.character.submitLibraryEntryForAssignment({
        entryId: selectedLibraryEntryId,
        ownerUserId,
      });
    },
    updatePlayerCharacter: () =>
      withPlayerCharacterId((characterId) => {
        void commands.character.updatePlayerCharacter({
          characterId,
          draft: drafts.character,
          errors: player.characterDraftErrors,
        });
      }),
  };
}

export type RuntimeHudActions = ReturnType<typeof createRuntimeHudActions>;
