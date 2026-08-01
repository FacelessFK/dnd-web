'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import type {
  CharacterLibraryEntry,
  CombatEvent,
  Encounter,
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
import { LanguageSwitcher, useI18n } from '../../lib/i18n';
import {
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
  samplePlayers,
  sceneEntityPresets,
  sceneTransitionPresets,
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
  type RuntimeMode,
  type SceneDraftForm,
  type SceneEntityDraftForm,
  type SceneEntityPresetId,
  type SceneTransitionDraftForm,
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
import {
  formatOutboxStatusLabel,
  getLocalizedPlayerNextStepDetail,
  getLocalizedPlayerNextStepTitle,
  localizeCombatantDraftError,
  localizeRuntimeDisabledReason,
  localizeRuntimeDisabledReasons,
  localizeRuntimeEventDescriptor,
  localizeTransitionDraftError,
} from '../../lib/runtime-localization';
import { getLocalizedActiveSceneGuidance } from '../../lib/runtime-scene-localization';
import {
  ActionButton,
  EmptyState,
  ModeButton,
  Notice,
  Panel,
  StatusBadge,
  StatusRow,
} from './hud/hud-primitives';
import { LabeledInput, NumberInput, SelectField } from './hud/hud-fields';
import {
  DmTableSetupPanel,
  RecoveryReliabilityPanel,
} from './hud/table-status-panels';
import { RuntimeStatusOverviewPanel } from './hud/runtime-status-overview-panel';
import {
  PlayerReadinessPanel,
  PlayerReadinessRosterPanel,
} from './hud/player-readiness-panels';
import {
  ActionTargetFeedback,
  EncounterStatusFeedback,
  getEncounterStatusLabel,
  MovementFeedback,
} from './hud/encounter-feedback';
import {
  ActionEconomyFeedback,
  CurrentTurnRail,
  getActionEconomyResource,
  LatestEventFeed,
} from './hud/action-economy-feedback';
import { SceneBuilderPanel } from './panels/scene-builder-panel';
import { SceneTransitionPanel } from './panels/scene-transition-panel';
import { CombatantPanel } from './panels/combatant-panel';
import { CharacterOnboardingPanel } from './panels/character-onboarding-panel';
import { CharacterSummary } from './panels/character-summary';
import { RuntimeDiagnosticsPanel } from './diagnostics/runtime-diagnostics-panel';

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

            <RuntimeDiagnosticsPanel
              entries={eventLog}
              lastResponse={lastResponse}
              onOpenChange={session.actions.setDiagnosticsOpen}
              open={runtime.diagnosticsOpen}
              sessionSnapshot={sessionState ?? { sessionId }}
              t={t}
            />
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
