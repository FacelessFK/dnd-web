/**
 * Normalizing what a character is trained in.
 *
 * Two jobs, both boring and both load-bearing. A stored character always has a
 * `proficiencies` object, so nothing downstream has to distinguish "trained in
 * nothing" from "never recorded" - and a record written before the field
 * existed reads as the former rather than crashing a projection.
 *
 * And the lists are de-duplicated and ordered. `isProficient` only asks whether
 * a skill is present, so a duplicate changes no maths; what it changes is the
 * audit, where the same character could otherwise be stored two different ways
 * and compare unequal after a round trip through the database.
 */
import { abilityKeys, skillIds } from '@dnd/shared';
import type { AbilityKey, CharacterProficiencies, SkillId } from '@dnd/shared';

export function normalizeCharacterProficiencies(
  proficiencies?: Partial<CharacterProficiencies>,
): CharacterProficiencies {
  return {
    savingThrows: orderedUnique(
      proficiencies?.savingThrows ?? [],
      abilityKeys,
    ) as AbilityKey[],
    skills: orderedUnique(proficiencies?.skills ?? [], skillIds) as SkillId[],
  };
}

/**
 * Keeps the canonical declaration order rather than insertion order, so two
 * characters trained in the same things serialize identically.
 */
function orderedUnique<T extends string>(
  values: readonly T[],
  canonicalOrder: readonly T[],
): T[] {
  const present = new Set(values);

  return canonicalOrder.filter((candidate) => present.has(candidate));
}
