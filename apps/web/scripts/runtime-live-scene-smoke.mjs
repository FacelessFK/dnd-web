#!/usr/bin/env node
// Proves that a GM's scene mutation reaches a Player's map live, in two real
// browser profiles, with no Recover in between.
//
// This is the acceptance the M2 scene-projection work existed for. The server
// side is already covered by `apps/server/src/*.test.ts`, including a byte-level
// SSE transcript search - what those cannot show is that the frame arriving in a
// browser actually repaints the board. Every assertion below therefore checks
// two independent things for each mutation:
//
//  - the Player's map *state* changed, read from the grid's cell `aria-label`s,
//    which is the same DOM a screen reader gets; and
//  - the Player's canvas *pixels* changed, hashed before and after.
//
// A pass on frames alone would only prove the network worked. A pass on pixels
// alone could be a hover highlight. Together they mean the board moved.
//
// Recover is used exactly twice per profile and only to establish or re-establish
// a subscription: once after joining, and once after the deliberate reload in the
// refresh step. `assertNoRecoverSince` guards every live assertion in between.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import {
  assertWebUiTargetsServer,
  formatSmokeStep,
  formatSmokeWaitFailure,
  getCockpitModeSelectionExpression,
  getPageDiagnosticsExpression,
  getSessionInputAssignmentExpression,
  getStoredCockpitSessionIdExpression,
  isHeadedSmokeRun,
  normalizePageDiagnostics,
} from './runtime-smoke-diagnostics.mjs';
import {
  cleanup,
  clearFrames,
  createCdpPage,
  delay,
  enablePage,
  findBrowserExecutable,
  getFreePort,
  getProcessLogTails,
  installCleanupHandlers,
  installStreamRecorder,
  launchBrowserProfile,
  nextBin,
  printProcessLogs,
  readFrames,
  readResponses,
  serverDir,
  startProcess,
  storageKey,
  waitForHttp,
  webDir,
} from './live-scene-harness-lib.mjs';

const smokeTimeoutMs = Number.parseInt(
  process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? '120000',
  10,
);
const artifactDir =
  process.env.RUNTIME_SMOKE_ARTIFACT_DIR ??
  resolve(
    process.env.TMPDIR ?? '/tmp',
    `dnd-live-scene-artifacts-${process.pid}`,
  );

// Row y=5 of the Training Room layout is `#,.________.,,,#`, so x=4 and x=6 are
// open sparring floor. Aria and Borin sit at (2,5) and (2,6). Placing on wall is
// rejected by the server, which is what silently defeated an earlier attempt at
// this harness: the command failed, the scene never changed, and the wait for a
// frame that was never due timed out looking like a stream defect.
const sentryCell = { x: 4, y: 5 };
const sentryMovedCell = { x: 6, y: 5 };
const markerCell = { x: 8, y: 3 };
const sentryName = 'LiveSentryAlpha';
const markerName = 'LiveMarkerBeta';

const steps = [
  'starting authoritative server',
  'starting Next runtime UI',
  'launching isolated GM and Player profiles',
  'building the table in the GM profile',
  'subscribing both profiles before any scene mutation',
  'placing a visible combatant',
  'starting the encounter',
  'moving the combatant',
  'concealing the combatant',
  'revealing the combatant',
  'concealing the combatant again',
  'adding a non-combat scene entity',
  'removing a visible scene entity',
  'restoring a role-projected scene after refresh',
  'auditing raw Player stream bytes',
];
let stepIndex = 0;
let recoverClicks = 0;

installCleanupHandlers();

main().catch(async (error) => {
  console.error('\n[runtime-live-scene-smoke] failed');
  console.error(error instanceof Error ? error.stack : error);
  printProcessLogs();
  await cleanup();
  process.exit(1);
});

async function main() {
  const browserPath = findBrowserExecutable();

  if (!browserPath) {
    throw new Error(
      'No Chrome/Chromium executable found. Set RUNTIME_SMOKE_BROWSER=/path/to/chrome.',
    );
  }

  if (typeof WebSocket !== 'function') {
    throw new Error(
      'This harness requires a Node runtime with global WebSocket.',
    );
  }

  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const dmDebugPort = await getFreePort();
  const playerDebugPort = await getFreePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const runtimeUrl = `${webOrigin}/runtime`;

  logStep('starting authoritative server');
  startProcess(
    'server',
    process.execPath,
    ['--import', 'tsx', 'src/index.ts'],
    {
      cwd: serverDir,
      env: {
        NEXT_PUBLIC_APP_URL: webOrigin,
        SERVER_PERSISTENCE_MODE: 'in-memory',
        SERVER_PORT: String(serverPort),
      },
    },
  );
  await waitForHttp(`${serverUrl}/`, {
    label: 'server root',
    timeoutMs: smokeTimeoutMs,
  });

  logStep('starting Next runtime UI');
  startProcess(
    'web',
    process.execPath,
    [nextBin, 'dev', '-p', String(webPort), '-H', '127.0.0.1'],
    { cwd: webDir, env: { NEXT_PUBLIC_SERVER_URL: serverUrl } },
  );
  await waitForHttp(runtimeUrl, {
    label: '/runtime',
    timeoutMs: smokeTimeoutMs,
  });
  await assertWebUiTargetsServer(runtimeUrl, serverUrl);

  logStep('launching isolated GM and Player profiles');
  launchBrowserProfile('dm-chrome', browserPath, dmDebugPort, {
    windowPosition: { x: 0, y: 0 },
  });
  launchBrowserProfile('player-chrome', browserPath, playerDebugPort, {
    windowPosition: { x: 960, y: 0 },
  });
  await Promise.all([
    waitForHttp(`http://127.0.0.1:${dmDebugPort}/json/version`, {
      label: 'GM Chrome DevTools',
      timeoutMs: smokeTimeoutMs,
    }),
    waitForHttp(`http://127.0.0.1:${playerDebugPort}/json/version`, {
      label: 'Player Chrome DevTools',
      timeoutMs: smokeTimeoutMs,
    }),
  ]);

  const dm = await openProfile(dmDebugPort, runtimeUrl);
  const player = await openProfile(playerDebugPort, runtimeUrl);

  try {
    await run(dm, player);
    console.log('[runtime-live-scene-smoke] passed');
  } catch (error) {
    await captureFailureArtifacts(dm, player, error);
    throw error;
  } finally {
    await Promise.allSettled([dm.close(), player.close()]);
    await cleanup();
  }

  process.exit(0);
}

/**
 * Open one profile with the stream recorder and an English locale seeded before
 * any application script runs.
 *
 * Pinning the locale is a harness decision, not a product one: matching every
 * control against two label spellings made the earlier attempt at this harness
 * fragile in exactly the place it needed to be exact. `runtime-two-profile-smoke`
 * still exercises the Persian default, so that coverage is not lost.
 */
async function openProfile(debugPort, runtimeUrl) {
  const page = await createCdpPage(debugPort, 'about:blank');

  await enablePage(page);
  await installStreamRecorder(page);
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('dnd-web.locale', 'en'); } catch {}`,
  });
  await page.send('Page.navigate', { url: runtimeUrl });

  return page;
}

async function run(dm, player) {
  await waitForText(dm, 'Runtime War Table', 'GM runtime shell');
  await waitForCockpitHydrated(dm);
  await clickButtonIfEnabled(dm, 'Local Reset');
  await waitForNoStoredSession(dm);
  await selectMode(dm, 'DM Mode', 'dm');

  logStep('building the table in the GM profile');
  await clickButton(dm, 'Run Training Room Skirmish');
  await waitForCockpitState(dm, (state) =>
    Boolean(state?.sessionId && state?.sceneId),
  );
  const sessionId = await getStoredSessionId(dm);
  await waitForText(dm, 'Training Room', 'GM active scene');
  await waitForMapReady(dm, 'GM tactical map');

  logStep('subscribing both profiles before any scene mutation');
  await waitForText(player, 'Runtime War Table', 'Player runtime shell');
  await waitForCockpitHydrated(player);
  await clickButtonIfEnabled(player, 'Local Reset');
  await waitForNoStoredSession(player);
  await selectMode(player, 'Player Mode', 'player');
  await setSessionInput(player, sessionId);
  await clickButton(player, 'Join Session');
  await waitForCockpitState(player, (state) => Boolean(state?.sessionId));

  // Recover is the only path that enables the subscription today
  // (runtime-cockpit.tsx calls setStreamEnabled(true) nowhere else). Both seats
  // subscribe here, before any mutation, and every assertion after this point is
  // guarded by assertNoRecoverSince.
  await recover(player);
  await waitForText(player, 'Aria', 'Player assigned character');
  await waitForMapReady(player, 'Player tactical map');
  await recover(dm);
  await waitForStreamOpen(dm, 'GM subscription');
  await waitForStreamOpen(player, 'Player subscription');

  const recoverBaseline = recoverClicks;

  logStep('placing a visible combatant');
  await clearFrames(player);
  const beforePlace = await readMapSignature(player);
  await clickMapCell(dm, sentryCell);
  await setFieldByTestId(dm, 'combatant-name', sentryName);
  await clickTestId(dm, 'combatant-create');
  await waitForCombatantRow(dm, sentryName, 'visible');

  await waitForMapToken(player, sentryCell, sentryName, 'live placement');
  await assertMapSignatureChanged(player, beforePlace, 'live placement');
  assertNoRecoverSince(recoverBaseline, 'live placement');

  const sentryId = await resolveCombatantId(dm, sentryName);
  await assertPlayerFrameShows(player, sentryId, true, 'live placement');

  logStep('starting the encounter');
  await clickButton(dm, 'Start Encounter');
  const encounterBaseline = await readPlayerEncounter(
    player,
    'encounter start',
  );
  assertNoRecoverSince(recoverBaseline, 'live encounter start');

  logStep('moving the combatant');
  await clearFrames(player);
  const beforeMove = await readMapSignature(player);
  await clickMapCell(dm, sentryCell);
  await clickMapCell(dm, sentryMovedCell);
  await clickTestId(dm, 'combatant-reposition');

  await waitForMapToken(player, sentryMovedCell, sentryName, 'live movement');
  await assertMapTokenAbsent(player, sentryCell, sentryName, 'live movement');
  await assertMapSignatureChanged(player, beforeMove, 'live movement');
  assertNoRecoverSince(recoverBaseline, 'live movement');

  logStep('concealing the combatant');
  await clearFrames(player);
  const beforeConceal = await readMapSignature(player);
  await setCombatantVisibility(dm, sentryName, 'Conceal');

  await waitForMapTokenAbsent(player, sentryName, 'live conceal');
  await assertMapSignatureChanged(player, beforeConceal, 'live conceal');
  assertNoRecoverSince(recoverBaseline, 'live conceal');
  await assertPlayerFrameShows(player, sentryId, false, 'live conceal');
  await assertPlayerFrameShows(player, sentryName, false, 'live conceal');

  logStep('revealing the combatant');
  await clearFrames(player);
  const beforeReveal = await readMapSignature(player);
  await setCombatantVisibility(dm, sentryName, 'Reveal');

  await waitForMapToken(player, sentryMovedCell, sentryName, 'live reveal');
  await assertMapSignatureChanged(player, beforeReveal, 'live reveal');
  assertNoRecoverSince(recoverBaseline, 'live reveal');
  await assertPlayerFrameShows(player, sentryId, true, 'live reveal');

  logStep('concealing the combatant again');
  await clearFrames(player);
  const beforeReconceal = await readMapSignature(player);
  await setCombatantVisibility(dm, sentryName, 'Conceal');

  await waitForMapTokenAbsent(player, sentryName, 'live re-conceal');
  await assertMapSignatureChanged(player, beforeReconceal, 'live re-conceal');
  assertNoRecoverSince(recoverBaseline, 'live re-conceal');
  await assertPlayerFrameShows(player, sentryId, false, 'live re-conceal');
  await assertPlayerFrameShows(player, sentryName, false, 'live re-conceal');

  logStep('adding a non-combat scene entity');
  await clearFrames(player);
  const beforeEntity = await readMapSignature(player);
  await clickMapCell(dm, markerCell);
  await setFieldByTestId(dm, 'scene-entity-name', markerName);
  await clickTestId(dm, 'scene-entity-place');

  await waitForMapToken(player, markerCell, markerName, 'live scene entity');
  await assertMapSignatureChanged(player, beforeEntity, 'live scene entity');
  assertNoRecoverSince(recoverBaseline, 'live scene entity');
  await assertPlayerSceneIsProjected(player, sentryId, 'live scene entity');

  logStep('removing a visible scene entity');
  await clearFrames(player);
  const beforeDelete = await readMapSignature(player);
  await selectPassiveEntity(dm, markerName);
  await clickTestId(dm, 'scene-entity-delete');

  await waitForMapTokenAbsent(player, markerName, 'live scene removal');
  await assertMapSignatureChanged(player, beforeDelete, 'live scene removal');
  assertNoRecoverSince(recoverBaseline, 'live scene removal');

  // Reloading resets `window.__dndFrames`, so every frame recorded from here on
  // belongs to a table where the combatant is concealed. That is what makes the
  // byte audit below a real search rather than a search over a transcript that
  // legitimately named the combatant while it was visible.
  logStep('restoring a role-projected scene after refresh');
  await reloadPage(player);
  await waitForText(player, 'Runtime War Table', 'Player shell after reload');
  await waitForCockpitHydrated(player);
  await setSessionInput(player, sessionId);
  await recover(player);
  await waitForMapReady(player, 'Player map after reload');
  await waitForText(player, 'Aria', 'Player character after reload');
  await assertMapTokenAbsentNow(player, sentryName, 'projected initial sync');
  await assertPlayerFrameShows(
    player,
    sentryId,
    false,
    'projected initial sync',
  );
  await assertSingleStreamOpen(player, 'after reload and recover');

  const encounterAfter = await readPlayerEncounter(
    player,
    'projected initial sync',
  );
  assertEncounterSlotsAligned(encounterBaseline, encounterAfter);
  assertSentrySlotIsAnonymous(encounterAfter, sentryId);

  logStep('auditing raw Player stream bytes');
  await assertPlayerBytesClean(player, { sentryId, sentryName });
  await assertConsoleClean(player, 'Player');
  await assertConsoleClean(dm, 'GM');
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function assertNoRecoverSince(baseline, label) {
  if (recoverClicks !== baseline) {
    throw new Error(
      `${label} used Recover (${recoverClicks - baseline} click(s) since the baseline). ` +
        'Live delivery must not need it.',
    );
  }
}

/**
 * Search the raw SSE text, not a parsed object.
 *
 * A concealed combatant that is merely absent from the entity array but still
 * named in, say, a turn-order label would pass a structural check and still be
 * a leak. Only the bytes settle it.
 */
async function assertPlayerFrameShows(page, needle, expected, label) {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const frames = await readFrames(page, 'scene_state');

    if (frames.length) {
      const latest = frames[frames.length - 1].raw;

      if (latest.includes(needle) === expected) {
        return;
      }
    }

    await delay(200);
  }

  const frames = await readFrames(page, 'scene_state');
  const latest = frames.length ? frames[frames.length - 1].raw : '(no frame)';

  throw new Error(
    `${label}: expected the latest Player scene frame to ${
      expected ? 'contain' : 'omit'
    } ${JSON.stringify(needle)}.\nLatest frame: ${latest.slice(0, 1200)}`,
  );
}

async function assertPlayerSceneIsProjected(page, concealedId, label) {
  const frames = await readFrames(page, 'scene_state');

  if (!frames.length) {
    throw new Error(`${label}: the Player received no scene frame.`);
  }

  for (const frame of frames) {
    if (frame.raw.includes(concealedId)) {
      throw new Error(
        `${label}: a Player scene frame carried the concealed combatant ID.`,
      );
    }
  }
}

/**
 * Concealment must not renumber initiative.
 *
 * The projected encounter keeps a placeholder in the concealed combatant's slot
 * precisely so `currentTurnIndex` stays positionally valid for every viewer. If
 * the slot were dropped instead, a player counting turns would silently learn
 * how many creatures they cannot see.
 */
function assertEncounterSlotsAligned(before, after) {
  if (before.participants.length !== after.participants.length) {
    throw new Error(
      'The Player initiative slot count changed from ' +
        `${before.participants.length} to ${after.participants.length}. ` +
        'Concealing must leave the anonymous slot in place.',
    );
  }

  if (before.currentTurnIndex !== after.currentTurnIndex) {
    throw new Error(
      `currentTurnIndex drifted from ${before.currentTurnIndex} to ` +
        `${after.currentTurnIndex}.`,
    );
  }
}

function assertSentrySlotIsAnonymous(encounter, sentryId) {
  const named = encounter.participants.find(
    (entry) => entry.combatantId === sentryId,
  );

  if (named) {
    throw new Error(
      `The Player's projected initiative still names combatant ${sentryId}.`,
    );
  }

  if (
    !encounter.participants.some(
      (entry) => entry.kind === 'concealed_combatant',
    )
  ) {
    throw new Error(
      'The Player initiative has no concealed_combatant slot, so the concealed ' +
        'creature was dropped from the order rather than anonymised.',
    );
  }
}

/**
 * Search every byte the Player's stream delivered since the reload.
 *
 * The window matters. Before the reload the combatant was visible for two
 * stretches, so its ID appearing in that traffic is correct, not a leak. After
 * the reload the table is one where the creature is concealed, so any occurrence
 * at all is a defect - including in an event type no other assertion inspects.
 */
async function assertPlayerBytesClean(page, { sentryId, sentryName }) {
  const frames = await readFrames(page);
  const responses = await readResponses(page);
  const streamBytes = frames.map((frame) => frame.raw).join('\n');
  const httpBytes = responses.map((response) => response.raw).join('\n');
  const everything = `${streamBytes}\n${httpBytes}`;

  if (!frames.length) {
    throw new Error('The Player recorded no stream frames after the reload.');
  }

  const leaks = [];

  // Concealed identity must be absent from every channel. A read command that
  // returned what the stream withholds would be the same defect wearing a
  // different transport.
  if (everything.includes(sentryId)) {
    leaks.push(`concealed combatant ID ${sentryId}`);
  }

  if (everything.includes(sentryName)) {
    leaks.push(`concealed combatant name ${sentryName}`);
  }

  if (/"ownerUserId"/.test(everything)) {
    leaks.push('an account ownership identifier');
  }

  if (/"passwordHash"/.test(everything)) {
    leaks.push('a password hash');
  }

  // Credentials are scoped differently on purpose. A join or reconnect response
  // is how this client legitimately receives its own `participantToken`, so
  // finding one in an HTTP body proves the protocol works. A stream frame has no
  // such caller: it is a projection broadcast to a seat, and a credential in one
  // would be a real leak.
  for (const [pattern, description] of [
    [/"participantToken"/, 'a participant token'],
    [/"credential"/, 'a credential field'],
    [/"passwordHash"/, 'a password hash'],
  ]) {
    if (pattern.test(streamBytes)) {
      leaks.push(`${description} inside an SSE frame`);
    }
  }

  if (leaks.length) {
    throw new Error(
      `Raw Player bytes leaked: ${leaks.join(', ')}.\n` +
        `Transcript sample: ${everything.slice(0, 1500)}`,
    );
  }

  // Guard against a vacuous pass: if the recorder captured nothing meaningful,
  // "the ID is absent" is true of an empty string too. The player is entitled to
  // see Aria, so the transcript must contain her.
  if (!everything.includes('Aria')) {
    throw new Error(
      'The post-reload Player transcript does not mention Aria, so the byte ' +
        'search had nothing to search. Recorder or subscription is broken.',
    );
  }

  const sceneFrames = frames.filter((frame) => frame.name === 'scene_state');

  if (!sceneFrames.length) {
    throw new Error(
      'The Player received no scene_state frame after reconnecting.',
    );
  }

  console.log(
    `[runtime-live-scene-smoke] audited ${frames.length} raw post-reload Player ` +
      `frames (${sceneFrames.length} scene_state) and ${responses.length} HTTP ` +
      'response bodies; no hidden identity present',
  );
}

async function assertConsoleClean(page, label) {
  // Next's dev overlay and React devtools hints are noise the product does not
  // control; anything else is a real defect surfacing in the console.
  const ignorable = [
    'Download the React DevTools',
    'Warning: Extra attributes from the server',
    'react-devtools',
  ];
  const errors = page.consoleErrors.filter(
    (message) => !ignorable.some((allowed) => message.includes(allowed)),
  );

  if (errors.length) {
    throw new Error(
      `${label} console reported errors:\n${errors.slice(0, 10).join('\n')}`,
    );
  }
}

async function assertSingleStreamOpen(page, label) {
  const open = await page.evaluate('window.__dndOpenStreams ?? 0');

  if (open !== 1) {
    throw new Error(
      `${label}: expected exactly one open EventSource, found ${open}. ` +
        'Reconnect must not leave a parallel subscription behind.',
    );
  }
}

/**
 * The Player's board actually redrew, not just its accessible state.
 *
 * Runs in both modes. The headed launch disables occluded-window backgrounding
 * for exactly this reason: without it Chrome freezes the rear window's
 * animation frames and the board keeps its last painted content while the DOM
 * updates correctly underneath.
 */
async function assertMapSignatureChanged(page, before, label) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const after = await readMapSignature(page);

    if (after.canvasHash !== before.canvasHash) {
      return;
    }

    await delay(200);
  }

  throw new Error(
    `${label}: the Player canvas did not repaint (hash stayed ${before.canvasHash}).`,
  );
}

async function assertMapTokenAbsent(page, cell, name, label) {
  const labels = await readCellLabels(page);
  const cellLabel = labels.find((entry) =>
    entry.startsWith(`Cell ${cell.x}, ${cell.y}`),
  );

  if (cellLabel?.includes(name)) {
    throw new Error(
      `${label}: ${name} is still at (${cell.x},${cell.y}) on the Player map.`,
    );
  }
}

async function assertMapTokenAbsentNow(page, name, label) {
  const labels = await readCellLabels(page);

  if (labels.some((entry) => entry.includes(name))) {
    throw new Error(`${label}: ${name} is present on the Player map.`);
  }
}

// ---------------------------------------------------------------------------
// Page reads
// ---------------------------------------------------------------------------

function readCellLabels(page) {
  return page.evaluate(`(() => [...document.querySelectorAll(
    '[role="grid"] button[aria-label]',
  )].map((button) => button.getAttribute('aria-label')))()`);
}

/**
 * A cheap content hash of the board canvas.
 *
 * `toDataURL()` on a retina-sized board is megabytes, so it is folded to a
 * 32-bit value in the page rather than shipped over the DevTools socket.
 *
 * The board is scrolled into view first. Headless renders the whole page
 * regardless, but a headed window only paints what it is showing, and the map
 * sits well below the fold on this layout - so the hash would stay frozen at
 * whatever was last drawn and a live repaint would read as no repaint at all.
 */
function readMapSignature(page) {
  return page.evaluate(`(() => {
    const canvas = document.querySelector('[data-tactical-map] canvas');

    if (!canvas) {
      return { canvasHash: 'no-canvas', cells: 0 };
    }

    canvas.scrollIntoView({ block: 'center', inline: 'center' });

    const data = canvas.toDataURL('image/png');
    let hash = 5381;

    for (let index = 0; index < data.length; index += 1) {
      hash = ((hash << 5) + hash + data.charCodeAt(index)) | 0;
    }

    return {
      canvasHash: String(hash),
      cells: document.querySelectorAll('[role="grid"] button[aria-label]').length,
    };
  })()`);
}

/**
 * The Player's own copy of the encounter, projected for their role.
 *
 * Two channels can carry it and both count. Starting an encounter pushes an
 * `encounter_state` frame; reconnecting does not, because `initial_sync` sends
 * session, scene, resolution and intent frames only (game-runtime.ts) and the
 * encounter comes back through the `get_encounter_state` read instead. Reading
 * whichever arrived most recently keeps the assertion about the projection
 * rather than about the transport that happened to deliver it.
 */
async function readPlayerEncounter(page, label) {
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const candidates = [];

    for (const frame of await readFrames(page, 'encounter_state')) {
      candidates.push({ at: frame.at, raw: frame.raw });
    }

    for (const response of await readResponses(page)) {
      if (response.raw.includes('"participants"')) {
        candidates.push({ at: response.at, raw: response.raw });
      }
    }

    candidates.sort((left, right) => left.at - right.at);

    for (const candidate of [...candidates].reverse()) {
      const encounter = findEncounter(JSON.parse(candidate.raw));

      if (encounter) {
        return encounter;
      }
    }

    await delay(250);
  }

  throw new Error(
    `${label}: the Player never received a projected encounter on either channel.`,
  );
}

/** Locate an encounter object wherever a payload happens to nest it. */
function findEncounter(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (
    Array.isArray(payload.participants) &&
    typeof payload.currentTurnIndex === 'number'
  ) {
    return payload;
  }

  for (const value of Object.values(payload)) {
    const found = findEncounter(value);

    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * The combatant's authoritative ID, taken from the GM's own scene frame.
 *
 * Reading it from the GM rather than inventing it is what makes the Player-side
 * byte search meaningful: it is the exact string the server uses, and the GM
 * frame doubles as the "complete authoritative scene" half of the comparison.
 */
async function resolveCombatantId(dmPage, name) {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const frames = await readFrames(dmPage, 'scene_state');

    for (const frame of [...frames].reverse()) {
      const parsed = JSON.parse(frame.raw);
      const entity = (parsed?.scene?.entities ?? []).find(
        (candidate) => candidate.name === name,
      );

      if (entity?.id) {
        return entity.id;
      }
    }

    await delay(250);
  }

  throw new Error(
    `The GM stream never carried a combatant named ${name}; cannot resolve its ID.`,
  );
}

// ---------------------------------------------------------------------------
// Page actions
// ---------------------------------------------------------------------------

async function recover(page) {
  recoverClicks += 1;
  await clickButton(page, 'Recover');
}

async function reloadPage(page) {
  await page.send('Page.reload', { ignoreCache: false });
  await delay(500);
}

async function waitForStreamOpen(page, label) {
  await waitFor(page, {
    label,
    predicate: '(window.__dndOpenStreams ?? 0) >= 1',
  });
}

async function waitForMapReady(page, label) {
  await waitFor(page, {
    label,
    predicate: `(() => {
      const canvas = document.querySelector('[data-tactical-map] canvas');
      const cells = document.querySelectorAll('[role="grid"] button[aria-label]');
      return Boolean(canvas) && cells.length > 0;
    })()`,
  });
}

async function waitForMapToken(page, cell, name, label) {
  await waitFor(page, {
    label: `${label}: ${name} at (${cell.x},${cell.y})`,
    predicate: `(() => {
      const prefix = ${JSON.stringify(`Cell ${cell.x}, ${cell.y}`)};
      return [...document.querySelectorAll('[role="grid"] button[aria-label]')].some(
        (button) => {
          const value = button.getAttribute('aria-label') ?? '';
          return value.startsWith(prefix) && value.includes(${JSON.stringify(name)});
        },
      );
    })()`,
  });
}

async function waitForMapTokenAbsent(page, name, label) {
  await waitFor(page, {
    label: `${label}: ${name} gone from the map`,
    predicate: `(() => {
      const cells = [...document.querySelectorAll('[role="grid"] button[aria-label]')];
      return cells.length > 0 && !cells.some((button) =>
        (button.getAttribute('aria-label') ?? '').includes(${JSON.stringify(name)}),
      );
    })()`,
  });
}

/**
 * Click a board cell the way a user does.
 *
 * The grid renders a transparent, focusable button per on-screen cell whose
 * click handler is the map's own `selectAtCell`, so this is the product's
 * selection path rather than a synthetic state poke. Clicking an occupied cell
 * selects that token, which is how the move and conceal steps pick their target.
 */
async function clickMapCell(page, cell) {
  const prefix = `Cell ${cell.x}, ${cell.y}`;

  await waitFor(page, {
    label: `map cell (${cell.x},${cell.y})`,
    predicate: `(() => [...document.querySelectorAll(
      '[role="grid"] button[aria-label]',
    )].some((button) =>
      (button.getAttribute('aria-label') ?? '').startsWith(${JSON.stringify(prefix)}),
    ))()`,
  });

  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('[role="grid"] button[aria-label]')].find(
      (candidate) =>
        (candidate.getAttribute('aria-label') ?? '').startsWith(${JSON.stringify(prefix)}),
    );

    if (!button) {
      throw new Error('No map cell button for ' + ${JSON.stringify(prefix)});
    }

    button.click();
    return true;
  })()`);
}

async function setCombatantVisibility(page, name, action) {
  await waitFor(page, {
    label: `${action} control for ${name}`,
    predicate: visibilityButtonExpression(name, action, 'some'),
  });
  await page.evaluate(visibilityButtonExpression(name, action, 'click'));
  await waitForCombatantRow(
    page,
    name,
    action === 'Conceal' ? 'concealed' : 'visible',
  );
}

function visibilityButtonExpression(name, action, mode) {
  return `(() => {
    const rows = [...document.querySelectorAll('[data-testid="m1-gm-visibility"] li')];
    const row = rows.find((candidate) =>
      (candidate.textContent ?? '').includes(${JSON.stringify(name)}),
    );
    const button = row
      ? [...row.querySelectorAll('button')].find(
          (candidate) =>
            (candidate.textContent ?? '').trim() === ${JSON.stringify(action)} &&
            !candidate.disabled,
        )
      : null;

    ${
      mode === 'click'
        ? `if (!button) { throw new Error('No ${action} button for ' + ${JSON.stringify(name)}); }
    button.click();
    return true;`
        : 'return Boolean(button);'
    }
  })()`;
}

async function waitForCombatantRow(page, name, state) {
  await waitFor(page, {
    label: `${name} listed as ${state}`,
    predicate: `(() => {
      const rows = [...document.querySelectorAll('[data-testid="m1-gm-visibility"] li')];
      const row = rows.find((candidate) =>
        (candidate.textContent ?? '').includes(${JSON.stringify(name)}),
      );

      return Boolean(row) &&
        row.getAttribute('data-combatant-hidden') ===
          ${JSON.stringify(state === 'concealed' ? 'true' : 'false')};
    })()`,
  });
}

async function selectPassiveEntity(page, name) {
  await waitFor(page, {
    label: `passive entity option ${name}`,
    predicate: `(() => {
      const select = document.querySelector('[data-testid="scene-entity-select"]');
      return Boolean(select) && [...select.options].some((option) =>
        (option.textContent ?? '').includes(${JSON.stringify(name)}),
      );
    })()`,
  });

  await page.evaluate(`(() => {
    const select = document.querySelector('[data-testid="scene-entity-select"]');
    const option = [...select.options].find((candidate) =>
      (candidate.textContent ?? '').includes(${JSON.stringify(name)}),
    );
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    ).set;

    setter.call(select, option.value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

/**
 * Type into the input carrying a given `data-testid`.
 *
 * React owns these values, so assigning `input.value` directly is discarded on
 * the next render; the native setter plus a bubbling `input` event is what makes
 * React observe the change. The test ID rather than the visible label is the fix
 * for the ambiguity that defeated the earlier attempt at this harness - four
 * fields are labelled "Name / label" and the first one in the DOM is not the one
 * the Place Entity button reads.
 */
async function setFieldByTestId(page, testId, value) {
  await waitFor(page, {
    label: `field [data-testid="${testId}"]`,
    predicate: `(() => {
      const input = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
      return Boolean(input) && input.offsetParent !== null;
    })()`,
  });

  await page.evaluate(`(() => {
    const input = document.querySelector('[data-testid=${JSON.stringify(testId)}]');

    if (!input) {
      throw new Error('No input ' + ${JSON.stringify(testId)});
    }

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;

    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

  await waitFor(page, {
    label: `field "${testId}" to hold ${value}`,
    predicate: `document.querySelector(
      '[data-testid=${JSON.stringify(testId)}]',
    )?.value === ${JSON.stringify(value)}`,
  });
}

async function clickTestId(page, testId) {
  await waitFor(page, {
    label: `button [data-testid="${testId}"]`,
    predicate: `(() => {
      const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');
      return Boolean(button) && !button.disabled && button.getClientRects().length > 0;
    })()`,
  });

  await page.evaluate(`(() => {
    const button = document.querySelector('[data-testid=${JSON.stringify(testId)}]');

    if (!button || button.disabled) {
      throw new Error('No enabled button ' + ${JSON.stringify(testId)});
    }

    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  })()`);
}

async function clickButton(page, label) {
  await waitFor(page, {
    label: `button "${label}"`,
    predicate: enabledButtonExpression(label, 'some'),
  });
  await page.evaluate(enabledButtonExpression(label, 'click'));
}

async function clickButtonIfEnabled(page, label) {
  if (await page.evaluate(enabledButtonExpression(label, 'some'))) {
    await clickButton(page, label);
  }
}

/**
 * Match a button's visible text exactly.
 *
 * A substring match is what made the move step reposition Aria instead of the
 * combatant: "DM Reposition" contains "Reposition" and renders first. An enabled
 * `ActionButton` renders nothing but its label, so exact equality is safe.
 */
function enabledButtonExpression(label, mode) {
  return `(() => {
    const buttons = [...document.querySelectorAll('button')].filter(
      (candidate) =>
        (candidate.textContent ?? '').trim() === ${JSON.stringify(label)} &&
        !candidate.disabled &&
        candidate.getClientRects().length > 0,
    );

    ${
      mode === 'click'
        ? `const button = buttons[0];
    if (!button) { throw new Error('No enabled button ' + ${JSON.stringify(label)}); }
    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;`
        : 'return buttons.length > 0;'
    }
  })()`;
}

async function selectMode(page, modeLabel, expectedMode) {
  await waitFor(page, {
    label: `cockpit mode "${expectedMode}"`,
    predicate: getCockpitModeSelectionExpression(
      storageKey,
      [modeLabel],
      expectedMode,
    ),
  });
}

async function setSessionInput(page, sessionId) {
  await waitFor(page, {
    label: `session ID input to hold ${sessionId}`,
    predicate: getSessionInputAssignmentExpression(sessionId),
  });
}

async function getStoredSessionId(page) {
  const sessionId = await page.evaluate(
    getStoredCockpitSessionIdExpression(storageKey),
  );

  if (!sessionId) {
    throw new Error('Expected a stored cockpit session ID.');
  }

  return sessionId;
}

async function waitForText(page, text, label) {
  await waitFor(page, {
    label,
    predicate: `(document.body?.innerText ?? '').includes(${JSON.stringify(text)})`,
  });
}

async function waitForCockpitHydrated(page) {
  await waitFor(page, {
    label: 'hydrated cockpit local state',
    predicate: `Boolean(localStorage.getItem(${JSON.stringify(storageKey)}))`,
  });
}

async function waitForNoStoredSession(page) {
  await waitFor(page, {
    label: 'local cockpit session cleared',
    predicate: `(() => {
      const raw = localStorage.getItem(${JSON.stringify(storageKey)});
      return raw ? !JSON.parse(raw).sessionId : true;
    })()`,
  });
}

async function waitForCockpitState(page, predicate) {
  await waitFor(page, {
    label: 'persisted cockpit state',
    predicate: `(() => {
      const raw = localStorage.getItem(${JSON.stringify(storageKey)});
      return raw ? (${predicate.toString()})(JSON.parse(raw)) : false;
    })()`,
  });
}

async function waitFor(page, { label, predicate, timeoutMs = smokeTimeoutMs }) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await page.evaluate(predicate)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(200);
  }

  const diagnostics = await page
    .evaluate(getPageDiagnosticsExpression(storageKey))
    .then((raw) => normalizePageDiagnostics(raw))
    .catch((error) => ({
      cockpitState: 'unavailable',
      enabledButtons: [],
      url: 'unavailable',
      visibleText: `Unable to collect page diagnostics: ${error.message}`,
    }));

  throw new Error(
    formatSmokeWaitFailure({
      diagnostics,
      label,
      lastErrorMessage: lastError?.message,
    }),
  );
}

// ---------------------------------------------------------------------------
// Failure evidence
// ---------------------------------------------------------------------------

async function captureFailureArtifacts(dm, player, error) {
  try {
    mkdirSync(artifactDir, { recursive: true });
  } catch {
    return;
  }

  const write = (name, contents) => {
    try {
      writeFileSync(resolve(artifactDir, name), contents);
    } catch {
      // Evidence collection must never mask the original failure.
    }
  };

  write(
    'failure.txt',
    error instanceof Error ? (error.stack ?? '') : String(error),
  );
  write('process-logs.json', JSON.stringify(getProcessLogTails(), null, 2));

  for (const [name, page] of [
    ['gm', dm],
    ['player', player],
  ]) {
    await captureProfileArtifacts(name, page, write);
  }

  console.error(
    `[runtime-live-scene-smoke] artifacts written to ${artifactDir}`,
  );
}

async function captureProfileArtifacts(name, page, write) {
  try {
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    write(`${name}-screenshot.png`, Buffer.from(shot.data, 'base64'));
  } catch {
    // A dead page cannot be photographed; the other evidence still helps.
  }

  try {
    write(
      `${name}-frames.json`,
      JSON.stringify(await readFrames(page), null, 2),
    );
  } catch {
    // Ignore.
  }

  try {
    const view = await page.evaluate(`(() => ({
      cells: [...document.querySelectorAll('[role="grid"] button[aria-label]')]
        .map((button) => button.getAttribute('aria-label'))
        .filter((value) => (value ?? '').split(',').length > 2),
      url: location.href,
      visibleText: (document.body?.innerText ?? '').slice(0, 4000),
    }))()`);

    write(
      `${name}-view.json`,
      JSON.stringify(
        {
          ...view,
          consoleErrors: page.consoleErrors,
          failedRequests: page.failedRequests,
        },
        null,
        2,
      ),
    );
  } catch {
    // Ignore.
  }
}

function logStep(label) {
  stepIndex += 1;
  console.log(
    formatSmokeStep({ index: stepIndex, label, total: steps.length }),
  );
}

if (isHeadedSmokeRun()) {
  console.log(
    '[runtime-live-scene-smoke] headed run: two visible Chrome windows',
  );
}
