import assert from 'node:assert/strict';
import test from 'node:test';

import { messages } from './i18n';
import {
  CANONICAL_CONDITION_IDS,
  conditionMessageKey,
  isCanonicalConditionId,
  localizeConditionLabel,
  localizeConditionList,
  looksLikeConditionId,
} from './runtime-condition-labels';

function translator(locale: 'en' | 'fa') {
  return ((key: string, values?: Record<string, string>) => {
    const template = (messages[locale] as Record<string, string>)[key];

    assert.ok(template, `missing ${locale} message for ${key}`);

    return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
      values && name in values ? values[name]! : `{${name}}`,
    );
  }) as never;
}

const en = translator('en');
const fa = translator('fa');

test('every canonical condition has a label in both locales', () => {
  // The typecheck already enforces `fa` has every `en` key. What it cannot
  // enforce is that the *list* and the catalogue agree, which is the gap a new
  // condition would fall into.
  for (const id of CANONICAL_CONDITION_IDS) {
    const key = conditionMessageKey(id);

    assert.ok(
      (messages.en as Record<string, string>)[key],
      `missing English label for ${id}`,
    );
    assert.ok(
      (messages.fa as Record<string, string>)[key],
      `missing Persian label for ${id}`,
    );
  }
});

test('a canonical condition renders as words, never as its key', () => {
  assert.equal(localizeConditionLabel('poisoned', en), 'Poisoned');
  assert.equal(localizeConditionLabel('poisoned', fa), 'مسموم');
  assert.equal(localizeConditionLabel('unconscious', en), 'Unconscious');
  assert.equal(localizeConditionLabel('unconscious', fa), 'بیهوش');

  for (const id of CANONICAL_CONDITION_IDS) {
    for (const t of [en, fa]) {
      const label = localizeConditionLabel(id, t);

      assert.notEqual(label, id, `${id} rendered as its own key`);
      assert.equal(/^[a-z_]+$/.test(label), false, label);
    }
  }
});

test('casing and surrounding space do not defeat the lookup', () => {
  assert.equal(localizeConditionLabel('  Poisoned  ', en), 'Poisoned');
  assert.equal(localizeConditionLabel('POISONED', en), 'Poisoned');
  assert.equal(isCanonicalConditionId(' Prone '), true);
});

test('an unknown machine-shaped value gets a generic label, not its key', () => {
  // A newer server sending a condition this build has not heard of. Showing the
  // key would leak protocol vocabulary; showing nothing would hide that the
  // creature has a condition at all.
  assert.equal(
    localizeConditionLabel('dazzled_by_starlight', en),
    'An unknown condition',
  );
  assert.equal(
    localizeConditionLabel('dazzled_by_starlight', fa),
    'وضعیت نامشخص',
  );
  assert.equal(
    localizeConditionLabel('bewildered', en),
    'An unknown condition',
  );
});

test('text a GM typed is left exactly as they typed it', () => {
  // The combatant draft takes free text. It is authored content, so it is
  // neither translated nor replaced with a stand-in - the GM wrote it to be
  // read, and a Persian table may well have written it in Persian.
  assert.equal(
    localizeConditionLabel('Blinded by the flash', en),
    'Blinded by the flash',
  );
  assert.equal(
    localizeConditionLabel('گرفتار تار عنکبوت', fa),
    'گرفتار تار عنکبوت',
  );
  assert.equal(
    localizeConditionLabel('Marked (Ranger)', en),
    'Marked (Ranger)',
  );
});

test('the machine-shape rule is about form, not membership', () => {
  assert.equal(looksLikeConditionId('poisoned'), true);
  assert.equal(looksLikeConditionId('dazzled_by_starlight'), true);
  assert.equal(looksLikeConditionId('Blinded by the flash'), false);
  assert.equal(looksLikeConditionId('Marked (Ranger)'), false);
  assert.equal(looksLikeConditionId('گرفتار'), false);
});

test('a condition list joins with a separator the locale actually uses', () => {
  assert.equal(
    localizeConditionList(['poisoned', 'prone'], en),
    'Poisoned, Prone',
  );
  // The Arabic comma. Joining with ', ' is the other half of what made these
  // lists read as English inside an RTL layout.
  assert.equal(
    localizeConditionList(['poisoned', 'prone'], fa),
    'مسموم، افتاده',
  );
  assert.equal(localizeConditionList([], en), '');
  assert.equal(localizeConditionList(undefined, en), '');
});

test('no rendered condition text is ever a raw protocol value', () => {
  const inputs = [
    ...CANONICAL_CONDITION_IDS,
    'dazzled_by_starlight',
    'some_future_condition',
  ];

  for (const t of [en, fa]) {
    const rendered = localizeConditionList(inputs, t);

    for (const id of inputs) {
      assert.equal(
        rendered.includes(id),
        false,
        `rendered text leaked the canonical value ${id}: ${rendered}`,
      );
    }
  }
});
