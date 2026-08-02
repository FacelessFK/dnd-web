/**
 * Conditions, in the reader's language.
 *
 * `activeConditions` is a free-form string array in the protocol - `max(50)` of
 * `max(128)` characters, not a closed enum - and the runtime rendered it by
 * calling `.join(', ')`. That put `poisoned` on a Persian screen inside an RTL
 * layout in three places: the event feed, the character summary and the M1 GM
 * panel. Same class of defect as a raw participant ID reaching the feed, one
 * vocabulary over.
 *
 * The free-form shape is why this is not a plain lookup table. Two different
 * kinds of value arrive through the same field:
 *
 *  - a **canonical condition**, which is one of the fifteen the 2014 rules
 *    name. These are protocol vocabulary. They have a correct translation and
 *    must never be shown untranslated.
 *  - **whatever a GM typed**, because the combatant draft accepts free text.
 *    That is authored content. Translating it would be wrong, and so would
 *    hiding it - the GM wrote it to be read.
 *
 * So the rule is about shape, not about membership. A value that looks like
 * protocol vocabulary - lowercase, no spaces, machine-shaped - is treated as
 * such: known ones are translated, and an unknown one gets a generic label
 * rather than leaking a key this build does not recognise. A value that looks
 * like prose passes through untouched, because it is.
 */
import type { MessageKey } from './i18n';
import type { RuntimeTranslator } from './runtime-localization';

/**
 * The 2014 condition vocabulary.
 *
 * Listed rather than derived, because the protocol does not constrain the field
 * and there is nothing to derive it from. Exhaustion appears without its level:
 * levels are M7's problem and nothing in the runtime sets one.
 */
export const CANONICAL_CONDITION_IDS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;

export type CanonicalConditionId = (typeof CANONICAL_CONDITION_IDS)[number];

const canonicalConditions = new Set<string>(CANONICAL_CONDITION_IDS);

/**
 * Whether a value is shaped like protocol vocabulary rather than like prose.
 *
 * `poisoned` and `blinded_by_light` are machine-shaped; `Blinded by the flash`
 * is something a person wrote. The distinction is what lets one function
 * translate the first kind and leave the second alone - and it is deliberately
 * about form, because membership cannot answer it: a value this build has never
 * heard of may still be protocol vocabulary from a newer server.
 */
export function looksLikeConditionId(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value.trim());
}

export function isCanonicalConditionId(value: string): boolean {
  return canonicalConditions.has(value.trim().toLowerCase());
}

export function conditionMessageKey(id: CanonicalConditionId): MessageKey {
  return `runtime.condition.${id}` as MessageKey;
}

/**
 * One condition, as a person should read it.
 *
 * An unrecognised machine-shaped value becomes "an unknown condition" rather
 * than its key. That loses a word, and the word it loses is one no reader could
 * have used: a key this build cannot translate is a key it cannot explain
 * either, and diagnostics still carries the canonical value for whoever is
 * debugging.
 */
export function localizeConditionLabel(
  value: string,
  t: RuntimeTranslator,
): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (isCanonicalConditionId(trimmed)) {
    return t(
      conditionMessageKey(trimmed.toLowerCase() as CanonicalConditionId),
    );
  }

  if (looksLikeConditionId(trimmed)) {
    return t('runtime.condition.unknown');
  }

  // Authored by a GM, in their own words. Never translated, never replaced.
  return trimmed;
}

/**
 * A condition list as one readable phrase.
 *
 * The separator is localized too: Persian uses the Arabic comma, and joining
 * with `', '` was the other half of what made these lists read as English
 * inside an RTL layout.
 */
export function localizeConditionList(
  values: readonly string[] | undefined,
  t: RuntimeTranslator,
): string {
  const labels = (values ?? [])
    .map((value) => localizeConditionLabel(value, t))
    .filter(Boolean);

  return labels.join(t('runtime.condition.separator'));
}
