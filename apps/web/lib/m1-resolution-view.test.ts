import assert from 'node:assert/strict';
import test from 'node:test';

import { skillIds } from '@dnd/protocol';
import type {
  DiceResolution,
  PlayerIntent,
  ResolutionRequest,
} from '@dnd/protocol';

import { messages } from './i18n.js';
import {
  canControlCombatantVisibility,
  describeDiceResolution,
  describeM1ErrorCode,
  describeMechanicalCondition,
  describePlayerIntent,
  describeResolutionRequest,
  formatSignedModifier,
} from './m1-resolution-view.js';

function makeResolution(
  overrides: Partial<DiceResolution> = {},
): DiceResolution {
  return {
    ability: 'dex',
    actorParticipantId: 'player-001',
    commandId: 'cmd-1',
    critical: false,
    criticalMiss: false,
    dc: 15,
    dice: [12],
    id: 'resolution_11111111-1111-4111-8111-111111111111',
    kind: 'ability_check',
    modifierTotal: 2,
    modifiers: [{ detail: 'dex', kind: 'ability', value: 2 }],
    resolvedAt: '2026-07-31T12:00:00.000Z',
    rulesProfileId: 'dnd5e-2024-core',
    selectedDie: 12,
    sessionId: 'ABC123',
    stance: 'normal',
    success: false,
    total: 14,
    ...overrides,
  };
}

function makeRequest(
  overrides: Partial<ResolutionRequest> = {},
): ResolutionRequest {
  return {
    ability: 'dex',
    createdAt: '2026-07-31T12:00:00.000Z',
    dc: 15,
    id: 'resolution_22222222-2222-4222-8222-222222222222',
    kind: 'ability_check',
    requestedByParticipantId: 'dm-001',
    sessionId: 'ABC123',
    stance: 'normal',
    status: 'pending',
    targetParticipantId: 'player-001',
    ...overrides,
  };
}

function makeIntent(overrides: Partial<PlayerIntent> = {}): PlayerIntent {
  return {
    authorParticipantId: 'player-001',
    createdAt: '2026-07-31T12:00:00.000Z',
    id: 'intent_33333333-3333-4333-8333-333333333333',
    sessionId: 'ABC123',
    status: 'pending',
    text: 'من پشت ستون سنگر می‌گیرم.',
    updatedAt: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

/** Every key a descriptor can emit has to exist in both locales. */
function assertKeyExists(key: string): void {
  assert.ok(key in messages.en, `missing English copy for "${key}"`);
  assert.ok(key in messages.fa, `missing Persian copy for "${key}"`);
}

// ------------------------------------------------------------------ numbers

test('modifiers carry an explicit sign, including zero', () => {
  assert.equal(formatSignedModifier(3), '+3');
  assert.equal(formatSignedModifier(0), '+0');
  assert.equal(formatSignedModifier(-2), '−2');
});

// ------------------------------------------------------------------- dice

test('a normal roll marks its single die as the one that counted', () => {
  const view = describeDiceResolution(makeResolution());

  assert.deepEqual(view.dice, [{ face: 12, selected: true }]);
  assert.equal(view.stanceKey, 'runtime.m1.stance.normal');
});

test('a disadvantaged roll shows both faces and marks only the kept one', () => {
  const view = describeDiceResolution(
    makeResolution({ dice: [18, 4], selectedDie: 4, stance: 'disadvantage' }),
  );

  assert.deepEqual(view.dice, [
    { face: 18, selected: false },
    { face: 4, selected: true },
  ]);
});

// Two dice can land on the same number. Marking both would claim two dice
// counted, which is not what the server did.
test('duplicate faces mark exactly one die as selected', () => {
  const view = describeDiceResolution(
    makeResolution({ dice: [7, 7], selectedDie: 7, stance: 'advantage' }),
  );

  assert.deepEqual(
    view.dice.map((die) => die.selected),
    [true, false],
  );
});

test('a check reports success or failure and an attack reports hit or miss', () => {
  assert.equal(
    describeDiceResolution(makeResolution({ success: true })).outcomeKey,
    'runtime.m1.outcome.success',
  );
  assert.equal(
    describeDiceResolution(makeResolution({ success: false })).outcomeKey,
    'runtime.m1.outcome.failure',
  );
  assert.equal(
    describeDiceResolution(
      makeResolution({
        dc: undefined,
        kind: 'attack_roll',
        success: true,
        targetArmorClass: 13,
      }),
    ).outcomeKey,
    'runtime.m1.outcome.hit',
  );
  assert.equal(
    describeDiceResolution(
      makeResolution({
        dc: undefined,
        kind: 'attack_roll',
        success: false,
        targetArmorClass: 13,
      }),
    ).outcomeKey,
    'runtime.m1.outcome.miss',
  );
});

test('a check is measured against a DC and an attack against an AC', () => {
  const check = describeDiceResolution(makeResolution());
  const attack = describeDiceResolution(
    makeResolution({
      dc: undefined,
      kind: 'attack_roll',
      targetArmorClass: 16,
    }),
  );

  assert.equal(check.thresholdKey, 'runtime.m1.threshold.dc');
  assert.equal(check.thresholdValue, 15);
  assert.equal(attack.thresholdKey, 'runtime.m1.threshold.ac');
  assert.equal(attack.thresholdValue, 16);
});

test('a check and a save are labelled differently', () => {
  assert.equal(
    describeDiceResolution(makeResolution()).kindKey,
    'runtime.m1.kind.ability_check',
  );
  assert.equal(
    describeDiceResolution(makeResolution({ kind: 'saving_throw' })).kindKey,
    'runtime.m1.kind.saving_throw',
  );
});

// --------------------------------------------------------------- proficiency

test('a proficient skill check names the skill in its proficiency line', () => {
  const view = describeDiceResolution(
    makeResolution({
      modifierTotal: 5,
      modifiers: [
        { detail: 'dex', kind: 'ability', value: 2 },
        { detail: 'acrobatics', kind: 'proficiency', value: 3 },
      ],
      skill: 'acrobatics',
      total: 17,
    }),
  );

  assert.deepEqual(view.proficiency, {
    key: 'runtime.m1.modifier.proficiencySkill',
    signedValue: '+3',
    values: { skillKey: 'runtime.m1.skill.acrobatics' },
  });
  assert.equal(view.modifierTotalSigned, '+5');
});

test('a proficient saving throw uses the generic proficiency label', () => {
  const view = describeDiceResolution(
    makeResolution({
      kind: 'saving_throw',
      modifiers: [
        { detail: 'con', kind: 'ability', value: 1 },
        { kind: 'proficiency', value: 3 },
      ],
    }),
  );

  assert.deepEqual(view.proficiency, {
    key: 'runtime.m1.modifier.proficiency',
    signedValue: '+3',
  });
});

test('a roll with no proficiency reports none rather than zero', () => {
  assert.equal(describeDiceResolution(makeResolution()).proficiency, null);
});

// ------------------------------------------------------------------ poisoned

test('a poisoned roll explains the stance and names the condition', () => {
  const view = describeDiceResolution(
    makeResolution({
      dice: [19, 6],
      selectedDie: 6,
      stance: 'disadvantage',
      stanceSources: [
        { detail: 'poisoned', kind: 'condition', stance: 'disadvantage' },
      ],
    }),
  );

  assert.deepEqual(view.stanceSources, [
    {
      key: 'runtime.m1.stanceSource.condition',
      values: {
        conditionKey: 'runtime.m1.condition.poisoned',
        stanceKey: 'runtime.m1.stance.disadvantage',
      },
    },
  ]);
});

test('a GM-requested stance is attributed to the GM, not to a condition', () => {
  const view = describeDiceResolution(
    makeResolution({
      stanceSources: [{ kind: 'gm_request', stance: 'advantage' }],
    }),
  );

  assert.equal(view.stanceSources[0]?.key, 'runtime.m1.stanceSource.gmRequest');
});

// The player has to be able to tell a correct save from a bug. "Disadvantage"
// alone reads as applying to everything.
test('the poisoned description says saving throws are unaffected', () => {
  const described = describeMechanicalCondition('poisoned');

  assert.ok(described);
  assertKeyExists(described.key);
  assert.match(
    messages.en[described.key as keyof typeof messages.en],
    /[Ss]aving throws are unaffected/,
  );
});

test('a free-form GM tag has no mechanical description', () => {
  assert.equal(describeMechanicalCondition('rattled'), null);
});

// ------------------------------------------------------------------ requests

test('the addressed player may roll and the GM may withdraw', () => {
  const request = makeRequest();
  const player = describeResolutionRequest({
    request,
    viewerParticipantId: 'player-001',
    viewerRole: 'player',
  });
  const gm = describeResolutionRequest({
    request,
    viewerParticipantId: 'dm-001',
    viewerRole: 'dm',
  });

  assert.equal(player.canSubmit, true);
  assert.equal(player.canCancel, false);
  assert.equal(gm.canSubmit, false);
  assert.equal(gm.canCancel, true);
});

test('a bystander is offered neither control', () => {
  const view = describeResolutionRequest({
    request: makeRequest(),
    viewerParticipantId: 'player-002',
    viewerRole: 'player',
  });

  assert.equal(view.addressedToViewer, false);
  assert.equal(view.canSubmit, false);
  assert.equal(view.canCancel, false);
});

test('a resolved or cancelled request offers no controls at all', () => {
  for (const status of ['resolved', 'cancelled'] as const) {
    const view = describeResolutionRequest({
      request: makeRequest({ status }),
      viewerParticipantId: 'dm-001',
      viewerRole: 'dm',
    });

    assert.equal(view.canCancel, false, status);
    assert.equal(view.statusKey, `runtime.m1.requestStatus.${status}`);
  }
});

test('GM prose is carried through untranslated', () => {
  const view = describeResolutionRequest({
    request: makeRequest({ reason: 'The ledge is crumbling.' }),
    viewerParticipantId: 'player-001',
    viewerRole: 'player',
  });

  assert.equal(view.reason, 'The ledge is crumbling.');
});

// -------------------------------------------------------------------- intents

test('an intent keeps its author prose exactly', () => {
  const text = 'من پشت ستون سنگر می‌گیرم.';
  const view = describePlayerIntent({
    intent: makeIntent({ text }),
    viewerParticipantId: 'player-001',
    viewerRole: 'player',
  });

  assert.equal(view.text, text);
  assert.equal(view.authoredByViewer, true);
});

test('only the GM is offered status transitions', () => {
  assert.deepEqual(
    describePlayerIntent({
      intent: makeIntent(),
      viewerParticipantId: 'player-001',
      viewerRole: 'player',
    }).availableTransitions,
    [],
  );
  assert.deepEqual(
    describePlayerIntent({
      intent: makeIntent(),
      viewerParticipantId: 'dm-001',
      viewerRole: 'dm',
    }).availableTransitions,
    ['acknowledged', 'resolved', 'dismissed'],
  );
});

test('an acknowledged intent can still be decided but never returned to pending', () => {
  const view = describePlayerIntent({
    intent: makeIntent({ status: 'acknowledged' }),
    viewerParticipantId: 'dm-001',
    viewerRole: 'dm',
  });

  assert.deepEqual(view.availableTransitions, ['resolved', 'dismissed']);
});

test('a terminal intent offers nothing, so the GM cannot reopen it', () => {
  for (const status of ['resolved', 'dismissed'] as const) {
    const view = describePlayerIntent({
      intent: makeIntent({ status }),
      viewerParticipantId: 'dm-001',
      viewerRole: 'dm',
    });

    assert.equal(view.isTerminal, true, status);
    assert.deepEqual(view.availableTransitions, [], status);
  }
});

// -------------------------------------------------------------------- errors

test('every M1 error code maps to bilingual copy, never to a raw code', () => {
  const codes = [
    'resolution_request_not_found',
    'resolution_request_already_resolved',
    'invalid_resolution_target',
    'player_intent_not_found',
    'invalid_intent_status_transition',
    'command_id_conflict',
    'invalid_role_assumption',
    'seat_owned_by_another_account',
    'unauthenticated',
    'no_assigned_character',
    'no_active_scene',
    'no_active_encounter',
    'scene_not_found',
  ] as const;

  for (const code of codes) {
    const described = describeM1ErrorCode(code);

    assertKeyExists(described.key);
    assert.equal(
      messages.en[described.key as keyof typeof messages.en].includes(code),
      false,
      `copy for ${code} must not restate the raw code`,
    );
  }
});

test('an unrecognized failure falls back to generic copy rather than leaking', () => {
  assert.equal(describeM1ErrorCode(undefined).key, 'runtime.m1.error.generic');
  assert.equal(
    describeM1ErrorCode('internal_server_error').key,
    'runtime.m1.error.generic',
  );
});

// -------------------------------------------------------------- localization

test('every canonical ID the view emits has copy in both locales', () => {
  const keys = [
    ...skillIds.map((skill) => `runtime.m1.skill.${skill}`),
    ...['str', 'dex', 'con', 'int', 'wis', 'cha'].map(
      (ability) => `runtime.m1.ability.${ability}`,
    ),
    ...['normal', 'advantage', 'disadvantage'].map(
      (stance) => `runtime.m1.stance.${stance}`,
    ),
    ...['ability_check', 'saving_throw', 'attack_roll'].map(
      (kind) => `runtime.m1.kind.${kind}`,
    ),
    ...['pending', 'resolved', 'cancelled'].map(
      (status) => `runtime.m1.requestStatus.${status}`,
    ),
    ...['pending', 'acknowledged', 'resolved', 'dismissed'].map(
      (status) => `runtime.m1.intentStatus.${status}`,
    ),
    'runtime.m1.condition.poisoned',
    'runtime.m1.threshold.dc',
    'runtime.m1.threshold.ac',
    'runtime.m1.outcome.success',
    'runtime.m1.outcome.failure',
    'runtime.m1.outcome.hit',
    'runtime.m1.outcome.miss',
  ];

  for (const key of keys) {
    assertKeyExists(key);
  }
});

// A canonical ID leaking into copy would mean the UI is showing a database
// value where a sentence belongs.
test('no M1 copy renders a canonical skill ID verbatim', () => {
  for (const locale of ['en', 'fa'] as const) {
    for (const [key, value] of Object.entries(messages[locale])) {
      if (
        !key.startsWith('runtime.m1.') ||
        key.startsWith('runtime.m1.skill.')
      ) {
        continue;
      }

      assert.equal(
        skillIds.some((skill) => value === skill),
        false,
        `${locale} copy for ${key} is a raw skill ID`,
      );
    }
  }
});

test('the concealment control is a GM control only', () => {
  assert.equal(canControlCombatantVisibility('dm'), true);
  assert.equal(canControlCombatantVisibility('player'), false);
});
