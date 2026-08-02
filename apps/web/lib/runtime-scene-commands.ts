/**
 * Scene authoring: maps, passive entities, and the transitions between them.
 *
 * Every mutation here answers with the whole scene the server now holds, and
 * that answer replaces the client's copy. Nothing patches the map locally - a
 * client that edited its own entity list would drift from the authority the
 * moment two GMs worked the same table, and worse, would be deciding what is on
 * a map rather than rendering what it was told.
 *
 * All of these are GM-only. The gate is server-side; passing the DM's
 * participant ID here is how the command identifies itself, not how it is
 * authorised.
 */
import {
  type Cell,
  sceneEntityInputFromDraft,
  sceneEntityUpdateInputFromDraft,
  sceneInputFromDraft,
  sceneTransitionInputFromDraft,
  sceneTransitionUpdateInputFromDraft,
  type SceneDraftForm,
  type SceneEntityDraftForm,
  type SceneTransitionDraftForm,
} from './runtime-cockpit-helpers';
import { createCommandId, sendSceneCommand } from './runtime-api';
import {
  assertDraftValid,
  requireSceneResponse,
  type RuntimeCommandContext,
} from './runtime-command-runner';

export type SceneCommandTransport = {
  sendSceneCommand: typeof sendSceneCommand;
};

export const defaultSceneCommandTransport: SceneCommandTransport = {
  sendSceneCommand,
};

/**
 * Which scene an authoring command applies to.
 *
 * The caller passes both the loaded scene's ID and the session's active scene
 * ID: a GM editing a map they have open but not activated is ordinary, so the
 * loaded one wins and the active one is the fallback after a recovery that
 * restored the session before the map.
 */
export type SceneTarget = {
  activeSceneId: string;
  loadedSceneId: string | null;
};

function requireSceneId(target: SceneTarget, action: string): string {
  const sceneId = target.loadedSceneId ?? target.activeSceneId;

  if (!sceneId) {
    throw new Error(`Create, activate, or recover a scene before ${action}.`);
  }

  return sceneId;
}

export function createSceneCommands(
  ctx: RuntimeCommandContext,
  transport: SceneCommandTransport = defaultSceneCommandTransport,
) {
  const { sendSceneCommand: send } = transport;

  async function createScene(input: {
    commandScope: string;
    label: string;
    scene: ReturnType<typeof sceneInputFromDraft>;
  }) {
    const sessionId = ctx.requireSessionId();
    const response = await ctx.unwrap(
      'create_scene',
      send({
        actor: { participantId: ctx.getActors().dm },
        commandId: createCommandId(input.commandScope),
        payload: { scene: input.scene, sessionId },
        type: 'create_scene',
      }),
    );

    const scene = requireSceneResponse('create_scene', response);
    ctx.store.rememberScene(scene);

    return { response, scene };
  }

  /**
   * Activate a scene, then read it back.
   *
   * The activation response carries the session snapshot but not the map, and
   * the snapshot alone would leave the board showing whatever was there before.
   * The follow-up read is what makes activation visibly change the table.
   */
  async function activateScene(sceneId: string) {
    const sessionId = ctx.requireSessionId();
    const activated = await ctx.unwrap(
      'activate_scene_for_session',
      send({
        actor: { participantId: ctx.getActors().dm },
        commandId: createCommandId('dm-activate-scene'),
        payload: { sceneId, sessionId },
        type: 'activate_scene_for_session',
      }),
    );

    if (!('state' in activated.data)) {
      throw new Error(
        'activate_scene_for_session returned a non-activation response.',
      );
    }

    ctx.store.applySessionSnapshot(activated.data.state);

    const read = await ctx.unwrap(
      'get_scene',
      send({
        actor: { participantId: ctx.getActors().dm },
        commandId: createCommandId('dm-get-activated-scene'),
        payload: { sceneId, sessionId },
        type: 'get_scene',
      }),
    );

    if ('scene' in read.data) {
      ctx.store.rememberScene(read.data.scene);
    }

    return { activated, read };
  }

  /** One shape for every entity or transition edit: mutate, then take the scene. */
  async function mutateScene(input: {
    build: (sessionId: string, sceneId: string) => Parameters<typeof send>[0];
    label: string;
    target: SceneTarget;
  }) {
    const sessionId = ctx.requireSessionId();
    const sceneId = requireSceneId(input.target, input.label);
    const response = await ctx.unwrap(
      input.label,
      send(input.build(sessionId, sceneId)),
    );

    ctx.store.rememberScene(requireSceneResponse(input.label, response));

    return response;
  }

  return {
    activateSelectedScene(input: { sceneId: string }): Promise<void> {
      return ctx.run('activate selected scene', async () => {
        const sceneId = input.sceneId.trim();

        if (!sceneId) {
          throw new Error('Enter or create a scene ID to activate.');
        }

        return activateScene(sceneId);
      });
    },

    createAndActivateScene(input: {
      scene: ReturnType<typeof sceneInputFromDraft>;
    }): Promise<void> {
      return ctx.run('create and activate scene', async () => {
        const created = await createScene({
          commandScope: 'create-scene',
          label: 'create_scene',
          scene: input.scene,
        });
        const activated = await activateScene(created.scene.id);

        return { activated, created: created.response };
      });
    },

    createCustomScene(input: {
      draft: SceneDraftForm;
      errors: string[];
    }): Promise<void> {
      return ctx.run('create custom scene', async () => {
        assertDraftValid('Fix the scene draft first', input.errors);

        const created = await createScene({
          commandScope: 'dm-create-custom-scene',
          label: 'create_scene',
          scene: sceneInputFromDraft(input.draft),
        });

        return created.response;
      });
    },

    placeSceneEntity(input: {
      cell: Cell;
      draft: SceneEntityDraftForm;
      errors: string[];
      target: SceneTarget;
    }): Promise<void> {
      return ctx.run('place scene entity', () => {
        assertDraftValid('Fix the entity draft first', input.errors);

        return mutateScene({
          build: (sessionId, sceneId) => ({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-place-scene-entity'),
            payload: {
              entity: sceneEntityInputFromDraft(input.draft, input.cell),
              sceneId,
              sessionId,
            },
            type: 'place_entity_in_scene',
          }),
          label: 'place_entity_in_scene',
          target: input.target,
        });
      });
    },

    updateSceneEntity(input: {
      draft: SceneEntityDraftForm;
      entityId: string;
      errors: string[];
      target: SceneTarget;
    }): Promise<void> {
      return ctx.run('update scene entity', () => {
        assertDraftValid('Fix the entity edit form first', input.errors);

        if (!input.entityId) {
          throw new Error('Select a passive scene entity to update.');
        }

        return mutateScene({
          build: (sessionId, sceneId) => ({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-update-scene-entity'),
            payload: {
              entity: sceneEntityUpdateInputFromDraft(input.draft),
              entityId: input.entityId,
              sceneId,
              sessionId,
            },
            type: 'update_scene_entity',
          }),
          label: 'update_scene_entity',
          target: input.target,
        });
      });
    },

    repositionSceneEntity(input: {
      cell: Cell;
      entityId: string;
      target: SceneTarget;
    }): Promise<void> {
      return ctx.run('reposition scene entity', () => {
        if (!input.entityId) {
          throw new Error('Select a passive scene entity to reposition.');
        }

        return mutateScene({
          build: (sessionId, sceneId) => ({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-reposition-scene-entity'),
            payload: {
              entityId: input.entityId,
              position: input.cell,
              sceneId,
              sessionId,
            },
            type: 'reposition_scene_entity',
          }),
          label: 'reposition_scene_entity',
          target: input.target,
        });
      });
    },

    deleteSceneEntity(input: {
      entityId: string;
      target: SceneTarget;
    }): Promise<void> {
      return ctx.run('delete scene entity', () => {
        if (!input.entityId) {
          throw new Error('Select a passive scene entity to delete.');
        }

        return mutateScene({
          build: (sessionId, sceneId) => ({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-delete-scene-entity'),
            payload: { entityId: input.entityId, sceneId, sessionId },
            type: 'delete_scene_entity',
          }),
          label: 'delete_scene_entity',
          target: input.target,
        });
      });
    },

    createSceneTransition(input: {
      cell: Cell;
      draft: SceneTransitionDraftForm;
      errors: string[];
      target: SceneTarget;
    }): Promise<void> {
      return ctx.run('create scene transition', () => {
        assertDraftValid('Fix the transition draft first', input.errors);

        return mutateScene({
          build: (sessionId, sceneId) => ({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-create-scene-transition'),
            payload: {
              sceneId,
              sessionId,
              transition: sceneTransitionInputFromDraft(
                input.draft,
                input.cell,
              ),
            },
            type: 'create_scene_transition',
          }),
          label: 'create_scene_transition',
          target: input.target,
        });
      });
    },

    updateSceneTransition(input: {
      draft: SceneTransitionDraftForm;
      errors: string[];
      target: SceneTarget;
      transitionId: string;
    }): Promise<void> {
      return ctx.run('update scene transition', () => {
        assertDraftValid('Fix the transition edit form first', input.errors);

        if (!input.transitionId) {
          throw new Error('Select a scene transition to update.');
        }

        return mutateScene({
          build: (sessionId, sceneId) => ({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-update-scene-transition'),
            payload: {
              sceneId,
              sessionId,
              transition: sceneTransitionUpdateInputFromDraft(input.draft),
              transitionId: input.transitionId,
            },
            type: 'update_scene_transition',
          }),
          label: 'update_scene_transition',
          target: input.target,
        });
      });
    },

    deleteSceneTransition(input: {
      target: SceneTarget;
      transitionId: string;
    }): Promise<void> {
      return ctx.run('delete scene transition', () => {
        if (!input.transitionId) {
          throw new Error('Select a scene transition to delete.');
        }

        return mutateScene({
          build: (sessionId, sceneId) => ({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-delete-scene-transition'),
            payload: {
              sceneId,
              sessionId,
              transitionId: input.transitionId,
            },
            type: 'delete_scene_transition',
          }),
          label: 'delete_scene_transition',
          target: input.target,
        });
      });
    },

    /**
     * Walk a transition: the table moves to the destination scene.
     *
     * Unlike the edits above, this changes which scene is active, so it takes
     * the session snapshot and then reads the *destination* - the ID of which
     * only the response knows.
     */
    activateSceneTransition(input: {
      target: SceneTarget;
      transitionId: string;
    }): Promise<void> {
      return ctx.run('activate scene transition', async () => {
        const sessionId = ctx.requireSessionId();
        const sceneId = requireSceneId(input.target, 'activating a transition');

        if (!input.transitionId) {
          throw new Error('Select a scene transition to activate.');
        }

        const activated = await ctx.unwrap(
          'activate_scene_transition',
          send({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-activate-scene-transition'),
            payload: { sceneId, sessionId, transitionId: input.transitionId },
            type: 'activate_scene_transition',
          }),
        );

        if (!('state' in activated.data) || !('sceneId' in activated.data)) {
          throw new Error(
            'activate_scene_transition returned a non-activation response.',
          );
        }

        ctx.store.applySessionSnapshot(activated.data.state);

        const read = await ctx.unwrap(
          'get_scene',
          send({
            actor: { participantId: ctx.getActors().dm },
            commandId: createCommandId('dm-get-transition-target-scene'),
            payload: { sceneId: activated.data.sceneId, sessionId },
            type: 'get_scene',
          }),
        );

        if ('scene' in read.data) {
          ctx.store.rememberScene(read.data.scene);
        }

        return { activated, scene: read };
      });
    },
  };
}

export type SceneCommands = ReturnType<typeof createSceneCommands>;
