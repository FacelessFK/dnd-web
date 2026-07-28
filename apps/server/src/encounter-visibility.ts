/**
 * Role projection for the two encounter surfaces that reach a client.
 *
 * `projectEncounterForRole` and `collectConcealedCombatantIds` live in
 * `@dnd/rules` beside `projectSceneForRole`, because `Encounter` is a shared
 * domain type. `CombatEvent` is a wire/stream type with no domain counterpart,
 * so its projection lives here instead of widening the shared package.
 *
 * The rule these enforce is the same one `projectSceneForRole` enforces: the DM
 * is omniscient by product rule and players are not, and anything the server
 * sends is readable by that client no matter what the UI draws.
 */
import type { CombatEvent } from '@dnd/protocol';
import type { ParticipantRole, SceneEntityId } from '@dnd/shared';

/**
 * A combat event as a given role is allowed to perceive it.
 *
 * Two distinct things are withheld when a concealed combatant is involved:
 *
 *  - its `combatantId`, which is the scene entity ID a player could correlate
 *    across rounds and against map data to count and track hidden creatures;
 *  - its health, when it is the target. HP is the one field that leaks how much
 *    of a creature is left, and a player who cannot see it should not be
 *    tracking its health bar.
 *
 * The event itself is still delivered. A player being attacked by something
 * unseen must still learn that they were attacked, what was rolled, and what it
 * did to them - that is the attack landing, not concealed information. The
 * `attackerConcealed` / `targetConcealed` markers let the UI say "something you
 * cannot see" rather than rendering an empty label.
 *
 * `targetArmorClass` is deliberately retained even for a concealed target: it
 * is already implied by whether the reported roll hit.
 */
export function projectCombatEventForRole(
  event: CombatEvent,
  role: ParticipantRole,
  concealedCombatantIds: ReadonlySet<SceneEntityId>,
): CombatEvent {
  if (role === 'dm' || concealedCombatantIds.size === 0) {
    return event;
  }

  const attackerConcealed =
    event.attackerCombatantId !== undefined &&
    concealedCombatantIds.has(event.attackerCombatantId);
  const targetConcealed =
    event.targetCombatantId !== undefined &&
    concealedCombatantIds.has(event.targetCombatantId);

  if (!attackerConcealed && !targetConcealed) {
    return event;
  }

  const projected: CombatEvent = { ...event };

  if (attackerConcealed) {
    delete projected.attackerCombatantId;
    projected.attackerConcealed = true;
  }

  if (targetConcealed) {
    delete projected.targetCombatantId;
    delete projected.targetHp;
    projected.targetConcealed = true;
  }

  return projected;
}
