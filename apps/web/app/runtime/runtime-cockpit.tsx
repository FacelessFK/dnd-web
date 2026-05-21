'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';

import type {
  ActiveSceneState,
  CharacterLibraryEntry,
  CharacterResource,
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
  createSceneEntityDraftFormFromEntity,
  createSceneDraftFormFromScene,
  createSceneTransitionDraftFormFromEntity,
  defaultTacticalBoardViewport,
  defaultDm,
  defaultPlayer,
  describeSessionStreamEvent,
  flag,
  formatRuntimeFailure,
  getActingParticipantId,
  getActiveSceneGuidance,
  getAssignmentRequestCharacterPreview,
  getAssignedCharacterRefs,
  getAttackableCombatantEntities,
  getCharacterLibrarySourceProvenance,
  getCombatantDisplayCells,
  getCombatantEntities,
  getCurrentTurnCombatantId,
  getCurrentTurnLabel,
  getCurrentTurnParticipantId,
  getDmCombatantActionDisabledReason,
  getFinalizedLibraryEntriesForRuntime,
  getKnownCharacterIds,
  getLibraryEntrySubmissionBlocker,
  getKnownSceneOptions,
  getOutboxStatusView,
  getPendingAssignmentRequests,
  getPendingCharacterRefs,
  getPassiveSceneEntities,
  getPlayerNextStep,
  getPlayerParticipantIds,
  getRuntimeDisabledReasons,
  getSceneEntityDisplayCells,
  getSceneEntityLabel,
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
  sceneEntityInputFromDraft,
  sceneEntityUpdateInputFromDraft,
  sceneEntityTypeOptions,
  sceneTransitionInputFromDraft,
  sceneTransitionKindOptions,
  sceneTransitionUpdateInputFromDraft,
  combatantInputFromDraft,
  sceneInputFromDraft,
  validateCharacterDraftForm,
  validateCombatantDraftForm,
  validateSceneDraftForm,
  validateSceneEntityDraftForm,
  validateSceneTransitionDraftForm,
  type Cell,
  type AbilityKey,
  type CharacterDraftForm,
  type CombatantDraftForm,
  type LibraryEntrySubmissionBlocker,
  type OutboxStatusView,
  type RuntimeEventSummary,
  type RuntimeMode,
  type RuntimeNoticeTone,
  type SceneDraftForm,
  type SceneEntityDraftForm,
  type SceneTransitionDraftForm,
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
    await runTask('run fresh demo setup', async () => {
      setStreamEnabled(false);

      const createdSession = await unwrap(
        'create_session',
        sendSessionCommand({
          actor: {
            displayName: dmDisplayName,
            participantId: dmParticipantId,
            role: 'dm',
          },
          commandId: createCommandId('demo-create-session'),
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

      for (const player of samplePlayers) {
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

      for (const player of samplePlayers) {
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

      for (const player of samplePlayers) {
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
          commandId: createCommandId('demo-create-scene'),
          payload: {
            scene: {
              grid: {
                cellSizeFeet: 5,
                height: 8,
                width: 8,
              },
              name: 'Training Room',
            },
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

      const positions: Record<string, Cell> = {
        'player-001': { x: 0, y: 0 },
        'player-002': { x: 1, y: 0 },
      };

      for (const player of samplePlayers) {
        const position = positions[player.participantId];

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

  const activeSceneGuidance = getActiveSceneGuidance({
    activeSceneId: sceneId || sessionState?.session.activeSceneId || null,
    mode,
    scene,
  });
  const busyReason = busyLabel ? `Waiting on ${busyLabel}.` : null;
  const missingSessionReason = !canUseSession
    ? 'Create, paste, or recover a session first.'
    : null;
  const dmOnlySceneReason =
    mode === 'dm' ? null : 'Switch to DM mode for scene building.';
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
  const combatantAttackReason = getDmCombatantActionDisabledReason({
    busyLabel,
    currentTurnCombatantId,
    mode,
    scene,
    selectedCombatantId,
    sessionId,
    targetParticipantId: selectedTarget,
  });
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
  const disabledReasons = getRuntimeDisabledReasons({
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
  });
  const playerAttackDisabledReason =
    disabledReasons.attack ??
    (currentTurnCombatantId
      ? 'Current turn is a monster/NPC; use the DM combatant attack control.'
      : null);
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
    (mode === 'dm' ? null : 'Switch to DM mode for this control.') ??
    (selectedActorKnownCharacterId
      ? selectedActorNeedsAssignment
        ? null
        : 'Selected participant already has this character assigned.'
      : 'Load or recover a character for this participant first.');
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
          <Notice title="Command failed" tone="danger">
            {commandError}
          </Notice>
        ) : null}
        {recoveryNotes.length ? (
          <Notice title="Recovery completed with notes" tone="warning">
            <ul className="list-disc space-y-1 pl-5">
              {recoveryNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {mode === 'player' ? (
          <Notice title={playerNextStep.title} tone={playerNextStep.tone}>
            {playerNextStep.detail}
          </Notice>
        ) : null}
        <Notice
          title={activeSceneGuidance.title}
          tone={activeSceneGuidance.tone}
        >
          {activeSceneGuidance.detail}
        </Notice>

        <section className="rounded-3xl border border-amber-500/25 bg-[#24160f]/90 p-4 shadow-xl shadow-black/30">
          <div className="grid gap-4 xl:grid-cols-[220px_minmax(220px,1fr)_minmax(220px,1fr)_auto] xl:items-end">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              <ModeButton
                active={mode === 'dm'}
                label="DM Mode"
                onClick={() => switchMode('dm')}
                tone="dm"
              />
              <ModeButton
                active={mode === 'player'}
                label="Player Mode"
                onClick={() => switchMode('player')}
                tone="player"
              />
            </div>
            <LabeledInput
              label="Session ID"
              onChange={switchSessionId}
              placeholder="Paste an existing session ID to recover"
              value={sessionId}
            />
            {mode === 'dm' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledInput
                  label="DM participant ID"
                  onChange={switchDmParticipantId}
                  value={dmParticipantId}
                />
                <LabeledInput
                  label="DM display name"
                  onChange={setDmDisplayName}
                  value={dmDisplayName}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <LabeledInput
                  label="Player participant ID"
                  onChange={switchPlayerParticipantId}
                  value={playerParticipantId}
                />
                <LabeledInput
                  label="Player display name"
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
                  label="Create Session"
                  onClick={createSession}
                />
              ) : (
                <ActionButton
                  disabled={Boolean(disabledReasons.joinPlayer)}
                  disabledReason={disabledReasons.joinPlayer ?? undefined}
                  label="Join Session"
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
                label="Recover"
                onClick={recoverReadModels}
                variant="secondary"
              />
              <ActionButton
                disabled={Boolean(missingSessionReason)}
                disabledReason={missingSessionReason ?? undefined}
                label={streamEnabled ? 'Disconnect SSE' : 'Subscribe SSE'}
                onClick={() => setStreamEnabled((current) => !current)}
                variant={streamEnabled ? 'danger' : 'secondary'}
              />
              <ActionButton
                disabled={Boolean(busyLabel)}
                disabledReason={busyReason ?? undefined}
                label="Local Reset"
                onClick={resetLocalCockpit}
                variant="danger"
              />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-amber-100/65">
            Acting as {streamDisplayName} ({streamParticipantId}). Local Reset
            clears only this browser; backend state remains untouched.{' '}
            {stream.error ? (
              <span className="font-semibold text-red-200">{stream.error}</span>
            ) : null}
          </p>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_420px]">
          <div className="grid content-start gap-5">
            <Panel
              description={`Scene ${activeSceneLabel}. Click a cell or type coordinates; movement still goes through server commands.`}
              eyebrow={mode === 'dm' ? 'DM war table' : 'Player view'}
              title="Tactical Grid"
              tone={mode}
            >
              <TacticalGrid
                activeScene={activeScene}
                actingParticipantId={actingParticipantId}
                charactersByParticipant={charactersByParticipant}
                currentTurnCombatantId={currentTurnCombatantId}
                currentTurnParticipantId={currentTurnParticipantId}
                grid={grid}
                mode={mode}
                moveDisabledReason={disabledReasons.move}
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
                    label="Acting token"
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
                      Acting token
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
                    disabled={Boolean(disabledReasons.move)}
                    disabledReason={disabledReasons.move ?? undefined}
                    label={mode === 'dm' ? 'Move Actor' : 'Move Token'}
                    onClick={moveSelectedActor}
                    variant="secondary"
                  />
                  {mode === 'dm' ? (
                    <ActionButton
                      disabled={Boolean(disabledReasons.dmCharacter)}
                      disabledReason={disabledReasons.dmCharacter ?? undefined}
                      label="DM Reposition"
                      onClick={dmRepositionSelected}
                    />
                  ) : null}
                </div>
              </div>
            </Panel>

            <LatestEventFeed entries={feedEntries} />

            <Panel
              description="Raw protocol payloads stay here for debugging; the table view above is the primary surface."
              eyebrow="Dev trace"
              title="Debug Ledger"
            >
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-amber-200 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-amber-300">
                  Last response, session snapshot, and raw event log
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
                        detail="Subscribe to SSE or run commands to populate the ledger."
                        title="No events yet"
                      />
                    )}
                  </div>
                </div>
              </details>
            </Panel>
          </div>

          <aside className="grid content-start gap-5">
            {mode === 'dm' ? (
              <Panel
                description="Creates a fresh local playtest session and stops on the first failed command."
                eyebrow="DM orchestration"
                title="Demo Setup"
                tone="dm"
              >
                <div className="grid gap-3">
                  <ActionButton
                    disabled={Boolean(busyLabel)}
                    disabledReason={busyReason ?? undefined}
                    label="Run Fresh Demo Setup"
                    onClick={runFreshDemoSetup}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label="Join Players"
                      onClick={joinSamplePlayers}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label="Create PCs"
                      onClick={createSampleCharacters}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label="Assign PCs"
                      onClick={finalizeAndAssignCharacters}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label="Create Scene"
                      onClick={createAndActivateScene}
                      variant="secondary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      disabled={Boolean(disabledReasons.placeTokens)}
                      disabledReason={disabledReasons.placeTokens ?? undefined}
                      label="Place Tokens"
                      onClick={placeSampleCharacters}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(disabledReasons.startEncounter)}
                      disabledReason={
                        disabledReasons.startEncounter ?? undefined
                      }
                      label="Start Encounter"
                      onClick={startEncounter}
                    />
                  </div>
                </div>
              </Panel>
            ) : (
              <Panel
                description={playerNextStep.detail}
                eyebrow="Player readiness"
                title={playerNextStep.title}
                tone="player"
              >
                <div className="grid gap-3">
                  <StatusBadge
                    label={playerNextStep.title}
                    tone={playerNextStep.tone}
                  />
                  <CharacterSummary
                    currentTurnParticipantId={currentTurnParticipantId}
                    participantId={playerParticipantId}
                    resource={playerCharacter}
                    title={`${playerDisplayName} (you)`}
                    variant="hero"
                  />
                  <dl className="grid gap-2 text-sm">
                    <StatusRow
                      label="Placement"
                      value={
                        playerPlacement
                          ? `${playerPlacement.position.x},${playerPlacement.position.y}`
                          : 'not placed'
                      }
                    />
                    <StatusRow label="Current actor" value={currentTurnName} />
                    <StatusRow
                      label="Selected target"
                      value={selectedTarget || 'none'}
                    />
                  </dl>
                </div>
              </Panel>
            )}

            {mode === 'dm' ? (
              <SceneBuilderPanel
                activeSceneGuidance={activeSceneGuidance}
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
                onPlaceEntity={placeSceneEntity}
                onRepositionEntity={repositionSceneEntity}
                onSceneFieldChange={updateSceneDraftField}
                onSelectEntity={selectPassiveSceneEntity}
                onUpdateEntity={updateSceneEntity}
                deleteEntityDisabledReason={deleteSceneEntityReason}
                placeEntityDisabledReason={placeSceneEntityReason}
                repositionEntityDisabledReason={repositionSceneEntityReason}
                scene={scene}
                sceneDraft={sceneDraft}
                sceneDraftErrors={sceneDraftErrors}
                selectedEntity={selectedSceneEntity}
                selectedEntityId={selectedSceneEntityId}
                selectedCell={selectedCell}
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
                onEditFieldChange={updateSceneTransitionEditDraftField}
                onEditFlagChange={updateSceneTransitionEditDraftFlag}
                onSelectTransition={selectSceneTransitionNode}
                onUpdate={updateSceneTransition}
                sceneOptions={knownSceneOptions}
                selectedCell={selectedCell}
                selectedTransition={selectedTransition}
                selectedTransitionId={selectedTransitionId}
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
              description="Turn controls submit actor-scoped commands; disabled buttons explain missing prerequisites."
              eyebrow="Encounter"
              title="Turn & Target"
            >
              <div className="grid gap-3">
                {encounter ? (
                  <div className="grid gap-2 rounded-2xl border border-amber-500/15 bg-black/25 p-3 text-sm">
                    <StatusRow
                      label="Encounter"
                      value={`${encounter.id} (${encounter.status})`}
                    />
                    <StatusRow
                      label="Round"
                      value={String(encounter.roundNumber)}
                    />
                    <StatusRow
                      label="Usage"
                      value={`${encounter.currentTurnUsage.movementUsed} ft, action ${flag(encounter.currentTurnUsage.actionUsed)}, bonus ${flag(encounter.currentTurnUsage.bonusActionUsed)}, reaction ${flag(encounter.currentTurnUsage.reactionUsed)}`}
                    />
                    <div className="pt-2">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300/70">
                        Turn order
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
                              · init {participant.initiative}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    detail="Start an encounter as DM or recover one from the server."
                    title="No active encounter loaded"
                  />
                )}
                <SelectField
                  label="Target"
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
                <div className="grid grid-cols-2 gap-2">
                  <ActionButton
                    disabled={Boolean(disabledReasons.actorTurnAction)}
                    disabledReason={
                      disabledReasons.actorTurnAction ?? undefined
                    }
                    label="Use Action"
                    onClick={() => runEncounterCommand('use_action')}
                    variant="secondary"
                  />
                  <ActionButton
                    disabled={Boolean(disabledReasons.actorTurnAction)}
                    disabledReason={
                      disabledReasons.actorTurnAction ?? undefined
                    }
                    label="Use Bonus"
                    onClick={() => runEncounterCommand('use_bonus_action')}
                    variant="secondary"
                  />
                  <ActionButton
                    disabled={Boolean(disabledReasons.actorTurnAction)}
                    disabledReason={
                      disabledReasons.actorTurnAction ?? undefined
                    }
                    label="Use Reaction"
                    onClick={() => runEncounterCommand('use_reaction')}
                    variant="secondary"
                  />
                  {mode === 'dm' ? (
                    <ActionButton
                      disabled={Boolean(disabledReasons.dmEncounter)}
                      disabledReason={disabledReasons.dmEncounter ?? undefined}
                      label="Advance Turn"
                      onClick={() => runEncounterCommand('advance_turn')}
                      variant="secondary"
                    />
                  ) : null}
                </div>
                <ActionButton
                  disabled={Boolean(playerAttackDisabledReason)}
                  disabledReason={playerAttackDisabledReason ?? undefined}
                  label="Attack Target"
                  onClick={attackTarget}
                />
              </div>
            </Panel>

            <Panel
              description={
                mode === 'dm'
                  ? 'All joined player characters at the table.'
                  : 'Your loaded character resource from server reads/events.'
              }
              eyebrow="Roster"
              title="Characters"
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
                        detail="Join players or run the fresh demo setup."
                        title="No players loaded"
                      />
                    )}
                    <div className="grid gap-3 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
                      <div>
                        <p className="text-sm font-bold text-amber-50">
                          Assignment Requests
                        </p>
                        <p className="mt-1 text-xs leading-5 text-amber-100/60">
                          Pending requests come from authoritative session
                          state, not this browser&apos;s local character cache.
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
                                      ? 'Replacement pending'
                                      : 'Needs assignment'
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
                                label="Assigned"
                                value={request.assignedCharacterId ?? 'none'}
                              />
                              <ActionButton
                                disabled={Boolean(busyReason)}
                                disabledReason={busyReason ?? undefined}
                                label="Assign Pending Character"
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
                          detail="Players can submit finalized characters from Player mode."
                          title="No pending character requests"
                        />
                      )}
                    </div>
                    <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
                      <p className="text-sm font-bold text-amber-50">
                        Assignment helper
                      </p>
                      <SelectField
                        label="Player"
                        onChange={setSelectedActor}
                        options={playerParticipants.map((participant) => ({
                          label: `${participant.displayName} (${participant.id})`,
                          value: participant.id,
                        }))}
                        value={selectedActor}
                      />
                      <StatusRow
                        label="Known character"
                        value={selectedActorKnownCharacterId ?? 'none'}
                      />
                      <StatusRow
                        label="Pending"
                        value={selectedActorPendingCharacterId ?? 'none'}
                      />
                      <StatusRow
                        label="Assigned"
                        value={selectedActorAssignedCharacterId ?? 'none'}
                      />
                      <ActionButton
                        disabled={Boolean(dmAssignSelectedReason)}
                        disabledReason={dmAssignSelectedReason ?? undefined}
                        label="Assign Loaded Character"
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
                description="Administrative overrides. These are intentionally separate from normal encounter flow."
                eyebrow="DM-only"
                title="Overrides"
                tone="danger"
              >
                <div className="grid gap-3">
                  <SelectField
                    label="Controlled participant"
                    onChange={setSelectedActor}
                    options={playerParticipants.map((participant) => ({
                      label: `${participant.displayName} (${participant.id})`,
                      value: participant.id,
                    }))}
                    value={selectedActor}
                  />
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <LabeledInput
                      label="Current HP"
                      onChange={setHpDraft}
                      value={hpDraft}
                    />
                    <div className="self-end">
                      <ActionButton
                        disabled={Boolean(disabledReasons.dmCharacter)}
                        disabledReason={
                          disabledReasons.dmCharacter ?? undefined
                        }
                        label="Set HP"
                        onClick={dmSetCurrentHp}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <LabeledInput
                      label="Condition tags"
                      onChange={setConditionsDraft}
                      value={conditionsDraft}
                    />
                    <ActionButton
                      disabled={Boolean(disabledReasons.dmCharacter)}
                      disabledReason={disabledReasons.dmCharacter ?? undefined}
                      label="Set Conditions"
                      onClick={dmSetConditions}
                      variant="secondary"
                    />
                  </div>
                  <div className="grid gap-2 rounded-2xl border border-red-300/20 bg-red-950/15 p-3">
                    <p className="text-sm font-semibold text-red-100">
                      Turn override
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
                      Action used
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
                      Bonus action used
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
                      Reaction used
                    </label>
                    <NumberInput
                      label="Movement used"
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
                        label="Set Turn Actor"
                        onClick={dmSetTurnParticipant}
                        variant="secondary"
                      />
                      <ActionButton
                        disabled={Boolean(disabledReasons.dmEncounter)}
                        disabledReason={
                          disabledReasons.dmEncounter ?? undefined
                        }
                        label="Set Usage"
                        onClick={dmSetTurnUsage}
                        variant="secondary"
                      />
                    </div>
                  </div>
                  <ActionButton
                    disabled={Boolean(disabledReasons.dmEncounter)}
                    disabledReason={disabledReasons.dmEncounter ?? undefined}
                    label="End Encounter"
                    onClick={dmEndEncounter}
                    variant="danger"
                  />
                </div>
              </Panel>
            ) : null}

            <Panel
              description="Current IDs and read models loaded into this browser."
              eyebrow="Table status"
              title="State"
            >
              <dl className="grid gap-2 text-sm">
                <StatusRow label="Session" value={sessionId || 'none'} />
                <StatusRow label="Active scene" value={sceneId || 'none'} />
                <StatusRow label="Scene name" value={scene?.name ?? 'none'} />
                <StatusRow label="Current turn" value={currentTurnName} />
                <StatusRow
                  label="Encounter"
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

  return (
    <section
      className={`rounded-3xl border bg-gradient-to-br ${accents} to-[#1c130d]/90 p-4 shadow-xl shadow-black/25 backdrop-blur`}
    >
      <div className="mb-4">
        {eyebrow ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300/70">
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
      <dd className="break-all text-right font-semibold text-amber-50">
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
}: {
  entries: Array<EventLogEntry & { summary: RuntimeEventSummary }>;
}) {
  return (
    <Panel
      description="Readable summaries of live SSE updates. This is still not replay."
      eyebrow="Live omens"
      title="Combat & Event Feed"
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
            detail="Subscribe to the session stream, then move, attack, or recover to populate this feed."
            title="No live events summarized"
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
  passiveEntities,
  onActivateScene,
  onActivationSceneIdChange,
  onCreateScene,
  onDeleteEntity,
  onEditEntityFieldChange,
  onEditEntityFlagChange,
  onEntityFieldChange,
  onEntityFlagChange,
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
  updateEntityDisabledReason: string | null;
}) {
  return (
    <Panel
      description="Create custom tactical scenes and add simple authoritative scene entities. No fake local map edits are applied."
      eyebrow="DM-only"
      title="Scene Builder"
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
          <p className="text-sm font-bold text-amber-50">Scene draft</p>
          {sceneDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {sceneDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <LabeledInput
            label="Scene name"
            onChange={(value) => onSceneFieldChange('name', value)}
            value={sceneDraft.name}
          />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput
              label="Width"
              onChange={(value) => onSceneFieldChange('width', value)}
              value={sceneDraft.width}
            />
            <LabeledInput
              label="Height"
              onChange={(value) => onSceneFieldChange('height', value)}
              value={sceneDraft.height}
            />
            <LabeledInput
              label="Cell ft"
              onChange={(value) => onSceneFieldChange('cellSizeFeet', value)}
              value={sceneDraft.cellSizeFeet}
            />
          </div>
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label="Create Custom Scene"
            onClick={onCreateScene}
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">Activate scene</p>
          <LabeledInput
            label="Scene ID"
            onChange={onActivationSceneIdChange}
            placeholder={scene?.id ?? 'scene_...'}
            value={activationSceneId}
          />
          <ActionButton
            disabled={Boolean(activateDisabledReason)}
            disabledReason={activateDisabledReason ?? undefined}
            label="Activate Scene"
            onClick={onActivateScene}
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-orange-300/20 bg-orange-950/15 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">Place entity</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              Target cell {selectedCell.x},{selectedCell.y}. Placement is
              persisted only after `place_entity_in_scene` succeeds.
            </p>
          </div>
          {entityDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {entityDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <SelectField
            label="Entity type"
            onChange={(value) => onEntityFieldChange('type', value)}
            options={sceneEntityTypeOptions.map((entityType) => ({
              label: entityType.replaceAll('_', ' '),
              value: entityType,
            }))}
            value={entityDraft.type}
          />
          <LabeledInput
            label="Name / label"
            onChange={(value) => onEntityFieldChange('name', value)}
            value={entityDraft.name}
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="Footprint W"
              onChange={(value) => onEntityFieldChange('footprintWidth', value)}
              value={entityDraft.footprintWidth}
            />
            <LabeledInput
              label="Footprint H"
              onChange={(value) =>
                onEntityFieldChange('footprintHeight', value)
              }
              value={entityDraft.footprintHeight}
            />
          </div>
          <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
            <CheckboxField
              checked={entityDraft.blocksMovement}
              label="Blocks movement"
              onChange={(checked) =>
                onEntityFlagChange('blocksMovement', checked)
              }
            />
            <CheckboxField
              checked={entityDraft.blocksVision}
              label="Blocks vision"
              onChange={(checked) =>
                onEntityFlagChange('blocksVision', checked)
              }
            />
            <CheckboxField
              checked={entityDraft.hidden}
              label="Hidden from map styling"
              onChange={(checked) => onEntityFlagChange('hidden', checked)}
            />
          </div>
          <ActionButton
            disabled={Boolean(placeEntityDisabledReason)}
            disabledReason={placeEntityDisabledReason ?? undefined}
            label="Place Entity"
            onClick={onPlaceEntity}
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-300/20 bg-black/25 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              Edit passive entity
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              Combatants are intentionally excluded; use the Monster/NPC panel
              for combatant HP, movement, and attacks.
            </p>
          </div>
          {passiveEntities.length ? (
            <SelectField
              label="Passive entity"
              onChange={onSelectEntity}
              options={passiveEntities.map((entity) => ({
                label: `${entity.name} (${entity.type}) at ${entity.position.x},${entity.position.y}`,
                value: entity.id,
              }))}
              value={selectedEntityId}
            />
          ) : (
            <EmptyState
              detail="Place an object, terrain marker, or spawn marker before editing passive map entities."
              title="No passive entities"
            />
          )}
          {selectedEntity ? (
            <div className="grid gap-3">
              <StatusRow
                label="Selected"
                value={`${selectedEntity.name} at ${selectedEntity.position.x},${selectedEntity.position.y}`}
              />
              {entityEditDraftErrors.length ? (
                <p className="text-xs leading-5 text-amber-200">
                  {entityEditDraftErrors.slice(0, 3).join(' ')}
                </p>
              ) : null}
              <SelectField
                label="Entity type"
                onChange={(value) => onEditEntityFieldChange('type', value)}
                options={sceneEntityTypeOptions.map((entityType) => ({
                  label: entityType.replaceAll('_', ' '),
                  value: entityType,
                }))}
                value={entityEditDraft.type}
              />
              <LabeledInput
                label="Name / label"
                onChange={(value) => onEditEntityFieldChange('name', value)}
                value={entityEditDraft.name}
              />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label="Footprint W"
                  onChange={(value) =>
                    onEditEntityFieldChange('footprintWidth', value)
                  }
                  value={entityEditDraft.footprintWidth}
                />
                <LabeledInput
                  label="Footprint H"
                  onChange={(value) =>
                    onEditEntityFieldChange('footprintHeight', value)
                  }
                  value={entityEditDraft.footprintHeight}
                />
              </div>
              <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
                <CheckboxField
                  checked={entityEditDraft.blocksMovement}
                  label="Blocks movement"
                  onChange={(checked) =>
                    onEditEntityFlagChange('blocksMovement', checked)
                  }
                />
                <CheckboxField
                  checked={entityEditDraft.blocksVision}
                  label="Blocks vision"
                  onChange={(checked) =>
                    onEditEntityFlagChange('blocksVision', checked)
                  }
                />
                <CheckboxField
                  checked={entityEditDraft.hidden}
                  label="Hidden from map styling"
                  onChange={(checked) =>
                    onEditEntityFlagChange('hidden', checked)
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton
                  disabled={Boolean(updateEntityDisabledReason)}
                  disabledReason={updateEntityDisabledReason ?? undefined}
                  label="Update"
                  onClick={onUpdateEntity}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(repositionEntityDisabledReason)}
                  disabledReason={repositionEntityDisabledReason ?? undefined}
                  label={`Move to ${selectedCell.x},${selectedCell.y}`}
                  onClick={onRepositionEntity}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(deleteEntityDisabledReason)}
                  disabledReason={deleteEntityDisabledReason ?? undefined}
                  label="Delete"
                  onClick={onDeleteEntity}
                  variant="danger"
                />
              </div>
            </div>
          ) : null}
          {passiveEntities.length ? (
            <div className="grid gap-2 text-xs text-amber-100/70">
              <p className="font-bold uppercase tracking-[0.14em] text-amber-300/70">
                Passive entities
              </p>
              {passiveEntities.slice(-5).map((entity) => (
                <div
                  className="rounded-xl border border-amber-500/10 bg-black/20 px-3 py-2"
                  key={entity.id}
                >
                  {getSceneEntityLabel(entity)} at {entity.position.x},
                  {entity.position.y}
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
  onEditFieldChange,
  onEditFlagChange,
  onSelectTransition,
  onUpdate,
  sceneOptions,
  selectedCell,
  selectedTransition,
  selectedTransitionId,
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
  transitions: Scene['entities'];
  updateDisabledReason: string | null;
}) {
  const targetOptions = [
    { label: 'Choose a known scene...', value: '' },
    ...sceneOptions,
  ];

  return (
    <Panel
      description="Author simple linked markers such as doors, stairs, portals, and gates. Only the DM can activate a transition."
      eyebrow="DM-only"
      title="Scene Transitions"
      tone="dm"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-violet-300/20 bg-violet-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">Create transition</p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              Target cell {selectedCell.x},{selectedCell.y}. Linked activation
              changes the active scene only after the server accepts the
              command.
            </p>
          </div>
          {draftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {draftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Kind"
              onChange={(value) => onDraftFieldChange('kind', value)}
              options={sceneTransitionKindOptions.map((kind) => ({
                label: kind,
                value: kind,
              }))}
              value={draft.kind}
            />
            <LabeledInput
              label="Name"
              onChange={(value) => onDraftFieldChange('name', value)}
              value={draft.name}
            />
          </div>
          <SelectField
            label="Known target scene"
            onChange={(value) => onDraftFieldChange('targetSceneId', value)}
            options={targetOptions}
            value={draft.targetSceneId}
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="Target scene ID"
              onChange={(value) => onDraftFieldChange('targetSceneId', value)}
              placeholder="scene_..."
              value={draft.targetSceneId}
            />
            <LabeledInput
              label="Target label"
              onChange={(value) => onDraftFieldChange('targetLabel', value)}
              value={draft.targetLabel}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="Footprint W"
              onChange={(value) => onDraftFieldChange('footprintWidth', value)}
              value={draft.footprintWidth}
            />
            <LabeledInput
              label="Footprint H"
              onChange={(value) => onDraftFieldChange('footprintHeight', value)}
              value={draft.footprintHeight}
            />
          </div>
          <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
            <CheckboxField
              checked={draft.blocksMovement}
              label="Blocks movement"
              onChange={(checked) =>
                onDraftFlagChange('blocksMovement', checked)
              }
            />
            <CheckboxField
              checked={draft.blocksVision}
              label="Blocks vision"
              onChange={(checked) => onDraftFlagChange('blocksVision', checked)}
            />
            <CheckboxField
              checked={draft.hidden}
              label="Hidden from player map styling"
              onChange={(checked) => onDraftFlagChange('hidden', checked)}
            />
          </div>
          <TextAreaField
            label="Notes"
            onChange={(value) => onDraftFieldChange('notes', value)}
            value={draft.notes}
          />
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label="Create Transition"
            onClick={onCreate}
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-violet-300/20 bg-black/25 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              Edit linked transition
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              Passive scene entities and combatants are intentionally separate.
              Transition activation remains DM-controlled.
            </p>
          </div>
          {transitions.length ? (
            <SelectField
              label="Transition node"
              onChange={onSelectTransition}
              options={transitions.map((transition) => ({
                label: getSceneEntityLabel(transition),
                value: transition.id,
              }))}
              value={selectedTransitionId}
            />
          ) : (
            <EmptyState
              detail="Create a transition node before editing or activating linked scenes."
              title="No transition nodes"
            />
          )}
          {selectedTransition ? (
            <div className="grid gap-3">
              <StatusRow
                label="Selected"
                value={`${selectedTransition.name} at ${selectedTransition.position.x},${selectedTransition.position.y}`}
              />
              {editDraftErrors.length ? (
                <p className="text-xs leading-5 text-amber-200">
                  {editDraftErrors.slice(0, 3).join(' ')}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label="Kind"
                  onChange={(value) => onEditFieldChange('kind', value)}
                  options={sceneTransitionKindOptions.map((kind) => ({
                    label: kind,
                    value: kind,
                  }))}
                  value={editDraft.kind}
                />
                <LabeledInput
                  label="Name"
                  onChange={(value) => onEditFieldChange('name', value)}
                  value={editDraft.name}
                />
              </div>
              <SelectField
                label="Known target scene"
                onChange={(value) => onEditFieldChange('targetSceneId', value)}
                options={targetOptions}
                value={editDraft.targetSceneId}
              />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label="Target scene ID"
                  onChange={(value) =>
                    onEditFieldChange('targetSceneId', value)
                  }
                  placeholder="scene_..."
                  value={editDraft.targetSceneId}
                />
                <LabeledInput
                  label="Target label"
                  onChange={(value) => onEditFieldChange('targetLabel', value)}
                  value={editDraft.targetLabel}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label="Footprint W"
                  onChange={(value) =>
                    onEditFieldChange('footprintWidth', value)
                  }
                  value={editDraft.footprintWidth}
                />
                <LabeledInput
                  label="Footprint H"
                  onChange={(value) =>
                    onEditFieldChange('footprintHeight', value)
                  }
                  value={editDraft.footprintHeight}
                />
              </div>
              <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
                <CheckboxField
                  checked={editDraft.blocksMovement}
                  label="Blocks movement"
                  onChange={(checked) =>
                    onEditFlagChange('blocksMovement', checked)
                  }
                />
                <CheckboxField
                  checked={editDraft.blocksVision}
                  label="Blocks vision"
                  onChange={(checked) =>
                    onEditFlagChange('blocksVision', checked)
                  }
                />
                <CheckboxField
                  checked={editDraft.hidden}
                  label="Hidden from player map styling"
                  onChange={(checked) => onEditFlagChange('hidden', checked)}
                />
              </div>
              <TextAreaField
                label="Notes"
                onChange={(value) => onEditFieldChange('notes', value)}
                value={editDraft.notes}
              />
              <div className="grid grid-cols-3 gap-2">
                <ActionButton
                  disabled={Boolean(updateDisabledReason)}
                  disabledReason={updateDisabledReason ?? undefined}
                  label="Update"
                  onClick={onUpdate}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(activateDisabledReason)}
                  disabledReason={activateDisabledReason ?? undefined}
                  label="Activate Link"
                  onClick={onActivate}
                />
                <ActionButton
                  disabled={Boolean(deleteDisabledReason)}
                  disabledReason={deleteDisabledReason ?? undefined}
                  label="Delete"
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
      ? 'Assigned'
      : pendingCharacterId === playerCharacter.character.id
        ? 'Submitted'
        : 'Ready for submission'
    : 'No character yet';
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
          <Notice title="Waiting on DM assignment" tone="warning">
            {pendingCharacterId === playerCharacter.character.id
              ? 'Your finalized character is submitted in authoritative session state. A DM can now see and assign it from their roster.'
              : 'This character is finalized but not submitted yet. Submit it so a DM in another browser can assign it.'}
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
                key={`${cell.x}-${cell.y}`}
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
                  <span className="sr-only">no character token</span>
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
