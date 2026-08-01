/**
 * Characters: a player's own draft, and the GM's assignment of it to a seat.
 *
 * The Character Library bridge is the delicate one. A library entry is a
 * reusable record; the runtime character it produces is live state. The command
 * copies the entry into a separate runtime character and the server records the
 * link - nothing here ever writes live HP, position or conditions back toward a
 * library entry, and no command in this module addresses one after the copy.
 */
import {
  characterInputFromDraft,
  characterUpdateInputFromDraft,
  formatRuntimeFailure,
  type CharacterDraftForm,
} from './runtime-cockpit-helpers';
import { submitCharacterLibraryEntryForAssignment } from './character-library-api';
import {
  createCommandId,
  sendCharacterCommand,
  sendDmCommand,
} from './runtime-api';
import {
  assertDraftValid,
  requireCharacterResponse,
  type RuntimeCommandContext,
} from './runtime-command-runner';
import type { Cell } from './runtime-cockpit-helpers';

export type CharacterCommandTransport = {
  sendCharacterCommand: typeof sendCharacterCommand;
  sendDmCommand: typeof sendDmCommand;
  submitCharacterLibraryEntryForAssignment: typeof submitCharacterLibraryEntryForAssignment;
};

export const defaultCharacterCommandTransport: CharacterCommandTransport = {
  sendCharacterCommand,
  sendDmCommand,
  submitCharacterLibraryEntryForAssignment,
};

export function createCharacterCommands(
  ctx: RuntimeCommandContext,
  transport: CharacterCommandTransport = defaultCharacterCommandTransport,
) {
  const {
    sendCharacterCommand: sendCharacter,
    sendDmCommand: sendDm,
    submitCharacterLibraryEntryForAssignment: submitLibraryEntry,
  } = transport;

  /** Create, update and finalize all answer with the character resource. */
  async function mutateOwnCharacter(
    label: string,
    build: (
      sessionId: string,
      participantId: string,
    ) => Parameters<typeof sendCharacter>[0],
  ) {
    const sessionId = ctx.requireSessionId();
    const participantId = ctx.getActors().player;
    const response = await ctx.unwrap(
      label,
      sendCharacter(build(sessionId, participantId)),
    );

    ctx.store.rememberCharacter(requireCharacterResponse(label, response));

    return response;
  }

  async function assign(input: {
    characterId: string;
    commandScope: string;
    participantId: string;
  }) {
    const sessionId = ctx.requireSessionId();
    const response = await ctx.unwrap(
      'assign_character_to_participant',
      sendCharacter({
        actor: { participantId: ctx.getActors().dm },
        commandId: createCommandId(input.commandScope),
        payload: {
          characterId: input.characterId,
          participantId: input.participantId,
          sessionId,
        },
        type: 'assign_character_to_participant',
      }),
    );

    if ('state' in response.data) {
      ctx.store.applySessionSnapshot(response.data.state);
    }

    return response;
  }

  return {
    createPlayerCharacter(input: {
      draft: CharacterDraftForm;
      errors: string[];
    }): Promise<void> {
      return ctx.run('create_character player draft', () => {
        assertDraftValid('Fix the character sheet first', input.errors);

        return mutateOwnCharacter(
          'create_character',
          (sessionId, participantId) => ({
            actor: { participantId },
            commandId: createCommandId('player-create-character'),
            payload: {
              character: characterInputFromDraft(input.draft),
              ownerParticipantId: participantId,
              sessionId,
            },
            type: 'create_character',
          }),
        );
      });
    },

    updatePlayerCharacter(input: {
      characterId: string;
      draft: CharacterDraftForm;
      errors: string[];
    }): Promise<void> {
      return ctx.run('update_character player draft', () => {
        assertDraftValid('Fix the character sheet first', input.errors);

        return mutateOwnCharacter(
          'update_character',
          (sessionId, participantId) => ({
            actor: { participantId },
            commandId: createCommandId('player-update-character'),
            payload: {
              character: characterUpdateInputFromDraft(input.draft),
              characterId: input.characterId,
              sessionId,
            },
            type: 'update_character',
          }),
        );
      });
    },

    finalizePlayerCharacter(input: { characterId: string }): Promise<void> {
      return ctx.run('finalize_character player draft', () =>
        mutateOwnCharacter(
          'finalize_character',
          (sessionId, participantId) => ({
            actor: { participantId },
            commandId: createCommandId('player-finalize-character'),
            payload: { characterId: input.characterId, sessionId },
            type: 'finalize_character',
          }),
        ),
      );
    },

    submitPlayerCharacterForAssignment(input: {
      characterId: string;
    }): Promise<void> {
      return ctx.run('submit_character_for_assignment player', async () => {
        const sessionId = ctx.requireSessionId();
        const participantId = ctx.getActors().player;
        const response = await ctx.unwrap(
          'submit_character_for_assignment',
          sendCharacter({
            actor: { participantId },
            commandId: createCommandId('player-submit-character'),
            payload: { characterId: input.characterId, sessionId },
            type: 'submit_character_for_assignment',
          }),
        );

        if ('state' in response.data) {
          ctx.store.applySessionSnapshot(response.data.state);
        }

        return response;
      });
    },

    /**
     * Copy a finalized library entry into this table and read the result back.
     *
     * The command returns the new runtime character's ID but not the character,
     * so the follow-up read is what puts a usable resource in front of the
     * player. The ID is also remembered immediately: if the read fails, the seat
     * can still recover the character it now owns.
     */
    submitLibraryEntryForAssignment(input: {
      entryId: string;
      ownerUserId: string;
    }): Promise<void> {
      return ctx.run(
        'submit_character_library_entry_for_assignment player',
        async () => {
          const sessionId = ctx.requireSessionId();
          const participantId = ctx.getActors().player;
          const result = await submitLibraryEntry({
            actorParticipantId: participantId,
            entryId: input.entryId,
            ownerParticipantId: input.ownerUserId,
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

          ctx.store.applySessionSnapshot(result.data.state);
          ctx.store.noteKnownCharacterId(
            participantId,
            result.data.characterId,
          );

          const read = await ctx.unwrap(
            'get_character',
            sendCharacter({
              actor: { participantId },
              commandId: createCommandId(
                'player-read-library-runtime-character',
              ),
              payload: { characterId: result.data.characterId, sessionId },
              type: 'get_character',
            }),
          );

          if ('character' in read.data) {
            ctx.store.rememberCharacter(read.data);
          }

          return { data: result.data, ok: true };
        },
      );
    },

    assignCharacterToParticipant(input: {
      characterId: string;
      participantId: string;
    }): Promise<void> {
      return ctx.run('assign selected loaded character', () =>
        assign({
          characterId: input.characterId,
          commandScope: 'dm-assign-loaded-character',
          participantId: input.participantId,
        }),
      );
    },

    assignPendingCharacter(input: {
      characterId: string;
      participantId: string;
    }): Promise<void> {
      return ctx.run(`assign pending character ${input.participantId}`, () =>
        assign({
          characterId: input.characterId,
          commandScope: 'dm-assign-pending-character',
          participantId: input.participantId,
        }),
      );
    },

    /**
     * Move a player's token as the GM.
     *
     * Distinct from the player's own move command because it bypasses the
     * mover's movement budget - the GM repositioning a stunned character is not
     * that character spending movement.
     */
    repositionCharacter(input: {
      cell: Cell;
      characterId: string;
      participantId: string;
    }): Promise<void> {
      return ctx.run('dm_reposition_character_in_active_scene', async () => {
        const sessionId = ctx.requireSessionId();
        const response = await ctx.unwrap(
          'dm_reposition_character_in_active_scene',
          sendDm({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-reposition'),
            payload: {
              characterId: input.characterId,
              participantId: input.participantId,
              position: input.cell,
              sessionId,
            },
            type: 'dm_reposition_character_in_active_scene',
          }),
        );

        if ('character' in response.data) {
          ctx.store.rememberCharacter(response.data);
        }

        return response;
      });
    },
  };
}

export type CharacterCommands = ReturnType<typeof createCharacterCommands>;
