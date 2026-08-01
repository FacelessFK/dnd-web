/**
 * The scripted table: one command that builds a playable session from nothing.
 *
 * This is the demo path the smoke harnesses and every manual playtest start
 * from, so it is written as a single sequence rather than as something the
 * operator assembles by hand. It is also the reason the step-by-step helpers
 * below still exist: when the scripted run fails partway, being able to re-run
 * one stage is what makes the failure diagnosable.
 *
 * Nothing here is privileged. Each step is an ordinary command sent as an
 * ordinary actor - the players join as themselves and create their own
 * characters - so the sequence exercises the same authorization every real table
 * does. A demo that set up the table as the GM throughout would prove nothing
 * about whether a player can do what it looks like they just did.
 */
import type { CharacterResource } from '@dnd/protocol';

import {
  sampleCharacters,
  samplePlayers,
  type DemoScenario,
  type SessionSnapshot,
} from './runtime-cockpit-helpers';
import {
  createCommandId,
  sendCharacterCommand,
  sendMovementCommand,
  sendSceneCommand,
  sendSessionCommand,
} from './runtime-api';
import {
  requireCharacterResponse,
  requireSceneResponse,
  type RuntimeCommandContext,
} from './runtime-command-runner';

export type DemoCommandTransport = {
  sendCharacterCommand: typeof sendCharacterCommand;
  sendMovementCommand: typeof sendMovementCommand;
  sendSceneCommand: typeof sendSceneCommand;
  sendSessionCommand: typeof sendSessionCommand;
};

export const defaultDemoCommandTransport: DemoCommandTransport = {
  sendCharacterCommand,
  sendMovementCommand,
  sendSceneCommand,
  sendSessionCommand,
};

export function createDemoCommands(
  ctx: RuntimeCommandContext,
  transport: DemoCommandTransport = defaultDemoCommandTransport,
) {
  const {
    sendCharacterCommand: sendCharacter,
    sendMovementCommand: sendMovement,
    sendSceneCommand: sendScene,
    sendSessionCommand: sendSession,
  } = transport;

  function resolveScenarioPlayers(scenario: DemoScenario) {
    return scenario.playerParticipantIds.map((participantId) => {
      const player = samplePlayers.find(
        (candidate) => candidate.participantId === participantId,
      );

      if (!player) {
        throw new Error(`No sample player is defined for ${participantId}.`);
      }

      return player;
    });
  }

  function requireSampleCharacter(participantId: string) {
    const characterInput = sampleCharacters[participantId];

    if (!characterInput) {
      throw new Error(`No sample character is defined for ${participantId}.`);
    }

    return characterInput;
  }

  async function joinPlayer(input: {
    displayName: string;
    participantId: string;
    scope: string;
    sessionId: string;
  }): Promise<SessionSnapshot> {
    const response = await ctx.unwrap(
      `join_session ${input.participantId}`,
      sendSession({
        actor: {
          displayName: input.displayName,
          participantId: input.participantId,
          role: 'player',
        },
        commandId: createCommandId(`${input.scope}-${input.participantId}`),
        payload: { sessionId: input.sessionId },
        type: 'join_session',
      }),
    );

    ctx.store.applySessionSnapshot(response.data.state);

    return response.data.state;
  }

  async function createCharacterFor(input: {
    participantId: string;
    scope: string;
    sessionId: string;
  }): Promise<CharacterResource> {
    const response = await ctx.unwrap(
      `create_character ${input.participantId}`,
      sendCharacter({
        actor: { participantId: input.participantId },
        commandId: createCommandId(`${input.scope}-${input.participantId}`),
        payload: {
          character: requireSampleCharacter(input.participantId),
          ownerParticipantId: input.participantId,
          sessionId: input.sessionId,
        },
        type: 'create_character',
      }),
    );

    const created = requireCharacterResponse('create_character', response);
    ctx.store.rememberCharacter(created);

    return created;
  }

  async function finalizeAndAssign(input: {
    characterId: string;
    participantId: string;
    scope: string;
    sessionId: string;
  }): Promise<SessionSnapshot | null> {
    const finalized = await ctx.unwrap(
      `finalize_character ${input.participantId}`,
      sendCharacter({
        actor: { participantId: input.participantId },
        commandId: createCommandId(
          `${input.scope}-finalize-${input.participantId}`,
        ),
        payload: { characterId: input.characterId, sessionId: input.sessionId },
        type: 'finalize_character',
      }),
    );

    if ('character' in finalized.data) {
      ctx.store.rememberCharacter(finalized.data);
    }

    const assigned = await ctx.unwrap(
      `assign_character_to_participant ${input.participantId}`,
      sendCharacter({
        actor: { participantId: ctx.getActors().dm },
        commandId: createCommandId(
          `${input.scope}-assign-${input.participantId}`,
        ),
        payload: {
          characterId: input.characterId,
          participantId: input.participantId,
          sessionId: input.sessionId,
        },
        type: 'assign_character_to_participant',
      }),
    );

    if ('state' in assigned.data) {
      ctx.store.applySessionSnapshot(assigned.data.state);

      return assigned.data.state;
    }

    return null;
  }

  async function placeCharacterAt(input: {
    participantId: string;
    position: { x: number; y: number };
    scope: string;
    sessionId: string;
  }) {
    const response = await ctx.unwrap(
      `place_character_in_active_scene ${input.participantId}`,
      sendMovement({
        actor: { participantId: input.participantId },
        commandId: createCommandId(`${input.scope}-${input.participantId}`),
        payload: {
          participantId: input.participantId,
          position: input.position,
          sessionId: input.sessionId,
        },
        type: 'place_character_in_active_scene',
      }),
    );

    if ('character' in response.data) {
      ctx.store.rememberCharacter(response.data);
    }

    return response;
  }

  async function readActiveScene(sessionId: string) {
    const response = await ctx.unwrap(
      'get_active_scene_state',
      sendMovement({
        actor: { participantId: ctx.getActors().dm },
        commandId: createCommandId('demo-get-active-scene'),
        payload: { sessionId },
        type: 'get_active_scene_state',
      }),
    );

    if ('placedCharacters' in response.data) {
      ctx.store.applyActiveScene(response.data);

      return response.data;
    }

    return null;
  }

  return {
    /**
     * Build the whole scenario: session, seats, characters, map, placements.
     *
     * The session ID comes from the create response rather than from component
     * state, because the state that names the previous session is exactly what
     * is being replaced and reading it mid-sequence would aim later steps at the
     * table this one is superseding.
     */
    runScenario(scenario: DemoScenario): Promise<void> {
      return ctx.run(`run ${scenario.name}`, async () => {
        const actors = ctx.getActors();
        const players = resolveScenarioPlayers(scenario);
        const created = await ctx.unwrap(
          'create_session',
          sendSession({
            actor: {
              displayName: actors.streamDisplayName,
              participantId: actors.dm,
              role: 'dm',
            },
            commandId: createCommandId(`${scenario.id}-create-session`),
            payload: { rulesProfileId: 'dnd5e-2024-core' },
            type: 'create_session',
          }),
        );

        const sessionId = created.data.sessionId;
        let session = created.data.state;

        ctx.store.clearReadModels({ clearKnownCharacterIds: true });
        ctx.store.applySessionSnapshot(session);

        for (const player of players) {
          session = await joinPlayer({
            displayName: player.displayName,
            participantId: player.participantId,
            scope: 'demo-join',
            sessionId,
          });
        }

        const characters: Record<string, CharacterResource> = {};

        for (const player of players) {
          characters[player.participantId] = await createCharacterFor({
            participantId: player.participantId,
            scope: 'demo-create-character',
            sessionId,
          });
        }

        for (const player of players) {
          const characterId =
            characters[player.participantId]?.character.id ?? '';

          if (!characterId) {
            throw new Error(
              `No sample character was created for ${player.participantId}.`,
            );
          }

          session =
            (await finalizeAndAssign({
              characterId,
              participantId: player.participantId,
              scope: 'demo',
              sessionId,
            })) ?? session;
        }

        const sceneResponse = await ctx.unwrap(
          'create_scene',
          sendScene({
            actor: { participantId: actors.dm },
            commandId: createCommandId(`${scenario.id}-create-scene`),
            payload: { scene: scenario.scene, sessionId },
            type: 'create_scene',
          }),
        );
        const scene = requireSceneResponse('create_scene', sceneResponse);

        ctx.store.rememberScene(scene);

        const activated = await ctx.unwrap(
          'activate_scene_for_session',
          sendScene({
            actor: { participantId: actors.dm },
            commandId: createCommandId('demo-activate-scene'),
            payload: { sceneId: scene.id, sessionId },
            type: 'activate_scene_for_session',
          }),
        );

        if ('state' in activated.data) {
          session = activated.data.state;
          ctx.store.applySessionSnapshot(session);
        }

        for (const player of players) {
          const position = scenario.positions[player.participantId];

          if (!position) {
            throw new Error(
              `No sample position is defined for ${player.participantId}.`,
            );
          }

          await placeCharacterAt({
            participantId: player.participantId,
            position,
            scope: 'demo-place',
            sessionId,
          });
        }

        return {
          activeScene: await readActiveScene(sessionId),
          characters: Object.values(characters).map(
            (resource) => resource.character.id,
          ),
          scene,
          session,
        };
      });
    },

    joinSamplePlayers(): Promise<void> {
      return ctx.run('join sample players', async () => {
        const sessionId = ctx.requireSessionId();
        let session: SessionSnapshot | null = null;

        for (const player of samplePlayers) {
          session = await joinPlayer({
            displayName: player.displayName,
            participantId: player.participantId,
            scope: 'join',
            sessionId,
          });
        }

        return session;
      });
    },

    createSampleCharacters(): Promise<void> {
      return ctx.run('create sample characters', async () => {
        const sessionId = ctx.requireSessionId();
        const created: CharacterResource[] = [];

        for (const player of samplePlayers) {
          created.push(
            await createCharacterFor({
              participantId: player.participantId,
              scope: 'create-character',
              sessionId,
            }),
          );
        }

        return created;
      });
    },

    finalizeAndAssignCharacters(input: {
      characterIdByParticipant: Record<string, string | undefined>;
    }): Promise<void> {
      return ctx.run('finalize and assign sample characters', async () => {
        const sessionId = ctx.requireSessionId();
        let session: SessionSnapshot | null = null;

        for (const player of samplePlayers) {
          const characterId =
            input.characterIdByParticipant[player.participantId];

          if (!characterId) {
            throw new Error(
              `No character ID is known for ${player.participantId}.`,
            );
          }

          session =
            (await finalizeAndAssign({
              characterId,
              participantId: player.participantId,
              scope: 'sample',
              sessionId,
            })) ?? session;
        }

        return session;
      });
    },

    placeSampleCharacters(input: {
      positions: Record<string, { x: number; y: number }>;
    }): Promise<void> {
      return ctx.run('place sample characters', async () => {
        const sessionId = ctx.requireSessionId();

        for (const player of samplePlayers) {
          const position = input.positions[player.participantId];

          if (!position) {
            throw new Error(
              `No sample position is defined for ${player.participantId}.`,
            );
          }

          await placeCharacterAt({
            participantId: player.participantId,
            position,
            scope: 'place',
            sessionId,
          });
        }

        return readActiveScene(sessionId);
      });
    },
  };
}

export type DemoCommands = ReturnType<typeof createDemoCommands>;
