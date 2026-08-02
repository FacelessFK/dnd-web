/**
 * Monsters and NPCs: the creatures the GM owns outright.
 *
 * Concealment lives here rather than in a visibility helper on purpose. It goes
 * through the authoritative command and the panel then renders the scene the
 * server returned, so a player's copy changes because their next projection is
 * different - not because this browser drew it differently. A client that
 * received every creature and hid some at render time would be one devtools tab
 * away from omniscience, which is the whole reason concealment is a server
 * concern.
 */
import {
  combatantInputFromDraft,
  type Cell,
  type CombatantDraftForm,
} from './runtime-cockpit-helpers';
import { createCommandId, sendDmCommand } from './runtime-api';
import {
  assertDraftValid,
  requireSceneResponse,
  type RuntimeCommandContext,
} from './runtime-command-runner';

export type CombatantCommandTransport = {
  sendDmCommand: typeof sendDmCommand;
};

export const defaultCombatantCommandTransport: CombatantCommandTransport = {
  sendDmCommand,
};

export function createCombatantCommands(
  ctx: RuntimeCommandContext,
  transport: CombatantCommandTransport = defaultCombatantCommandTransport,
) {
  const { sendDmCommand: send } = transport;

  function requireCombatantId(combatantId: string): string {
    if (!combatantId) {
      throw new Error('Select a monster/NPC combatant first.');
    }

    return combatantId;
  }

  /** Every combatant mutation answers with the scene; that answer is the map. */
  async function mutate(
    label: string,
    build: (sessionId: string) => Parameters<typeof send>[0],
  ) {
    const sessionId = ctx.requireSessionId();
    const response = await ctx.unwrap(label, send(build(sessionId)));

    ctx.store.rememberScene(requireSceneResponse(label, response));

    return response;
  }

  return {
    createCombatant(input: {
      cell: Cell;
      draft: CombatantDraftForm;
      errors: string[];
    }): Promise<void> {
      return ctx.run('dm_create_combatant_in_active_scene', () => {
        assertDraftValid('Fix the combatant draft first', input.errors);

        return mutate('dm_create_combatant_in_active_scene', (sessionId) => ({
          actor: { participantId: ctx.getActors().dm },
          commandId: createCommandId('dm-create-combatant'),
          payload: {
            combatant: combatantInputFromDraft(input.draft, input.cell),
            sessionId,
          },
          type: 'dm_create_combatant_in_active_scene',
        }));
      });
    },

    repositionCombatant(input: {
      cell: Cell;
      combatantId: string;
    }): Promise<void> {
      return ctx.run('dm_reposition_combatant_in_active_scene', () =>
        mutate('dm_reposition_combatant_in_active_scene', (sessionId) => ({
          actor: { participantId: ctx.getActors().dm },
          commandId: createCommandId('dm-reposition-combatant'),
          payload: {
            combatantId: requireCombatantId(input.combatantId),
            position: input.cell,
            sessionId,
          },
          type: 'dm_reposition_combatant_in_active_scene',
        })),
      );
    },

    setCombatantHp(input: {
      combatantId: string;
      currentHp: string;
    }): Promise<void> {
      return ctx.run('dm_set_combatant_current_hp', () =>
        mutate('dm_set_combatant_current_hp', (sessionId) => ({
          actor: { participantId: ctx.getActors().dm },
          commandId: createCommandId('dm-combatant-hp'),
          payload: {
            combatantId: requireCombatantId(input.combatantId),
            currentHp: Number.parseInt(input.currentHp, 10),
            sessionId,
          },
          type: 'dm_set_combatant_current_hp',
        })),
      );
    },

    setCombatantHidden(input: {
      combatantId: string;
      hidden: boolean;
    }): Promise<void> {
      return ctx.run('dm_set_combatant_hidden', () =>
        mutate('dm_set_combatant_hidden', (sessionId) => ({
          actor: { participantId: ctx.getActors().stream },
          commandId: createCommandId('m1-combatant-hidden'),
          payload: {
            combatantId: input.combatantId,
            hidden: input.hidden,
            sessionId,
          },
          type: 'dm_set_combatant_hidden',
        })),
      );
    },

    combatantAttack(input: {
      combatantId: string;
      targetParticipantId: string;
    }): Promise<void> {
      return ctx.run('dm_combatant_attack', async () => {
        const sessionId = ctx.requireSessionId();
        const response = await ctx.unwrap(
          'dm_combatant_attack',
          send({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-combatant-attack'),
            payload: {
              combatantId: requireCombatantId(input.combatantId),
              sessionId,
              targetParticipantId: input.targetParticipantId,
            },
            type: 'dm_combatant_attack',
          }),
        );

        if ('encounter' in response.data) {
          ctx.store.applyEncounter(response.data.encounter);
        }

        return response;
      });
    },
  };
}

export type CombatantCommands = ReturnType<typeof createCombatantCommands>;
