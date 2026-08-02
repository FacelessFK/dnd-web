#!/usr/bin/env node
// Proves fog of war is enforced by the server, in two real browser profiles.
//
// The engine and the projection boundary are already covered by unit and server
// tests, including byte-level searches over an SSE transcript. What those cannot
// show is that the bytes a *browser* receives over a real stream, against a real
// server, carry nothing the player is not entitled to - and that the map in
// front of them changes when the world does, without pressing Recover.
//
// Every assertion here is on the raw Player transcript and on the Player's own
// DOM, never on the GM's view of what the Player "should" see.
//
// The map is built through the browser's own transport rather than the GM UI,
// because ROADMAP M3 wave one deliberately ships no lighting authoring tools -
// there is no control for ambient light or a light source yet. The commands go
// to the same HTTP endpoints the app uses, with the credential the app already
// holds, so the server path under test is the real one. Wave two replaces this
// setup with the GM tools it will add.
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import {
  assertWebUiTargetsServer,
  getCockpitModeSelectionExpression,
  getSessionInputAssignmentExpression,
  getStoredCockpitSessionIdExpression,
  isHeadedSmokeRun,
} from './runtime-smoke-diagnostics.mjs';
import {
  cleanup,
  clearFrames,
  createCdpPage,
  delay,
  enablePage,
  findBrowserExecutable,
  getFreePort,
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
  resolve(process.env.TMPDIR ?? '/tmp', `dnd-m3-fog-artifacts-${process.pid}`);

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------
// A 13x9 room, dark, with one torch and a wall spur hanging off the corridor.
//
//        0 1 2 3 4 5 6 7 8 9 10 11 12
//   y=4  . A . T . . . . . .  .  .  .     A = the player's character, T = torch
//   y=5  . . . . # . . . . .  .  .  .     # = the wall spur
//   y=6  . . . . # . . . . .  .  .  .
//   y=7  . . . . # . . . . .  .  .  .
//   y=8  . . . . # . . . . .  .  .  .
//
// The spur is what makes observer movement observable: from the west end of the
// corridor its shadow covers the south-east floor, and from the east end it does
// not. `lava` is painted in one far corner as a marker tile that appears nowhere
// else, so the byte audit can look for a specific terrain value the player must
// never learn about.
const GRID = { cellSizeFeet: 5, width: 13, height: 9 };
const OBSERVER_START = { x: 1, y: 4 };
const OBSERVER_MOVED = { x: 5, y: 4 };
const TORCH_CELL = { x: 3, y: 4 };
const SHUTTER_CELL = { x: 6, y: 4 };
const NEAR_CRATE_CELL = { x: 2, y: 3 };
const FAR_CRATE_CELL = { x: 11, y: 4 };
const LURKER_CELL = { x: 3, y: 3 };
const SECRET_TILE = 'lava';
const SECRET_TILE_CELL = { x: 12, y: 8 };

const SCENE_NAME = 'Fog Proving Corridor';
const NEAR_CRATE_NAME = 'FogNearCrate';
const FAR_CRATE_NAME = 'FogFarCrate';
const LURKER_NAME = 'FogHiddenLurker';
const SHUTTER_NAME = 'FogShutter';
const TORCH_NAME = 'FogTorch';

const steps = [
  'starting authoritative server',
  'starting Next runtime UI',
  'launching isolated GM and Player profiles',
  'building the table in the GM profile',
  'authoring the dark fog map',
  'seating the Player and subscribing both profiles',
  'checking the GM receives the whole map',
  'checking the Player receives only lit line of sight',
  'checking unknown terrain is absent from the raw Player bytes',
  'moving the observer',
  'disabling the vision blocker',
  'disabling the light source',
  're-enabling the light source',
  'restoring the projected view after a refresh',
  'auditing raw Player bytes for withheld data',
];
let stepIndex = 0;
let recoverClicks = 0;

installCleanupHandlers();

main().catch(async (error) => {
  console.error('\n[m3-fog-projection-smoke] failed');
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

  await assertRenderModeMatchesRequest(dm, 'GM');
  await assertRenderModeMatchesRequest(player, 'Player');

  try {
    await run(dm, player, serverUrl);
    console.log('[m3-fog-projection-smoke] passed');
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
 * That the browser rendering this run is the one the run asked for.
 *
 * A headed visibility check is only worth doing because a person can watch it,
 * and the whole value evaporates if the run quietly came up headless instead.
 * The arguments Chrome was spawned with cannot settle that - they are what was
 * requested, not what happened - so this asks the renderer itself: `--headless`
 * puts "HeadlessChrome" in the user agent and a headed window does not.
 */
async function assertRenderModeMatchesRequest(page, label) {
  const userAgent = await page.evaluate('navigator.userAgent');
  const renderedHeadless = /headlesschrome/i.test(String(userAgent ?? ''));

  if (isHeadedSmokeRun() && renderedHeadless) {
    throw new Error(
      `${label}: RUNTIME_SMOKE_HEADED was set but Chrome came up headless.`,
    );
  }

  if (!isHeadedSmokeRun() && !renderedHeadless) {
    throw new Error(
      `${label}: this run did not ask for a headed browser but got one.`,
    );
  }

  console.log(
    `[m3-fog-smoke] ${label} renderer: ${renderedHeadless ? 'headless' : 'headed'}`,
  );
}

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

async function run(dm, player, serverUrl) {
  await waitForText(dm, 'Runtime War Table', 'GM runtime shell');
  await waitForCockpitHydrated(dm);
  await clickButtonIfEnabled(dm, 'Local Reset');
  await waitForNoStoredSession(dm);
  await selectMode(dm, 'DM Mode', 'dm');

  logStep('building the table in the GM profile');
  await clickButton(dm, 'Run Training Room Skirmish');
  await waitForCockpitState(dm, (state) =>
    Boolean(state && state.sessionId && state.sceneId),
  );
  const sessionId = await getStoredSessionId(dm);
  await waitForMapReady(dm, 'GM tactical map');

  logStep('authoring the dark fog map');
  const scene = await authorFogScene(dm, serverUrl, sessionId);

  logStep('seating the Player and subscribing both profiles');
  await waitForText(player, 'Runtime War Table', 'Player runtime shell');
  await waitForCockpitHydrated(player);
  await clickButtonIfEnabled(player, 'Local Reset');
  await waitForNoStoredSession(player);
  await selectMode(player, 'Player Mode', 'player');
  await setSessionInput(player, sessionId);
  await clickButton(player, 'Join Session');
  await waitForCockpitState(player, (state) =>
    Boolean(state && state.sessionId),
  );

  // Recover is the only path that enables the subscription today. Both seats
  // subscribe here, before any of the live assertions, and `assertNoRecoverSince`
  // guards every one of them.
  await recover(player);
  await waitForMapReady(player, 'Player tactical map');
  await recover(dm);
  await waitForStreamOpen(dm, 'GM subscription');
  await waitForStreamOpen(player, 'Player subscription');

  const recoverBaseline = recoverClicks;

  logStep('checking the GM receives the whole map');
  await assertGmSeesWholeMap(dm, scene);

  logStep('checking the Player receives only lit line of sight');
  const litView = await waitForProjectedView(player, 'initial projection');

  assertViewIsProjected(litView, 'initial projection');
  assertCellKnown(litView, TORCH_CELL, true, 'the torch cell is lit and seen');
  assertCellKnown(litView, OBSERVER_START, true, 'the observer stands on it');
  assertCellKnown(
    litView,
    FAR_CRATE_CELL,
    false,
    'the far end of the corridor is dark',
  );
  assertCellKnown(
    litView,
    SECRET_TILE_CELL,
    false,
    'the far corner is dark and unseen',
  );
  assertEntityPresent(
    litView,
    NEAR_CRATE_NAME,
    true,
    'lit and in line of sight',
  );
  assertEntityPresent(
    litView,
    FAR_CRATE_NAME,
    false,
    'behind the shutter and in darkness',
  );
  assertEntityPresent(
    litView,
    LURKER_NAME,
    false,
    'concealed by the GM, though lit and in line of sight',
  );
  assertNoRecoverSince(recoverBaseline, 'initial projection');

  logStep('checking unknown terrain is absent from the raw Player bytes');
  await assertPlayerBytesOmit(
    player,
    [SECRET_TILE, FAR_CRATE_NAME, LURKER_NAME, '"terrain"'],
    'initial projection',
  );

  logStep('moving the observer');
  await clearFrames(player);
  const beforeMove = await readMapSignature(player);
  await moveObserver(player, serverUrl, sessionId, OBSERVER_MOVED);

  const movedView = await waitForProjectedViewWhere(
    player,
    (view) => cellIsKnown(view, OBSERVER_MOVED),
    'observer movement',
  );

  assertCellKnown(
    movedView,
    OBSERVER_MOVED,
    true,
    'the observer stands on its new cell',
  );
  assertKnownCellsDiffer(litView, movedView, 'observer movement');
  await assertMapSignatureChanged(player, beforeMove, 'observer movement');
  assertNoRecoverSince(recoverBaseline, 'observer movement');

  // The move the Player just made is also a line in their event feed. The
  // fog assertions above are all about the board; this is the one surface that
  // narrates the same movement in words, and it is where a seat ID reached a
  // player's screen. Asserted here so the headed visibility run proves it too,
  // rather than leaving it entirely to the M2 acceptance.
  await assertPlayerFeedNamesNoIdentifier(player);

  logStep('disabling the vision blocker');
  await clearFrames(player);
  const beforeShutter = await readMapSignature(player);
  await updateSceneEntity(dm, serverUrl, sessionId, scene.id, scene.shutterId, {
    blocksVision: false,
  });

  const openedView = await waitForProjectedViewWhere(
    player,
    (view) => !viewEquals(view, movedView),
    'blocker disabled',
  );

  assertKnownCellsDiffer(movedView, openedView, 'blocker disabled');
  await assertMapSignatureChanged(player, beforeShutter, 'blocker disabled');
  assertNoRecoverSince(recoverBaseline, 'blocker disabled');

  logStep('disabling the light source');
  await clearFrames(player);
  await updateSceneEntity(dm, serverUrl, sessionId, scene.id, scene.torchId, {
    lightSource: { enabled: false, brightRadius: 1, dimRadius: 6 },
  });

  const darkView = await waitForProjectedViewWhere(
    player,
    (view) => view.cells.length === 0,
    'light disabled',
  );

  assertEntityPresent(
    darkView,
    NEAR_CRATE_NAME,
    false,
    'nothing is visible in a dark room with no light',
  );
  assertNoRecoverSince(recoverBaseline, 'light disabled');
  await assertPlayerBytesOmit(
    player,
    [SECRET_TILE, NEAR_CRATE_NAME, FAR_CRATE_NAME, LURKER_NAME],
    'light disabled',
  );

  logStep('re-enabling the light source');
  await clearFrames(player);
  await updateSceneEntity(dm, serverUrl, sessionId, scene.id, scene.torchId, {
    lightSource: { enabled: true, brightRadius: 1, dimRadius: 6 },
  });

  const relitView = await waitForProjectedViewWhere(
    player,
    (view) => view.cells.length > 0,
    'light re-enabled',
  );

  assertCellKnown(relitView, TORCH_CELL, true, 'the torch lights its own cell');
  assertEntityPresent(
    relitView,
    LURKER_NAME,
    false,
    'concealment survives the light coming back',
  );
  assertNoRecoverSince(recoverBaseline, 'light re-enabled');

  // Reloading resets the recorder, so every frame audited below belongs to a
  // table whose secrets have never been legitimately named on this transcript.
  logStep('restoring the projected view after a refresh');
  await reloadPage(player);
  await waitForText(player, 'Runtime War Table', 'Player shell after reload');
  await waitForCockpitHydrated(player);
  await setSessionInput(player, sessionId);
  await recover(player);
  await waitForMapReady(player, 'Player map after reload');

  const restoredView = await waitForProjectedView(player, 'after refresh');

  assertViewIsProjected(restoredView, 'after refresh');
  assertCellKnown(restoredView, TORCH_CELL, true, 'the lit region came back');
  assertEntityPresent(restoredView, LURKER_NAME, false, 'after refresh');
  assertEntityPresent(restoredView, FAR_CRATE_NAME, false, 'after refresh');

  logStep('auditing raw Player bytes for withheld data');
  await assertGmStillSeesWholeMap(dm, scene);
  await assertPlayerBytesClean(player, scene);
  await assertConsoleClean(player, 'Player');
  await assertConsoleClean(dm, 'GM');
}

// ---------------------------------------------------------------------------
// Building the fixture through the browser's own transport
// ---------------------------------------------------------------------------

async function authorFogScene(page, serverUrl, sessionId) {
  const terrainCells = [
    // The wall spur hanging south off the corridor.
    ...[5, 6, 7, 8].map((y) => ({ position: { x: 4, y }, tile: 'wall' })),
    // A marker tile that exists nowhere else, in a corner the player must never
    // learn about.
    { position: SECRET_TILE_CELL, tile: SECRET_TILE },
  ];

  const created = await sendSceneCommand(page, serverUrl, sessionId, {
    type: 'create_scene',
    payload: {
      sessionId,
      scene: { name: SCENE_NAME, grid: GRID, ambientLight: 'dark' },
    },
  });
  const sceneId = created.data.scene.id;

  await sendSceneCommand(page, serverUrl, sessionId, {
    type: 'paint_scene_terrain',
    payload: { sessionId, sceneId, cells: terrainCells },
  });
  await sendSceneCommand(page, serverUrl, sessionId, {
    type: 'activate_scene_for_session',
    payload: { sessionId, sceneId },
  });

  const torchId = await placeEntity(page, serverUrl, sessionId, sceneId, {
    name: TORCH_NAME,
    position: TORCH_CELL,
    blocksMovement: false,
    blocksVision: false,
    hidden: false,
    lightSource: { enabled: true, brightRadius: 1, dimRadius: 6 },
  });
  const shutterId = await placeEntity(page, serverUrl, sessionId, sceneId, {
    name: SHUTTER_NAME,
    position: SHUTTER_CELL,
    blocksMovement: false,
    blocksVision: true,
    hidden: false,
  });

  await placeEntity(page, serverUrl, sessionId, sceneId, {
    name: NEAR_CRATE_NAME,
    position: NEAR_CRATE_CELL,
    blocksMovement: true,
    blocksVision: false,
    hidden: false,
  });
  await placeEntity(page, serverUrl, sessionId, sceneId, {
    name: FAR_CRATE_NAME,
    position: FAR_CRATE_CELL,
    blocksMovement: true,
    blocksVision: false,
    hidden: false,
  });
  await placeEntity(page, serverUrl, sessionId, sceneId, {
    name: LURKER_NAME,
    position: LURKER_CELL,
    blocksMovement: true,
    blocksVision: false,
    hidden: true,
  });

  // The demo scenario placed the player's character in the Training Room, and a
  // placement names the scene it was made in. Without this the character has no
  // position in the new scene, which is the fail-closed case rather than the one
  // this harness is about.
  await placeObserver(page, serverUrl, sessionId, OBSERVER_START);

  return { id: sceneId, torchId, shutterId };
}

async function placeEntity(page, serverUrl, sessionId, sceneId, entity) {
  const placed = await sendSceneCommand(page, serverUrl, sessionId, {
    type: 'place_entity_in_scene',
    payload: {
      sessionId,
      sceneId,
      entity: { type: 'object', footprint: { width: 1, height: 1 }, ...entity },
    },
  });
  const match = placed.data.scene.entities.find(
    (candidate) => candidate.name === entity.name,
  );

  if (!match) {
    throw new Error(`The server did not place ${entity.name}.`);
  }

  return match.id;
}

async function updateSceneEntity(
  page,
  serverUrl,
  sessionId,
  sceneId,
  entityId,
  entity,
) {
  return sendSceneCommand(page, serverUrl, sessionId, {
    type: 'update_scene_entity',
    payload: { sessionId, sceneId, entityId, entity },
  });
}

function sendSceneCommand(page, serverUrl, sessionId, command) {
  return sendCommand(
    page,
    serverUrl,
    sessionId,
    '/api/scenes/command',
    command,
  );
}

/**
 * Put the player's token on a cell of the active scene.
 *
 * `place_character_in_active_scene` rather than a move: the harness is
 * positioning an observer to set up a visibility question, not exercising the
 * movement rules, and placement is the command that takes a bare cell without a
 * budget or an encounter turn. The GM may issue it for a seated player, which is
 * the same authorization a GM repositioning a token at the table has.
 */
function placeObserver(page, serverUrl, sessionId, position) {
  return sendCommand(
    page,
    serverUrl,
    sessionId,
    '/api/movement/command',
    {
      type: 'place_character_in_active_scene',
      payload: { sessionId, participantId: 'player-001', position },
    },
    'dm-001',
  );
}

/**
 * Walk the observer, from the Player's own page and under their own credential.
 *
 * A placed character has to move rather than be re-placed - the server says so -
 * and moving is what a player actually does, so this is the path that matters:
 * the seat whose fog is about to change is the seat issuing the command.
 */
function moveObserver(page, serverUrl, sessionId, position) {
  return sendCommand(
    page,
    serverUrl,
    sessionId,
    '/api/movement/command',
    {
      type: 'move_character_in_active_scene',
      payload: { sessionId, participantId: 'player-001', position },
    },
    'player-001',
  );
}

/**
 * Issue one command from inside the GM's page, with the credential that page
 * already holds.
 *
 * Deliberately the browser's own fetch against the real endpoint rather than a
 * request from Node: the seat, the token and the origin are the ones the
 * application established, so the authorization the server applies is the real
 * one. Nothing here is a back door - a command sent this way is gated exactly as
 * a click would be.
 */
async function sendCommand(
  page,
  serverUrl,
  sessionId,
  path,
  command,
  actorId = 'dm-001',
) {
  const payload = JSON.stringify({
    ...command,
    actor: { participantId: actorId },
  });
  const expression = `
    (async () => {
      const raw = localStorage.getItem('dnd-participant-credential');
      const entries = raw ? JSON.parse(raw) : [];
      const held = entries.find(
        (entry) =>
          entry &&
          entry.sessionId === ${JSON.stringify(sessionId)} &&
          entry.participantId === ${JSON.stringify(actorId)},
      );

      if (!held) {
        return JSON.stringify({
          ok: false,
          error: 'no credential for ' + ${JSON.stringify(actorId)} + ' in storage',
        });
      }

      const body = ${payload};

      body.commandId = crypto.randomUUID();

      const response = await fetch(${JSON.stringify(serverUrl)} + ${JSON.stringify(path)}, {
        body: JSON.stringify(body),
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-dnd-participant-token': held.token,
        },
        method: 'POST',
      });

      return JSON.stringify({ ok: response.ok, status: response.status, body: await response.json() });
    })()
  `;

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  const parsed = JSON.parse(result.result?.value ?? '{}');

  if (!parsed.ok || !parsed.body?.ok) {
    throw new Error(
      `${command.type} failed: ${JSON.stringify(parsed).slice(0, 800)}`,
    );
  }

  return parsed.body;
}

// ---------------------------------------------------------------------------
// Reading what each seat actually received
// ---------------------------------------------------------------------------

/** The newest `scene_state` frame on a transcript, parsed. */
async function readLatestSceneFrame(page) {
  const frames = await readFrames(page, 'scene_state');

  if (!frames.length) {
    return null;
  }

  const raw = frames[frames.length - 1].raw;
  const start = raw.indexOf('{');

  return start < 0 ? null : JSON.parse(raw.slice(start));
}

async function waitForProjectedView(page, label) {
  return waitForProjectedViewWhere(page, () => true, label);
}

async function waitForProjectedViewWhere(page, predicate, label) {
  const deadline = Date.now() + smokeTimeoutMs;
  let latest = null;

  while (Date.now() < deadline) {
    const frame = await readLatestSceneFrame(page);

    if (frame?.view === 'player_projection') {
      latest = frame.scene;

      if (predicate(latest)) {
        return latest;
      }
    }

    await delay(200);
  }

  throw new Error(
    `${label}: no Player scene frame satisfied the condition. Latest: ${JSON.stringify(latest).slice(0, 1200)}`,
  );
}

function knownCellKeys(view) {
  const keys = new Set();

  for (const run of view.cells ?? []) {
    for (let offset = 0; offset < run.length; offset += 1) {
      keys.add(`${run.x + offset},${run.y}`);
    }
  }

  return keys;
}

function cellIsKnown(view, cell) {
  return knownCellKeys(view).has(`${cell.x},${cell.y}`);
}

function viewEquals(left, right) {
  return JSON.stringify(left.cells) === JSON.stringify(right.cells);
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

function assertViewIsProjected(view, label) {
  if (view.view !== 'player_projection') {
    throw new Error(`${label}: the Player received a non-projected scene.`);
  }

  if ('terrain' in view) {
    throw new Error(
      `${label}: the Player payload carried an authoritative terrain layer.`,
    );
  }
}

function assertCellKnown(view, cell, expected, why) {
  const known = cellIsKnown(view, cell);

  if (known !== expected) {
    throw new Error(
      `Cell ${cell.x},${cell.y} was ${known ? 'known' : 'unknown'} but should be ` +
        `${expected ? 'known' : 'unknown'} - ${why}. ` +
        `Known cells: ${[...knownCellKeys(view)].sort().join(' ') || '(none)'}`,
    );
  }
}

function assertEntityPresent(view, name, expected, why) {
  const present = (view.entities ?? []).some((entity) => entity.name === name);

  if (present !== expected) {
    throw new Error(
      `Entity ${name} was ${present ? 'present' : 'absent'} but should be ` +
        `${expected ? 'present' : 'absent'} - ${why}. ` +
        `Entities: ${(view.entities ?? []).map((entity) => entity.name).join(', ') || '(none)'}`,
    );
  }
}

function assertKnownCellsDiffer(before, after, label) {
  const left = knownCellKeys(before);
  const right = knownCellKeys(after);
  const changed =
    left.size !== right.size || [...left].some((key) => !right.has(key));

  if (!changed) {
    throw new Error(
      `${label}: the Player's known cells did not change, so the view was not recomputed.`,
    );
  }
}

async function assertGmSeesWholeMap(page, scene) {
  const frame = await waitForAuthoritativeFrame(page, 'GM projection');

  if (!frame.terrain) {
    throw new Error('The GM received no terrain layer.');
  }

  for (const name of [
    TORCH_NAME,
    SHUTTER_NAME,
    NEAR_CRATE_NAME,
    FAR_CRATE_NAME,
    LURKER_NAME,
  ]) {
    if (!frame.entities.some((entity) => entity.name === name)) {
      throw new Error(`The GM's map is missing ${name}.`);
    }
  }

  if (!frame.entities.some((entity) => entity.hidden)) {
    throw new Error(
      'The GM received no concealed entity, so it was projected.',
    );
  }

  if (frame.id !== scene.id) {
    throw new Error('The GM is looking at a different scene than the fixture.');
  }
}

async function assertGmStillSeesWholeMap(page, scene) {
  await assertGmSeesWholeMap(page, scene);
}

async function waitForAuthoritativeFrame(page, label) {
  const deadline = Date.now() + smokeTimeoutMs;

  while (Date.now() < deadline) {
    const frame = await readLatestSceneFrame(page);

    if (frame?.view === 'authoritative') {
      return frame.scene;
    }

    await delay(200);
  }

  throw new Error(`${label}: the GM received no authoritative scene frame.`);
}

async function assertPlayerBytesOmit(page, needles, label) {
  const frames = await readFrames(page);
  const transcript = frames.map((frame) => frame.raw).join('\n');

  for (const needle of needles) {
    if (transcript.includes(needle)) {
      throw new Error(
        `${label}: the raw Player transcript contained ${JSON.stringify(needle)}.`,
      );
    }
  }
}

/**
 * The final sweep, over every byte this browser received since the reload -
 * stream frames and HTTP response bodies alike.
 *
 * DOM absence is not checked here on purpose. A value the client holds but does
 * not draw is still a value the client holds, and the whole point of projecting
 * on the server is that it never arrives.
 */
async function assertPlayerBytesClean(page, scene) {
  const frames = await readFrames(page);
  const responses = await readResponses(page);
  const transcript = [
    ...frames.map((frame) => frame.raw),
    ...responses.map((response) => response.body ?? ''),
  ].join('\n');

  const forbidden = [
    [LURKER_NAME, 'the concealed entity name'],
    [FAR_CRATE_NAME, 'an entity the observer cannot see'],
    [SECRET_TILE, 'a terrain value only present in an unknown cell'],
    ['"terrain"', 'the authoritative terrain layer'],
    ['"hidden"', 'a concealment flag'],
    ['ownerParticipantId', 'an account ownership identifier'],
    ['participantToken', 'a credential'],
  ];

  for (const [needle, description] of forbidden) {
    if (transcript.includes(needle)) {
      const offender = [...frames, ...responses].find((entry) =>
        (entry.raw ?? entry.body ?? '').includes(needle),
      );

      throw new Error(
        `The Player received ${description} (${JSON.stringify(needle)}).\n` +
          `Offending payload: ${JSON.stringify(offender).slice(0, 1200)}`,
      );
    }
  }

  if (transcript.includes(scene.torchId) === false) {
    // The torch is a visible entity in the lit region; if its ID is missing the
    // audit above may have been searching an empty transcript.
    throw new Error(
      'The Player transcript named nothing at all, so the byte audit proved nothing.',
    );
  }

  console.log(
    `[m3-fog-projection-smoke] audited ${frames.length} raw Player frames and ` +
      `${responses.length} HTTP response bodies; no withheld map state present`,
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

async function assertMapSignatureChanged(page, before, label) {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    const now = await readMapSignature(page);

    if (now && now !== before) {
      return;
    }

    await delay(200);
  }

  throw new Error(`${label}: the Player canvas did not repaint.`);
}

/**
 * The Player's event feed, in words, with nothing from the wire in it.
 *
 * The board hides what a player may not see; the feed has to as well, and it
 * used to not - it interpolated the seat and record IDs a `movement_state`
 * frame carries into the sentence it rendered. Patterns rather than one known
 * value, so this catches the class rather than the instance.
 */
async function assertPlayerFeedNamesNoIdentifier(page) {
  const text = String(
    (await page.evaluate(
      `(() => {
        const feed = document.querySelector('[data-hud-region="event-feed"]');
        return feed ? (feed.innerText ?? '') : '';
      })()`,
    )) ?? '',
  );

  if (!text.trim()) {
    throw new Error('The Player event feed rendered no text to audit.');
  }

  const forbidden = [
    { label: 'a participant ID', pattern: /\b(?:player|dm)-\d{3}\b/ },
    { label: 'a character record ID', pattern: /\bcharacter_[0-9a-f]/ },
    { label: 'a scene entity ID', pattern: /scene_entity_/ },
    { label: 'a scene ID', pattern: /\bscene_[0-9a-f]/ },
    { label: 'an encounter ID', pattern: /\bencounter_[0-9a-f]/ },
    {
      label: 'a UUID',
      pattern:
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    },
    { label: 'an untranslated message key', pattern: /runtime\.[a-z]+\./i },
    { label: 'an unlocalized actor sentinel', pattern: /__[a-z_]+__/ },
  ];

  for (const { label, pattern } of forbidden) {
    const match = pattern.exec(text);

    if (match) {
      throw new Error(
        `The Player event feed rendered ${label}: ${JSON.stringify(match[0])}\n` +
          `Feed text: ${JSON.stringify(text)}`,
      );
    }
  }
}

async function readMapSignature(page) {
  return evaluate(
    page,
    `(() => {
      const canvas = document.querySelector('[data-tactical-map] canvas');

      if (!canvas) {
        return '';
      }

      try {
        return canvas.toDataURL().slice(-4096);
      } catch {
        return '';
      }
    })()`,
  );
}

// ---------------------------------------------------------------------------
// Page driving
// ---------------------------------------------------------------------------

async function recover(page) {
  recoverClicks += 1;
  await clickButton(page, 'Recover');
}

async function reloadPage(page) {
  await page.send('Page.reload', { ignoreCache: true });
  await delay(1500);
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

async function clickButton(page, label) {
  await waitFor(page, {
    label: `button ${label}`,
    predicate: enabledButtonExpression(label, 'exists'),
  });
  await evaluate(page, enabledButtonExpression(label, 'click'));
}

async function clickButtonIfEnabled(page, label) {
  await evaluate(page, enabledButtonExpression(label, 'click'));
}

function enabledButtonExpression(label, mode) {
  return `(() => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) =>
        (candidate.textContent ?? '').trim() === ${JSON.stringify(label)} &&
        !candidate.disabled,
    );

    if (!button) {
      return false;
    }

    if (${JSON.stringify(mode)} === 'click') {
      button.click();
    }

    return true;
  })()`;
}

// The mode selector is asserted against stored state rather than a click,
// because a click that lands before hydration is silently discarded. The shared
// expression re-clicks whenever storage disagrees, which is what makes this
// reliable.
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
  const sessionId = await evaluate(
    page,
    getStoredCockpitSessionIdExpression(storageKey),
  );

  if (!sessionId) {
    throw new Error('The GM profile stored no session ID.');
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
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await evaluate(page, predicate)) {
      return;
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

function evaluate(page, expression) {
  return page.evaluate(expression);
}

async function captureFailureArtifacts(dm, player, error) {
  try {
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      resolve(artifactDir, 'failure.txt'),
      String(error instanceof Error ? error.stack : error),
      'utf8',
    );

    for (const [name, page] of [
      ['gm', dm],
      ['player', player],
    ]) {
      const frames = await readFrames(page).catch(() => []);

      writeFileSync(
        resolve(artifactDir, `${name}-frames.json`),
        JSON.stringify(frames, null, 2),
        'utf8',
      );
    }

    console.error(`[m3-fog-projection-smoke] artifacts in ${artifactDir}`);
  } catch (artifactError) {
    console.error(
      '[m3-fog-projection-smoke] could not capture artifacts',
      artifactError,
    );
  }
}

function logStep(label) {
  stepIndex += 1;
  console.log(`[m3-fog-smoke] ${stepIndex}/${steps.length} ${label}`);
}
