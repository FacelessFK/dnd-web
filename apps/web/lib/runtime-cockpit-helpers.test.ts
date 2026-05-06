import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CharacterResource } from '@dnd/protocol';

import type { SessionSnapshot } from './runtime-cockpit-helpers';
import {
  formatRuntimeFailure,
  getAssignedCharacterRefs,
  getKnownCharacterIds,
  getPlayerParticipantIds,
  isExpectedRecoveryMiss,
  sanitizeSessionIdInput,
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
      role: 'dm',
    },
    {
      characterId: 'CHAR-001',
      connectionStatus: 'disconnected',
      displayName: 'Player One',
      id: 'player-001',
      joinedAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-01T00:00:00.000Z',
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
});
