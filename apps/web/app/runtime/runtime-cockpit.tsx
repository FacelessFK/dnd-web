'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';

import type {
  ActiveSceneState,
  CharacterLibraryEntry,
  CharacterResource,
  CombatEvent,
  DmCommand,
  Encounter,
  Scene,
  SceneEntityInput,
  SceneTransitionInput,
  SessionStreamEvent,
} from '@dnd/protocol';

import { useAuth } from '../../lib/auth-context';
import {
  listCharacterLibraryEntries,
  submitCharacterLibraryEntryForAssignment,
} from '../../lib/character-library-api';
import {
  createCommandId,
  fetchOutboxStatus,
  runtimeServerUrl,
  sendCharacterCommand,
  sendDmCommand,
  sendEncounterCommand,
  sendMovementCommand,
  sendSceneCommand,
  sendSessionCommand,
  type OutboxStatusSuccessResponse,
  type RuntimeApiResult,
} from '../../lib/runtime-api';
import { LanguageSwitcher, useI18n } from '../../lib/i18n';
import {
  abilityKeys,
  characterInputFromDraft,
  characterUpdateInputFromDraft,
  cockpitStorageKey,
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
  defaultTacticalBoardViewport,
  defaultDm,
  defaultPlayer,
  demoScenarios,
  describeSessionStreamEvent,
  formatRuntimeFailure,
  getActingParticipantId,
  getActionEconomyFeedbackSummary,
  getActionTargetFeedbackSummary,
  getAssignmentRequestCharacterPreview,
  getAssignedCharacterRefs,
  getAttackableCombatantEntities,
  getCharacterLibrarySourceProvenance,
  getCombatantDisplayCells,
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
  getPendingCharacterRefs,
  getPassiveSceneEntities,
  getPlayerNextStep,
  getPlayerParticipantIds,
  getPlayerReadinessSummary,
  getRecoveryReliabilitySummary,
  getRuntimeReadinessRoster,
  getRuntimeStatusOverview,
  getRuntimeDisabledReasons,
  getSceneEntityDisplayCells,
  getTacticalBoardCellAfterKeyboardNavigation,
  getTacticalBoardCellAffordance,
  getTacticalBoardCellSizePixels,
  getTacticalBoardViewportAfterPan,
  getTacticalBoardViewportAfterZoom,
  getTransitionSceneEntities,
  initials,
  isSessionStreamEvent,
  isCombatantEntityDefeated,
  isExpectedRecoveryMiss,
  sampleCharacters,
  samplePlayers,
  sanitizeSessionIdInput,
  sceneEntityPresets,
  sceneEntityInputFromDraft,
  sceneEntityUpdateInputFromDraft,
  sceneEntityTypeOptions,
  sceneTransitionInputFromDraft,
  sceneTransitionKindOptions,
  sceneTransitionPresets,
  sceneTransitionUpdateInputFromDraft,
  combatantInputFromDraft,
  sceneInputFromDraft,
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
  type SessionSnapshot,
  type StoredCockpitState,
  type TacticalBoardCellBadgeKind,
  type TacticalBoardPanDirection,
  type TacticalBoardViewport,
  type TacticalBoardZoomDirection,
} from '../../lib/runtime-cockpit-helpers';
import { useSessionStream } from '../../lib/use-session-stream';

type SimpleEncounterCommandType =
  | 'advance_turn'
  | 'use_action'
  | 'use_bonus_action'
  | 'use_reaction';

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
  const [dmParticipantId, setDmParticipantId] = useState<string>(
    defaultDm.participantId,
  );
  const [dmDisplayName, setDmDisplayName] = useState<string>(
    defaultDm.displayName,
  );
  const [mode, setMode] = useState<RuntimeMode>('dm');
  const [playerParticipantId, setPlayerParticipantId] = useState<string>(
    defaultPlayer.participantId,
  );
  const [playerDisplayName, setPlayerDisplayName] = useState<string>(
    defaultPlayer.displayName,
  );
  const [sessionId, setSessionId] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [sessionState, setSessionState] = useState<SessionSnapshot | null>(
    null,
  );
  const [scene, setScene] = useState<Scene | null>(null);
  const [knownScenesById, setKnownScenesById] = useState<Record<string, Scene>>(
    {},
  );
  const [activeScene, setActiveScene] = useState<ActiveSceneState | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [charactersByParticipant, setCharactersByParticipant] = useState<
    Record<string, CharacterResource | undefined>
  >({});
  const [knownCharacterIdsByParticipant, setKnownCharacterIdsByParticipant] =
    useState<Record<string, string>>({});
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
  const [commandError, setCommandError] = useState<string | null>(null);
  const [recoveryNotes, setRecoveryNotes] = useState<string[]>([]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [outboxStatus, setOutboxStatus] = useState<
    OutboxStatusSuccessResponse['data'] | null
  >(null);
  const [outboxStatusError, setOutboxStatusError] = useState<string | null>(
    null,
  );
  const [outboxStatusLoading, setOutboxStatusLoading] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string>(
    samplePlayers[0].participantId,
  );
  const [selectedTarget, setSelectedTarget] = useState<string>(
    samplePlayers[1].participantId,
  );
  const [selectedTargetCombatantId, setSelectedTargetCombatantId] =
    useState('');
  const [selectedCell, setSelectedCell] = useState<Cell>({ x: 0, y: 0 });
  const [tacticalBoardViewport, setTacticalBoardViewport] =
    useState<TacticalBoardViewport>(defaultTacticalBoardViewport);
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
    knownCharacterIdsByParticipant,
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
  const streamParticipantId =
    mode === 'dm' ? dmParticipantId : playerParticipantId;
  const streamDisplayName = mode === 'dm' ? dmDisplayName : playerDisplayName;
  const streamRole = mode === 'dm' ? 'dm' : 'player';
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

  const stream = useSessionStream({
    enabled: streamEnabled,
    onEvent: (event) => {
      applyStreamEvent(event);
      pushLog(event.type, event);
    },
    participantId: streamParticipantId,
    sessionId: sessionId || null,
  });

  useEffect(() => {
    const rawState = localStorage.getItem(cockpitStorageKey);

    if (!rawState) {
      return;
    }

    try {
      const stored = JSON.parse(rawState) as StoredCockpitState;

      setDmParticipantId(stored.dmParticipantId ?? defaultDm.participantId);
      setDmDisplayName(stored.dmDisplayName ?? defaultDm.displayName);
      setMode(stored.mode ?? 'dm');
      setPlayerParticipantId(
        stored.playerParticipantId ?? defaultPlayer.participantId,
      );
      setPlayerDisplayName(
        stored.playerDisplayName ?? defaultPlayer.displayName,
      );
      setSessionId(stored.sessionId ?? '');
      setSceneId(stored.sceneId ?? '');
      setSceneActivationId(stored.sceneId ?? '');
      setKnownCharacterIdsByParticipant(stored.charactersByParticipant ?? {});
    } catch {
      localStorage.removeItem(cockpitStorageKey);
    }
  }, []);

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

  useEffect(() => {
    const stored: StoredCockpitState = {
      charactersByParticipant: {
        ...knownCharacterIdsByParticipant,
        ...Object.fromEntries(
          Object.entries(charactersByParticipant).flatMap(
            ([participantId, resource]) =>
              resource ? [[participantId, resource.character.id] as const] : [],
          ),
        ),
      },
      dmDisplayName,
      dmParticipantId,
      mode,
      playerDisplayName,
      playerParticipantId,
      sceneId,
      sessionId,
    };

    localStorage.setItem(cockpitStorageKey, JSON.stringify(stored));
  }, [
    charactersByParticipant,
    dmDisplayName,
    dmParticipantId,
    knownCharacterIdsByParticipant,
    mode,
    playerDisplayName,
    playerParticipantId,
    sceneId,
    sessionId,
  ]);

  async function runTask<T>(label: string, task: () => Promise<T>) {
    setBusyLabel(label);
    setCommandError(null);

    try {
      const payload = await task();

      setLastResponse({
        label,
        payload,
      });
      pushLog(label, payload);
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyLabel(null);
    }
  }

  async function unwrap<T>(
    label: string,
    result: Promise<RuntimeApiResult<T>>,
  ): Promise<T> {
    const response = await result;

    if (!response.ok) {
      throw new Error(formatRuntimeFailure(label, response.error));
    }

    return response.response;
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

  function clearRuntimeReadModels(
    options: { clearKnownCharacterIds?: boolean } = {},
  ): void {
    setSceneId('');
    setSessionState(null);
    setScene(null);
    setActiveScene(null);
    setEncounter(null);
    setCharactersByParticipant({});
    if (options.clearKnownCharacterIds) {
      setKnownCharacterIdsByParticipant({});
    }
    setLastResponse(null);
    setCommandError(null);
    setRecoveryNotes([]);
    setSceneDraft(createDefaultSceneDraftForm());
    setSceneActivationId('');
    setSceneEntityDraft(createDefaultSceneEntityDraftForm());
    setSceneEntityEditDraft(createDefaultSceneEntityDraftForm());
    setSelectedSceneEntityId('');
    setSceneTransitionDraft(createDefaultSceneTransitionDraftForm());
    setSceneTransitionEditDraft(createDefaultSceneTransitionDraftForm());
    setSelectedTransitionId('');
    setKnownScenesById({});
    setCombatantDraft(createDefaultCombatantDraftForm());
    setSelectedCombatantId('');
    setSelectedTargetCombatantId('');
    setCombatantHpDraft('8');
    setTurnUsageDraft({
      actionUsed: false,
      bonusActionUsed: false,
      movementUsed: 0,
      reactionUsed: false,
    });
    setSelectedCell({ x: 0, y: 0 });
  }

  function switchSessionId(nextSessionId: string): void {
    setStreamEnabled(false);
    setSessionId(sanitizeSessionIdInput(nextSessionId));
    clearRuntimeReadModels({ clearKnownCharacterIds: true });
    setEventLog([]);
  }

  function switchMode(nextMode: RuntimeMode): void {
    setMode(nextMode);
    setStreamEnabled(false);
    setCommandError(null);
    setRecoveryNotes([]);
  }

  function switchPlayerParticipantId(nextParticipantId: string): void {
    setStreamEnabled(false);
    setPlayerParticipantId(nextParticipantId.trim());
    setCharacterDraft(createDefaultCharacterDraftForm(playerDisplayName));
    setCommandError(null);
    setRecoveryNotes([]);
  }

  function switchDmParticipantId(nextParticipantId: string): void {
    setStreamEnabled(false);
    setDmParticipantId(nextParticipantId.trim());
    setCommandError(null);
    setRecoveryNotes([]);
  }

  function resetLocalCockpit(): void {
    localStorage.removeItem(cockpitStorageKey);
    setDmParticipantId(defaultDm.participantId);
    setDmDisplayName(defaultDm.displayName);
    setMode('dm');
    setPlayerParticipantId(defaultPlayer.participantId);
    setPlayerDisplayName(defaultPlayer.displayName);
    setSessionId('');
    setStreamEnabled(false);
    setCharacterDraft(
      createDefaultCharacterDraftForm(defaultPlayer.displayName),
    );
    clearRuntimeReadModels({ clearKnownCharacterIds: true });
    setEventLog([]);
  }

  function applySessionSnapshot(state: SessionSnapshot): void {
    setSessionState(state);
    setSessionId(state.session.id);

    if (state.session.activeSceneId) {
      setSceneId(state.session.activeSceneId);
      setSceneActivationId(state.session.activeSceneId);
    } else {
      setSceneId('');
      setSceneActivationId('');
      setScene(null);
      setActiveScene(null);
    }
  }

  function rememberScene(nextScene: Scene): void {
    setScene(nextScene);
    setKnownScenesById((current) => ({
      ...current,
      [nextScene.id]: nextScene,
    }));
    setSceneId(nextScene.id);
    setSceneActivationId(nextScene.id);
    setSceneDraft(createSceneDraftFormFromScene(nextScene));
  }

  function rememberCharacter(resource: CharacterResource): void {
    setCharactersByParticipant((current) => ({
      ...current,
      [resource.character.ownerParticipantId]: resource,
    }));
    setKnownCharacterIdsByParticipant((current) => ({
      ...current,
      [resource.character.ownerParticipantId]: resource.character.id,
    }));

    if (resource.character.ownerParticipantId === playerParticipantId) {
      setCharacterDraft(createCharacterDraftFormFromResource(resource));
    }
  }

  function patchCharacter(
    characterId: string,
    patch: (resource: CharacterResource) => CharacterResource,
  ): void {
    setCharactersByParticipant((current) => {
      const next = { ...current };

      for (const [participantId, resource] of Object.entries(current)) {
        if (resource?.character.id === characterId) {
          next[participantId] = patch(resource);
        }
      }

      return next;
    });
  }

  function applyMovementState(
    event: Extract<SessionStreamEvent, { type: 'movement_state' }>,
  ): void {
    setActiveScene((current) => {
      const previous = current ?? {
        activeSceneId: event.activeSceneId,
        placedCharacters: [],
        sessionId: event.sessionId,
      };
      const otherPlacements = previous.placedCharacters.filter(
        (placement) => placement.participantId !== event.participantId,
      );

      return {
        ...previous,
        activeSceneId: event.activeSceneId,
        placedCharacters: [
          ...otherPlacements,
          {
            characterId: event.characterId,
            footprint: event.footprint,
            participantId: event.participantId,
            position: event.position,
          },
        ],
      };
    });
  }

  function applyStreamEvent(event: SessionStreamEvent): void {
    switch (event.type) {
      case 'session_state':
        applySessionSnapshot(event.state);
        break;
      case 'movement_state':
        applyMovementState(event);
        break;
      case 'encounter_state':
        setEncounter(event.encounter);
        setTurnUsageDraft(event.encounter.currentTurnUsage);
        break;
      case 'character_state':
        patchCharacter(event.characterId, (resource) => ({
          ...resource,
          character: {
            ...resource.character,
            hp: event.hp,
          },
          overlay: {
            ...resource.overlay,
            activeConditions:
              event.activeConditions ?? resource.overlay.activeConditions,
          },
        }));
        break;
      case 'combat_event':
        if (event.targetCharacterId) {
          patchCharacter(event.targetCharacterId, (resource) => ({
            ...resource,
            character: {
              ...resource.character,
              hp: {
                ...resource.character.hp,
                current: event.targetHp.current,
              },
            },
          }));
        }
        if (event.targetCombatantId) {
          setScene((currentScene) => {
            if (!currentScene) {
              return currentScene;
            }

            return {
              ...currentScene,
              entities: currentScene.entities.map((entity) =>
                entity.id === event.targetCombatantId && entity.combatant
                  ? {
                      ...entity,
                      combatant: {
                        ...entity.combatant,
                        hp: {
                          ...entity.combatant.hp,
                          current: event.targetHp.current,
                        },
                      },
                    }
                  : entity,
              ),
            };
          });
        }
        break;
    }
  }

  async function createSession(): Promise<void> {
    await runTask('create_session', async () => {
      const response = await unwrap(
        'create_session',
        sendSessionCommand({
          actor: {
            displayName: streamDisplayName,
            participantId: streamParticipantId,
            role: streamRole,
          },
          commandId: createCommandId('create-session'),
          payload: {
            rulesProfileId: 'dnd5e-2024-core',
          },
          type: 'create_session',
        }),
      );

      setStreamEnabled(false);
      clearRuntimeReadModels({ clearKnownCharacterIds: true });
      applySessionSnapshot(response.data.state);

      return response;
    });
  }

  async function joinCurrentPlayer(): Promise<void> {
    await runTask('join current player', async () => {
      assertSession();

      const response = await unwrap(
        `join_session ${playerParticipantId}`,
        sendSessionCommand({
          actor: {
            displayName: playerDisplayName,
            participantId: playerParticipantId,
            role: 'player',
          },
          commandId: createCommandId(`join-${playerParticipantId}`),
          payload: {
            sessionId,
          },
          type: 'join_session',
        }),
      );

      applySessionSnapshot(response.data.state);

      return response;
    });
  }

  async function runFreshDemoSetup(): Promise<void> {
    await runTask(`run ${selectedDemoScenario.name}`, async () => {
      setStreamEnabled(false);
      const scenarioPlayers = selectedDemoScenario.playerParticipantIds.map(
        (participantId) => {
          const player = samplePlayers.find(
            (candidate) => candidate.participantId === participantId,
          );

          if (!player) {
            throw new Error(
              `No sample player is defined for ${participantId}.`,
            );
          }

          return player;
        },
      );

      const createdSession = await unwrap(
        'create_session',
        sendSessionCommand({
          actor: {
            displayName: dmDisplayName,
            participantId: dmParticipantId,
            role: 'dm',
          },
          commandId: createCommandId(
            `${selectedDemoScenario.id}-create-session`,
          ),
          payload: {
            rulesProfileId: 'dnd5e-2024-core',
          },
          type: 'create_session',
        }),
      );
      const activeSessionId = createdSession.data.sessionId;
      let latestState = createdSession.data.state;

      clearRuntimeReadModels({ clearKnownCharacterIds: true });
      setEventLog([]);
      applySessionSnapshot(latestState);

      for (const player of scenarioPlayers) {
        const joined = await unwrap(
          `join_session ${player.participantId}`,
          sendSessionCommand({
            actor: {
              displayName: player.displayName,
              participantId: player.participantId,
              role: 'player',
            },
            commandId: createCommandId(`demo-join-${player.participantId}`),
            payload: {
              sessionId: activeSessionId,
            },
            type: 'join_session',
          }),
        );

        latestState = joined.data.state;
        applySessionSnapshot(latestState);
      }

      const createdCharacters: Record<string, CharacterResource> = {};

      for (const player of scenarioPlayers) {
        const characterInput = sampleCharacters[player.participantId];

        if (!characterInput) {
          throw new Error(
            `No sample character is defined for ${player.participantId}.`,
          );
        }

        const created = await unwrap(
          `create_character ${player.participantId}`,
          sendCharacterCommand({
            actor: {
              participantId: player.participantId,
            },
            commandId: createCommandId(
              `demo-create-character-${player.participantId}`,
            ),
            payload: {
              character: characterInput,
              ownerParticipantId: player.participantId,
              sessionId: activeSessionId,
            },
            type: 'create_character',
          }),
        );

        if (!('character' in created.data)) {
          throw new Error(
            'create_character returned a non-character response.',
          );
        }

        createdCharacters[player.participantId] = created.data;
        rememberCharacter(created.data);
      }

      for (const player of scenarioPlayers) {
        const characterId =
          createdCharacters[player.participantId]?.character.id;

        if (!characterId) {
          throw new Error(
            `No sample character was created for ${player.participantId}.`,
          );
        }

        const finalized = await unwrap(
          `finalize_character ${player.participantId}`,
          sendCharacterCommand({
            actor: {
              participantId: player.participantId,
            },
            commandId: createCommandId(`demo-finalize-${player.participantId}`),
            payload: {
              characterId,
              sessionId: activeSessionId,
            },
            type: 'finalize_character',
          }),
        );

        if ('character' in finalized.data) {
          rememberCharacter(finalized.data);
        }

        const assigned = await unwrap(
          `assign_character_to_participant ${player.participantId}`,
          sendCharacterCommand({
            actor: {
              participantId: dmParticipantId,
            },
            commandId: createCommandId(`demo-assign-${player.participantId}`),
            payload: {
              characterId,
              participantId: player.participantId,
              sessionId: activeSessionId,
            },
            type: 'assign_character_to_participant',
          }),
        );

        if ('state' in assigned.data) {
          latestState = assigned.data.state;
          applySessionSnapshot(latestState);
        }
      }

      const createdScene = await unwrap(
        'create_scene',
        sendSceneCommand({
          actor: {
            participantId: streamParticipantId,
          },
          commandId: createCommandId(`${selectedDemoScenario.id}-create-scene`),
          payload: {
            scene: selectedDemoScenario.scene,
            sessionId: activeSessionId,
          },
          type: 'create_scene',
        }),
      );

      if (!('scene' in createdScene.data)) {
        throw new Error('create_scene returned a non-scene response.');
      }

      rememberScene(createdScene.data.scene);

      const activated = await unwrap(
        'activate_scene_for_session',
        sendSceneCommand({
          actor: {
            participantId: streamParticipantId,
          },
          commandId: createCommandId('demo-activate-scene'),
          payload: {
            sceneId: createdScene.data.scene.id,
            sessionId: activeSessionId,
          },
          type: 'activate_scene_for_session',
        }),
      );

      if ('state' in activated.data) {
        latestState = activated.data.state;
        applySessionSnapshot(latestState);
      }

      for (const player of scenarioPlayers) {
        const position = selectedDemoScenario.positions[player.participantId];

        if (!position) {
          throw new Error(
            `No sample position is defined for ${player.participantId}.`,
          );
        }

        const placed = await unwrap(
          `place_character_in_active_scene ${player.participantId}`,
          sendMovementCommand({
            actor: {
              participantId: player.participantId,
            },
            commandId: createCommandId(`demo-place-${player.participantId}`),
            payload: {
              participantId: player.participantId,
              position,
              sessionId: activeSessionId,
            },
            type: 'place_character_in_active_scene',
          }),
        );

        if ('character' in placed.data) {
          rememberCharacter(placed.data);
        }
      }

      const activeSceneState = await unwrap(
        'get_active_scene_state',
        sendMovementCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('demo-get-active-scene'),
          payload: {
            sessionId: activeSessionId,
          },
          type: 'get_active_scene_state',
        }),
      );

      if ('placedCharacters' in activeSceneState.data) {
        setActiveScene(activeSceneState.data);
      }

      return {
        activeScene: activeSceneState.data,
        characters: Object.values(createdCharacters).map(
          (resource) => resource.character.id,
        ),
        scene: createdScene.data.scene,
        session: latestState,
      };
    });
  }

  async function joinSamplePlayers(): Promise<void> {
    await runTask('join sample players', async () => {
      assertSession();

      let lastState: SessionSnapshot | null = null;

      for (const player of samplePlayers) {
        const response = await unwrap(
          `join_session ${player.participantId}`,
          sendSessionCommand({
            actor: {
              displayName: player.displayName,
              participantId: player.participantId,
              role: 'player',
            },
            commandId: createCommandId(`join-${player.participantId}`),
            payload: {
              sessionId,
            },
            type: 'join_session',
          }),
        );

        lastState = response.data.state;
        applySessionSnapshot(response.data.state);
      }

      return lastState;
    });
  }

  async function createSampleCharacters(): Promise<void> {
    await runTask('create sample characters', async () => {
      assertSession();

      const created: CharacterResource[] = [];

      for (const player of samplePlayers) {
        const characterInput = sampleCharacters[player.participantId];

        if (!characterInput) {
          throw new Error(
            `No sample character is defined for ${player.participantId}.`,
          );
        }

        const response = await unwrap(
          `create_character ${player.participantId}`,
          sendCharacterCommand({
            actor: {
              participantId: player.participantId,
            },
            commandId: createCommandId(
              `create-character-${player.participantId}`,
            ),
            payload: {
              character: characterInput,
              ownerParticipantId: player.participantId,
              sessionId,
            },
            type: 'create_character',
          }),
        );

        if ('character' in response.data) {
          rememberCharacter(response.data);
          created.push(response.data);
        }
      }

      return created;
    });
  }

  async function finalizeAndAssignCharacters(): Promise<void> {
    await runTask('finalize and assign sample characters', async () => {
      assertSession();

      let latestState: SessionSnapshot | null = null;

      for (const player of samplePlayers) {
        const characterId =
          knownCharacterIds[player.participantId] ??
          charactersByParticipant[player.participantId]?.character.id;

        if (!characterId) {
          throw new Error(
            `No character ID is known for ${player.participantId}.`,
          );
        }

        const finalized = await unwrap(
          `finalize_character ${player.participantId}`,
          sendCharacterCommand({
            actor: {
              participantId: player.participantId,
            },
            commandId: createCommandId(`finalize-${player.participantId}`),
            payload: {
              characterId,
              sessionId,
            },
            type: 'finalize_character',
          }),
        );

        if ('character' in finalized.data) {
          rememberCharacter(finalized.data);
        }

        const assigned = await unwrap(
          `assign_character_to_participant ${player.participantId}`,
          sendCharacterCommand({
            actor: {
              participantId: dmParticipantId,
            },
            commandId: createCommandId(`assign-${player.participantId}`),
            payload: {
              characterId,
              participantId: player.participantId,
              sessionId,
            },
            type: 'assign_character_to_participant',
          }),
        );

        if ('state' in assigned.data) {
          latestState = assigned.data.state;
          applySessionSnapshot(assigned.data.state);
        }
      }

      return latestState;
    });
  }

  async function createAndActivateScene(): Promise<void> {
    await runTask('create and activate scene', async () => {
      assertSession();

      const created = await unwrap(
        'create_scene',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('create-scene'),
          payload: {
            scene: {
              grid: {
                cellSizeFeet: 5,
                height: 8,
                width: 8,
              },
              name: 'Training Room',
            },
            sessionId,
          },
          type: 'create_scene',
        }),
      );

      if (!('scene' in created.data)) {
        throw new Error('create_scene returned a non-scene response.');
      }

      rememberScene(created.data.scene);

      const activated = await unwrap(
        'activate_scene_for_session',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('activate-scene'),
          payload: {
            sceneId: created.data.scene.id,
            sessionId,
          },
          type: 'activate_scene_for_session',
        }),
      );

      if ('state' in activated.data) {
        applySessionSnapshot(activated.data.state);
      }

      return {
        activated,
        created,
      };
    });
  }

  async function createCustomScene(): Promise<void> {
    await runTask('create custom scene', async () => {
      assertSession();
      assertSceneDraftValid();

      const response = await unwrap(
        'create_scene',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-create-custom-scene'),
          payload: {
            scene: sceneInputFromDraft(sceneDraft),
            sessionId,
          },
          type: 'create_scene',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error('create_scene returned a non-scene response.');
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function activateSelectedScene(): Promise<void> {
    await runTask('activate selected scene', async () => {
      assertSession();
      const nextSceneId = (sceneActivationId || scene?.id || sceneId).trim();

      if (!nextSceneId) {
        throw new Error('Enter or create a scene ID to activate.');
      }

      const activated = await unwrap(
        'activate_scene_for_session',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-activate-scene'),
          payload: {
            sceneId: nextSceneId,
            sessionId,
          },
          type: 'activate_scene_for_session',
        }),
      );

      if (!('state' in activated.data) || !('sceneId' in activated.data)) {
        throw new Error(
          'activate_scene_transition returned a non-activation response.',
        );
      }

      applySessionSnapshot(activated.data.state);

      const recovered = await unwrap(
        'get_scene',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-get-activated-scene'),
          payload: {
            sceneId: nextSceneId,
            sessionId,
          },
          type: 'get_scene',
        }),
      );

      if ('scene' in recovered.data) {
        rememberScene(recovered.data.scene);
      }

      return {
        activated,
        scene: recovered,
      };
    });
  }

  async function placeSceneEntity(): Promise<void> {
    await runTask('place scene entity', async () => {
      assertSession();
      assertSceneEntityDraftValid();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId) {
        throw new Error('Create, activate, or recover a scene first.');
      }

      const response = await unwrap(
        'place_entity_in_scene',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-place-scene-entity'),
          payload: {
            entity: sceneEntityInputFromDraft(sceneEntityDraft, selectedCell),
            sceneId: targetSceneId,
            sessionId,
          },
          type: 'place_entity_in_scene',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error('place_entity_in_scene returned a non-scene response.');
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function updateSceneEntity(): Promise<void> {
    await runTask('update scene entity', async () => {
      assertSession();
      assertSceneEntityEditDraftValid();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId || !selectedSceneEntityId) {
        throw new Error('Select a passive scene entity to update.');
      }

      const response = await unwrap(
        'update_scene_entity',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-update-scene-entity'),
          payload: {
            entity: sceneEntityUpdateInputFromDraft(sceneEntityEditDraft),
            entityId: selectedSceneEntityId,
            sceneId: targetSceneId,
            sessionId,
          },
          type: 'update_scene_entity',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error('update_scene_entity returned a non-scene response.');
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function repositionSceneEntity(): Promise<void> {
    await runTask('reposition scene entity', async () => {
      assertSession();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId || !selectedSceneEntityId) {
        throw new Error('Select a passive scene entity to reposition.');
      }

      const response = await unwrap(
        'reposition_scene_entity',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-reposition-scene-entity'),
          payload: {
            entityId: selectedSceneEntityId,
            position: selectedCell,
            sceneId: targetSceneId,
            sessionId,
          },
          type: 'reposition_scene_entity',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error(
          'reposition_scene_entity returned a non-scene response.',
        );
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function deleteSceneEntity(): Promise<void> {
    await runTask('delete scene entity', async () => {
      assertSession();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId || !selectedSceneEntityId) {
        throw new Error('Select a passive scene entity to delete.');
      }

      const response = await unwrap(
        'delete_scene_entity',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-delete-scene-entity'),
          payload: {
            entityId: selectedSceneEntityId,
            sceneId: targetSceneId,
            sessionId,
          },
          type: 'delete_scene_entity',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error('delete_scene_entity returned a non-scene response.');
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function createSceneTransition(): Promise<void> {
    await runTask('create scene transition', async () => {
      assertSession();
      assertSceneTransitionDraftValid();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId) {
        throw new Error('Create, activate, or recover a source scene first.');
      }

      const response = await unwrap(
        'create_scene_transition',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-create-scene-transition'),
          payload: {
            sceneId: targetSceneId,
            sessionId,
            transition: sceneTransitionInputFromDraft(
              sceneTransitionDraft,
              selectedCell,
            ),
          },
          type: 'create_scene_transition',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error(
          'create_scene_transition returned a non-scene response.',
        );
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function updateSceneTransition(): Promise<void> {
    await runTask('update scene transition', async () => {
      assertSession();
      assertSceneTransitionEditDraftValid();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId || !selectedTransitionId) {
        throw new Error('Select a scene transition to update.');
      }

      const response = await unwrap(
        'update_scene_transition',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-update-scene-transition'),
          payload: {
            sceneId: targetSceneId,
            sessionId,
            transition: sceneTransitionUpdateInputFromDraft(
              sceneTransitionEditDraft,
            ),
            transitionId: selectedTransitionId,
          },
          type: 'update_scene_transition',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error(
          'update_scene_transition returned a non-scene response.',
        );
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function deleteSceneTransition(): Promise<void> {
    await runTask('delete scene transition', async () => {
      assertSession();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId || !selectedTransitionId) {
        throw new Error('Select a scene transition to delete.');
      }

      const response = await unwrap(
        'delete_scene_transition',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-delete-scene-transition'),
          payload: {
            sceneId: targetSceneId,
            sessionId,
            transitionId: selectedTransitionId,
          },
          type: 'delete_scene_transition',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error(
          'delete_scene_transition returned a non-scene response.',
        );
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function activateSceneTransition(): Promise<void> {
    await runTask('activate scene transition', async () => {
      assertSession();
      const targetSceneId = scene?.id ?? sceneId;

      if (!targetSceneId || !selectedTransitionId) {
        throw new Error('Select a scene transition to activate.');
      }

      const activated = await unwrap(
        'activate_scene_transition',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-activate-scene-transition'),
          payload: {
            sceneId: targetSceneId,
            sessionId,
            transitionId: selectedTransitionId,
          },
          type: 'activate_scene_transition',
        }),
      );

      if (!('state' in activated.data) || !('sceneId' in activated.data)) {
        throw new Error(
          'activate_scene_transition returned a non-activation response.',
        );
      }

      applySessionSnapshot(activated.data.state);

      const recovered = await unwrap(
        'get_scene',
        sendSceneCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-get-transition-target-scene'),
          payload: {
            sceneId: activated.data.sceneId,
            sessionId,
          },
          type: 'get_scene',
        }),
      );

      if ('scene' in recovered.data) {
        rememberScene(recovered.data.scene);
      }

      return {
        activated,
        scene: recovered,
      };
    });
  }

  async function createCombatant(): Promise<void> {
    await runTask('dm_create_combatant_in_active_scene', async () => {
      assertSession();
      assertCombatantDraftValid();

      const response = await unwrap(
        'dm_create_combatant_in_active_scene',
        sendDmCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-create-combatant'),
          payload: {
            combatant: combatantInputFromDraft(combatantDraft, selectedCell),
            sessionId,
          },
          type: 'dm_create_combatant_in_active_scene',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error(
          'dm_create_combatant_in_active_scene returned a non-scene response.',
        );
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function repositionCombatant(): Promise<void> {
    await runTask('dm_reposition_combatant_in_active_scene', async () => {
      assertSession();

      if (!selectedCombatantId) {
        throw new Error('Select a monster/NPC combatant first.');
      }

      const response = await unwrap(
        'dm_reposition_combatant_in_active_scene',
        sendDmCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-reposition-combatant'),
          payload: {
            combatantId: selectedCombatantId,
            position: selectedCell,
            sessionId,
          },
          type: 'dm_reposition_combatant_in_active_scene',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error(
          'dm_reposition_combatant_in_active_scene returned a non-scene response.',
        );
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function setCombatantHp(): Promise<void> {
    await runTask('dm_set_combatant_current_hp', async () => {
      assertSession();

      if (!selectedCombatantId) {
        throw new Error('Select a monster/NPC combatant first.');
      }

      const response = await unwrap(
        'dm_set_combatant_current_hp',
        sendDmCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-combatant-hp'),
          payload: {
            combatantId: selectedCombatantId,
            currentHp: Number.parseInt(combatantHpDraft, 10),
            sessionId,
          },
          type: 'dm_set_combatant_current_hp',
        }),
      );

      if (!('scene' in response.data)) {
        throw new Error(
          'dm_set_combatant_current_hp returned a non-scene response.',
        );
      }

      rememberScene(response.data.scene);

      return response;
    });
  }

  async function placeSampleCharacters(): Promise<void> {
    await runTask('place sample characters', async () => {
      assertSession();

      const positions: Record<string, Cell> = {
        'player-001': { x: 0, y: 0 },
        'player-002': { x: 1, y: 0 },
      };
      const placed: CharacterResource[] = [];

      for (const player of samplePlayers) {
        const position = positions[player.participantId];

        if (!position) {
          throw new Error(
            `No sample position is defined for ${player.participantId}.`,
          );
        }

        const response = await unwrap(
          `place_character_in_active_scene ${player.participantId}`,
          sendMovementCommand({
            actor: {
              participantId: player.participantId,
            },
            commandId: createCommandId(`place-${player.participantId}`),
            payload: {
              participantId: player.participantId,
              position,
              sessionId,
            },
            type: 'place_character_in_active_scene',
          }),
        );

        if ('character' in response.data) {
          rememberCharacter(response.data);
          placed.push(response.data);
        }
      }

      await readActiveSceneState({ quiet: true });

      return placed;
    });
  }

  async function startEncounter(): Promise<void> {
    await runTask('start_encounter', async () => {
      assertSession();

      const response = await unwrap(
        'start_encounter',
        sendEncounterCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('start-encounter'),
          payload: {
            sessionId,
          },
          type: 'start_encounter',
        }),
      );

      setEncounter(response.data.encounter);
      setTurnUsageDraft(response.data.encounter.currentTurnUsage);

      return response;
    });
  }

  async function recoverReadModels(): Promise<void> {
    await runTask('recover read models', async () => {
      assertSession();

      const activeSessionId = sessionId;
      const notes: string[] = [];
      const recovered = await unwrap(
        'reconnect_session',
        sendSessionCommand({
          actor: {
            displayName: streamDisplayName,
            participantId: streamParticipantId,
            role: streamRole,
          },
          commandId: createCommandId('reconnect'),
          payload: {
            sessionId: activeSessionId,
          },
          type: 'reconnect_session',
        }),
      );

      clearRuntimeReadModels();
      applySessionSnapshot(recovered.data.state);

      const recoveredActiveSceneId = recovered.data.state.session.activeSceneId;
      let recoveredScene: Scene | null = null;
      let recoveredActiveScene: ActiveSceneState | null = null;
      let recoveredEncounter: Encounter | null = null;

      if (recoveredActiveSceneId) {
        const sceneResult = await sendSceneCommand({
          actor: {
            participantId: streamParticipantId,
          },
          commandId: createCommandId('get-scene'),
          payload: {
            sceneId: recoveredActiveSceneId,
            sessionId: activeSessionId,
          },
          type: 'get_scene',
        });

        if (sceneResult.ok && 'scene' in sceneResult.response.data) {
          recoveredScene = sceneResult.response.data.scene;
          rememberScene(recoveredScene);
        } else if (!sceneResult.ok) {
          if (!isExpectedRecoveryMiss(sceneResult.error.code)) {
            throw new Error(
              formatRuntimeFailure('get_scene', sceneResult.error),
            );
          }

          notes.push(formatRuntimeFailure('get_scene', sceneResult.error));
          pushLog('recover skipped get_scene', sceneResult.error);
          setScene(null);
        }

        const activeSceneResult = await sendMovementCommand({
          actor: {
            participantId: streamParticipantId,
          },
          commandId: createCommandId('get-active-scene'),
          payload: {
            sessionId: activeSessionId,
          },
          type: 'get_active_scene_state',
        });

        if (
          activeSceneResult.ok &&
          'placedCharacters' in activeSceneResult.response.data
        ) {
          recoveredActiveScene = activeSceneResult.response.data;
          setActiveScene(recoveredActiveScene);
        } else if (!activeSceneResult.ok) {
          if (!isExpectedRecoveryMiss(activeSceneResult.error.code)) {
            throw new Error(
              formatRuntimeFailure(
                'get_active_scene_state',
                activeSceneResult.error,
              ),
            );
          }

          notes.push(
            formatRuntimeFailure(
              'get_active_scene_state',
              activeSceneResult.error,
            ),
          );
          pushLog(
            'recover skipped get_active_scene_state',
            activeSceneResult.error,
          );
          setActiveScene(null);
        }
      } else {
        setSceneId('');
        setScene(null);
        setActiveScene(null);
      }

      const encounterResult = await sendEncounterCommand({
        actor: {
          participantId: streamParticipantId,
        },
        commandId: createCommandId('get-encounter'),
        payload: {
          sessionId: activeSessionId,
        },
        type: 'get_encounter_state',
      });

      if (encounterResult.ok) {
        recoveredEncounter = encounterResult.response.data.encounter;
        setEncounter(recoveredEncounter);
        setTurnUsageDraft(recoveredEncounter.currentTurnUsage);
      } else if (isExpectedRecoveryMiss(encounterResult.error.code)) {
        notes.push(
          formatRuntimeFailure('get_encounter_state', encounterResult.error),
        );
        pushLog('recover skipped get_encounter_state', encounterResult.error);
        setEncounter(null);
        setTurnUsageDraft({
          actionUsed: false,
          bonusActionUsed: false,
          movementUsed: 0,
          reactionUsed: false,
        });
      } else {
        throw new Error(
          formatRuntimeFailure('get_encounter_state', encounterResult.error),
        );
      }

      const characterRefs = new Map<
        string,
        {
          characterId: string;
          participantId: string;
        }
      >();

      for (const participant of getAssignedCharacterRefs(
        recovered.data.state,
      )) {
        characterRefs.set(participant.characterId, participant);
      }

      for (const participant of getPendingCharacterRefs(recovered.data.state)) {
        if (!characterRefs.has(participant.characterId)) {
          characterRefs.set(participant.characterId, participant);
        }
      }

      for (const [participantId, characterId] of Object.entries(
        knownCharacterIdsByParticipant,
      )) {
        if (characterId && !characterRefs.has(characterId)) {
          characterRefs.set(characterId, {
            characterId,
            participantId,
          });
        }
      }

      for (const participant of characterRefs.values()) {
        const characterResult = await sendCharacterCommand({
          actor: {
            participantId: streamParticipantId,
          },
          commandId: createCommandId(
            `get-character-${participant.participantId}`,
          ),
          payload: {
            characterId: participant.characterId,
            sessionId: activeSessionId,
          },
          type: 'get_character',
        });

        if (
          characterResult.ok &&
          'character' in characterResult.response.data
        ) {
          rememberCharacter(characterResult.response.data);
        } else if (!characterResult.ok) {
          if (!isExpectedRecoveryMiss(characterResult.error.code)) {
            throw new Error(
              formatRuntimeFailure('get_character', characterResult.error),
            );
          }

          notes.push(
            formatRuntimeFailure('get_character', characterResult.error),
          );
          pushLog('recover skipped get_character', {
            error: characterResult.error,
            participant,
          });
        }
      }

      setRecoveryNotes(notes);

      return {
        activeScene: recoveredActiveScene,
        encounter: recoveredEncounter,
        notes,
        scene: recoveredScene,
        session: recovered.data.state,
      };
    });
  }

  async function readActiveSceneState(params: { quiet?: boolean } = {}) {
    const label = 'get_active_scene_state';
    const read = async () => {
      assertSession();

      const response = await unwrap(
        label,
        sendMovementCommand({
          actor: {
            participantId: streamParticipantId,
          },
          commandId: createCommandId('get-active-scene'),
          payload: {
            sessionId,
          },
          type: 'get_active_scene_state',
        }),
      );

      if (!('placedCharacters' in response.data)) {
        throw new Error(
          'get_active_scene_state returned a movement mutation response.',
        );
      }

      setActiveScene(response.data);

      return response;
    };

    if (params.quiet) {
      await read();
      return;
    }

    await runTask(label, read);
  }

  async function runEncounterCommand(type: SimpleEncounterCommandType) {
    await runTask(type, async () => {
      assertSession();

      const actorParticipantId =
        type === 'advance_turn' ? dmParticipantId : actingParticipantId;
      const response = await unwrap(
        type,
        sendEncounterCommand({
          actor: {
            participantId: actorParticipantId,
          },
          commandId: createCommandId(type),
          payload: {
            sessionId,
          },
          type,
        }),
      );

      setEncounter(response.data.encounter);
      setTurnUsageDraft(response.data.encounter.currentTurnUsage);

      return response;
    });
  }

  async function attackTarget(): Promise<void> {
    await runTask('attack', async () => {
      assertSession();
      const targetCombatantId =
        mode === 'player' ? selectedTargetCombatantId : '';

      const response = await unwrap(
        'attack',
        sendEncounterCommand({
          actor: {
            participantId: actingParticipantId,
          },
          commandId: createCommandId('attack'),
          payload: {
            sessionId,
            ...(targetCombatantId
              ? {
                  targetCombatantId,
                }
              : {
                  targetParticipantId: selectedTarget,
                }),
          },
          type: 'attack',
        }),
      );

      setEncounter(response.data.encounter);
      setTurnUsageDraft(response.data.encounter.currentTurnUsage);

      if (targetCombatantId && sceneId) {
        const recoveredScene = await unwrap(
          'get_scene',
          sendSceneCommand({
            actor: {
              participantId: actingParticipantId,
            },
            commandId: createCommandId('attack-get-scene'),
            payload: {
              sceneId,
              sessionId,
            },
            type: 'get_scene',
          }),
        );

        if ('scene' in recoveredScene.data) {
          rememberScene(recoveredScene.data.scene);
        }
      }

      return response;
    });
  }

  async function dmCombatantAttackTarget(): Promise<void> {
    await runTask('dm_combatant_attack', async () => {
      assertSession();

      if (!selectedCombatantId) {
        throw new Error('Select a monster/NPC combatant first.');
      }

      const response = await unwrap(
        'dm_combatant_attack',
        sendDmCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-combatant-attack'),
          payload: {
            combatantId: selectedCombatantId,
            sessionId,
            targetParticipantId: selectedTarget,
          },
          type: 'dm_combatant_attack',
        }),
      );

      if ('encounter' in response.data) {
        setEncounter(response.data.encounter);
        setTurnUsageDraft(response.data.encounter.currentTurnUsage);
      }

      return response;
    });
  }

  async function moveSelectedActor(): Promise<void> {
    await runTask('move_character_in_active_scene', async () => {
      assertSession();

      const response = await unwrap(
        'move_character_in_active_scene',
        sendMovementCommand({
          actor: {
            participantId: actingParticipantId,
          },
          commandId: createCommandId('move-character'),
          payload: {
            participantId: actingParticipantId,
            position: selectedCell,
            sessionId,
          },
          type: 'move_character_in_active_scene',
        }),
      );

      if ('character' in response.data) {
        rememberCharacter(response.data);
      }

      await readActiveSceneState({ quiet: true });

      return response;
    });
  }

  async function createPlayerCharacter(): Promise<void> {
    await runTask('create_character player draft', async () => {
      assertSession();
      assertCharacterDraftValid();

      const response = await unwrap(
        'create_character',
        sendCharacterCommand({
          actor: {
            participantId: playerParticipantId,
          },
          commandId: createCommandId('player-create-character'),
          payload: {
            character: characterInputFromDraft(characterDraft),
            ownerParticipantId: playerParticipantId,
            sessionId,
          },
          type: 'create_character',
        }),
      );

      if (!('character' in response.data)) {
        throw new Error('create_character returned a non-character response.');
      }

      rememberCharacter(response.data);

      return response;
    });
  }

  async function updatePlayerCharacter(): Promise<void> {
    await runTask('update_character player draft', async () => {
      assertSession();
      assertCharacterDraftValid();
      const characterId = requirePlayerCharacterId();

      const response = await unwrap(
        'update_character',
        sendCharacterCommand({
          actor: {
            participantId: playerParticipantId,
          },
          commandId: createCommandId('player-update-character'),
          payload: {
            character: characterUpdateInputFromDraft(characterDraft),
            characterId,
            sessionId,
          },
          type: 'update_character',
        }),
      );

      if (!('character' in response.data)) {
        throw new Error('update_character returned a non-character response.');
      }

      rememberCharacter(response.data);

      return response;
    });
  }

  async function finalizePlayerCharacter(): Promise<void> {
    await runTask('finalize_character player draft', async () => {
      assertSession();
      const characterId = requirePlayerCharacterId();

      const response = await unwrap(
        'finalize_character',
        sendCharacterCommand({
          actor: {
            participantId: playerParticipantId,
          },
          commandId: createCommandId('player-finalize-character'),
          payload: {
            characterId,
            sessionId,
          },
          type: 'finalize_character',
        }),
      );

      if (!('character' in response.data)) {
        throw new Error(
          'finalize_character returned a non-character response.',
        );
      }

      rememberCharacter(response.data);

      return response;
    });
  }

  async function submitPlayerCharacterForAssignment(): Promise<void> {
    await runTask('submit_character_for_assignment player', async () => {
      assertSession();
      const characterId = requirePlayerCharacterId();

      const response = await unwrap(
        'submit_character_for_assignment',
        sendCharacterCommand({
          actor: {
            participantId: playerParticipantId,
          },
          commandId: createCommandId('player-submit-character'),
          payload: {
            characterId,
            sessionId,
          },
          type: 'submit_character_for_assignment',
        }),
      );

      if ('state' in response.data) {
        applySessionSnapshot(response.data.state);
      }

      return response;
    });
  }

  async function submitSelectedLibraryEntryForAssignment(): Promise<void> {
    await runTask(
      'submit_character_library_entry_for_assignment player',
      async () => {
        assertSession();

        const ownerUserId = user?.id;

        if (!ownerUserId) {
          throw new Error(t('runtime.characterLibrary.signInRequired'));
        }

        const entry = finalizedLibraryEntries.find(
          (candidate) => candidate.id === selectedLibraryEntryId,
        );

        if (!entry) {
          throw new Error(t('runtime.characterLibrary.selectRequired'));
        }

        const result = await submitCharacterLibraryEntryForAssignment({
          actorParticipantId: playerParticipantId,
          entryId: entry.id,
          ownerParticipantId: ownerUserId,
          sessionId,
        });

        if (!result.ok) {
          throw new Error(
            formatRuntimeFailure(
              'submit_character_library_entry_for_assignment',
              result.error,
            ),
          );
        }

        applySessionSnapshot(result.data.state);
        setKnownCharacterIdsByParticipant((current) => ({
          ...current,
          [playerParticipantId]: result.data.characterId,
        }));

        const characterResult = await unwrap(
          'get_character',
          sendCharacterCommand({
            actor: {
              participantId: playerParticipantId,
            },
            commandId: createCommandId('player-read-library-runtime-character'),
            payload: {
              characterId: result.data.characterId,
              sessionId,
            },
            type: 'get_character',
          }),
        );

        if ('character' in characterResult.data) {
          rememberCharacter(characterResult.data);
        }

        return {
          data: result.data,
          ok: true,
        };
      },
    );
  }

  async function dmAssignSelectedLoadedCharacter(): Promise<void> {
    await runTask('assign selected loaded character', async () => {
      assertSession();
      const characterId =
        charactersByParticipant[selectedActor]?.character.id ??
        knownCharacterIds[selectedActor];

      if (!characterId) {
        throw new Error(`No loaded character is known for ${selectedActor}.`);
      }

      const response = await unwrap(
        'assign_character_to_participant',
        sendCharacterCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-assign-loaded-character'),
          payload: {
            characterId,
            participantId: selectedActor,
            sessionId,
          },
          type: 'assign_character_to_participant',
        }),
      );

      if ('state' in response.data) {
        applySessionSnapshot(response.data.state);
      }

      return response;
    });
  }

  async function dmAssignPendingCharacter(
    participantId: string,
    characterId: string,
  ): Promise<void> {
    await runTask(`assign pending character ${participantId}`, async () => {
      assertSession();

      const response = await unwrap(
        'assign_character_to_participant',
        sendCharacterCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-assign-pending-character'),
          payload: {
            characterId,
            participantId,
            sessionId,
          },
          type: 'assign_character_to_participant',
        }),
      );

      if ('state' in response.data) {
        applySessionSnapshot(response.data.state);
      }

      return response;
    });
  }

  async function dmSetCurrentHp(): Promise<void> {
    await runDmCharacterCommand('dm_set_character_current_hp', {
      currentHp: Number.parseInt(hpDraft, 10),
    });
  }

  async function dmSetConditions(): Promise<void> {
    await runDmCharacterCommand('dm_set_character_active_conditions', {
      activeConditions: conditionsDraft
        .split(',')
        .map((condition) => condition.trim())
        .filter(Boolean),
    });
  }

  async function dmRepositionSelected(): Promise<void> {
    await runTask('dm_reposition_character_in_active_scene', async () => {
      assertSession();
      const characterId = requireCharacterId(selectedActor);
      const response = await unwrap(
        'dm_reposition_character_in_active_scene',
        sendDmCommand({
          actor: {
            participantId: dmParticipantId,
          },
          commandId: createCommandId('dm-reposition'),
          payload: {
            characterId,
            participantId: selectedActor,
            position: selectedCell,
            sessionId,
          },
          type: 'dm_reposition_character_in_active_scene',
        }),
      );

      if ('character' in response.data) {
        rememberCharacter(response.data);
      }

      await readActiveSceneState({ quiet: true });

      return response;
    });
  }

  async function dmSetTurnParticipant(): Promise<void> {
    await runDmEncounterCommand({
      actor: {
        participantId: dmParticipantId,
      },
      commandId: createCommandId('dm-current-turn'),
      payload: {
        participantId: selectedActor,
        sessionId,
      },
      type: 'dm_set_current_turn_participant',
    });
  }

  async function dmSetTurnCombatant(): Promise<void> {
    if (!selectedCombatantId) {
      setCommandError('Select a monster/NPC combatant first.');
      return;
    }

    await runDmEncounterCommand({
      actor: {
        participantId: dmParticipantId,
      },
      commandId: createCommandId('dm-current-turn-combatant'),
      payload: {
        combatantId: selectedCombatantId,
        sessionId,
      },
      type: 'dm_set_current_turn_participant',
    });
  }

  async function dmSetTurnUsage(): Promise<void> {
    await runDmEncounterCommand({
      actor: {
        participantId: dmParticipantId,
      },
      commandId: createCommandId('dm-turn-usage'),
      payload: {
        sessionId,
        turnUsage: turnUsageDraft,
      },
      type: 'dm_set_current_turn_usage',
    });
  }

  async function dmEndEncounter(): Promise<void> {
    await runDmEncounterCommand({
      actor: {
        participantId: dmParticipantId,
      },
      commandId: createCommandId('dm-end-encounter'),
      payload: {
        sessionId,
      },
      type: 'dm_end_active_encounter',
    });
  }

  async function runDmCharacterCommand(
    type: 'dm_set_character_active_conditions' | 'dm_set_character_current_hp',
    value:
      | { activeConditions: string[] }
      | {
          currentHp: number;
        },
  ): Promise<void> {
    await runTask(type, async () => {
      assertSession();

      const characterId = requireCharacterId(selectedActor);
      const command: DmCommand =
        type === 'dm_set_character_current_hp'
          ? {
              actor: {
                participantId: dmParticipantId,
              },
              commandId: createCommandId('dm-hp'),
              payload: {
                characterId,
                currentHp:
                  'currentHp' in value && Number.isFinite(value.currentHp)
                    ? value.currentHp
                    : 0,
                participantId: selectedActor,
                sessionId,
              },
              type,
            }
          : {
              actor: {
                participantId: dmParticipantId,
              },
              commandId: createCommandId('dm-conditions'),
              payload: {
                activeConditions:
                  'activeConditions' in value ? value.activeConditions : [],
                characterId,
                participantId: selectedActor,
                sessionId,
              },
              type,
            };

      const response = await unwrap(type, sendDmCommand(command));

      if ('character' in response.data) {
        rememberCharacter(response.data);
      }

      return response;
    });
  }

  async function runDmEncounterCommand(command: DmCommand): Promise<void> {
    await runTask(command.type, async () => {
      assertSession();

      const response = await unwrap(command.type, sendDmCommand(command));

      if ('encounter' in response.data) {
        setEncounter(response.data.encounter);
        setTurnUsageDraft(response.data.encounter.currentTurnUsage);
      }

      return response;
    });
  }

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

  function assertCharacterDraftValid(): void {
    const errors = validateCharacterDraftForm(characterDraft);

    if (errors.length) {
      throw new Error(`Fix the character sheet first: ${errors.join(' ')}`);
    }
  }

  function assertSceneDraftValid(): void {
    const errors = validateSceneDraftForm(sceneDraft);

    if (errors.length) {
      throw new Error(`Fix the scene draft first: ${errors.join(' ')}`);
    }
  }

  function assertSceneEntityDraftValid(): void {
    const errors = validateSceneEntityDraftForm({
      form: sceneEntityDraft,
      grid: scene?.grid,
      position: selectedCell,
    });

    if (errors.length) {
      throw new Error(`Fix the entity draft first: ${errors.join(' ')}`);
    }
  }

  function assertSceneEntityEditDraftValid(): void {
    const selectedEntity = getPassiveSceneEntities(scene).find(
      (entity) => entity.id === selectedSceneEntityId,
    );
    const errors = validateSceneEntityDraftForm({
      form: sceneEntityEditDraft,
      grid: scene?.grid,
      position: selectedEntity?.position ?? selectedCell,
    });

    if (errors.length) {
      throw new Error(`Fix the entity edit form first: ${errors.join(' ')}`);
    }
  }

  function assertSceneTransitionDraftValid(): void {
    const errors = validateSceneTransitionDraftForm({
      form: sceneTransitionDraft,
      grid: scene?.grid,
      position: selectedCell,
    });

    if (errors.length) {
      throw new Error(`Fix the transition draft first: ${errors.join(' ')}`);
    }
  }

  function assertSceneTransitionEditDraftValid(): void {
    const selectedTransition = getTransitionSceneEntities(scene).find(
      (entity) => entity.id === selectedTransitionId,
    );
    const errors = validateSceneTransitionDraftForm({
      form: sceneTransitionEditDraft,
      grid: scene?.grid,
      position: selectedTransition?.position ?? selectedCell,
    });

    if (errors.length) {
      throw new Error(
        `Fix the transition edit form first: ${errors.join(' ')}`,
      );
    }
  }

  function assertCombatantDraftValid(): void {
    const errors = validateCombatantDraftForm({
      form: combatantDraft,
      grid: scene?.grid,
      position: selectedCell,
    });

    if (errors.length) {
      throw new Error(`Fix the combatant draft first: ${errors.join(' ')}`);
    }
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

  function assertSession(): void {
    if (!sessionId) {
      throw new Error('Create or enter a session ID first.');
    }
  }

  const canUseSession = Boolean(sessionId);
  const grid = scene?.grid ?? {
    cellSizeFeet: 5,
    height: 8,
    width: 8,
  };
  function panTacticalBoard(direction: TacticalBoardPanDirection): void {
    setTacticalBoardViewport((current) =>
      getTacticalBoardViewportAfterPan({
        direction,
        grid,
        viewport: current,
      }),
    );
  }

  function zoomTacticalBoard(direction: TacticalBoardZoomDirection): void {
    setTacticalBoardViewport((current) =>
      getTacticalBoardViewportAfterZoom(current, direction),
    );
  }

  function resetTacticalBoardView(): void {
    setTacticalBoardViewport(defaultTacticalBoardViewport);
  }

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
    transitionDraftErrors.length > 0
      ? `Fix the transition draft first: ${transitionDraftErrors[0]}`
      : null;
  const transitionEditDraftReason =
    transitionEditDraftErrors.length > 0
      ? `Fix the transition edit form first: ${transitionEditDraftErrors[0]}`
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
    combatantDraftErrors.length > 0
      ? `Fix the combatant draft first: ${combatantDraftErrors[0]}`
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
    (selectedCombatantId ? null : 'Create or select a monster/NPC first.');
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
    : (activeScene?.activeSceneId ?? sceneId) || 'none';
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
    currentActorLabel: currentTurnName,
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
              summary: describeSessionStreamEvent(entry.payload),
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
                  streamEnabled
                    ? t('runtime.status.stream', { status: stream.status })
                    : t('runtime.status.streamIdle')
                }
                tone={streamEnabled ? 'success' : 'info'}
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
                  onChange={setDmDisplayName}
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
                  onChange={setPlayerDisplayName}
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
                  streamEnabled
                    ? t('runtime.session.disconnectSse')
                    : t('runtime.session.subscribeSse')
                }
                onClick={() => setStreamEnabled((current) => !current)}
                variant={streamEnabled ? 'danger' : 'secondary'}
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
              <TacticalGrid
                activeScene={activeScene}
                actingParticipantId={actingParticipantId}
                charactersByParticipant={charactersByParticipant}
                currentTurnCombatantId={currentTurnCombatantId}
                currentTurnParticipantId={currentTurnParticipantId}
                grid={grid}
                mode={mode}
                moveDisabledReason={movementFeedbackSummary.moveBlockedReason}
                onPanBoard={panTacticalBoard}
                onResetBoardView={resetTacticalBoardView}
                onSelectCell={setSelectedCell}
                onSelectSceneEntity={selectPassiveSceneEntity}
                onSelectTransition={selectSceneTransitionNode}
                onZoomBoard={zoomTacticalBoard}
                scene={scene}
                selectedCell={selectedCell}
                selectedCombatantId={selectedCombatantId}
                selectedSceneEntityId={selectedSceneEntityId}
                selectedTargetCombatantId={selectedTargetCombatantId}
                selectedTargetParticipantId={selectedTarget}
                selectedTransitionId={selectedTransitionId}
                viewport={tacticalBoardViewport}
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
            <RuntimeStatusOverviewPanel
              overview={runtimeStatusOverview}
              t={t}
            />
            <PlayerReadinessRosterPanel roster={runtimeReadinessRoster} t={t} />

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
                    selectedTargetLabel={selectedTarget || 'none'}
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
                draftErrors={transitionDraftErrors}
                editDraft={sceneTransitionEditDraft}
                editDraftErrors={transitionEditDraftErrors}
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
                combatantDraftErrors={combatantDraftErrors}
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

            <Panel
              description={t('runtime.turnTarget.description')}
              eyebrow={t('runtime.turnTarget.eyebrow')}
              title={t('runtime.turnTarget.title')}
            >
              <div className="grid gap-3">
                <EncounterStatusFeedback
                  summary={encounterStatusSummary}
                  t={t}
                />
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
                        movement: String(
                          encounter.currentTurnUsage.movementUsed,
                        ),
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
                                (entity) =>
                                  entity.id === participant.combatantId,
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
                <ActionTargetFeedback
                  summary={actionTargetFeedbackSummary}
                  t={t}
                />
                <ActionEconomyFeedback
                  summary={actionEconomyFeedbackSummary}
                  t={t}
                />
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    disabled={Boolean(actionEconomyAction.blockedReason)}
                    disabledReason={
                      actionEconomyAction.blockedReason ?? undefined
                    }
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
                    disabledReason={
                      actionEconomyReaction.blockedReason ?? undefined
                    }
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
                                value={request.assignedCharacterId ?? 'none'}
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
                        value={selectedActorKnownCharacterId ?? 'none'}
                      />
                      <StatusRow
                        label={t('runtime.assignmentHelper.pending')}
                        value={selectedActorPendingCharacterId ?? 'none'}
                      />
                      <StatusRow
                        label={t('runtime.assignmentHelper.assigned')}
                        value={selectedActorAssignedCharacterId ?? 'none'}
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
                  value={sessionId || 'none'}
                />
                <StatusRow
                  label={t('runtime.statePanel.activeScene')}
                  value={sceneId || 'none'}
                />
                <StatusRow
                  label={t('runtime.statePanel.sceneName')}
                  value={scene?.name ?? 'none'}
                />
                <StatusRow
                  label={t('runtime.statePanel.currentTurn')}
                  value={currentTurnName}
                />
                <StatusRow
                  label={t('runtime.statePanel.encounter')}
                  value={
                    encounter
                      ? `${encounter.status} round ${encounter.roundNumber}`
                      : 'none'
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
  const turnLabel = overview.turn.actorLabel
    ? t('runtime.statusOverview.turnActive', {
        actor: overview.turn.actorLabel,
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
        currentActorLabel: overview.turn.actorLabel ?? t('common.none'),
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
  variant = 'primary',
}: {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onClick: () => void | Promise<void>;
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
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <input
        className="min-h-10 rounded-xl border border-amber-300/20 bg-black/25 px-3 py-2 text-amber-50 outline-none transition placeholder:text-amber-100/30 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
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
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{
    label: string;
    value: string;
  }>;
  value: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-amber-100/75">{label}</span>
      <select
        className="min-h-10 rounded-xl border border-amber-300/20 bg-[#1d140f] px-3 py-2 text-amber-50 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/25"
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
          {summary.actorLabel}
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
                  status: target.status,
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

  return (
    <div className="grid gap-2 rounded-xl border border-amber-300/15 bg-amber-950/10 p-3 text-xs text-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.12em] text-amber-200/80">
            {t('runtime.actionEconomy.title')}
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {summary.actorLabel}
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
  targetParticipantId: string;
}) {
  return (
    <Panel
      description="Create and command narrow DM-controlled monster/NPC combatants. They are scene actors, not full stat blocks or AI."
      eyebrow="DM-only"
      title="Monsters & NPCs"
      tone="dm"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-red-950/15 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">Create combatant</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              Target cell {selectedCell.x},{selectedCell.y}. Combatants block
              movement and can join encounter turn order.
            </p>
          </div>
          {combatantDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {combatantDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Kind"
              onChange={(value) => onFieldChange('kind', value)}
              options={[
                { label: 'monster', value: 'monster' },
                { label: 'npc', value: 'npc' },
              ]}
              value={combatantDraft.kind}
            />
            <LabeledInput
              label="Name"
              onChange={(value) => onFieldChange('name', value)}
              value={combatantDraft.name}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput
              label="HP max"
              onChange={(value) => onHpChange('max', value)}
              value={combatantDraft.hp.max}
            />
            <LabeledInput
              label="HP current"
              onChange={(value) => onHpChange('current', value)}
              value={combatantDraft.hp.current}
            />
            <LabeledInput
              label="Temp"
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
              label="Speed"
              onChange={(value) => onFieldChange('speed', value)}
              value={combatantDraft.speed}
            />
            <LabeledInput
              label="Size W"
              onChange={(value) => onFieldChange('footprintWidth', value)}
              value={combatantDraft.footprintWidth}
            />
            <LabeledInput
              label="Size H"
              onChange={(value) => onFieldChange('footprintHeight', value)}
              value={combatantDraft.footprintHeight}
            />
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
                  value={combatantDraft.abilities[abilityKey]}
                />
              ))}
            </div>
          </div>
          <CheckboxField
            checked={combatantDraft.hidden}
            label="Hidden styling"
            onChange={onHiddenChange}
          />
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label="Create Combatant"
            onClick={onCreate}
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">Command combatant</p>
          {combatants.length ? (
            <SelectField
              label="Selected monster/NPC"
              onChange={onSelectCombatant}
              options={combatants.map((combatant) => ({
                label: `${combatant.name} (${combatant.combatant.kind}, HP ${combatant.combatant.hp.current}/${combatant.combatant.hp.max}${isCombatantEntityDefeated(combatant) ? ', defeated' : ''})`,
                value: combatant.id,
              }))}
              value={selectedCombatantId}
            />
          ) : (
            <EmptyState
              detail="Create a combatant in the active scene first."
              title="No monster/NPC combatants"
            />
          )}
          {selectedCombatant ? (
            <div className="grid gap-2 text-sm">
              <StatusRow
                label="Selected"
                value={`${selectedCombatant.name} at ${selectedCombatant.position.x},${selectedCombatant.position.y}`}
              />
              <StatusRow
                label="Current turn"
                value={
                  currentTurnCombatantId === selectedCombatant.id ? 'yes' : 'no'
                }
              />
              <StatusRow
                label="Status"
                value={
                  isCombatantEntityDefeated(selectedCombatant)
                    ? 'defeated'
                    : 'active'
                }
              />
              <StatusRow label="Target" value={targetParticipantId || 'none'} />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              disabled={Boolean(repositionDisabledReason)}
              disabledReason={repositionDisabledReason ?? undefined}
              label="Reposition"
              onClick={onReposition}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(repositionDisabledReason)}
              disabledReason={repositionDisabledReason ?? undefined}
              label="Make Turn"
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
              label="Set HP"
              onClick={onSetHp}
              variant="secondary"
            />
          </div>
          <ActionButton
            disabled={Boolean(attackDisabledReason)}
            disabledReason={attackDisabledReason ?? undefined}
            label="Monster/NPC Attack Target"
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

function TacticalGrid({
  activeScene,
  actingParticipantId,
  charactersByParticipant,
  currentTurnCombatantId,
  currentTurnParticipantId,
  grid,
  mode,
  moveDisabledReason,
  onPanBoard,
  onResetBoardView,
  onSelectCell,
  onSelectSceneEntity,
  onSelectTransition,
  onZoomBoard,
  scene,
  selectedCell,
  selectedCombatantId,
  selectedSceneEntityId,
  selectedTargetCombatantId,
  selectedTargetParticipantId,
  selectedTransitionId,
  viewport,
}: {
  activeScene: ActiveSceneState | null;
  actingParticipantId: string;
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  currentTurnCombatantId: string | null;
  currentTurnParticipantId: string | null;
  grid: {
    height: number;
    width: number;
  };
  mode: RuntimeMode;
  moveDisabledReason: string | null;
  onPanBoard: (direction: TacticalBoardPanDirection) => void;
  onResetBoardView: () => void;
  onSelectCell: (cell: Cell) => void;
  onSelectSceneEntity: (entityId: string) => void;
  onSelectTransition: (transitionId: string) => void;
  onZoomBoard: (direction: TacticalBoardZoomDirection) => void;
  scene: Scene | null;
  selectedCell: Cell;
  selectedCombatantId: string;
  selectedSceneEntityId: string;
  selectedTargetCombatantId: string;
  selectedTargetParticipantId: string;
  selectedTransitionId: string;
  viewport: TacticalBoardViewport;
}) {
  const { t } = useI18n();
  const cellButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const entityCells = useMemo(() => getSceneEntityDisplayCells(scene), [scene]);
  const visibleEntityCells = useMemo(
    () =>
      mode === 'player'
        ? entityCells.filter(
            (candidate) =>
              !(candidate.entity.transition && candidate.entity.hidden),
          )
        : entityCells,
    [entityCells, mode],
  );
  const combatantCells = useMemo(
    () => getCombatantDisplayCells(scene),
    [scene],
  );
  const cells: Cell[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      cells.push({ x, y });
    }
  }

  const boardCellSizePixels = getTacticalBoardCellSizePixels(viewport.zoom);
  const zoomPercent = `${Math.round(viewport.zoom * 100)}%`;
  const boardPixelWidth = grid.width * boardCellSizePixels;
  const cameraButtonClassName =
    'flex size-9 items-center justify-center rounded-lg border border-amber-400/25 bg-black/25 text-xs font-black text-amber-100 transition hover:border-amber-200 hover:bg-amber-300/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200';
  const boardBadgeLabels: Record<TacticalBoardCellBadgeKind, string> = {
    move: t('runtime.board.badge.move'),
    selected: t('runtime.board.badge.selected'),
    target: t('runtime.board.badge.target'),
    turn: t('runtime.board.badge.turn'),
  };

  function handleCellKeyboardNavigation(
    event: KeyboardEvent<HTMLButtonElement>,
    cell: Cell,
  ): void {
    const nextCell = getTacticalBoardCellAfterKeyboardNavigation({
      cell,
      grid,
      key: event.key,
    });

    if (!nextCell) {
      return;
    }

    event.preventDefault();
    onSelectCell(nextCell);

    window.requestAnimationFrame(() => {
      cellButtonRefs.current[getTacticalBoardCellKey(nextCell)]?.focus();
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-black/25 p-3">
        <div>
          <p className="text-xs font-black uppercase text-amber-100">
            {t('runtime.board.camera')}
          </p>
          <p className="mt-1 text-xs text-amber-100/60">
            {t('runtime.board.viewportSummary', {
              panX: String(viewport.panX),
              panY: String(viewport.panY),
              zoom: zoomPercent,
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-amber-500/15 bg-black/30 p-1">
            <button
              aria-label={t('runtime.board.zoomOut')}
              className={cameraButtonClassName}
              onClick={() => onZoomBoard('out')}
              title={t('runtime.board.zoomOut')}
              type="button"
            >
              -
            </button>
            <span className="min-w-14 text-center text-xs font-bold text-amber-100">
              {zoomPercent}
            </span>
            <button
              aria-label={t('runtime.board.zoomIn')}
              className={cameraButtonClassName}
              onClick={() => onZoomBoard('in')}
              title={t('runtime.board.zoomIn')}
              type="button"
            >
              +
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-amber-500/15 bg-black/30 p-1">
            <span aria-hidden="true" />
            <button
              aria-label={t('runtime.board.panUp')}
              className={cameraButtonClassName}
              onClick={() => onPanBoard('up')}
              title={t('runtime.board.panUp')}
              type="button"
            >
              ^
            </button>
            <span aria-hidden="true" />
            <button
              aria-label={t('runtime.board.panLeft')}
              className={cameraButtonClassName}
              onClick={() => onPanBoard('left')}
              title={t('runtime.board.panLeft')}
              type="button"
            >
              &lt;
            </button>
            <button
              aria-label={t('runtime.board.resetView')}
              className={cameraButtonClassName}
              onClick={onResetBoardView}
              title={t('runtime.board.resetView')}
              type="button"
            >
              0
            </button>
            <button
              aria-label={t('runtime.board.panRight')}
              className={cameraButtonClassName}
              onClick={() => onPanBoard('right')}
              title={t('runtime.board.panRight')}
              type="button"
            >
              &gt;
            </button>
            <span aria-hidden="true" />
            <button
              aria-label={t('runtime.board.panDown')}
              className={cameraButtonClassName}
              onClick={() => onPanBoard('down')}
              title={t('runtime.board.panDown')}
              type="button"
            >
              v
            </button>
            <span aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="min-h-[360px] overflow-hidden rounded-3xl border border-amber-400/30 bg-[#110d0a] p-2 shadow-inner shadow-black/70">
        <div
          className="mx-auto grid transition-transform duration-200 ease-out"
          aria-label={t('runtime.board.gridLabel')}
          role="grid"
          style={{
            gridAutoRows: `${boardCellSizePixels}px`,
            gridTemplateColumns: `repeat(${grid.width}, ${boardCellSizePixels}px)`,
            transform: `translate(${viewport.panX * boardCellSizePixels}px, ${viewport.panY * boardCellSizePixels}px)`,
            width: `${boardPixelWidth}px`,
          }}
        >
          {cells.map((cell) => {
            const entitiesAtCell = visibleEntityCells.filter(
              (candidate) => candidate.x === cell.x && candidate.y === cell.y,
            );
            const primaryEntityCell = entitiesAtCell[0];
            const combatantsAtCell = combatantCells.filter(
              (candidate) => candidate.x === cell.x && candidate.y === cell.y,
            );
            const primaryCombatantCell = combatantsAtCell[0];
            const placement = activeScene?.placedCharacters.find(
              (candidate) =>
                candidate.position.x === cell.x &&
                candidate.position.y === cell.y,
            );
            const resource = placement
              ? charactersByParticipant[placement.participantId]
              : undefined;
            const cellKey = getTacticalBoardCellKey(cell);
            const cellAffordance = getTacticalBoardCellAffordance({
              actingParticipantId,
              cell,
              combatantId: primaryCombatantCell?.entity.id ?? null,
              currentTurnCombatantId,
              currentTurnParticipantId,
              moveDisabledReason,
              participantId: placement?.participantId ?? null,
              selectedCell,
              selectedCombatantId,
              selectedTargetCombatantId,
              selectedTargetParticipantId,
            });
            const isCurrentTurn =
              placement?.participantId === currentTurnParticipantId;
            const isSelected = cellAffordance.isSelectedCell;
            const isSelectedEntity =
              primaryEntityCell?.entity.id === selectedSceneEntityId;
            const isSelectedTransition =
              primaryEntityCell?.entity.id === selectedTransitionId;
            const isTransitionEntity = Boolean(
              primaryEntityCell?.entity.transition,
            );
            const isActingToken =
              placement?.participantId === actingParticipantId;
            const isTarget =
              placement?.participantId === selectedTargetParticipantId;
            const isPlayerOwn =
              mode === 'player' &&
              placement?.participantId === actingParticipantId;
            const isCurrentCombatant =
              primaryCombatantCell?.entity.id === currentTurnCombatantId;
            const isSelectedCombatant =
              primaryCombatantCell?.entity.id === selectedCombatantId;
            const isTargetCombatant =
              primaryCombatantCell?.entity.id === selectedTargetCombatantId;
            const isDefeatedCombatant = primaryCombatantCell
              ? isCombatantEntityDefeated(primaryCombatantCell.entity)
              : false;
            const tokenTone = isTarget
              ? 'border-red-300 bg-red-800 text-red-50 shadow-red-500/40'
              : isPlayerOwn
                ? 'border-sky-200 bg-sky-500 text-slate-950 shadow-sky-300/35'
                : isCurrentTurn
                  ? 'border-amber-100 bg-amber-400 text-stone-950 shadow-amber-300/40'
                  : isActingToken
                    ? 'border-emerald-200 bg-emerald-600 text-emerald-950 shadow-emerald-300/30'
                    : 'border-stone-300 bg-stone-900 text-amber-50 shadow-black/40';
            const entityTone = primaryCombatantCell
              ? isDefeatedCombatant
                ? 'border-stone-400/50 bg-stone-900/70 text-stone-200'
                : 'border-red-200/60 bg-red-900/65 text-red-50'
              : isTransitionEntity
                ? 'border-violet-200/60 bg-violet-950/55 text-violet-100'
                : primaryEntityCell?.entity.type === 'terrain'
                  ? 'border-emerald-300/45 bg-emerald-950/45 text-emerald-100'
                  : primaryEntityCell?.entity.type === 'monster'
                    ? 'border-red-300/45 bg-red-950/45 text-red-100'
                    : primaryEntityCell?.entity.type === 'player_spawn'
                      ? 'border-sky-300/45 bg-sky-950/45 text-sky-100'
                      : 'border-orange-300/40 bg-orange-950/40 text-orange-100';
            const ariaParts = [
              `Select cell ${cell.x}, ${cell.y}`,
              primaryCombatantCell
                ? primaryCombatantCell.label
                : primaryEntityCell
                  ? primaryEntityCell.label
                  : null,
              placement
                ? `token ${resource?.character.name ?? placement.participantId}`
                : null,
              ...cellAffordance.badges.map((badge) => boardBadgeLabels[badge]),
            ].filter(Boolean);

            return (
              <button
                aria-label={ariaParts.join(', ')}
                aria-selected={isSelected}
                className={`group relative border border-amber-950/60 text-xs transition focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-amber-200 ${
                  cellAffordance.isMovementTarget
                    ? 'bg-emerald-300/15 shadow-[inset_0_0_0_2px_rgba(52,211,153,0.95)]'
                    : isSelected
                      ? 'bg-amber-300/20 shadow-[inset_0_0_0_2px_rgba(252,211,77,0.95)]'
                      : primaryCombatantCell
                        ? 'bg-[#3b1614] hover:bg-[#4a1d18]'
                        : primaryEntityCell
                          ? 'bg-[#2c2114] hover:bg-[#3b2b19]'
                          : 'bg-[#211711] hover:bg-[#332316]'
                }`}
                key={cellKey}
                onClick={() => {
                  onSelectCell(cell);

                  if (
                    mode === 'dm' &&
                    primaryEntityCell &&
                    !primaryEntityCell.entity.combatant
                  ) {
                    if (primaryEntityCell.entity.transition) {
                      onSelectTransition(primaryEntityCell.entity.id);
                    } else {
                      onSelectSceneEntity(primaryEntityCell.entity.id);
                    }
                  }
                }}
                onKeyDown={(event) => handleCellKeyboardNavigation(event, cell)}
                ref={(element) => {
                  cellButtonRefs.current[cellKey] = element;
                }}
                role="gridcell"
                tabIndex={isSelected ? 0 : -1}
                type="button"
              >
                <span className="absolute left-1 top-1 text-[9px] font-semibold text-amber-100/20 group-hover:text-amber-100/55">
                  {cell.x},{cell.y}
                </span>
                {cellAffordance.badges.length ? (
                  <span className="pointer-events-none absolute right-1 top-1 z-30 flex max-w-[calc(100%-0.5rem)] flex-wrap justify-end gap-0.5">
                    {cellAffordance.badges.map((badge) => (
                      <span
                        className={getTacticalBoardBadgeClassName(badge)}
                        key={badge}
                        title={boardBadgeLabels[badge]}
                      >
                        {getTacticalBoardBadgeGlyph(badge)}
                      </span>
                    ))}
                  </span>
                ) : null}
                {primaryEntityCell ? (
                  <span
                    className={`absolute inset-1 flex items-end justify-start rounded-lg border px-1 pb-0.5 text-[9px] font-black uppercase tracking-wide ${entityTone} ${
                      isSelectedEntity ? 'ring-2 ring-amber-200/80' : ''
                    } ${isSelectedTransition ? 'ring-2 ring-violet-100/90' : ''} ${
                      primaryEntityCell.entity.hidden ? 'opacity-45' : ''
                    }`}
                    title={primaryEntityCell.label}
                  >
                    {primaryEntityCell.isOrigin ? (
                      primaryEntityCell.entity.transition ? (
                        <span className="flex items-center gap-1">
                          <span>T</span>
                          <span>
                            {initials(primaryEntityCell.entity.name) || 'T'}
                          </span>
                        </span>
                      ) : (
                        initials(primaryEntityCell.entity.name) || 'E'
                      )
                    ) : (
                      '·'
                    )}
                  </span>
                ) : null}
                {primaryCombatantCell ? (
                  <span
                    className={`runtime-token-pop absolute inset-x-2 top-1/2 z-20 mx-auto flex size-10 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[11px] font-black shadow-lg transition ${
                      isTargetCombatant
                        ? 'border-fuchsia-100 bg-fuchsia-500 text-stone-950 shadow-fuchsia-300/45'
                        : isSelectedCombatant
                          ? 'border-red-100 bg-red-500 text-stone-950 shadow-red-300/45'
                          : isCurrentCombatant
                            ? 'border-amber-100 bg-red-700 text-red-50 shadow-amber-300/35'
                            : isDefeatedCombatant
                              ? 'border-stone-300/70 bg-stone-800 text-stone-200 opacity-75 shadow-black/40'
                              : 'border-red-200/70 bg-red-950 text-red-50 shadow-black/50'
                    } ${cellAffordance.isSelectedToken ? 'ring-2 ring-cyan-100 ring-offset-2 ring-offset-[#110d0a]' : ''} ${isCurrentCombatant && !isDefeatedCombatant ? 'animate-pulse' : ''}`}
                    title={primaryCombatantCell.label}
                  >
                    {primaryCombatantCell.isOrigin
                      ? initials(primaryCombatantCell.entity.name) || 'M'
                      : '·'}
                    {isDefeatedCombatant ? (
                      <span className="absolute -bottom-4 text-[8px] uppercase tracking-wide text-stone-200">
                        defeated
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {placement ? (
                  <span
                    className={`runtime-token-pop relative z-10 mx-auto flex size-9 items-center justify-center rounded-full border-2 text-[11px] font-black shadow-lg transition ${tokenTone} ${
                      isCurrentTurn ? 'animate-pulse' : ''
                    } ${cellAffordance.isSelectedToken ? 'ring-2 ring-cyan-100 ring-offset-2 ring-offset-[#110d0a]' : ''}`}
                    title={resource?.character.name ?? placement.participantId}
                  >
                    {initials(
                      resource?.character.name ?? placement.participantId,
                    )}
                  </span>
                ) : (
                  <span className="sr-only">
                    {t('runtime.board.noCharacterToken')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getTacticalBoardBadgeGlyph(kind: TacticalBoardCellBadgeKind): string {
  switch (kind) {
    case 'move':
      return 'MV';
    case 'selected':
      return 'SEL';
    case 'target':
      return 'TGT';
    case 'turn':
      return 'TRN';
  }
}

function getTacticalBoardBadgeClassName(
  kind: TacticalBoardCellBadgeKind,
): string {
  const base =
    'rounded border px-1 py-0.5 text-[8px] font-black leading-none shadow-sm';

  switch (kind) {
    case 'move':
      return `${base} border-emerald-100 bg-emerald-400 text-emerald-950 shadow-emerald-300/30`;
    case 'selected':
      return `${base} border-cyan-100 bg-cyan-300 text-slate-950 shadow-cyan-300/25`;
    case 'target':
      return `${base} border-fuchsia-100 bg-fuchsia-400 text-slate-950 shadow-fuchsia-300/30`;
    case 'turn':
      return `${base} border-amber-100 bg-amber-300 text-stone-950 shadow-amber-300/30`;
  }
}

function getTacticalBoardCellKey(cell: Cell): string {
  return `${cell.x}-${cell.y}`;
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
          label={resource.character.status}
          tone={participantId === currentTurnParticipantId ? 'warning' : 'info'}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Stat
          label="HP"
          value={`${resource.character.hp.current}/${resource.character.hp.max}`}
        />
        <Stat label="AC" value={String(resource.character.armorClass)} />
        <Stat label="Speed" value={`${resource.character.speed} ft`} />
        <Stat label="Prof" value={`+${resource.derived.proficiencyBonus}`} />
        <Stat
          label="Init"
          value={`${resource.derived.initiativeModifier >= 0 ? '+' : ''}${resource.derived.initiativeModifier}`}
        />
        <Stat
          label="Passive"
          value={String(resource.derived.passivePerception)}
        />
      </dl>
      <p className="mt-3 text-xs text-amber-100/60">
        Conditions:{' '}
        {resource.overlay.activeConditions.length
          ? resource.overlay.activeConditions.join(', ')
          : 'none'}
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
