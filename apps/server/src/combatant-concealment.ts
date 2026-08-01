/**
 * Flipping the `hidden` flag on one combatant in a scene.
 *
 * A one-field change, kept out of the runtime for two reasons. It has to be
 * addressable by a test that never builds a session, and it has to answer
 * "did anything actually change?" - which is what makes concealing an already
 * concealed combatant a no-op instead of a pointless scene write and a
 * pointless event.
 *
 * Concealment is never copied onto the encounter. Every read derives it from
 * the scene through `collectConcealedCombatantIds`, so a reveal takes effect on
 * the next projection with nothing to invalidate.
 */
import type { Scene, SceneEntity, SceneEntityId } from '@dnd/shared';

export type CombatantConcealmentChange = {
  scene: Scene;
  changed: boolean;
};

export function findSceneCombatant(
  scene: Scene,
  combatantId: SceneEntityId,
): SceneEntity | undefined {
  const entity = scene.entities.find(
    (candidate) => candidate.id === combatantId,
  );

  return entity?.combatant ? entity : undefined;
}

export function withCombatantHidden(
  scene: Scene,
  combatantId: SceneEntityId,
  hidden: boolean,
): CombatantConcealmentChange {
  const entity = findSceneCombatant(scene, combatantId);

  if (!entity || entity.hidden === hidden) {
    return { changed: false, scene };
  }

  return {
    changed: true,
    scene: {
      ...scene,
      entities: scene.entities.map((candidate) =>
        candidate.id === combatantId ? { ...candidate, hidden } : candidate,
      ),
    },
  };
}
