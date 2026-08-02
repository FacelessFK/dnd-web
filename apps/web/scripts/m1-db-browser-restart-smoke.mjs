#!/usr/bin/env node
/**
 * The M1 table surviving a real PostgreSQL-backed server restart, in a browser.
 *
 * `apps/server/scripts/m1-db-restart-smoke.mjs` already proves the backend
 * comes back. It cannot prove the thing a player actually cares about: that the
 * windows they left open can be brought back to the same table by pressing
 * Recover. That needs browsers, and that is what this is.
 *
 * "Restart" means what it says. Server process A is spawned, killed, its PID
 * confirmed reaped and its port confirmed released; server process B is a
 * separate spawn with a different PID against the same database. The web
 * process and both Chrome profiles stay up across the gap, so the tabs are the
 * same tabs. A React remount, a browser refresh, or a second runtime inside one
 * process would prove nothing.
 *
 * Each run provisions its own database and drops it afterwards, so three runs
 * are three clean rooms rather than one accumulating one.
 *
 * The credential story is the interesting part. Participant tokens are
 * process-local by design, so process A's are unverifiable the moment it dies.
 * What survives is the seat binding in `session_seat_ownership`, and the
 * account proves its claim with that. This asserts both halves: the browsers
 * come back with different tokens, and the ones they held before the restart
 * are refused.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import {
  artifactRoot,
  captureArtifacts,
  cleanup,
  clickButton,
  clickButtonIfEnabled,
  createCdpPage,
  dbDir,
  delay,
  extractToken,
  findBrowserExecutable,
  fingerprintCredential,
  forceLocale,
  getFreePort,
  installSseRecorder,
  isProcessAlive,
  launchBrowserProfile,
  loadRepoEnvironment,
  loginInBrowser,
  navigate,
  openGameMasterTool,
  nextBin,
  postCommand,
  printProcessLogs,
  readSseFrames,
  redactSecrets,
  registerAccount,
  runDbReadinessCheck,
  serverDir,
  setLabeledField,
  startProcess,
  stopProcess,
  waitFor,
  waitForHttp,
  waitForNoText,
  waitForPortRelease,
  waitForParticipantCredential,
  waitForSseOpen,
  waitForText,
  webDir,
} from './m1-harness-lib.mjs';
import { assertWebUiTargetsServer } from './runtime-smoke-diagnostics.mjs';
import {
  assertPlayerCannotSee,
  assertProficiencyBreakdown,
  assertSceneProjections,
  concealCombatant,
  countSseFrames,
  createCombatant,
  settleSseFrames,
  fail,
  findCombatantId,
  NON_PROFICIENT_SKILL,
  PROFICIENT_SAVE,
  PROFICIENT_SKILL,
  readAssignedCharacterId,
  readCharacter,
  requestResolution,
  runIntentLifecycle,
  runPlayerAttack,
  seedLibraryEntry,
  setCell,
  setRunTag,
  setSessionCode,
  SHARED_ABILITY,
  waitForActiveScenePlacement,
  waitForResolution,
  waitForStoredSessionId,
} from './m1-table-flow.mjs';

/**
 * `pg` belongs to the packages that own the database, not to the web app.
 *
 * Resolving it from `@dnd/db` keeps it that way: this harness lives beside the
 * browser harnesses because it drives the browser, but adding a PostgreSQL
 * driver to `apps/web`'s dependencies to provision one test database would put
 * it in the web bundle's dependency graph for no product reason.
 */
const { Client } = createRequire(import.meta.url)(
  resolve(dbDir, 'node_modules/pg/lib/index.js'),
);

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const runDir = resolve(artifactRoot, `db-restart-${runId}`);

setRunTag(runId);
loadRepoEnvironment();

const steps = [];
let stepIndex = 0;
let provisioned = null;
const pages = {};

function step(label) {
  stepIndex += 1;
  steps.push(label);
  console.log(`[m1-db-restart] ${String(stepIndex).padStart(2, '0')} ${label}`);
}

async function captureFailure(error) {
  try {
    const written = await captureArtifacts(runDir, 'failure', pages, {
      error: redactSecrets(error instanceof Error ? error.stack : error),
      failedStep: steps.at(-1) ?? null,
      steps,
    });
    console.error(`[m1-db-restart] artifacts: ${written}`);
  } catch (artifactError) {
    console.error(`[m1-db-restart] artifact capture failed: ${artifactError}`);
  }
}

main().catch(async (error) => {
  console.error('\n[m1-db-restart] failed');
  console.error(redactSecrets(error instanceof Error ? error.stack : error));
  printProcessLogs();
  await cleanup();
  await dropDatabase();
  process.exit(1);
});

async function main() {
  const browserPath = findBrowserExecutable();

  if (!browserPath) {
    fail(
      'No Chrome/Chromium executable found. Set RUNTIME_SMOKE_BROWSER=/path/to/chrome.',
    );
  }

  if (!process.env.DATABASE_URL) {
    fail(
      'DATABASE_URL is required. This harness provisions its own database from that connection and drops it afterwards.',
    );
  }

  step('provision a clean isolated database');
  provisioned = await provisionDatabase(process.env.DATABASE_URL);

  step('apply migrations and confirm readiness');
  await runNodeScript(resolve(dbDir, 'scripts/apply-db-migrations.mjs'), {
    DATABASE_URL: provisioned.url,
  });
  await runDbReadinessCheck({
    ...process.env,
    DATABASE_URL: provisioned.url,
  });

  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const gmDebugPort = await getFreePort();
  const playerDebugPort = await getFreePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const runtimeUrl = `${webOrigin}/runtime`;

  const gmAccount = {
    displayName: 'Restart GM',
    email: `m1r-gm-${runId}@example.test`,
    password: `m1r-gm-password-${runId}`,
  };
  const playerAccount = {
    displayName: 'Restart Player',
    email: `m1r-player-${runId}@example.test`,
    password: `m1r-player-password-${runId}`,
  };
  const strangerAccount = {
    displayName: 'Restart Stranger',
    email: `m1r-stranger-${runId}@example.test`,
    password: `m1r-stranger-password-${runId}`,
  };
  const characterName = `Wren ${runId.slice(-5)}`;
  const visibleMonsterName = `Kennel Hound ${runId.slice(-4)}`;
  const concealedMonsterName = `Rafter Spy ${runId.slice(-4)}`;
  const serverEnv = {
    DATABASE_URL: provisioned.url,
    NEXT_PUBLIC_APP_URL: webOrigin,
    SERVER_PERSISTENCE_MODE: 'db',
    SERVER_PORT: String(serverPort),
  };

  step('start server process A');
  const serverA = startProcess(
    'server-a',
    process.execPath,
    ['--import', 'tsx', 'src/index.ts'],
    { cwd: serverDir, env: serverEnv },
  );
  await waitForHttp(`${serverUrl}/`, { label: 'server process A' });
  console.log(`[m1-db-restart]   server process A pid ${serverA.pid}`);

  step('start the web application');
  startProcess(
    'web',
    process.execPath,
    [nextBin, 'dev', '-p', String(webPort), '-H', '127.0.0.1'],
    { cwd: webDir, env: { NEXT_PUBLIC_SERVER_URL: serverUrl } },
  );
  await waitForHttp(runtimeUrl, { label: '/runtime' });
  await assertWebUiTargetsServer(runtimeUrl, serverUrl);

  step('register accounts and seed the proficient library entry');
  await registerAccount(serverUrl, gmAccount);
  const player = await registerAccount(serverUrl, playerAccount);
  const stranger = await registerAccount(serverUrl, strangerAccount);
  const libraryEntryId = await seedLibraryEntry({
    account: player,
    characterName,
    serverUrl,
  });

  step('launch isolated GM and Player browser profiles');
  launchBrowserProfile('restart-gm', browserPath, gmDebugPort, {
    windowPosition: { x: 0, y: 0 },
    windowSize: { height: 1080, width: 950 },
  });
  launchBrowserProfile('restart-player', browserPath, playerDebugPort, {
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

  await installSseRecorder(gmPage);
  await installSseRecorder(playerPage);

  try {
    step('authenticate both seats in their own browsers');
    // Persian is the default locale, so the first wait has to accept it; the
    // assertions afterwards name English copy, which is what forcing it buys.
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

    step('build the M1 table through the real UI');
    await clickButton(gmPage, ['Create Session']);
    const sessionId = await waitForStoredSessionId(gmPage);
    console.log(`[m1-db-restart]   session ${sessionId}`);

    // 'Create Scene' is the scenario shortcut on the Table tools, not the
    // Scene Builder's 'Create Custom Scene'.
    await openGameMasterTool(gmPage, 'table');
    await clickButton(gmPage, ['Create Scene']);
    await waitForText(gmPage, ['Tactical Grid'], 'GM tactical grid');
    await waitForParticipantCredential(gmPage, sessionId, 'GM');
    await clickButton(gmPage, ['Subscribe SSE']);
    await waitForSseOpen(gmPage, 'GM');

    await setSessionCode(playerPage, sessionId);
    await clickButton(playerPage, ['Join Session']);
    await waitForStoredSessionId(playerPage, sessionId);
    // The stored session code is set by typing it, not by joining, so it does
    // not mean the join finished. Subscribing before the credential lands is a
    // subscription the seat cannot authenticate.
    await waitForParticipantCredential(playerPage, sessionId, 'Player');
    await clickButton(playerPage, ['Subscribe SSE']);
    await waitForSseOpen(playerPage, 'Player');

    await waitForText(playerPage, [characterName], 'seeded library entry');
    await clickButton(playerPage, ['Submit Saved Character']);
    await waitForText(
      playerPage,
      ['Runtime copy pending DM assignment'],
      'Player pending assignment',
    );

    await clickButton(gmPage, ['Recover']);
    await waitForText(gmPage, [characterName], 'GM pending character preview');
    await openGameMasterTool(gmPage, 'roster');
    await clickButton(gmPage, ['Assign Runtime Copy']);
    await waitForText(
      gmPage,
      ['No pending character requests'],
      'GM assignment queue drained',
    );

    const assignedCharacterId = await readAssignedCharacterId({ gmPage });

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

    await clickButton(playerPage, ['Recover']);
    await waitForNoText(
      playerPage,
      ['FROM NOT PLACED'],
      'Player token placed before moving',
    );

    await createCombatant(gmPage, {
      armorClass: 1,
      hp: 12,
      name: visibleMonsterName,
      x: 2,
      y: 3,
    });
    await createCombatant(gmPage, {
      hp: 9,
      name: concealedMonsterName,
      x: 6,
      y: 5,
    });

    // Both monsters are placed visible first, so the Player's scene frames up
    // to here legitimately name the second one. The recorder's transcript
    // survives the restart below, so without this boundary the post-restart
    // concealment check would scan frames from before the creature was ever
    // concealed and report correct behaviour as a leak.
    const preConcealFrameIndex = await settleSseFrames(playerPage);

    await concealCombatant(gmPage, concealedMonsterName);

    const visibleEntityId = await findCombatantId({
      gmPage,
      name: visibleMonsterName,
      sessionId,
      serverUrl,
    });
    const concealedEntityId = await findCombatantId({
      gmPage,
      name: concealedMonsterName,
      sessionId,
      serverUrl,
    });

    await clickButton(playerPage, ['Recover']);

    step('complete a check, a saving throw, poisoned, a note and an attack');
    await requestResolution(gmPage, {
      ability: SHARED_ABILITY,
      dc: 12,
      kind: 'ability_check',
      reason: 'Before the lights go out',
      skill: PROFICIENT_SKILL,
      stance: 'normal',
    });
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });
    const checkBefore = await waitForResolution({
      gmPage,
      kind: 'ability_check',
      sessionId,
      serverUrl,
      skill: PROFICIENT_SKILL,
    });
    assertProficiencyBreakdown(checkBefore, {
      expectProficiency: true,
      label: 'pre-restart proficient check',
    });

    await requestResolution(gmPage, {
      ability: PROFICIENT_SAVE,
      dc: 13,
      kind: 'saving_throw',
      reason: 'Brace',
      skill: '',
      stance: 'normal',
    });
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });
    const saveBefore = await waitForResolution({
      gmPage,
      kind: 'saving_throw',
      sessionId,
      serverUrl,
    });
    assertProficiencyBreakdown(saveBefore, {
      expectProficiency: true,
      label: 'pre-restart proficient saving throw',
    });

    await clickButton(gmPage, ['Apply poisoned'], {
      scope: '[data-testid="m1-gm-conditions"]',
    });
    await waitFor(playerPage, {
      label: 'Player poisoned condition',
      predicate: `Boolean(document.querySelector('[data-testid="m1-player-conditions"] [data-condition="poisoned"]'))`,
    });

    await runIntentLifecycle({ gmPage, playerPage });

    await openGameMasterTool(gmPage, 'table');
    await clickButton(gmPage, ['Start Encounter']);
    await waitForText(
      gmPage,
      ['Encounter status', 'ENCOUNTER STATUS'],
      'GM encounter status',
    );

    const attack = await runPlayerAttack({
      gmPage,
      playerPage,
      sessionId,
      serverUrl,
      targetCombatantId: visibleEntityId,
      targetName: visibleMonsterName,
    });

    step('record the authoritative state and the pre-restart credentials');
    const expected = {
      characterId: assignedCharacterId,
      checks: countResolutions(await readFrames(gmPage), 'ability_check'),
      encounter: await readEncounterSnapshot({ gmPage, sessionId, serverUrl }),
      saves: countResolutions(await readFrames(gmPage), 'saving_throw'),
      targetHp: attack.hp,
    };
    const libraryBefore = await readLibraryEntry({
      account: player,
      entryId: libraryEntryId,
      serverUrl,
    });
    const oldGmFingerprint = await fingerprintCredential(
      gmPage,
      sessionId,
      'dm-001',
    );
    const oldPlayerFingerprint = await fingerprintCredential(
      playerPage,
      sessionId,
      'player-001',
    );
    const oldGmToken = await extractToken(gmPage, sessionId, 'dm-001');
    const oldPlayerToken = await extractToken(
      playerPage,
      sessionId,
      'player-001',
    );

    console.log(
      `[m1-db-restart]   pre-restart credentials gm=${oldGmFingerprint} player=${oldPlayerFingerprint}`,
    );

    step('stop server process A completely');
    const pidA = serverA.pid;

    await stopProcess(serverA);

    const reapDeadline = Date.now() + 20000;

    while (isProcessAlive(pidA) && Date.now() < reapDeadline) {
      await delay(250);
    }

    if (isProcessAlive(pidA)) {
      fail(`Server process A (pid ${pidA}) is still alive after SIGTERM.`);
    }

    await waitForPortRelease(serverPort);
    console.log(
      `[m1-db-restart]   pid ${pidA} reaped and port ${serverPort} released`,
    );

    step('confirm the open browsers notice the table is gone');
    // Nothing is reloaded here: these are the same tabs, and the disconnected
    // banner is what a player would actually be looking at.
    await waitForText(
      playerPage,
      ['Disconnected', 'Reconnecting…', 'DISCONNECTED', 'RECONNECTING…'],
      'Player disconnected indicator',
    );

    step('start server process B against the same database');
    const serverB = startProcess(
      'server-b',
      process.execPath,
      ['--import', 'tsx', 'src/index.ts'],
      { cwd: serverDir, env: serverEnv },
    );

    await waitForHttp(`${serverUrl}/`, { label: 'server process B' });
    console.log(`[m1-db-restart]   server process B pid ${serverB.pid}`);

    if (serverB.pid === pidA) {
      fail(
        'Server process B reused the PID of process A; this is not a restart.',
      );
    }

    step('recover the GM seat through the visible UI');
    await clickButton(gmPage, ['Recover']);
    await waitForText(
      gmPage,
      ['Encounter status', 'ENCOUNTER STATUS'],
      'GM encounter after restart',
    );
    await waitForSseOpen(gmPage, 'GM after restart');

    step('recover the Player seat through the visible UI');
    await clickButton(playerPage, ['Recover']);
    await waitForText(
      playerPage,
      [characterName],
      'Player character after restart',
    );
    await waitForSseOpen(playerPage, 'Player after restart');

    step('confirm the credentials rotated and the old ones are refused');
    const newGmFingerprint = await fingerprintCredential(
      gmPage,
      sessionId,
      'dm-001',
    );
    const newPlayerFingerprint = await fingerprintCredential(
      playerPage,
      sessionId,
      'player-001',
    );

    console.log(
      `[m1-db-restart]   post-restart credentials gm=${newGmFingerprint} player=${newPlayerFingerprint}`,
    );

    if (
      newGmFingerprint === oldGmFingerprint ||
      newPlayerFingerprint === oldPlayerFingerprint
    ) {
      fail(
        'A credential survived the restart unchanged. Participant tokens are process-local; the process that issued them is gone.',
      );
    }

    for (const [label, participantId, token] of [
      ['GM', 'dm-001', oldGmToken],
      ['Player', 'player-001', oldPlayerToken],
    ]) {
      const stale = await postCommand({
        body: {
          actor: { participantId },
          commandId: `m1-restart-stale-${label}-${runId}`,
          payload: { sessionId },
          type: 'get_encounter_state',
        },
        path: '/api/encounters/command',
        serverUrl,
        token,
      });

      if (stale.ok) {
        fail(`The ${label} credential from before the restart still works.`);
      }
    }

    step('confirm an unrelated account cannot recover either seat');
    for (const participantId of ['dm-001', 'player-001']) {
      const claimed = await postCommand({
        body: {
          actor: { participantId, role: 'dm' },
          commandId: `m1-restart-stranger-${participantId}-${runId}`,
          payload: { sessionId },
          type: 'reconnect_session',
        },
        cookie: stranger.cookie,
        path: '/api/session/command',
        serverUrl,
      });

      if (claimed.ok) {
        fail(`An unrelated account recovered the ${participantId} seat.`);
      }
    }

    step('verify the visible table came back');
    const recovered = await readEncounterSnapshot({
      gmPage,
      sessionId,
      serverUrl,
    });

    if (recovered.id !== expected.encounter.id) {
      fail('A different encounter came back after the restart.');
    }

    if (recovered.roundNumber !== expected.encounter.roundNumber) {
      fail(
        `Round number changed across the restart: ${expected.encounter.roundNumber} then ${recovered.roundNumber}.`,
      );
    }

    const recoveredCharacter = await readCharacter({
      characterId: assignedCharacterId,
      gmPage,
      sessionId,
      serverUrl,
    });

    if (!recoveredCharacter.proficiencies?.skills?.includes(PROFICIENT_SKILL)) {
      fail('Proficiency data did not survive the restart.');
    }

    if (
      recoveredCharacter.proficiencies.skills.includes(NON_PROFICIENT_SKILL)
    ) {
      fail(
        'A proficiency appeared across the restart that was never recorded.',
      );
    }

    // Read from the Player's own panel rather than from the character record:
    // conditions live on the runtime overlay, and what the acceptance cares
    // about is that the person sitting in that seat can still see they are
    // poisoned after the process that told them so has been replaced.
    await waitFor(playerPage, {
      label: 'poisoned still shown to the Player after the restart',
      predicate: `Boolean(document.querySelector('[data-testid="m1-player-conditions"] [data-condition="poisoned"]'))`,
    });

    const hpAfterRestart = await readCombatantHpAfterRestart({
      combatantId: visibleEntityId,
      gmPage,
      sessionId,
      serverUrl,
    });

    if (hpAfterRestart !== expected.targetHp) {
      fail(
        `Combatant HP changed across the restart: ${expected.targetHp} then ${hpAfterRestart}.`,
      );
    }

    const framesAfter = await readFrames(gmPage);

    if (countResolutions(framesAfter, 'ability_check') < expected.checks) {
      fail('The check audit did not come back after the restart.');
    }

    if (countResolutions(framesAfter, 'saving_throw') < expected.saves) {
      fail('The saving-throw audit did not come back after the restart.');
    }

    await waitFor(gmPage, {
      label: 'terminal intents restored after the restart',
      predicate: `(() => {
        const rows = [...document.querySelectorAll('[data-testid="m1-gm-intents"] li')];
        return rows.length === 3 &&
          rows.filter((row) => row.dataset.intentTerminal === 'true').length === 2;
      })()`,
    });

    step('verify concealment survived the restart');
    await assertPlayerCannotSee(playerPage, {
      fromIndex: preConcealFrameIndex,
      identifiers: [concealedEntityId, concealedMonsterName],
      label: 'concealment across a restart',
    });
    await assertSceneProjections({
      concealedEntityId,
      concealedMonsterName,
      gmPage,
      label: 'after the restart',
      playerPage,
      sessionId,
      serverUrl,
      visibleEntityId,
      visibleMonsterName,
    });

    step('verify the Character Library source record is untouched');
    const libraryAfter = await readLibraryEntry({
      account: player,
      entryId: libraryEntryId,
      serverUrl,
    });

    if (JSON.stringify(libraryBefore) !== JSON.stringify(libraryAfter)) {
      fail(
        'The Character Library entry changed while its runtime copy was played and recovered.',
      );
    }

    step('continue play and confirm the new stream is role-projected');
    const gmFramesBefore = await countSseFrames(gmPage);
    const playerFramesBefore = await countSseFrames(playerPage);

    await requestResolution(gmPage, {
      ability: SHARED_ABILITY,
      dc: 10,
      kind: 'ability_check',
      reason: 'One more after the restart',
      skill: NON_PROFICIENT_SKILL,
      stance: 'normal',
    });
    await clickButton(playerPage, ['Roll it'], {
      scope: '[data-testid="m1-player-pending"]',
    });

    const afterRestartCheck = await waitForResolution({
      gmPage,
      kind: 'ability_check',
      sessionId,
      serverUrl,
      skill: NON_PROFICIENT_SKILL,
    });
    assertProficiencyBreakdown(afterRestartCheck, {
      expectProficiency: false,
      label: 'post-restart non-proficient check',
    });

    const newGmFrames = (await readFrames(gmPage)).slice(gmFramesBefore);
    const newPlayerFrames = (await readFrames(playerPage)).slice(
      playerFramesBefore,
    );

    if (!newGmFrames.some((frame) => frame.event === 'resolution_state')) {
      fail('Server process B never delivered a resolution frame to the GM.');
    }

    if (!newPlayerFrames.some((frame) => frame.event === 'resolution_state')) {
      fail(
        'Server process B never delivered a resolution frame to the Player.',
      );
    }

    for (const frame of newPlayerFrames) {
      if (frame.raw.includes(concealedEntityId)) {
        fail(
          'Server process B leaked the concealed combatant into the Player stream.',
        );
      }
    }

    console.log(
      `[m1-db-restart] passed - session ${sessionId}, server ${pidA} -> ${serverB.pid}, database ${provisioned.name}`,
    );
  } catch (error) {
    await captureFailure(error);
    throw error;
  } finally {
    await Promise.allSettled([gmPage.close(), playerPage.close()]);
    await cleanup();
    await dropDatabase();
  }

  process.exit(0);
}

function readFrames(page) {
  return readSseFrames(page);
}

function countResolutions(frames, kind) {
  const latest = frames
    .filter((frame) => frame.event === 'resolution_state')
    .at(-1);

  return (latest?.parsed?.state?.resolutions ?? []).filter(
    (resolution) => resolution.kind === kind,
  ).length;
}

async function readEncounterSnapshot({ gmPage, sessionId, serverUrl }) {
  const token = await extractToken(gmPage, sessionId, 'dm-001');
  const response = await postCommand({
    body: {
      actor: { participantId: 'dm-001' },
      commandId: `m1-restart-encounter-${runId}-${Math.random().toString(16).slice(2, 8)}`,
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

async function readCombatantHpAfterRestart({
  combatantId,
  gmPage,
  sessionId,
  serverUrl,
}) {
  const token = await extractToken(gmPage, sessionId, 'dm-001');
  const snapshot = await gmPage.evaluate(
    `JSON.parse(localStorage.getItem('dnd-runtime-cockpit') ?? '{}').sceneId`,
  );
  const response = await postCommand({
    body: {
      actor: { participantId: 'dm-001' },
      commandId: `m1-restart-scene-${runId}-${Math.random().toString(16).slice(2, 8)}`,
      payload: { sceneId: snapshot, sessionId },
      type: 'get_scene',
    },
    path: '/api/scenes/command',
    serverUrl,
    token,
  });

  if (!response.ok) {
    fail(`get_scene failed after the restart: ${JSON.stringify(response)}`);
  }

  const entity = response.data.scene.entities.find(
    (candidate) => candidate.id === combatantId,
  );

  if (!entity?.combatant?.hp) {
    fail(`Combatant ${combatantId} did not survive the restart.`);
  }

  return entity.combatant.hp.current;
}

async function readLibraryEntry({ account, entryId, serverUrl }) {
  const response = await postCommand({
    body: {
      actor: { participantId: account.user.id },
      commandId: `m1-restart-library-${runId}-${Math.random().toString(16).slice(2, 8)}`,
      payload: { entryId, ownerParticipantId: account.user.id },
      type: 'get_character_library_entry',
    },
    cookie: account.cookie,
    path: '/api/character-library/command',
    serverUrl,
  });

  if (!response.ok) {
    fail(`get_character_library_entry failed: ${JSON.stringify(response)}`);
  }

  // `updatedAt` would differ for reasons that are not the point; everything
  // else about the reusable record must be byte-identical.
  const { updatedAt, ...rest } = response.data.entry;

  void updatedAt;

  return rest;
}

async function provisionDatabase(adminUrl) {
  const name = `dnd_web_m1_browser_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const admin = new Client({ connectionString: adminUrl });

  await admin.connect();

  try {
    await admin.query(
      `create database ${name} encoding 'UTF8' template template0`,
    );
  } finally {
    await admin.end().catch(() => undefined);
  }

  const url = new URL(adminUrl);

  url.pathname = `/${name}`;
  console.log(`[m1-db-restart]   provisioned isolated database ${name}`);

  return { adminUrl, name, url: url.toString() };
}

async function dropDatabase() {
  if (!provisioned) {
    return;
  }

  const admin = new Client({ connectionString: provisioned.adminUrl });

  try {
    await admin.connect();
    await admin.query(
      `drop database if exists ${provisioned.name} with (force)`,
    );
    console.log(
      `[m1-db-restart]   dropped isolated database ${provisioned.name}`,
    );
  } catch (error) {
    console.error(
      `[m1-db-restart]   could not drop ${provisioned.name}: ${redactSecrets(String(error))}`,
    );
  } finally {
    await admin.end().catch(() => undefined);
    provisioned = null;
  }
}

function runNodeScript(scriptPath, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = startProcess('migrate', process.execPath, [scriptPath], {
      env,
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${scriptPath} exited with ${code}:\n${redactSecrets(output)}`,
        ),
      );
    });
  });
}
