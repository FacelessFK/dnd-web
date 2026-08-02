/**
 * Joining a table, and moving on the map once you are at one.
 *
 * `createSession` clears the read models before applying the new snapshot. That
 * order matters: applying first would briefly leave the previous table's map and
 * encounter attached to a session they do not belong to, and any render in that
 * window shows one table's board under another table's name.
 *
 * Recovery is not here. It is a long sequence with its own fail-open rules and
 * lives in `runtime-recovery.ts`.
 */
import type { ActiveSceneState } from '@dnd/protocol';

import type { Cell } from './runtime-cockpit-helpers';
import {
  createCommandId,
  sendMovementCommand,
  sendSessionCommand,
} from './runtime-api';
import type { RuntimeCommandContext } from './runtime-command-runner';

export type SessionCommandTransport = {
  sendMovementCommand: typeof sendMovementCommand;
  sendSessionCommand: typeof sendSessionCommand;
};

export const defaultSessionCommandTransport: SessionCommandTransport = {
  sendMovementCommand,
  sendSessionCommand,
};

export function createSessionCommands(
  ctx: RuntimeCommandContext,
  transport: SessionCommandTransport = defaultSessionCommandTransport,
) {
  const { sendMovementCommand: sendMovement, sendSessionCommand: sendSession } =
    transport;

  /**
   * Read the placements on the active scene.
   *
   * `quiet` skips the busy label and the error surface. Movement commands call
   * it as a follow-up read, and a transient failure there should not present
   * itself as the move having failed - the move already succeeded, and the
   * server will re-send placements on the next frame anyway.
   */
  async function readActiveScene(): Promise<ActiveSceneState> {
    const sessionId = ctx.requireSessionId();
    const response = await ctx.unwrap(
      'get_active_scene_state',
      sendMovement({
        actor: { participantId: ctx.getActors().stream },
        commandId: createCommandId('get-active-scene'),
        payload: { sessionId },
        type: 'get_active_scene_state',
      }),
    );

    if (!('placedCharacters' in response.data)) {
      throw new Error(
        'get_active_scene_state returned a movement mutation response.',
      );
    }

    ctx.store.applyActiveScene(response.data);

    return response.data;
  }

  return {
    createSession(input: { rulesProfileId: string }): Promise<void> {
      return ctx.run('create_session', async () => {
        const actors = ctx.getActors();
        const response = await ctx.unwrap(
          'create_session',
          sendSession({
            actor: {
              displayName: actors.streamDisplayName,
              participantId: actors.stream,
              role: actors.streamRole,
            },
            commandId: createCommandId('create-session'),
            payload: { rulesProfileId: input.rulesProfileId },
            type: 'create_session',
          }),
        );

        ctx.store.clearReadModels({ clearKnownCharacterIds: true });
        ctx.store.applySessionSnapshot(response.data.state);

        return response;
      });
    },

    joinSession(input: {
      displayName: string;
      participantId: string;
      sessionId?: string;
    }): Promise<void> {
      return ctx.run('join current player', async () => {
        const sessionId = input.sessionId ?? ctx.requireSessionId();
        const response = await ctx.unwrap(
          `join_session ${input.participantId}`,
          sendSession({
            actor: {
              displayName: input.displayName,
              participantId: input.participantId,
              role: 'player',
            },
            commandId: createCommandId(`join-${input.participantId}`),
            payload: { sessionId },
            type: 'join_session',
          }),
        );

        ctx.store.applySessionSnapshot(response.data.state);

        return response;
      });
    },

    readActiveSceneState(): Promise<void> {
      return ctx.run('get_active_scene_state', readActiveScene);
    },

    /**
     * Move the acting token, then re-read placements.
     *
     * The move response carries the character but not the board's placement
     * list, and the follow-up read is quiet: it is a refresh of something the
     * server will re-send anyway, so a failure there must not report the move as
     * failed.
     */
    moveActingCharacter(input: { cell: Cell }): Promise<void> {
      return ctx.run('move_character_in_active_scene', async () => {
        const sessionId = ctx.requireSessionId();
        const participantId = ctx.getActors().acting;
        const response = await ctx.unwrap(
          'move_character_in_active_scene',
          sendMovement({
            actor: { participantId },
            commandId: createCommandId('move-character'),
            payload: { participantId, position: input.cell, sessionId },
            type: 'move_character_in_active_scene',
          }),
        );

        if ('character' in response.data) {
          ctx.store.rememberCharacter(response.data);
        }

        await readActiveScene().catch(() => null);

        return response;
      });
    },

    placeCharacter(input: {
      cell: Cell;
      participantId: string;
    }): Promise<void> {
      return ctx.run('place_character_in_active_scene', async () => {
        const sessionId = ctx.requireSessionId();
        const response = await ctx.unwrap(
          `place_character_in_active_scene ${input.participantId}`,
          sendMovement({
            actor: { participantId: input.participantId },
            commandId: createCommandId(`place-${input.participantId}`),
            payload: {
              participantId: input.participantId,
              position: input.cell,
              sessionId,
            },
            type: 'place_character_in_active_scene',
          }),
        );

        if ('character' in response.data) {
          ctx.store.rememberCharacter(response.data);
        }

        await readActiveScene().catch(() => null);

        return response;
      });
    },
  };
}

export type SessionCommands = ReturnType<typeof createSessionCommands>;
