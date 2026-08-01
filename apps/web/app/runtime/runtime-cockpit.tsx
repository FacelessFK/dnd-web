'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';

import type {
  CharacterLibraryEntry,
  CharacterResource,
  CombatEvent,
  Encounter,
  Scene,
  SceneEntityInput,
  SceneTransitionInput,
  SessionStreamEvent,
} from '@dnd/protocol';

import { useAuth } from '../../lib/auth-context';
import { listCharacterLibraryEntries } from '../../lib/character-library-api';
import {
  createCommandId,
  fetchOutboxStatus,
  runtimeServerUrl,
  type OutboxStatusSuccessResponse,
} from '../../lib/runtime-api';
import { LanguageSwitcher, useI18n, type MessageKey } from '../../lib/i18n';
import {
  abilityKeys,
  CONCEALED_COMBATANT_LABEL,
  createCharacterDraftFormFromResource,
  createDefaultCharacterDraftForm,
  createDefaultCombatantDraftForm,
  createDefaultSceneDraftForm,
  createDefaultSceneEntityDraftForm,
  createDefaultSceneTransitionDraftForm,
  createSceneEntityDraftFormFromPreset,
  createSceneEntityDraftFormFromEntity,
  createSceneDraftFormFromScene,
  createSceneTransitionDraftFormFromPreset,
  createSceneTransitionDraftFormFromEntity,
  defaultDemoScenario,
  defaultDm,
  defaultPlayer,
  demoScenarios,
  describeSessionStreamEvent,
  getActingParticipantId,
  getActionEconomyFeedbackSummary,
  getActionTargetFeedbackSummary,
  getAssignmentRequestCharacterPreview,
  getAttackableCombatantEntities,
  getCharacterLibrarySourceProvenance,
  getCombatantEntities,
  getCurrentTurnCombatantId,
  getCurrentTurnLabel,
  getCurrentTurnParticipantId,
  getCurrentTurnRailSummary,
  getDemoScenarioById,
  getDemoScenarioSummary,
  getDmCombatantActionDisabledReason,
  getDmTableSetupChecklist,
  getEncounterStatusSummary,
  getFinalizedLibraryEntriesForRuntime,
  getKnownCharacterIds,
  getLibraryEntrySubmissionBlocker,
  getKnownSceneOptions,
  getMovementFeedbackSummary,
  getOutboxStatusView,
  getPendingAssignmentRequests,
  getPassiveSceneEntities,
  getPlayerNextStep,
  getPlayerParticipantIds,
  getPlayerReadinessSummary,
  getRecoveryReliabilitySummary,
  getRuntimeReadinessRoster,
  getRuntimeStatusOverview,
  getRuntimeDisabledReasons,
  getTransitionSceneEntities,
  isSessionStreamEvent,
  isCombatantEntityDefeated,
  samplePlayers,
  sceneEntityPresets,
  sceneEntityTypeOptions,
  sceneTransitionKindOptions,
  sceneTransitionPresets,
  validateCharacterDraftForm,
  validateCombatantDraftForm,
  validateSceneDraftForm,
  validateSceneEntityDraftForm,
  validateSceneTransitionDraftForm,
  type Cell,
  type ActionEconomyFeedbackSummary,
  type ActionTargetFeedbackSummary,
  type AbilityKey,
  type CharacterDraftForm,
  type CombatantDraftForm,
  type CurrentTurnRailSummary,
  type DmTableSetupChecklist,
  type EncounterStatusSummary,
  type LibraryEntrySubmissionBlocker,
  type MovementFeedbackSummary,
  type OutboxStatusView,
  type PlayerReadinessSummary,
  type RecoveryReliabilitySummary,
  type RuntimeEventDescriptor,
  type RuntimeEventSummary,
  type RuntimeMode,
  type RuntimeNoticeTone,
  type RuntimeReadinessRoster,
  type RuntimeStatusOverview,
  type SceneDraftForm,
  type SceneEntityDraftForm,
  type SceneEntityPreset,
  type SceneEntityPresetId,
  type SceneTransitionDraftForm,
  type SceneTransitionPreset,
  type SceneTransitionPresetId,
} from '../../lib/runtime-cockpit-helpers';
import { useRuntimeSession } from '../../lib/use-runtime-session';
import { useRuntimeCommands } from '../../lib/use-runtime-commands';
import type { SceneTarget } from '../../lib/runtime-scene-commands';
import type { SimpleEncounterCommandType } from '../../lib/runtime-encounter-commands';
import { describeStreamStatus } from '../../lib/m1-feedback';
import { useM1Table, type UseM1TableResult } from '../../lib/use-m1-table';
import { M1FeedbackLayer, usePrefersReducedMotion } from './m1-feedback-layer';
import { M1GmPanel, type M1ResolutionTarget } from './m1-gm-panel';
import { M1PlayerPanel } from './m1-player-panel';
import { TacticalMap } from './tactical-map';

type EventLogEntry = {
  at: string;
  id: string;
  label: string;
  payload: unknown;
};

type LastResponse = {
  label: string;
  payload: unknown;
};

type TurnUsageDraft = Encounter['currentTurnUsage'];
type RuntimeTranslator = ReturnType<typeof useI18n>['t'];

/**
 * Swaps the pure helpers' concealed-combatant sentinel for localized copy.
 *
 * The helper module has no translator by design, so it marks an unidentifiable
 * actor and the label is resolved here, at render time.
 */
function localizeActorLabel(
  label: string | null,
  t: RuntimeTranslator,
): string | null {
  return label === CONCEALED_COMBATANT_LABEL
    ? t('runtime.turn.concealedCombatant')
    : label;
}

/**
 * Turns a stream event descriptor into the finished, localized summary the feed
 * renders.
 *
 * Nested keys - `resultKey` and `reasonKey` - are translated first and passed in
 * as values, so a detail string stays one catalogue entry per locale instead of
 * being assembled from fragments in an order Persian would not use.
 */
function localizeRuntimeEventDescriptor(
  descriptor: RuntimeEventDescriptor,
  t: RuntimeTranslator,
): RuntimeEventSummary {
  const { resultKey, reasonKey, ...values } = descriptor.detailValues;
  const resolved: Record<string, string> = {
    ...values,
    attacker: localizeActorLabel(values.attacker ?? null, t) ?? '',
    target: localizeActorLabel(values.target ?? null, t) ?? '',
  };

  if (resultKey) {
    resolved.result = t(resultKey as MessageKey, values);
  }

  if (reasonKey) {
    resolved.reason = t(reasonKey as MessageKey);
  }

  return {
    detail: t(descriptor.detailKey, resolved),
    title: t(descriptor.titleKey),
    tone: descriptor.tone,
  };
}

function getLocalizedSceneEntityTypeLabel(
  type: (typeof sceneEntityTypeOptions)[number],
  t: RuntimeTranslator,
): string {
  switch (type) {
    case 'monster':
      return t('runtime.sceneBuilder.entityType.monster');
    case 'object':
      return t('runtime.sceneBuilder.entityType.object');
    case 'player_spawn':
      return t('runtime.sceneBuilder.entityType.playerSpawn');
    case 'terrain':
      return t('runtime.sceneBuilder.entityType.terrain');
  }
}

function getLocalizedSceneTransitionKindLabel(
  kind: (typeof sceneTransitionKindOptions)[number],
  t: RuntimeTranslator,
): string {
  switch (kind) {
    case 'door':
      return t('runtime.sceneBuilder.transitions.kind.door');
    case 'gate':
      return t('runtime.sceneBuilder.transitions.kind.gate');
    case 'other':
      return t('runtime.sceneBuilder.transitions.kind.other');
    case 'portal':
      return t('runtime.sceneBuilder.transitions.kind.portal');
    case 'stairs':
      return t('runtime.sceneBuilder.transitions.kind.stairs');
  }
}

function getLocalizedSceneEntityPresetLabel(
  presetId: SceneEntityPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'cover':
      return t('runtime.sceneBuilder.entityPreset.cover.label');
    case 'hidden_prop':
      return t('runtime.sceneBuilder.entityPreset.hiddenProp.label');
    case 'marker':
      return t('runtime.sceneBuilder.entityPreset.marker.label');
    case 'monster_spawn':
      return t('runtime.sceneBuilder.entityPreset.monsterSpawn.label');
    case 'player_spawn':
      return t('runtime.sceneBuilder.entityPreset.playerSpawn.label');
    case 'wall':
      return t('runtime.sceneBuilder.entityPreset.wall.label');
  }
}

function getLocalizedSceneEntityPresetDescription(
  presetId: SceneEntityPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'cover':
      return t('runtime.sceneBuilder.entityPreset.cover.description');
    case 'hidden_prop':
      return t('runtime.sceneBuilder.entityPreset.hiddenProp.description');
    case 'marker':
      return t('runtime.sceneBuilder.entityPreset.marker.description');
    case 'monster_spawn':
      return t('runtime.sceneBuilder.entityPreset.monsterSpawn.description');
    case 'player_spawn':
      return t('runtime.sceneBuilder.entityPreset.playerSpawn.description');
    case 'wall':
      return t('runtime.sceneBuilder.entityPreset.wall.description');
  }
}

function getLocalizedSceneTransitionPresetLabel(
  presetId: SceneTransitionPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'door':
      return t('runtime.sceneBuilder.transitions.preset.door.label');
    case 'gate':
      return t('runtime.sceneBuilder.transitions.preset.gate.label');
    case 'other':
      return t('runtime.sceneBuilder.transitions.preset.other.label');
    case 'portal':
      return t('runtime.sceneBuilder.transitions.preset.portal.label');
    case 'stairs':
      return t('runtime.sceneBuilder.transitions.preset.stairs.label');
  }
}

function getLocalizedSceneTransitionPresetDescription(
  presetId: SceneTransitionPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'door':
      return t('runtime.sceneBuilder.transitions.preset.door.description');
    case 'gate':
      return t('runtime.sceneBuilder.transitions.preset.gate.description');
    case 'other':
      return t('runtime.sceneBuilder.transitions.preset.other.description');
    case 'portal':
      return t('runtime.sceneBuilder.transitions.preset.portal.description');
    case 'stairs':
      return t('runtime.sceneBuilder.transitions.preset.stairs.description');
  }
}

function getLocalizedSceneEntityLabel(
  entity: Scene['entities'][number],
  t: RuntimeTranslator,
): string {
  const flags = [
    entity.transition
      ? t('runtime.sceneBuilder.entityFlag.transitionTo', {
          kind: getLocalizedSceneTransitionKindLabel(entity.transition.kind, t),
          target:
            entity.transition.targetLabel ??
            entity.transition.targetSceneId ??
            'unknown',
        })
      : null,
    entity.blocksMovement
      ? t('runtime.sceneBuilder.entityFlag.blocksMovement')
      : null,
    entity.blocksVision
      ? t('runtime.sceneBuilder.entityFlag.blocksVision')
      : null,
    entity.hidden ? t('runtime.sceneBuilder.entityFlag.hidden') : null,
  ].filter(Boolean);

  return `${entity.name} (${getLocalizedSceneEntityTypeLabel(entity.type, t)}${
    flags.length ? `, ${flags.join(', ')}` : ''
  })`;
}

function getLocalizedSceneEntityPositionLabel(
  entity: Scene['entities'][number],
  t: RuntimeTranslator,
): string {
  return t('runtime.sceneBuilder.entityAt', {
    cell: `${entity.position.x},${entity.position.y}`,
    label: getLocalizedSceneEntityLabel(entity, t),
  });
}

function getLocalizedActiveSceneGuidance({
  activeSceneId,
  mode,
  scene,
  t,
}: {
  activeSceneId: string | null;
  mode: RuntimeMode;
  scene: Scene | null;
  t: RuntimeTranslator;
}): RuntimeEventSummary {
  if (scene) {
    return {
      detail: t('runtime.activeScene.loadedDetail', {
        entityCount: String(scene.entities.length),
        height: String(scene.grid.height),
        sceneName: scene.name,
        width: String(scene.grid.width),
      }),
      title: t('runtime.activeScene.loadedTitle'),
      tone: 'success',
    };
  }

  if (activeSceneId) {
    return {
      detail: t('runtime.activeScene.idKnownDetail'),
      title: t('runtime.activeScene.idKnownTitle'),
      tone: 'warning',
    };
  }

  return mode === 'dm'
    ? {
        detail: t('runtime.activeScene.buildDetail'),
        title: t('runtime.activeScene.buildTitle'),
        tone: 'warning',
      }
    : {
        detail: t('runtime.activeScene.noneDetail'),
        title: t('runtime.activeScene.noneTitle'),
        tone: 'warning',
      };
}

function localizeRuntimeDisabledReason(
  reason: string | null,
  t: RuntimeTranslator,
): string | null {
  if (!reason) {
    return null;
  }

  if (reason.startsWith('Waiting on ') && reason.endsWith('.')) {
    return t('runtime.disabled.busy', {
      label: reason.slice('Waiting on '.length, -1),
    });
  }

  const labels: Record<string, string> = {
    'Choose a different target participant.': t(
      'runtime.disabled.invalidTargetDifferent',
    ),
    'Choose a joined player participant as the acting character.': t(
      'runtime.disabled.invalidActor',
    ),
    'Choose a joined player participant or active monster/NPC target.': t(
      'runtime.disabled.invalidTarget',
    ),
    'Create or recover an active scene first.': t(
      'runtime.disabled.createOrRecoverActiveScene',
    ),
    'Create, activate, or recover a scene first.': t(
      'runtime.disabled.createActivateRecoverScene',
    ),
    'Create or select a monster/NPC combatant first.': t(
      'runtime.disabled.selectCombatant',
    ),
    'Create, paste, or recover a session first.': t(
      'runtime.disabled.missingSession',
    ),
    'Choose a player character target.': t('runtime.disabled.playerTarget'),
    'Create/recover an active scene before moving or starting combat.': t(
      'runtime.disabled.missingActiveScene',
    ),
    'Enter a player participant ID and display name.': t(
      'runtime.disabled.missingPlayerIdentity',
    ),
    'Load or assign this character first.': t(
      'runtime.disabled.loadOrAssignCharacter',
    ),
    'Place at least one character in the active scene first.': t(
      'runtime.disabled.placeCharacter',
    ),
    'Start or recover an encounter first.': t(
      'runtime.disabled.missingEncounter',
    ),
    'Switch to DM mode for this control.': t('runtime.disabled.dmOnlyControl'),
    'Switch to DM mode for monster/NPC controls.': t(
      'runtime.disabled.dmOnlyCombatant',
    ),
    'Switch to Player mode to join as the configured player.': t(
      'runtime.disabled.playerJoinMode',
    ),
    'The selected combatant must be the current turn actor.': t(
      'runtime.disabled.combatantTurn',
    ),
    'The selected monster/NPC is defeated and cannot act.': t(
      'runtime.disabled.combatantDefeated',
    ),
  };

  return labels[reason] ?? reason;
}

function localizeRuntimeDisabledReasons(
  reasons: ReturnType<typeof getRuntimeDisabledReasons>,
  t: RuntimeTranslator,
): ReturnType<typeof getRuntimeDisabledReasons> {
  return Object.fromEntries(
    Object.entries(reasons).map(([key, reason]) => [
      key,
      localizeRuntimeDisabledReason(reason, t),
    ]),
  ) as ReturnType<typeof getRuntimeDisabledReasons>;
}

function localizeCombatantDraftError(
  error: string,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'Armor Class': 'AC',
    'Current HP': t('runtime.combatants.hpCurrent'),
    'Footprint height': t('runtime.combatants.sizeHeight'),
    'Footprint width': t('runtime.combatants.sizeWidth'),
    'Max HP': t('runtime.combatants.hpMax'),
    Speed: t('runtime.combatants.speed'),
    'Temp HP': t('runtime.combatants.hpTemp'),
  };
  const wholeNumberMatch = error.match(/^(.+) must be a whole number\.$/);
  const rangeMatch = error.match(/^(.+) must be between (\d+) and (\d+)\.$/);

  if (wholeNumberMatch) {
    return t('runtime.combatants.validation.wholeNumber', {
      field: labels[wholeNumberMatch[1]!] ?? wholeNumberMatch[1]!,
    });
  }

  if (rangeMatch) {
    return t('runtime.combatants.validation.range', {
      field: labels[rangeMatch[1]!] ?? rangeMatch[1]!,
      max: rangeMatch[3]!,
      min: rangeMatch[2]!,
    });
  }

  const messages: Record<string, string> = {
    'Choose monster or npc.': t('runtime.combatants.validation.kind'),
    'Combatant footprint must fit within the scene grid.': t(
      'runtime.combatants.validation.footprint',
    ),
    'Combatant name is required.': t('runtime.combatants.validation.name'),
    'Current HP cannot exceed max HP.': t(
      'runtime.combatants.validation.currentHp',
    ),
  };

  return messages[error] ?? error;
}

function localizeTransitionDraftError(
  error: string,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'Footprint height': t('runtime.sceneBuilder.field.footprintHeight'),
    'Footprint width': t('runtime.sceneBuilder.field.footprintWidth'),
  };
  const wholeNumberMatch = error.match(/^(.+) must be a whole number\.$/);
  const rangeMatch = error.match(/^(.+) must be between (\d+) and (\d+)\.$/);

  if (wholeNumberMatch) {
    return t('runtime.sceneBuilder.transitions.validation.wholeNumber', {
      field: labels[wholeNumberMatch[1]!] ?? wholeNumberMatch[1]!,
    });
  }

  if (rangeMatch) {
    return t('runtime.sceneBuilder.transitions.validation.range', {
      field: labels[rangeMatch[1]!] ?? rangeMatch[1]!,
      max: rangeMatch[3]!,
      min: rangeMatch[2]!,
    });
  }

  const messages: Record<string, string> = {
    'Choose a valid transition kind.': t(
      'runtime.sceneBuilder.transitions.validation.kind',
    ),
    'Select a non-negative target cell.': t(
      'runtime.sceneBuilder.transitions.validation.targetCell',
    ),
    'Target scene ID is required.': t(
      'runtime.sceneBuilder.transitions.validation.targetSceneId',
    ),
    'Transition footprint must fit within the scene grid.': t(
      'runtime.sceneBuilder.transitions.validation.footprint',
    ),
    'Transition name is required.': t(
      'runtime.sceneBuilder.transitions.validation.name',
    ),
  };

  return messages[error] ?? error;
}

function localizeRuntimeCharacterStatus(
  status: string,
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'active':
      return t('runtime.combatants.status.active');
    case 'defeated':
      return t('runtime.combatants.status.defeated');
    case 'draft':
      return t('runtime.characterSummary.status.draft');
    case 'ready':
      return t('common.ready');
    default:
      return status;
  }
}

function getLocalizedPlayerNextStepTitle(
  nextStep: ReturnType<typeof getPlayerNextStep>,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'Choose a session': t('runtime.playerNextStep.chooseSession.title'),
    'Create your character': t('runtime.playerNextStep.createCharacter.title'),
    'Exploration mode': t('runtime.playerNextStep.exploration.title'),
    'Finalize your character': t('runtime.playerNextStep.finalize.title'),
    'Join the table': t('runtime.playerNextStep.join.title'),
    'No active scene': t('runtime.playerNextStep.noScene.title'),
    'Submit for assignment': t('runtime.playerNextStep.submit.title'),
    'Token not placed': t('runtime.playerNextStep.placement.title'),
    'Waiting for DM assignment': t('runtime.playerNextStep.waitingDm.title'),
    'Waiting for your turn': t('runtime.playerNextStep.waitingTurn.title'),
    'Your turn': t('runtime.playerNextStep.yourTurn.title'),
  };

  return labels[nextStep.title] ?? nextStep.title;
}

function getLocalizedPlayerNextStepDetail(
  nextStep: ReturnType<typeof getPlayerNextStep>,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'A submitted runtime copy is waiting in session state for the DM to assign it.':
      t('runtime.playerNextStep.waitingDm.detail'),
    'Create a draft here or submit a saved Character Library entry, then wait for DM assignment.':
      t('runtime.playerNextStep.createCharacter.detail'),
    'Finish editing and finalize your character before sending it to the DM.':
      t('runtime.playerNextStep.finalize.detail'),
    'Join the session as this participant before reading table state.': t(
      'runtime.playerNextStep.join.detail',
    ),
    'Move, attack, or spend your action economy. The server validates legality.':
      t('runtime.playerNextStep.yourTurn.detail'),
    'Paste a session ID from the DM, then join or recover.': t(
      'runtime.playerNextStep.chooseSession.detail',
    ),
    'Submit your finalized character for DM assignment so the table can see it.':
      t('runtime.playerNextStep.submit.detail'),
    'The DM has not activated a scene yet, or you need to recover.': t(
      'runtime.playerNextStep.noScene.detail',
    ),
    'Watch the current actor and prepare your target or movement.': t(
      'runtime.playerNextStep.waitingTurn.detail',
    ),
    'You can move outside combat; turn resources unlock after encounter start.':
      t('runtime.playerNextStep.exploration.detail'),
    'Your character has no token placement in the active scene.': t(
      'runtime.playerNextStep.placement.detail',
    ),
  };

  return labels[nextStep.detail] ?? nextStep.detail;
}

function formatOutboxStatusLabel(
  view: OutboxStatusView,
  t: RuntimeTranslator,
): string {
  switch (view.kind) {
    case 'backlog':
      return t('runtime.outbox.status.backlog', {
        count: String(view.count ?? 0),
      });
    case 'clear':
      return t('runtime.outbox.status.clear');
    case 'error':
      return t('runtime.outbox.status.error');
    case 'loading':
      return t('runtime.outbox.status.loading');
    case 'not_configured':
      return t('runtime.outbox.status.off');
    case 'unknown':
      return t('runtime.outbox.status.unknown');
  }
}

export function RuntimeCockpit() {
  const { t } = useI18n();
  const { loading: authLoading, user } = useAuth();

  // Local form and selection state. These are the browser's own - a half-typed
  // scene name is not a fact about the table - so they stay here while every
  // server-projected value comes from `session.state`.
  const [characterDraft, setCharacterDraft] = useState<CharacterDraftForm>(() =>
    createDefaultCharacterDraftForm(defaultPlayer.displayName),
  );
  const [libraryEntries, setLibraryEntries] = useState<CharacterLibraryEntry[]>(
    [],
  );
  const [libraryEntryError, setLibraryEntryError] = useState<string | null>(
    null,
  );
  const [libraryEntriesLoading, setLibraryEntriesLoading] = useState(false);
  const [selectedLibraryEntryId, setSelectedLibraryEntryId] = useState('');
  const [selectedDemoScenarioId, setSelectedDemoScenarioId] = useState<string>(
    defaultDemoScenario.id,
  );
  const [sceneDraft, setSceneDraft] = useState<SceneDraftForm>(() =>
    createDefaultSceneDraftForm(),
  );
  const [sceneActivationId, setSceneActivationId] = useState('');
  const [sceneEntityDraft, setSceneEntityDraft] =
    useState<SceneEntityDraftForm>(() => createDefaultSceneEntityDraftForm());
  const [selectedSceneEntityId, setSelectedSceneEntityId] = useState('');
  const [sceneEntityEditDraft, setSceneEntityEditDraft] =
    useState<SceneEntityDraftForm>(() => createDefaultSceneEntityDraftForm());
  const [sceneTransitionDraft, setSceneTransitionDraft] =
    useState<SceneTransitionDraftForm>(() =>
      createDefaultSceneTransitionDraftForm(),
    );
  const [selectedTransitionId, setSelectedTransitionId] = useState('');
  const [sceneTransitionEditDraft, setSceneTransitionEditDraft] =
    useState<SceneTransitionDraftForm>(() =>
      createDefaultSceneTransitionDraftForm(),
    );
  const [combatantDraft, setCombatantDraft] = useState<CombatantDraftForm>(() =>
    createDefaultCombatantDraftForm(),
  );
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [lastResponse, setLastResponse] = useState<LastResponse | null>(null);
  const [outboxStatus, setOutboxStatus] = useState<
    OutboxStatusSuccessResponse['data'] | null
  >(null);
  const [outboxStatusError, setOutboxStatusError] = useState<string | null>(
    null,
  );
  const [outboxStatusLoading, setOutboxStatusLoading] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string>(
    samplePlayers[0].participantId,
  );
  const [selectedTarget, setSelectedTarget] = useState<string>(
    samplePlayers[1].participantId,
  );
  const [selectedTargetCombatantId, setSelectedTargetCombatantId] =
    useState('');
  const [selectedCell, setSelectedCell] = useState<Cell>({ x: 0, y: 0 });
  const [selectedCombatantId, setSelectedCombatantId] = useState('');
  const [hpDraft, setHpDraft] = useState('1');
  const [combatantHpDraft, setCombatantHpDraft] = useState('8');
  const [conditionsDraft, setConditionsDraft] = useState('prone, marked');
  const [turnUsageDraft, setTurnUsageDraft] = useState<TurnUsageDraft>({
    actionUsed: false,
    bonusActionUsed: false,
    movementUsed: 0,
    reactionUsed: false,
  });

  // The M1 table's seat comes from the session hook, and the session hook needs
  // to hand frames to the table - so the reference is filled in immediately
  // after both exist. Both callbacks below run from event handlers, never during
  // this render, so the ref is always populated by the time they fire.
  const m1Ref = useRef<UseM1TableResult | null>(null);

  /**
   * Every server-projected value, in one place.
   *
   * The hook owns the reducer, the subscription and the recovery sequence. This
   * component reads what it holds and never writes to it except through a
   * command - which is why there is no `setScene` here to disagree with the
   * server's next frame.
   */
  const session = useRuntimeSession({
    onIdentityReset: () => {
      m1Ref.current?.resetTable();
      setEventLog([]);
      setLastResponse(null);
    },
    onStreamEvent: (event) => {
      m1Ref.current?.ingestStreamEvent(event);
      pushLog(event.type, event);
    },
  });

  // M1 table state and commands live in their own hook so this component keeps
  // only the wiring: which participant, which session, and where the panels go.
  const m1 = useM1Table({
    participantId: session.activeParticipantId,
    sessionId: session.seats.sessionId,
  });
  m1Ref.current = m1;

  const { seats, state: runtime } = session;
  const mode = seats.mode;
  const sessionId = seats.sessionId;
  const dmParticipantId = seats.dmParticipantId;
  const dmDisplayName = seats.dmDisplayName;
  const playerParticipantId = seats.playerParticipantId;
  const playerDisplayName = seats.playerDisplayName;

  // Read-only bindings onto the reducer's state. Named for what the panels below
  // already call them so this stays a rename, not a second copy: nothing here
  // can be assigned.
  const sessionState = runtime.session;
  const scene = runtime.scene;
  const sceneId = runtime.sceneId;
  const knownScenesById = runtime.knownScenesById;
  const activeScene = runtime.activeScene;
  const encounter = runtime.encounter;
  const charactersByParticipant = runtime.charactersByParticipant;
  const commandError = runtime.commandError;
  const recoveryNotes = runtime.recoveryNotes;
  const busyLabel = runtime.pendingCommand;
  const streamParticipantId = session.activeParticipantId;
  const streamDisplayName = session.activeDisplayName;
  const streamRole: 'dm' | 'player' = mode === 'dm' ? 'dm' : 'player';

  const stream = session.stream;
  const prefersReducedMotion = usePrefersReducedMotion();

  const outboxStatusView = getOutboxStatusView({
    data: outboxStatus,
    error: outboxStatusError,
    loading: outboxStatusLoading,
  });
  const selectedDemoScenario = getDemoScenarioById(selectedDemoScenarioId);
  const selectedDemoScenarioSummary =
    getDemoScenarioSummary(selectedDemoScenario);
  const outboxStatusLabel = formatOutboxStatusLabel(outboxStatusView, t);
  const statusGridClassName =
    mode === 'dm'
      ? 'grid gap-2 text-xs text-slate-300 sm:grid-cols-4 xl:min-w-[640px]'
      : 'grid gap-2 text-xs text-slate-300 sm:grid-cols-3 xl:min-w-[520px]';
  const statusServerClassName =
    mode === 'dm'
      ? 'flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 sm:col-span-4'
      : 'flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 sm:col-span-3';
  const currentTurnParticipantId = getCurrentTurnParticipantId(encounter);
  const currentTurnCombatantId = getCurrentTurnCombatantId(encounter);
  const knownCharacterIds = getKnownCharacterIds(
    sessionState,
    charactersByParticipant,
    runtime.knownCharacterIdsByParticipant,
  );
  const playerParticipantIds = useMemo(
    () => getPlayerParticipantIds(sessionState),
    [sessionState],
  );
  const finalizedLibraryEntries = useMemo(
    () => getFinalizedLibraryEntriesForRuntime(libraryEntries),
    [libraryEntries],
  );
  const actingParticipantId = getActingParticipantId({
    mode,
    playerParticipantId,
    selectedActor,
  });
  const participants = sessionState?.participants ?? [
    {
      characterId: null,
      connectionStatus: 'disconnected' as const,
      displayName: defaultDm.displayName,
      id: dmParticipantId,
      joinedAt: '',
      lastSeenAt: '',
      pendingCharacterId: null,
      role: 'dm' as const,
    },
    ...samplePlayers.map((player) => ({
      characterId: knownCharacterIds[player.participantId] ?? null,
      connectionStatus: 'disconnected' as const,
      displayName: player.displayName,
      id: player.participantId,
      joinedAt: '',
      lastSeenAt: '',
      pendingCharacterId: null,
      role: 'player' as const,
    })),
    ...(samplePlayers.some(
      (player) => player.participantId === playerParticipantId,
    )
      ? []
      : [
          {
            characterId: knownCharacterIds[playerParticipantId] ?? null,
            connectionStatus: 'disconnected' as const,
            displayName: playerDisplayName || playerParticipantId,
            id: playerParticipantId,
            joinedAt: '',
            lastSeenAt: '',
            pendingCharacterId: null,
            role: 'player' as const,
          },
        ]),
  ];

  // The command context is created once, so it reads actors through a ref rather
  // than closing over this render's values. Capturing them would make a command
  // act as whichever seat was selected when the component first mounted.
  const sessionRef = useRef({
    acting: actingParticipantId,
    dmParticipantId,
    playerParticipantId,
    sessionId,
    streamDisplayName,
    streamParticipantId,
    streamRole,
  });
  sessionRef.current = {
    acting: actingParticipantId,
    dmParticipantId,
    playerParticipantId,
    sessionId,
    streamDisplayName,
    streamParticipantId,
    streamRole,
  };

  /**
   * Every command this surface can issue.
   *
   * Payload construction, command IDs, credential handling and error mapping all
   * live behind these families. Nothing below builds a request or calls `fetch`.
   */
  const commands = useRuntimeCommands({
    dispatch: session.dispatch,
    getActors: () => {
      const current = sessionRef.current;

      return {
        acting: current.acting,
        dm: current.dmParticipantId,
        player: current.playerParticipantId,
        stream: current.streamParticipantId,
        streamDisplayName: current.streamDisplayName,
        streamRole: current.streamRole,
      };
    },
    getSessionId: () => sessionRef.current.sessionId,
    onSettled: (label, payload) => {
      setLastResponse({ label, payload });
      pushLog(label, payload);
    },
  });

  const sceneTarget: SceneTarget = {
    activeSceneId: sceneId,
    loadedSceneId: scene?.id ?? null,
  };

  /**
   * Mirror the authoritative turn usage into the editable draft.
   *
   * The GM's usage form is a draft over a server value, so it follows the
   * encounter rather than being written by each command that happens to change
   * it. Deriving it here is what kept the four separate assignments the old
   * command handlers each had to remember from drifting apart.
   */
  useEffect(() => {
    setTurnUsageDraft(
      encounter?.currentTurnUsage ?? {
        actionUsed: false,
        bonusActionUsed: false,
        movementUsed: 0,
        reactionUsed: false,
      },
    );
  }, [encounter]);

  useEffect(() => {
    if (mode !== 'dm' || !playerParticipantIds.length) {
      return;
    }

    const firstPlayerParticipantId = playerParticipantIds[0];

    if (!firstPlayerParticipantId) {
      return;
    }

    setSelectedActor((current) =>
      playerParticipantIds.includes(current)
        ? current
        : firstPlayerParticipantId,
    );
  }, [mode, playerParticipantIds]);

  useEffect(() => {
    let canceled = false;
    const ownerUserId = user?.id;

    if (authLoading || mode !== 'player' || !ownerUserId) {
      setLibraryEntries([]);
      setLibraryEntriesLoading(false);
      setLibraryEntryError(null);
      return;
    }

    setLibraryEntriesLoading(true);
    setLibraryEntryError(null);

    void listCharacterLibraryEntries(ownerUserId)
      .then((result) => {
        if (canceled) {
          return;
        }

        if (result.ok) {
          setLibraryEntries(result.data);
          return;
        }

        setLibraryEntries([]);
        setLibraryEntryError(result.error.message);
      })
      .finally(() => {
        if (!canceled) {
          setLibraryEntriesLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [authLoading, mode, user?.id]);

  useEffect(() => {
    setSelectedLibraryEntryId((current) =>
      finalizedLibraryEntries.some((entry) => entry.id === current)
        ? current
        : (finalizedLibraryEntries[0]?.id ?? ''),
    );
  }, [finalizedLibraryEntries]);

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

    setSelectedTarget((current) => {
      return playerParticipantIds.includes(current) &&
        current !== actingParticipantId
        ? current
        : firstTargetParticipantId;
    });
  }, [actingParticipantId, playerParticipantIds]);

  useEffect(() => {
    const combatants = getCombatantEntities(scene);
    const attackableCombatants = getAttackableCombatantEntities(scene);
    const passiveEntities = getPassiveSceneEntities(scene);
    const transitions = getTransitionSceneEntities(scene);

    setSelectedCombatantId((current) => {
      if (current && combatants.some((combatant) => combatant.id === current)) {
        return current;
      }

      return combatants[0]?.id ?? '';
    });

    setSelectedTargetCombatantId((current) => {
      if (
        current &&
        attackableCombatants.some((combatant) => combatant.id === current)
      ) {
        return current;
      }

      return '';
    });

    setSelectedSceneEntityId((current) => {
      if (current && passiveEntities.some((entity) => entity.id === current)) {
        return current;
      }

      return passiveEntities[0]?.id ?? '';
    });

    setSelectedTransitionId((current) => {
      if (current && transitions.some((entity) => entity.id === current)) {
        return current;
      }

      return transitions[0]?.id ?? '';
    });
  }, [scene]);

  useEffect(() => {
    const selectedEntity = getPassiveSceneEntities(scene).find(
      (entity) => entity.id === selectedSceneEntityId,
    );

    if (selectedEntity) {
      setSceneEntityEditDraft(
        createSceneEntityDraftFormFromEntity(selectedEntity),
      );
    }
  }, [scene, selectedSceneEntityId]);

  useEffect(() => {
    const selectedTransition = getTransitionSceneEntities(scene).find(
      (entity) => entity.id === selectedTransitionId,
    );

    if (selectedTransition) {
      setSceneTransitionEditDraft(
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
      setCharacterDraft(createCharacterDraftFormFromResource(own));
    }
  }, [charactersByParticipant, playerParticipantId]);

  useEffect(() => {
    const nextScene = scene;

    if (nextScene) {
      setSceneDraft(createSceneDraftFormFromScene(nextScene));
    }
  }, [scene]);

  // Seats the GM may address: a participant with an assigned runtime character.
  // A request aimed anywhere else would create a pending row nobody can answer.
  const m1ResolutionTargets: M1ResolutionTarget[] =
    playerParticipantIds.flatMap((candidateId) => {
      const resource = charactersByParticipant[candidateId];

      if (!resource) {
        return [];
      }

      return [
        {
          activeConditions: resource.overlay.activeConditions,
          characterId: resource.character.id,
          displayName: resource.character.name,
          participantId: candidateId,
        },
      ];
    });

  // Whatever the *server* sent in this role's scene projection. A concealed
  // creature is already absent from a player's copy, so nothing is filtered
  // here - the list is simply shorter for them, which is the point.
  const m1SceneCombatants = (scene?.entities ?? []).filter(
    (entity) => entity.combatant,
  );
  const m1PlayerActiveConditions =
    charactersByParticipant[streamParticipantId]?.overlay.activeConditions ??
    [];

  function pushLog(label: string, payload: unknown): void {
    setEventLog((current) =>
      [
        {
          at: new Date().toLocaleTimeString(),
          id: createCommandId('event'),
          label,
          payload,
        },
        ...current,
      ].slice(0, 40),
    );
  }

  async function refreshPlayerLibraryEntries(): Promise<void> {
    const ownerUserId = user?.id;

    if (!ownerUserId) {
      setLibraryEntries([]);
      setLibraryEntryError(t('runtime.characterLibrary.signInRequired'));
      return;
    }

    setLibraryEntriesLoading(true);
    setLibraryEntryError(null);

    const result = await listCharacterLibraryEntries(ownerUserId);

    if (result.ok) {
      setLibraryEntries(result.data);
      setLibraryEntryError(null);
    } else {
      setLibraryEntries([]);
      setLibraryEntryError(result.error.message);
    }

    setLibraryEntriesLoading(false);
  }

  async function refreshOutboxStatus(): Promise<void> {
    setOutboxStatusLoading(true);
    setOutboxStatusError(null);

    const result = await fetchOutboxStatus();

    if (result.ok) {
      setOutboxStatus(result.response.data);
    } else {
      setOutboxStatus(null);
      setOutboxStatusError(result.error.message);
    }

    setOutboxStatusLoading(false);
  }

  // --- seat switching ------------------------------------------------------
  // Each of these changes which seat this browser looks through, so the hook
  // clears the previous seat's projections. The table on screen was projected
  // for the old seat: leaving it would show a player the GM's copy.

  function switchSessionId(nextSessionId: string): void {
    session.actions.switchIdentity({ sessionId: nextSessionId });
  }

  function switchMode(nextMode: RuntimeMode): void {
    session.actions.switchIdentity({ mode: nextMode });
  }

  function switchPlayerParticipantId(nextParticipantId: string): void {
    session.actions.switchIdentity({
      playerParticipantId: nextParticipantId.trim(),
    });
    setCharacterDraft(createDefaultCharacterDraftForm(playerDisplayName));
  }

  function switchDmParticipantId(nextParticipantId: string): void {
    session.actions.switchIdentity({
      dmParticipantId: nextParticipantId.trim(),
    });
  }

  function resetLocalCockpit(): void {
    session.actions.resetLocal();
    setCharacterDraft(
      createDefaultCharacterDraftForm(defaultPlayer.displayName),
    );
  }

  // --- command adapters ----------------------------------------------------
  // Each of these is the call site's arguments and nothing else. The command
  // itself - payload, ID, credential, error mapping - belongs to its family.

  function requireCharacterId(participantId: string): string {
    const characterId =
      knownCharacterIds[participantId] ??
      charactersByParticipant[participantId]?.character.id;

    if (!characterId) {
      throw new Error(`No assigned character is known for ${participantId}.`);
    }

    return characterId;
  }

  function requirePlayerCharacterId(): string {
    const characterId =
      charactersByParticipant[playerParticipantId]?.character.id ??
      knownCharacterIds[playerParticipantId];

    if (!characterId) {
      throw new Error('Create or recover your character first.');
    }

    return characterId;
  }

  /**
   * Report a precondition the caller cannot satisfy.
   *
   * A few adapters need a character ID before they can name a command at all.
   * Routing the failure through the same state the command families use keeps
   * one error surface rather than a second, quieter one.
   */
  function failCommand(error: unknown): void {
    session.dispatch({
      message: error instanceof Error ? error.message : String(error),
      type: 'command_failed',
    });
  }

  function withCharacterTarget(
    participantId: string,
    run: (target: { characterId: string; participantId: string }) => void,
  ): void {
    try {
      run({ characterId: requireCharacterId(participantId), participantId });
    } catch (error) {
      failCommand(error);
    }
  }

  function withPlayerCharacterId(run: (characterId: string) => void): void {
    try {
      run(requirePlayerCharacterId());
    } catch (error) {
      failCommand(error);
    }
  }

  const createSession = () =>
    commands.session.createSession({ rulesProfileId: 'dnd5e-2024-core' });
  const joinCurrentPlayer = () =>
    commands.session.joinSession({
      displayName: playerDisplayName,
      participantId: playerParticipantId,
    });
  const runFreshDemoSetup = () =>
    commands.demo.runScenario(selectedDemoScenario);
  const joinSamplePlayers = () => commands.demo.joinSamplePlayers();
  const createSampleCharacters = () => commands.demo.createSampleCharacters();
  const finalizeAndAssignCharacters = () =>
    commands.demo.finalizeAndAssignCharacters({
      characterIdByParticipant: Object.fromEntries(
        samplePlayers.map((player) => [
          player.participantId,
          knownCharacterIds[player.participantId] ??
            charactersByParticipant[player.participantId]?.character.id,
        ]),
      ),
    });
  const placeSampleCharacters = () =>
    commands.demo.placeSampleCharacters({
      positions: {
        'player-001': { x: 0, y: 0 },
        'player-002': { x: 1, y: 0 },
      },
    });
  const createAndActivateScene = () =>
    commands.scene.createAndActivateScene({
      scene: defaultDemoScenario.scene,
    });
  const createCustomScene = () =>
    commands.scene.createCustomScene({
      draft: sceneDraft,
      errors: sceneDraftErrors,
    });
  const activateSelectedScene = () =>
    commands.scene.activateSelectedScene({
      sceneId: sceneActivationId || scene?.id || sceneId,
    });
  const placeSceneEntity = () =>
    commands.scene.placeSceneEntity({
      cell: selectedCell,
      draft: sceneEntityDraft,
      errors: sceneEntityDraftErrors,
      target: sceneTarget,
    });
  const updateSceneEntity = () =>
    commands.scene.updateSceneEntity({
      draft: sceneEntityEditDraft,
      entityId: selectedSceneEntityId,
      errors: sceneEntityEditDraftErrors,
      target: sceneTarget,
    });
  const repositionSceneEntity = () =>
    commands.scene.repositionSceneEntity({
      cell: selectedCell,
      entityId: selectedSceneEntityId,
      target: sceneTarget,
    });
  const deleteSceneEntity = () =>
    commands.scene.deleteSceneEntity({
      entityId: selectedSceneEntityId,
      target: sceneTarget,
    });
  const createSceneTransition = () =>
    commands.scene.createSceneTransition({
      cell: selectedCell,
      draft: sceneTransitionDraft,
      errors: transitionDraftErrors,
      target: sceneTarget,
    });
  const updateSceneTransition = () =>
    commands.scene.updateSceneTransition({
      draft: sceneTransitionEditDraft,
      errors: transitionEditDraftErrors,
      target: sceneTarget,
      transitionId: selectedTransitionId,
    });
  const deleteSceneTransition = () =>
    commands.scene.deleteSceneTransition({
      target: sceneTarget,
      transitionId: selectedTransitionId,
    });
  const activateSceneTransition = () =>
    commands.scene.activateSceneTransition({
      target: sceneTarget,
      transitionId: selectedTransitionId,
    });
  const createCombatant = () =>
    commands.combatant.createCombatant({
      cell: selectedCell,
      draft: combatantDraft,
      errors: combatantDraftErrors,
    });
  const repositionCombatant = () =>
    commands.combatant.repositionCombatant({
      cell: selectedCell,
      combatantId: selectedCombatantId,
    });
  const setCombatantHp = () =>
    commands.combatant.setCombatantHp({
      combatantId: selectedCombatantId,
      currentHp: combatantHpDraft,
    });
  const handleSetCombatantHidden = (combatantId: string, hidden: boolean) =>
    commands.combatant.setCombatantHidden({ combatantId, hidden });
  const dmCombatantAttackTarget = () =>
    commands.combatant.combatantAttack({
      combatantId: selectedCombatantId,
      targetParticipantId: selectedTarget,
    });
  const startEncounter = () => commands.encounter.startEncounter();
  const runEncounterCommand = (type: SimpleEncounterCommandType) =>
    commands.encounter.runSimpleEncounterCommand(type);
  const attackTarget = () =>
    commands.encounter.attack({
      sceneId,
      targetCombatantId: mode === 'player' ? selectedTargetCombatantId : '',
      targetParticipantId: selectedTarget,
    });
  const dmSetTurnParticipant = () =>
    commands.encounter.setCurrentTurnParticipant({
      participantId: selectedActor,
    });
  const dmSetTurnCombatant = () =>
    commands.encounter.setCurrentTurnCombatant({
      combatantId: selectedCombatantId,
    });
  const dmSetTurnUsage = () =>
    commands.encounter.setCurrentTurnUsage({ turnUsage: turnUsageDraft });
  const dmEndEncounter = () => commands.encounter.endEncounter();
  const moveSelectedActor = () =>
    commands.session.moveActingCharacter({ cell: selectedCell });
  const recoverReadModels = async (): Promise<void> => {
    await session.actions.recover();
  };

  function dmSetCurrentHp(): void {
    withCharacterTarget(selectedActor, (target) => {
      void commands.encounter.setCharacterCurrentHp({
        currentHp: Number.parseInt(hpDraft, 10),
        target,
      });
    });
  }

  function dmSetConditions(): void {
    withCharacterTarget(selectedActor, (target) => {
      void commands.encounter.setCharacterConditions({
        activeConditions: conditionsDraft
          .split(',')
          .map((condition) => condition.trim())
          .filter(Boolean),
        target,
      });
    });
  }

  function dmRepositionSelected(): void {
    withCharacterTarget(selectedActor, (target) => {
      void commands.character.repositionCharacter({
        cell: selectedCell,
        characterId: target.characterId,
        participantId: target.participantId,
      });
    });
  }

  /**
   * Apply or clear `poisoned` without disturbing the rest of the list.
   *
   * The next list is built from the authoritative conditions rather than from a
   * local toggle, which is what makes applying it twice a no-op instead of two
   * stacked entries.
   */
  function handleSetPoisoned(
    target: M1ResolutionTarget,
    poisoned: boolean,
  ): Promise<void> {
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
  }

  function createPlayerCharacter(): void {
    void commands.character.createPlayerCharacter({
      draft: characterDraft,
      errors: characterDraftErrors,
    });
  }

  function updatePlayerCharacter(): void {
    withPlayerCharacterId((characterId) => {
      void commands.character.updatePlayerCharacter({
        characterId,
        draft: characterDraft,
        errors: characterDraftErrors,
      });
    });
  }

  function finalizePlayerCharacter(): void {
    withPlayerCharacterId((characterId) => {
      void commands.character.finalizePlayerCharacter({ characterId });
    });
  }

  function submitPlayerCharacterForAssignment(): void {
    withPlayerCharacterId((characterId) => {
      void commands.character.submitPlayerCharacterForAssignment({
        characterId,
      });
    });
  }

  function submitSelectedLibraryEntryForAssignment(): void {
    const ownerUserId = user?.id;

    if (!ownerUserId) {
      failCommand(new Error(t('runtime.characterLibrary.signInRequired')));
      return;
    }

    const entry = finalizedLibraryEntries.find(
      (candidate) => candidate.id === selectedLibraryEntryId,
    );

    if (!entry) {
      failCommand(new Error(t('runtime.characterLibrary.selectRequired')));
      return;
    }

    void commands.character.submitLibraryEntryForAssignment({
      entryId: entry.id,
      ownerUserId,
    });
  }

  function dmAssignSelectedLoadedCharacter(): void {
    const characterId =
      charactersByParticipant[selectedActor]?.character.id ??
      knownCharacterIds[selectedActor];

    if (!characterId) {
      failCommand(
        new Error(`No loaded character is known for ${selectedActor}.`),
      );
      return;
    }

    void commands.character.assignCharacterToParticipant({
      characterId,
      participantId: selectedActor,
    });
  }

  function dmAssignPendingCharacter(
    participantId: string,
    characterId: string,
  ): Promise<void> {
    return commands.character.assignPendingCharacter({
      characterId,
      participantId,
    });
  }

  function updateSceneDraftField(
    field: keyof SceneDraftForm,
    value: string,
  ): void {
    setSceneDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSceneEntityDraftField(
    field: 'footprintHeight' | 'footprintWidth' | 'name' | 'type',
    value: string,
  ): void {
    setSceneEntityDraft((current) => ({
      ...current,
      [field]: field === 'type' ? (value as SceneEntityInput['type']) : value,
    }));
  }

  function updateSceneEntityDraftFlag(
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ): void {
    setSceneEntityDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applySceneEntityPreset(presetId: SceneEntityPresetId): void {
    setSceneEntityDraft(createSceneEntityDraftFormFromPreset(presetId));
  }

  function updateSceneEntityEditDraftField(
    field: 'footprintHeight' | 'footprintWidth' | 'name' | 'type',
    value: string,
  ): void {
    setSceneEntityEditDraft((current) => ({
      ...current,
      [field]: field === 'type' ? (value as SceneEntityInput['type']) : value,
    }));
  }

  function updateSceneEntityEditDraftFlag(
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ): void {
    setSceneEntityEditDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function selectPassiveSceneEntity(entityId: string): void {
    setSelectedSceneEntityId(entityId);

    if (entityId) {
      setSelectedTransitionId('');
    }
  }

  // The map reports one entity id; route it to whichever selection the entity
  // actually belongs to so the existing DM panels stay in sync.
  function selectMapSceneEntity(entityId: string): void {
    const entity = scene?.entities.find(
      (candidate) => candidate.id === entityId,
    );

    if (entity?.transition) {
      selectSceneTransitionNode(entityId);
      return;
    }

    selectPassiveSceneEntity(entityId);
  }

  function selectSceneTransitionNode(transitionId: string): void {
    setSelectedTransitionId(transitionId);

    if (transitionId) {
      setSelectedSceneEntityId('');
    }
  }

  function updateSceneTransitionDraftField(
    field:
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'notes'
      | 'targetLabel'
      | 'targetSceneId',
    value: string,
  ): void {
    setSceneTransitionDraft((current) => ({
      ...current,
      [field]:
        field === 'kind' ? (value as SceneTransitionInput['kind']) : value,
    }));
  }

  function updateSceneTransitionDraftFlag(
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ): void {
    setSceneTransitionDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applySceneTransitionPreset(presetId: SceneTransitionPresetId): void {
    setSceneTransitionDraft((current) =>
      createSceneTransitionDraftFormFromPreset(presetId, current),
    );
  }

  function updateSceneTransitionEditDraftField(
    field:
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'notes'
      | 'targetLabel'
      | 'targetSceneId',
    value: string,
  ): void {
    setSceneTransitionEditDraft((current) => ({
      ...current,
      [field]:
        field === 'kind' ? (value as SceneTransitionInput['kind']) : value,
    }));
  }

  function updateSceneTransitionEditDraftFlag(
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ): void {
    setSceneTransitionEditDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateCombatantDraftField(
    field:
      | 'armorClass'
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'speed',
    value: string,
  ): void {
    setCombatantDraft((current) => ({
      ...current,
      [field]: field === 'kind' ? (value as CombatantDraftForm['kind']) : value,
    }));
  }

  function updateCombatantDraftAbility(
    abilityKey: AbilityKey,
    value: string,
  ): void {
    setCombatantDraft((current) => ({
      ...current,
      abilities: {
        ...current.abilities,
        [abilityKey]: value,
      },
    }));
  }

  function updateCombatantDraftHp(
    field: keyof CombatantDraftForm['hp'],
    value: string,
  ): void {
    setCombatantDraft((current) => ({
      ...current,
      hp: {
        ...current.hp,
        [field]: value,
      },
    }));
  }

  function updateCombatantDraftHidden(value: boolean): void {
    setCombatantDraft((current) => ({
      ...current,
      hidden: value,
    }));
  }

  function updateCharacterDraftField(
    field:
      | 'armorClass'
      | 'background'
      | 'className'
      | 'level'
      | 'name'
      | 'notes'
      | 'speciesOrRace'
      | 'speed',
    value: string,
  ): void {
    setCharacterDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateCharacterDraftAbility(
    abilityKey: AbilityKey,
    value: string,
  ): void {
    setCharacterDraft((current) => ({
      ...current,
      abilities: {
        ...current.abilities,
        [abilityKey]: value,
      },
    }));
  }

  function updateCharacterDraftHp(
    field: keyof CharacterDraftForm['hp'],
    value: string,
  ): void {
    setCharacterDraft((current) => ({
      ...current,
      hp: {
        ...current.hp,
        [field]: value,
      },
    }));
  }

  const canUseSession = Boolean(sessionId);
  const grid = scene?.grid ?? {
    cellSizeFeet: 5,
    height: 8,
    width: 8,
  };
  const localizedActiveSceneGuidance = getLocalizedActiveSceneGuidance({
    activeSceneId: sceneId || sessionState?.session.activeSceneId || null,
    mode,
    scene,
    t,
  });
  const busyReason = busyLabel
    ? t('runtime.disabled.busy', { label: busyLabel })
    : null;
  const missingSessionReason = !canUseSession
    ? t('runtime.disabled.missingSession')
    : null;
  const dmOnlySceneReason =
    mode === 'dm' ? null : t('runtime.disabled.dmOnlyScene');
  const sceneDraftErrors = validateSceneDraftForm(sceneDraft);
  const sceneEntityDraftErrors = validateSceneEntityDraftForm({
    form: sceneEntityDraft,
    grid: scene?.grid,
    position: selectedCell,
  });
  const passiveSceneEntities = getPassiveSceneEntities(scene);
  const selectedSceneEntity = passiveSceneEntities.find(
    (entity) => entity.id === selectedSceneEntityId,
  );
  const sceneEntityEditDraftErrors = validateSceneEntityDraftForm({
    form: sceneEntityEditDraft,
    grid: scene?.grid,
    position: selectedSceneEntity?.position ?? selectedCell,
  });
  const transitionSceneEntities = getTransitionSceneEntities(scene);
  const selectedTransition = transitionSceneEntities.find(
    (entity) => entity.id === selectedTransitionId,
  );
  const knownSceneOptions = getKnownSceneOptions(knownScenesById);
  const transitionDraftErrors = validateSceneTransitionDraftForm({
    form: sceneTransitionDraft,
    grid: scene?.grid,
    position: selectedCell,
  });
  const transitionEditDraftErrors = validateSceneTransitionDraftForm({
    form: sceneTransitionEditDraft,
    grid: scene?.grid,
    position: selectedTransition?.position ?? selectedCell,
  });
  const localizedTransitionDraftErrors = transitionDraftErrors.map((error) =>
    localizeTransitionDraftError(error, t),
  );
  const localizedTransitionEditDraftErrors = transitionEditDraftErrors.map(
    (error) => localizeTransitionDraftError(error, t),
  );
  const combatants = getCombatantEntities(scene);
  const attackableCombatants = getAttackableCombatantEntities(scene);
  const selectedCombatant = combatants.find(
    (combatant) => combatant.id === selectedCombatantId,
  );
  const combatantDraftErrors = validateCombatantDraftForm({
    form: combatantDraft,
    grid: scene?.grid,
    position: selectedCell,
  });
  const localizedCombatantDraftErrors = combatantDraftErrors.map((error) =>
    localizeCombatantDraftError(error, t),
  );
  const sceneDraftReason =
    sceneDraftErrors.length > 0
      ? `Fix the scene draft first: ${sceneDraftErrors[0]}`
      : null;
  const sceneEntityDraftReason =
    sceneEntityDraftErrors.length > 0
      ? `Fix the entity draft first: ${sceneEntityDraftErrors[0]}`
      : null;
  const sceneEntityEditDraftReason =
    sceneEntityEditDraftErrors.length > 0
      ? `Fix the entity edit form first: ${sceneEntityEditDraftErrors[0]}`
      : null;
  const createCustomSceneReason =
    busyReason ?? missingSessionReason ?? dmOnlySceneReason ?? sceneDraftReason;
  const activateSceneReason =
    busyReason ??
    missingSessionReason ??
    dmOnlySceneReason ??
    ((sceneActivationId || scene?.id || sceneId).trim()
      ? null
      : 'Enter or create a scene ID to activate.');
  const placeSceneEntityReason =
    busyReason ??
    missingSessionReason ??
    dmOnlySceneReason ??
    (scene ? null : 'Create, activate, or recover a scene first.') ??
    sceneEntityDraftReason;
  const selectedPassiveEntityReason =
    busyReason ??
    missingSessionReason ??
    dmOnlySceneReason ??
    (scene ? null : 'Create, activate, or recover a scene first.') ??
    (selectedSceneEntity ? null : 'Select a passive scene entity first.');
  const updateSceneEntityReason =
    selectedPassiveEntityReason ?? sceneEntityEditDraftReason;
  const repositionSceneEntityReason = selectedPassiveEntityReason;
  const deleteSceneEntityReason = selectedPassiveEntityReason;
  const transitionDraftReason =
    localizedTransitionDraftErrors.length > 0
      ? t('runtime.sceneBuilder.transitions.validation.fixDraft', {
          error: localizedTransitionDraftErrors[0]!,
        })
      : null;
  const transitionEditDraftReason =
    localizedTransitionEditDraftErrors.length > 0
      ? t('runtime.sceneBuilder.transitions.validation.fixEdit', {
          error: localizedTransitionEditDraftErrors[0]!,
        })
      : null;
  const createTransitionReason =
    busyReason ??
    missingSessionReason ??
    dmOnlySceneReason ??
    (scene ? null : 'Create, activate, or recover a source scene first.') ??
    transitionDraftReason;
  const selectedTransitionReason =
    busyReason ??
    missingSessionReason ??
    dmOnlySceneReason ??
    (scene ? null : 'Create, activate, or recover a source scene first.') ??
    (selectedTransition ? null : 'Select a transition node first.');
  const updateTransitionReason =
    selectedTransitionReason ?? transitionEditDraftReason;
  const deleteTransitionReason = selectedTransitionReason;
  const activateTransitionReason = selectedTransitionReason;
  const combatantDraftReason =
    localizedCombatantDraftErrors.length > 0
      ? t('runtime.combatants.validation.fixDraft', {
          error: localizedCombatantDraftErrors[0]!,
        })
      : null;
  const createCombatantReason =
    busyReason ??
    missingSessionReason ??
    dmOnlySceneReason ??
    (scene ? null : 'Create, activate, or recover a scene first.') ??
    combatantDraftReason;
  const selectedCombatantReason =
    busyReason ??
    missingSessionReason ??
    dmOnlySceneReason ??
    (scene ? null : 'Create, activate, or recover a scene first.') ??
    (selectedCombatantId ? null : t('runtime.disabled.selectCombatant'));
  const combatantAttackReason = localizeRuntimeDisabledReason(
    getDmCombatantActionDisabledReason({
      busyLabel,
      currentTurnCombatantId,
      mode,
      scene,
      selectedCombatantId,
      sessionId,
      targetParticipantId: selectedTarget,
    }),
    t,
  );
  const playerCharacter = charactersByParticipant[playerParticipantId];
  const isPlayerJoined = Boolean(
    sessionState?.participants.some(
      (participant) => participant.id === playerParticipantId,
    ),
  );
  const playerAssignedCharacterId =
    sessionState?.participants.find(
      (participant) => participant.id === playerParticipantId,
    )?.characterId ?? null;
  const playerPendingCharacterId =
    sessionState?.participants.find(
      (participant) => participant.id === playerParticipantId,
    )?.pendingCharacterId ?? null;
  const playerCharacterId =
    playerCharacter?.character.id ??
    playerPendingCharacterId ??
    knownCharacterIds[playerParticipantId];
  const isPlayerCharacterAssigned = Boolean(
    playerCharacterId && playerAssignedCharacterId === playerCharacterId,
  );
  const isPlayerCharacterSubmitted = Boolean(
    playerCharacterId && playerPendingCharacterId === playerCharacterId,
  );
  const characterDraftErrors = validateCharacterDraftForm(characterDraft);
  const playerCharacterSetupReason =
    busyReason ??
    missingSessionReason ??
    (isPlayerJoined
      ? null
      : 'Join or recover this session as the player first.');
  const characterDraftReason =
    characterDraftErrors.length > 0
      ? `Fix the character sheet first: ${characterDraftErrors[0]}`
      : null;
  const createPlayerCharacterReason =
    playerCharacterSetupReason ??
    characterDraftReason ??
    (playerCharacter
      ? 'A character is already loaded for this participant.'
      : null);
  const updatePlayerCharacterReason =
    playerCharacterSetupReason ??
    characterDraftReason ??
    (playerCharacter ? null : 'Create or recover your character first.');
  const finalizePlayerCharacterReason =
    playerCharacterSetupReason ??
    (playerCharacter ? null : 'Create or recover your character first.') ??
    (playerCharacter?.character.status === 'ready'
      ? 'This character is already finalized.'
      : null);
  const submitPlayerCharacterReason =
    playerCharacterSetupReason ??
    (playerCharacter ? null : 'Create or recover your character first.') ??
    (playerCharacter?.character.status === 'ready'
      ? null
      : 'Finalize this character before submitting it.') ??
    (isPlayerCharacterAssigned
      ? 'This character is already assigned.'
      : null) ??
    (isPlayerCharacterSubmitted
      ? 'This character is already waiting for DM assignment.'
      : null);
  const selectedLibraryEntry =
    finalizedLibraryEntries.find(
      (entry) => entry.id === selectedLibraryEntryId,
    ) ?? null;
  const libraryEntrySubmissionBlocker = getLibraryEntrySubmissionBlocker({
    busyLabel:
      busyLabel ?? (libraryEntriesLoading ? 'character library' : null),
    finalizedEntryCount: finalizedLibraryEntries.length,
    hasAuthUser: Boolean(user),
    isPlayerCharacterAssigned,
    isPlayerCharacterSubmitted,
    isPlayerJoined,
    selectedEntryId: selectedLibraryEntryId,
    sessionId,
  });
  const libraryEntrySubmitDisabledReason = libraryEntrySubmissionBlocker
    ? getLibraryEntryBlockerMessage(libraryEntrySubmissionBlocker)
    : null;
  const playerParticipants = participants.filter(
    (participant) => participant.role === 'player',
  );
  const targetParticipants = playerParticipants.filter(
    (participant) => participant.id !== actingParticipantId,
  );
  const attackTargetOptions =
    mode === 'player'
      ? [
          ...targetParticipants.map((participant) => ({
            label: `${participant.displayName} (${participant.id})`,
            value: `participant:${participant.id}`,
          })),
          ...attackableCombatants.map((combatant) => ({
            label: `${combatant.name} (${combatant.combatant.kind}, HP ${combatant.combatant.hp.current}/${combatant.combatant.hp.max})`,
            value: `combatant:${combatant.id}`,
          })),
        ]
      : targetParticipants.map((participant) => ({
          label: `${participant.displayName} (${participant.id})`,
          value: participant.id,
        }));
  const selectedAttackTargetValue =
    mode === 'player' && selectedTargetCombatantId
      ? `combatant:${selectedTargetCombatantId}`
      : mode === 'player'
        ? `participant:${selectedTarget}`
        : selectedTarget;
  const hasValidAttackTarget = attackTargetOptions.some(
    (option) => option.value === selectedAttackTargetValue,
  );
  const currentTurnName = getCurrentTurnLabel({
    encounter,
    participants,
    scene,
  });
  const currentTurnDisplayName =
    currentTurnName === 'No active turn'
      ? t('runtime.actionEconomy.noEncounter')
      : currentTurnName;
  const currentTurnRailSummary = getCurrentTurnRailSummary({
    charactersByParticipant,
    encounter,
    participants,
    scene,
  });
  const disabledReasons = localizeRuntimeDisabledReasons(
    getRuntimeDisabledReasons({
      actingParticipantId,
      activeSceneKnown: Boolean(activeScene || sceneId),
      activeSceneLoaded: Boolean(activeScene),
      activeScenePlacementCount: activeScene?.placedCharacters.length ?? 0,
      busyLabel,
      encounterLoaded: Boolean(encounter),
      mode,
      playerDisplayName,
      playerParticipantId,
      playerParticipantIds,
      selectedActorHasCharacter: Boolean(
        knownCharacterIds[actingParticipantId] ??
        charactersByParticipant[actingParticipantId]?.character.id,
      ),
      sessionId,
      hasValidAttackTarget,
      targetParticipantId: selectedTarget,
    }),
    t,
  );
  const movementFeedbackSummary = getMovementFeedbackSummary({
    actingParticipantId,
    activeScene,
    charactersByParticipant,
    encounter,
    grid,
    moveDisabledReason: disabledReasons.move,
    participants,
    selectedCell,
  });
  // Name and HP are all the tactical map needs from a character resource; the
  // map stays decoupled from the full runtime character shape.
  const mapCharacterSummaries = useMemo(() => {
    const summaries: Record<
      string,
      { name: string; hp: { current: number; max: number } } | undefined
    > = {};

    for (const [entryParticipantId, resource] of Object.entries(
      charactersByParticipant,
    )) {
      if (!resource) {
        continue;
      }

      summaries[entryParticipantId] = {
        hp: {
          current: resource.character.hp.current,
          max: resource.character.hp.max,
        },
        name: resource.character.name,
      };
    }

    return summaries;
  }, [charactersByParticipant]);
  const playerAttackDisabledReason =
    disabledReasons.attack ??
    (currentTurnCombatantId
      ? t('runtime.disabled.currentTurnCombatant')
      : null);
  const lastCombatEvent =
    eventLog.find(
      (entry): entry is EventLogEntry & { payload: CombatEvent } =>
        isSessionStreamEvent(entry.payload) &&
        entry.payload.type === 'combat_event',
    )?.payload ?? null;
  const lastEncounterEvent =
    eventLog.find(
      (
        entry,
      ): entry is EventLogEntry & {
        payload: Extract<SessionStreamEvent, { type: 'encounter_state' }>;
      } =>
        isSessionStreamEvent(entry.payload) &&
        entry.payload.type === 'encounter_state',
    )?.payload ?? null;
  const actionTargetFeedbackSummary = getActionTargetFeedbackSummary({
    attackDisabledReason: playerAttackDisabledReason,
    charactersByParticipant,
    lastCombatEvent,
    participants,
    scene,
    selectedTargetCombatantId,
    selectedTargetParticipantId: selectedTarget,
  });
  const encounterStatusSummary = getEncounterStatusSummary({
    encounter,
    lastCombatEvent,
    lastEncounterEvent,
    participants,
    scene,
  });
  const actionEconomyFeedbackSummary = getActionEconomyFeedbackSummary({
    actorTurnActionDisabledReason: disabledReasons.actorTurnAction,
    currentTurn: currentTurnRailSummary,
    lastEncounterEvent,
  });
  const actionEconomyAction = getActionEconomyResource(
    actionEconomyFeedbackSummary,
    'action',
    t('runtime.actionEconomy.unavailable'),
  );
  const actionEconomyBonusAction = getActionEconomyResource(
    actionEconomyFeedbackSummary,
    'bonusAction',
    t('runtime.actionEconomy.unavailable'),
  );
  const actionEconomyReaction = getActionEconomyResource(
    actionEconomyFeedbackSummary,
    'reaction',
    t('runtime.actionEconomy.unavailable'),
  );
  const playerReadyActionCount = actionEconomyFeedbackSummary.resources.filter(
    (resource) => resource.ready,
  ).length;
  const selectedActorAssignedCharacterId =
    sessionState?.participants.find(
      (participant) => participant.id === selectedActor,
    )?.characterId ?? null;
  const selectedActorPendingCharacterId =
    sessionState?.participants.find(
      (participant) => participant.id === selectedActor,
    )?.pendingCharacterId ?? null;
  const selectedActorKnownCharacterId =
    charactersByParticipant[selectedActor]?.character.id ??
    selectedActorPendingCharacterId ??
    knownCharacterIds[selectedActor];
  const selectedActorNeedsAssignment = Boolean(
    selectedActorKnownCharacterId &&
    selectedActorAssignedCharacterId !== selectedActorKnownCharacterId,
  );
  const dmAssignSelectedReason =
    busyReason ??
    missingSessionReason ??
    (mode === 'dm' ? null : t('runtime.disabled.dmOnlyControl')) ??
    (selectedActorKnownCharacterId
      ? selectedActorNeedsAssignment
        ? null
        : t('runtime.disabled.selectedAlreadyAssigned')
      : t('runtime.disabled.recoverCharacter'));
  const activeSceneLabel = scene
    ? `${scene.name} (${scene.id})`
    : (activeScene?.activeSceneId ?? sceneId) || t('common.none');
  const playerPlacement = activeScene?.placedCharacters.find(
    (placement) => placement.participantId === playerParticipantId,
  );
  const pendingAssignmentRequests = getPendingAssignmentRequests({
    charactersByParticipant,
    sessionState,
  });
  const assignedPlayerCharacterCount = playerParticipants.filter(
    (participant) => Boolean(participant.characterId),
  ).length;
  const dmTableSetupChecklist = getDmTableSetupChecklist({
    activeSceneLoaded: Boolean(activeScene),
    assignedCharacterCount: assignedPlayerCharacterCount,
    encounterLoaded: Boolean(encounter),
    pendingAssignmentCount: pendingAssignmentRequests.length,
    placedCharacterCount: activeScene?.placedCharacters.length ?? 0,
    playerCount: playerParticipants.length,
    sessionId,
  });
  const playerNextStep = getPlayerNextStep({
    hasActiveScene: Boolean(activeScene),
    hasCharacter: Boolean(playerCharacter),
    hasEncounter: Boolean(encounter),
    isCharacterReady: playerCharacter?.character.status === 'ready',
    isCharacterAssigned: isPlayerCharacterAssigned,
    isCharacterSubmitted: isPlayerCharacterSubmitted,
    isCurrentTurn: currentTurnParticipantId === playerParticipantId,
    isJoined: isPlayerJoined,
    isPlaced: Boolean(playerPlacement),
    sessionId,
  });
  const playerReadinessSummary = getPlayerReadinessSummary({
    attackReady: actionTargetFeedbackSummary.attackReady,
    currentActorLabel: currentTurnDisplayName,
    hasActiveScene: Boolean(activeScene),
    hasCharacter: Boolean(playerCharacter),
    hasEncounter: Boolean(encounter),
    isCharacterAssigned: isPlayerCharacterAssigned,
    isCharacterReady: playerCharacter?.character.status === 'ready',
    isCharacterSubmitted: isPlayerCharacterSubmitted,
    isCurrentTurn: currentTurnParticipantId === playerParticipantId,
    isJoined: isPlayerJoined,
    isPlaced: Boolean(playerPlacement),
    moveReady: movementFeedbackSummary.moveReady,
    playerDisplayName,
    playerParticipantId,
    readyActionCount: playerReadyActionCount,
    sessionId,
  });
  const recoveryReliabilitySummary = getRecoveryReliabilitySummary({
    activeSceneId: sessionState?.session.activeSceneId ?? null,
    activeSceneLoaded: Boolean(activeScene),
    characterCount: Object.keys(charactersByParticipant).length,
    encounterLoaded: Boolean(encounter),
    recoveryNotes,
    sceneLoaded: Boolean(scene),
    sessionId,
  });
  const runtimeStatusOverview = getRuntimeStatusOverview({
    dmTableSetupChecklist,
    encounterStatusSummary,
    mode,
    playerReadinessSummary,
    recoveryReliabilitySummary,
  });
  const runtimeReadinessRoster = getRuntimeReadinessRoster({
    activeScene,
    encounter,
    sessionState,
  });
  const feedEntries = eventLog
    .flatMap((entry) =>
      isSessionStreamEvent(entry.payload)
        ? [
            {
              ...entry,
              summary: localizeRuntimeEventDescriptor(
                describeSessionStreamEvent(entry.payload),
                t,
              ),
            },
          ]
        : [],
    )
    .slice(0, 8);

  function getLibraryEntryBlockerMessage(
    blocker: LibraryEntrySubmissionBlocker,
  ): string {
    switch (blocker) {
      case 'already_assigned':
        return t('runtime.characterLibrary.blocker.alreadyAssigned');
      case 'already_submitted':
        return t('runtime.characterLibrary.blocker.alreadySubmitted');
      case 'busy':
        return t('runtime.characterLibrary.blocker.busy');
      case 'missing_auth':
        return t('runtime.characterLibrary.blocker.missingAuth');
      case 'missing_selection':
        return t('runtime.characterLibrary.blocker.missingSelection');
      case 'missing_session':
        return t('runtime.characterLibrary.blocker.missingSession');
      case 'no_finalized_entries':
        return t('runtime.characterLibrary.blocker.noFinalizedEntries');
      case 'not_joined':
        return t('runtime.characterLibrary.blocker.notJoined');
    }
  }

  const shouldPromoteTurnTargetPanel =
    mode === 'dm'
      ? Boolean(encounter)
      : isPlayerCharacterAssigned ||
        currentTurnParticipantId === playerParticipantId;

  function renderTurnTargetPanel() {
    return (
      <Panel
        description={t('runtime.turnTarget.description')}
        eyebrow={t('runtime.turnTarget.eyebrow')}
        title={t('runtime.turnTarget.title')}
      >
        <div className="grid gap-3">
          <EncounterStatusFeedback summary={encounterStatusSummary} t={t} />
          {encounter ? (
            <div className="grid gap-2 rounded-2xl border border-amber-500/15 bg-black/25 p-3 text-sm">
              <StatusRow
                label={t('runtime.turnTarget.usage')}
                value={t('runtime.turnTarget.usageValue', {
                  action: t(
                    encounter.currentTurnUsage.actionUsed
                      ? 'common.yes'
                      : 'common.no',
                  ),
                  bonus: t(
                    encounter.currentTurnUsage.bonusActionUsed
                      ? 'common.yes'
                      : 'common.no',
                  ),
                  movement: String(encounter.currentTurnUsage.movementUsed),
                  reaction: t(
                    encounter.currentTurnUsage.reactionUsed
                      ? 'common.yes'
                      : 'common.no',
                  ),
                })}
              />
              <div className="pt-2">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300/70">
                  {t('runtime.turnTarget.turnOrder')}
                </p>
                <div className="mt-2 grid gap-1">
                  {encounter.participants.map((participant, index) => {
                    const isCombatant = 'combatantId' in participant;
                    const combatant = isCombatant
                      ? combatants.find(
                          (entity) => entity.id === participant.combatantId,
                        )
                      : null;

                    return (
                      <div
                        className={`rounded-xl border px-2 py-1 text-xs ${
                          index === encounter.currentTurnIndex
                            ? 'border-amber-200/35 bg-amber-900/30 text-amber-50'
                            : 'border-amber-500/10 bg-black/20 text-amber-100/65'
                        }`}
                        key={
                          isCombatant
                            ? participant.combatantId
                            : participant.participantId
                        }
                      >
                        {index + 1}.{' '}
                        {isCombatant
                          ? `${combatant?.name ?? participant.combatantId} (DM ${participant.participantId})`
                          : getCurrentTurnLabel({
                              encounter: {
                                ...encounter,
                                currentTurnIndex: index,
                              },
                              participants,
                              scene,
                            })}{' '}
                        {t('runtime.turnTarget.initiative', {
                          initiative: String(participant.initiative),
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          <SelectField
            label={t('runtime.turnTarget.target')}
            onChange={(value) => {
              if (mode !== 'player') {
                setSelectedTarget(value);
                return;
              }

              const [targetKind, targetId] = value.split(':', 2);

              if (targetKind === 'combatant' && targetId) {
                setSelectedTargetCombatantId(targetId);
                return;
              }

              if (targetKind === 'participant' && targetId) {
                setSelectedTarget(targetId);
                setSelectedTargetCombatantId('');
              }
            }}
            options={attackTargetOptions}
            value={selectedAttackTargetValue}
          />
          <ActionTargetFeedback summary={actionTargetFeedbackSummary} t={t} />
          <ActionEconomyFeedback summary={actionEconomyFeedbackSummary} t={t} />
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              disabled={Boolean(actionEconomyAction.blockedReason)}
              disabledReason={actionEconomyAction.blockedReason ?? undefined}
              label={t('runtime.turnTarget.useAction')}
              onClick={() =>
                runEncounterCommand(actionEconomyAction.commandType)
              }
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(actionEconomyBonusAction.blockedReason)}
              disabledReason={
                actionEconomyBonusAction.blockedReason ?? undefined
              }
              label={t('runtime.turnTarget.useBonus')}
              onClick={() =>
                runEncounterCommand(actionEconomyBonusAction.commandType)
              }
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(actionEconomyReaction.blockedReason)}
              disabledReason={actionEconomyReaction.blockedReason ?? undefined}
              label={t('runtime.turnTarget.useReaction')}
              onClick={() =>
                runEncounterCommand(actionEconomyReaction.commandType)
              }
              variant="secondary"
            />
            {mode === 'dm' ? (
              <ActionButton
                disabled={Boolean(disabledReasons.dmEncounter)}
                disabledReason={disabledReasons.dmEncounter ?? undefined}
                label={t('runtime.turnTarget.advanceTurn')}
                onClick={() => runEncounterCommand('advance_turn')}
                variant="secondary"
              />
            ) : null}
          </div>
          <ActionButton
            disabled={Boolean(playerAttackDisabledReason)}
            disabledReason={playerAttackDisabledReason ?? undefined}
            label={t('runtime.turnTarget.attackTarget')}
            onClick={attackTarget}
          />
        </div>
      </Panel>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,0.12),transparent_30%),linear-gradient(135deg,#0b1020_0%,#111827_52%,#0f172a_100%)]" />

      <div className="relative mx-auto flex max-w-[1560px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/88 p-5 shadow-xl shadow-black/25 backdrop-blur">
          <nav className="mb-4 flex flex-wrap gap-2 text-sm font-bold">
            <Link
              className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-300 transition hover:border-slate-500 hover:text-slate-50"
              href="/"
            >
              {t('common.dashboard')}
            </Link>
            <Link
              className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-slate-300 transition hover:border-slate-500 hover:text-slate-50"
              href="/characters"
            >
              {t('runtime.nav.characters')}
            </Link>
            <LanguageSwitcher />
          </nav>
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                {t('runtime.eyebrow')}
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">
                {t('runtime.title')}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                {t('runtime.summary')}
              </p>
            </div>
            <div className={statusGridClassName}>
              <StatusBadge
                label={
                  mode === 'dm'
                    ? t('runtime.mode.dm')
                    : t('runtime.mode.player')
                }
                tone={mode === 'dm' ? 'warning' : 'success'}
              />
              <StatusBadge
                label={
                  session.streamEnabled
                    ? t('runtime.status.stream', { status: stream.status })
                    : t('runtime.status.streamIdle')
                }
                tone={session.streamEnabled ? 'success' : 'info'}
              />
              <StatusBadge
                label={
                  busyLabel
                    ? t('runtime.status.busy', { label: busyLabel })
                    : t('common.ready')
                }
                tone={busyLabel ? 'warning' : 'success'}
              />
              {mode === 'dm' ? (
                <StatusBadge
                  label={outboxStatusLabel}
                  tone={outboxStatusView.tone}
                />
              ) : null}
              <div className={statusServerClassName}>
                <span>
                  <span className="font-semibold text-amber-200">
                    {t('common.server')}
                  </span>{' '}
                  {runtimeServerUrl}
                </span>
                {mode === 'dm' ? (
                  <button
                    className="rounded-lg border border-slate-600 px-2 py-1 text-[11px] font-bold uppercase text-slate-200 transition hover:border-amber-300 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={outboxStatusLoading}
                    onClick={refreshOutboxStatus}
                    type="button"
                  >
                    {t('runtime.outbox.refresh')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {commandError ? (
          <Notice title={t('runtime.notice.commandFailed')} tone="danger">
            {commandError}
          </Notice>
        ) : null}
        {recoveryNotes.length ? (
          <Notice title={t('runtime.notice.recoveryWithNotes')} tone="warning">
            <ul className="list-disc space-y-1 pl-5">
              {recoveryNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {mode === 'player' ? (
          <Notice
            title={getLocalizedPlayerNextStepTitle(playerNextStep, t)}
            tone={playerNextStep.tone}
          >
            {getLocalizedPlayerNextStepDetail(playerNextStep, t)}
          </Notice>
        ) : null}
        <Notice
          title={localizedActiveSceneGuidance.title}
          tone={localizedActiveSceneGuidance.tone}
        >
          {localizedActiveSceneGuidance.detail}
        </Notice>

        <section className="rounded-3xl border border-amber-500/25 bg-[#24160f]/90 p-4 shadow-xl shadow-black/30">
          <div className="grid gap-4 xl:grid-cols-[220px_minmax(220px,1fr)_minmax(220px,1fr)_auto] xl:items-end">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              <ModeButton
                active={mode === 'dm'}
                label={t('runtime.mode.dm')}
                onClick={() => switchMode('dm')}
                tone="dm"
              />
              <ModeButton
                active={mode === 'player'}
                label={t('runtime.mode.player')}
                onClick={() => switchMode('player')}
                tone="player"
              />
            </div>
            <LabeledInput
              label={t('runtime.session.sessionId')}
              onChange={switchSessionId}
              placeholder={t('runtime.session.sessionIdPlaceholder')}
              value={sessionId}
            />
            {mode === 'dm' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledInput
                  label={t('runtime.session.dmParticipantId')}
                  onChange={switchDmParticipantId}
                  value={dmParticipantId}
                />
                <LabeledInput
                  label={t('runtime.session.dmDisplayName')}
                  onChange={(value) =>
                    session.setSeats((current) => ({
                      ...current,
                      dmDisplayName: value,
                    }))
                  }
                  value={dmDisplayName}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledInput
                  label={t('runtime.session.playerParticipantId')}
                  onChange={switchPlayerParticipantId}
                  value={playerParticipantId}
                />
                <LabeledInput
                  label={t('runtime.session.playerDisplayName')}
                  onChange={(value) =>
                    session.setSeats((current) => ({
                      ...current,
                      playerDisplayName: value,
                    }))
                  }
                  value={playerDisplayName}
                />
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[320px]">
              {mode === 'dm' ? (
                <ActionButton
                  disabled={Boolean(busyLabel)}
                  disabledReason={busyReason ?? undefined}
                  label={t('runtime.session.create')}
                  onClick={createSession}
                />
              ) : (
                <ActionButton
                  disabled={Boolean(disabledReasons.joinPlayer)}
                  disabledReason={disabledReasons.joinPlayer ?? undefined}
                  label={t('runtime.session.join')}
                  onClick={joinCurrentPlayer}
                />
              )}
              <ActionButton
                disabled={Boolean(disabledReasons.recover)}
                disabledReason={
                  disabledReasons.recover ??
                  missingSessionReason ??
                  busyReason ??
                  undefined
                }
                label={t('runtime.session.recover')}
                onClick={recoverReadModels}
                variant="secondary"
              />
              <ActionButton
                disabled={Boolean(missingSessionReason)}
                disabledReason={missingSessionReason ?? undefined}
                label={
                  session.streamEnabled
                    ? t('runtime.session.disconnectSse')
                    : t('runtime.session.subscribeSse')
                }
                onClick={() =>
                  session.streamEnabled
                    ? session.actions.unsubscribe()
                    : session.actions.resubscribe()
                }
                variant={session.streamEnabled ? 'danger' : 'secondary'}
              />
              <ActionButton
                disabled={Boolean(busyLabel)}
                disabledReason={busyReason ?? undefined}
                label={t('runtime.session.localReset')}
                onClick={resetLocalCockpit}
                variant="danger"
              />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-amber-100/65">
            {t('runtime.roleNotice', {
              name: streamDisplayName,
              participantId: streamParticipantId,
            })}{' '}
            {stream.error ? (
              <span className="font-semibold text-red-200">{stream.error}</span>
            ) : null}
          </p>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px]">
          <div className="grid content-start gap-5">
            <Panel
              description={t('runtime.grid.description', {
                scene: activeSceneLabel,
              })}
              eyebrow={
                mode === 'dm'
                  ? t('runtime.grid.dmEyebrow')
                  : t('runtime.grid.playerEyebrow')
              }
              title={t('runtime.grid.title')}
              tone={mode}
            >
              <CurrentTurnRail summary={currentTurnRailSummary} t={t} />
              <MovementFeedback summary={movementFeedbackSummary} t={t} />
              <TacticalMap
                activeScene={activeScene}
                characterNamesByParticipant={mapCharacterSummaries}
                currentTurnCombatantId={currentTurnCombatantId}
                currentTurnParticipantId={currentTurnParticipantId}
                mode={mode}
                movementBudgetFeet={
                  movementFeedbackSummary.movementRemainingFeet
                }
                movingParticipantId={actingParticipantId || null}
                onSelectCell={setSelectedCell}
                onSelectCombatant={setSelectedCombatantId}
                onSelectParticipant={setSelectedTarget}
                onSelectSceneEntity={selectMapSceneEntity}
                ownParticipantId={streamParticipantId || null}
                scene={scene}
                selectedCell={selectedCell}
                selectedCombatantId={selectedCombatantId}
                selectedSceneEntityId={selectedSceneEntityId}
                targetCombatantId={selectedTargetCombatantId}
                targetParticipantId={selectedTarget}
              />
              <div className="mt-4 grid gap-3 rounded-2xl border border-amber-500/15 bg-black/20 p-3 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto] md:items-end">
                {mode === 'dm' ? (
                  <SelectField
                    label={t('runtime.grid.actingToken')}
                    onChange={setSelectedActor}
                    options={playerParticipants.map((participant) => ({
                      label: `${participant.displayName} (${participant.id})`,
                      value: participant.id,
                    }))}
                    value={selectedActor}
                  />
                ) : (
                  <div className="rounded-2xl border border-sky-300/20 bg-sky-950/25 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200">
                      {t('runtime.grid.actingToken')}
                    </p>
                    <p className="mt-1 break-all font-semibold text-amber-50">
                      {playerDisplayName} ({playerParticipantId})
                    </p>
                  </div>
                )}
                <NumberInput
                  label="X"
                  onChange={(x) =>
                    setSelectedCell((cell) => ({
                      ...cell,
                      x,
                    }))
                  }
                  value={selectedCell.x}
                />
                <NumberInput
                  label="Y"
                  onChange={(y) =>
                    setSelectedCell((cell) => ({
                      ...cell,
                      y,
                    }))
                  }
                  value={selectedCell.y}
                />
                <div className="grid gap-2 sm:grid-cols-2 md:min-w-[260px]">
                  <ActionButton
                    disabled={Boolean(
                      movementFeedbackSummary.moveBlockedReason,
                    )}
                    disabledReason={
                      movementFeedbackSummary.moveBlockedReason ?? undefined
                    }
                    label={
                      mode === 'dm'
                        ? t('runtime.grid.moveActor')
                        : t('runtime.grid.moveToken')
                    }
                    onClick={moveSelectedActor}
                    variant="secondary"
                  />
                  {mode === 'dm' ? (
                    <ActionButton
                      disabled={Boolean(disabledReasons.dmCharacter)}
                      disabledReason={disabledReasons.dmCharacter ?? undefined}
                      label={t('runtime.grid.dmReposition')}
                      onClick={dmRepositionSelected}
                    />
                  ) : null}
                </div>
              </div>
            </Panel>

            <LatestEventFeed entries={feedEntries} t={t} />

            <Panel
              description={t('runtime.debug.description')}
              eyebrow={t('runtime.debug.eyebrow')}
              title={t('runtime.debug.title')}
            >
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-amber-200 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-amber-300">
                  {t('runtime.debug.summary')}
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <JsonPreview
                    value={lastResponse ?? { status: 'No command yet' }}
                  />
                  <JsonPreview value={sessionState ?? { sessionId }} />
                  <div className="max-h-96 overflow-auto rounded-2xl border border-amber-500/15 bg-black/50 p-3 text-xs text-amber-50 lg:col-span-2">
                    {eventLog.length ? (
                      eventLog.map((entry) => (
                        <details
                          className="border-b border-amber-500/10 py-2"
                          key={entry.id}
                        >
                          <summary className="cursor-pointer text-amber-200">
                            {entry.at} {entry.label}
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-amber-100/80">
                            {JSON.stringify(entry.payload, null, 2)}
                          </pre>
                        </details>
                      ))
                    ) : (
                      <EmptyState
                        detail={t('runtime.debug.emptyDetail')}
                        title={t('runtime.debug.emptyTitle')}
                      />
                    )}
                  </div>
                </div>
              </details>
            </Panel>
          </div>

          <aside className="grid content-start gap-5">
            <RecoveryReliabilityPanel
              summary={recoveryReliabilitySummary}
              t={t}
            />
            <M1FeedbackLayer
              items={m1.feedback}
              onDismiss={m1.clearFeedback}
              prefersReducedMotion={prefersReducedMotion}
              statusKey={
                describeStreamStatus(stream.status, Boolean(sessionState))
                  .messageKey
              }
            />

            {mode === 'dm' ? (
              <M1GmPanel
                busyLabel={m1.busyLabel}
                combatants={m1SceneCombatants}
                errorKey={m1.errorKey}
                onCancelRequest={(request) => void m1.cancelRequest(request)}
                onRequestResolution={(input) =>
                  void m1.requestResolution(input)
                }
                onSetCombatantHidden={handleSetCombatantHidden}
                onSetPoisoned={handleSetPoisoned}
                onUpdateIntentStatus={(intentId, status) =>
                  void m1.updateIntentStatus(intentId, status)
                }
                participantId={streamParticipantId}
                table={m1.table}
                targets={m1ResolutionTargets}
              />
            ) : (
              <M1PlayerPanel
                activeConditions={m1PlayerActiveConditions}
                busyRequestId={m1.busyRequestId}
                errorKey={m1.errorKey}
                intentBusy={m1.busyLabel === 'submit_player_intent'}
                onSubmitIntent={(text) => void m1.submitIntent(text)}
                onSubmitResolution={(request) =>
                  void m1.submitResolution(request)
                }
                participantId={streamParticipantId}
                table={m1.table}
              />
            )}

            <RuntimeStatusOverviewPanel
              overview={runtimeStatusOverview}
              t={t}
            />
            <PlayerReadinessRosterPanel roster={runtimeReadinessRoster} t={t} />

            {mode === 'dm' && shouldPromoteTurnTargetPanel
              ? renderTurnTargetPanel()
              : null}

            {mode === 'dm' ? (
              <DmTableSetupPanel checklist={dmTableSetupChecklist} t={t} />
            ) : null}

            {mode === 'dm' ? (
              <Panel
                description={t('runtime.demoSetup.description')}
                eyebrow={t('runtime.demoSetup.eyebrow')}
                title={t('runtime.demoSetup.title')}
                tone="dm"
              >
                <div className="grid gap-3" data-runtime-demo-scenario>
                  <SelectField
                    label={t('runtime.demoSetup.scenarioLabel')}
                    onChange={setSelectedDemoScenarioId}
                    options={demoScenarios.map((scenario) => ({
                      label: scenario.name,
                      value: scenario.id,
                    }))}
                    value={selectedDemoScenario.id}
                  />
                  <div className="rounded-2xl border border-amber-300/15 bg-black/20 p-3">
                    <p className="text-sm font-bold text-amber-50">
                      {selectedDemoScenarioSummary.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-100/65">
                      {selectedDemoScenarioSummary.detail}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-amber-100/70 sm:grid-cols-2">
                      <StatusRow
                        label={t('runtime.demoSetup.scene')}
                        value={selectedDemoScenarioSummary.sceneLabel}
                      />
                      <StatusRow
                        label={t('runtime.demoSetup.roster')}
                        value={selectedDemoScenarioSummary.rosterLabel}
                      />
                      <StatusRow
                        label={t('runtime.demoSetup.setup')}
                        value={t('runtime.demoSetup.setupValue')}
                      />
                      <StatusRow
                        label={t('runtime.demoSetup.encounter')}
                        value={t('runtime.demoSetup.encounterValue')}
                      />
                      <StatusRow
                        label={t('runtime.demoSetup.flow')}
                        value={t('runtime.demoSetup.flowValue')}
                      />
                      <StatusRow
                        label={t('runtime.demoSetup.guardrail')}
                        value={t('runtime.demoSetup.guardrailValue')}
                      />
                    </div>
                  </div>
                  <ActionButton
                    disabled={Boolean(busyLabel)}
                    disabledReason={busyReason ?? undefined}
                    label={t('runtime.demoSetup.runTrainingRoom')}
                    onClick={runFreshDemoSetup}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label={t('runtime.demoSetup.action.joinPlayers')}
                      onClick={joinSamplePlayers}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label={t('runtime.demoSetup.action.createPcs')}
                      onClick={createSampleCharacters}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label={t('runtime.demoSetup.action.assignPcs')}
                      onClick={finalizeAndAssignCharacters}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label={t('runtime.demoSetup.action.createScene')}
                      onClick={createAndActivateScene}
                      variant="secondary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      disabled={Boolean(disabledReasons.placeTokens)}
                      disabledReason={disabledReasons.placeTokens ?? undefined}
                      label={t('runtime.demoSetup.action.placeTokens')}
                      onClick={placeSampleCharacters}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(disabledReasons.startEncounter)}
                      disabledReason={
                        disabledReasons.startEncounter ?? undefined
                      }
                      label={t('runtime.demoSetup.action.startEncounter')}
                      onClick={startEncounter}
                    />
                  </div>
                </div>
              </Panel>
            ) : (
              <Panel
                description={getLocalizedPlayerNextStepDetail(
                  playerNextStep,
                  t,
                )}
                eyebrow={t('runtime.playerReadiness.eyebrow')}
                title={getLocalizedPlayerNextStepTitle(playerNextStep, t)}
                tone="player"
              >
                <div className="grid gap-3">
                  <CharacterSummary
                    currentTurnParticipantId={currentTurnParticipantId}
                    participantId={playerParticipantId}
                    resource={playerCharacter}
                    title={`${playerDisplayName} (you)`}
                    variant="hero"
                  />
                  <PlayerReadinessPanel
                    selectedTargetLabel={selectedTarget || t('common.none')}
                    summary={playerReadinessSummary}
                    tokenPositionLabel={
                      playerPlacement
                        ? `${playerPlacement.position.x},${playerPlacement.position.y}`
                        : 'not placed'
                    }
                    t={t}
                  />
                </div>
              </Panel>
            )}

            {mode === 'player' && shouldPromoteTurnTargetPanel
              ? renderTurnTargetPanel()
              : null}

            {mode === 'dm' ? (
              <SceneBuilderPanel
                activeSceneGuidance={localizedActiveSceneGuidance}
                activationSceneId={sceneActivationId}
                createDisabledReason={createCustomSceneReason}
                entityDraft={sceneEntityDraft}
                entityDraftErrors={sceneEntityDraftErrors}
                entityEditDraft={sceneEntityEditDraft}
                entityEditDraftErrors={sceneEntityEditDraftErrors}
                passiveEntities={passiveSceneEntities}
                onActivateScene={activateSelectedScene}
                onActivationSceneIdChange={setSceneActivationId}
                onCreateScene={createCustomScene}
                onDeleteEntity={deleteSceneEntity}
                onEditEntityFieldChange={updateSceneEntityEditDraftField}
                onEditEntityFlagChange={updateSceneEntityEditDraftFlag}
                onEntityFieldChange={updateSceneEntityDraftField}
                onEntityFlagChange={updateSceneEntityDraftFlag}
                onEntityPresetSelect={applySceneEntityPreset}
                onPlaceEntity={placeSceneEntity}
                onRepositionEntity={repositionSceneEntity}
                onSceneFieldChange={updateSceneDraftField}
                onSelectEntity={selectPassiveSceneEntity}
                onUpdateEntity={updateSceneEntity}
                deleteEntityDisabledReason={deleteSceneEntityReason}
                entityPresets={sceneEntityPresets}
                placeEntityDisabledReason={placeSceneEntityReason}
                repositionEntityDisabledReason={repositionSceneEntityReason}
                scene={scene}
                sceneDraft={sceneDraft}
                sceneDraftErrors={sceneDraftErrors}
                selectedEntity={selectedSceneEntity}
                selectedEntityId={selectedSceneEntityId}
                selectedCell={selectedCell}
                t={t}
                activateDisabledReason={activateSceneReason}
                updateEntityDisabledReason={updateSceneEntityReason}
              />
            ) : null}

            {mode === 'dm' ? (
              <SceneTransitionPanel
                activateDisabledReason={activateTransitionReason}
                createDisabledReason={createTransitionReason}
                deleteDisabledReason={deleteTransitionReason}
                draft={sceneTransitionDraft}
                draftErrors={localizedTransitionDraftErrors}
                editDraft={sceneTransitionEditDraft}
                editDraftErrors={localizedTransitionEditDraftErrors}
                onActivate={activateSceneTransition}
                onCreate={createSceneTransition}
                onDelete={deleteSceneTransition}
                onDraftFieldChange={updateSceneTransitionDraftField}
                onDraftFlagChange={updateSceneTransitionDraftFlag}
                onDraftPresetSelect={applySceneTransitionPreset}
                onEditFieldChange={updateSceneTransitionEditDraftField}
                onEditFlagChange={updateSceneTransitionEditDraftFlag}
                onSelectTransition={selectSceneTransitionNode}
                onUpdate={updateSceneTransition}
                sceneOptions={knownSceneOptions}
                selectedCell={selectedCell}
                selectedTransition={selectedTransition}
                selectedTransitionId={selectedTransitionId}
                t={t}
                transitionPresets={sceneTransitionPresets}
                transitions={transitionSceneEntities}
                updateDisabledReason={updateTransitionReason}
              />
            ) : null}

            {mode === 'dm' ? (
              <CombatantPanel
                attackDisabledReason={combatantAttackReason}
                combatantDraft={combatantDraft}
                combatantDraftErrors={localizedCombatantDraftErrors}
                combatants={combatants}
                createDisabledReason={createCombatantReason}
                currentTurnCombatantId={currentTurnCombatantId}
                hpDraft={combatantHpDraft}
                onAbilityChange={updateCombatantDraftAbility}
                onAttack={dmCombatantAttackTarget}
                onCreate={createCombatant}
                onFieldChange={updateCombatantDraftField}
                onHiddenChange={updateCombatantDraftHidden}
                onHpChange={updateCombatantDraftHp}
                onHpDraftChange={setCombatantHpDraft}
                onReposition={repositionCombatant}
                onSelectCombatant={setSelectedCombatantId}
                onSetCurrentTurn={dmSetTurnCombatant}
                onSetHp={setCombatantHp}
                repositionDisabledReason={selectedCombatantReason}
                selectedCell={selectedCell}
                selectedCombatant={selectedCombatant}
                selectedCombatantId={selectedCombatantId}
                setHpDisabledReason={selectedCombatantReason}
                t={t}
                targetParticipantId={selectedTarget}
              />
            ) : null}

            {mode === 'player' ? (
              <CharacterOnboardingPanel
                characterDraft={characterDraft}
                characterDraftErrors={characterDraftErrors}
                createDisabledReason={createPlayerCharacterReason}
                isAssigned={isPlayerCharacterAssigned}
                libraryEntries={finalizedLibraryEntries}
                libraryEntryError={libraryEntryError}
                libraryEntriesLoading={libraryEntriesLoading}
                libraryEntrySubmitDisabledReason={
                  libraryEntrySubmitDisabledReason
                }
                onAbilityChange={updateCharacterDraftAbility}
                onCreate={createPlayerCharacter}
                onFieldChange={updateCharacterDraftField}
                onFinalize={finalizePlayerCharacter}
                onHpChange={updateCharacterDraftHp}
                onLibraryEntryChange={setSelectedLibraryEntryId}
                onRefreshLibraryEntries={refreshPlayerLibraryEntries}
                onSubmit={submitPlayerCharacterForAssignment}
                onSubmitLibraryEntry={submitSelectedLibraryEntryForAssignment}
                onUpdate={updatePlayerCharacter}
                pendingCharacterId={playerPendingCharacterId}
                playerCharacter={playerCharacter}
                playerParticipantId={playerParticipantId}
                selectedLibraryEntry={selectedLibraryEntry}
                selectedLibraryEntryId={selectedLibraryEntryId}
                submitDisabledReason={submitPlayerCharacterReason}
                updateDisabledReason={updatePlayerCharacterReason}
                finalizeDisabledReason={finalizePlayerCharacterReason}
              />
            ) : null}

            {!shouldPromoteTurnTargetPanel ? renderTurnTargetPanel() : null}

            <Panel
              description={
                mode === 'dm'
                  ? t('runtime.rosterPanel.description.dm')
                  : t('runtime.rosterPanel.description.player')
              }
              eyebrow={t('runtime.rosterPanel.eyebrow')}
              title={t('runtime.rosterPanel.title')}
            >
              <div className="grid gap-3">
                {mode === 'player' ? (
                  <CharacterSummary
                    currentTurnParticipantId={currentTurnParticipantId}
                    participantId={playerParticipantId}
                    resource={playerCharacter}
                    title={`${playerDisplayName} (you)`}
                  />
                ) : (
                  <>
                    {playerParticipants.length ? (
                      playerParticipants.map((participant) => (
                        <CharacterSummary
                          currentTurnParticipantId={currentTurnParticipantId}
                          key={participant.id}
                          participantId={participant.id}
                          resource={charactersByParticipant[participant.id]}
                          title={participant.displayName}
                        />
                      ))
                    ) : (
                      <EmptyState
                        detail={t('runtime.rosterPanel.emptyDetail')}
                        title={t('runtime.rosterPanel.emptyTitle')}
                      />
                    )}
                    <div className="grid gap-3 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
                      <div>
                        <p className="text-sm font-bold text-amber-50">
                          {t('runtime.assignmentRequests.title')}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-amber-100/60">
                          {t('runtime.assignmentRequests.description')}
                        </p>
                      </div>
                      {pendingAssignmentRequests.length ? (
                        pendingAssignmentRequests.map((request) => {
                          const preview = getAssignmentRequestCharacterPreview(
                            request.character,
                          );

                          return (
                            <div
                              className="grid gap-2 rounded-2xl border border-sky-300/15 bg-black/25 p-3"
                              key={`${request.participantId}-${request.pendingCharacterId}`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-amber-50">
                                    {request.displayName}
                                  </p>
                                  <p className="mt-1 break-all text-xs text-amber-100/60">
                                    {request.participantId}
                                  </p>
                                </div>
                                <StatusBadge
                                  label={
                                    request.assignedCharacterId
                                      ? t(
                                          'runtime.assignmentRequests.replacementPending',
                                        )
                                      : t(
                                          'runtime.assignmentRequests.needsAssignment',
                                        )
                                  }
                                  tone="warning"
                                />
                              </div>
                              {preview ? (
                                <dl className="grid gap-2 rounded-2xl border border-sky-300/15 bg-sky-950/20 p-3 text-sm">
                                  <StatusRow
                                    label={t(
                                      'runtime.assignmentRequests.character',
                                    )}
                                    value={preview.name}
                                  />
                                  <StatusRow
                                    label={t(
                                      'runtime.assignmentRequests.build',
                                    )}
                                    value={preview.build}
                                  />
                                  <StatusRow
                                    label={t('runtime.assignmentRequests.hp')}
                                    value={preview.hitPoints}
                                  />
                                  <StatusRow
                                    label={t('runtime.assignmentRequests.ac')}
                                    value={preview.armorClass}
                                  />
                                  <StatusRow
                                    label={t(
                                      'runtime.assignmentRequests.speed',
                                    )}
                                    value={preview.speed}
                                  />
                                  <StatusRow
                                    label={t(
                                      'runtime.assignmentRequests.runtimeCopy',
                                    )}
                                    value={request.pendingCharacterId}
                                  />
                                  {preview.sourceLibraryEntryId ? (
                                    <StatusRow
                                      label={t(
                                        'runtime.assignmentRequests.sourceLibraryEntry',
                                      )}
                                      value={preview.sourceLibraryEntryId}
                                    />
                                  ) : null}
                                </dl>
                              ) : (
                                <Notice
                                  title={t(
                                    'runtime.assignmentRequests.previewUnavailableTitle',
                                  )}
                                  tone="info"
                                >
                                  {t(
                                    'runtime.assignmentRequests.previewUnavailableDetail',
                                  )}
                                </Notice>
                              )}
                              <StatusRow
                                label={t('runtime.assignmentRequests.assigned')}
                                value={
                                  request.assignedCharacterId ??
                                  t('common.none')
                                }
                              />
                              <ActionButton
                                disabled={Boolean(busyReason)}
                                disabledReason={busyReason ?? undefined}
                                label={t('runtime.assignmentRequests.submit')}
                                onClick={() =>
                                  dmAssignPendingCharacter(
                                    request.participantId,
                                    request.pendingCharacterId,
                                  )
                                }
                                variant="secondary"
                              />
                            </div>
                          );
                        })
                      ) : (
                        <EmptyState
                          detail={t('runtime.assignmentRequests.emptyDetail')}
                          title={t('runtime.assignmentRequests.emptyTitle')}
                        />
                      )}
                    </div>
                    <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
                      <p className="text-sm font-bold text-amber-50">
                        {t('runtime.assignmentHelper.title')}
                      </p>
                      <SelectField
                        label={t('runtime.assignmentHelper.player')}
                        onChange={setSelectedActor}
                        options={playerParticipants.map((participant) => ({
                          label: `${participant.displayName} (${participant.id})`,
                          value: participant.id,
                        }))}
                        value={selectedActor}
                      />
                      <StatusRow
                        label={t('runtime.assignmentHelper.knownCharacter')}
                        value={
                          selectedActorKnownCharacterId ?? t('common.none')
                        }
                      />
                      <StatusRow
                        label={t('runtime.assignmentHelper.pending')}
                        value={
                          selectedActorPendingCharacterId ?? t('common.none')
                        }
                      />
                      <StatusRow
                        label={t('runtime.assignmentHelper.assigned')}
                        value={
                          selectedActorAssignedCharacterId ?? t('common.none')
                        }
                      />
                      <ActionButton
                        disabled={Boolean(dmAssignSelectedReason)}
                        disabledReason={dmAssignSelectedReason ?? undefined}
                        label={t('runtime.assignmentHelper.submit')}
                        onClick={dmAssignSelectedLoadedCharacter}
                        variant="secondary"
                      />
                    </div>
                  </>
                )}
              </div>
            </Panel>

            {mode === 'dm' ? (
              <Panel
                description={t('runtime.overrides.description')}
                eyebrow={t('runtime.overrides.eyebrow')}
                title={t('runtime.overrides.title')}
                tone="danger"
              >
                <div className="grid gap-3">
                  <SelectField
                    label={t('runtime.overrides.controlledParticipant')}
                    onChange={setSelectedActor}
                    options={playerParticipants.map((participant) => ({
                      label: `${participant.displayName} (${participant.id})`,
                      value: participant.id,
                    }))}
                    value={selectedActor}
                  />
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <LabeledInput
                      label={t('runtime.overrides.currentHp')}
                      onChange={setHpDraft}
                      value={hpDraft}
                    />
                    <div className="self-end">
                      <ActionButton
                        disabled={Boolean(disabledReasons.dmCharacter)}
                        disabledReason={
                          disabledReasons.dmCharacter ?? undefined
                        }
                        label={t('runtime.overrides.setHp')}
                        onClick={dmSetCurrentHp}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <LabeledInput
                      label={t('runtime.overrides.conditionTags')}
                      onChange={setConditionsDraft}
                      value={conditionsDraft}
                    />
                    <ActionButton
                      disabled={Boolean(disabledReasons.dmCharacter)}
                      disabledReason={disabledReasons.dmCharacter ?? undefined}
                      label={t('runtime.overrides.setConditions')}
                      onClick={dmSetConditions}
                      variant="secondary"
                    />
                  </div>
                  <div className="grid gap-2 rounded-2xl border border-red-300/20 bg-red-950/15 p-3">
                    <p className="text-sm font-semibold text-red-100">
                      {t('runtime.overrides.turnOverride')}
                    </p>
                    <label className="flex items-center gap-2 text-sm text-amber-100/85">
                      <input
                        checked={turnUsageDraft.actionUsed}
                        className="accent-amber-500"
                        onChange={(event) =>
                          setTurnUsageDraft((draft) => ({
                            ...draft,
                            actionUsed: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      {t('runtime.overrides.actionUsed')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-amber-100/85">
                      <input
                        checked={turnUsageDraft.bonusActionUsed}
                        className="accent-amber-500"
                        onChange={(event) =>
                          setTurnUsageDraft((draft) => ({
                            ...draft,
                            bonusActionUsed: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      {t('runtime.overrides.bonusActionUsed')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-amber-100/85">
                      <input
                        checked={turnUsageDraft.reactionUsed}
                        className="accent-amber-500"
                        onChange={(event) =>
                          setTurnUsageDraft((draft) => ({
                            ...draft,
                            reactionUsed: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      {t('runtime.overrides.reactionUsed')}
                    </label>
                    <NumberInput
                      label={t('runtime.overrides.movementUsed')}
                      onChange={(movementUsed) =>
                        setTurnUsageDraft((draft) => ({
                          ...draft,
                          movementUsed,
                        }))
                      }
                      value={turnUsageDraft.movementUsed}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <ActionButton
                        disabled={Boolean(disabledReasons.dmEncounter)}
                        disabledReason={
                          disabledReasons.dmEncounter ?? undefined
                        }
                        label={t('runtime.overrides.setTurnActor')}
                        onClick={dmSetTurnParticipant}
                        variant="secondary"
                      />
                      <ActionButton
                        disabled={Boolean(disabledReasons.dmEncounter)}
                        disabledReason={
                          disabledReasons.dmEncounter ?? undefined
                        }
                        label={t('runtime.overrides.setUsage')}
                        onClick={dmSetTurnUsage}
                        variant="secondary"
                      />
                    </div>
                  </div>
                  <ActionButton
                    disabled={Boolean(disabledReasons.dmEncounter)}
                    disabledReason={disabledReasons.dmEncounter ?? undefined}
                    label={t('runtime.overrides.endEncounter')}
                    onClick={dmEndEncounter}
                    variant="danger"
                  />
                </div>
              </Panel>
            ) : null}

            <Panel
              description={t('runtime.statePanel.description')}
              eyebrow={t('runtime.statePanel.eyebrow')}
              title={t('runtime.statePanel.title')}
            >
              <dl className="grid gap-2 text-sm">
                <StatusRow
                  label={t('runtime.statePanel.session')}
                  value={sessionId || t('common.none')}
                />
                <StatusRow
                  label={t('runtime.statePanel.activeScene')}
                  value={sceneId || t('common.none')}
                />
                <StatusRow
                  label={t('runtime.statePanel.sceneName')}
                  value={scene?.name ?? t('common.none')}
                />
                <StatusRow
                  label={t('runtime.statePanel.currentTurn')}
                  value={currentTurnDisplayName}
                />
                <StatusRow
                  label={t('runtime.statePanel.encounter')}
                  value={
                    encounter
                      ? t('runtime.statePanel.encounterValue', {
                          round: String(encounter.roundNumber),
                          status: getEncounterStatusLabel(encounter.status, t),
                        })
                      : t('common.none')
                  }
                />
              </dl>
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Panel({
  children,
  description,
  eyebrow,
  title,
  tone = 'neutral',
}: {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
  tone?: 'danger' | 'dm' | 'neutral' | 'player';
}) {
  const accents = {
    danger: 'border-red-400/25 from-red-950/30',
    dm: 'border-amber-400/30 from-amber-950/25',
    neutral: 'border-amber-500/20 from-stone-950/30',
    player: 'border-sky-300/25 from-sky-950/25',
  }[tone];
  const accentLine = {
    danger: 'from-red-300/70 via-red-300/20',
    dm: 'from-amber-300/80 via-amber-300/20',
    neutral: 'from-amber-300/70 via-amber-300/20',
    player: 'from-sky-200/70 via-sky-200/20',
  }[tone];
  const eyebrowColor = {
    danger: 'text-red-200/80',
    dm: 'text-amber-300/75',
    neutral: 'text-amber-300/70',
    player: 'text-sky-200/75',
  }[tone];
  const headerDivider = {
    danger: 'border-red-300/10',
    dm: 'border-amber-300/10',
    neutral: 'border-amber-500/10',
    player: 'border-sky-300/10',
  }[tone];

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br ${accents} to-[#1c130d]/90 p-4 shadow-xl shadow-black/25 ring-1 ring-white/5 backdrop-blur`}
    >
      <div
        className={`pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r ${accentLine} to-transparent`}
      />
      <div className={`mb-4 border-b ${headerDivider} pb-3`}>
        {eyebrow ? (
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.2em] ${eyebrowColor}`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-lg font-black tracking-tight text-amber-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-amber-100/65">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function DmTableSetupPanel({
  checklist,
  t,
}: {
  checklist: DmTableSetupChecklist;
  t: RuntimeTranslator;
}) {
  const nextAction =
    checklist.items.find((item) => item.status !== 'done') ?? null;

  return (
    <Panel
      description={`${t('runtime.statusOverview.readinessProgress', {
        completed: String(checklist.completedCount),
        total: String(checklist.totalCount),
      })}. ${
        nextAction
          ? getDmTableSetupItemDetail(nextAction, t)
          : t('runtime.tableSetup.readyForPlay')
      }`}
      eyebrow={t('runtime.tableSetup.eyebrow')}
      title={t('runtime.tableSetup.title')}
      tone="dm"
    >
      <ol className="grid gap-2">
        {checklist.items.map((item) => {
          const tone = getDmTableSetupItemTone(item.status);
          const label = getDmTableSetupItemLabel(item.status, t);

          return (
            <li
              className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-amber-500/15 bg-black/20 p-3"
              key={item.id}
            >
              <StatusBadge label={label} tone={tone} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-50">
                  {getDmTableSetupItemTitle(item, t)}
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-100/60">
                  {getDmTableSetupItemDetail(item, t)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function getDmTableSetupItemLabel(
  status: DmTableSetupChecklist['items'][number]['status'],
  t: RuntimeTranslator,
): string {
  const labels: Record<
    DmTableSetupChecklist['items'][number]['status'],
    string
  > = {
    blocked: t('runtime.tableSetup.status.blocked'),
    done: t('runtime.tableSetup.status.done'),
    ready: t('runtime.tableSetup.status.ready'),
  };

  return labels[status];
}

function getDmTableSetupItemTitle(
  item: DmTableSetupChecklist['items'][number],
  t: RuntimeTranslator,
): string {
  switch (item.id) {
    case 'characters':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.characters.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.characters.ready')
          : t('runtime.tableSetup.item.characters.blocked');
    case 'encounter':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.encounter.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.encounter.ready')
          : t('runtime.tableSetup.item.encounter.blocked');
    case 'placement':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.placement.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.placement.ready')
          : t('runtime.tableSetup.item.placement.blocked');
    case 'players':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.players.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.players.ready')
          : t('runtime.tableSetup.item.players.blocked');
    case 'scene':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.scene.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.scene.ready')
          : t('runtime.tableSetup.item.scene.blocked');
    case 'session':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.session.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.session.ready')
          : t('runtime.tableSetup.item.session.blocked');
  }
}

function getDmTableSetupItemDetail(
  item: DmTableSetupChecklist['items'][number],
  t: RuntimeTranslator,
): string {
  switch (item.id) {
    case 'characters':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.characters.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.characters.ready')
          : t('runtime.tableSetup.detail.characters.blocked');
    case 'encounter':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.encounter.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.encounter.ready')
          : t('runtime.tableSetup.detail.encounter.blocked');
    case 'placement':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.placement.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.placement.ready')
          : t('runtime.tableSetup.detail.placement.blocked');
    case 'players':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.players.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.players.ready')
          : t('runtime.tableSetup.detail.players.blocked');
    case 'scene':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.scene.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.scene.ready')
          : t('runtime.tableSetup.detail.scene.blocked');
    case 'session':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.session.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.session.ready')
          : t('runtime.tableSetup.detail.session.blocked');
  }
}

function getDmTableSetupItemTone(
  status: DmTableSetupChecklist['items'][number]['status'],
): RuntimeNoticeTone {
  const tones: Record<
    DmTableSetupChecklist['items'][number]['status'],
    RuntimeNoticeTone
  > = {
    blocked: 'info',
    done: 'success',
    ready: 'warning',
  };

  return tones[status];
}

function RecoveryReliabilityPanel({
  summary,
  t,
}: {
  summary: RecoveryReliabilitySummary;
  t: RuntimeTranslator;
}) {
  return (
    <Panel
      description={getRecoveryReliabilitySummaryDetail(summary, t)}
      eyebrow={t('runtime.recovery.eyebrow')}
      title={t('runtime.recovery.title')}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge
            label={getRecoveryReliabilityStatusLabel(summary.status, t)}
            tone={getRecoveryReliabilityStatusTone(summary.status)}
          />
          <StatusBadge
            label={t('runtime.recovery.progress', {
              loaded: String(summary.loadedCount),
              total: String(summary.totalCount),
            })}
            tone={getRecoveryReliabilityStatusTone(summary.status)}
          />
        </div>
        <ol className="grid gap-2">
          {summary.items.map((item) => (
            <li
              className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-amber-500/15 bg-black/20 p-3"
              key={item.id}
            >
              <StatusBadge
                label={getRecoveryReliabilityItemLabel(item.status, t)}
                tone={getRecoveryReliabilityItemTone(item.status)}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-50">
                  {getRecoveryReliabilityItemTitle(item, t)}
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-100/60">
                  {getRecoveryReliabilityItemDetail(item, t)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {summary.notes.length ? (
          <div className="rounded-xl border border-amber-300/15 bg-amber-950/15 p-3 text-xs leading-5 text-amber-100/75">
            <p className="font-bold text-amber-100">
              {t('runtime.recovery.notes')}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {summary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function getRecoveryReliabilityStatusLabel(
  status: RecoveryReliabilitySummary['status'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'empty':
      return t('runtime.recovery.empty');
    case 'partial':
      return t('runtime.recovery.partial');
    case 'recovered':
      return t('runtime.recovery.recovered');
  }
}

function getRecoveryReliabilitySummaryDetail(
  summary: RecoveryReliabilitySummary,
  t: RuntimeTranslator,
): string {
  const noteText = summary.notes.length
    ? ` ${t('runtime.recovery.detail.notes', {
        count: String(summary.notes.length),
      })}`
    : '';

  if (summary.status === 'empty') {
    return t('runtime.recovery.detail.empty');
  }

  if (summary.status === 'recovered') {
    return `${t('runtime.recovery.detail.recovered', {
      loaded: String(summary.loadedCount),
      total: String(summary.totalCount),
    })}${noteText}`;
  }

  return `${t('runtime.recovery.detail.partial', {
    loaded: String(summary.loadedCount),
    total: String(summary.totalCount),
  })}${noteText}`;
}

function getRecoveryReliabilityStatusTone(
  status: RecoveryReliabilitySummary['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'empty':
      return 'info';
    case 'partial':
      return 'warning';
    case 'recovered':
      return 'success';
  }
}

function getRecoveryReliabilityItemLabel(
  status: RecoveryReliabilitySummary['items'][number]['status'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'missing':
      return t('runtime.recovery.missing');
    case 'optional_missing':
      return t('runtime.recovery.optional');
    case 'recovered':
      return t('runtime.recovery.loaded');
  }
}

function getRecoveryReliabilityItemTitle(
  item: RecoveryReliabilitySummary['items'][number],
  t: RuntimeTranslator,
): string {
  return t(
    `runtime.recovery.item.${item.id}.title` as Parameters<RuntimeTranslator>[0],
  );
}

function getRecoveryReliabilityItemDetail(
  item: RecoveryReliabilitySummary['items'][number],
  t: RuntimeTranslator,
): string {
  return t(
    `runtime.recovery.item.${item.id}.${item.status}` as Parameters<RuntimeTranslator>[0],
  );
}

function getRecoveryReliabilityItemTone(
  status: RecoveryReliabilitySummary['items'][number]['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'missing':
      return 'warning';
    case 'optional_missing':
      return 'info';
    case 'recovered':
      return 'success';
  }
}

function RuntimeStatusOverviewPanel({
  overview,
  t,
}: {
  overview: RuntimeStatusOverview;
  t: RuntimeTranslator;
}) {
  const readinessLabel =
    overview.mode === 'dm'
      ? t('runtime.statusOverview.dmReadiness')
      : t('runtime.statusOverview.playerReadiness');
  const overviewActorLabel = localizeActorLabel(overview.turn.actorLabel, t);
  const turnLabel = overviewActorLabel
    ? t('runtime.statusOverview.turnActive', {
        actor: overviewActorLabel,
      })
    : t('runtime.statusOverview.turnInactive');
  const turnProgress =
    overview.turn.roundNumber !== null && overview.turn.turnNumber !== null
      ? t('runtime.encounterStatus.progress', {
          round: String(overview.turn.roundNumber),
          turnCount: String(overview.turn.turnCount),
          turn: String(overview.turn.turnNumber),
        })
      : t('runtime.encounterStatus.noProgress');

  return (
    <Panel
      description={t('runtime.statusOverview.description')}
      eyebrow={t('runtime.statusOverview.eyebrow')}
      title={t('runtime.statusOverview.title')}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={t('runtime.statusOverview.readinessProgress', {
              completed: String(overview.readiness.completedCount),
              total: String(overview.readiness.totalCount),
            })}
            tone={
              overview.readiness.completedCount ===
              overview.readiness.totalCount
                ? 'success'
                : overview.readiness.readyCount > 0
                  ? 'warning'
                  : 'info'
            }
          />
          {overview.readiness.waitingCount !== null ? (
            <StatusBadge
              label={t('runtime.statusOverview.waitingProgress', {
                count: String(overview.readiness.waitingCount),
              })}
              tone={overview.readiness.waitingCount > 0 ? 'info' : 'success'}
            />
          ) : null}
          <StatusBadge
            label={getRuntimeStatusOverviewOwnerLabel(
              overview.nextAction.owner,
              t,
            )}
            tone={getRuntimeStatusOverviewOwnerTone(overview.nextAction.owner)}
          />
        </div>

        <dl className="grid gap-2 text-sm">
          <StatusRow
            label={t('runtime.statusOverview.readiness')}
            value={`${readinessLabel} · ${overview.readiness.completedCount}/${overview.readiness.totalCount}`}
          />
          <StatusRow
            label={t('runtime.statusOverview.turn')}
            value={`${turnLabel} · ${turnProgress}`}
          />
          <StatusRow
            label={t('runtime.statusOverview.recovery')}
            value={t('runtime.statusOverview.recoveryModels', {
              loaded: String(overview.recovery.loadedCount),
              total: String(overview.recovery.totalCount),
            })}
          />
        </dl>

        <div className="rounded-xl border border-amber-300/15 bg-black/20 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-200/80">
            {t('runtime.statusOverview.nextAction')}
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-50">
            {getRuntimeStatusOverviewNextActionDetail(overview, t)}
          </p>
          <StatusRow
            label={t('runtime.statusOverview.nextAction.ownerDetail')}
            value={getRuntimeStatusOverviewOwnerLabel(
              overview.nextAction.owner,
              t,
            )}
          />
          <p className="mt-2 text-xs leading-5 text-amber-100/60">
            {getRuntimeStatusOverviewOwnerDetail(overview.nextAction.owner, t)}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function getRuntimeStatusOverviewOwnerLabel(
  owner: RuntimeStatusOverview['nextAction']['owner'],
  t: RuntimeTranslator,
): string {
  switch (owner) {
    case 'dm':
      return t('runtime.statusOverview.waiting.dm');
    case 'player':
      return t('runtime.statusOverview.waiting.player');
    case 'table':
      return t('runtime.statusOverview.waiting.table');
  }
}

function getRuntimeStatusOverviewOwnerTone(
  owner: RuntimeStatusOverview['nextAction']['owner'],
): RuntimeNoticeTone {
  switch (owner) {
    case 'dm':
    case 'player':
      return 'warning';
    case 'table':
      return 'info';
  }
}

function getRuntimeStatusOverviewOwnerDetail(
  owner: RuntimeStatusOverview['nextAction']['owner'],
  t: RuntimeTranslator,
): string {
  switch (owner) {
    case 'dm':
      return t('runtime.statusOverview.nextAction.dmDetail');
    case 'player':
      return t('runtime.statusOverview.nextAction.playerDetail');
    case 'table':
      return t('runtime.statusOverview.nextAction.tableDetail');
  }
}

function getRuntimeStatusOverviewNextActionDetail(
  overview: RuntimeStatusOverview,
  t: RuntimeTranslator,
): string {
  const { sourceItemId, sourceStatus } = overview.nextAction;

  if (!sourceItemId || !sourceStatus) {
    return overview.mode === 'dm'
      ? t('runtime.tableSetup.readyForPlay')
      : t('runtime.playerReadiness.detail.ready');
  }

  if (overview.mode === 'dm') {
    return getDmTableSetupItemDetail(
      {
        detail: '',
        id: sourceItemId as DmTableSetupChecklist['items'][number]['id'],
        status:
          sourceStatus as DmTableSetupChecklist['items'][number]['status'],
        title: '',
      },
      t,
    );
  }

  return getPlayerReadinessItemDetail(
    {
      detail: '',
      id: sourceItemId as PlayerReadinessSummary['items'][number]['id'],
      status: sourceStatus as PlayerReadinessSummary['items'][number]['status'],
      title: '',
    },
    {
      completedCount: 0,
      items: [],
      nextAction: '',
      readyCount: 0,
      status: 'waiting',
      title: '',
      totalCount: 0,
      turn: {
        attackReady: false,
        currentActorLabel:
          localizeActorLabel(overview.turn.actorLabel, t) ?? t('common.none'),
        isCurrentTurn: false,
        moveReady: false,
        readyActionCount: 0,
      },
      waitingCount: 0,
    },
    t,
  );
}

function PlayerReadinessRosterPanel({
  roster,
  t,
}: {
  roster: RuntimeReadinessRoster;
  t: RuntimeTranslator;
}) {
  const currentTurnPlayer = roster.players.find((player) => {
    return player.participantId === roster.currentTurnParticipantId;
  });

  return (
    <Panel
      description={t('runtime.roster.description')}
      eyebrow={t('runtime.roster.eyebrow')}
      title={t('runtime.roster.title')}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={t('runtime.roster.readySummary', {
              ready: String(roster.readyCount),
              total: String(roster.totalCount),
            })}
            tone={
              roster.totalCount > 0 && roster.readyCount === roster.totalCount
                ? 'success'
                : 'info'
            }
          />
          {roster.currentTurnParticipantId ? (
            <StatusBadge
              label={
                currentTurnPlayer
                  ? t('runtime.roster.currentTurnPlayer', {
                      name: currentTurnPlayer.displayName,
                    })
                  : t('runtime.roster.currentTurnId', {
                      participantId: roster.currentTurnParticipantId,
                    })
              }
              tone="warning"
            />
          ) : null}
        </div>

        {roster.players.length ? (
          <ol className="grid gap-2">
            {roster.players.map((player) => (
              <li
                className="grid gap-3 rounded-xl border border-amber-500/15 bg-black/20 p-3"
                key={player.participantId}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-amber-50">
                      {player.displayName}
                    </p>
                    <p className="mt-1 break-all text-xs text-amber-100/55">
                      {player.participantId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      label={getPlayerReadinessRosterSetupLabel(
                        player.setupStatus,
                        t,
                      )}
                      tone={getPlayerReadinessRosterSetupTone(
                        player.setupStatus,
                      )}
                    />
                    <StatusBadge
                      label={getPlayerReadinessRosterConnectionLabel(
                        player.connectionStatus,
                        t,
                      )}
                      tone={
                        player.connectionStatus === 'connected'
                          ? 'success'
                          : 'info'
                      }
                    />
                  </div>
                </div>

                <dl className="grid gap-2 text-sm">
                  <StatusRow
                    label={t('runtime.roster.assignment')}
                    value={getPlayerReadinessRosterAssignmentLabel(player, t)}
                  />
                  <StatusRow
                    label={t('runtime.roster.placement')}
                    value={getPlayerReadinessRosterPlacementLabel(player, t)}
                  />
                  <StatusRow
                    label={t('runtime.roster.encounter')}
                    value={getPlayerReadinessRosterEncounterLabel(player, t)}
                  />
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            detail={t('runtime.roster.emptyDetail')}
            title={t('runtime.roster.emptyTitle')}
          />
        )}
      </div>
    </Panel>
  );
}

function getPlayerReadinessRosterSetupLabel(
  status: RuntimeReadinessRoster['players'][number]['setupStatus'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'needs_character':
      return t('runtime.roster.setup.needsCharacter');
    case 'needs_placement':
      return t('runtime.roster.setup.needsPlacement');
    case 'pending_assignment':
      return t('runtime.roster.setup.pendingAssignment');
    case 'ready':
      return t('runtime.roster.setup.ready');
    case 'waiting_for_scene':
      return t('runtime.roster.setup.waitingScene');
  }
}

function getPlayerReadinessRosterSetupTone(
  status: RuntimeReadinessRoster['players'][number]['setupStatus'],
): RuntimeNoticeTone {
  switch (status) {
    case 'ready':
      return 'success';
    case 'needs_placement':
    case 'pending_assignment':
      return 'warning';
    case 'needs_character':
    case 'waiting_for_scene':
      return 'info';
  }
}

function getPlayerReadinessRosterConnectionLabel(
  status: RuntimeReadinessRoster['players'][number]['connectionStatus'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'connected':
      return t('runtime.roster.connection.connected');
    case 'disconnected':
      return t('runtime.roster.connection.disconnected');
  }
}

function getPlayerReadinessRosterAssignmentLabel(
  player: RuntimeReadinessRoster['players'][number],
  t: RuntimeTranslator,
): string {
  switch (player.assignmentStatus) {
    case 'assigned':
      return t('runtime.roster.assignment.assigned', {
        characterId: player.characterId ?? 'none',
      });
    case 'needs_character':
      return t('runtime.roster.assignment.needsCharacter');
    case 'pending_assignment':
      return t('runtime.roster.assignment.pendingAssignment', {
        characterId: player.pendingCharacterId ?? 'none',
      });
  }
}

function getPlayerReadinessRosterPlacementLabel(
  player: RuntimeReadinessRoster['players'][number],
  t: RuntimeTranslator,
): string {
  switch (player.placement.status) {
    case 'needs_assignment':
      return t('runtime.roster.placement.needsAssignment');
    case 'needs_placement':
      return t('runtime.roster.placement.needsPlacement');
    case 'placed':
      return player.placement.position
        ? t('runtime.roster.placement.placedAt', {
            x: String(player.placement.position.x),
            y: String(player.placement.position.y),
          })
        : t('runtime.roster.placement.placed');
    case 'waiting_for_scene':
      return t('runtime.roster.placement.waitingScene');
  }
}

function getPlayerReadinessRosterEncounterLabel(
  player: RuntimeReadinessRoster['players'][number],
  t: RuntimeTranslator,
): string {
  switch (player.encounterStatus) {
    case 'current_turn':
      return t('runtime.roster.encounter.currentTurn');
    case 'no_encounter':
      return t('runtime.roster.encounter.noEncounter');
    case 'not_in_encounter':
      return t('runtime.roster.encounter.notInEncounter');
    case 'waiting_turn':
      return t('runtime.roster.encounter.waitingTurn');
  }
}

function getPlayerReadinessSummaryTitle(
  summary: PlayerReadinessSummary,
  t: RuntimeTranslator,
): string {
  if (summary.turn.isCurrentTurn) {
    return summary.readyCount > 0
      ? t('runtime.playerReadiness.summary.yourTurnReady')
      : t('runtime.playerReadiness.summary.yourTurnNeedsAttention');
  }

  const hasTurnWaiting = summary.items.some(
    (item) => item.id === 'turn' && item.status === 'waiting',
  );

  if (hasTurnWaiting) {
    return t('runtime.playerReadiness.summary.waitingTurn');
  }

  const hasWaiting = summary.items.some((item) => item.status === 'waiting');

  if (hasWaiting) {
    return t('runtime.playerReadiness.summary.waitingTable');
  }

  if (summary.readyCount > 0) {
    return t('runtime.playerReadiness.summary.readyNext');
  }

  return t('runtime.playerReadiness.summary.blocked');
}

function getPlayerReadinessNextAction(
  summary: PlayerReadinessSummary,
  t: RuntimeTranslator,
): string {
  const item =
    summary.items.find((candidate) => candidate.status === 'blocked') ??
    summary.items.find((candidate) => candidate.status === 'ready') ??
    summary.items.find((candidate) => candidate.status === 'waiting') ??
    null;

  return item
    ? getPlayerReadinessItemDetail(item, summary, t)
    : t('runtime.playerReadiness.detail.ready');
}

function getPlayerReadinessItemTitle(
  item: PlayerReadinessSummary['items'][number],
  t: RuntimeTranslator,
): string {
  return t(
    `runtime.playerReadiness.item.${item.id}.${item.status}.title` as Parameters<RuntimeTranslator>[0],
  );
}

function getPlayerReadinessItemDetail(
  item: PlayerReadinessSummary['items'][number],
  summary: PlayerReadinessSummary,
  t: RuntimeTranslator,
): string {
  if (item.id === 'turn' && item.status === 'waiting') {
    return t('runtime.playerReadiness.item.turn.waiting.detail', {
      actor: summary.turn.currentActorLabel,
    });
  }

  if (item.id === 'turn' && item.status === 'ready') {
    return t('runtime.playerReadiness.item.turn.ready.detail', {
      count: String(summary.turn.readyActionCount),
    });
  }

  return t(
    `runtime.playerReadiness.item.${item.id}.${item.status}.detail` as Parameters<RuntimeTranslator>[0],
  );
}

function PlayerReadinessPanel({
  selectedTargetLabel,
  summary,
  tokenPositionLabel,
  t,
}: {
  selectedTargetLabel: string;
  summary: PlayerReadinessSummary;
  tokenPositionLabel: string;
  t: RuntimeTranslator;
}) {
  const statusTone = getPlayerReadinessStatusTone(summary.status);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-2xl border border-sky-300/15 bg-sky-950/15 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-200/80">
              {t('runtime.playerReadiness.title')}
            </p>
            <p className="mt-1 font-black text-white">
              {getPlayerReadinessSummaryTitle(summary, t)}
            </p>
          </div>
          <StatusBadge
            label={t('runtime.playerReadiness.progress', {
              completed: String(summary.completedCount),
              total: String(summary.totalCount),
            })}
            tone={statusTone}
          />
        </div>
        <p className="text-xs leading-5 text-sky-100/70">
          {getPlayerReadinessNextAction(summary, t)}
        </p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={t('runtime.playerReadiness.readyCount', {
              count: String(summary.readyCount),
            })}
            tone={summary.readyCount > 0 ? 'warning' : 'info'}
          />
          <StatusBadge
            label={t('runtime.playerReadiness.waitingCount', {
              count: String(summary.waitingCount),
            })}
            tone={summary.waitingCount > 0 ? 'info' : 'success'}
          />
        </div>
      </div>

      <ol className="grid gap-2">
        {summary.items.map((item) => (
          <li
            className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-sky-300/15 bg-black/20 p-3"
            key={item.id}
          >
            <StatusBadge
              label={getPlayerReadinessItemLabel(item.status, t)}
              tone={getPlayerReadinessItemTone(item.status)}
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-50">
                {getPlayerReadinessItemTitle(item, t)}
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-100/60">
                {getPlayerReadinessItemDetail(item, summary, t)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid gap-2 rounded-xl border border-sky-300/15 bg-black/20 p-3 text-sm">
        <StatusRow
          label={t('runtime.playerReadiness.currentActor')}
          value={summary.turn.currentActorLabel}
        />
        <StatusRow
          label={t('runtime.playerReadiness.tokenPosition')}
          value={tokenPositionLabel}
        />
        <StatusRow
          label={t('runtime.playerReadiness.selectedTarget')}
          value={selectedTargetLabel}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <StatusBadge
            label={t('runtime.playerReadiness.move', {
              state: summary.turn.moveReady
                ? t('runtime.playerReadiness.ready')
                : t('runtime.playerReadiness.blocked'),
            })}
            tone={summary.turn.moveReady ? 'success' : 'info'}
          />
          <StatusBadge
            label={t('runtime.playerReadiness.attack', {
              state: summary.turn.attackReady
                ? t('runtime.playerReadiness.ready')
                : t('runtime.playerReadiness.blocked'),
            })}
            tone={summary.turn.attackReady ? 'success' : 'info'}
          />
          <StatusBadge
            label={t('runtime.playerReadiness.actions', {
              count: String(summary.turn.readyActionCount),
            })}
            tone={summary.turn.readyActionCount > 0 ? 'success' : 'info'}
          />
        </div>
      </div>
    </div>
  );
}

function getPlayerReadinessItemLabel(
  status: PlayerReadinessSummary['items'][number]['status'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'blocked':
      return t('runtime.playerReadiness.blocked');
    case 'done':
      return t('runtime.playerReadiness.done');
    case 'ready':
      return t('runtime.playerReadiness.next');
    case 'waiting':
      return t('runtime.playerReadiness.waiting');
  }
}

function getPlayerReadinessItemTone(
  status: PlayerReadinessSummary['items'][number]['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'blocked':
      return 'info';
    case 'done':
      return 'success';
    case 'ready':
      return 'warning';
    case 'waiting':
      return 'info';
  }
}

function getPlayerReadinessStatusTone(
  status: PlayerReadinessSummary['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'blocked':
      return 'info';
    case 'ready':
      return 'warning';
    case 'waiting':
      return 'info';
  }
}

function ActionButton({
  disabled,
  disabledReason,
  label,
  onClick,
  testId,
  variant = 'primary',
}: {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onClick: () => void | Promise<void>;
  /**
   * Stable hook for browser harnesses.
   *
   * Several controls share a label - two "Delete" buttons, four "Name / label"
   * fields - so matching on visible text picks whichever renders first. That is
   * how an acceptance harness ends up silently driving the wrong panel.
   */
  testId?: string;
  variant?: 'danger' | 'primary' | 'secondary';
}) {
  const styles = {
    danger:
      'border-red-400/45 bg-red-900/80 text-red-50 shadow-red-950/30 hover:bg-red-800 disabled:border-red-400/10 disabled:bg-red-950/20 disabled:text-red-100/35',
    primary:
      'border-amber-300/55 bg-amber-400 text-stone-950 shadow-amber-950/40 hover:bg-amber-300 disabled:border-amber-300/10 disabled:bg-amber-950/20 disabled:text-amber-100/35',
    secondary:
      'border-amber-300/25 bg-[#2d2017] text-amber-50 hover:border-amber-200/55 hover:bg-[#3c2a1d] disabled:border-amber-300/10 disabled:bg-black/20 disabled:text-amber-100/35',
  }[variant];

  return (
    <button
      className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-bold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${styles}`}
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        void onClick();
      }}
      title={disabled ? disabledReason : undefined}
      type="button"
    >
      {label}
      {disabled && disabledReason ? (
        <span className="sr-only">: {disabledReason}</span>
      ) : null}
    </button>
  );
}

function ModeButton({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: 'dm' | 'player';
}) {
  const activeStyles =
    tone === 'dm'
      ? 'border-amber-300 bg-amber-300 text-stone-950 shadow-amber-950/40'
      : 'border-sky-200 bg-sky-300 text-slate-950 shadow-sky-950/40';

  return (
    <button
      className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
        active
          ? activeStyles
          : 'border-amber-400/20 bg-black/20 text-amber-100/75 hover:border-amber-300/45 hover:text-amber-50'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function LabeledInput({
  label,
  onChange,
  placeholder,
  testId,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** See `ActionButton`: labels are not unique across panels. */
  testId?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <input
        className="min-h-10 rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-amber-50 outline-none transition placeholder:text-amber-100/30 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function NumberInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <input
        className="min-h-10 w-full rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-amber-50 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25 sm:w-24"
        onChange={(event) =>
          onChange(Number.parseInt(event.target.value, 10) || 0)
        }
        type="number"
        value={value}
      />
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  testId,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{
    label: string;
    value: string;
  }>;
  /** See `ActionButton`: labels are not unique across panels. */
  testId?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <select
        className="min-h-10 rounded-xl border border-amber-300/20 bg-[#1d140f] px-3 py-2 text-amber-50 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxField({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-amber-100/85">
      <input
        checked={checked}
        className="accent-amber-500"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function TextAreaField({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <textarea
        className="min-h-24 rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-amber-50 outline-none transition placeholder:text-amber-100/30 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-amber-100/55">{label}</dt>
      <dd className="break-all text-end font-semibold text-amber-50" dir="auto">
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: RuntimeNoticeTone;
}) {
  const styles = {
    danger: 'border-red-300/30 bg-red-950/35 text-red-100',
    info: 'border-sky-200/25 bg-sky-950/25 text-sky-100',
    success: 'border-emerald-200/25 bg-emerald-950/25 text-emerald-100',
    warning: 'border-amber-200/30 bg-amber-950/35 text-amber-100',
  }[tone];

  return (
    <span
      className={`inline-flex min-h-9 items-center justify-center rounded-full border px-3 py-1 text-center text-xs font-bold uppercase tracking-[0.12em] ${styles}`}
    >
      {label}
    </span>
  );
}

function MovementFeedback({
  summary,
  t,
}: {
  summary: MovementFeedbackSummary;
  t: RuntimeTranslator;
}) {
  const currentPositionLabel = summary.currentPosition
    ? `${summary.currentPosition.x},${summary.currentPosition.y}`
    : t('runtime.movementFeedback.noPosition');
  const distanceLabel =
    summary.distanceFeet === null
      ? t('runtime.movementFeedback.distanceUnknown')
      : t('runtime.movementFeedback.distance', {
          distance: String(summary.distanceFeet),
        });
  const budgetLabel =
    summary.movementUsedFeet === null ||
    summary.movementSpeedFeet === null ||
    summary.movementRemainingFeet === null
      ? t('runtime.movementFeedback.explorationBudget')
      : t('runtime.movementFeedback.budget', {
          remaining: String(summary.movementRemainingFeet),
          speed: String(summary.movementSpeedFeet),
          used: String(summary.movementUsedFeet),
        });
  const afterMoveLabel =
    summary.movementAfterMoveFeet === null ||
    summary.movementRemainingAfterMoveFeet === null
      ? t('runtime.movementFeedback.afterUnknown')
      : t('runtime.movementFeedback.after', {
          after: String(summary.movementAfterMoveFeet),
          remaining: String(summary.movementRemainingAfterMoveFeet),
        });

  return (
    <div className="mb-4 grid gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-950/15 p-3 text-xs text-emerald-50 lg:grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)] lg:items-center">
      <div className="min-w-0">
        <p className="font-black uppercase text-emerald-200/80">
          {t('runtime.movementFeedback.title')}
        </p>
        <p className="mt-1 truncate text-sm font-black text-white">
          {localizeActorLabel(summary.actorLabel, t)}
        </p>
        {summary.moveBlockedReason ? (
          <p className="mt-1 text-amber-100/80">{summary.moveBlockedReason}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge
          label={
            summary.moveReady
              ? t('runtime.movementFeedback.ready')
              : t('runtime.movementFeedback.blocked')
          }
          tone={summary.moveReady ? 'success' : 'warning'}
        />
        <StatusBadge
          label={t('runtime.movementFeedback.current', {
            cell: currentPositionLabel,
          })}
          tone="info"
        />
        <StatusBadge
          label={t('runtime.movementFeedback.destination', {
            cell: `${summary.destination.x},${summary.destination.y}`,
          })}
          tone="info"
        />
        <StatusBadge label={distanceLabel} tone="info" />
        <StatusBadge label={budgetLabel} tone="warning" />
        <StatusBadge label={afterMoveLabel} tone="info" />
      </div>
    </div>
  );
}

function EncounterStatusFeedback({
  summary,
  t,
}: {
  summary: EncounterStatusSummary;
  t: RuntimeTranslator;
}) {
  const statusLabel = getEncounterStatusLabel(summary.status, t);
  const progressLabel =
    summary.roundNumber === null || summary.turnNumber === null
      ? t('runtime.encounterStatus.noProgress')
      : t('runtime.encounterStatus.progress', {
          round: String(summary.roundNumber),
          turn: String(summary.turnNumber),
          turnCount: String(summary.turnCount),
        });
  const latestEncounterLabel = summary.latestEncounterUpdate
    ? t('runtime.encounterStatus.latestEncounter', {
        reason: summary.latestEncounterUpdate.reason,
        round: String(summary.latestEncounterUpdate.roundNumber),
        turn: String(summary.latestEncounterUpdate.turnNumber),
      })
    : t('runtime.encounterStatus.noEncounterUpdate');
  const latestCombatLabel = summary.latestCombatResult
    ? t('runtime.encounterStatus.latestCombat', {
        attacker: summary.latestCombatResult.attackerLabel,
        damage: String(summary.latestCombatResult.damage),
        result: summary.latestCombatResult.hit
          ? t('runtime.encounterStatus.hit')
          : t('runtime.encounterStatus.miss'),
        target: summary.latestCombatResult.targetLabel,
      })
    : t('runtime.encounterStatus.noCombatResult');

  return (
    <div className="grid gap-2 rounded-2xl border border-sky-300/15 bg-sky-950/10 p-3 text-xs text-sky-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-black uppercase tracking-[0.14em] text-sky-200/80">
            {t('runtime.encounterStatus.title')}
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {summary.currentActorLabel ??
              t('runtime.encounterStatus.noCurrentActor')}
          </p>
        </div>
        <StatusBadge
          label={statusLabel}
          tone={getEncounterStatusTone(summary.status)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge label={progressLabel} tone="info" />
        {summary.encounterId ? (
          <StatusBadge
            label={t('runtime.encounterStatus.id', {
              id: summary.encounterId,
            })}
            tone="info"
          />
        ) : null}
        {summary.nextActorLabel ? (
          <StatusBadge
            label={t('runtime.encounterStatus.nextActor', {
              actor: summary.nextActorLabel,
            })}
            tone="warning"
          />
        ) : null}
      </div>
      <div className="grid gap-1 text-sky-100/75">
        <p>{latestEncounterLabel}</p>
        <p>{latestCombatLabel}</p>
      </div>
    </div>
  );
}

function getEncounterStatusLabel(
  status: EncounterStatusSummary['status'],
  t: RuntimeTranslator,
) {
  switch (status) {
    case 'active':
      return t('runtime.encounterStatus.active');
    case 'ended':
      return t('runtime.encounterStatus.ended');
    case 'not_loaded':
      return t('runtime.encounterStatus.notLoaded');
  }
}

function getEncounterStatusTone(
  status: EncounterStatusSummary['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'ended':
      return 'warning';
    case 'not_loaded':
      return 'info';
  }
}

function ActionTargetFeedback({
  summary,
  t,
}: {
  summary: ActionTargetFeedbackSummary;
  t: RuntimeTranslator;
}) {
  const target = summary.selectedTarget;
  const targetKindLabel =
    target?.kind === 'combatant'
      ? t('runtime.actionFeedback.targetKind.combatant')
      : t('runtime.actionFeedback.targetKind.character');
  const hpLabel =
    target && target.hpCurrent !== null && target.hpMax !== null
      ? t('runtime.actionFeedback.hp', {
          current: String(target.hpCurrent),
          max: String(target.hpMax),
          temp: String(target.hpTemp ?? 0),
        })
      : t('runtime.actionFeedback.hpUnknown');
  const armorClassLabel =
    target?.armorClass === null || target?.armorClass === undefined
      ? t('runtime.actionFeedback.acUnknown')
      : t('runtime.actionFeedback.ac', {
          armorClass: String(target.armorClass),
        });
  const attackTone = summary.attackReady
    ? 'success'
    : summary.attackBlockedReason
      ? 'warning'
      : 'info';
  const attackLabel = summary.attackReady
    ? t('runtime.actionFeedback.attackReady')
    : summary.attackBlockedReason
      ? t('runtime.actionFeedback.attackBlocked')
      : t('runtime.actionFeedback.noTarget');
  const result = summary.lastCombatResult;

  return (
    <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-200 lg:grid-cols-2">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold uppercase tracking-[0.12em] text-slate-400">
            {t('runtime.actionFeedback.targetTitle')}
          </span>
          <StatusBadge label={attackLabel} tone={attackTone} />
        </div>
        {target ? (
          <>
            <p className="truncate text-sm font-black text-white">
              {target.label}
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={targetKindLabel} tone="info" />
              <StatusBadge label={hpLabel} tone="warning" />
              <StatusBadge label={armorClassLabel} tone="info" />
              <StatusBadge
                label={t('runtime.actionFeedback.status', {
                  status: localizeRuntimeCharacterStatus(target.status, t),
                })}
                tone={target.status === 'defeated' ? 'danger' : 'success'}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {t('runtime.actionFeedback.noTargetDetail')}
          </p>
        )}
        {summary.attackBlockedReason ? (
          <p className="text-amber-100/75">{summary.attackBlockedReason}</p>
        ) : null}
      </div>
      <div className="grid gap-2 border-t border-white/10 pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
        <span className="font-bold uppercase tracking-[0.12em] text-slate-400">
          {t('runtime.actionFeedback.resultTitle')}
        </span>
        {result ? (
          <>
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                label={
                  result.hit
                    ? t('runtime.actionFeedback.hit')
                    : t('runtime.actionFeedback.miss')
                }
                tone={result.hit ? 'danger' : 'warning'}
              />
              <StatusBadge
                label={t('runtime.actionFeedback.roll', {
                  roll: String(result.rollTotal),
                })}
                tone="info"
              />
              <StatusBadge
                label={t('runtime.actionFeedback.damage', {
                  damage: String(result.damage),
                })}
                tone={result.damage > 0 ? 'danger' : 'info'}
              />
            </div>
            <p className="text-sm text-slate-200">
              {t('runtime.actionFeedback.resultSummary', {
                attacker: result.attackerLabel,
                current: String(result.targetHpCurrent),
                previous: String(result.targetHpPrevious),
                target: result.targetLabel,
              })}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {t('runtime.actionFeedback.noResult')}
          </p>
        )}
      </div>
    </div>
  );
}

function ActionEconomyFeedback({
  summary,
  t,
}: {
  summary: ActionEconomyFeedbackSummary;
  t: RuntimeTranslator;
}) {
  const statusTone: RuntimeNoticeTone =
    summary.overallStatus === 'ready'
      ? 'success'
      : summary.overallStatus === 'no_encounter'
        ? 'info'
        : 'warning';
  const statusLabel =
    summary.overallStatus === 'ready'
      ? t('runtime.actionEconomy.ready')
      : summary.overallStatus === 'spent'
        ? t('runtime.actionEconomy.spent')
        : summary.overallStatus === 'no_encounter'
          ? t('runtime.actionEconomy.noEncounter')
          : t('runtime.actionEconomy.blocked');
  const latestLabel = summary.latestEncounterUpdate
    ? t('runtime.actionEconomy.latest', {
        reason: summary.latestEncounterUpdate.reason,
        round: String(summary.latestEncounterUpdate.roundNumber),
        turn: String(summary.latestEncounterUpdate.turnNumber),
      })
    : t('runtime.actionEconomy.noLatest');
  const actorLabel =
    summary.overallStatus === 'no_encounter'
      ? t('runtime.actionEconomy.noEncounter')
      : localizeActorLabel(summary.actorLabel, t);

  return (
    <div className="grid gap-2 rounded-xl border border-amber-300/15 bg-amber-950/10 p-3 text-xs text-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.12em] text-amber-200/80">
            {t('runtime.actionEconomy.title')}
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {actorLabel}
          </p>
        </div>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.resources.map((resource) => {
          const stateLabel = resource.used
            ? t('runtime.actionEconomy.used')
            : resource.ready
              ? t('runtime.actionEconomy.available')
              : t('runtime.actionEconomy.blocked');
          const resourceLabel = t('runtime.actionEconomy.resource', {
            name: getActionEconomyResourceName(resource.id, t),
            state: stateLabel,
          });

          return (
            <StatusBadge
              key={resource.id}
              label={resourceLabel}
              tone={
                resource.ready ? 'success' : resource.used ? 'warning' : 'info'
              }
            />
          );
        })}
      </div>
      <p className="text-amber-100/70">{latestLabel}</p>
      {summary.blockedReason ? (
        <p className="text-amber-100/80">{summary.blockedReason}</p>
      ) : null}
    </div>
  );
}

function getActionEconomyResourceName(
  resourceId: ActionEconomyFeedbackSummary['resources'][number]['id'],
  t: RuntimeTranslator,
) {
  switch (resourceId) {
    case 'action':
      return t('runtime.actionEconomy.action');
    case 'bonusAction':
      return t('runtime.actionEconomy.bonusAction');
    case 'reaction':
      return t('runtime.actionEconomy.reaction');
  }
}

function getActionEconomyResource(
  summary: ActionEconomyFeedbackSummary,
  resourceId: ActionEconomyFeedbackSummary['resources'][number]['id'],
  unavailableReason: string,
): ActionEconomyFeedbackSummary['resources'][number] {
  const resource = summary.resources.find(
    (candidate) => candidate.id === resourceId,
  );

  if (resource) {
    return resource;
  }

  return {
    blockedReason: unavailableReason,
    commandType:
      resourceId === 'bonusAction'
        ? 'use_bonus_action'
        : resourceId === 'reaction'
          ? 'use_reaction'
          : 'use_action',
    id: resourceId,
    ready: false,
    used: false,
  };
}

function CurrentTurnRail({
  summary,
  t,
}: {
  summary: CurrentTurnRailSummary | null;
  t: RuntimeTranslator;
}) {
  if (!summary) {
    return null;
  }

  const movementLabel =
    summary.movementSpeedFeet === null || summary.movementRemainingFeet === null
      ? t('runtime.turnRail.movementUnknown', {
          used: String(summary.movementUsedFeet),
        })
      : t('runtime.turnRail.movementRemaining', {
          remaining: String(summary.movementRemainingFeet),
          speed: String(summary.movementSpeedFeet),
          used: String(summary.movementUsedFeet),
        });
  const actorKindLabel =
    summary.actorKind === 'combatant'
      ? t('runtime.turnRail.actorKind.combatant')
      : t('runtime.turnRail.actorKind.character');

  return (
    <div className="mb-4 grid gap-3 rounded-2xl border border-amber-300/20 bg-amber-950/20 p-3 shadow-lg shadow-black/20 lg:grid-cols-[minmax(180px,1.2fr)_minmax(180px,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-300/80">
          {t('runtime.turnRail.title')}
        </p>
        <p className="mt-1 truncate text-base font-black text-amber-50">
          {summary.actorLabel}
        </p>
        <p className="mt-1 text-xs text-amber-100/60">
          {t('runtime.turnRail.roundInitiative', {
            initiative: String(summary.initiative),
            round: String(summary.roundNumber),
          })}
        </p>
      </div>
      <div className="grid gap-1 rounded-xl border border-sky-200/15 bg-sky-950/20 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-sky-200/80">
          {t('runtime.turnRail.movement')}
        </span>
        <span className="text-sm font-semibold text-sky-50">
          {movementLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge label={actorKindLabel} tone="info" />
        <StatusBadge
          label={t('runtime.turnRail.action', {
            state: summary.actionUsed
              ? t('runtime.turnRail.used')
              : t('runtime.turnRail.available'),
          })}
          tone={summary.actionUsed ? 'warning' : 'success'}
        />
        <StatusBadge
          label={t('runtime.turnRail.bonus', {
            state: summary.bonusActionUsed
              ? t('runtime.turnRail.used')
              : t('runtime.turnRail.available'),
          })}
          tone={summary.bonusActionUsed ? 'warning' : 'success'}
        />
        <StatusBadge
          label={t('runtime.turnRail.reaction', {
            state: summary.reactionUsed
              ? t('runtime.turnRail.used')
              : t('runtime.turnRail.available'),
          })}
          tone={summary.reactionUsed ? 'warning' : 'success'}
        />
      </div>
    </div>
  );
}

function Notice({
  children,
  title,
  tone,
}: {
  children: ReactNode;
  title: string;
  tone: RuntimeNoticeTone;
}) {
  const styles = {
    danger: 'border-red-300/35 bg-red-950/45 text-red-50',
    info: 'border-sky-200/25 bg-sky-950/35 text-sky-50',
    success: 'border-emerald-200/25 bg-emerald-950/35 text-emerald-50',
    warning: 'border-amber-200/35 bg-amber-950/45 text-amber-50',
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      <p className="font-bold">{title}</p>
      <div className="mt-1 leading-6 opacity-90">{children}</div>
    </div>
  );
}

function EmptyState({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-300/20 bg-black/20 p-4 text-sm">
      <p className="font-bold text-amber-100">{title}</p>
      <p className="mt-1 leading-5 text-amber-100/60">{detail}</p>
    </div>
  );
}

function LatestEventFeed({
  entries,
  t,
}: {
  entries: Array<EventLogEntry & { summary: RuntimeEventSummary }>;
  t: RuntimeTranslator;
}) {
  return (
    <Panel
      description={t('runtime.eventFeed.description')}
      eyebrow={t('runtime.eventFeed.eyebrow')}
      title={t('runtime.eventFeed.title')}
    >
      <div className="grid gap-2">
        {entries.length ? (
          entries.map((entry) => (
            <div
              className="rounded-2xl border border-amber-500/15 bg-black/25 p-3"
              key={entry.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-amber-50">
                    {entry.summary.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-amber-100/70">
                    {entry.summary.detail}
                  </p>
                </div>
                <StatusBadge label={entry.at} tone={entry.summary.tone} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            detail={t('runtime.eventFeed.emptyDetail')}
            title={t('runtime.eventFeed.emptyTitle')}
          />
        )}
      </div>
    </Panel>
  );
}

function SceneBuilderPanel({
  activateDisabledReason,
  activationSceneId,
  activeSceneGuidance,
  createDisabledReason,
  deleteEntityDisabledReason,
  entityDraft,
  entityDraftErrors,
  entityEditDraft,
  entityEditDraftErrors,
  entityPresets,
  passiveEntities,
  onActivateScene,
  onActivationSceneIdChange,
  onCreateScene,
  onDeleteEntity,
  onEditEntityFieldChange,
  onEditEntityFlagChange,
  onEntityFieldChange,
  onEntityFlagChange,
  onEntityPresetSelect,
  onPlaceEntity,
  onRepositionEntity,
  onSceneFieldChange,
  onSelectEntity,
  onUpdateEntity,
  placeEntityDisabledReason,
  repositionEntityDisabledReason,
  scene,
  sceneDraft,
  sceneDraftErrors,
  selectedCell,
  selectedEntity,
  selectedEntityId,
  t,
  updateEntityDisabledReason,
}: {
  activateDisabledReason: string | null;
  activationSceneId: string;
  activeSceneGuidance: RuntimeEventSummary;
  createDisabledReason: string | null;
  deleteEntityDisabledReason: string | null;
  entityDraft: SceneEntityDraftForm;
  entityDraftErrors: string[];
  entityEditDraft: SceneEntityDraftForm;
  entityEditDraftErrors: string[];
  entityPresets: readonly SceneEntityPreset[];
  passiveEntities: Scene['entities'];
  onActivateScene: () => void | Promise<void>;
  onActivationSceneIdChange: (value: string) => void;
  onCreateScene: () => void | Promise<void>;
  onDeleteEntity: () => void | Promise<void>;
  onEditEntityFieldChange: (
    field: 'footprintHeight' | 'footprintWidth' | 'name' | 'type',
    value: string,
  ) => void;
  onEditEntityFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onEntityFieldChange: (
    field: 'footprintHeight' | 'footprintWidth' | 'name' | 'type',
    value: string,
  ) => void;
  onEntityFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onEntityPresetSelect: (presetId: SceneEntityPresetId) => void;
  onPlaceEntity: () => void | Promise<void>;
  onRepositionEntity: () => void | Promise<void>;
  onSceneFieldChange: (field: keyof SceneDraftForm, value: string) => void;
  onSelectEntity: (entityId: string) => void;
  onUpdateEntity: () => void | Promise<void>;
  placeEntityDisabledReason: string | null;
  repositionEntityDisabledReason: string | null;
  scene: Scene | null;
  sceneDraft: SceneDraftForm;
  sceneDraftErrors: string[];
  selectedCell: Cell;
  selectedEntity?: Scene['entities'][number];
  selectedEntityId: string;
  t: RuntimeTranslator;
  updateEntityDisabledReason: string | null;
}) {
  return (
    <Panel
      description={t('runtime.sceneBuilder.description')}
      eyebrow={t('runtime.overrides.eyebrow')}
      title={t('runtime.sceneBuilder.title')}
      tone="dm"
    >
      <div className="grid gap-4">
        <Notice
          title={activeSceneGuidance.title}
          tone={activeSceneGuidance.tone}
        >
          {activeSceneGuidance.detail}
        </Notice>

        <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">
            {t('runtime.sceneBuilder.sceneDraft')}
          </p>
          {sceneDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {sceneDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <LabeledInput
            label={t('runtime.sceneBuilder.field.sceneName')}
            onChange={(value) => onSceneFieldChange('name', value)}
            value={sceneDraft.name}
          />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.width')}
              onChange={(value) => onSceneFieldChange('width', value)}
              value={sceneDraft.width}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.height')}
              onChange={(value) => onSceneFieldChange('height', value)}
              value={sceneDraft.height}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.cellFeet')}
              onChange={(value) => onSceneFieldChange('cellSizeFeet', value)}
              value={sceneDraft.cellSizeFeet}
            />
          </div>
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.action.createScene')}
            onClick={onCreateScene}
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">
            {t('runtime.sceneBuilder.activateScene')}
          </p>
          <LabeledInput
            label={t('runtime.sceneBuilder.field.sceneId')}
            onChange={onActivationSceneIdChange}
            placeholder={scene?.id ?? 'scene_...'}
            value={activationSceneId}
          />
          <ActionButton
            disabled={Boolean(activateDisabledReason)}
            disabledReason={activateDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.action.activateScene')}
            onClick={onActivateScene}
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-orange-300/20 bg-orange-950/15 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.placeEntity')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.placeEntityDetail', {
                cell: `${selectedCell.x},${selectedCell.y}`,
              })}
            </p>
          </div>
          {entityDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {entityDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300/70">
              {t('runtime.sceneBuilder.entityPalette')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {entityPresets.map((preset) => (
                <button
                  className="min-h-16 rounded-xl border border-amber-300/15 bg-[#241a12] px-3 py-2 text-left transition hover:border-amber-200/45 hover:bg-[#322318] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                  key={preset.id}
                  onClick={() => onEntityPresetSelect(preset.id)}
                  title={getLocalizedSceneEntityPresetDescription(preset.id, t)}
                  type="button"
                >
                  <span className="block text-sm font-bold text-amber-50">
                    {getLocalizedSceneEntityPresetLabel(preset.id, t)}
                  </span>
                  <span className="mt-1 block text-xs capitalize text-amber-100/55">
                    {getLocalizedSceneEntityTypeLabel(preset.draft.type, t)} ·{' '}
                    {preset.draft.footprintWidth}x{preset.draft.footprintHeight}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <SelectField
            label={t('runtime.sceneBuilder.field.entityType')}
            onChange={(value) => onEntityFieldChange('type', value)}
            options={sceneEntityTypeOptions.map((entityType) => ({
              label: getLocalizedSceneEntityTypeLabel(entityType, t),
              value: entityType,
            }))}
            value={entityDraft.type}
          />
          <LabeledInput
            label={t('runtime.sceneBuilder.field.name')}
            onChange={(value) => onEntityFieldChange('name', value)}
            testId="scene-entity-name"
            value={entityDraft.name}
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintWidth')}
              onChange={(value) => onEntityFieldChange('footprintWidth', value)}
              value={entityDraft.footprintWidth}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintHeight')}
              onChange={(value) =>
                onEntityFieldChange('footprintHeight', value)
              }
              value={entityDraft.footprintHeight}
            />
          </div>
          <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
            <CheckboxField
              checked={entityDraft.blocksMovement}
              label={t('runtime.sceneBuilder.flag.blocksMovement')}
              onChange={(checked) =>
                onEntityFlagChange('blocksMovement', checked)
              }
            />
            <CheckboxField
              checked={entityDraft.blocksVision}
              label={t('runtime.sceneBuilder.flag.blocksVision')}
              onChange={(checked) =>
                onEntityFlagChange('blocksVision', checked)
              }
            />
            <CheckboxField
              checked={entityDraft.hidden}
              label={t('runtime.sceneBuilder.flag.hiddenMap')}
              onChange={(checked) => onEntityFlagChange('hidden', checked)}
            />
          </div>
          <ActionButton
            disabled={Boolean(placeEntityDisabledReason)}
            disabledReason={placeEntityDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.action.placeEntity')}
            onClick={onPlaceEntity}
            testId="scene-entity-place"
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-300/20 bg-black/25 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.editEntity')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.editEntityDetail')}
            </p>
          </div>
          {passiveEntities.length ? (
            <SelectField
              label={t('runtime.sceneBuilder.field.passiveEntity')}
              onChange={onSelectEntity}
              options={passiveEntities.map((entity) => ({
                label: getLocalizedSceneEntityPositionLabel(entity, t),
                value: entity.id,
              }))}
              testId="scene-entity-select"
              value={selectedEntityId}
            />
          ) : (
            <EmptyState
              detail={t('runtime.sceneBuilder.noPassiveEntities.detail')}
              title={t('runtime.sceneBuilder.noPassiveEntities.title')}
            />
          )}
          {selectedEntity ? (
            <div className="grid gap-3">
              <StatusRow
                label={t('runtime.sceneBuilder.field.selected')}
                value={getLocalizedSceneEntityPositionLabel(selectedEntity, t)}
              />
              {entityEditDraftErrors.length ? (
                <p className="text-xs leading-5 text-amber-200">
                  {entityEditDraftErrors.slice(0, 3).join(' ')}
                </p>
              ) : null}
              <SelectField
                label={t('runtime.sceneBuilder.field.entityType')}
                onChange={(value) => onEditEntityFieldChange('type', value)}
                options={sceneEntityTypeOptions.map((entityType) => ({
                  label: getLocalizedSceneEntityTypeLabel(entityType, t),
                  value: entityType,
                }))}
                value={entityEditDraft.type}
              />
              <LabeledInput
                label={t('runtime.sceneBuilder.field.name')}
                onChange={(value) => onEditEntityFieldChange('name', value)}
                value={entityEditDraft.name}
              />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintWidth')}
                  onChange={(value) =>
                    onEditEntityFieldChange('footprintWidth', value)
                  }
                  value={entityEditDraft.footprintWidth}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintHeight')}
                  onChange={(value) =>
                    onEditEntityFieldChange('footprintHeight', value)
                  }
                  value={entityEditDraft.footprintHeight}
                />
              </div>
              <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
                <CheckboxField
                  checked={entityEditDraft.blocksMovement}
                  label={t('runtime.sceneBuilder.flag.blocksMovement')}
                  onChange={(checked) =>
                    onEditEntityFlagChange('blocksMovement', checked)
                  }
                />
                <CheckboxField
                  checked={entityEditDraft.blocksVision}
                  label={t('runtime.sceneBuilder.flag.blocksVision')}
                  onChange={(checked) =>
                    onEditEntityFlagChange('blocksVision', checked)
                  }
                />
                <CheckboxField
                  checked={entityEditDraft.hidden}
                  label={t('runtime.sceneBuilder.flag.hiddenMap')}
                  onChange={(checked) =>
                    onEditEntityFlagChange('hidden', checked)
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton
                  disabled={Boolean(updateEntityDisabledReason)}
                  disabledReason={updateEntityDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.update')}
                  onClick={onUpdateEntity}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(repositionEntityDisabledReason)}
                  disabledReason={repositionEntityDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.moveTo', {
                    cell: `${selectedCell.x},${selectedCell.y}`,
                  })}
                  onClick={onRepositionEntity}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(deleteEntityDisabledReason)}
                  disabledReason={deleteEntityDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.delete')}
                  onClick={onDeleteEntity}
                  testId="scene-entity-delete"
                  variant="danger"
                />
              </div>
            </div>
          ) : null}
          {passiveEntities.length ? (
            <div className="grid gap-2 text-xs text-amber-100/70">
              <p className="font-bold uppercase tracking-[0.14em] text-amber-300/70">
                {t('runtime.sceneBuilder.passiveEntities')}
              </p>
              {passiveEntities.slice(-5).map((entity) => (
                <div
                  className="rounded-xl border border-amber-500/10 bg-black/20 px-3 py-2"
                  key={entity.id}
                >
                  {getLocalizedSceneEntityPositionLabel(entity, t)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function SceneTransitionPanel({
  activateDisabledReason,
  createDisabledReason,
  deleteDisabledReason,
  draft,
  draftErrors,
  editDraft,
  editDraftErrors,
  onActivate,
  onCreate,
  onDelete,
  onDraftFieldChange,
  onDraftFlagChange,
  onDraftPresetSelect,
  onEditFieldChange,
  onEditFlagChange,
  onSelectTransition,
  onUpdate,
  sceneOptions,
  selectedCell,
  selectedTransition,
  selectedTransitionId,
  t,
  transitionPresets,
  transitions,
  updateDisabledReason,
}: {
  activateDisabledReason: string | null;
  createDisabledReason: string | null;
  deleteDisabledReason: string | null;
  draft: SceneTransitionDraftForm;
  draftErrors: string[];
  editDraft: SceneTransitionDraftForm;
  editDraftErrors: string[];
  onActivate: () => void | Promise<void>;
  onCreate: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onDraftFieldChange: (
    field:
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'notes'
      | 'targetLabel'
      | 'targetSceneId',
    value: string,
  ) => void;
  onDraftFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onDraftPresetSelect: (presetId: SceneTransitionPresetId) => void;
  onEditFieldChange: (
    field:
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'notes'
      | 'targetLabel'
      | 'targetSceneId',
    value: string,
  ) => void;
  onEditFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onSelectTransition: (transitionId: string) => void;
  onUpdate: () => void | Promise<void>;
  sceneOptions: Array<{ label: string; value: string }>;
  selectedCell: Cell;
  selectedTransition?: Scene['entities'][number];
  selectedTransitionId: string;
  t: RuntimeTranslator;
  transitionPresets: readonly SceneTransitionPreset[];
  transitions: Scene['entities'];
  updateDisabledReason: string | null;
}) {
  const targetOptions = [
    { label: t('runtime.sceneBuilder.chooseKnownScene'), value: '' },
    ...sceneOptions,
  ];

  return (
    <Panel
      description={t('runtime.sceneBuilder.transitions.description')}
      eyebrow={t('runtime.overrides.eyebrow')}
      title={t('runtime.sceneBuilder.transitions.title')}
      tone="dm"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-violet-300/20 bg-violet-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.transitions.create')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.transitions.createDetail', {
                cell: `${selectedCell.x},${selectedCell.y}`,
              })}
            </p>
          </div>
          {draftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {draftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300/70">
              {t('runtime.sceneBuilder.transitions.presets')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {transitionPresets.map((preset) => (
                <button
                  className="min-h-16 rounded-xl border border-violet-200/15 bg-[#22162a] px-3 py-2 text-left transition hover:border-violet-200/45 hover:bg-[#2f1e3b] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                  key={preset.id}
                  onClick={() => onDraftPresetSelect(preset.id)}
                  title={getLocalizedSceneTransitionPresetDescription(
                    preset.id,
                    t,
                  )}
                  type="button"
                >
                  <span className="block text-sm font-bold text-amber-50">
                    {getLocalizedSceneTransitionPresetLabel(preset.id, t)}
                  </span>
                  <span className="mt-1 block text-xs capitalize text-amber-100/55">
                    {getLocalizedSceneTransitionKindLabel(preset.draft.kind, t)}{' '}
                    · {preset.draft.footprintWidth}x
                    {preset.draft.footprintHeight}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={t('runtime.sceneBuilder.field.transitionKind')}
              onChange={(value) => onDraftFieldChange('kind', value)}
              options={sceneTransitionKindOptions.map((kind) => ({
                label: getLocalizedSceneTransitionKindLabel(kind, t),
                value: kind,
              }))}
              value={draft.kind}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.name')}
              onChange={(value) => onDraftFieldChange('name', value)}
              value={draft.name}
            />
          </div>
          <SelectField
            label={t('runtime.sceneBuilder.field.transitionTargetScene')}
            onChange={(value) => onDraftFieldChange('targetSceneId', value)}
            options={targetOptions}
            value={draft.targetSceneId}
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.transitionTargetSceneId')}
              onChange={(value) => onDraftFieldChange('targetSceneId', value)}
              placeholder="scene_..."
              value={draft.targetSceneId}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.transitionTargetLabel')}
              onChange={(value) => onDraftFieldChange('targetLabel', value)}
              value={draft.targetLabel}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintWidth')}
              onChange={(value) => onDraftFieldChange('footprintWidth', value)}
              value={draft.footprintWidth}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintHeight')}
              onChange={(value) => onDraftFieldChange('footprintHeight', value)}
              value={draft.footprintHeight}
            />
          </div>
          <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
            <CheckboxField
              checked={draft.blocksMovement}
              label={t('runtime.sceneBuilder.flag.blocksMovement')}
              onChange={(checked) =>
                onDraftFlagChange('blocksMovement', checked)
              }
            />
            <CheckboxField
              checked={draft.blocksVision}
              label={t('runtime.sceneBuilder.flag.blocksVision')}
              onChange={(checked) => onDraftFlagChange('blocksVision', checked)}
            />
            <CheckboxField
              checked={draft.hidden}
              label={t('runtime.sceneBuilder.flag.hiddenPlayerMap')}
              onChange={(checked) => onDraftFlagChange('hidden', checked)}
            />
          </div>
          <TextAreaField
            label={t('runtime.sceneBuilder.field.notes')}
            onChange={(value) => onDraftFieldChange('notes', value)}
            value={draft.notes}
          />
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.transitions.action.create')}
            onClick={onCreate}
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-violet-300/20 bg-black/25 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.transitions.edit')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.transitions.editDetail')}
            </p>
          </div>
          {transitions.length ? (
            <SelectField
              label={t('runtime.sceneBuilder.field.transitionNode')}
              onChange={onSelectTransition}
              options={transitions.map((transition) => ({
                label: getLocalizedSceneEntityPositionLabel(transition, t),
                value: transition.id,
              }))}
              value={selectedTransitionId}
            />
          ) : (
            <EmptyState
              detail={t('runtime.sceneBuilder.transitions.noNodes.detail')}
              title={t('runtime.sceneBuilder.transitions.noNodes.title')}
            />
          )}
          {selectedTransition ? (
            <div className="grid gap-3">
              <StatusRow
                label={t('runtime.sceneBuilder.field.selected')}
                value={getLocalizedSceneEntityPositionLabel(
                  selectedTransition,
                  t,
                )}
              />
              {editDraftErrors.length ? (
                <p className="text-xs leading-5 text-amber-200">
                  {editDraftErrors.slice(0, 3).join(' ')}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label={t('runtime.sceneBuilder.field.transitionKind')}
                  onChange={(value) => onEditFieldChange('kind', value)}
                  options={sceneTransitionKindOptions.map((kind) => ({
                    label: getLocalizedSceneTransitionKindLabel(kind, t),
                    value: kind,
                  }))}
                  value={editDraft.kind}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.name')}
                  onChange={(value) => onEditFieldChange('name', value)}
                  value={editDraft.name}
                />
              </div>
              <SelectField
                label={t('runtime.sceneBuilder.field.transitionTargetScene')}
                onChange={(value) => onEditFieldChange('targetSceneId', value)}
                options={targetOptions}
                value={editDraft.targetSceneId}
              />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label={t(
                    'runtime.sceneBuilder.field.transitionTargetSceneId',
                  )}
                  onChange={(value) =>
                    onEditFieldChange('targetSceneId', value)
                  }
                  placeholder="scene_..."
                  value={editDraft.targetSceneId}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.transitionTargetLabel')}
                  onChange={(value) => onEditFieldChange('targetLabel', value)}
                  value={editDraft.targetLabel}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintWidth')}
                  onChange={(value) =>
                    onEditFieldChange('footprintWidth', value)
                  }
                  value={editDraft.footprintWidth}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintHeight')}
                  onChange={(value) =>
                    onEditFieldChange('footprintHeight', value)
                  }
                  value={editDraft.footprintHeight}
                />
              </div>
              <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
                <CheckboxField
                  checked={editDraft.blocksMovement}
                  label={t('runtime.sceneBuilder.flag.blocksMovement')}
                  onChange={(checked) =>
                    onEditFlagChange('blocksMovement', checked)
                  }
                />
                <CheckboxField
                  checked={editDraft.blocksVision}
                  label={t('runtime.sceneBuilder.flag.blocksVision')}
                  onChange={(checked) =>
                    onEditFlagChange('blocksVision', checked)
                  }
                />
                <CheckboxField
                  checked={editDraft.hidden}
                  label={t('runtime.sceneBuilder.flag.hiddenPlayerMap')}
                  onChange={(checked) => onEditFlagChange('hidden', checked)}
                />
              </div>
              <TextAreaField
                label={t('runtime.sceneBuilder.field.notes')}
                onChange={(value) => onEditFieldChange('notes', value)}
                value={editDraft.notes}
              />
              <div className="grid grid-cols-3 gap-2">
                <ActionButton
                  disabled={Boolean(updateDisabledReason)}
                  disabledReason={updateDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.update')}
                  onClick={onUpdate}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(activateDisabledReason)}
                  disabledReason={activateDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.transitions.action.activate')}
                  onClick={onActivate}
                />
                <ActionButton
                  disabled={Boolean(deleteDisabledReason)}
                  disabledReason={deleteDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.delete')}
                  onClick={onDelete}
                  variant="danger"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function CombatantPanel({
  attackDisabledReason,
  combatantDraft,
  combatantDraftErrors,
  combatants,
  createDisabledReason,
  currentTurnCombatantId,
  hpDraft,
  onAbilityChange,
  onAttack,
  onCreate,
  onFieldChange,
  onHiddenChange,
  onHpChange,
  onHpDraftChange,
  onReposition,
  onSelectCombatant,
  onSetCurrentTurn,
  onSetHp,
  repositionDisabledReason,
  selectedCell,
  selectedCombatant,
  selectedCombatantId,
  setHpDisabledReason,
  t,
  targetParticipantId,
}: {
  attackDisabledReason: string | null;
  combatantDraft: CombatantDraftForm;
  combatantDraftErrors: string[];
  combatants: ReturnType<typeof getCombatantEntities>;
  createDisabledReason: string | null;
  currentTurnCombatantId: string | null;
  hpDraft: string;
  onAbilityChange: (abilityKey: AbilityKey, value: string) => void;
  onAttack: () => void | Promise<void>;
  onCreate: () => void | Promise<void>;
  onFieldChange: (
    field:
      | 'armorClass'
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'speed',
    value: string,
  ) => void;
  onHiddenChange: (value: boolean) => void;
  onHpChange: (field: keyof CombatantDraftForm['hp'], value: string) => void;
  onHpDraftChange: (value: string) => void;
  onReposition: () => void | Promise<void>;
  onSelectCombatant: (combatantId: string) => void;
  onSetCurrentTurn: () => void | Promise<void>;
  onSetHp: () => void | Promise<void>;
  repositionDisabledReason: string | null;
  selectedCell: Cell;
  selectedCombatant?: ReturnType<typeof getCombatantEntities>[number];
  selectedCombatantId: string;
  setHpDisabledReason: string | null;
  t: RuntimeTranslator;
  targetParticipantId: string;
}) {
  return (
    <Panel
      description={t('runtime.combatants.description')}
      eyebrow={t('runtime.overrides.eyebrow')}
      title={t('runtime.combatants.title')}
      tone="dm"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-red-950/15 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.combatants.createTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.combatants.createDetail', {
                x: String(selectedCell.x),
                y: String(selectedCell.y),
              })}
            </p>
          </div>
          {combatantDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {combatantDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={t('runtime.combatants.kind')}
              onChange={(value) => onFieldChange('kind', value)}
              options={[
                { label: 'monster', value: 'monster' },
                { label: 'npc', value: 'npc' },
              ]}
              value={combatantDraft.kind}
            />
            <LabeledInput
              label={t('runtime.combatants.name')}
              onChange={(value) => onFieldChange('name', value)}
              testId="combatant-name"
              value={combatantDraft.name}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput
              label={t('runtime.combatants.hpMax')}
              onChange={(value) => onHpChange('max', value)}
              value={combatantDraft.hp.max}
            />
            <LabeledInput
              label={t('runtime.combatants.hpCurrent')}
              onChange={(value) => onHpChange('current', value)}
              value={combatantDraft.hp.current}
            />
            <LabeledInput
              label={t('runtime.combatants.hpTemp')}
              onChange={(value) => onHpChange('temp', value)}
              value={combatantDraft.hp.temp}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <LabeledInput
              label="AC"
              onChange={(value) => onFieldChange('armorClass', value)}
              value={combatantDraft.armorClass}
            />
            <LabeledInput
              label={t('runtime.combatants.speed')}
              onChange={(value) => onFieldChange('speed', value)}
              value={combatantDraft.speed}
            />
            <LabeledInput
              label={t('runtime.combatants.sizeWidth')}
              onChange={(value) => onFieldChange('footprintWidth', value)}
              value={combatantDraft.footprintWidth}
            />
            <LabeledInput
              label={t('runtime.combatants.sizeHeight')}
              onChange={(value) => onFieldChange('footprintHeight', value)}
              value={combatantDraft.footprintHeight}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300/70">
              {t('runtime.combatants.abilities')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {abilityKeys.map((abilityKey) => (
                <LabeledInput
                  key={abilityKey}
                  label={abilityKey.toUpperCase()}
                  onChange={(value) => onAbilityChange(abilityKey, value)}
                  value={combatantDraft.abilities[abilityKey]}
                />
              ))}
            </div>
          </div>
          <CheckboxField
            checked={combatantDraft.hidden}
            label={t('runtime.combatants.hidden')}
            onChange={onHiddenChange}
          />
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label={t('runtime.combatants.create')}
            onClick={onCreate}
            testId="combatant-create"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">
            {t('runtime.combatants.commandTitle')}
          </p>
          {combatants.length ? (
            <SelectField
              label={t('runtime.combatants.selected')}
              onChange={onSelectCombatant}
              options={combatants.map((combatant) => ({
                label: t('runtime.combatants.option', {
                  current: String(combatant.combatant.hp.current),
                  defeatSuffix: isCombatantEntityDefeated(combatant)
                    ? t('runtime.combatants.defeatedSuffix')
                    : '',
                  kind: combatant.combatant.kind,
                  max: String(combatant.combatant.hp.max),
                  name: combatant.name,
                }),
                value: combatant.id,
              }))}
              value={selectedCombatantId}
            />
          ) : (
            <EmptyState
              detail={t('runtime.combatants.emptyDetail')}
              title={t('runtime.combatants.emptyTitle')}
            />
          )}
          {selectedCombatant ? (
            <div className="grid gap-2 text-sm">
              <StatusRow
                label={t('runtime.combatants.status.selected')}
                value={t('runtime.combatants.status.selectedValue', {
                  name: selectedCombatant.name,
                  x: String(selectedCombatant.position.x),
                  y: String(selectedCombatant.position.y),
                })}
              />
              <StatusRow
                label={t('runtime.combatants.status.currentTurn')}
                value={
                  currentTurnCombatantId === selectedCombatant.id
                    ? t('common.yes')
                    : t('common.no')
                }
              />
              <StatusRow
                label={t('runtime.combatants.status.label')}
                value={
                  isCombatantEntityDefeated(selectedCombatant)
                    ? t('runtime.combatants.status.defeated')
                    : t('runtime.combatants.status.active')
                }
              />
              <StatusRow
                label={t('runtime.combatants.status.target')}
                value={targetParticipantId || t('common.none')}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              disabled={Boolean(repositionDisabledReason)}
              disabledReason={repositionDisabledReason ?? undefined}
              label={t('runtime.combatants.reposition')}
              onClick={onReposition}
              testId="combatant-reposition"
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(repositionDisabledReason)}
              disabledReason={repositionDisabledReason ?? undefined}
              label={t('runtime.combatants.makeTurn')}
              onClick={onSetCurrentTurn}
              variant="secondary"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <LabeledInput
              label="HP"
              onChange={onHpDraftChange}
              value={hpDraft}
            />
            <ActionButton
              disabled={Boolean(setHpDisabledReason)}
              disabledReason={setHpDisabledReason ?? undefined}
              label={t('runtime.combatants.setHp')}
              onClick={onSetHp}
              variant="secondary"
            />
          </div>
          <ActionButton
            disabled={Boolean(attackDisabledReason)}
            disabledReason={attackDisabledReason ?? undefined}
            label={t('runtime.combatants.attackTarget')}
            onClick={onAttack}
            variant="danger"
          />
        </div>
      </div>
    </Panel>
  );
}

function CharacterOnboardingPanel({
  characterDraft,
  characterDraftErrors,
  createDisabledReason,
  finalizeDisabledReason,
  isAssigned,
  libraryEntries,
  libraryEntriesLoading,
  libraryEntryError,
  libraryEntrySubmitDisabledReason,
  onAbilityChange,
  onCreate,
  onFieldChange,
  onFinalize,
  onHpChange,
  onLibraryEntryChange,
  onRefreshLibraryEntries,
  onSubmit,
  onSubmitLibraryEntry,
  onUpdate,
  pendingCharacterId,
  playerCharacter,
  playerParticipantId,
  selectedLibraryEntry,
  selectedLibraryEntryId,
  submitDisabledReason,
  updateDisabledReason,
}: {
  characterDraft: CharacterDraftForm;
  characterDraftErrors: string[];
  createDisabledReason: string | null;
  finalizeDisabledReason: string | null;
  isAssigned: boolean;
  libraryEntries: CharacterLibraryEntry[];
  libraryEntriesLoading: boolean;
  libraryEntryError: string | null;
  libraryEntrySubmitDisabledReason: string | null;
  onAbilityChange: (abilityKey: AbilityKey, value: string) => void;
  onCreate: () => void | Promise<void>;
  onFieldChange: (
    field:
      | 'armorClass'
      | 'background'
      | 'className'
      | 'level'
      | 'name'
      | 'notes'
      | 'speciesOrRace'
      | 'speed',
    value: string,
  ) => void;
  onFinalize: () => void | Promise<void>;
  onHpChange: (field: keyof CharacterDraftForm['hp'], value: string) => void;
  onLibraryEntryChange: (entryId: string) => void;
  onRefreshLibraryEntries: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
  onSubmitLibraryEntry: () => void | Promise<void>;
  onUpdate: () => void | Promise<void>;
  pendingCharacterId: string | null;
  playerCharacter?: CharacterResource;
  playerParticipantId: string;
  selectedLibraryEntry: CharacterLibraryEntry | null;
  selectedLibraryEntryId: string;
  submitDisabledReason: string | null;
  updateDisabledReason: string | null;
}) {
  const { t } = useI18n();
  const statusTone: RuntimeNoticeTone = playerCharacter
    ? isAssigned
      ? 'success'
      : pendingCharacterId === playerCharacter.character.id
        ? 'info'
        : 'warning'
    : 'info';
  const statusLabel = playerCharacter
    ? isAssigned
      ? t('runtime.characterLibrary.status.assigned')
      : pendingCharacterId === playerCharacter.character.id
        ? t('runtime.characterLibrary.status.submitted')
        : t('runtime.characterLibrary.status.ready')
    : t('runtime.characterLibrary.status.none');
  const libraryEntryOptions = libraryEntries.map((entry) => ({
    label: t('runtime.characterLibrary.optionLabel', {
      className: entry.className,
      level: String(entry.level),
      name: entry.name,
    }),
    value: entry.id,
  }));

  return (
    <Panel
      description="Create and maintain your own character draft. The server validates and returns the authoritative sheet."
      eyebrow="Character sheet"
      title="Player Character"
      tone="player"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {playerCharacter?.character.name ?? 'Unwritten adventurer'}
            </p>
            <p className="mt-1 text-xs text-amber-100/60">
              Owner: {playerParticipantId}
              {playerCharacter
                ? ` · ${playerCharacter.character.status}`
                : ' · draft not created'}
            </p>
          </div>
          <StatusBadge label={statusLabel} tone={statusTone} />
        </div>

        {characterDraftErrors.length ? (
          <Notice title="Sheet needs attention" tone="warning">
            <ul className="list-disc space-y-1 pl-5">
              {characterDraftErrors.slice(0, 4).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {!isAssigned && playerCharacter?.character.status === 'ready' ? (
          <Notice
            title={
              pendingCharacterId === playerCharacter.character.id
                ? t('runtime.characterLibrary.waitingTitle')
                : t('runtime.characterLibrary.submitReadyTitle')
            }
            tone="warning"
          >
            {pendingCharacterId === playerCharacter.character.id
              ? t('runtime.characterLibrary.waitingDetail', {
                  characterId: pendingCharacterId,
                })
              : t('runtime.characterLibrary.submitReadyDetail')}
          </Notice>
        ) : null}

        <div className="grid gap-3 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.characterLibrary.title')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.characterLibrary.description')}
            </p>
          </div>

          {libraryEntryError ? (
            <Notice
              title={t('runtime.characterLibrary.errorTitle')}
              tone="danger"
            >
              {libraryEntryError}
            </Notice>
          ) : null}

          {libraryEntries.length ? (
            <>
              <SelectField
                label={t('runtime.characterLibrary.selectLabel')}
                onChange={onLibraryEntryChange}
                options={libraryEntryOptions}
                value={selectedLibraryEntryId}
              />
              {selectedLibraryEntry ? (
                <>
                  <dl className="grid gap-2 rounded-2xl border border-sky-300/15 bg-black/25 p-3 text-sm">
                    <StatusRow
                      label={t('runtime.characterLibrary.entryStatus')}
                      value={selectedLibraryEntry.status}
                    />
                    <StatusRow
                      label={t('runtime.characterLibrary.entryClass')}
                      value={`${selectedLibraryEntry.className} ${selectedLibraryEntry.level}`}
                    />
                    <StatusRow
                      label={t('runtime.characterLibrary.entryId')}
                      value={selectedLibraryEntry.id}
                    />
                  </dl>
                  <Notice
                    title={t('runtime.characterLibrary.selectedTitle')}
                    tone="info"
                  >
                    {t('runtime.characterLibrary.selectedDetail', {
                      name: selectedLibraryEntry.name,
                    })}
                  </Notice>
                </>
              ) : null}
            </>
          ) : (
            <EmptyState
              detail={t('runtime.characterLibrary.emptyDetail')}
              title={t('runtime.characterLibrary.emptyTitle')}
            />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton
              disabled={libraryEntriesLoading}
              disabledReason={
                libraryEntriesLoading
                  ? t('runtime.characterLibrary.loading')
                  : undefined
              }
              label={
                libraryEntriesLoading
                  ? t('runtime.characterLibrary.loading')
                  : t('runtime.characterLibrary.refresh')
              }
              onClick={onRefreshLibraryEntries}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(libraryEntrySubmitDisabledReason)}
              disabledReason={libraryEntrySubmitDisabledReason ?? undefined}
              label={t('runtime.characterLibrary.submit')}
              onClick={onSubmitLibraryEntry}
              variant="secondary"
            />
          </div>
        </div>

        <div className="grid gap-3">
          <LabeledInput
            label="Name"
            onChange={(value) => onFieldChange('name', value)}
            value={characterDraft.name}
          />
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Class"
              onChange={(value) => onFieldChange('className', value)}
              value={characterDraft.className}
            />
            <LabeledInput
              label="Level (create only)"
              onChange={(value) => onFieldChange('level', value)}
              value={characterDraft.level}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Species/Race"
              onChange={(value) => onFieldChange('speciesOrRace', value)}
              value={characterDraft.speciesOrRace}
            />
            <LabeledInput
              label="Background"
              onChange={(value) => onFieldChange('background', value)}
              value={characterDraft.background}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300/70">
            Abilities
          </p>
          <div className="grid grid-cols-3 gap-2">
            {abilityKeys.map((abilityKey) => (
              <LabeledInput
                key={abilityKey}
                label={abilityKey.toUpperCase()}
                onChange={(value) => onAbilityChange(abilityKey, value)}
                value={characterDraft.abilities[abilityKey]}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300/70">
            Combat Basics
          </p>
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="HP Max"
              onChange={(value) => onHpChange('max', value)}
              value={characterDraft.hp.max}
            />
            <LabeledInput
              label="HP Current"
              onChange={(value) => onHpChange('current', value)}
              value={characterDraft.hp.current}
            />
            <LabeledInput
              label="Temp HP"
              onChange={(value) => onHpChange('temp', value)}
              value={characterDraft.hp.temp}
            />
            <LabeledInput
              label="Armor Class"
              onChange={(value) => onFieldChange('armorClass', value)}
              value={characterDraft.armorClass}
            />
            <LabeledInput
              label="Speed"
              onChange={(value) => onFieldChange('speed', value)}
              value={characterDraft.speed}
            />
          </div>
        </div>

        <TextAreaField
          label="Notes"
          onChange={(value) => onFieldChange('notes', value)}
          value={characterDraft.notes}
        />

        {playerCharacter ? (
          <div className="grid gap-2 rounded-2xl border border-amber-500/15 bg-black/25 p-3 text-sm">
            <StatusRow
              label="Character ID"
              value={playerCharacter.character.id}
            />
            <StatusRow
              label="Proficiency"
              value={`+${playerCharacter.derived.proficiencyBonus}`}
            />
            <StatusRow
              label="Initiative"
              value={`${playerCharacter.derived.initiativeModifier >= 0 ? '+' : ''}${playerCharacter.derived.initiativeModifier}`}
            />
            <StatusRow
              label="Passive Perception"
              value={String(playerCharacter.derived.passivePerception)}
            />
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-4">
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label="Create Draft"
            onClick={onCreate}
          />
          <ActionButton
            disabled={Boolean(updateDisabledReason)}
            disabledReason={updateDisabledReason ?? undefined}
            label="Update Draft"
            onClick={onUpdate}
            variant="secondary"
          />
          <ActionButton
            disabled={Boolean(finalizeDisabledReason)}
            disabledReason={finalizeDisabledReason ?? undefined}
            label="Finalize"
            onClick={onFinalize}
            variant="secondary"
          />
          <ActionButton
            disabled={Boolean(submitDisabledReason)}
            disabledReason={submitDisabledReason ?? undefined}
            label="Submit to DM"
            onClick={onSubmit}
            variant="secondary"
          />
        </div>
      </div>
    </Panel>
  );
}

function CharacterSummary({
  currentTurnParticipantId,
  participantId,
  resource,
  title,
  variant = 'normal',
}: {
  currentTurnParticipantId: string | null;
  participantId: string;
  resource?: CharacterResource;
  title: string;
  variant?: 'hero' | 'normal';
}) {
  const { t } = useI18n();

  if (!resource) {
    return (
      <EmptyState
        detail={`${title}: no character loaded.`}
        title="No character"
      />
    );
  }

  const sourceProvenance = getCharacterLibrarySourceProvenance(resource);

  return (
    <article
      className={`rounded-2xl border p-3 ${
        participantId === currentTurnParticipantId
          ? 'border-amber-300/45 bg-amber-950/35 shadow-lg shadow-amber-950/25'
          : variant === 'hero'
            ? 'border-sky-300/35 bg-sky-950/25'
            : 'border-amber-500/15 bg-black/25'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-amber-50">
            {resource.character.name}
          </h3>
          <p className="text-sm text-amber-100/60">
            {title} · {resource.character.className} {resource.character.level}
          </p>
        </div>
        <StatusBadge
          label={localizeRuntimeCharacterStatus(resource.character.status, t)}
          tone={participantId === currentTurnParticipantId ? 'warning' : 'info'}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Stat
          label="HP"
          value={`${resource.character.hp.current}/${resource.character.hp.max}`}
        />
        <Stat label="AC" value={String(resource.character.armorClass)} />
        <Stat
          label={t('runtime.characterSummary.speed')}
          value={`${resource.character.speed} ft`}
        />
        <Stat
          label={t('runtime.characterSummary.proficiency')}
          value={`+${resource.derived.proficiencyBonus}`}
        />
        <Stat
          label={t('runtime.characterSummary.initiative')}
          value={`${resource.derived.initiativeModifier >= 0 ? '+' : ''}${resource.derived.initiativeModifier}`}
        />
        <Stat
          label={t('runtime.characterSummary.passivePerception')}
          value={String(resource.derived.passivePerception)}
        />
      </dl>
      <p className="mt-3 text-xs text-amber-100/60">
        {t('runtime.characterSummary.conditions')}:{' '}
        {resource.overlay.activeConditions.length
          ? resource.overlay.activeConditions.join(', ')
          : t('common.none')}
      </p>
      {sourceProvenance ? (
        <dl className="mt-3 grid gap-2 rounded-xl border border-sky-300/15 bg-sky-950/20 p-2 text-xs">
          <StatusRow
            label={t('runtime.assignmentRequests.runtimeCopy')}
            value={sourceProvenance.runtimeCharacterId}
          />
          <StatusRow
            label={t('runtime.assignmentRequests.sourceLibraryEntry')}
            value={sourceProvenance.sourceLibraryEntryId}
          />
        </dl>
      ) : null}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-500/15 bg-black/25 px-2 py-2">
      <dt className="text-xs text-amber-100/50">{label}</dt>
      <dd className="font-black text-amber-50">{value}</dd>
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-2xl border border-amber-500/15 bg-black/50 p-3 text-xs text-amber-100/85">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
