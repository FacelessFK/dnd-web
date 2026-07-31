/**
 * Ability checks, saving throws, and the mechanical effect of conditions.
 *
 * Pure: no network, no database, no UI, and no `Math.random`. Every d20 enters
 * through an injected roller so a test can pin the dice and a command handler
 * can supply the session's own source of randomness.
 *
 * The output is a breakdown, not a sentence. Callers assemble the wire record
 * from it; the browser renders that record and never recomputes a total.
 */
import { mechanicalConditions } from '@dnd/shared';
import type {
  AbilityKey,
  AbilityScores,
  MechanicalCondition,
  ModifierSourceKind,
  ResolutionKind,
  RollStance,
} from '@dnd/shared';

import {
  calculateAbilityModifier,
  calculateProficiencyBonus,
} from './index.js';

export type ModifierContribution = {
  kind: ModifierSourceKind;
  detail?: string;
  value: number;
};

export type StanceContribution = {
  kind: 'condition' | 'gm_request';
  detail?: string;
  stance: RollStance;
};

export type D20Outcome = {
  dice: number[];
  selectedDie: number;
  stance: RollStance;
};

export type ResolutionBreakdown = D20Outcome & {
  kind: ResolutionKind;
  ability: AbilityKey;
  skill?: string;
  stanceSources: StanceContribution[];
  modifiers: ModifierContribution[];
  modifierTotal: number;
  total: number;
  dc?: number;
  success?: boolean;
  critical: boolean;
  criticalMiss: boolean;
};

export function isMechanicalCondition(
  condition: string,
): condition is MechanicalCondition {
  return (mechanicalConditions as readonly string[]).includes(condition);
}

/**
 * Fold every stance contribution into the one that applies.
 *
 * 5e does not stack: any number of sources granting advantage and any number
 * imposing disadvantage cancel to a normal roll, and two sources of the same
 * kind are still just that kind. Counting occurrences instead of tracking
 * presence is the bug this prevents - applying `poisoned` twice must not roll
 * three dice or double a penalty.
 */
export function combineStances(stances: readonly RollStance[]): RollStance {
  const hasAdvantage = stances.includes('advantage');
  const hasDisadvantage = stances.includes('disadvantage');

  if (hasAdvantage === hasDisadvantage) {
    return 'normal';
  }

  return hasAdvantage ? 'advantage' : 'disadvantage';
}

/**
 * The stance a set of active conditions imposes on one kind of roll.
 *
 * `poisoned` (2014 PHB) gives disadvantage on attack rolls and ability checks.
 * Saving throws are deliberately untouched - that is the rule, and a saving
 * throw silently inheriting it would be a mechanical bug the audit record would
 * then justify with a source that should not be there.
 *
 * Duplicates in `activeConditions` collapse, because the set of distinct
 * conditions is what matters.
 */
export function collectConditionStanceSources(
  activeConditions: readonly string[],
  kind: ResolutionKind,
): StanceContribution[] {
  const distinct = [...new Set(activeConditions)].filter(isMechanicalCondition);

  return distinct.flatMap<StanceContribution>((condition) => {
    if (condition !== 'poisoned') {
      return [];
    }

    if (kind !== 'ability_check' && kind !== 'attack_roll') {
      return [];
    }

    return [{ kind: 'condition', detail: condition, stance: 'disadvantage' }];
  });
}

/**
 * Roll a d20 under a stance.
 *
 * Advantage and disadvantage roll two dice and keep the higher or lower. Both
 * faces are reported so the UI can show the die that was discarded, which is
 * most of what makes a stance legible at the table.
 */
export function rollD20WithStance(params: {
  stance: RollStance;
  roller: () => number;
}): D20Outcome {
  const first = requireD20Face(params.roller());

  if (params.stance === 'normal') {
    return { dice: [first], selectedDie: first, stance: params.stance };
  }

  const second = requireD20Face(params.roller());
  const selectedDie =
    params.stance === 'advantage'
      ? Math.max(first, second)
      : Math.min(first, second);

  return { dice: [first, second], selectedDie, stance: params.stance };
}

function requireD20Face(face: number): number {
  if (!Number.isInteger(face) || face < 1 || face > 20) {
    throw new RangeError('D20 roller must return an integer from 1 to 20.');
  }

  return face;
}

export type CheckActor = {
  abilities: AbilityScores;
  level: number;
  activeConditions?: readonly string[];
  /** Ability and skill proficiencies the character actually has. */
  proficientAbilities?: readonly AbilityKey[];
  proficientSkills?: readonly string[];
};

/**
 * Resolve an ability check or a saving throw.
 *
 * A tie against the DC succeeds: 5e compares "equals or exceeds", and getting
 * this backwards silently fails every roll that lands exactly on the number.
 */
export function resolveAbilityResolution(params: {
  kind: Extract<ResolutionKind, 'ability_check' | 'saving_throw'>;
  ability: AbilityKey;
  skill?: string;
  dc: number;
  actor: CheckActor;
  /** Stance the GM asked for, before conditions are considered. */
  requestedStance?: RollStance;
  roller: () => number;
}): ResolutionBreakdown {
  const conditionStances = collectConditionStanceSources(
    params.actor.activeConditions ?? [],
    params.kind,
  );
  const requested = params.requestedStance ?? 'normal';
  const stanceSources: StanceContribution[] = [
    ...(requested === 'normal'
      ? []
      : [{ kind: 'gm_request' as const, stance: requested }]),
    ...conditionStances,
  ];
  const stance = combineStances(stanceSources.map((source) => source.stance));
  const outcome = rollD20WithStance({ roller: params.roller, stance });

  const modifiers: ModifierContribution[] = [
    {
      kind: 'ability',
      detail: params.ability,
      value: calculateAbilityModifier(params.actor.abilities[params.ability]),
    },
  ];

  if (isProficient(params)) {
    modifiers.push({
      kind: 'proficiency',
      ...(params.skill ? { detail: params.skill } : {}),
      value: calculateProficiencyBonus(params.actor.level),
    });
  }

  const modifierTotal = modifiers.reduce(
    (running, modifier) => running + modifier.value,
    0,
  );
  const total = outcome.selectedDie + modifierTotal;

  return {
    ...outcome,
    kind: params.kind,
    ability: params.ability,
    ...(params.skill ? { skill: params.skill } : {}),
    stanceSources,
    modifiers,
    modifierTotal,
    total,
    dc: params.dc,
    success: total >= params.dc,
    // Checks and saves have no critical rule in 5e; the flags stay false so the
    // shared record shape does not imply one.
    critical: false,
    criticalMiss: false,
  };
}

function isProficient(params: {
  ability: AbilityKey;
  skill?: string;
  actor: CheckActor;
}): boolean {
  if (params.skill) {
    return (params.actor.proficientSkills ?? []).includes(params.skill);
  }

  return (params.actor.proficientAbilities ?? []).includes(params.ability);
}
