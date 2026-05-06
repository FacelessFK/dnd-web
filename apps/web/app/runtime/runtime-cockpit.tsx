'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type {
  ActiveSceneState,
  CharacterResource,
  DmCommand,
  Encounter,
  Scene,
  SessionStreamEvent,
} from '@dnd/protocol';

import {
  createCommandId,
  runtimeServerUrl,
  sendCharacterCommand,
  sendDmCommand,
  sendEncounterCommand,
  sendMovementCommand,
  sendSceneCommand,
  sendSessionCommand,
  type RuntimeApiResult,
} from '../../lib/runtime-api';
import {
  cockpitStorageKey,
  defaultDm,
  defaultPlayer,
  flag,
  formatRuntimeFailure,
  getActingParticipantId,
  getAssignedCharacterRefs,
  getKnownCharacterIds,
  getPlayerParticipantIds,
  getRuntimeDisabledReasons,
  initials,
  isExpectedRecoveryMiss,
  sampleCharacters,
  samplePlayers,
  sanitizeSessionIdInput,
  type Cell,
  type RuntimeMode,
  type SessionSnapshot,
  type StoredCockpitState,
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

export function RuntimeCockpit() {
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
  const [activeScene, setActiveScene] = useState<ActiveSceneState | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [charactersByParticipant, setCharactersByParticipant] = useState<
    Record<string, CharacterResource | undefined>
  >({});
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [lastResponse, setLastResponse] = useState<LastResponse | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [recoveryNotes, setRecoveryNotes] = useState<string[]>([]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [selectedActor, setSelectedActor] = useState<string>(
    samplePlayers[0].participantId,
  );
  const [selectedTarget, setSelectedTarget] = useState<string>(
    samplePlayers[1].participantId,
  );
  const [selectedCell, setSelectedCell] = useState<Cell>({ x: 0, y: 0 });
  const [hpDraft, setHpDraft] = useState('1');
  const [conditionsDraft, setConditionsDraft] = useState('prone, marked');
  const [turnUsageDraft, setTurnUsageDraft] = useState<TurnUsageDraft>({
    actionUsed: false,
    bonusActionUsed: false,
    movementUsed: 0,
    reactionUsed: false,
  });

  const currentTurnParticipantId =
    encounter?.participants[encounter.currentTurnIndex]?.participantId ?? null;
  const knownCharacterIds = getKnownCharacterIds(
    sessionState,
    charactersByParticipant,
  );
  const playerParticipantIds = useMemo(
    () => getPlayerParticipantIds(sessionState),
    [sessionState],
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
      role: 'dm' as const,
    },
    ...samplePlayers.map((player) => ({
      characterId: knownCharacterIds[player.participantId] ?? null,
      connectionStatus: 'disconnected' as const,
      displayName: player.displayName,
      id: player.participantId,
      joinedAt: '',
      lastSeenAt: '',
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
    const stored: StoredCockpitState = {
      charactersByParticipant: Object.fromEntries(
        Object.entries(charactersByParticipant).flatMap(
          ([participantId, resource]) =>
            resource ? [[participantId, resource.character.id] as const] : [],
        ),
      ),
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

  function clearRuntimeReadModels(): void {
    setSceneId('');
    setSessionState(null);
    setScene(null);
    setActiveScene(null);
    setEncounter(null);
    setCharactersByParticipant({});
    setLastResponse(null);
    setCommandError(null);
    setRecoveryNotes([]);
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
    clearRuntimeReadModels();
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
    clearRuntimeReadModels();
    setEventLog([]);
  }

  function applySessionSnapshot(state: SessionSnapshot): void {
    setSessionState(state);
    setSessionId(state.session.id);

    if (state.session.activeSceneId) {
      setSceneId(state.session.activeSceneId);
    } else {
      setSceneId('');
      setScene(null);
      setActiveScene(null);
    }
  }

  function rememberCharacter(resource: CharacterResource): void {
    setCharactersByParticipant((current) => ({
      ...current,
      [resource.character.ownerParticipantId]: resource,
    }));
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
      clearRuntimeReadModels();
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

      clearRuntimeReadModels();
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

      setScene(createdScene.data.scene);
      setSceneId(createdScene.data.scene.id);

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

      setScene(created.data.scene);
      setSceneId(created.data.scene.id);

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
          setScene(recoveredScene);
          setSceneId(recoveredScene.id);
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

      for (const participant of getAssignedCharacterRefs(
        recovered.data.state,
      )) {
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

      const response = await unwrap(
        'attack',
        sendEncounterCommand({
          actor: {
            participantId: actingParticipantId,
          },
          commandId: createCommandId('attack'),
          payload: {
            sessionId,
            targetParticipantId: selectedTarget,
          },
          type: 'attack',
        }),
      );

      setEncounter(response.data.encounter);
      setTurnUsageDraft(response.data.encounter.currentTurnUsage);

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
  const playerCharacter = charactersByParticipant[playerParticipantId];
  const playerParticipants = participants.filter(
    (participant) => participant.role === 'player',
  );
  const currentTurnName = currentTurnParticipantId
    ? getParticipantName(participants, currentTurnParticipantId)
    : 'No active turn';
  const busyReason = busyLabel ? `Waiting on ${busyLabel}.` : null;
  const missingSessionReason = !canUseSession
    ? 'Create, paste, or recover a session first.'
    : null;
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
    targetParticipantId: selectedTarget,
  });
  const targetParticipants = playerParticipants.filter(
    (participant) => participant.id !== actingParticipantId,
  );
  const activeSceneLabel = scene
    ? `${scene.name} (${scene.id})`
    : (activeScene?.activeSceneId ?? sceneId) || 'none';

  return (
    <main className="min-h-screen bg-[#f6f3ea] text-stone-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col justify-between gap-4 border-b border-stone-300 pb-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
              Developer runtime cockpit
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Role-Aware Runtime
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">
              Browser play surface for the existing authoritative backend.
              Commands still run through the server; SSE is live only, and
              recovery uses read models.
            </p>
          </div>
          <div className="rounded border border-stone-300 bg-white/70 px-3 py-2 text-xs text-stone-700">
            <span className="font-semibold text-stone-950">Server</span>{' '}
            {runtimeServerUrl}
          </div>
        </header>

        {commandError ? (
          <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {commandError}
          </div>
        ) : null}
        {recoveryNotes.length ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Recovery completed with notes.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {recoveryNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <Panel title="Runtime Launcher">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <ModeButton
                    active={mode === 'dm'}
                    label="DM Mode"
                    onClick={() => switchMode('dm')}
                  />
                  <ModeButton
                    active={mode === 'player'}
                    label="Player Mode"
                    onClick={() => switchMode('player')}
                  />
                </div>
                <LabeledInput
                  label="Session ID"
                  onChange={switchSessionId}
                  placeholder="Paste an existing session ID to recover"
                  value={sessionId}
                />
                {mode === 'dm' ? (
                  <>
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
                  </>
                ) : (
                  <>
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
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
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
                </div>
                <ActionButton
                  disabled={Boolean(busyLabel)}
                  disabledReason={busyReason ?? undefined}
                  label="Local Reset"
                  onClick={resetLocalCockpit}
                  variant="danger"
                />
                <p className="text-xs leading-5 text-stone-600">
                  {mode === 'dm'
                    ? 'DM mode owns setup, scene, encounter, and override controls.'
                    : 'Player mode can join, recover, move its own token, use its own turn resources, and attack legal targets.'}{' '}
                  Local Reset clears this browser only.
                </p>
              </div>
            </Panel>

            {mode === 'dm' ? (
              <Panel title="DM Setup">
                <div className="grid gap-3">
                  <ActionButton
                    disabled={Boolean(busyLabel)}
                    disabledReason={busyReason ?? undefined}
                    label="Run Fresh Demo Setup"
                    onClick={runFreshDemoSetup}
                    variant="secondary"
                  />
                  <ActionButton
                    disabled={Boolean(missingSessionReason ?? busyReason)}
                    disabledReason={
                      missingSessionReason ?? busyReason ?? undefined
                    }
                    label="Join Sample Players"
                    onClick={joinSamplePlayers}
                    variant="secondary"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label="Create Characters"
                      onClick={createSampleCharacters}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label="Finalize + Assign"
                      onClick={finalizeAndAssignCharacters}
                      variant="secondary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton
                      disabled={Boolean(missingSessionReason ?? busyReason)}
                      disabledReason={
                        missingSessionReason ?? busyReason ?? undefined
                      }
                      label="Create Scene"
                      onClick={createAndActivateScene}
                      variant="secondary"
                    />
                    <ActionButton
                      disabled={Boolean(disabledReasons.placeTokens)}
                      disabledReason={disabledReasons.placeTokens ?? undefined}
                      label="Place Tokens"
                      onClick={placeSampleCharacters}
                      variant="secondary"
                    />
                  </div>
                  <ActionButton
                    disabled={Boolean(disabledReasons.startEncounter)}
                    disabledReason={disabledReasons.startEncounter ?? undefined}
                    label="Start Encounter"
                    onClick={startEncounter}
                  />
                  <p className="text-xs leading-5 text-stone-600">
                    Fresh demo setup creates a new backend session and stops on
                    the first failed command.
                  </p>
                </div>
              </Panel>
            ) : null}

            <Panel title="Live Stream">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {streamEnabled ? stream.status : 'idle'}
                  </p>
                  <p className="mt-1 text-xs text-stone-600">
                    {stream.error ??
                      `Subscribes as ${streamDisplayName} (${streamParticipantId}).`}
                  </p>
                </div>
                <ActionButton
                  disabled={Boolean(missingSessionReason)}
                  disabledReason={missingSessionReason ?? undefined}
                  label={streamEnabled ? 'Disconnect' : 'Subscribe'}
                  onClick={() => setStreamEnabled((current) => !current)}
                  variant={streamEnabled ? 'danger' : 'secondary'}
                />
              </div>
            </Panel>

            <Panel title="Command State">
              <dl className="grid gap-2 text-sm">
                <StatusRow label="Busy" value={busyLabel ?? 'idle'} />
                <StatusRow
                  label="Mode"
                  value={mode === 'dm' ? 'DM' : 'Player'}
                />
                <StatusRow
                  label="Runtime actor"
                  value={`${streamDisplayName} (${streamParticipantId})`}
                />
                <StatusRow label="Session ID" value={sessionId || 'none'} />
                <StatusRow label="Active scene ID" value={sceneId || 'none'} />
                <StatusRow label="Scene name" value={scene?.name ?? 'none'} />
                <StatusRow label="Current turn" value={currentTurnName} />
                <StatusRow label="Loaded scene" value={activeSceneLabel} />
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
          </div>

          <div className="grid gap-5">
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Panel title="Scene / Map">
                <TacticalGrid
                  activeScene={activeScene}
                  charactersByParticipant={charactersByParticipant}
                  currentTurnParticipantId={currentTurnParticipantId}
                  grid={grid}
                  onSelectCell={setSelectedCell}
                  selectedCell={selectedCell}
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
                  {mode === 'dm' ? (
                    <SelectField
                      label="Actor"
                      onChange={setSelectedActor}
                      options={playerParticipants.map((participant) => ({
                        label: `${participant.displayName} (${participant.id})`,
                        value: participant.id,
                      }))}
                      value={selectedActor}
                    />
                  ) : (
                    <div className="rounded border border-stone-200 bg-white/70 px-3 py-2 text-sm">
                      <p className="font-semibold text-stone-700">
                        Acting as player
                      </p>
                      <p className="break-all text-stone-950">
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
                  <div className="flex gap-2">
                    <ActionButton
                      disabled={Boolean(disabledReasons.move)}
                      disabledReason={disabledReasons.move ?? undefined}
                      label="Move"
                      onClick={moveSelectedActor}
                      variant="secondary"
                    />
                    {mode === 'dm' ? (
                      <ActionButton
                        disabled={Boolean(disabledReasons.dmCharacter)}
                        disabledReason={
                          disabledReasons.dmCharacter ?? undefined
                        }
                        label="DM Reposition"
                        onClick={dmRepositionSelected}
                      />
                    ) : null}
                  </div>
                </div>
              </Panel>

              <Panel title="Encounter / Turn">
                <div className="grid gap-3">
                  <div className="rounded border border-stone-200 bg-white/70 p-3 text-sm">
                    {encounter ? (
                      <div className="space-y-2">
                        <StatusRow
                          label="Encounter"
                          value={`${encounter.id} (${encounter.status})`}
                        />
                        <StatusRow
                          label="Round"
                          value={String(encounter.roundNumber)}
                        />
                        <StatusRow
                          label="Turn usage"
                          value={`${encounter.currentTurnUsage.movementUsed} ft, action ${flag(encounter.currentTurnUsage.actionUsed)}, bonus ${flag(encounter.currentTurnUsage.bonusActionUsed)}, reaction ${flag(encounter.currentTurnUsage.reactionUsed)}`}
                        />
                      </div>
                    ) : (
                      <p className="text-stone-600">
                        No active encounter read.
                      </p>
                    )}
                  </div>
                  <SelectField
                    label="Target"
                    onChange={setSelectedTarget}
                    options={targetParticipants.map((participant) => ({
                      label: `${participant.displayName} (${participant.id})`,
                      value: participant.id,
                    }))}
                    value={selectedTarget}
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
                        disabledReason={
                          disabledReasons.dmEncounter ?? undefined
                        }
                        label="Advance Turn"
                        onClick={() => runEncounterCommand('advance_turn')}
                        variant="secondary"
                      />
                    ) : null}
                  </div>
                  <ActionButton
                    disabled={Boolean(disabledReasons.attack)}
                    disabledReason={disabledReasons.attack ?? undefined}
                    label="Attack Target"
                    onClick={attackTarget}
                  />
                </div>
              </Panel>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <Panel title="Characters">
                <div className="grid gap-3">
                  {mode === 'player' ? (
                    <CharacterSummary
                      currentTurnParticipantId={currentTurnParticipantId}
                      participantId={playerParticipantId}
                      resource={playerCharacter}
                      title={`${playerDisplayName} (you)`}
                    />
                  ) : (
                    playerParticipants.map((participant) => (
                      <CharacterSummary
                        currentTurnParticipantId={currentTurnParticipantId}
                        key={participant.id}
                        participantId={participant.id}
                        resource={charactersByParticipant[participant.id]}
                        title={participant.displayName}
                      />
                    ))
                  )}
                </div>
              </Panel>

              {mode === 'dm' ? (
                <Panel title="DM Controls">
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
                        disabledReason={
                          disabledReasons.dmCharacter ?? undefined
                        }
                        label="Set Conditions"
                        onClick={dmSetConditions}
                        variant="secondary"
                      />
                    </div>
                    <div className="grid gap-2 rounded border border-stone-200 bg-white/70 p-3">
                      <p className="text-sm font-semibold">Turn override</p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          checked={turnUsageDraft.actionUsed}
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
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          checked={turnUsageDraft.bonusActionUsed}
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
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          checked={turnUsageDraft.reactionUsed}
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
              ) : (
                <Panel title="Player Controls">
                  <div className="grid gap-3 text-sm">
                    <p className="rounded border border-stone-200 bg-white/70 p-3 text-stone-700">
                      Player mode only submits commands as{' '}
                      <span className="font-semibold text-stone-950">
                        {playerParticipantId}
                      </span>
                      . DM overrides and setup commands are hidden.
                    </p>
                    <StatusRow
                      label="Your character"
                      value={playerCharacter?.character.name ?? 'not loaded'}
                    />
                    <StatusRow label="Current actor" value={currentTurnName} />
                    <StatusRow
                      label="Selected target"
                      value={selectedTarget || 'none'}
                    />
                  </div>
                </Panel>
              )}
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <Panel title="Session State">
                <JsonPreview value={sessionState ?? { sessionId }} />
              </Panel>
              <Panel title="Developer Debug">
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-stone-700">
                    Last response and live event log
                  </summary>
                  <div className="mt-3">
                    <div className="mb-3">
                      <JsonPreview
                        value={lastResponse ?? { status: 'No command yet' }}
                      />
                    </div>
                    <div className="max-h-96 overflow-auto rounded border border-stone-200 bg-stone-950 p-3 text-xs text-stone-100">
                      {eventLog.length ? (
                        eventLog.map((entry) => (
                          <details
                            className="border-b border-stone-800 py-2"
                            key={entry.id}
                          >
                            <summary className="cursor-pointer text-amber-200">
                              {entry.at} {entry.label}
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap break-words">
                              {JSON.stringify(entry.payload, null, 2)}
                            </pre>
                          </details>
                        ))
                      ) : (
                        <p className="text-stone-400">No events yet.</p>
                      )}
                    </div>
                  </div>
                </details>
              </Panel>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded border border-stone-300 bg-white/85 p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.14em] text-stone-700">
        {title}
      </h2>
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
      'border-red-800 bg-red-800 text-white hover:bg-red-700 disabled:border-red-200 disabled:bg-red-100 disabled:text-red-300',
    primary:
      'border-stone-950 bg-stone-950 text-white hover:bg-stone-800 disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400',
    secondary:
      'border-stone-300 bg-white text-stone-950 hover:border-stone-500 disabled:bg-stone-100 disabled:text-stone-400',
  }[variant];

  return (
    <button
      className={`min-h-10 rounded border px-3 py-2 text-sm font-semibold transition ${styles}`}
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
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-10 rounded border px-3 py-2 text-sm font-bold transition ${
        active
          ? 'border-amber-700 bg-amber-100 text-amber-950'
          : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'
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
      <span className="font-semibold text-stone-700">{label}</span>
      <input
        className="min-h-10 rounded border border-stone-300 bg-white px-3 py-2 text-stone-950 outline-none focus:border-amber-700"
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
      <span className="font-semibold text-stone-700">{label}</span>
      <input
        className="min-h-10 w-full rounded border border-stone-300 bg-white px-3 py-2 text-stone-950 outline-none focus:border-amber-700 sm:w-24"
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
      <span className="font-semibold text-stone-700">{label}</span>
      <select
        className="min-h-10 rounded border border-stone-300 bg-white px-3 py-2 text-stone-950 outline-none focus:border-amber-700"
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-stone-600">{label}</dt>
      <dd className="break-all text-right font-semibold text-stone-950">
        {value}
      </dd>
    </div>
  );
}

function TacticalGrid({
  activeScene,
  charactersByParticipant,
  currentTurnParticipantId,
  grid,
  onSelectCell,
  selectedCell,
}: {
  activeScene: ActiveSceneState | null;
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  currentTurnParticipantId: string | null;
  grid: {
    height: number;
    width: number;
  };
  onSelectCell: (cell: Cell) => void;
  selectedCell: Cell;
}) {
  const cells: Cell[] = [];

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      cells.push({ x, y });
    }
  }

  return (
    <div
      className="grid overflow-hidden rounded border border-stone-400 bg-stone-200"
      style={{
        gridTemplateColumns: `repeat(${grid.width}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((cell) => {
        const placement = activeScene?.placedCharacters.find(
          (candidate) =>
            candidate.position.x === cell.x && candidate.position.y === cell.y,
        );
        const resource = placement
          ? charactersByParticipant[placement.participantId]
          : undefined;
        const isCurrentTurn =
          placement?.participantId === currentTurnParticipantId;
        const isSelected =
          selectedCell.x === cell.x && selectedCell.y === cell.y;

        return (
          <button
            aria-label={`Select cell ${cell.x}, ${cell.y}`}
            className={`aspect-square min-h-10 border border-stone-300 text-xs transition ${
              isSelected ? 'bg-amber-200' : 'bg-white hover:bg-amber-50'
            }`}
            key={`${cell.x}-${cell.y}`}
            onClick={() => onSelectCell(cell)}
            type="button"
          >
            {placement ? (
              <span
                className={`mx-auto flex size-8 items-center justify-center rounded-full border text-[11px] font-bold ${
                  isCurrentTurn
                    ? 'border-amber-900 bg-amber-500 text-stone-950'
                    : 'border-stone-900 bg-stone-900 text-white'
                }`}
                title={resource?.character.name ?? placement.participantId}
              >
                {initials(resource?.character.name ?? placement.participantId)}
              </span>
            ) : (
              <span className="text-[10px] text-stone-400">
                {cell.x},{cell.y}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CharacterSummary({
  currentTurnParticipantId,
  participantId,
  resource,
  title,
}: {
  currentTurnParticipantId: string | null;
  participantId: string;
  resource?: CharacterResource;
  title: string;
}) {
  if (!resource) {
    return (
      <div className="rounded border border-stone-200 bg-white/70 p-3 text-sm text-stone-600">
        {title}: no character loaded
      </div>
    );
  }

  return (
    <article
      className={`rounded border p-3 ${
        participantId === currentTurnParticipantId
          ? 'border-amber-600 bg-amber-50'
          : 'border-stone-200 bg-white/70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{resource.character.name}</h3>
          <p className="text-sm text-stone-600">
            {title} · {resource.character.className} {resource.character.level}
          </p>
        </div>
        <span className="rounded border border-stone-300 px-2 py-1 text-xs font-bold uppercase">
          {resource.character.status}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Stat
          label="HP"
          value={`${resource.character.hp.current}/${resource.character.hp.max}`}
        />
        <Stat label="AC" value={String(resource.character.armorClass)} />
        <Stat label="Speed" value={`${resource.character.speed} ft`} />
      </dl>
      <p className="mt-3 text-xs text-stone-600">
        Conditions:{' '}
        {resource.overlay.activeConditions.length
          ? resource.overlay.activeConditions.join(', ')
          : 'none'}
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-200 bg-white px-2 py-2">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded border border-stone-200 bg-stone-950 p-3 text-xs text-stone-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function getParticipantName(
  participants: SessionSnapshot['participants'],
  participantId: string,
): string {
  return (
    participants.find((participant) => participant.id === participantId)
      ?.displayName ?? participantId
  );
}
