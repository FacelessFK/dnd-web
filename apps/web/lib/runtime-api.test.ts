import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  encounterCommandSchema,
  sceneCommandSchema,
  sessionCommandResponseSchema,
} from '@dnd/protocol';

import {
  fetchOutboxStatus,
  buildSessionStreamUrl,
  clearParticipantCredentials,
  createCommandId,
  describeRequestFailure,
  getParticipantCredential,
  parseOutboxStatusResponse,
  parseRuntimeCommandResponse,
  setParticipantCredential,
} from './runtime-api';

describe('runtime-api helpers', () => {
  it('builds encoded session stream URLs against the configured server', () => {
    const url = buildSessionStreamUrl('SESSION/ONE', 'player 001');

    assert.equal(
      url,
      'http://localhost:2567/api/sessions/SESSION%2FONE/stream?participantId=player+001',
    );
  });

  it('carries the participant credential on the stream URL it belongs to', () => {
    // `EventSource` cannot set headers, so the stream takes the token as a query
    // parameter. It must only be attached for the session and participant it was
    // actually issued to.
    setParticipantCredential({
      participantId: 'dm-001',
      sessionId: 'ABC123',
      token: 'x2Yk9Qm4Rt7Wz1Bv6Nd3Hj8Lp0Sf5Cg2Ae4Ui7Ok9Qs',
    });

    try {
      assert.match(
        buildSessionStreamUrl('ABC123', 'dm-001'),
        /participantToken=x2Yk9Qm4Rt7Wz1Bv6Nd3Hj8Lp0Sf5Cg2Ae4Ui7Ok9Qs/,
      );

      // A stale credential from another table must never be offered to a new
      // one, or to a different participant in the same one.
      assert.doesNotMatch(
        buildSessionStreamUrl('XYZ789', 'dm-001'),
        /participantToken/,
      );
      assert.doesNotMatch(
        buildSessionStreamUrl('ABC123', 'player-001'),
        /participantToken/,
      );
    } finally {
      clearParticipantCredentials();
    }
  });

  it('holds one credential per participant so a tab can act as several', () => {
    // The runtime cockpit creates a session as the DM and then joins players
    // into it. Keeping only the newest credential used to revoke the tab's
    // ability to act as the DM the moment a player joined.
    setParticipantCredential({
      participantId: 'dm-001',
      sessionId: 'ABC123',
      token: 'x2Yk9Qm4Rt7Wz1Bv6Nd3Hj8Lp0Sf5Cg2Ae4Ui7Ok9Qs',
    });
    setParticipantCredential({
      participantId: 'player-001',
      sessionId: 'ABC123',
      token: 'p9Lm2Zx5Vt8Wq1Br6Ny3Hk8Jd0Sf5Cg2Ae4Ui7Ok3Ts',
    });

    try {
      assert.equal(
        getParticipantCredential('ABC123', 'dm-001')?.token,
        'x2Yk9Qm4Rt7Wz1Bv6Nd3Hj8Lp0Sf5Cg2Ae4Ui7Ok9Qs',
      );
      assert.equal(
        getParticipantCredential('ABC123', 'player-001')?.token,
        'p9Lm2Zx5Vt8Wq1Br6Ny3Hk8Jd0Sf5Cg2Ae4Ui7Ok3Ts',
      );
      assert.equal(getParticipantCredential('ABC123', 'player-002'), null);
    } finally {
      clearParticipantCredentials();
    }

    assert.equal(getParticipantCredential('ABC123', 'dm-001'), null);
    assert.doesNotMatch(
      buildSessionStreamUrl('ABC123', 'dm-001'),
      /participantToken/,
    );
  });

  it('names a request timeout instead of surfacing a bare abort', () => {
    // `AbortSignal.timeout` rejects with a browser-specific TimeoutError whose
    // own message tells a player nothing.
    assert.equal(
      describeRequestFailure(
        new DOMException('signal timed out', 'TimeoutError'),
      ),
      'The runtime server did not respond in time.',
    );
    assert.equal(
      describeRequestFailure(new Error('Failed to fetch')),
      'Failed to fetch',
    );
    assert.equal(
      describeRequestFailure('not an error'),
      'Unable to reach the runtime server.',
    );
  });

  it('creates scoped command IDs', () => {
    const commandId = createCommandId('recover');

    assert.match(commandId, /^web-recover-/);
  });

  it('parses successful outbox status responses', () => {
    const response = parseOutboxStatusResponse(200, {
      ok: true,
      data: {
        configured: true,
        eventTypeCounts: {
          character_state: 0,
          combat_event: 0,
          encounter_state: 0,
          movement_state: 2,
          session_state: 1,
        },
        oldestCreatedAt: '2026-05-21T00:00:00.000Z',
        unpublishedCount: 3,
      },
    });

    assert.equal(response.ok, true);

    if (response.ok) {
      assert.equal(response.response.data.unpublishedCount, 3);
      assert.equal(response.response.data.eventTypeCounts.movement_state, 2);
    }
  });

  it('fetches outbox status with cookie credentials', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = async (input, init) => {
      calls.push({ input, init });

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            configured: false,
            eventTypeCounts: {
              character_state: 0,
              combat_event: 0,
              encounter_state: 0,
              movement_state: 0,
              session_state: 0,
            },
            oldestCreatedAt: null,
            unpublishedCount: 0,
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      );
    };

    try {
      const response = await fetchOutboxStatus();

      assert.equal(response.ok, true);
      assert.equal(calls.length, 1);
      assert.equal(
        calls[0]?.input.toString(),
        'http://localhost:2567/api/outbox/status',
      );
      assert.equal(calls[0]?.init?.credentials, 'include');
      assert.equal(calls[0]?.init?.method, 'GET');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('accepts combatant targets on the existing attack command schema', () => {
    const parsed = encounterCommandSchema.safeParse({
      actor: {
        participantId: 'player-001',
      },
      commandId: 'attack-combatant-1',
      payload: {
        sessionId: 'ABC123',
        targetCombatantId: 'scene_entity_11111111-1111-4111-8111-111111111111',
      },
      type: 'attack',
    });

    assert.equal(parsed.success, true);
  });

  it('accepts passive scene entity editing commands on the scene command schema', () => {
    const update = sceneCommandSchema.safeParse({
      actor: {
        participantId: 'dm-001',
      },
      commandId: 'update-scene-entity-1',
      payload: {
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        entityId: 'scene_entity_11111111-1111-4111-8111-111111111111',
        entity: {
          name: 'Rune Door',
          blocksMovement: true,
        },
      },
      type: 'update_scene_entity',
    });
    const reposition = sceneCommandSchema.safeParse({
      actor: {
        participantId: 'dm-001',
      },
      commandId: 'reposition-scene-entity-1',
      payload: {
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        entityId: 'scene_entity_11111111-1111-4111-8111-111111111111',
        position: {
          x: 2,
          y: 3,
        },
      },
      type: 'reposition_scene_entity',
    });
    const deleted = sceneCommandSchema.safeParse({
      actor: {
        participantId: 'dm-001',
      },
      commandId: 'delete-scene-entity-1',
      payload: {
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        entityId: 'scene_entity_11111111-1111-4111-8111-111111111111',
      },
      type: 'delete_scene_entity',
    });

    assert.equal(update.success, true);
    assert.equal(reposition.success, true);
    assert.equal(deleted.success, true);
  });

  it('accepts scene transition commands on the scene command schema', () => {
    const create = sceneCommandSchema.safeParse({
      actor: {
        participantId: 'dm-001',
      },
      commandId: 'create-scene-transition-1',
      payload: {
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        transition: {
          kind: 'door',
          name: 'North Door',
          targetSceneId: 'scene_22222222-2222-4222-8222-222222222222',
          position: {
            x: 1,
            y: 1,
          },
          footprint: {
            width: 1,
            height: 1,
          },
          blocksMovement: false,
          blocksVision: false,
          hidden: false,
        },
      },
      type: 'create_scene_transition',
    });
    const update = sceneCommandSchema.safeParse({
      actor: {
        participantId: 'dm-001',
      },
      commandId: 'update-scene-transition-1',
      payload: {
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        transitionId: 'scene_entity_11111111-1111-4111-8111-111111111111',
        transition: {
          kind: 'portal',
          targetSceneId: 'scene_22222222-2222-4222-8222-222222222222',
        },
      },
      type: 'update_scene_transition',
    });
    const deleted = sceneCommandSchema.safeParse({
      actor: {
        participantId: 'dm-001',
      },
      commandId: 'delete-scene-transition-1',
      payload: {
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        transitionId: 'scene_entity_11111111-1111-4111-8111-111111111111',
      },
      type: 'delete_scene_transition',
    });
    const activate = sceneCommandSchema.safeParse({
      actor: {
        participantId: 'dm-001',
      },
      commandId: 'activate-scene-transition-1',
      payload: {
        sessionId: 'ABC123',
        sceneId: 'scene_11111111-1111-4111-8111-111111111111',
        transitionId: 'scene_entity_11111111-1111-4111-8111-111111111111',
      },
      type: 'activate_scene_transition',
    });

    assert.equal(create.success, true);
    assert.equal(update.success, true);
    assert.equal(deleted.success, true);
    assert.equal(activate.success, true);
  });

  it('parses successful command responses', () => {
    const response = parseRuntimeCommandResponse(
      200,
      {
        ok: true,
        data: {
          participantId: 'dm-001',
          participantToken: 'x2Yk9Qm4Rt7Wz1Bv6Nd3Hj8Lp0Sf5Cg2Ae4Ui7Ok9Qs',
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
