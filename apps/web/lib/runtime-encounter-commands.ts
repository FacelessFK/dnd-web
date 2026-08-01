/**
 * Initiative, turns, attacks, and the GM overrides that touch a live character.
 *
 * Turn usage is never computed here. The encounter that comes back carries
 * `currentTurnUsage`, and that value is what the UI shows; a client that
 * decremented movement locally would disagree with the server the first time an
 * effect changed a speed, and disagree silently.
 */
import type { DmCommand, Encounter } from '@dnd/protocol';

import {
  createCommandId,
  sendDmCommand,
  sendEncounterCommand,
  sendSceneCommand,
} from './runtime-api';
import {
  requireCharacterResponse,
  type RuntimeCommandContext,
} from './runtime-command-runner';

export type EncounterCommandTransport = {
  sendDmCommand: typeof sendDmCommand;
  sendEncounterCommand: typeof sendEncounterCommand;
  sendSceneCommand: typeof sendSceneCommand;
};

export const defaultEncounterCommandTransport: EncounterCommandTransport = {
  sendDmCommand,
  sendEncounterCommand,
  sendSceneCommand,
};

/** How a GM override addresses a character. */
export type CharacterTarget = {
  characterId: string;
  participantId: string;
};

/** Turn commands whose entire payload is the session. */
export type SimpleEncounterCommandType =
  | 'advance_turn'
  | 'use_action'
  | 'use_bonus_action'
  | 'use_reaction';

export type TurnUsageDraft = Encounter['currentTurnUsage'];

export function createEncounterCommands(
  ctx: RuntimeCommandContext,
  transport: EncounterCommandTransport = defaultEncounterCommandTransport,
) {
  const {
    sendDmCommand: sendDm,
    sendEncounterCommand: sendEncounter,
    sendSceneCommand: sendScene,
  } = transport;

  async function runDmEncounterCommand(command: DmCommand) {
    const response = await ctx.unwrap(command.type, sendDm(command));

    if ('encounter' in response.data) {
      ctx.store.applyEncounter(response.data.encounter);
    }

    return response;
  }

  return {
    startEncounter(): Promise<void> {
      return ctx.run('start_encounter', async () => {
        const sessionId = ctx.requireSessionId();
        const response = await ctx.unwrap(
          'start_encounter',
          sendEncounter({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('start-encounter'),
            payload: { sessionId },
            type: 'start_encounter',
          }),
        );

        ctx.store.applyEncounter(response.data.encounter);

        return response;
      });
    },

    /**
     * The turn commands that need nothing but a session.
     *
     * `advance_turn` is the GM's, the rest belong to whoever is acting. Sending
     * the wrong actor would be rejected server-side, but choosing correctly here
     * keeps the error surface for real mistakes.
     */
    runSimpleEncounterCommand(type: SimpleEncounterCommandType): Promise<void> {
      return ctx.run(type, async () => {
        const sessionId = ctx.requireSessionId();
        const actors = ctx.getActors();
        const response = await ctx.unwrap(
          type,
          sendEncounter({
            actor: {
              participantId:
                type === 'advance_turn' ? actors.dm : actors.acting,
            },
            commandId: createCommandId(type),
            payload: { sessionId },
            type,
          }),
        );

        ctx.store.applyEncounter(response.data.encounter);

        return response;
      });
    },

    /**
     * Attack, then re-read the scene when the target was a combatant.
     *
     * A hit on a monster changes that creature's HP, which lives on the scene
     * entity rather than on a character resource, and the attack response does
     * not carry the map. Without the follow-up read the token's health bar would
     * stay where it was until something else refreshed the board.
     */
    attack(input: {
      sceneId: string;
      targetCombatantId: string;
      targetParticipantId: string;
    }): Promise<void> {
      return ctx.run('attack', async () => {
        const sessionId = ctx.requireSessionId();
        const actors = ctx.getActors();
        const response = await ctx.unwrap(
          'attack',
          sendEncounter({
            actor: { participantId: actors.acting },
            commandId: createCommandId('attack'),
            payload: {
              sessionId,
              ...(input.targetCombatantId
                ? { targetCombatantId: input.targetCombatantId }
                : { targetParticipantId: input.targetParticipantId }),
            },
            type: 'attack',
          }),
        );

        ctx.store.applyEncounter(response.data.encounter);

        if (input.targetCombatantId && input.sceneId) {
          const read = await ctx.unwrap(
            'get_scene',
            sendScene({
              actor: { participantId: actors.acting },
              commandId: createCommandId('attack-get-scene'),
              payload: { sceneId: input.sceneId, sessionId },
              type: 'get_scene',
            }),
          );

          if ('scene' in read.data) {
            ctx.store.rememberScene(read.data.scene);
          }
        }

        return response;
      });
    },

    setCurrentTurnParticipant(input: { participantId: string }): Promise<void> {
      return ctx.run('dm_set_current_turn_participant', () => {
        const sessionId = ctx.requireSessionId();

        return runDmEncounterCommand({
          actor: { participantId: ctx.getActors().dm },
          commandId: createCommandId('dm-current-turn'),
          payload: { participantId: input.participantId, sessionId },
          type: 'dm_set_current_turn_participant',
        });
      });
    },

    setCurrentTurnCombatant(input: { combatantId: string }): Promise<void> {
      return ctx.run('dm_set_current_turn_participant', () => {
        const sessionId = ctx.requireSessionId();

        if (!input.combatantId) {
          throw new Error('Select a monster/NPC combatant first.');
        }

        return runDmEncounterCommand({
          actor: { participantId: ctx.getActors().dm },
          commandId: createCommandId('dm-current-turn-combatant'),
          payload: { combatantId: input.combatantId, sessionId },
          type: 'dm_set_current_turn_participant',
        });
      });
    },

    setCurrentTurnUsage(input: { turnUsage: TurnUsageDraft }): Promise<void> {
      return ctx.run('dm_set_current_turn_usage', () => {
        const sessionId = ctx.requireSessionId();

        return runDmEncounterCommand({
          actor: { participantId: ctx.getActors().dm },
          commandId: createCommandId('dm-turn-usage'),
          payload: { sessionId, turnUsage: input.turnUsage },
          type: 'dm_set_current_turn_usage',
        });
      });
    },

    endEncounter(): Promise<void> {
      return ctx.run('dm_end_active_encounter', () => {
        const sessionId = ctx.requireSessionId();

        return runDmEncounterCommand({
          actor: { participantId: ctx.getActors().dm },
          commandId: createCommandId('dm-end-encounter'),
          payload: { sessionId },
          type: 'dm_end_active_encounter',
        });
      });
    },

    setCharacterCurrentHp(input: {
      currentHp: number;
      target: CharacterTarget;
    }): Promise<void> {
      return ctx.run('dm_set_character_current_hp', async () => {
        const sessionId = ctx.requireSessionId();
        const response = await ctx.unwrap(
          'dm_set_character_current_hp',
          sendDm({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-hp'),
            payload: {
              characterId: input.target.characterId,
              currentHp: Number.isFinite(input.currentHp) ? input.currentHp : 0,
              participantId: input.target.participantId,
              sessionId,
            },
            type: 'dm_set_character_current_hp',
          }),
        );

        ctx.store.rememberCharacter(
          requireCharacterResponse('dm_set_character_current_hp', response),
        );

        return response;
      });
    },

    /**
     * Replace a character's whole condition list.
     *
     * Replacement rather than toggle is the command the server offers, and
     * building the next list from the authoritative one is what makes applying
     * the same condition twice a no-op instead of two stacked entries.
     */
    setCharacterConditions(input: {
      activeConditions: string[];
      target: CharacterTarget;
    }): Promise<void> {
      return ctx.run('dm_set_character_active_conditions', async () => {
        const sessionId = ctx.requireSessionId();
        const response = await ctx.unwrap(
          'dm_set_character_active_conditions',
          sendDm({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-conditions'),
            payload: {
              activeConditions: input.activeConditions,
              characterId: input.target.characterId,
              participantId: input.target.participantId,
              sessionId,
            },
            type: 'dm_set_character_active_conditions',
          }),
        );

        ctx.store.rememberCharacter(
          requireCharacterResponse(
            'dm_set_character_active_conditions',
            response,
          ),
        );

        return response;
      });
    },
  };
}

export type EncounterCommands = ReturnType<typeof createEncounterCommands>;
