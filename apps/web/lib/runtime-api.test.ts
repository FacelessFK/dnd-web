import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  encounterCommandSchema,
  sceneCommandSchema,
  sessionCommandResponseSchema,
} from '@dnd/protocol';

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
