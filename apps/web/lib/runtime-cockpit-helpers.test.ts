import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CharacterResource, Scene } from '@dnd/protocol';

import type { SessionSnapshot } from './runtime-cockpit-helpers';
import {
  characterInputFromDraft,
  characterUpdateInputFromDraft,
  combatantInputFromDraft,
  createDefaultCharacterDraftForm,
  createDefaultCombatantDraftForm,
  createDefaultSceneDraftForm,
  createDefaultSceneEntityDraftForm,
  createSceneEntityDraftFormFromEntity,
  describeSessionStreamEvent,
  formatRuntimeFailure,
  getActingParticipantId,
  getActiveSceneGuidance,
  getAttackableCombatantEntities,
  getAssignedCharacterRefs,
  getCombatantDisplayCells,
  getCombatantEntities,
  getCurrentTurnCombatantId,
  getCurrentTurnLabel,
  getDmCombatantActionDisabledReason,
  getKnownCharacterIds,
  getPendingAssignmentRequests,
  getPendingCharacterRefs,
  getPassiveSceneEntities,
  getPlayerNextStep,
  getPlayerParticipantIds,
  getRuntimeDisabledReasons,
  getSceneEntityDisplayCells,
  isCombatantEntityDefeated,
  isSessionStreamEvent,
  isExpectedRecoveryMiss,
  sanitizeSessionIdInput,
  sceneEntityInputFromDraft,
  sceneEntityUpdateInputFromDraft,
  sceneInputFromDraft,
  validateCharacterDraftForm,
  validateCombatantDraftForm,
  validateSceneDraftForm,
  validateSceneEntityDraftForm,
} from './runtime-cockpit-helpers';

const sessionState: SessionSnapshot = {
  participants: [
    {
      characterId: null,
      connectionStatus: 'connected',
      displayName: 'Dungeon Master',
      id: 'dm-001',
      joinedAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      pendingCharacterId: null,
      role: 'dm',
    },
    {
      characterId: 'CHAR-001',
      connectionStatus: 'disconnected',
      displayName: 'Player One',
      id: 'player-001',
      joinedAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
      pendingCharacterId: null,
      role: 'player',
    },
  ],
  session: {
    activeSceneId: 'SCENE-001',
    createdAt: '2026-01-01T00:00:00.000Z',
    dmParticipantId: 'dm-001',
    id: 'SESSION-001',
    playerParticipantIds: ['player-001'],
    revision: 3,
    rulesProfileId: 'dnd5e-2024-core',
    status: 'lobby',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('runtime cockpit helpers', () => {
  it('collects assigned character reads from recovered session state', () => {
    assert.deepEqual(getAssignedCharacterRefs(sessionState), [
      {
        characterId: 'CHAR-001',
        participantId: 'player-001',
      },
    ]);
  });

  it('collects pending character reads and assignment requests from session state', () => {
    const pendingState: SessionSnapshot = {
      ...sessionState,
      participants: sessionState.participants.map((participant) =>
        participant.id === 'player-001'
          ? {
              ...participant,
              characterId: null,
              pendingCharacterId: 'CHAR-PENDING',
            }
          : participant,
      ),
    };

    assert.deepEqual(getPendingCharacterRefs(pendingState), [
      {
        characterId: 'CHAR-PENDING',
        participantId: 'player-001',
      },
    ]);
    assert.deepEqual(
      getPendingAssignmentRequests({
        charactersByParticipant: {},
        sessionState: pendingState,
      }),
      [
        {
          assignedCharacterId: null,
          character: undefined,
          displayName: 'Player One',
          participantId: 'player-001',
          pendingCharacterId: 'CHAR-PENDING',
        },
      ],
    );
  });

  it('prefers session assigned IDs over loaded character resources', () => {
    const ids = getKnownCharacterIds(sessionState, {
      'player-001': {
        character: {
          id: 'CHAR-LOCAL',
        },
      } as CharacterResource,
    });

    assert.equal(ids['player-001'], 'CHAR-001');
  });

  it('uses pending character IDs when no assigned character exists', () => {
    const pendingState: SessionSnapshot = {
      ...sessionState,
      participants: sessionState.participants.map((participant) =>
        participant.id === 'player-001'
          ? {
              ...participant,
              characterId: null,
              pendingCharacterId: 'CHAR-PENDING',
            }
          : participant,
      ),
    };

    const ids = getKnownCharacterIds(pendingState, {}, {});

    assert.equal(ids['player-001'], 'CHAR-PENDING');
  });

  it('classifies expected optional recovery misses', () => {
    assert.equal(isExpectedRecoveryMiss('no_active_scene'), true);
    assert.equal(isExpectedRecoveryMiss('no_active_encounter'), true);
    assert.equal(isExpectedRecoveryMiss('scene_not_found'), true);
    assert.equal(isExpectedRecoveryMiss('command_id_conflict'), false);
    assert.equal(isExpectedRecoveryMiss(undefined), false);
  });

  it('formats runtime failures for the cockpit', () => {
    assert.equal(
      formatRuntimeFailure('get_encounter_state', {
        code: 'no_active_encounter',
        message: 'There is no active encounter.',
        status: 409,
      }),
      'get_encounter_state failed. HTTP 409: no_active_encounter: There is no active encounter.',
    );
  });

  it('normalizes pasted session IDs and exposes player IDs', () => {
    assert.equal(sanitizeSessionIdInput(' session-001 '), 'SESSION-001');
    assert.deepEqual(getPlayerParticipantIds(sessionState), ['player-001']);
  });

  it('selects the authoritative actor from role mode', () => {
    assert.equal(
      getActingParticipantId({
        mode: 'player',
        playerParticipantId: 'player-002',
        selectedActor: 'player-001',
      }),
      'player-002',
    );
    assert.equal(
      getActingParticipantId({
        mode: 'dm',
        playerParticipantId: 'player-002',
        selectedActor: 'player-001',
      }),
      'player-001',
    );
  });

  it('guards DM-only controls from player mode', () => {
    const reasons = getRuntimeDisabledReasons({
      actingParticipantId: 'player-001',
      activeSceneKnown: true,
      activeSceneLoaded: true,
      activeScenePlacementCount: 2,
      busyLabel: null,
      encounterLoaded: true,
      mode: 'player',
      playerDisplayName: 'Player One',
      playerParticipantId: 'player-001',
      playerParticipantIds: ['player-001', 'player-002'],
      selectedActorHasCharacter: true,
      sessionId: 'ABC123',
      targetParticipantId: 'player-002',
    });

    assert.equal(reasons.move, null);
    assert.equal(reasons.actorTurnAction, null);
    assert.equal(reasons.attack, null);
    assert.equal(reasons.dmEncounter, 'Switch to DM mode for this control.');
    assert.equal(reasons.dmCharacter, 'Switch to DM mode for this control.');
  });

  it('allows player attack controls to target an active combatant option', () => {
    const reasons = getRuntimeDisabledReasons({
      actingParticipantId: 'player-001',
      activeSceneKnown: true,
      activeSceneLoaded: true,
      activeScenePlacementCount: 2,
      busyLabel: null,
      encounterLoaded: true,
      hasValidAttackTarget: true,
      mode: 'player',
      playerDisplayName: 'Player One',
      playerParticipantId: 'player-001',
      playerParticipantIds: ['player-001', 'player-002'],
      selectedActorHasCharacter: true,
      sessionId: 'ABC123',
      targetParticipantId: '',
    });

    assert.equal(reasons.attack, null);
  });

  it('explains player prerequisite failures', () => {
    const reasons = getRuntimeDisabledReasons({
      actingParticipantId: 'player-999',
      activeSceneKnown: false,
      activeSceneLoaded: false,
      activeScenePlacementCount: 0,
      busyLabel: null,
      encounterLoaded: false,
      mode: 'player',
      playerDisplayName: 'Player Missing',
      playerParticipantId: 'player-999',
      playerParticipantIds: ['player-001'],
      selectedActorHasCharacter: false,
      sessionId: 'ABC123',
      targetParticipantId: 'player-001',
    });

    assert.equal(
      reasons.move,
      'Create/recover an active scene before moving or starting combat.',
    );
    assert.equal(
      reasons.actorTurnAction,
      'Start or recover an encounter first.',
    );
  });

  it('summarizes stream events for the readable combat feed', () => {
    const summary = describeSessionStreamEvent({
      attackerCharacterId: 'CHAR-001',
      attackerParticipantId: 'player-001',
      damage: 1,
      encounterId: 'ENC-001',
      hit: true,
      reason: 'attack_resolved',
      roll: {
        d20: 12,
        modifier: 5,
        total: 17,
      },
      sessionId: 'SESSION-001',
      targetArmorClass: 13,
      targetCharacterId: 'CHAR-002',
      targetHp: {
        current: 0,
        previous: 1,
      },
      targetParticipantId: 'player-002',
      type: 'combat_event',
    });

    assert.equal(summary.title, 'Attack resolved');
    assert.equal(summary.tone, 'danger');
    assert.match(summary.detail, /player-001 rolled 17/);
    assert.match(
      describeSessionStreamEvent({
        attackerCharacterId: 'CHAR-001',
        attackerKind: 'character',
        attackerParticipantId: 'player-001',
        damage: 1,
        encounterId: 'ENC-001',
        hit: true,
        reason: 'attack_resolved',
        roll: {
          d20: 20,
          modifier: 5,
          total: 25,
        },
        sessionId: 'SESSION-001',
        targetArmorClass: 12,
        targetCombatantId: 'scene_entity_11111111-1111-4111-8111-111111111111',
        targetHp: {
          current: 7,
          previous: 8,
        },
        targetKind: 'combatant',
        targetParticipantId: 'dm-001',
        type: 'combat_event',
      }).detail,
      /scene_entity_11111111-1111-4111-8111-111111111111 HP 8 -> 7/,
    );
    assert.equal(
      isSessionStreamEvent({
        type: 'movement_state',
      }),
      true,
    );
    assert.equal(isSessionStreamEvent({ type: 'unknown_event' }), false);
  });

  it('explains the next player step from loaded read models', () => {
    assert.deepEqual(
      getPlayerNextStep({
        hasActiveScene: true,
        hasCharacter: true,
        hasEncounter: true,
        isCharacterReady: true,
        isCharacterAssigned: true,
        isCharacterSubmitted: false,
        isCurrentTurn: true,
        isJoined: true,
        isPlaced: true,
        sessionId: 'SESSION-001',
      }),
      {
        detail:
          'Move, attack, or spend your action economy. The server validates legality.',
        title: 'Your turn',
        tone: 'success',
      },
    );

    assert.equal(
      getPlayerNextStep({
        hasActiveScene: false,
        hasCharacter: false,
        hasEncounter: false,
        isCharacterReady: false,
        isCharacterAssigned: false,
        isCharacterSubmitted: false,
        isCurrentTurn: false,
        isJoined: false,
        isPlaced: false,
        sessionId: 'SESSION-001',
      }).title,
      'Join the table',
    );
  });

  it('creates and normalizes player character draft forms', () => {
    const draft = createDefaultCharacterDraftForm('Mira');

    assert.equal(draft.name, "Mira's Hero");
    assert.deepEqual(validateCharacterDraftForm(draft), []);

    const edited = {
      ...draft,
      abilities: {
        ...draft.abilities,
        int: '16',
      },
      hp: {
        current: '9',
        max: '10',
        temp: '2',
      },
      level: '3',
      name: '  Calder  ',
      notes: '  A careful scout.  ',
    };

    assert.deepEqual(characterInputFromDraft(edited), {
      abilities: {
        cha: 10,
        con: 14,
        dex: 14,
        int: 16,
        str: 10,
        wis: 12,
      },
      armorClass: 13,
      background: 'Wanderer',
      className: 'Fighter',
      hp: {
        current: 9,
        max: 10,
        temp: 2,
      },
      level: 3,
      name: 'Calder',
      notes: 'A careful scout.',
      speed: 30,
      speciesOrRace: 'Human',
    });
    assert.equal('level' in characterUpdateInputFromDraft(edited), false);
  });

  it('validates obvious character draft mistakes before server submission', () => {
    const draft = createDefaultCharacterDraftForm();
    const errors = validateCharacterDraftForm({
      ...draft,
      abilities: {
        ...draft.abilities,
        str: '31',
      },
      hp: {
        current: '20',
        max: '10',
        temp: '0',
      },
      level: '0',
      name: ' ',
    });

    assert.match(errors.join('\n'), /Name is required/);
    assert.match(errors.join('\n'), /Level must be between 1 and 20/);
    assert.match(errors.join('\n'), /STR must be between 1 and 30/);
    assert.match(errors.join('\n'), /Current HP cannot exceed max HP/);
  });

  it('explains finalized player characters that need submission', () => {
    assert.deepEqual(
      getPlayerNextStep({
        hasActiveScene: true,
        hasCharacter: true,
        hasEncounter: false,
        isCharacterAssigned: false,
        isCharacterReady: true,
        isCharacterSubmitted: false,
        isCurrentTurn: false,
        isJoined: true,
        isPlaced: false,
        sessionId: 'SESSION-001',
      }),
      {
        detail:
          'Submit your finalized character for DM assignment so the table can see it.',
        title: 'Submit for assignment',
        tone: 'warning',
      },
    );
  });

  it('explains submitted player characters waiting for DM assignment', () => {
    assert.deepEqual(
      getPlayerNextStep({
        hasActiveScene: true,
        hasCharacter: true,
        hasEncounter: false,
        isCharacterReady: true,
        isCharacterAssigned: false,
        isCharacterSubmitted: true,
        isCurrentTurn: false,
        isJoined: true,
        isPlaced: false,
        sessionId: 'SESSION-001',
      }),
      {
        detail:
          'Your finalized character is submitted in session state. Waiting for the DM to assign it.',
        title: 'Waiting for DM assignment',
        tone: 'warning',
      },
    );
  });

  it('creates and normalizes scene drafts', () => {
    const draft = createDefaultSceneDraftForm();

    assert.deepEqual(validateSceneDraftForm(draft), []);
    assert.deepEqual(
      sceneInputFromDraft({
        ...draft,
        cellSizeFeet: '10',
        height: '12',
        name: '  Crystal Vault  ',
        width: '16',
      }),
      {
        grid: {
          cellSizeFeet: 10,
          height: 12,
          width: 16,
        },
        name: 'Crystal Vault',
      },
    );
    assert.match(
      validateSceneDraftForm({
        ...draft,
        height: '0',
        name: ' ',
      }).join('\n'),
      /Scene name is required/,
    );
  });

  it('creates and validates scene entity placement drafts', () => {
    const draft = createDefaultSceneEntityDraftForm();

    assert.deepEqual(
      validateSceneEntityDraftForm({
        form: draft,
        grid: {
          cellSizeFeet: 5,
          height: 8,
          width: 8,
        },
        position: {
          x: 2,
          y: 2,
        },
      }),
      [],
    );
    assert.deepEqual(sceneEntityInputFromDraft(draft, { x: 2, y: 2 }), {
      blocksMovement: true,
      blocksVision: true,
      footprint: {
        height: 1,
        width: 1,
      },
      hidden: false,
      meta: {
        source: 'runtime-cockpit',
      },
      name: 'Stone Pillar',
      position: {
        x: 2,
        y: 2,
      },
      type: 'object',
    });
    assert.match(
      validateSceneEntityDraftForm({
        form: {
          ...draft,
          footprintWidth: '2',
          name: '',
        },
        grid: {
          cellSizeFeet: 5,
          height: 3,
          width: 3,
        },
        position: {
          x: 2,
          y: 2,
        },
      }).join('\n'),
      /Entity name is required/,
    );
    assert.match(
      validateSceneEntityDraftForm({
        form: {
          ...draft,
          footprintWidth: '2',
        },
        grid: {
          cellSizeFeet: 5,
          height: 3,
          width: 3,
        },
        position: {
          x: 2,
          y: 2,
        },
      }).join('\n'),
      /fit within the scene grid/,
    );
  });

  it('creates passive scene entity edit drafts and excludes combatants', () => {
    const scene: Scene = {
      createdAt: '2026-01-01T00:00:00.000Z',
      entities: [
        {
          id: 'scene_entity_11111111-1111-4111-8111-111111111111',
          type: 'object',
          name: 'Rune Door',
          position: {
            x: 2,
            y: 2,
          },
          footprint: {
            width: 2,
            height: 1,
          },
          blocksMovement: true,
          blocksVision: false,
          hidden: true,
          combatant: null,
          meta: {
            lockDc: 14,
          },
        },
        {
          id: 'scene_entity_22222222-2222-4222-8222-222222222222',
          type: 'monster',
          name: 'Ash Goblin',
          position: {
            x: 4,
            y: 2,
          },
          footprint: {
            width: 1,
            height: 1,
          },
          blocksMovement: true,
          blocksVision: false,
          hidden: false,
          combatant: {
            kind: 'monster',
            hp: {
              max: 8,
              current: 8,
              temp: 0,
            },
            armorClass: 12,
            speed: 30,
            abilities: {
              str: 14,
              dex: 12,
              con: 12,
              int: 8,
              wis: 10,
              cha: 8,
            },
          },
          meta: {
            source: 'dm_combatant',
          },
        },
      ],
      grid: {
        cellSizeFeet: 5,
        height: 8,
        width: 8,
      },
      id: 'scene_11111111-1111-4111-8111-111111111111',
      name: 'Rune Hall',
      sessionId: 'ABC123',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const passive = getPassiveSceneEntities(scene);
    const draft = createSceneEntityDraftFormFromEntity(passive[0]!);

    assert.equal(passive.length, 1);
    assert.equal(passive[0]?.name, 'Rune Door');
    assert.deepEqual(draft, {
      blocksMovement: true,
      blocksVision: false,
      footprintHeight: '1',
      footprintWidth: '2',
      hidden: true,
      name: 'Rune Door',
      type: 'object',
    });
    assert.deepEqual(sceneEntityUpdateInputFromDraft(draft), {
      blocksMovement: true,
      blocksVision: false,
      footprint: {
        height: 1,
        width: 2,
      },
      hidden: true,
      meta: {
        source: 'runtime-cockpit',
      },
      name: 'Rune Door',
      type: 'object',
    });
  });

  it('derives active scene guidance for DM and player modes', () => {
    assert.equal(
      getActiveSceneGuidance({
        activeSceneId: null,
        mode: 'dm',
        scene: null,
      }).title,
      'Build a scene',
    );
    assert.equal(
      getActiveSceneGuidance({
        activeSceneId: 'SCENE-001',
        mode: 'player',
        scene: null,
      }).title,
      'Scene ID known',
    );
    assert.equal(
      getActiveSceneGuidance({
        activeSceneId: 'SCENE-001',
        mode: 'player',
        scene: {
          createdAt: '2026-01-01T00:00:00.000Z',
          entities: [],
          grid: {
            cellSizeFeet: 5,
            height: 8,
            width: 8,
          },
          id: 'SCENE-001',
          name: 'Training Room',
          sessionId: 'SESSION-001',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }).title,
      'Scene loaded',
    );
  });

  it('derives occupied cells for scene entity footprints', () => {
    const cells = getSceneEntityDisplayCells({
      createdAt: '2026-01-01T00:00:00.000Z',
      entities: [
        {
          blocksMovement: true,
          blocksVision: false,
          footprint: {
            height: 2,
            width: 2,
          },
          hidden: false,
          id: 'ENTITY-001',
          combatant: null,
          meta: {},
          name: 'Crate Stack',
          position: {
            x: 1,
            y: 2,
          },
          type: 'object',
        },
      ],
      grid: {
        cellSizeFeet: 5,
        height: 8,
        width: 8,
      },
      id: 'SCENE-001',
      name: 'Training Room',
      sessionId: 'SESSION-001',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.deepEqual(
      cells.map((cell) => ({
        isOrigin: cell.isOrigin,
        label: cell.label,
        x: cell.x,
        y: cell.y,
      })),
      [
        {
          isOrigin: true,
          label: 'Crate Stack (object, blocks movement)',
          x: 1,
          y: 2,
        },
        {
          isOrigin: false,
          label: 'Crate Stack (object, blocks movement)',
          x: 2,
          y: 2,
        },
        {
          isOrigin: false,
          label: 'Crate Stack (object, blocks movement)',
          x: 1,
          y: 3,
        },
        {
          isOrigin: false,
          label: 'Crate Stack (object, blocks movement)',
          x: 2,
          y: 3,
        },
      ],
    );
  });

  it('normalizes and validates monster/NPC combatant drafts', () => {
    const draft = createDefaultCombatantDraftForm();
    const errors = validateCombatantDraftForm({
      form: draft,
      grid: {
        cellSizeFeet: 5,
        height: 8,
        width: 8,
      },
      position: {
        x: 1,
        y: 1,
      },
    });
    const input = combatantInputFromDraft(draft, {
      x: 1,
      y: 1,
    });

    assert.deepEqual(errors, []);
    assert.equal(input.kind, 'monster');
    assert.equal(input.name, 'Ash Goblin');
    assert.deepEqual(input.position, {
      x: 1,
      y: 1,
    });
    assert.equal(input.hp.current, 8);

    assert.ok(
      validateCombatantDraftForm({
        form: {
          ...draft,
          hp: {
            ...draft.hp,
            current: '99',
          },
        },
        position: {
          x: 0,
          y: 0,
        },
      }).includes('Current HP cannot exceed max HP.'),
    );
  });

  it('derives combatant entities, occupied cells, and current turn labels', () => {
    const scene = {
      createdAt: '2026-01-01T00:00:00.000Z',
      entities: [
        {
          blocksMovement: true,
          blocksVision: false,
          combatant: {
            abilities: {
              cha: 8,
              con: 12,
              dex: 12,
              int: 8,
              str: 14,
              wis: 10,
            },
            armorClass: 12,
            hp: {
              current: 8,
              max: 8,
              temp: 0,
            },
            kind: 'monster' as const,
            speed: 30,
          },
          footprint: {
            height: 1,
            width: 2,
          },
          hidden: false,
          id: 'scene_entity_11111111-1111-4111-8111-111111111111',
          meta: {},
          name: 'Ash Goblin',
          position: {
            x: 3,
            y: 4,
          },
          type: 'monster' as const,
        },
      ],
      grid: {
        cellSizeFeet: 5,
        height: 8,
        width: 8,
      },
      id: 'SCENE-001',
      name: 'Training Room',
      sessionId: 'SESSION-001',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const encounter = {
      createdAt: '2026-01-01T00:00:00.000Z',
      currentTurnIndex: 0,
      currentTurnUsage: {
        actionUsed: false,
        bonusActionUsed: false,
        movementUsed: 0,
        reactionUsed: false,
      },
      id: 'encounter_11111111-1111-4111-8111-111111111111',
      participants: [
        {
          combatantId: 'scene_entity_11111111-1111-4111-8111-111111111111',
          initiative: 1,
          kind: 'combatant' as const,
          participantId: 'dm-001',
        },
      ],
      roundNumber: 1,
      sceneId: 'SCENE-001',
      sessionId: 'SESSION-001',
      status: 'active' as const,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    assert.equal(getCombatantEntities(scene).length, 1);
    assert.deepEqual(
      getCombatantDisplayCells(scene).map((cell) => [cell.x, cell.y]),
      [
        [3, 4],
        [4, 4],
      ],
    );
    assert.equal(
      getCurrentTurnCombatantId(encounter),
      'scene_entity_11111111-1111-4111-8111-111111111111',
    );
    assert.equal(
      getCurrentTurnLabel({
        encounter,
        participants: sessionState.participants,
        scene,
      }),
      'Ash Goblin (scene_entity_11111111-1111-4111-8111-111111111111)',
    );
  });

  it('derives attackable combatants and defeated state from authoritative HP', () => {
    const activeCombatant = {
      blocksMovement: true,
      blocksVision: false,
      combatant: {
        abilities: {
          cha: 8,
          con: 12,
          dex: 12,
          int: 8,
          str: 14,
          wis: 10,
        },
        armorClass: 12,
        hp: {
          current: 8,
          max: 8,
          temp: 0,
        },
        kind: 'monster' as const,
        speed: 30,
      },
      footprint: {
        height: 1,
        width: 1,
      },
      hidden: false,
      id: 'scene_entity_11111111-1111-4111-8111-111111111111',
      meta: {},
      name: 'Ash Goblin',
      position: {
        x: 3,
        y: 4,
      },
      type: 'monster' as const,
    };
    const defeatedCombatant = {
      ...activeCombatant,
      combatant: {
        ...activeCombatant.combatant,
        hp: {
          current: 0,
          max: 8,
          temp: 0,
        },
      },
      id: 'scene_entity_22222222-2222-4222-8222-222222222222',
      name: 'Fallen Goblin',
      position: {
        x: 4,
        y: 4,
      },
    };
    const scene = {
      createdAt: '2026-01-01T00:00:00.000Z',
      entities: [activeCombatant, defeatedCombatant],
      grid: {
        cellSizeFeet: 5,
        height: 8,
        width: 8,
      },
      id: 'SCENE-001',
      name: 'Training Room',
      sessionId: 'SESSION-001',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    assert.equal(isCombatantEntityDefeated(activeCombatant), false);
    assert.equal(isCombatantEntityDefeated(defeatedCombatant), true);
    assert.deepEqual(
      getAttackableCombatantEntities(scene).map((combatant) => combatant.id),
      ['scene_entity_11111111-1111-4111-8111-111111111111'],
    );
  });

  it('guards monster/NPC controls by mode, scene, selected combatant, and current turn', () => {
    assert.equal(
      getDmCombatantActionDisabledReason({
        busyLabel: null,
        currentTurnCombatantId:
          'scene_entity_11111111-1111-4111-8111-111111111111',
        mode: 'player',
        scene: null,
        selectedCombatantId:
          'scene_entity_11111111-1111-4111-8111-111111111111',
        sessionId: 'ABC123',
        targetParticipantId: 'player-001',
      }),
      'Switch to DM mode for monster/NPC controls.',
    );
    assert.equal(
      getDmCombatantActionDisabledReason({
        busyLabel: null,
        currentTurnCombatantId:
          'scene_entity_22222222-2222-4222-8222-222222222222',
        mode: 'dm',
        scene: {
          createdAt: '2026-01-01T00:00:00.000Z',
          entities: [],
          grid: {
            cellSizeFeet: 5,
            height: 8,
            width: 8,
          },
          id: 'SCENE-001',
          name: 'Training Room',
          sessionId: 'SESSION-001',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        selectedCombatantId:
          'scene_entity_11111111-1111-4111-8111-111111111111',
        sessionId: 'ABC123',
        targetParticipantId: 'player-001',
      }),
      'The selected combatant must be the current turn actor.',
    );
  });
});
