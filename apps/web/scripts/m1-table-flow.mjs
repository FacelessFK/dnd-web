#!/usr/bin/env node
/**
 * The M1 table, driven through its real controls.
 *
 * Extracted so the in-memory-free full-loop smoke and the PostgreSQL restart
 * smoke drive the *same* buttons rather than two drifting imitations of them.
 * Nothing here decides what a run proves; it only knows how to press things and
 * how to read back what the server said.
 *
 * Every helper takes the pages it works on. There is no ambient "current page",
 * because half the point of these harnesses is that the GM profile and the
 * Player profile are genuinely separate browsers.
 */
import {
  clickButton,
  defaultTimeoutMs,
  delay,
  extractToken,
  postCommand,
  readLabeledOptions,
  readSseFrames,
  readText,
  setFieldValue,
  setLabeledField,
  waitFor,
  waitForText,
} from './m1-harness-lib.mjs';

/**
 * One proficient skill, one non-proficient skill on the SAME ability, and one
 * proficient save.
 *
 * Stealth and Acrobatics are both Dexterity, so the only thing that can differ
 * between their two audit records is the proficiency contribution. A comparison
 * across two different abilities would prove nothing.
 */
export const PROFICIENT_SKILL = 'stealth';
export const NON_PROFICIENT_SKILL = 'acrobatics';
export const SHARED_ABILITY = 'dex';
export const PROFICIENT_SAVE = 'dex';
export const DEX_SCORE = 16;
export const EXPECTED_ABILITY_MODIFIER = Math.floor((DEX_SCORE - 10) / 2);
export const EXPECTED_PROFICIENCY_BONUS = 2;

export const INTENT_TEXTS = [
  'I listen at the cellar door <b>carefully</b>',
  'I ready my crossbow behind the crates',
  'I whistle to draw the hound away',
];

export function fail(message) {
  throw new Error(message);
}

/**
 * A per-run tag, so two harnesses sharing one database never collide on a
 * command ID and never read each other's rows.
 */
let runTag = 'unset';

export function setRunTag(tag) {
  runTag = tag;
}

function commandId(scope) {
  return `m1-smoke-${scope}-${runTag}-${Math.random().toString(16).slice(2, 8)}`;
}

// --- table setup -----------------------------------------------------------

export async function seedLibraryEntry({ account, characterName, serverUrl }) {
  const created = await postCommand({
    body: {
      actor: { participantId: account.user.id },
      commandId: commandId('create-entry'),
      payload: {
        entry: {
          abilities: {
            cha: 12,
            con: 12,
            dex: DEX_SCORE,
            int: 10,
            // Positive Strength so a landed melee hit deals at least some
            // damage; a negative modifier can legally floor a hit at zero,
            // which makes "damage was applied" impossible to prove reliably.
            str: 16,
            wis: 11,
          },
          abilityScoreMethod: 'standard-array',
          armorClass: 14,
          background: 'Criminal',
          builderSelections: {
            cantrips: [],
            equipment: ['Burglar Pack'],
            languages: ['Common'],
            originFeatAbility: '',
            originFeatCantrips: [],
            originFeatSpell: '',
            skills: ['Stealth'],
            spells: [],
            tools: [],
          },
          builderStep: 'review',
          className: 'Rogue',
          concept: 'Quiet in the dark',
          hp: { current: 10, max: 10, temp: 0 },
          level: 1,
          meta: {},
          name: characterName,
          notes: 'Seeded by the M1 full-loop smoke.',
          portrait: null,
          // Canonical IDs, never the builder's English display labels.
          proficiencies: {
            savingThrows: [PROFICIENT_SAVE],
            skills: [PROFICIENT_SKILL],
          },
          pronouns: '',
          rulesProfileId: 'dnd5e-2024-core',
          speciesOrRace: 'Human',
          speed: 30,
        },
        ownerParticipantId: account.user.id,
      },
      type: 'create_character_library_entry',
    },
    cookie: account.cookie,
    path: '/api/character-library/command',
    serverUrl,
  });

  if (!created.ok) {
    fail(`create_character_library_entry failed: ${JSON.stringify(created)}`);
  }

  const finalized = await postCommand({
    body: {
      actor: { participantId: account.user.id },
      commandId: commandId('finalize-entry'),
      payload: {
        entryId: created.data.entry.id,
        ownerParticipantId: account.user.id,
      },
      type: 'finalize_character_library_entry',
    },
    cookie: account.cookie,
    path: '/api/character-library/command',
    serverUrl,
  });

  if (!finalized.ok) {
    fail(
      `finalize_character_library_entry failed: ${JSON.stringify(finalized)}`,
    );
  }

  return created.data.entry.id;
}

export async function waitForStoredSessionId(page, expected) {
  await waitFor(page, {
    label: `${page.label} stored session id`,
    predicate: `(() => {
      const stored = JSON.parse(localStorage.getItem('dnd-runtime-cockpit') ?? '{}');
      return Boolean(stored.sessionId)${
        expected ? ` && stored.sessionId === ${JSON.stringify(expected)}` : ''
      };
    })()`,
  });

  return page.evaluate(
    `JSON.parse(localStorage.getItem('dnd-runtime-cockpit') ?? '{}').sessionId`,
  );
}

export async function setSessionCode(page, sessionId) {
  await waitFor(page, {
    label: `${page.label} session code input`,
    predicate: `Boolean([...document.querySelectorAll('input')].find((candidate) =>
      (candidate.getAttribute('placeholder') ?? '').includes('session ID')))`,
  });
  await page.evaluate(`(() => {
    const node = [...document.querySelectorAll('input')].find((candidate) =>
      (candidate.getAttribute('placeholder') ?? '').includes('session ID'));
    const proto = Object.getPrototypeOf(node);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor.set.call(node, ${JSON.stringify(sessionId)});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

/**
 * Sets the target cell and proves it stuck.
 *
 * Worth the retry: `Recover` clears the runtime read models - including the
 * selected cell - only after its round trip returns, so a cell typed while a
 * recovery is still in flight is silently reset to 0,0 a moment later. Reading
 * the fields back turns that race into a wait instead of a wrong move.
 */
export async function setCell(page, x, y) {
  await waitFor(page, {
    label: `${page.label} target cell ${x},${y}`,
    predicate: `(() => {
      const field = (name) => {
        const label = [...document.querySelectorAll('label')].find((candidate) => {
          if (candidate.offsetParent === null) { return false; }
          const span = candidate.querySelector('span');
          return (span?.textContent ?? '').replace(/\\s+/g, ' ').trim() === name;
        });
        return label?.querySelector('input') ?? null;
      };
      const set = (node, value) => {
        const proto = Object.getPrototypeOf(node);
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, String(value));
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const xField = field('X');
      const yField = field('Y');
      if (!xField || !yField) { return false; }
      if (Number(xField.value) !== ${Number(x)}) { set(xField, ${Number(x)}); return false; }
      if (Number(yField.value) !== ${Number(y)}) { set(yField, ${Number(y)}); return false; }
      return true;
    })()`,
  });
}

export async function createCombatant(page, { armorClass, hp, name, x, y }) {
  await setCell(page, x, y);
  await setLabeledField(page, 'Name', name);
  await setLabeledField(page, 'HP max', hp);
  await setLabeledField(page, 'HP current', hp);

  if (armorClass !== undefined) {
    await setLabeledField(page, 'AC', armorClass);
  }

  await clickButton(page, ['Create Combatant']);
  await waitForText(page, [name], `combatant ${name} created`);
}

export function combatantRowExpression(name) {
  return `[...document.querySelectorAll('[data-testid="m1-gm-visibility"] li')].find(
    (row) => row.innerText.includes(${JSON.stringify(name)}))`;
}

export async function concealCombatant(page, name) {
  await waitFor(page, {
    label: `GM conceal control for ${name}`,
    predicate: `(() => {
      const row = ${combatantRowExpression(name)};
      if (!row || row.dataset.combatantHidden === 'true') { return false; }
      const button = [...row.querySelectorAll('button')].find(
        (candidate) => !candidate.disabled && candidate.textContent.includes('Conceal'));
      if (!button) { return false; }
      button.click();
      return true;
    })()`,
  });
  await waitFor(page, {
    label: `${name} concealed`,
    predicate: `(() => {
      const row = ${combatantRowExpression(name)};
      return Boolean(row && row.dataset.combatantHidden === 'true');
    })()`,
  });
}

export async function revealCombatant(page, name) {
  await waitFor(page, {
    label: `GM reveal control for ${name}`,
    predicate: `(() => {
      const row = ${combatantRowExpression(name)};
      if (!row || row.dataset.combatantHidden !== 'true') { return false; }
      const button = [...row.querySelectorAll('button')].find(
        (candidate) => !candidate.disabled && candidate.textContent.includes('Reveal'));
      if (!button) { return false; }
      button.click();
      return true;
    })()`,
  });
  await waitFor(page, {
    label: `${name} revealed`,
    predicate: `(() => {
      const row = ${combatantRowExpression(name)};
      return Boolean(row && row.dataset.combatantHidden === 'false');
    })()`,
  });
}

export async function repositionCombatant(page, name, x, y) {
  const options = await readLabeledOptions(page, 'Selected monster/NPC');

  if (!options) {
    fail('The GM combatant selector was not on screen.');
  }

  const option = options.find((candidate) => candidate.label.includes(name));

  if (!option) {
    fail(`No combatant option named ${name}.`);
  }

  await setLabeledField(page, 'Selected monster/NPC', option.value);
  await setCell(page, x, y);
  await clickButton(page, ['Reposition']);
  await waitFor(page, {
    label: `combatant ${name} repositioned to ${x},${y}`,
    predicate: `(() => {
      const status = [...document.querySelectorAll('p, span, dd')].map(
        (node) => node.textContent ?? '',
      );
      return status.some((text) => text.includes(${JSON.stringify(`${name} at ${x},${y}`)}));
    })()`,
  });
}

export async function requestResolution(page, input) {
  // The GM cannot ask anyone for a roll until a seat has a runtime character:
  // until then the panel shows "No seat has a runtime character yet" and there
  // is no form at all. That is briefly true again right after a recovery, while
  // the character read models are still loading.
  await waitFor(page, {
    label: 'GM resolution request form',
    predicate: `Boolean(document.querySelector('[data-testid="m1-gm-request-form"]'))`,
  });
  await setFieldValue(page, '#m1-gm-kind', input.kind);
  await setFieldValue(page, '#m1-gm-ability', input.ability);

  if (input.kind === 'ability_check') {
    await waitFor(page, {
      label: 'GM skill selector for an ability check',
      predicate: `Boolean(document.querySelector('#m1-gm-skill'))`,
    });
    await setFieldValue(page, '#m1-gm-skill', input.skill);
  }

  await setFieldValue(page, '#m1-gm-dc', String(input.dc));
  await setFieldValue(page, '#m1-gm-stance', input.stance);
  await setFieldValue(page, '#m1-gm-reason', input.reason);
  await clickButton(page, ['Send request'], {
    scope: '[data-testid="m1-gm-request-form"]',
  });
}

// --- authoritative reads ---------------------------------------------------

/**
 * The authoritative session snapshot, taken from the GM's own captured frames.
 *
 * Deliberately not a `reconnect_session` call. That command rotates the
 * credential when the caller is the account that owns the seat - which the GM
 * is - so using it as a read would quietly invalidate the token the GM browser
 * is holding and kill its stream mid-run. The `session_state` frames the server
 * already sent this seat are the same snapshot, projected for the same role,
 * and cost nothing.
 */
export async function readSessionSnapshot({ gmPage }) {
  const frames = await readSseFrames(gmPage);
  const latest = frames
    .filter((frame) => frame.event === 'session_state')
    .at(-1);

  if (!latest?.parsed?.state) {
    fail('The GM stream has not carried a session_state frame yet.');
  }

  return latest.parsed.state;
}

export async function readAssignedCharacterId({ gmPage }) {
  const deadline = Date.now() + defaultTimeoutMs;

  while (Date.now() < deadline) {
    const frames = await readSseFrames(gmPage);
    const snapshots = frames
      .filter((frame) => frame.event === 'session_state')
      .map((frame) => frame.parsed?.state)
      .filter(Boolean);
    const participant = snapshots
      .at(-1)
      ?.participants.find((candidate) => candidate.id === 'player-001');

    if (participant?.characterId) {
      if (participant.pendingCharacterId !== null) {
        fail('Assignment left a pending character behind.');
      }

      return participant.characterId;
    }

    await delay(400);
  }

  fail('The Player seat never received an assigned runtime character.');
}

export async function readCharacter({
  characterId,
  gmPage,
  sessionId,
  serverUrl,
}) {
  const token = await extractToken(gmPage, sessionId, 'dm-001');
  const response = await postCommand({
    body: {
      actor: { participantId: 'dm-001' },
      commandId: `m1-smoke-character-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      payload: { characterId, sessionId },
      type: 'get_character',
    },
    path: '/api/characters/command',
    serverUrl,
    token,
  });

  if (!response.ok) {
    fail(`get_character failed: ${JSON.stringify(response)}`);
  }

  return response.data.character;
}

export async function readActiveScene({ gmPage, sessionId, serverUrl }) {
  const token = await extractToken(gmPage, sessionId, 'dm-001');
  const response = await postCommand({
    body: {
      actor: { participantId: 'dm-001' },
      commandId: `m1-smoke-scene-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      payload: { sessionId },
      type: 'get_active_scene_state',
    },
    path: '/api/movement/command',
    serverUrl,
    token,
  });

  if (!response.ok) {
    fail(`get_active_scene_state failed: ${JSON.stringify(response)}`);
  }

  return response.data;
}

/**
 * The scene exactly as the server is willing to show one seat.
 *
 * Requested with that seat's own credential, so it is the projection - not the
 * GM's copy with a client-side filter, which is the thing boundary 4 forbids.
 */
export async function readSceneForSeat({
  page,
  participantId,
  sceneId,
  sessionId,
  serverUrl,
}) {
  // Recover rotates the credential when the caller owns the seat, so a token
  // lifted a moment before a recovery lands is legitimately dead. Re-reading
  // the tab's current one and trying again is the fix; sleeping longer is not.
  const deadline = Date.now() + 20000;
  let last = null;

  while (Date.now() < deadline) {
    const token = await extractToken(page, sessionId, participantId);

    if (!token) {
      fail(`${page.label} holds no credential for ${participantId}.`);
    }

    const response = await postCommand({
      body: {
        actor: { participantId },
        commandId: `m1-smoke-seat-scene-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        payload: { sceneId, sessionId },
        type: 'get_scene',
      },
      path: '/api/scenes/command',
      serverUrl,
      token,
    });

    if (response.ok) {
      return response.data.scene;
    }

    last = response;

    if (response.error?.code !== 'unauthenticated') {
      break;
    }

    await delay(400);
  }

  fail(`get_scene for ${participantId} failed: ${JSON.stringify(last)}`);
}

/**
 * Compares the two roles' scenes taken at the same moment.
 *
 * The Player's map is a canvas, so a monster's name is never page text either
 * way - which makes "the name is not on screen" a worthless assertion. What
 * matters is that the bytes the server sent the Player never contained the
 * concealed creature at all, and that they did contain the visible one.
 */
export async function assertSceneProjections({
  concealedEntityId,
  concealedMonsterName,
  gmPage,
  label,
  playerPage,
  sessionId,
  serverUrl,
  visibleEntityId,
  visibleMonsterName,
  expectConcealedVisible = false,
}) {
  const snapshot = await readSessionSnapshot({ gmPage });
  const sceneId = snapshot.session.activeSceneId;
  const gmScene = await readSceneForSeat({
    page: gmPage,
    participantId: 'dm-001',
    sceneId,
    sessionId,
    serverUrl,
  });
  const playerScene = await readSceneForSeat({
    page: playerPage,
    participantId: 'player-001',
    sceneId,
    sessionId,
    serverUrl,
  });

  const gmIds = gmScene.entities.map((entity) => entity.id);

  if (!gmIds.includes(visibleEntityId) || !gmIds.includes(concealedEntityId)) {
    fail(`${label}: the GM projection is missing a creature the GM created.`);
  }

  const playerIds = playerScene.entities.map((entity) => entity.id);

  if (!playerIds.includes(visibleEntityId)) {
    fail(`${label}: the Player projection dropped the visible creature.`);
  }

  const playerText = JSON.stringify(playerScene);

  for (const identifier of [concealedEntityId, concealedMonsterName]) {
    const present = playerText.includes(identifier);

    if (present !== expectConcealedVisible) {
      fail(
        `${label}: "${identifier}" was ${present ? 'present in' : 'absent from'} the Player scene projection, expected the opposite.`,
      );
    }
  }

  if (!expectConcealedVisible) {
    // Hidden HP is the other half of concealment: knowing a creature is there
    // is one leak, knowing it is nearly dead is another.
    const concealedEntity = gmScene.entities.find(
      (entity) => entity.id === concealedEntityId,
    );
    const hp = concealedEntity?.combatant?.hp ?? concealedEntity?.hp;

    if (hp && playerText.includes(`"current":${hp.current},"max":${hp.max}`)) {
      fail(`${label}: the concealed creature's HP reached the Player.`);
    }
  }

  if (!JSON.stringify(gmScene).includes(visibleMonsterName)) {
    fail(`${label}: the GM projection lost the visible creature's name.`);
  }

  return { gmScene, playerScene };
}

export async function waitForActiveScenePlacement({
  expected,
  gmPage,
  participantId,
  sessionId,
  serverUrl,
}) {
  const deadline = Date.now() + defaultTimeoutMs;
  let seen = null;

  while (Date.now() < deadline) {
    const active = await readActiveScene({ gmPage, sessionId, serverUrl });
    const placed = active.placedCharacters?.find(
      (candidate) => candidate.participantId === participantId,
    );

    seen = placed?.position ?? null;

    if (
      placed &&
      (!expected ||
        (placed.position.x === expected.x && placed.position.y === expected.y))
    ) {
      return placed;
    }

    await delay(400);
  }

  fail(
    `${participantId} never reached ${expected ? `${expected.x},${expected.y}` : 'the active scene'}; last seen at ${JSON.stringify(seen)}.`,
  );
}

export async function findCombatantId({ gmPage, name, sessionId, serverUrl }) {
  const state = await readSessionSnapshot({ gmPage });
  const token = await extractToken(gmPage, sessionId, 'dm-001');
  const response = await postCommand({
    body: {
      actor: { participantId: 'dm-001' },
      commandId: `m1-smoke-get-scene-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      payload: { sceneId: state.session.activeSceneId, sessionId },
      type: 'get_scene',
    },
    path: '/api/scenes/command',
    serverUrl,
    token,
  });

  if (!response.ok) {
    fail(`get_scene failed: ${JSON.stringify(response)}`);
  }

  const entity = response.data.scene.entities.find(
    (candidate) => candidate.name === name,
  );

  if (!entity) {
    fail(`No scene entity named ${name}.`);
  }

  return entity.id;
}

export async function readTableState({ gmPage, sessionId, serverUrl }) {
  const frames = await readSseFrames(gmPage);
  const resolutionFrames = frames.filter(
    (frame) => frame.event === 'resolution_state',
  );
  const latest = resolutionFrames.at(-1);

  void sessionId;
  void serverUrl;

  return latest?.parsed?.state ?? { requests: [], resolutions: [] };
}

/**
 * Waits for the GM's own stream to carry the audit record for a roll.
 *
 * Read from the GM frames rather than the Player's, because the GM projection
 * is the complete one - that is what makes it the right place to check what the
 * server actually decided.
 */
export async function waitForResolution({
  afterCount = 0,
  gmPage,
  kind,
  sessionId,
  serverUrl,
  skill,
}) {
  const deadline = Date.now() + defaultTimeoutMs;
  let seen = 0;

  while (Date.now() < deadline) {
    const state = await readTableState({ gmPage, sessionId, serverUrl });
    const matching = state.resolutions.filter(
      (resolution) =>
        resolution.kind === kind &&
        (skill === undefined || resolution.skill === skill),
    );

    seen = matching.length;

    if (matching.length > afterCount) {
      return matching.at(-1);
    }

    await delay(300);
  }

  fail(
    `No ${kind}${skill ? ` (${skill})` : ''} resolution arrived; saw ${seen}.`,
  );
}

export function assertProficiencyBreakdown(
  resolution,
  { expectProficiency, label },
) {
  const ability = resolution.modifiers.find(
    (modifier) => modifier.kind === 'ability',
  );
  const proficiency = resolution.modifiers.find(
    (modifier) => modifier.kind === 'proficiency',
  );

  if (!ability) {
    fail(`${label}: the audit record carried no ability modifier.`);
  }

  if (ability.value !== EXPECTED_ABILITY_MODIFIER) {
    fail(
      `${label}: ability modifier was ${ability.value}, expected ${EXPECTED_ABILITY_MODIFIER}.`,
    );
  }

  if (expectProficiency && !proficiency) {
    fail(`${label}: no proficiency contribution in the audit record.`);
  }

  if (!expectProficiency && proficiency) {
    fail(
      `${label}: a proficiency contribution of ${proficiency.value} appeared where none was earned.`,
    );
  }

  if (expectProficiency && proficiency.value !== EXPECTED_PROFICIENCY_BONUS) {
    fail(
      `${label}: proficiency contributed ${proficiency.value}, expected ${EXPECTED_PROFICIENCY_BONUS}.`,
    );
  }

  const expectedTotal =
    resolution.selectedDie +
    EXPECTED_ABILITY_MODIFIER +
    (expectProficiency ? EXPECTED_PROFICIENCY_BONUS : 0);

  if (resolution.total !== expectedTotal) {
    fail(
      `${label}: total was ${resolution.total}, but die ${resolution.selectedDie} plus the recorded modifiers is ${expectedTotal}.`,
    );
  }
}

export async function assertResultUiShowsProficiency(
  page,
  { expectProficiency, label, total },
) {
  await waitFor(page, {
    label: `${label} rendered in the Player result panel`,
    predicate: `(() => {
      const results = document.querySelector('[data-testid="m1-player-results"]');
      if (!results) { return false; }
      const totals = [...results.querySelectorAll('[data-testid="m1-dice-total"]')];
      return totals.some((node) => node.textContent.trim() === ${JSON.stringify(String(total))});
    })()`,
  });

  const hasProficiencyRow = await page.evaluate(`(() => {
    const results = document.querySelector('[data-testid="m1-player-results"]');
    const rows = [...results.querySelectorAll('[data-modifier-kind="proficiency"]')];
    return rows.length > 0;
  })()`);

  if (expectProficiency && !hasProficiencyRow) {
    fail(`${label}: the result UI showed no proficiency contribution.`);
  }
}

// --- intents ---------------------------------------------------------------

export async function submitIntent(playerPage, text) {
  await setFieldValue(playerPage, '#m1-player-intent-text', text);
  await clickButton(playerPage, ['Send to the GM'], {
    scope: '[data-testid="m1-player-intent-form"]',
  });
  await waitFor(playerPage, {
    label: `Player intent "${text.slice(0, 20)}" recorded`,
    predicate: `(() => {
      const node = document.querySelector('[data-testid="m1-player-intents"]');
      return Boolean(node && node.innerText.includes(${JSON.stringify(text)}));
    })()`,
  });
}

export function gmIntentRowExpression(text) {
  return `[...document.querySelectorAll('[data-testid="m1-gm-intents"] li')].find(
    (row) => row.innerText.includes(${JSON.stringify(text)}))`;
}

export async function transitionIntent(gmPage, text, buttonLabel) {
  await waitFor(gmPage, {
    label: `GM "${buttonLabel}" control for an intent`,
    predicate: `(() => {
      const row = ${gmIntentRowExpression(text)};
      if (!row) { return false; }
      const button = [...row.querySelectorAll('button')].find(
        (candidate) => !candidate.disabled && candidate.textContent.trim() === ${JSON.stringify(buttonLabel)});
      if (!button) { return false; }
      button.click();
      return true;
    })()`,
  });
}

export async function runIntentLifecycle({ gmPage, playerPage }) {
  const transitions = [
    { button: 'Mark seen', status: 'Seen by the GM' },
    { button: 'Resolve', status: 'Resolved' },
    { button: 'Dismiss', status: 'Dismissed' },
  ];

  for (const [index, transition] of transitions.entries()) {
    const text = INTENT_TEXTS[index];

    await submitIntent(playerPage, text);

    // The author's own prose must survive the round trip byte for byte, and
    // must be text: if the markup in it had executed, this element would not
    // contain the literal tag.
    const renderedText = await playerPage.evaluate(`(() => {
      const row = [...document.querySelectorAll('[data-testid="m1-player-intents"] li')].find(
        (candidate) => candidate.innerText.includes(${JSON.stringify(text.slice(0, 20))}));
      return row ? row.innerText : null;
    })()`);

    if (!renderedText || !renderedText.includes(text)) {
      fail(
        `Intent text was altered on the way to the Player panel: ${renderedText}`,
      );
    }

    const boldCount = await playerPage.evaluate(
      `document.querySelectorAll('[data-testid="m1-player-intents"] b').length`,
    );

    if (boldCount !== 0) {
      fail(
        'Player-authored intent markup executed instead of rendering as text.',
      );
    }

    await waitFor(gmPage, {
      label: `GM received intent ${index + 1}`,
      predicate: `Boolean(${gmIntentRowExpression(text)})`,
    });

    await transitionIntent(gmPage, text, transition.button);

    await waitFor(playerPage, {
      label: `Player sees intent ${index + 1} as ${transition.status}`,
      predicate: `(() => {
        const row = [...document.querySelectorAll('[data-testid="m1-player-intents"] li')].find(
          (candidate) => candidate.innerText.includes(${JSON.stringify(text.slice(0, 20))}));
        return Boolean(row && row.innerText.includes(${JSON.stringify(transition.status)}));
      })()`,
    });

    // A terminal intent offers no way back to pending, in the UI or otherwise.
    //
    // Waited for on the GM's own page rather than sampled once. The GM and the
    // Player hold two independent subscriptions with no ordering between them,
    // so the Player having rendered the new status says nothing about whether
    // the GM's frame has landed yet. Sampling here read a row the GM had not
    // been told about and reported it as the flag never being set.
    if (transition.button !== 'Mark seen') {
      await waitFor(gmPage, {
        label: `Intent ${index + 1} is terminal for the GM after ${transition.button}`,
        predicate: `(() => {
          const row = ${gmIntentRowExpression(text)};
          return Boolean(row && row.dataset.intentTerminal === 'true');
        })()`,
      });

      // A terminal intent must also offer the GM no way to transition it again.
      const reopenable = await gmPage.evaluate(`(() => {
        const row = ${gmIntentRowExpression(text)};
        return row ? row.querySelectorAll('button').length : -1;
      })()`);

      if (reopenable !== 0) {
        fail(
          `Intent ${index + 1} still offered ${reopenable} transition control(s) after ${transition.button}.`,
        );
      }
    }
  }
}

// --- encounter -------------------------------------------------------------

export async function readEncounter({ gmPage, sessionId, serverUrl }) {
  const token = await extractToken(gmPage, sessionId, 'dm-001');
  const response = await postCommand({
    body: {
      actor: { participantId: 'dm-001' },
      commandId: `m1-smoke-encounter-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      payload: { sessionId },
      type: 'get_encounter_state',
    },
    path: '/api/encounters/command',
    serverUrl,
    token,
  });

  if (!response.ok) {
    fail(`get_encounter_state failed: ${JSON.stringify(response)}`);
  }

  return response.data.encounter;
}

/**
 * Drives Player attacks until one lands, and checks the HP arithmetic each time.
 *
 * A miss is a legitimate outcome, but "damage was applied exactly once" cannot
 * be proved by one. Rather than seed the dice - which would need a test-only
 * hook in the product - the target is built with a deliberately low armour
 * class, so only a natural 1 misses, and the loop retries across turns. Both
 * outcomes are asserted on every swing: a hit must move HP by exactly the
 * reported damage, and a miss must not move it at all.
 */
export async function runPlayerAttack({
  gmPage,
  playerPage,
  sessionId,
  serverUrl,
  targetCombatantId,
  targetName,
}) {
  let landed = null;
  let swings = 0;

  while (!landed && swings < 4) {
    swings += 1;

    await advanceToPlayerTurn({ gmPage, sessionId, serverUrl });

    const targetBefore = await readCombatantHp({
      combatantId: targetCombatantId,
      gmPage,
      sessionId,
      serverUrl,
    });
    const framesBefore = await countSseFrames(gmPage);
    const options = await readLabeledOptions(playerPage, 'Target');

    if (!options) {
      fail('The Player target selector was not on screen.');
    }

    const option = options.find((candidate) =>
      candidate.label.includes(targetName),
    );

    if (!option) {
      fail(`The Player could not target ${targetName}.`);
    }

    await setLabeledField(playerPage, 'Target', option.value);
    await clickButton(playerPage, ['Attack Target']);

    const attackFrame = await waitForCombatEvent(
      gmPage,
      playerPage,
      framesBefore,
    );
    const targetAfter = await settleCombatantHp({
      combatantId: targetCombatantId,
      gmPage,
      serverUrl,
      sessionId,
      unless: attackFrame.hit ? targetBefore : null,
    });

    if (attackFrame.hit) {
      // A hit for zero damage is legal: a low damage die plus a negative
      // Strength modifier floors at nothing. It is simply not the swing that
      // proves damage, so the loop keeps going - after checking that HP moved
      // by exactly what was reported, which for zero means not at all.
      if (attackFrame.damage === 0) {
        if (targetBefore !== targetAfter) {
          fail('A hit for no damage still changed the target HP.');
        }
      } else if (targetBefore - targetAfter !== attackFrame.damage) {
        fail(
          `HP fell by ${targetBefore - targetAfter} but the server reported ${attackFrame.damage} damage.`,
        );
      }

      if (attackFrame.damage > 0) {
        landed = { damage: attackFrame.damage, hp: targetAfter, swings };
      }
    } else if (targetBefore !== targetAfter) {
      fail('A miss changed the target HP.');
    }

    const encounterBefore = await readEncounter({
      gmPage,
      sessionId,
      serverUrl,
    });

    await clickButton(gmPage, ['Advance Turn']);
    await delay(800);

    const encounterAfter = await readEncounter({
      gmPage,
      sessionId,
      serverUrl,
    });

    if (
      encounterAfter.currentTurnIndex === encounterBefore.currentTurnIndex &&
      encounterAfter.roundNumber === encounterBefore.roundNumber
    ) {
      fail('Initiative did not advance after the Player turn.');
    }
  }

  if (!landed) {
    fail(
      `No attack dealt damage in ${swings} swings against a deliberately low armour class; the attack path is not producing damage.`,
    );
  }

  return landed;
}

export async function advanceToPlayerTurn({ gmPage, sessionId, serverUrl }) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const encounter = await readEncounter({ gmPage, sessionId, serverUrl });

    if (currentTurnParticipantId(encounter) === 'player-001') {
      return;
    }

    await clickButton(gmPage, ['Advance Turn']);
    await delay(500);
  }

  fail('The encounter never reached the Player turn.');
}

export function currentTurnParticipantId(encounter) {
  const entry = encounter.participants?.[encounter.currentTurnIndex];

  // A combatant entry is controlled by the DM, so its `participantId` is the
  // DM's - the turn belongs to a player only when the entry has no `kind`.
  return entry && !entry.kind ? entry.participantId : null;
}

/**
 * Current HP of a combatant, from the GM's scene projection.
 *
 * Combatant HP hangs off the scene entity, not off `get_active_scene_state` -
 * that command only reports where placed *characters* stand.
 */
export async function readCombatantHp({
  combatantId,
  gmPage,
  sessionId,
  serverUrl,
}) {
  const snapshot = await readSessionSnapshot({ gmPage });
  const scene = await readSceneForSeat({
    page: gmPage,
    participantId: 'dm-001',
    sceneId: snapshot.session.activeSceneId,
    sessionId,
    serverUrl,
  });
  const entity = scene.entities.find(
    (candidate) => candidate.id === combatantId,
  );

  if (!entity?.combatant?.hp) {
    fail(`No combatant HP for ${combatantId} in the GM scene projection.`);
  }

  return entity.combatant.hp.current;
}

/** Polls until HP settles, then holds still - a second change would be a bug. */
export async function settleCombatantHp({
  combatantId,
  gmPage,
  serverUrl,
  sessionId,
  unless,
}) {
  const deadline = Date.now() + 20000;
  let latest = await readCombatantHp({
    combatantId,
    gmPage,
    sessionId,
    serverUrl,
  });

  while (unless !== null && latest === unless && Date.now() < deadline) {
    await delay(300);
    latest = await readCombatantHp({
      combatantId,
      gmPage,
      sessionId,
      serverUrl,
    });
  }

  // Damage applies once. Watching a little longer catches a second delivery of
  // the same attack, which is exactly what idempotency is supposed to prevent.
  await delay(1500);

  const settled = await readCombatantHp({
    combatantId,
    gmPage,
    sessionId,
    serverUrl,
  });

  if (settled !== latest) {
    fail(
      `Combatant HP kept falling after the attack settled: ${latest} then ${settled}.`,
    );
  }

  return settled;
}

export async function waitForCombatEvent(gmPage, playerPage, sinceIndex = 0) {
  const deadline = Date.now() + 45000;

  while (Date.now() < deadline) {
    const frames = (await readSseFrames(gmPage)).slice(sinceIndex);
    const combat = frames.filter((frame) => frame.event === 'combat_event');

    if (combat.length > 0) {
      const last = combat.at(-1).parsed;

      // Exactly one frame per attack: a duplicate would mean the command
      // applied twice, which is the thing idempotency exists to prevent.
      const identical = combat.filter(
        (frame) =>
          frame.parsed.roll?.total === last.roll?.total &&
          frame.parsed.damage === last.damage &&
          frame.parsed.attackerParticipantId === last.attackerParticipantId,
      );

      if (identical.length > 1) {
        fail('The same attack arrived twice on the GM stream.');
      }

      return last;
    }

    await delay(300);
  }

  const diagnosis = playerPage
    ? await playerPage.evaluate(`(() => {
        const alerts = [...document.querySelectorAll('[role="alert"]')].map(
          (node) => node.innerText.replace(/\\s+/g, ' ').trim(),
        );
        const text = document.body?.innerText ?? '';
        const usageIndex = text.indexOf('Usage');
        return {
          alerts,
          usage: usageIndex >= 0 ? text.slice(usageIndex, usageIndex + 80) : null,
        };
      })()`)
    : null;

  fail(
    `No combat_event frame arrived on the GM stream. Player diagnosis: ${JSON.stringify(diagnosis)}`,
  );
}

// --- projection and recovery assertions ------------------------------------

/**
 * Nothing identifying the creature reached the Player, on screen or on the wire.
 *
 * Windowed on purpose. A reveal legitimately puts the creature's ID into the
 * Player's frames, so scanning the whole history would report the product's
 * correct behaviour as a leak. `fromIndex` and `toIndex` bound the check to the
 * stretch during which the creature was supposed to be concealed.
 */
export async function assertPlayerCannotSee(
  playerPage,
  { fromIndex = 0, identifiers, label, toIndex = Number.MAX_SAFE_INTEGER },
) {
  for (const identifier of identifiers) {
    await waitFor(playerPage, {
      label: `${label}: "${identifier}" absent from the Player page`,
      predicate: `(() => {
        const text = document.body?.innerText ?? '';
        return !text.includes(${JSON.stringify(identifier)});
      })()`,
    });
  }

  const frames = (await readSseFrames(playerPage)).slice(fromIndex, toIndex);

  for (const identifier of identifiers) {
    const leaked = frames.filter((frame) => frame.raw.includes(identifier));

    if (leaked.length > 0) {
      fail(
        `${label}: "${identifier}" appeared as a substring in ${leaked.length} Player SSE frame(s) (${leaked
          .map((frame) => frame.event)
          .join(', ')}) between frames ${fromIndex} and ${toIndex}.`,
      );
    }
  }
}

export function countSseFrames(page) {
  return page.evaluate(`(window.__m1Sse?.frames ?? []).length`);
}

/**
 * Where the next mutation's frames will start, once the previous step's have
 * all landed.
 *
 * Sampling `countSseFrames` immediately before acting is not enough to separate
 * "before" from "after". Frames from the preceding step - especially the
 * `initial_sync` burst a `Recover` produces - can still be in flight, so they
 * land at indices past the sample and fall inside a window that is supposed to
 * contain only post-mutation traffic. A creature that was legitimately visible
 * a moment ago then reads as a concealment leak, which is the product's correct
 * behaviour reported as a defect.
 *
 * Waiting for the transcript to go quiet first makes the boundary real. This is
 * quiescence, not a fixed sleep: it returns as soon as the count holds still,
 * and throws rather than guessing if frames never stop arriving.
 */
export async function settleSseFrames(
  page,
  { quietMs = 600, timeoutMs = 15000 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let previous = await countSseFrames(page);
  let stableSince = Date.now();

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const current = await countSseFrames(page);

    if (current !== previous) {
      previous = current;
      stableSince = Date.now();
      continue;
    }

    if (Date.now() - stableSince >= quietMs) {
      return current;
    }
  }

  throw new Error(
    `SSE frames never settled: still arriving after ${timeoutMs}ms (last count ${previous}).`,
  );
}

export async function compareRoleProjections({
  concealedEntityId,
  concealedFromIndex = 0,
  concealedMonsterName,
  concealedUntilIndex,
  gmPage,
  playerPage,
}) {
  const gmFrames = await readSseFrames(gmPage);
  const playerFrames = await readSseFrames(playerPage);

  const names = (frames) => new Set(frames.map((frame) => frame.event));
  const gmNames = names(gmFrames);
  const playerNames = names(playerFrames);

  for (const required of [
    'resolution_state',
    'player_intent_state',
    'encounter_state',
    'combat_event',
  ]) {
    if (!gmNames.has(required)) {
      fail(`The GM stream never carried a ${required} frame.`);
    }
  }

  for (const required of ['resolution_state', 'player_intent_state']) {
    if (!playerNames.has(required)) {
      fail(`The Player stream never carried a ${required} frame.`);
    }
  }

  const initialSync = (frames, event) =>
    frames.filter(
      (frame) =>
        frame.event === event && frame.parsed?.reason === 'initial_sync',
    );

  for (const [name, frames] of [
    ['GM', gmFrames],
    ['Player', playerFrames],
  ]) {
    for (const event of ['resolution_state', 'player_intent_state']) {
      if (initialSync(frames, event).length === 0) {
        fail(`The ${name} stream carried no ${event} initial_sync frame.`);
      }
    }
  }

  // The GM sees the concealed creature; the Player never does, in any frame.
  const gmSawConcealed = gmFrames.some((frame) =>
    frame.raw.includes(concealedEntityId),
  );

  if (!gmSawConcealed) {
    fail('The GM stream never named the concealed combatant it controls.');
  }

  // Bounded at both ends. The creature is placed visible and only concealed
  // afterwards, so frames before `concealedFromIndex` are entitled to name it;
  // after the reveal at `concealedUntilIndex` the Player is entitled to it
  // again. Only the stretch between is a concealment claim, and scanning
  // outside it reports correct behaviour as a leak.
  const concealedWindow = playerFrames.slice(
    concealedFromIndex,
    concealedUntilIndex,
  );

  for (const identifier of [concealedEntityId, concealedMonsterName]) {
    if (concealedWindow.some((frame) => frame.raw.includes(identifier))) {
      fail(`"${identifier}" leaked into the Player stream while concealed.`);
    }
  }

  // A credential must never travel in the payload of an event.
  for (const [name, frames] of [
    ['GM', gmFrames],
    ['Player', playerFrames],
  ]) {
    const leaky = frames.find(
      (frame) =>
        frame.raw.includes('participantToken') ||
        frame.raw.includes('passwordHash') ||
        frame.raw.includes('"token"'),
    );

    if (leaky) {
      fail(`A ${name} ${leaky.event} frame carried credential material.`);
    }
  }
}

export async function assertPlayerTableRestored(
  playerPage,
  {
    characterName,
    concealedEntityId,
    concealedMonsterName,
    visibleMonsterName,
  },
) {
  await waitForText(
    playerPage,
    [characterName],
    'Player character after reload',
  );
  await waitForText(
    playerPage,
    [visibleMonsterName],
    'Player visible monster after reload',
  );
  await waitFor(playerPage, {
    label: 'Player poisoned condition after reload',
    predicate: `Boolean(document.querySelector('[data-testid="m1-player-conditions"] [data-condition="poisoned"]'))`,
  });
  await waitFor(playerPage, {
    label: 'Player recent rolls restored after reload',
    predicate: `(() => {
      const node = document.querySelector('[data-testid="m1-player-results"]');
      return Boolean(node && node.querySelectorAll('[data-testid="m1-dice-result"]').length > 0);
    })()`,
  });
  await waitFor(playerPage, {
    label: 'Player intents restored after reload',
    predicate: `(() => {
      const node = document.querySelector('[data-testid="m1-player-intents"]');
      return Boolean(node && node.querySelectorAll('li').length === ${INTENT_TEXTS.length});
    })()`,
  });
  await waitForText(
    playerPage,
    ['Encounter status', 'ENCOUNTER STATUS'],
    'Player encounter after reload',
  );
  await assertPlayerCannotSee(playerPage, {
    identifiers: [concealedEntityId, concealedMonsterName],
    label: 'concealment survives a Player refresh',
  });
}

export async function assertNoDuplicateTerminalRecords(
  gmPage,
  { sessionId, serverUrl },
) {
  const state = await readTableState({ gmPage, sessionId, serverUrl });
  const ids = state.resolutions.map((resolution) => resolution.id);
  const unique = new Set(ids);

  if (ids.length !== unique.size) {
    fail(
      `The GM table holds ${ids.length} resolutions but only ${unique.size} distinct ones.`,
    );
  }

  const renderedTotals = await gmPage.evaluate(
    `document.querySelectorAll('[data-testid="m1-gm-requests"] [data-testid="m1-dice-result"]').length`,
  );

  if (renderedTotals !== ids.length) {
    fail(
      `The GM panel rendered ${renderedTotals} results for ${ids.length} authoritative resolutions.`,
    );
  }
}

// --- negative security probes ----------------------------------------------

export async function probeHostileReclaim({ hostile, sessionId, serverUrl }) {
  const claimed = await postCommand({
    body: {
      actor: {
        displayName: 'M1 Interloper',
        participantId: 'dm-001',
        role: 'dm',
      },
      commandId: commandId('hostile-reclaim'),
      payload: { sessionId },
      type: 'reconnect_session',
    },
    cookie: hostile.cookie,
    path: '/api/session/command',
    serverUrl,
  });

  if (claimed.ok) {
    fail(
      'A third authenticated account reclaimed the GM seat with no credential.',
    );
  }

  const joined = await postCommand({
    body: {
      actor: {
        displayName: 'M1 Interloper',
        participantId: 'player-001',
        role: 'player',
      },
      commandId: commandId('hostile-join'),
      payload: { sessionId },
      type: 'join_session',
    },
    cookie: hostile.cookie,
    path: '/api/session/command',
    serverUrl,
  });

  if (joined.ok) {
    fail("A third account took over the Player's bound seat.");
  }
}

export async function probePlayerGmCommand({
  playerPage,
  sessionId,
  serverUrl,
  visibleEntityId,
}) {
  const token = await extractToken(playerPage, sessionId, 'player-001');

  if (!token) {
    fail('The Player tab holds no credential to probe with.');
  }

  const response = await postCommand({
    body: {
      actor: { participantId: 'player-001' },
      commandId: commandId('player-gm-command'),
      payload: { combatantId: visibleEntityId, hidden: true, sessionId },
      type: 'dm_set_combatant_hidden',
    },
    path: '/api/dm/command',
    serverUrl,
    token,
  });

  if (response.ok) {
    fail('A Player concealed a combatant with a GM-only command.');
  }
}

export async function probeCrossSeatSubscription({
  playerPage,
  sessionId,
  serverUrl,
}) {
  const token = await extractToken(playerPage, sessionId, 'player-001');
  const url = new URL(`${serverUrl}/api/sessions/${sessionId}/stream`);

  // The Player's own token, pointed at the GM's participant: the credential is
  // real, the seat is not theirs.
  url.searchParams.set('participantId', 'dm-001');
  url.searchParams.set('participantToken', token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal,
    });

    if (response.ok) {
      controller.abort();
      fail('A Player token subscribed to the GM stream.');
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export async function assertCleanBrowsers({ gmPage, playerPage }) {
  for (const page of [gmPage, playerPage]) {
    if (page.consoleErrors.length > 0) {
      fail(
        `${page.label} logged ${page.consoleErrors.length} console error(s): ${page.consoleErrors
          .slice(0, 3)
          .join(' | ')}`,
      );
    }

    // Recovering a table that has no encounter yet answers 409
    // `no_active_encounter`. The cockpit treats that as an expected recovery
    // miss and says so in its recovery notes, so it is not damage - but nothing
    // else is allowed, and no status at all is allowed to be 5xx.
    const unexpected = page.failedRequests.filter(
      (request) =>
        !request.url.includes('/favicon') &&
        !(
          request.status === 409 &&
          request.url.includes('/api/encounters/command')
        ),
    );
    const serverErrors = page.failedRequests.filter(
      (request) => (request.status ?? 0) >= 500,
    );

    if (serverErrors.length > 0) {
      fail(
        `${page.label} saw a server error: ${JSON.stringify(serverErrors.slice(0, 3))}`,
      );
    }

    if (unexpected.length > 0) {
      fail(
        `${page.label} saw ${unexpected.length} failed request(s): ${JSON.stringify(
          unexpected.slice(0, 3),
        )}`,
      );
    }

    const untranslated = await readText(page, 'body');

    if (untranslated && /runtime\.m1\./.test(untranslated)) {
      fail(`${page.label} rendered a raw runtime.m1 translation key.`);
    }

    const overflows = await page.evaluate(
      `document.documentElement.scrollWidth > document.documentElement.clientWidth + 2`,
    );

    if (overflows) {
      fail(`${page.label} overflows horizontally.`);
    }
  }
}
