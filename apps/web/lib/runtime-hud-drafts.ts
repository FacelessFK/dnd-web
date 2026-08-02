'use client';

/**
 * Every half-typed form on the runtime surface, in one place.
 *
 * A draft is the browser's own: an unsubmitted scene name is not a fact about
 * the table, so it lives here rather than in the reducer that holds what the
 * server projected. The rule that keeps the two from disagreeing is that a
 * draft is only ever *seeded* from authoritative state - by the effects below,
 * when the thing it edits changes - and never written back into it except by a
 * command.
 *
 * Splitting these out of the component is what makes that rule visible. While
 * they were thirteen `useState` calls among thirty, "which of these is a draft
 * and which is a copy of server state" was a question you had to answer by
 * reading every assignment.
 */
import { useEffect, useState } from 'react';

import type {
  CharacterResource,
  Encounter,
  Scene,
  SceneEntityInput,
  SceneTransitionInput,
} from '@dnd/protocol';

import {
  createCharacterDraftFormFromResource,
  createDefaultCharacterDraftForm,
  createDefaultCombatantDraftForm,
  createDefaultSceneDraftForm,
  createDefaultSceneEntityDraftForm,
  createDefaultSceneTransitionDraftForm,
  createSceneDraftFormFromScene,
  createSceneEntityDraftFormFromEntity,
  createSceneEntityDraftFormFromPreset,
  createSceneTransitionDraftFormFromEntity,
  createSceneTransitionDraftFormFromPreset,
  getPassiveSceneEntities,
  getTransitionSceneEntities,
  type AbilityKey,
  type CharacterDraftForm,
  type CombatantDraftForm,
  type SceneDraftForm,
  type SceneEntityDraftForm,
  type SceneEntityPresetId,
  type SceneTransitionDraftForm,
  type SceneTransitionPresetId,
} from './runtime-cockpit-helpers';

export type TurnUsageDraft = Encounter['currentTurnUsage'];

export type SceneEntityDraftField =
  | 'footprintHeight'
  | 'footprintWidth'
  | 'name'
  | 'type';
export type SceneEntityDraftFlag = 'blocksMovement' | 'blocksVision' | 'hidden';
export type SceneTransitionDraftField =
  | 'footprintHeight'
  | 'footprintWidth'
  | 'kind'
  | 'name'
  | 'notes'
  | 'targetLabel'
  | 'targetSceneId';
export type CombatantDraftField =
  | 'armorClass'
  | 'footprintHeight'
  | 'footprintWidth'
  | 'kind'
  | 'name'
  | 'speed';
export type CharacterDraftField =
  | 'armorClass'
  | 'background'
  | 'className'
  | 'level'
  | 'name'
  | 'notes'
  | 'speciesOrRace'
  | 'speed';

export type RuntimeDrafts = {
  character: CharacterDraftForm;
  combatant: CombatantDraftForm;
  combatantHp: string;
  conditions: string;
  hp: string;
  scene: SceneDraftForm;
  sceneActivationId: string;
  sceneEntity: SceneEntityDraftForm;
  sceneEntityEdit: SceneEntityDraftForm;
  sceneTransition: SceneTransitionDraftForm;
  sceneTransitionEdit: SceneTransitionDraftForm;
  turnUsage: TurnUsageDraft;
};

const emptyTurnUsage: TurnUsageDraft = {
  actionUsed: false,
  bonusActionUsed: false,
  movementUsed: 0,
  reactionUsed: false,
};

type UseRuntimeDraftsParams = {
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  defaultPlayerDisplayName: string;
  encounter: Encounter | null;
  playerParticipantId: string;
  scene: Scene | null;
  sceneId: string;
  selectedSceneEntityId: string;
  selectedTransitionId: string;
};

export function useRuntimeDrafts(params: UseRuntimeDraftsParams) {
  const {
    charactersByParticipant,
    defaultPlayerDisplayName,
    encounter,
    playerParticipantId,
    scene,
    sceneId,
    selectedSceneEntityId,
    selectedTransitionId,
  } = params;

  const [character, setCharacter] = useState<CharacterDraftForm>(() =>
    createDefaultCharacterDraftForm(defaultPlayerDisplayName),
  );
  const [combatant, setCombatant] = useState<CombatantDraftForm>(() =>
    createDefaultCombatantDraftForm(),
  );
  const [combatantHp, setCombatantHp] = useState('8');
  const [conditions, setConditions] = useState('prone, marked');
  const [hp, setHp] = useState('1');
  const [scene_, setScene] = useState<SceneDraftForm>(() =>
    createDefaultSceneDraftForm(),
  );
  const [sceneActivationId, setSceneActivationId] = useState('');
  const [sceneEntity, setSceneEntity] = useState<SceneEntityDraftForm>(() =>
    createDefaultSceneEntityDraftForm(),
  );
  const [sceneEntityEdit, setSceneEntityEdit] = useState<SceneEntityDraftForm>(
    () => createDefaultSceneEntityDraftForm(),
  );
  const [sceneTransition, setSceneTransition] =
    useState<SceneTransitionDraftForm>(() =>
      createDefaultSceneTransitionDraftForm(),
    );
  const [sceneTransitionEdit, setSceneTransitionEdit] =
    useState<SceneTransitionDraftForm>(() =>
      createDefaultSceneTransitionDraftForm(),
    );
  const [turnUsage, setTurnUsage] = useState<TurnUsageDraft>(emptyTurnUsage);

  /**
   * Mirror the authoritative turn usage into the editable draft.
   *
   * The GM's usage form is a draft over a server value, so it follows the
   * encounter rather than being written by each command that happens to change
   * it. Deriving it here is what kept the four separate assignments the old
   * command handlers each had to remember from drifting apart.
   */
  useEffect(() => {
    setTurnUsage(encounter?.currentTurnUsage ?? emptyTurnUsage);
  }, [encounter]);

  useEffect(() => {
    const selectedEntity = getPassiveSceneEntities(scene).find(
      (entity) => entity.id === selectedSceneEntityId,
    );

    if (selectedEntity) {
      setSceneEntityEdit(createSceneEntityDraftFormFromEntity(selectedEntity));
    }
  }, [scene, selectedSceneEntityId]);

  useEffect(() => {
    const selectedTransition = getTransitionSceneEntities(scene).find(
      (entity) => entity.id === selectedTransitionId,
    );

    if (selectedTransition) {
      setSceneTransitionEdit(
        createSceneTransitionDraftFormFromEntity(selectedTransition),
      );
    }
  }, [scene, selectedTransitionId]);

  /**
   * Keep the scene ID field pointed at whatever the table is actually on.
   *
   * The GM may then type over it to activate a different map; this only supplies
   * the default so activating the current scene never requires retyping its ID.
   */
  useEffect(() => {
    setSceneActivationId(sceneId);
  }, [sceneId]);

  useEffect(() => {
    const own = charactersByParticipant[playerParticipantId];

    if (own) {
      setCharacter(createCharacterDraftFormFromResource(own));
    }
  }, [charactersByParticipant, playerParticipantId]);

  useEffect(() => {
    if (scene) {
      setScene(createSceneDraftFormFromScene(scene));
    }
  }, [scene]);

  const drafts: RuntimeDrafts = {
    character,
    combatant,
    combatantHp,
    conditions,
    hp,
    scene: scene_,
    sceneActivationId,
    sceneEntity,
    sceneEntityEdit,
    sceneTransition,
    sceneTransitionEdit,
    turnUsage,
  };

  const actions = {
    applySceneEntityPreset: (presetId: SceneEntityPresetId) =>
      setSceneEntity(createSceneEntityDraftFormFromPreset(presetId)),
    applySceneTransitionPreset: (presetId: SceneTransitionPresetId) =>
      setSceneTransition((current) =>
        createSceneTransitionDraftFormFromPreset(presetId, current),
      ),
    resetCharacter: (displayName: string) =>
      setCharacter(createDefaultCharacterDraftForm(displayName)),
    setCombatantHp,
    setConditions,
    setHp,
    setSceneActivationId,
    setTurnUsage,
    updateCharacterAbility: (abilityKey: AbilityKey, value: string) =>
      setCharacter((current) => ({
        ...current,
        abilities: { ...current.abilities, [abilityKey]: value },
      })),
    updateCharacterField: (field: CharacterDraftField, value: string) =>
      setCharacter((current) => ({ ...current, [field]: value })),
    updateCharacterHp: (field: keyof CharacterDraftForm['hp'], value: string) =>
      setCharacter((current) => ({
        ...current,
        hp: { ...current.hp, [field]: value },
      })),
    updateCombatantAbility: (abilityKey: AbilityKey, value: string) =>
      setCombatant((current) => ({
        ...current,
        abilities: { ...current.abilities, [abilityKey]: value },
      })),
    updateCombatantField: (field: CombatantDraftField, value: string) =>
      setCombatant((current) => ({
        ...current,
        [field]:
          field === 'kind' ? (value as CombatantDraftForm['kind']) : value,
      })),
    updateCombatantHidden: (value: boolean) =>
      setCombatant((current) => ({ ...current, hidden: value })),
    updateCombatantHp: (field: keyof CombatantDraftForm['hp'], value: string) =>
      setCombatant((current) => ({
        ...current,
        hp: { ...current.hp, [field]: value },
      })),
    updateSceneEntityEditField: (field: SceneEntityDraftField, value: string) =>
      setSceneEntityEdit((current) => ({
        ...current,
        [field]: field === 'type' ? (value as SceneEntityInput['type']) : value,
      })),
    updateSceneEntityEditFlag: (field: SceneEntityDraftFlag, value: boolean) =>
      setSceneEntityEdit((current) => ({ ...current, [field]: value })),
    updateSceneEntityField: (field: SceneEntityDraftField, value: string) =>
      setSceneEntity((current) => ({
        ...current,
        [field]: field === 'type' ? (value as SceneEntityInput['type']) : value,
      })),
    updateSceneEntityFlag: (field: SceneEntityDraftFlag, value: boolean) =>
      setSceneEntity((current) => ({ ...current, [field]: value })),
    updateSceneField: (field: keyof SceneDraftForm, value: string) =>
      setScene((current) => ({ ...current, [field]: value })),
    updateSceneTransitionEditField: (
      field: SceneTransitionDraftField,
      value: string,
    ) =>
      setSceneTransitionEdit((current) => ({
        ...current,
        [field]:
          field === 'kind' ? (value as SceneTransitionInput['kind']) : value,
      })),
    updateSceneTransitionEditFlag: (
      field: SceneEntityDraftFlag,
      value: boolean,
    ) => setSceneTransitionEdit((current) => ({ ...current, [field]: value })),
    updateSceneTransitionField: (
      field: SceneTransitionDraftField,
      value: string,
    ) =>
      setSceneTransition((current) => ({
        ...current,
        [field]:
          field === 'kind' ? (value as SceneTransitionInput['kind']) : value,
      })),
    updateSceneTransitionFlag: (field: SceneEntityDraftFlag, value: boolean) =>
      setSceneTransition((current) => ({ ...current, [field]: value })),
  };

  return { actions, drafts };
}

export type RuntimeDraftActions = ReturnType<
  typeof useRuntimeDrafts
>['actions'];
