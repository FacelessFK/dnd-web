/**
 * What the GM's map tools may act on, and why they may not.
 *
 * Pure. Given the projected scene, the drafts and the current selection it
 * produces the entity lists the panels render and one localized sentence per
 * control explaining any block. Nothing here decides authorization - the server
 * refuses the command regardless - but a control that is disabled without
 * saying why is a control people click twice and then file a bug about.
 *
 * The reason chains read in priority order and are deliberately uniform: busy
 * beats missing session beats wrong role beats missing scene beats a bad draft.
 * That ordering is the product decision; keeping it in one place is what stops
 * two buttons in the same panel from disagreeing about which excuse to give.
 */

import {
  getAttackableCombatantEntities,
  getCombatantEntities,
  getDmCombatantActionDisabledReason,
  getKnownSceneOptions,
  getPassiveSceneEntities,
  getTransitionSceneEntities,
  validateCombatantDraftForm,
  validateSceneDraftForm,
  validateSceneEntityDraftForm,
  validateSceneTransitionDraftForm,
  type RuntimeMode,
} from './runtime-cockpit-helpers';
import {
  localizeCombatantDraftError,
  localizeRuntimeDisabledReason,
  localizeTransitionDraftError,
  type RuntimeTranslator,
} from './runtime-localization';
import type { RuntimeDrafts } from './runtime-hud-drafts';
import type { RuntimeSelection } from './runtime-hud-selection';
import type { RuntimeScene } from './runtime-scene-view';

export type RuntimeSceneModelInput = {
  busyLabel: string | null;
  currentTurnCombatantId: string | null;
  drafts: RuntimeDrafts;
  knownScenesById: Record<string, RuntimeScene>;
  mode: RuntimeMode;
  scene: RuntimeScene | null;
  sceneId: string;
  selection: RuntimeSelection;
  sessionId: string;
  t: RuntimeTranslator;
};

export function deriveRuntimeSceneModel(input: RuntimeSceneModelInput) {
  const {
    busyLabel,
    currentTurnCombatantId,
    drafts,
    knownScenesById,
    mode,
    scene,
    sceneId,
    selection,
    sessionId,
    t,
  } = input;

  const busyReason = busyLabel
    ? t('runtime.disabled.busy', { label: busyLabel })
    : null;
  const missingSessionReason = sessionId
    ? null
    : t('runtime.disabled.missingSession');
  const dmOnlySceneReason =
    mode === 'dm' ? null : t('runtime.disabled.dmOnlyScene');
  const noSceneReason = scene ? null : t('runtime.disabled.needScene');
  const noSourceSceneReason = scene
    ? null
    : t('runtime.disabled.needSourceScene');
  /** busy -> no session -> wrong role. Everything below extends this. */
  const baseReason = busyReason ?? missingSessionReason ?? dmOnlySceneReason;

  const passiveSceneEntities = getPassiveSceneEntities(scene);
  const selectedSceneEntity = passiveSceneEntities.find(
    (entity) => entity.id === selection.sceneEntityId,
  );
  const transitionSceneEntities = getTransitionSceneEntities(scene);
  const selectedTransition = transitionSceneEntities.find(
    (entity) => entity.id === selection.transitionId,
  );
  const combatants = getCombatantEntities(scene);
  const attackableCombatants = getAttackableCombatantEntities(scene);
  const selectedCombatant = combatants.find(
    (combatant) => combatant.id === selection.combatantId,
  );

  const sceneDraftErrors = validateSceneDraftForm(drafts.scene);
  const sceneEntityDraftErrors = validateSceneEntityDraftForm({
    form: drafts.sceneEntity,
    grid: scene?.grid,
    position: selection.cell,
  });
  const sceneEntityEditDraftErrors = validateSceneEntityDraftForm({
    form: drafts.sceneEntityEdit,
    grid: scene?.grid,
    position: selectedSceneEntity?.position ?? selection.cell,
  });
  const transitionDraftErrors = validateSceneTransitionDraftForm({
    form: drafts.sceneTransition,
    grid: scene?.grid,
    position: selection.cell,
  });
  const transitionEditDraftErrors = validateSceneTransitionDraftForm({
    form: drafts.sceneTransitionEdit,
    grid: scene?.grid,
    position: selectedTransition?.position ?? selection.cell,
  });
  const combatantDraftErrors = validateCombatantDraftForm({
    form: drafts.combatant,
    grid: scene?.grid,
    position: selection.cell,
  });

  const localizedTransitionDraftErrors = transitionDraftErrors.map((error) =>
    localizeTransitionDraftError(error, t),
  );
  const localizedTransitionEditDraftErrors = transitionEditDraftErrors.map(
    (error) => localizeTransitionDraftError(error, t),
  );
  const localizedCombatantDraftErrors = combatantDraftErrors.map((error) =>
    localizeCombatantDraftError(error, t),
  );

  const sceneDraftReason = sceneDraftErrors.length
    ? t('runtime.disabled.fixSceneDraft', { error: sceneDraftErrors[0]! })
    : null;
  const sceneEntityDraftReason = sceneEntityDraftErrors.length
    ? t('runtime.disabled.fixEntityDraft', {
        error: sceneEntityDraftErrors[0]!,
      })
    : null;
  const sceneEntityEditDraftReason = sceneEntityEditDraftErrors.length
    ? t('runtime.disabled.fixEntityEdit', {
        error: sceneEntityEditDraftErrors[0]!,
      })
    : null;
  const transitionDraftReason = localizedTransitionDraftErrors.length
    ? t('runtime.sceneBuilder.transitions.validation.fixDraft', {
        error: localizedTransitionDraftErrors[0]!,
      })
    : null;
  const transitionEditDraftReason = localizedTransitionEditDraftErrors.length
    ? t('runtime.sceneBuilder.transitions.validation.fixEdit', {
        error: localizedTransitionEditDraftErrors[0]!,
      })
    : null;
  const combatantDraftReason = localizedCombatantDraftErrors.length
    ? t('runtime.combatants.validation.fixDraft', {
        error: localizedCombatantDraftErrors[0]!,
      })
    : null;

  const selectedPassiveEntityReason =
    baseReason ??
    noSceneReason ??
    (selectedSceneEntity ? null : t('runtime.disabled.selectPassiveEntity'));
  const selectedTransitionReason =
    baseReason ??
    noSourceSceneReason ??
    (selectedTransition ? null : t('runtime.disabled.selectTransition'));

  return {
    attackableCombatants,
    busyReason,
    combatantDraftErrors,
    combatants,
    dmOnlySceneReason,
    knownSceneOptions: getKnownSceneOptions(knownScenesById),
    localizedCombatantDraftErrors,
    localizedTransitionDraftErrors,
    localizedTransitionEditDraftErrors,
    missingSessionReason,
    passiveSceneEntities,
    reasons: {
      activateScene:
        baseReason ??
        ((drafts.sceneActivationId || scene?.id || sceneId).trim()
          ? null
          : t('runtime.disabled.enterSceneId')),
      activateTransition: selectedTransitionReason,
      combatantAttack: localizeRuntimeDisabledReason(
        getDmCombatantActionDisabledReason({
          busyLabel,
          currentTurnCombatantId,
          mode,
          scene,
          selectedCombatantId: selection.combatantId,
          sessionId,
          targetParticipantId: selection.targetParticipantId,
        }),
        t,
      ),
      createCombatant:
        baseReason ?? noSceneReason ?? combatantDraftReason ?? null,
      createCustomScene: baseReason ?? sceneDraftReason,
      createTransition:
        baseReason ?? noSourceSceneReason ?? transitionDraftReason ?? null,
      deleteSceneEntity: selectedPassiveEntityReason,
      deleteTransition: selectedTransitionReason,
      placeSceneEntity:
        baseReason ?? noSceneReason ?? sceneEntityDraftReason ?? null,
      repositionSceneEntity: selectedPassiveEntityReason,
      selectedCombatant:
        baseReason ??
        noSceneReason ??
        (selection.combatantId ? null : t('runtime.disabled.selectCombatant')),
      updateSceneEntity:
        selectedPassiveEntityReason ?? sceneEntityEditDraftReason,
      updateTransition: selectedTransitionReason ?? transitionEditDraftReason,
    },
    sceneDraftErrors,
    sceneEntityDraftErrors,
    sceneEntityEditDraftErrors,
    selectedCombatant,
    selectedSceneEntity,
    selectedTransition,
    transitionSceneEntities,
  };
}

export type RuntimeSceneModel = ReturnType<typeof deriveRuntimeSceneModel>;
