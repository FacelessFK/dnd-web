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
  assertHeadedBrowser,
  captureArtifacts,
  captureStage,
  cleanup,
  clickButton,
  clickButtonIfEnabled,
  createCdpPage,
  defaultTimeoutMs,
  extractToken,
  findBrowserExecutable,
  fingerprintCredential,
  forceLocale,
  getFreePort,
  launchBrowserProfile,
  loadRepoEnvironment,
  loginInBrowser,
  navigate,
  openGameMasterTool,
  nextBin,
  postCommand,
  printProcessLogs,
  redactSecrets,
  registerAccount,
  reload,
  runDbReadinessCheck,
  serverDir,
  setLabeledField,
  startProcess,
  installSseRecorder,
  waitFor,
  waitForHttp,
  waitForNoText,
  waitForParticipantCredential,
  waitForSseOpen,
  waitForText,
  webDir,
} from './m1-harness-lib.mjs';
import { assertWebUiTargetsServer } from './runtime-smoke-diagnostics.mjs';
import {
  assertCleanBrowsers,
  assertNoDuplicateTerminalRecords,
  assertPlayerCannotSee,
  assertPlayerTableRestored,
  assertProficiencyBreakdown,
  assertResultUiShowsProficiency,
  assertSceneProjections,
  compareRoleProjections,
  concealCombatant,
  createCombatant,
  EXPECTED_PROFICIENCY_BONUS,
  fail,
  findCombatantId,
  NON_PROFICIENT_SKILL,
  PROFICIENT_SAVE,
  PROFICIENT_SKILL,
  probeCrossSeatSubscription,
  probeHostileReclaim,
  probePlayerGmCommand,
  readAssignedCharacterId,
  readCharacter,
  repositionCombatant,
  requestResolution,
  revealCombatant,
  runIntentLifecycle,
  runPlayerAttack,
  seedLibraryEntry,
  settleSseFrames,
  setRunTag,
  setCell,
  setSessionCode,
  SHARED_ABILITY,
  waitForActiveScenePlacement,
  waitForResolution,
  waitForStoredSessionId,
} from './m1-table-flow.mjs';

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const runDir = resolve(artifactRoot, `full-loop-${runId}`);

/**
 * Headed runs are the local acceptance; CI stays headless.
 *
 * When headed, the run additionally proves it is really on screen and writes a
 * screenshot at each named point of the journey, which is the evidence a
 * reviewer can actually look at.
 */
const headed = ['1', 'true', 'yes'].includes(
  (process.env.RUNTIME_SMOKE_HEADED ?? '').trim().toLowerCase(),
);

async function stage(name) {
  if (!headed && process.env.M1_SMOKE_CAPTURE !== '1') {
    return;
  }

  const written = await captureStage(runDir, name, pages);

  if (written.length > 0) {
    console.log(`[m1-full-loop]   captured ${name}`);
  }
}

setRunTag(runId);
loadRepoEnvironment();

const steps = [];
let stepIndex = 0;

function step(label) {
  stepIndex += 1;
  steps.push(label);
  console.log(`[m1-full-loop] ${String(stepIndex).padStart(2, '0')} ${label}`);
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
  const gmChrome = launchBrowserProfile('gm', browserPath, gmDebugPort, {
    windowPosition: { x: 0, y: 0 },
    windowSize: { height: 1080, width: 950 },
  });
  const playerChrome = launchBrowserProfile(
    'player',
    browserPath,
    playerDebugPort,
    {
      windowPosition: { x: 960, y: 0 },
      windowSize: { height: 1080, width: 950 },
    },
  );
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

  if (headed) {
    for (const [page, chrome] of [
      [gmPage, gmChrome],
      [playerPage, playerChrome],
    ]) {
      const proof = await assertHeadedBrowser(page, chrome);

      console.log(
        `[m1-full-loop]   ${page.label} on screen: window ${proof.outerWidth}x${proof.outerHeight} at ${proof.screenX},${proof.screenY} on a ${proof.screenWidth}x${proof.screenHeight} display (avail ${proof.availWidth}x${proof.availHeight}), dpr ${proof.devicePixelRatio}, ua "${proof.userAgent}"`,
      );
    }
  }

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
    // 'Create Scene' is the scenario shortcut on the Table tools, not the
    // Scene Builder's 'Create Custom Scene'.
    await openGameMasterTool(gmPage, 'table');
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
    await waitForParticipantCredential(gmPage, sessionId, 'GM');
    await clickButton(gmPage, ['Subscribe SSE']);
    await waitForSseOpen(gmPage, 'GM');

    step('Player joins with the session code');
    await setSessionCode(playerPage, sessionId);
    await clickButton(playerPage, ['Join Session']);
    await waitForStoredSessionId(playerPage, sessionId);
    // The stored session code is set by typing it, not by joining, so it does
    // not mean the join finished. Subscribing before the credential lands is a
    // subscription the seat cannot authenticate.
    await waitForParticipantCredential(playerPage, sessionId, 'Player');
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
    await openGameMasterTool(gmPage, 'roster');
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

    // Both monsters are placed visible, so the Player's scene frames up to this
    // point legitimately name the second one - it was not concealed yet. The
    // window has to open here, exactly as it does for the reveal and re-conceal
    // below. Under M1 no stream event carried a scene at all, so scanning from
    // frame zero was safe; M2's live scene frames made that stale.
    const preConcealFrameIndex = await settleSseFrames(playerPage);

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
      fromIndex: preConcealFrameIndex,
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

    await stage('gm-and-player-maps');

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

    await stage('proficient-check');

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

    await stage('non-proficient-check');

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

    await stage('saving-throw');

    step('GM applies poisoned and the Player sees it');
    await clickButton(gmPage, ['Apply poisoned'], {
      scope: '[data-testid="m1-gm-conditions"]',
    });
    await waitFor(playerPage, {
      label: 'Player poisoned condition',
      predicate: `Boolean(document.querySelector('[data-testid="m1-player-conditions"] [data-condition="poisoned"]'))`,
    });

    await stage('poisoned');

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

    await stage('poisoned-roll-explanation');

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

    await stage('intent-transitions');

    step('GM starts the encounter');
    await openGameMasterTool(gmPage, 'table');
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

    await stage('encounter-attack-damage-hp');

    step('GM reveals the concealed monster and the Player receives it');
    // Everything before this index is a stretch in which the creature was
    // concealed, and is what the leak checks are allowed to look at. Settling
    // first makes that stretch cover every frame the conceal actually produced
    // rather than however many had arrived when the count was sampled.
    const preRevealFrameIndex = await settleSseFrames(playerPage);

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

    await stage('reveal');

    step('GM conceals it again and the Player loses it');
    // The reveal's own `Recover` burst is still landing here; settling is what
    // keeps those legitimately-revealed frames out of the re-conceal window.
    const preReconcealFrameIndex = await settleSseFrames(playerPage);

    await concealCombatant(gmPage, concealedMonsterName);
    await clickButton(playerPage, ['Recover']);
    await assertPlayerCannotSee(playerPage, {
      fromIndex: preReconcealFrameIndex,
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

    await stage('re-conceal');

    step('compare the GM and Player named SSE frames');
    await compareRoleProjections({
      concealedEntityId,
      concealedFromIndex: preConcealFrameIndex,
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
    await stage('disconnected-state');
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

    await stage('recovered-state');

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
