#!/usr/bin/env node
/**
 * The M1 acceptance smoke: one table, played end to end through the real UI.
 *
 * Two authenticated browser profiles - a GM and a Player - build a session,
 * bring a Character Library entry into it, fight, and recover from a refresh.
 * Everything a person would do is done by clicking what a person would click.
 * Direct HTTP appears in exactly two roles, both deliberate:
 *
 * - reading authoritative state to check what the UI claims, and
 * - negative security probes, which by definition have no button.
 *
 * Seeding the Character Library entry is also HTTP. The Character Builder is
 * M6 work and driving it here would test the builder rather than the table;
 * `runtime-bridge-db-smoke.mjs` seeds the same way for the same reason.
 *
 * Dice are not seeded. Nothing here asserts a face. It asserts relationships
 * the rules must hold whatever the dice do - the kept die is the lower of two
 * under poisoned, a proficient check carries a proficiency modifier and an
 * otherwise identical non-proficient one does not, HP falls by exactly the
 * damage the server reported - which is deterministic without a test-only
 * random hook in the product.
 */
import { resolve } from 'node:path';

import {
  artifactRoot,
  captureArtifacts,
  cleanup,
  clickButton,
  clickButtonIfEnabled,
  createCdpPage,
  defaultTimeoutMs,
  delay,
  extractToken,
  findBrowserExecutable,
  fingerprintCredential,
  forceLocale,
  getFreePort,
  launchBrowserProfile,
  loadRepoEnvironment,
  loginInBrowser,
  navigate,
  nextBin,
  postCommand,
  printProcessLogs,
  readLabeledOptions,
  readSseFrames,
  readText,
  redactSecrets,
  registerAccount,
  reload,
  runDbReadinessCheck,
  serverDir,
  setFieldValue,
  setLabeledField,
  startProcess,
  installSseRecorder,
  waitFor,
  waitForHttp,
  waitForNoText,
  waitForSseOpen,
  waitForText,
  webDir,
} from './m1-harness-lib.mjs';
import { assertWebUiTargetsServer } from './runtime-smoke-diagnostics.mjs';

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const runDir = resolve(artifactRoot, `full-loop-${runId}`);

/**
 * One proficient skill, one non-proficient skill on the SAME ability, and one
 * proficient save.
 *
 * Stealth and Acrobatics are both Dexterity, so the only thing that can differ
 * between their two audit records is the proficiency contribution. A comparison
 * across two different abilities would prove nothing.
 */
const PROFICIENT_SKILL = 'stealth';
const NON_PROFICIENT_SKILL = 'acrobatics';
const SHARED_ABILITY = 'dex';
const PROFICIENT_SAVE = 'dex';
const DEX_SCORE = 16;
const EXPECTED_ABILITY_MODIFIER = Math.floor((DEX_SCORE - 10) / 2);
const EXPECTED_PROFICIENCY_BONUS = 2;

loadRepoEnvironment();

const steps = [];
let stepIndex = 0;

function step(label) {
  stepIndex += 1;
  steps.push(label);
  console.log(`[m1-full-loop] ${String(stepIndex).padStart(2, '0')} ${label}`);
}

function fail(message) {
  throw new Error(message);
}

const pages = {};

/**
 * Evidence has to be taken while the browsers are still alive.
 *
 * Called from inside the run rather than from the top-level handler: by the
 * time a rejection reaches that handler the `finally` has already torn Chrome
 * down, and every screenshot and page read comes back as a dead socket.
 */
async function captureFailure(error) {
  try {
    const written = await captureArtifacts(runDir, 'failure', pages, {
      error: redactSecrets(error instanceof Error ? error.stack : error),
      failedStep: steps.at(-1) ?? null,
      steps,
    });
    console.error(`[m1-full-loop] artifacts: ${written}`);
  } catch (artifactError) {
    console.error(`[m1-full-loop] artifact capture failed: ${artifactError}`);
  }
}

main().catch(async (error) => {
  console.error('\n[m1-full-loop] failed');
  console.error(redactSecrets(error instanceof Error ? error.stack : error));
  printProcessLogs();
  await cleanup();
  process.exit(1);
});

async function main() {
  const browserPath = findBrowserExecutable();

  if (!browserPath) {
    fail(
      'No Chrome/Chromium executable found. Set RUNTIME_SMOKE_BROWSER=/path/to/chrome.',
    );
  }

  if (typeof WebSocket !== 'function') {
    fail('This smoke needs a Node runtime with global WebSocket support.');
  }

  // DB mode is not a preference here. `AuthService` is only injected when
  // `SERVER_PERSISTENCE_MODE=db`, so an in-memory server has no register or
  // login endpoint and no Character Library to import from - which is half of
  // the M1 journey. Failing loudly beats quietly testing a different product.
  if (!process.env.DATABASE_URL) {
    fail(
      'DATABASE_URL is required: the M1 journey authenticates a GM and a Player and imports a Character Library entry, and both need SERVER_PERSISTENCE_MODE=db.',
    );
  }

  await runDbReadinessCheck();

  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const gmDebugPort = await getFreePort();
  const playerDebugPort = await getFreePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const runtimeUrl = `${webOrigin}/runtime`;

  const gmAccount = {
    displayName: 'M1 Game Master',
    email: `m1-gm-${runId}@example.test`,
    password: `m1-gm-password-${runId}`,
  };
  const playerAccount = {
    displayName: 'M1 Player',
    email: `m1-player-${runId}@example.test`,
    password: `m1-player-password-${runId}`,
  };
  const hostileAccount = {
    displayName: 'M1 Interloper',
    email: `m1-hostile-${runId}@example.test`,
    password: `m1-hostile-password-${runId}`,
  };
  const characterName = `Sable ${runId.slice(-5)}`;
  const visibleMonsterName = `Watch Hound ${runId.slice(-4)}`;
  const concealedMonsterName = `Cellar Lurker ${runId.slice(-4)}`;

  step('start the authoritative server');
  startProcess(
    'server',
    process.execPath,
    ['--import', 'tsx', 'src/index.ts'],
    {
      cwd: serverDir,
      env: {
        NEXT_PUBLIC_APP_URL: webOrigin,
        SERVER_PERSISTENCE_MODE: 'db',
        SERVER_PORT: String(serverPort),
      },
    },
  );
  await waitForHttp(`${serverUrl}/`, { label: 'server root' });

  step('start the web application');
  startProcess(
    'web',
    process.execPath,
    [nextBin, 'dev', '-p', String(webPort), '-H', '127.0.0.1'],
    { cwd: webDir, env: { NEXT_PUBLIC_SERVER_URL: serverUrl } },
  );
  await waitForHttp(runtimeUrl, { label: '/runtime' });
  await assertWebUiTargetsServer(runtimeUrl, serverUrl);

  step('register the GM, Player and interloper accounts');
  // The GM logs in through their own browser and creates the session there, so
  // the harness never needs their cookie - only that the account exists.
  await registerAccount(serverUrl, gmAccount);
  const player = await registerAccount(serverUrl, playerAccount);
  const hostile = await registerAccount(serverUrl, hostileAccount);

  step('seed the Player Character Library entry with real proficiencies');
  const libraryEntryId = await seedLibraryEntry({
    account: player,
    characterName,
    serverUrl,
  });

  step('launch isolated GM and Player browser profiles');
  launchBrowserProfile('gm', browserPath, gmDebugPort, {
    windowPosition: { x: 0, y: 0 },
    windowSize: { height: 1080, width: 950 },
  });
  launchBrowserProfile('player', browserPath, playerDebugPort, {
    windowPosition: { x: 960, y: 0 },
    windowSize: { height: 1080, width: 950 },
  });
  await Promise.all([
    waitForHttp(`http://127.0.0.1:${gmDebugPort}/json/version`, {
      label: 'GM Chrome DevTools',
    }),
    waitForHttp(`http://127.0.0.1:${playerDebugPort}/json/version`, {
      label: 'Player Chrome DevTools',
    }),
  ]);

  const gmPage = await createCdpPage(gmDebugPort, runtimeUrl);
  const playerPage = await createCdpPage(playerDebugPort, runtimeUrl);

  gmPage.label = 'GM';
  playerPage.label = 'Player';
  pages.gm = gmPage;
  pages.player = playerPage;

  // Installed before either tab subscribes, and re-injected on every document,
  // so the recorder is the transport for the app's own stream across reloads.
  await installSseRecorder(gmPage);
  await installSseRecorder(playerPage);

  try {
    step('authenticate the GM in its own browser profile');
    await waitForText(
      gmPage,
      ['Runtime War Table', 'میز نبرد زنده'],
      'GM shell',
    );
    await forceLocale(gmPage, 'en');
    await loginInBrowser(gmPage, serverUrl, {
      email: gmAccount.email,
      password: gmAccount.password,
    });
    await navigate(gmPage, runtimeUrl);
    await waitForText(gmPage, ['Runtime War Table'], 'authenticated GM shell');
    await clickButtonIfEnabled(gmPage, ['Local Reset']);
    await clickButton(gmPage, ['DM Mode']);

    step('authenticate the Player in its own browser profile');
    await waitForText(
      playerPage,
      ['Runtime War Table', 'میز نبرد زنده'],
      'Player shell',
    );
    await forceLocale(playerPage, 'en');
    await loginInBrowser(playerPage, serverUrl, {
      email: playerAccount.email,
      password: playerAccount.password,
    });
    await navigate(playerPage, runtimeUrl);
    await waitForText(
      playerPage,
      ['Runtime War Table'],
      'authenticated Player shell',
    );
    await clickButtonIfEnabled(playerPage, ['Local Reset']);
    await clickButton(playerPage, ['Player Mode']);

    step('GM creates the session through the UI');
    await clickButton(gmPage, ['Create Session']);
    const sessionId = await waitForStoredSessionId(gmPage);
    console.log(`[m1-full-loop] session ${sessionId}`);

    step('GM activates a map through the UI');
    await clickButton(gmPage, ['Create Scene']);
    await waitForText(gmPage, ['Tactical Grid'], 'GM tactical grid');
    await waitFor(gmPage, {
      label: 'GM active scene id',
      predicate: `(() => {
        const stored = JSON.parse(localStorage.getItem('dnd-runtime-cockpit') ?? '{}');
        return Boolean(stored.sceneId);
      })()`,
    });

    step('GM subscribes; the recorder captures raw named frames');
    await clickButton(gmPage, ['Subscribe SSE']);
    await waitForSseOpen(gmPage, 'GM');

    step('Player joins with the session code');
    await setSessionCode(playerPage, sessionId);
    await clickButton(playerPage, ['Join Session']);
    await waitForStoredSessionId(playerPage, sessionId);
    await clickButton(playerPage, ['Subscribe SSE']);
    await waitForSseOpen(playerPage, 'Player');

    step('Player imports the proficient Character Library entry');
    await waitForText(
      playerPage,
      ['Saved Character Library'],
      'Player library panel',
    );
    await waitForText(playerPage, [characterName], 'seeded library entry');
    await clickButton(playerPage, ['Submit Saved Character']);
    // The status chip is CSS-uppercased, so `innerText` reads it back as
    // "PENDING DM ASSIGNMENT". Assert the untransformed heading instead.
    await waitForText(
      playerPage,
      ['Runtime copy pending DM assignment'],
      'Player pending assignment',
    );

    step('GM assigns the runtime character');
    await clickButton(gmPage, ['Recover']);
    await waitForText(gmPage, ['Assignment Requests'], 'GM assignment panel');
    await waitForText(gmPage, [characterName], 'GM pending character preview');
    await clickButton(gmPage, ['Assign Runtime Copy']);
    await waitForText(
      gmPage,
      ['No pending character requests'],
      'GM assignment queue drained',
    );

    const assignedCharacterId = await readAssignedCharacterId({ gmPage });

    step('verify the runtime character carries the proficiency data');
    const runtimeCharacter = await readCharacter({
      characterId: assignedCharacterId,
      gmPage,
      sessionId,
      serverUrl,
    });

    if (!runtimeCharacter.proficiencies?.skills?.includes(PROFICIENT_SKILL)) {
      fail(`Runtime character is not proficient in ${PROFICIENT_SKILL}.`);
    }

    if (runtimeCharacter.proficiencies.skills.includes(NON_PROFICIENT_SKILL)) {
      fail(
        `Runtime character should not be proficient in ${NON_PROFICIENT_SKILL}.`,
      );
    }

    if (
      !runtimeCharacter.proficiencies.savingThrows.includes(PROFICIENT_SAVE)
    ) {
      fail(`Runtime character is not proficient in ${PROFICIENT_SAVE} saves.`);
    }

    if (
      runtimeCharacter.meta?.sourceCharacterLibraryEntryId !== libraryEntryId
    ) {
      fail('Runtime character lost its source library entry provenance.');
    }

    step('GM places the assigned character on the map');
    // A token has to exist before it can be moved, and the only control that
    // creates one for another seat is the GM's own reposition.
    await setLabeledField(gmPage, 'Acting token', 'player-001');
    await setCell(gmPage, 2, 2);
    await clickButton(gmPage, ['DM Reposition']);
    await waitForActiveScenePlacement({
      expected: { x: 2, y: 2 },
      gmPage,
      participantId: 'player-001',
      sessionId,
      serverUrl,
    });

    step('Player loads the table and moves their own character');
    await clickButton(playerPage, ['Recover']);
    await waitForText(
      playerPage,
      [characterName],
      'Player recovered character',
    );
    // Recovery has finished only once the Player's own token has a position:
    // until then the movement preview reads "from not placed", and the cell
    // fields are still about to be cleared.
    await waitForNoText(
      playerPage,
      ['FROM NOT PLACED'],
      'Player token placed before moving',
    );
    await setCell(playerPage, 3, 2);
    await clickButton(playerPage, ['Move Token']);
    await waitForActiveScenePlacement({
      expected: { x: 3, y: 2 },
      gmPage,
      participantId: 'player-001',
      sessionId,
      serverUrl,
    });

    step('GM places one visible and one concealed monster');
    await createCombatant(gmPage, {
      // Deliberately trivial to hit, so a landed attack - and therefore the
      // damage and HP assertions - does not depend on a lucky roll.
      armorClass: 1,
      hp: 12,
      name: visibleMonsterName,
      x: 5,
      y: 2,
    });
    await createCombatant(gmPage, {
      hp: 9,
      name: concealedMonsterName,
      x: 6,
      y: 4,
    });
    await waitForText(gmPage, [visibleMonsterName], 'GM visible monster');
    await waitForText(gmPage, [concealedMonsterName], 'GM concealed monster');
    await concealCombatant(gmPage, concealedMonsterName);

    step('verify the role-specific scene projection');
    const concealedEntityId = await findCombatantId({
      gmPage,
      name: concealedMonsterName,
      sessionId,
      serverUrl,
    });
    const visibleEntityId = await findCombatantId({
      gmPage,
      name: visibleMonsterName,
      sessionId,
      serverUrl,
    });

    await assertPlayerCannotSee(playerPage, {
      identifiers: [concealedEntityId, concealedMonsterName],
      label: 'concealed monster after the first conceal',
    });
    await assertSceneProjections({
      concealedEntityId,
      concealedMonsterName,
      gmPage,
      label: 'after the first conceal',
      playerPage,
      sessionId,
      serverUrl,
      visibleEntityId,
      visibleMonsterName,
    });

    // Known M1 limitation: no stream event carries a scene projection, so a
    // creature the GM has just placed, revealed or concealed reaches a Player
    // only when that Player reloads their read models. `Recover` is the visible
    // control for that, and it is what a player at this table actually presses.
    // The server-side projection is proved directly by `assertSceneProjections`
    // above, which does not depend on any client refresh.
    await clickButton(playerPage, ['Recover']);

    step('GM moves a monster through the UI');
    // Straight below the Player's cell at 3,2. The melee baseline is five feet
    // and a diagonal does not qualify, so an off-by-one here reads as a product
    // failure when it is really the harness standing in the wrong square.
    await repositionCombatant(gmPage, visibleMonsterName, 3, 3);

    step('GM requests the proficient ability check');
    await requestResolution(gmPage, {
      ability: SHARED_ABILITY,
      dc: 12,
      kind: 'ability_check',
      reason: 'Slip past the watch hound',
      skill: PROFICIENT_SKILL,
      stance: 'normal',
    });
    await waitForText(
      playerPage,
      ['The GM is waiting on you'],
      'Player pending panel',
    );
    await waitFor(playerPage, {
      label: 'Player pending proficient check',
      predicate: `(() => {
        const node = document.querySelector('[data-testid="m1-player-pending"]');
        return Boolean(node && node.innerText.includes('Stealth'));
      })()`,
    });

    step('Player resolves the proficient ability check');
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });
    const proficientCheck = await waitForResolution({
      gmPage,
      kind: 'ability_check',
      sessionId,
      serverUrl,
      skill: PROFICIENT_SKILL,
    });
    assertProficiencyBreakdown(proficientCheck, {
      expectProficiency: true,
      label: 'proficient ability check',
    });
    await assertResultUiShowsProficiency(playerPage, {
      expectProficiency: true,
      label: 'proficient ability check',
      total: proficientCheck.total,
    });

    step('GM requests the non-proficient comparison check');
    await requestResolution(gmPage, {
      ability: SHARED_ABILITY,
      dc: 12,
      kind: 'ability_check',
      reason: 'Vault the crates',
      skill: NON_PROFICIENT_SKILL,
      stance: 'normal',
    });
    await waitFor(playerPage, {
      label: 'Player pending non-proficient check',
      predicate: `(() => {
        const node = document.querySelector('[data-testid="m1-player-pending"]');
        return Boolean(node && node.innerText.includes('Acrobatics'));
      })()`,
    });

    step('Player resolves the non-proficient check');
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });
    const nonProficientCheck = await waitForResolution({
      gmPage,
      kind: 'ability_check',
      sessionId,
      serverUrl,
      skill: NON_PROFICIENT_SKILL,
    });
    assertProficiencyBreakdown(nonProficientCheck, {
      expectProficiency: false,
      label: 'non-proficient ability check',
    });

    if (
      nonProficientCheck.modifierTotal !==
      proficientCheck.modifierTotal - EXPECTED_PROFICIENCY_BONUS
    ) {
      fail(
        `Two Dexterity checks differed by ${
          proficientCheck.modifierTotal - nonProficientCheck.modifierTotal
        }, not by the proficiency bonus ${EXPECTED_PROFICIENCY_BONUS}.`,
      );
    }

    step('GM requests the proficient saving throw');
    await requestResolution(gmPage, {
      ability: PROFICIENT_SAVE,
      dc: 13,
      kind: 'saving_throw',
      reason: 'Dodge the falling beam',
      skill: '',
      stance: 'normal',
    });
    await waitFor(playerPage, {
      label: 'Player pending saving throw',
      predicate: `(() => {
        const node = document.querySelector('[data-testid="m1-player-pending"]');
        return Boolean(node && node.innerText.includes('Saving throw'));
      })()`,
    });

    step('Player resolves the proficient saving throw');
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });
    const proficientSave = await waitForResolution({
      gmPage,
      kind: 'saving_throw',
      sessionId,
      serverUrl,
    });
    assertProficiencyBreakdown(proficientSave, {
      expectProficiency: true,
      label: 'proficient saving throw',
    });

    step('GM applies poisoned and the Player sees it');
    await clickButton(gmPage, ['Apply poisoned'], {
      scope: '[data-testid="m1-gm-conditions"]',
    });
    await waitFor(playerPage, {
      label: 'Player poisoned condition',
      predicate: `Boolean(document.querySelector('[data-testid="m1-player-conditions"] [data-condition="poisoned"]'))`,
    });

    step('poisoned makes an ability check keep the lower die');
    await requestResolution(gmPage, {
      ability: SHARED_ABILITY,
      dc: 12,
      kind: 'ability_check',
      reason: 'Steady hands while poisoned',
      skill: PROFICIENT_SKILL,
      stance: 'normal',
    });
    await waitFor(playerPage, {
      label: 'Player pending poisoned check',
      predicate: `(() => {
        const node = document.querySelector('[data-testid="m1-player-pending"]');
        return Boolean(node && node.innerText.includes('Stealth'));
      })()`,
    });
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });
    const poisonedCheck = await waitForResolution({
      afterCount: 1,
      gmPage,
      kind: 'ability_check',
      sessionId,
      serverUrl,
      skill: PROFICIENT_SKILL,
    });

    if (poisonedCheck.dice.length !== 2) {
      fail(
        `Poisoned should roll two dice; the audit recorded ${poisonedCheck.dice.length}.`,
      );
    }

    if (poisonedCheck.selectedDie !== Math.min(...poisonedCheck.dice)) {
      fail(
        `Poisoned kept ${poisonedCheck.selectedDie} out of [${poisonedCheck.dice}] instead of the lower die.`,
      );
    }

    if (
      !(poisonedCheck.stanceSources ?? []).some(
        (source) => source.detail === 'poisoned',
      )
    ) {
      fail('Poisoned was not named as the source of the disadvantage.');
    }

    step('poisoned leaves saving throws alone');
    await requestResolution(gmPage, {
      ability: PROFICIENT_SAVE,
      dc: 13,
      kind: 'saving_throw',
      reason: 'Saves are unaffected by poisoned',
      skill: '',
      stance: 'normal',
    });
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
      timeoutMs: defaultTimeoutMs,
    });
    const poisonedSave = await waitForResolution({
      afterCount: 1,
      gmPage,
      kind: 'saving_throw',
      sessionId,
      serverUrl,
    });

    if (poisonedSave.dice.length !== 1 || poisonedSave.stance !== 'normal') {
      fail(
        `Poisoned changed a saving throw: stance ${poisonedSave.stance}, ${poisonedSave.dice.length} dice.`,
      );
    }

    step('Player submits an intent and the GM transitions it');
    await runIntentLifecycle({ gmPage, playerPage });

    step('GM starts the encounter');
    await clickButton(gmPage, ['Start Encounter']);
    // The panel heading is CSS-uppercased in `innerText`; match either casing.
    await waitForText(
      gmPage,
      ['Encounter status', 'ENCOUNTER STATUS'],
      'GM encounter status',
    );

    step('Player attacks the visible monster');
    const attack = await runPlayerAttack({
      gmPage,
      playerPage,
      sessionId,
      serverUrl,
      targetCombatantId: visibleEntityId,
      targetName: visibleMonsterName,
    });

    step('GM reveals the concealed monster and the Player receives it');
    // Everything before this index is a stretch in which the creature was
    // concealed, and is what the leak checks are allowed to look at.
    const preRevealFrameIndex = await countSseFrames(playerPage);

    await revealCombatant(gmPage, concealedMonsterName);
    await clickButton(playerPage, ['Recover']);
    await assertSceneProjections({
      concealedEntityId,
      concealedMonsterName,
      expectConcealedVisible: true,
      gmPage,
      label: 'after the reveal',
      playerPage,
      sessionId,
      serverUrl,
      visibleEntityId,
      visibleMonsterName,
    });

    step('GM conceals it again and the Player loses it');
    const preReconcealFrameIndex = await countSseFrames(playerPage);

    await concealCombatant(gmPage, concealedMonsterName);
    await clickButton(playerPage, ['Recover']);
    await assertPlayerCannotSee(playerPage, {
      fromIndex: preReconcealFrameIndex + 1,
      identifiers: [concealedEntityId, concealedMonsterName],
      label: 'concealed monster after re-conceal',
    });
    await assertSceneProjections({
      concealedEntityId,
      concealedMonsterName,
      gmPage,
      label: 'after the re-conceal',
      playerPage,
      sessionId,
      serverUrl,
      visibleEntityId,
      visibleMonsterName,
    });

    step('compare the GM and Player named SSE frames');
    await compareRoleProjections({
      concealedEntityId,
      concealedMonsterName,
      concealedUntilIndex: preRevealFrameIndex,
      gmPage,
      playerPage,
    });

    step('refresh the Player browser and recover through the visible UI');
    const playerCredentialBefore = await fingerprintCredential(
      playerPage,
      sessionId,
      'player-001',
    );
    const playerTokenBefore = await extractToken(
      playerPage,
      sessionId,
      'player-001',
    );
    await reload(playerPage);
    await waitForText(playerPage, ['Runtime War Table'], 'Player after reload');
    await clickButton(playerPage, ['Recover']);
    await assertPlayerTableRestored(playerPage, {
      characterName,
      concealedEntityId,
      concealedMonsterName,
      visibleMonsterName,
    });
    // A reload starts a fresh frame buffer, so everything captured from here on
    // belongs to the concealed stretch again.
    await waitForSseOpen(playerPage, 'Player after recovery');

    const playerCredentialAfter = await fingerprintCredential(
      playerPage,
      sessionId,
      'player-001',
    );

    if (!playerCredentialAfter) {
      fail('The Player holds no credential after recovering.');
    }

    console.log(
      `[m1-full-loop] Player credential ${playerCredentialBefore} -> ${playerCredentialAfter}`,
    );

    // Recovering an owned seat mints a fresh token by design - the account
    // proved its claim through the durable seat binding. What must not survive
    // is the old one: a rotated credential that still works is a credential
    // that was never really rotated.
    if (playerCredentialBefore !== playerCredentialAfter) {
      const staleAccepted = await postCommand({
        body: {
          actor: { participantId: 'player-001' },
          commandId: `m1-smoke-stale-token-${runId}`,
          payload: { sessionId },
          type: 'get_encounter_state',
        },
        path: '/api/encounters/command',
        serverUrl,
        token: playerTokenBefore,
      });

      if (staleAccepted.ok) {
        fail('The credential held before the refresh still works after it.');
      }
    }

    step('refresh the GM browser and recover through the visible UI');
    await reload(gmPage);
    await waitForText(gmPage, ['Runtime War Table'], 'GM after reload');
    await clickButton(gmPage, ['Recover']);
    await waitForText(
      gmPage,
      ['Encounter status', 'ENCOUNTER STATUS'],
      'GM encounter after reload',
    );
    await assertNoDuplicateTerminalRecords(gmPage, {
      sessionId,
      serverUrl,
    });
    await waitForSseOpen(gmPage, 'GM after recovery');

    step('probe a hostile seat reclaim from a third account');
    await probeHostileReclaim({
      hostile,
      sessionId,
      serverUrl,
    });

    step('probe a Player attempting a GM-only command');
    await probePlayerGmCommand({
      playerPage,
      sessionId,
      serverUrl,
      visibleEntityId,
    });

    step('probe a Player subscribing to another seat stream');
    await probeCrossSeatSubscription({
      playerPage,
      sessionId,
      serverUrl,
    });

    step('continue play with one valid post-recovery action');
    await requestResolution(gmPage, {
      ability: SHARED_ABILITY,
      dc: 10,
      kind: 'ability_check',
      reason: 'One more after recovery',
      skill: NON_PROFICIENT_SKILL,
      stance: 'normal',
    });
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });
    await waitForResolution({
      afterCount: 1,
      gmPage,
      kind: 'ability_check',
      sessionId,
      serverUrl,
      skill: NON_PROFICIENT_SKILL,
    });

    step('assert the run left no console or network damage');
    await assertCleanBrowsers({ gmPage, playerPage });

    console.log(
      `[m1-full-loop] passed - session ${sessionId}, attack dealt ${attack.damage} damage in ${attack.swings} swing(s), target left on ${attack.hp} HP`,
    );
  } catch (error) {
    await captureFailure(error);
    throw error;
  } finally {
    await Promise.allSettled([gmPage.close(), playerPage.close()]);
    await cleanup();
  }

  process.exit(0);
}

// --- table setup -----------------------------------------------------------

async function seedLibraryEntry({ account, characterName, serverUrl }) {
  const created = await postCommand({
    body: {
      actor: { participantId: account.user.id },
      commandId: `m1-smoke-create-entry-${runId}`,
      payload: {
        entry: {
          abilities: {
            cha: 12,
            con: 12,
            dex: DEX_SCORE,
            int: 10,
            str: 8,
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
      commandId: `m1-smoke-finalize-entry-${runId}`,
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

async function waitForStoredSessionId(page, expected) {
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

async function setSessionCode(page, sessionId) {
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
async function setCell(page, x, y) {
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

async function createCombatant(page, { armorClass, hp, name, x, y }) {
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

function combatantRowExpression(name) {
  return `[...document.querySelectorAll('[data-testid="m1-gm-visibility"] li')].find(
    (row) => row.innerText.includes(${JSON.stringify(name)}))`;
}

async function concealCombatant(page, name) {
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

async function revealCombatant(page, name) {
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

async function repositionCombatant(page, name, x, y) {
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

async function requestResolution(page, input) {
  await setFieldValue(page, '#m1-gm-kind', input.kind);
  await setFieldValue(page, '#m1-gm-ability', input.ability);

  if (input.kind === 'ability_check') {
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
async function readSessionSnapshot({ gmPage }) {
  const frames = await readSseFrames(gmPage);
  const latest = frames
    .filter((frame) => frame.event === 'session_state')
    .at(-1);

  if (!latest?.parsed?.state) {
    fail('The GM stream has not carried a session_state frame yet.');
  }

  return latest.parsed.state;
}

async function readAssignedCharacterId({ gmPage }) {
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

async function readCharacter({ characterId, gmPage, sessionId, serverUrl }) {
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

async function readActiveScene({ gmPage, sessionId, serverUrl }) {
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
async function readSceneForSeat({
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
async function assertSceneProjections({
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

async function waitForActiveScenePlacement({
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

async function findCombatantId({ gmPage, name, sessionId, serverUrl }) {
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

async function readTableState({ gmPage, sessionId, serverUrl }) {
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
async function waitForResolution({
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

function assertProficiencyBreakdown(resolution, { expectProficiency, label }) {
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

async function assertResultUiShowsProficiency(
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

const INTENT_TEXTS = [
  'I listen at the cellar door <b>carefully</b>',
  'I ready my crossbow behind the crates',
  'I whistle to draw the hound away',
];

async function submitIntent(playerPage, text) {
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

function gmIntentRowExpression(text) {
  return `[...document.querySelectorAll('[data-testid="m1-gm-intents"] li')].find(
    (row) => row.innerText.includes(${JSON.stringify(text)}))`;
}

async function transitionIntent(gmPage, text, buttonLabel) {
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

async function runIntentLifecycle({ gmPage, playerPage }) {
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
    const terminal = await gmPage.evaluate(`(() => {
      const row = ${gmIntentRowExpression(text)};
      return row ? row.dataset.intentTerminal : null;
    })()`);

    if (transition.button !== 'Mark seen' && terminal !== 'true') {
      fail(
        `Intent ${index + 1} was not marked terminal after ${transition.button}.`,
      );
    }
  }
}

// --- encounter -------------------------------------------------------------

async function readEncounter({ gmPage, sessionId, serverUrl }) {
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
async function runPlayerAttack({
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
      if (attackFrame.damage <= 0) {
        fail('The server reported a hit that dealt no damage.');
      }

      if (targetBefore - targetAfter !== attackFrame.damage) {
        fail(
          `HP fell by ${targetBefore - targetAfter} but the server reported ${attackFrame.damage} damage.`,
        );
      }

      landed = { damage: attackFrame.damage, hp: targetAfter, swings };
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
      `No attack landed in ${swings} swings against a deliberately low armour class; the attack path is not producing damage.`,
    );
  }

  return landed;
}

async function advanceToPlayerTurn({ gmPage, sessionId, serverUrl }) {
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

function currentTurnParticipantId(encounter) {
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
async function readCombatantHp({ combatantId, gmPage, sessionId, serverUrl }) {
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
async function settleCombatantHp({
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

async function waitForCombatEvent(gmPage, playerPage, sinceIndex = 0) {
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
async function assertPlayerCannotSee(
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

function countSseFrames(page) {
  return page.evaluate(`(window.__m1Sse?.frames ?? []).length`);
}

async function compareRoleProjections({
  concealedEntityId,
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

  // Bounded by the reveal: after it, the Player is entitled to the creature.
  const concealedWindow = playerFrames.slice(0, concealedUntilIndex);

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

async function assertPlayerTableRestored(
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

async function assertNoDuplicateTerminalRecords(
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

async function probeHostileReclaim({ hostile, sessionId, serverUrl }) {
  const claimed = await postCommand({
    body: {
      actor: {
        displayName: 'M1 Interloper',
        participantId: 'dm-001',
        role: 'dm',
      },
      commandId: `m1-smoke-hostile-reclaim-${runId}`,
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
      commandId: `m1-smoke-hostile-join-${runId}`,
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

async function probePlayerGmCommand({
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
      commandId: `m1-smoke-player-gm-command-${runId}`,
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

async function probeCrossSeatSubscription({
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

async function assertCleanBrowsers({ gmPage, playerPage }) {
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
