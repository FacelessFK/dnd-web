import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BACKGROUNDS } from '../app/characters/simple-builder/data/backgrounds';
import { CLASSES } from '../app/characters/simple-builder/data/classes';
import {
  LANGUAGE_DESCRIPTIONS,
  getLanguageDescription,
} from '../app/characters/simple-builder/data/languages';
import { RACES } from '../app/characters/simple-builder/data/races';
import { ALL_SKILLS } from '../app/characters/simple-builder/data/skills';
import {
  resolveBuilderPhraseFa,
  resolveBuilderTaglineFa,
} from '../app/characters/simple-builder/localization';

// Persian is the default locale, and the builder translates its SRD-style
// content through a phrase book keyed on the English source string. A missing
// entry is invisible at build time: `phrase()` falls back to the English input,
// so an untranslated trait renders as English text inside an RTL Persian panel
// rather than failing. That is the opposite of how `messages` works, where
// `type Messages = typeof messages.en` makes a missing `fa` key a type error.
//
// This test closes that gap for the data files. It only covers strings that are
// actually rendered through the translator - `ideals`, `bonds`, and `flaws` are
// declared on `Background` but never read by any component, so translating them
// would be dead work.

type Phrase = {
  context: string;
  value: string;
};

function collectRacePhrases(): Phrase[] {
  const phrases: Phrase[] = [];

  for (const race of RACES) {
    const where = `race/${race.id}`;

    phrases.push(
      { context: `${where}.name`, value: race.name },
      { context: `${where}.size`, value: race.size },
    );

    for (const language of race.languages) {
      phrases.push({ context: `${where}.languages`, value: language });
    }

    for (const trait of race.traits) {
      phrases.push(
        { context: `${where}.traits.name`, value: trait.name },
        { context: `${where}.traits.description`, value: trait.description },
      );
    }

    for (const subrace of race.subraces ?? []) {
      const subWhere = `${where}/${subrace.id}`;

      phrases.push(
        { context: `${subWhere}.name`, value: subrace.name },
        { context: `${subWhere}.description`, value: subrace.description },
      );

      for (const language of subrace.languages ?? []) {
        phrases.push({ context: `${subWhere}.languages`, value: language });
      }

      for (const trait of subrace.traits) {
        phrases.push(
          { context: `${subWhere}.traits.name`, value: trait.name },
          {
            context: `${subWhere}.traits.description`,
            value: trait.description,
          },
        );
      }
    }
  }

  return phrases;
}

function collectClassPhrases(): Phrase[] {
  const phrases: Phrase[] = [];

  for (const dndClass of CLASSES) {
    const where = `class/${dndClass.id}`;

    phrases.push(
      { context: `${where}.name`, value: dndClass.name },
      { context: `${where}.primaryAbility`, value: dndClass.primaryAbility },
    );

    const proficiencyLists = [
      ['armorProficiencies', dndClass.armorProficiencies],
      ['weaponProficiencies', dndClass.weaponProficiencies],
      ['toolProficiencies', dndClass.toolProficiencies],
      ['equipment', dndClass.equipment],
    ] as const;

    for (const [field, values] of proficiencyLists) {
      for (const value of values) {
        phrases.push({ context: `${where}.${field}`, value });
      }
    }

    for (const feature of dndClass.features) {
      phrases.push(
        { context: `${where}.features.name`, value: feature.name },
        {
          context: `${where}.features.description`,
          value: feature.description,
        },
      );
    }

    for (const group of dndClass.equipmentChoices ?? []) {
      phrases.push({
        context: `${where}.equipmentChoices.label`,
        value: group.label,
      });

      for (const option of group.options) {
        phrases.push({
          context: `${where}.equipmentChoices.options.label`,
          value: option.label,
        });
      }
    }

    const spellcasting = dndClass.spellcasting;

    if (!spellcasting) {
      continue;
    }

    if (spellcasting.note) {
      phrases.push({
        context: `${where}.spellcasting.note`,
        value: spellcasting.note,
      });
    }

    const spellLists = [
      ['cantrips', spellcasting.cantrips],
      ['cantripOptions', spellcasting.cantripOptions],
      ['preparedSpells', spellcasting.preparedSpells],
      ['preparedSpellOptions', spellcasting.preparedSpellOptions],
    ] as const;

    for (const [field, values] of spellLists) {
      for (const value of values ?? []) {
        phrases.push({ context: `${where}.spellcasting.${field}`, value });
      }
    }
  }

  return phrases;
}

function collectBackgroundPhrases(): Phrase[] {
  const phrases: Phrase[] = [];

  for (const background of BACKGROUNDS) {
    const where = `background/${background.id}`;

    phrases.push(
      { context: `${where}.name`, value: background.name },
      { context: `${where}.feature.name`, value: background.feature.name },
      {
        context: `${where}.feature.description`,
        value: background.feature.description,
      },
    );

    for (const value of background.toolProficiencies) {
      phrases.push({ context: `${where}.toolProficiencies`, value });
    }

    for (const value of background.equipment) {
      phrases.push({ context: `${where}.equipment`, value });
    }

    for (const value of background.personalityTraits) {
      phrases.push({ context: `${where}.personalityTraits`, value });
    }
  }

  return phrases;
}

function collectSharedPhrases(): Phrase[] {
  const phrases: Phrase[] = [];

  for (const skill of ALL_SKILLS) {
    phrases.push({ context: 'skills', value: skill });
  }

  for (const [language, description] of Object.entries(LANGUAGE_DESCRIPTIONS)) {
    phrases.push(
      { context: 'languages.name', value: language },
      { context: 'languages.description', value: description },
    );
  }

  // The fallback description is rendered for any language without its own
  // entry, so it needs a translation of its own.
  phrases.push({
    context: 'languages.fallbackDescription',
    value: getLanguageDescription('__no_such_language__'),
  });

  return phrases;
}

function findUntranslated(phrases: Phrase[]): string {
  const missing = new Map<string, Set<string>>();

  for (const { context, value } of phrases) {
    if (resolveBuilderPhraseFa(value) !== undefined) {
      continue;
    }

    const contexts = missing.get(value) ?? new Set<string>();

    contexts.add(context);
    missing.set(value, contexts);
  }

  if (missing.size === 0) {
    return '';
  }

  const lines = [...missing].map(
    ([value, contexts]) => `  [${[...contexts].join(', ')}] ${value}`,
  );

  return `${missing.size} untranslated string(s):\n${lines.join('\n')}`;
}

describe('simple builder Persian phrase coverage', () => {
  it('translates every rendered race string', () => {
    assert.equal(findUntranslated(collectRacePhrases()), '');
  });

  it('translates every rendered class string', () => {
    assert.equal(findUntranslated(collectClassPhrases()), '');
  });

  it('translates every rendered background string', () => {
    assert.equal(findUntranslated(collectBackgroundPhrases()), '');
  });

  it('translates every skill and language string', () => {
    assert.equal(findUntranslated(collectSharedPhrases()), '');
  });

  it('translates every race, class, and background tagline', () => {
    const entities = [...RACES, ...CLASSES, ...BACKGROUNDS];
    const missing = entities
      .filter(
        (entity) =>
          resolveBuilderTaglineFa(entity.id, entity.tagline) === undefined,
      )
      .map((entity) => `  [${entity.id}] ${entity.tagline}`);

    assert.equal(
      missing.length === 0
        ? ''
        : `untranslated taglines:\n${missing.join('\n')}`,
      '',
    );
  });

  it('resolves a miss to undefined rather than echoing the input', () => {
    assert.equal(
      resolveBuilderPhraseFa('__not_in_the_phrase_book__'),
      undefined,
    );
    assert.equal(
      resolveBuilderTaglineFa('__no_such_id__', '__not_in_the_phrase_book__'),
      undefined,
    );
  });
});
