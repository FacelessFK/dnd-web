/**
 * The stance a live runtime actor rolls an attack under.
 *
 * `@dnd/rules` already knows what a condition does to a d20. What was missing is
 * the seam between that knowledge and the authoritative attack path: the attack
 * command read the attacker's character sheet and never looked at the conditions
 * hanging off their encounter overlay, so `poisoned` decorated the UI without
 * ever changing a die.
 *
 * This module is that seam, and it is deliberately one function. Conditions are
 * one source of stance among several the product will grow - cover, prone
 * targets, help actions - so the shape takes a list of additional sources
 * rather than assuming conditions are the only input. Folding is still the
 * rules package's job: advantage and disadvantage cancel, and duplicates of the
 * same source collapse, which is what stops a character tagged `poisoned` twice
 * from rolling a third die.
 */
import {
  collectConditionStanceSources,
  combineStances,
  type StanceContribution,
} from '@dnd/rules';
import type { ResolutionKind, RollStance } from '@dnd/shared';

export type DerivedStance = {
  stance: RollStance;
  sources: StanceContribution[];
};

export function deriveRuntimeStance(params: {
  kind: ResolutionKind;
  activeConditions: readonly string[];
  /**
   * Stances from anywhere other than the actor's conditions. Empty today for
   * attacks; a GM-requested stance already arrives this way for checks and
   * saves, and it is what proves the cancellation rule holds in the runtime and
   * not only in the pure helper.
   */
  additionalStanceSources?: readonly StanceContribution[];
}): DerivedStance {
  const sources: StanceContribution[] = [
    ...(params.additionalStanceSources ?? []),
    ...collectConditionStanceSources(params.activeConditions, params.kind),
  ];

  return {
    sources,
    stance: combineStances(sources.map((source) => source.stance)),
  };
}
