import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sessionCommandResponseSchema } from '@dnd/protocol';

import {
  buildSessionStreamUrl,
  createCommandId,
  parseRuntimeCommandResponse,
} from './runtime-api';

describe('runtime-api helpers', () => {
  it('builds encoded session stream URLs against the configured server', () => {
    const url = buildSessionStreamUrl('SESSION/ONE', 'player 001');

    assert.equal(
      url,
      'http://localhost:2567/api/sessions/SESSION%2FONE/stream?participantId=player+001',
    );
  });

  it('creates scoped command IDs', () => {
    const commandId = createCommandId('recover');

    assert.match(commandId, /^web-recover-/);
  });

  it('parses successful command responses', () => {
    const response = parseRuntimeCommandResponse(
      200,
      {
        ok: true,
        data: {
          participantId: 'dm-001',
          sessionId: 'ABC123',
          state: {
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
            ],
            session: {
              activeSceneId: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              dmParticipantId: 'dm-001',
              id: 'ABC123',
              playerParticipantIds: [],
              revision: 1,
              rulesProfileId: 'dnd5e-2024-core',
              status: 'lobby',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          },
          streamPath: '/api/sessions/ABC123/stream?participantId=dm-001',
        },
      },
      sessionCommandResponseSchema,
    );

    assert.equal(response.ok, true);

    if (response.ok) {
      assert.equal(response.response.data.sessionId, 'ABC123');
    }
  });

  it('surfaces command errors with status and code', () => {
    const response = parseRuntimeCommandResponse(
      409,
      {
        ok: false,
        error: {
          code: 'no_active_encounter',
          message: 'There is no active encounter.',
        },
      },
      sessionCommandResponseSchema,
    );

    assert.equal(response.ok, false);

    if (!response.ok) {
      assert.equal(response.error.status, 409);
      assert.equal(response.error.code, 'no_active_encounter');
    }
  });

  it('surfaces unexpected response shapes', () => {
    const response = parseRuntimeCommandResponse(
      200,
      {
        nope: true,
      },
      sessionCommandResponseSchema,
    );

    assert.equal(response.ok, false);

    if (!response.ok) {
      assert.equal(response.error.status, 200);
      assert.match(response.error.message, /Invalid input/);
    }
  });
});
