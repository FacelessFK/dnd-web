#!/usr/bin/env node
/**
 * Proves intent terminality is a property of the state, not of the timing.
 *
 * The M1 loop already walks one intent through each transition once. That is
 * enough to show the feature exists and not enough to show it is stable: a GM
 * and a Player hold two independent SSE subscriptions with no ordering between
 * them, and the failure this preflight exists to rule out is the one where a
 * terminal intent momentarily reads as pending again because one subscriber's
 * frame arrived after the other's.
 *
 * So this repeats the lifecycle across several clean sessions and many intents,
 * and after each transition asserts the pair of things a race would break:
 *
 *  - **both** subscribers reach the same terminal status, each waited for on
 *    its own page rather than inferred from the other's; and
 *  - the terminal row is unique, offers no further transition, and never goes
 *    back - re-checked after the transcript has gone quiet, which is where a
 *    late frame would land.
 *
 * Every wait is state-specific. There is no sleep anywhere in this file: a
 * `setTimeout` long enough to hide a race is also long enough to hide the bug,
 * and quiescence (`settleSseFrames`) is used only to establish that a window is
 * closed before asserting that nothing further arrived in it.
 */
import { resolve } from 'node:path';

import {
  artifactRoot,
  captureArtifacts,
  cleanup,
  clickButton,
  clickButtonIfEnabled,
  createCdpPage,
  findBrowserExecutable,
  forceLocale,
  getFreePort,
  installSseRecorder,
  launchBrowserProfile,
  loadRepoEnvironment,
  loginInBrowser,
  navigate,
  nextBin,
  printProcessLogs,
  redactSecrets,
  registerAccount,
  runDbReadinessCheck,
  serverDir,
  startProcess,
  waitFor,
  waitForHttp,
  waitForParticipantCredential,
  waitForSseOpen,
  waitForText,
  webDir,
} from './m1-harness-lib.mjs';
import { assertWebUiTargetsServer } from './runtime-smoke-diagnostics.mjs';
import {
  fail,
  gmIntentRowExpression,
  setRunTag,
  setSessionCode,
  settleSseFrames,
  submitIntent,
  transitionIntent,
  waitForStoredSessionId,
} from './m1-table-flow.mjs';

const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const runDir = resolve(artifactRoot, `intent-preflight-${runId}`);

const sessionCount = Number.parseInt(
  process.env.INTENT_PREFLIGHT_SESSIONS ?? '5',
  10,
);

/**
 * Four intents per session, chosen so every transition appears in both a
 * one-step and a two-step path.
 *
 * `acknowledged` is not terminal, which is exactly why it is worth pairing with
 * each terminal status: the bug being hunted would show up as an intent that
 * has been acknowledged and then resolved briefly rendering as acknowledged
 * again, and a lifecycle that only ever goes straight to terminal never creates
 * the second frame that could arrive out of order.
 */
const intentPlans = [
  { steps: ['Mark seen', 'Resolve'], terminal: 'resolved' },
  { steps: ['Resolve'], terminal: 'resolved' },
  { steps: ['Dismiss'], terminal: 'dismissed' },
  { steps: ['Mark seen', 'Dismiss'], terminal: 'dismissed' },
];

const statusKeys = {
  acknowledged: 'runtime.m1.intentStatus.acknowledged',
  dismissed: 'runtime.m1.intentStatus.dismissed',
  pending: 'runtime.m1.intentStatus.pending',
  resolved: 'runtime.m1.intentStatus.resolved',
};

const transitionStatus = {
  Dismiss: 'dismissed',
  'Mark seen': 'acknowledged',
  Resolve: 'resolved',
};

setRunTag(runId);
loadRepoEnvironment();

const pages = {};
const steps = [];
let stepIndex = 0;
let intentsExercised = 0;
let transitionsExercised = 0;
const transitionTally = { Dismiss: 0, 'Mark seen': 0, Resolve: 0 };

function step(label) {
  stepIndex += 1;
  steps.push(label);
  console.log(
    `[intent-preflight] ${String(stepIndex).padStart(2, '0')} ${label}`,
  );
}

async function captureFailure(error) {
  try {
    const written = await captureArtifacts(runDir, 'failure', pages, {
      error: redactSecrets(error instanceof Error ? error.stack : error),
      failedStep: steps.at(-1) ?? null,
      intentsExercised,
      steps,
      transitionTally,
      transitionsExercised,
    });
    console.error(`[intent-preflight] artifacts: ${written}`);
  } catch (artifactError) {
    console.error(
      `[intent-preflight] artifact capture failed: ${artifactError}`,
    );
  }
}

main().catch(async (error) => {
  console.error('\n[intent-preflight] failed');
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
    fail('This preflight needs a Node runtime with global WebSocket support.');
  }

  if (!process.env.DATABASE_URL) {
    fail(
      'DATABASE_URL is required: the preflight authenticates a GM and a Player, and both need SERVER_PERSISTENCE_MODE=db.',
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
    displayName: 'Preflight Game Master',
    email: `preflight-gm-${runId}@example.test`,
    password: `preflight-gm-password-${runId}`,
  };
  const playerAccount = {
    displayName: 'Preflight Player',
    email: `preflight-player-${runId}@example.test`,
    password: `preflight-player-password-${runId}`,
  };

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

  step('register the GM and Player accounts');
  await registerAccount(serverUrl, gmAccount);
  await registerAccount(serverUrl, playerAccount);

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

  await installSseRecorder(gmPage);
  await installSseRecorder(playerPage);

  try {
    step('authenticate both roles in their own profiles');
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

    for (let session = 1; session <= sessionCount; session += 1) {
      await runSessionCycle({ gmPage, playerPage, session, serverUrl });
    }

    if (intentsExercised < 20) {
      fail(
        `The preflight is specified at 20 or more intents; only ${intentsExercised} ran.`,
      );
    }

    for (const [name, count] of Object.entries(transitionTally)) {
      if (count === 0) {
        fail(`The preflight never exercised the "${name}" transition.`);
      }
    }

    console.log(
      `\n[intent-preflight] PASS - ${sessionCount} clean sessions, ${intentsExercised} intents, ${transitionsExercised} transitions ` +
        `(${Object.entries(transitionTally)
          .map(([name, count]) => `${name}=${count}`)
          .join(', ')})`,
    );
  } catch (error) {
    await captureFailure(error);
    throw error;
  } finally {
    await cleanup();
  }
}

/**
 * One clean table, from Local Reset to the last terminal intent.
 *
 * A fresh session per cycle is the point: the defect class being ruled out is
 * state carried across a table boundary, and reusing one session would hide it
 * behind the intents already present.
 */
async function runSessionCycle({ gmPage, playerPage, session, serverUrl }) {
  step(`session ${session}: build a clean table`);

  await clickButtonIfEnabled(gmPage, ['Local Reset']);
  await clickButton(gmPage, ['DM Mode']);
  await clickButtonIfEnabled(playerPage, ['Local Reset']);
  await clickButton(playerPage, ['Player Mode']);

  await clickButton(gmPage, ['Create Session']);
  const sessionId = await waitForStoredSessionId(gmPage);
  await waitForParticipantCredential(
    gmPage,
    sessionId,
    `GM session ${session}`,
  );
  await clickButton(gmPage, ['Subscribe SSE']);
  await waitForSseOpen(gmPage, `GM session ${session}`);

  await setSessionCode(playerPage, sessionId);
  await clickButton(playerPage, ['Join Session']);
  await waitForStoredSessionId(playerPage, sessionId);
  await waitForParticipantCredential(
    playerPage,
    sessionId,
    `Player session ${session}`,
  );
  await clickButton(playerPage, ['Subscribe SSE']);
  await waitForSseOpen(playerPage, `Player session ${session}`);

  // A fresh table shows neither role an intent. Asserting it before submitting
  // any turns "the row I found is the one I made" from an assumption into a
  // checked fact - without it, a leaked row from the previous cycle would be
  // indistinguishable from this cycle's own.
  await assertIntentCount(gmPage, 'gm', 0, `session ${session} GM start`);
  await assertIntentCount(
    playerPage,
    'player',
    0,
    `session ${session} Player start`,
  );

  const submitted = [];

  for (const [index, plan] of intentPlans.entries()) {
    const text = `Preflight s${session} i${index + 1} ${runId.slice(-5)}: signal the watch and fall back to the arch.`;

    step(
      `session ${session}: intent ${index + 1} via ${plan.steps.join(' then ')}`,
    );

    await submitIntent(playerPage, text);
    intentsExercised += 1;

    await waitFor(gmPage, {
      label: `GM received session ${session} intent ${index + 1}`,
      predicate: `Boolean(${gmIntentRowExpression(text)})`,
    });

    for (const button of plan.steps) {
      await applyTransition({
        button,
        gmPage,
        label: `session ${session} intent ${index + 1}`,
        playerPage,
        text,
      });
    }

    await assertTerminal({
      gmPage,
      label: `session ${session} intent ${index + 1}`,
      playerPage,
      terminal: plan.terminal,
      text,
    });

    submitted.push({ terminal: plan.terminal, text });

    // Nothing this intent did may have moved any other intent. Checked after
    // every single one rather than once at the end, so a cross-contamination is
    // attributed to the transition that caused it.
    await assertUnrelatedIntentsUnchanged({
      gmPage,
      label: `session ${session} after intent ${index + 1}`,
      playerPage,
      submitted,
    });
  }

  await assertIntentCount(
    gmPage,
    'gm',
    intentPlans.length,
    `session ${session} GM end`,
  );
  await assertIntentCount(
    playerPage,
    'player',
    intentPlans.length,
    `session ${session} Player end`,
  );

  console.log(
    `[intent-preflight]    session ${session} clean: ${intentPlans.length} intents converged on both subscribers (table ${sessionId.slice(0, 12)}…)`,
  );

  // `serverUrl` is accepted so a future authoritative cross-check has it to
  // hand; the assertions above are deliberately DOM-only, because what is being
  // proven is that both *browsers* converge.
  void serverUrl;
}

/**
 * Drive one transition through the GM's real controls and wait for both sides.
 *
 * Each page is waited on independently and neither wait is allowed to stand in
 * for the other. That is the whole subject of this preflight: a harness that
 * waits on the Player and then samples the GM will pass on a product where the
 * GM's own frame never arrives.
 */
async function applyTransition({ button, gmPage, label, playerPage, text }) {
  const expected = statusKeys[transitionStatus[button]];

  await transitionIntent(gmPage, text, button);
  transitionsExercised += 1;
  transitionTally[button] += 1;

  await waitFor(playerPage, {
    label: `Player sees ${label} as ${transitionStatus[button]}`,
    predicate: intentStatusPredicate('player', text, expected),
  });
  await waitFor(gmPage, {
    label: `GM sees ${label} as ${transitionStatus[button]}`,
    predicate: intentStatusPredicate('gm', text, expected),
  });
}

/**
 * Everything a terminal intent must be, checked after the traffic has stopped.
 *
 * `settleSseFrames` runs first on both pages. A late frame is the mechanism a
 * regression here would use, so asserting before the transcript is quiet would
 * be asserting in the window where the bug has not happened yet.
 */
async function assertTerminal({ gmPage, label, playerPage, terminal, text }) {
  await settleSseFrames(gmPage);
  await settleSseFrames(playerPage);

  const expected = statusKeys[terminal];
  const gm = await readIntentRow(gmPage, 'gm', text);
  const player = await readIntentRow(playerPage, 'player', text);

  if (gm.matches !== 1) {
    fail(`${label}: the GM panel holds ${gm.matches} rows for one intent.`);
  }

  if (player.matches !== 1) {
    fail(
      `${label}: the Player panel holds ${player.matches} rows for one intent.`,
    );
  }

  if (gm.status !== expected || player.status !== expected) {
    fail(
      `${label}: subscribers disagree after settling - GM "${gm.status}", Player "${player.status}", expected "${expected}".`,
    );
  }

  if (gm.terminal !== 'true') {
    fail(`${label}: the GM row is not flagged terminal.`);
  }

  if (gm.buttons !== 0) {
    fail(
      `${label}: the GM row still offers ${gm.buttons} transition control(s).`,
    );
  }

  await assertSingleStatusChangeFrame(gmPage, 'GM', label, text);
  await assertSingleStatusChangeFrame(playerPage, 'Player', label, text);
}

/**
 * Exactly one status-change frame carried this intent into its terminal state.
 *
 * A duplicate would not necessarily show in the DOM - the reducer is keyed by
 * intent ID, so a repeated frame renders identically - which is why this reads
 * the recorded transcript rather than the rendered rows.
 */
async function assertSingleStatusChangeFrame(page, role, label, text) {
  const terminalFrames = await page.evaluate(`(() => {
    const needle = ${JSON.stringify(text)};
    const frames = window.__m1Sse?.frames ?? [];
    let count = 0;

    for (const frame of frames) {
      if (frame.event !== 'player_intent_state') { continue; }
      if (frame.parsed?.reason !== 'intent_status_changed') { continue; }

      const intents = frame.parsed?.state?.intents ?? [];
      const match = intents.find((intent) => intent.text === needle);

      if (match && (match.status === 'resolved' || match.status === 'dismissed')) {
        count += 1;
      }
    }

    return count;
  })()`);

  if (terminalFrames !== 1) {
    fail(
      `${label}: the ${role} received ${terminalFrames} terminal status-change frames for one intent; expected exactly 1.`,
    );
  }
}

/**
 * No previously terminal intent moved, and none went back to pending.
 *
 * Re-read on both pages rather than trusted from the earlier assertion: the
 * failure mode is a later frame rewriting an earlier row, which by definition
 * only becomes visible after that later frame has arrived.
 */
async function assertUnrelatedIntentsUnchanged({
  gmPage,
  label,
  playerPage,
  submitted,
}) {
  for (const entry of submitted) {
    const expected = statusKeys[entry.terminal];

    for (const [page, role] of [
      [gmPage, 'gm'],
      [playerPage, 'player'],
    ]) {
      const row = await readIntentRow(page, role, entry.text);

      if (row.matches !== 1) {
        fail(
          `${label}: the ${role} panel holds ${row.matches} rows for an earlier intent.`,
        );
      }

      if (row.status === statusKeys.pending) {
        fail(`${label}: a terminal intent returned to pending on the ${role}.`);
      }

      if (row.status !== expected) {
        fail(
          `${label}: an earlier intent changed on the ${role} - now "${row.status}", was "${expected}".`,
        );
      }
    }
  }
}

function intentScope(role) {
  return role === 'gm'
    ? '[data-testid="m1-gm-intents"] li'
    : '[data-testid="m1-player-intents"] li';
}

function intentStatusPredicate(role, text, statusKey) {
  return `(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(intentScope(role))})]
      .filter((row) => row.innerText.includes(${JSON.stringify(text)}));
    return rows.length === 1 && rows[0].dataset.intentStatus === ${JSON.stringify(statusKey)};
  })()`;
}

function readIntentRow(page, role, text) {
  return page.evaluate(`(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(intentScope(role))})]
      .filter((row) => row.innerText.includes(${JSON.stringify(text)}));
    const row = rows[0] ?? null;

    return {
      buttons: row ? row.querySelectorAll('button').length : -1,
      matches: rows.length,
      status: row ? (row.dataset.intentStatus ?? null) : null,
      terminal: row ? (row.dataset.intentTerminal ?? null) : null,
    };
  })()`);
}

async function assertIntentCount(page, role, expected, label) {
  await waitFor(page, {
    label: `${label}: ${expected} intent row(s)`,
    predicate: `document.querySelectorAll(${JSON.stringify(intentScope(role))}).length === ${expected}`,
  });
}
