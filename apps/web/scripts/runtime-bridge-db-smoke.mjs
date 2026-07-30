#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatSmokeStep,
  formatSmokeWaitFailure,
  getPageDiagnosticsExpression,
  getSessionInputAssignmentExpression,
  normalizePageDiagnostics,
} from './runtime-smoke-diagnostics.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(scriptDir, '..');
const repoRoot = resolve(webDir, '../..');
const dbDir = resolve(repoRoot, 'packages/db');
const serverDir = resolve(repoRoot, 'apps/server');
const nextBin = resolve(webDir, 'node_modules/next/dist/bin/next');
const storageKey = 'dnd-runtime-cockpit';
const smokeTimeoutMs = Number.parseInt(
  process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? '120000',
  10,
);

const processLogs = new Map();
const startedProcesses = [];
const profileDirs = [];
const smokeStepLabels = [
  'checking DB-mode configuration',
  'checking DB-mode local environment readiness',
  'starting DB-backed authoritative server',
  'starting Next runtime UI',
  'seeding authenticated finalized saved character',
  'creating runtime session',
  'submitting saved character through Player browser',
  'assigning runtime copy through DM browser',
  'validating runtime copy provenance and library separation',
  'building Training Room around assigned runtime copy',
  'recovering Training Room evidence in DM and Player browsers',
  'validating Player local reset and recovery',
];
let smokeStepIndex = 0;

loadRepoEnvironment();

main().catch(async (error) => {
  console.error('\n[runtime-bridge-db-smoke] failed');
  console.error(redactSecrets(error instanceof Error ? error.stack : error));
  printProcessLogs();
  await cleanup();
  process.exit(1);
});

async function main() {
  logSmokeStep('checking DB-mode configuration');

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for the DB-mode bridge smoke. Apply packages/db/migrations first, then rerun with SERVER_PERSISTENCE_MODE=db and DATABASE_URL set.',
    );
  }

  logSmokeStep('checking DB-mode local environment readiness');
  await runDbReadinessCheck();

  const browserPath = findBrowserExecutable();

  if (!browserPath) {
    throw new Error(
      'No Chrome/Chromium executable found. Set RUNTIME_SMOKE_BROWSER=/path/to/chrome to run the DB-mode bridge smoke.',
    );
  }

  if (typeof WebSocket !== 'function') {
    throw new Error(
      'This smoke test requires a Node runtime with global WebSocket support.',
    );
  }

  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const dmDebugPort = await getFreePort();
  const playerDebugPort = await getFreePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const runtimeUrl = `${webOrigin}/runtime`;
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const playerEmail = `bridge-${unique}@example.test`;
  const playerPassword = `bridge-password-${unique}`;
  const savedCharacterName = `Bridge Seren ${unique.slice(-6)}`;

  logSmokeStep('starting DB-backed authoritative server');
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
  await waitForHttp(`${serverUrl}/`, {
    label: 'DB-backed server root',
    timeoutMs: smokeTimeoutMs,
  });

  logSmokeStep('starting Next runtime UI');
  startProcess(
    'web',
    process.execPath,
    [nextBin, 'dev', '-p', String(webPort), '-H', '127.0.0.1'],
    {
      cwd: webDir,
      env: {
        NEXT_PUBLIC_SERVER_URL: serverUrl,
      },
    },
  );
  await waitForHttp(runtimeUrl, {
    label: '/runtime',
    timeoutMs: smokeTimeoutMs,
  });

  logSmokeStep('seeding authenticated finalized saved character');
  const registered = await registerUser(serverUrl, {
    displayName: 'Bridge Player',
    email: playerEmail,
    password: playerPassword,
  });
  const createdEntry = await postCommand({
    body: {
      actor: { participantId: registered.user.id },
      commandId: `bridge-smoke-create-entry-${unique}`,
      payload: {
        entry: createSavedCharacterInput(savedCharacterName),
        ownerParticipantId: registered.user.id,
      },
      type: 'create_character_library_entry',
    },
    cookie: registered.cookie,
    path: '/api/character-library/command',
    serverUrl,
  });
  assertOk(createdEntry, 'create_character_library_entry');
  const entryId = createdEntry.data.entry.id;
  const finalizedEntry = await postCommand({
    body: {
      actor: { participantId: registered.user.id },
      commandId: `bridge-smoke-finalize-entry-${unique}`,
      payload: {
        entryId,
        ownerParticipantId: registered.user.id,
      },
      type: 'finalize_character_library_entry',
    },
    cookie: registered.cookie,
    path: '/api/character-library/command',
    serverUrl,
  });
  assertOk(finalizedEntry, 'finalize_character_library_entry');

  logSmokeStep('creating runtime session');
  const createdSession = await postCommand({
    body: {
      actor: {
        displayName: 'Dungeon Master',
        participantId: 'dm-001',
        role: 'dm',
      },
      commandId: `bridge-smoke-create-session-${unique}`,
      payload: {
        rulesProfileId: 'dnd5e-2024-core',
      },
      type: 'create_session',
    },
    path: '/api/session/command',
    serverUrl,
  });
  assertOk(createdSession, 'create_session');
  const sessionId = createdSession.data.sessionId;

  launchBrowserProfile('dm-chrome', browserPath, dmDebugPort);
  launchBrowserProfile('player-chrome', browserPath, playerDebugPort);
  await Promise.all([
    waitForHttp(`http://127.0.0.1:${dmDebugPort}/json/version`, {
      label: 'DM Chrome DevTools',
      timeoutMs: smokeTimeoutMs,
    }),
    waitForHttp(`http://127.0.0.1:${playerDebugPort}/json/version`, {
      label: 'Player Chrome DevTools',
      timeoutMs: smokeTimeoutMs,
    }),
  ]);

  const playerPage = await createCdpPage(playerDebugPort, runtimeUrl);
  const dmPage = await createCdpPage(dmDebugPort, runtimeUrl);

  try {
    await Promise.all([enablePage(playerPage), enablePage(dmPage)]);

    logSmokeStep('submitting saved character through Player browser');
    await waitForRuntimeShell(playerPage, 'Player runtime shell');
    await loginInBrowser(playerPage, serverUrl, {
      email: playerEmail,
      password: playerPassword,
    });
    await navigate(playerPage, runtimeUrl);
    await waitForRuntimeShell(playerPage, 'authenticated Player runtime shell');
    await waitForCockpitHydrated(playerPage);
    await clickButtonIfEnabled(playerPage, ['Local Reset', 'بازنشانی محلی']);
    await waitForNoStoredSession(playerPage);
    await clickButton(playerPage, ['Player Mode', 'حالت بازیکن']);
    await setSessionInputValue(playerPage, sessionId);
    await clickButton(playerPage, ['Join Session', 'پیوستن به نشست']);
    // The player joined in the browser, so the browser holds that credential.
    // Copy it out so the harness can also read player state over HTTP.
    await captureBrowserCredential(playerPage, 'Player runtime tab');
    await waitForAnyText(
      playerPage,
      ['Saved Character Library', 'کتابخانه کاراکترهای ذخیره‌شده'],
      'saved character library panel',
    );
    await waitForAnyText(
      playerPage,
      [savedCharacterName],
      'seeded finalized saved character',
    );
    await clickButton(playerPage, [
      'Submit Saved Character',
      'ارسال کاراکتر ذخیره‌شده',
    ]);
    await waitForAnyText(
      playerPage,
      ['Pending DM assignment', 'در انتظار تخصیص توسط DM'],
      'Player pending assignment status',
    );
    await waitForAnyText(
      playerPage,
      [savedCharacterName],
      'Player runtime copy summary',
    );

    logSmokeStep('assigning runtime copy through DM browser');
    await waitForRuntimeShell(dmPage, 'DM runtime shell');
    await waitForCockpitHydrated(dmPage);
    await clickButtonIfEnabled(dmPage, ['Local Reset', 'بازنشانی محلی']);
    await waitForNoStoredSession(dmPage);
    await clickButton(dmPage, ['DM Mode', 'حالت DM']);
    await setSessionInputValue(dmPage, sessionId);
    // Local Reset above cleared any credential in this tab, and the DM session
    // was created by the harness rather than by this browser.
    await injectBrowserCredential(dmPage, sessionId, 'dm-001');
    await clickButton(dmPage, ['Recover', 'بازیابی']);
    await waitForAnyText(
      dmPage,
      ['Assignment Requests', 'درخواست‌های تخصیص'],
      'DM assignment requests panel',
    );
    await waitForAnyText(dmPage, [savedCharacterName], 'DM pending preview');
    await waitForAnyText(
      dmPage,
      [entryId],
      'DM source library entry provenance before assignment',
    );
    await clickButton(dmPage, ['Assign Runtime Copy', 'تخصیص نسخه runtime']);
    await waitForNoVisibleButton(dmPage, [
      'Assign Runtime Copy',
      'تخصیص نسخه runtime',
    ]);
    await waitForAnyText(
      dmPage,
      [entryId],
      'DM assigned character source provenance',
    );

    logSmokeStep('validating runtime copy provenance and library separation');
    const sessionSnapshot = await postCommand({
      body: {
        actor: {
          participantId: 'dm-001',
        },
        commandId: `bridge-smoke-reconnect-${unique}`,
        payload: {
          sessionId,
        },
        type: 'reconnect_session',
      },
      path: '/api/session/command',
      serverUrl,
    });
    assertOk(sessionSnapshot, 'reconnect_session');
    const participant = sessionSnapshot.data.state.participants.find(
      (candidate) => candidate.id === 'player-001',
    );

    if (!participant?.characterId) {
      throw new Error('Expected DM assignment to set player characterId.');
    }

    if (participant.pendingCharacterId !== null) {
      throw new Error('Expected DM assignment to clear pendingCharacterId.');
    }

    const runtimeCharacter = await postCommand({
      body: {
        actor: {
          participantId: 'player-001',
        },
        commandId: `bridge-smoke-get-runtime-copy-${unique}`,
        payload: {
          characterId: participant.characterId,
          sessionId,
        },
        type: 'get_character',
      },
      path: '/api/characters/command',
      serverUrl,
    });
    assertOk(runtimeCharacter, 'get_character');

    if (
      runtimeCharacter.data.character.meta?.sourceCharacterLibraryEntryId !==
      entryId
    ) {
      throw new Error(
        'Expected assigned runtime copy metadata to preserve sourceCharacterLibraryEntryId.',
      );
    }

    const reusableEntry = await postCommand({
      body: {
        actor: { participantId: registered.user.id },
        commandId: `bridge-smoke-get-library-entry-${unique}`,
        payload: {
          entryId,
          ownerParticipantId: registered.user.id,
        },
        type: 'get_character_library_entry',
      },
      cookie: registered.cookie,
      path: '/api/character-library/command',
      serverUrl,
    });
    assertOk(reusableEntry, 'get_character_library_entry');

    if (reusableEntry.data.entry.status !== 'finalized') {
      throw new Error('Expected reusable library entry to remain finalized.');
    }

    if (reusableEntry.data.entry.hp.current !== 9) {
      throw new Error(
        'Expected reusable library entry HP to remain unchanged.',
      );
    }

    logSmokeStep('building Training Room around assigned runtime copy');
    const trainingRoom = await buildTrainingRoom({
      characterId: participant.characterId,
      sessionId,
      serverUrl,
      unique,
    });

    logSmokeStep('recovering Training Room evidence in DM and Player browsers');
    await recoverRuntimeSession(dmPage, {
      modeLabels: ['DM Mode', 'حالت DM'],
      runtimeUrl,
      sessionId,
    });
    await waitForAnyText(dmPage, ['Training Room'], 'DM active Training Room');
    await waitForAnyText(
      dmPage,
      [savedCharacterName],
      'DM assigned saved character',
    );
    await waitForAnyText(
      dmPage,
      ['Encounter status', 'وضعیت برخورد'],
      'DM encounter status evidence',
    );
    await waitForAnyText(
      dmPage,
      ['Current turn', 'نوبت فعلی'],
      'DM current-turn evidence',
    );

    await recoverRuntimeSession(playerPage, {
      modeLabels: ['Player Mode', 'حالت بازیکن'],
      runtimeUrl,
      sessionId,
    });
    await waitForAnyText(
      playerPage,
      ['Training Room'],
      'Player active Training Room',
    );
    await waitForAnyText(
      playerPage,
      [savedCharacterName],
      'Player assigned saved character',
    );
    await waitForAnyText(
      playerPage,
      ['Readiness summary', 'خلاصه آمادگی'],
      'Player readiness summary evidence',
    );
    await waitForAnyText(
      playerPage,
      ['Token placed', 'توکن قرار گرفت'],
      'Player placed-token evidence',
    );
    await waitForAnyText(
      playerPage,
      ['Turn ready', 'نوبت آماده است'],
      'Player first-turn readiness evidence',
    );
    await waitForAnyText(
      playerPage,
      ['Turn & Target', 'نوبت و هدف'],
      'Player turn and target evidence',
    );
    await waitForAnyText(
      playerPage,
      ['Use Action', 'مصرف اقدام'],
      'Player action feedback evidence',
    );

    logSmokeStep('validating Player local reset and recovery');
    await waitForStoredCockpitSessionId(dmPage, sessionId);
    await waitForStoredCockpitSessionId(playerPage, sessionId);
    await clickButton(playerPage, ['Local Reset', 'بازنشانی محلی']);
    await waitForNoStoredSession(playerPage);
    await waitForStoredCockpitSessionId(dmPage, sessionId);
    await waitForAnyText(
      dmPage,
      ['Training Room'],
      'DM Training Room after Player local reset',
    );

    await clickButton(playerPage, ['Player Mode', 'حالت بازیکن']);
    await setSessionInputValue(playerPage, sessionId);
    await clickButton(playerPage, ['Recover', 'بازیابی']);
    await waitForStoredCockpitSessionId(playerPage, sessionId);
    await waitForAnyText(
      playerPage,
      ['Training Room'],
      'Player Training Room recovery after local reset',
    );
    await waitForAnyText(
      playerPage,
      [savedCharacterName],
      'Player saved character recovery after local reset',
    );
    await waitForAnyText(
      playerPage,
      ['Encounter status', 'وضعیت برخورد'],
      'Player encounter recovery after local reset',
    );

    await validateTrainingRoomReadModels({
      encounterId: trainingRoom.encounter.id,
      sceneId: trainingRoom.scene.id,
      sessionId,
      serverUrl,
      unique,
    });

    console.log(
      `[runtime-bridge-db-smoke] passed with session ${sessionId}, runtime copy ${participant.characterId}, scene ${trainingRoom.scene.id}, and encounter ${trainingRoom.encounter.id}`,
    );
  } finally {
    await Promise.allSettled([playerPage.close(), dmPage.close()]);
    await cleanup();
  }

  process.exit(0);
}

async function enablePage(page) {
  await page.send('Runtime.enable');
  await page.send('Page.enable');
}

async function navigate(page, url) {
  await page.send('Page.navigate', { url });
  await waitFor(page, {
    label: `navigation to ${url}`,
    predicate: `(() => window.location.href === ${JSON.stringify(url)})()`,
  });
}

async function loginInBrowser(page, serverUrl, credentials) {
  const result = await page.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(`${serverUrl}/api/auth/login`)}, {
      body: JSON.stringify(${JSON.stringify(credentials)}),
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    const body = await response.json();

    return {
      body,
      status: response.status,
    };
  })()`);

  if (result.status !== 200 || !result.body?.ok) {
    throw new Error(
      `Browser login failed with HTTP ${result.status}: ${JSON.stringify(result.body)}`,
    );
  }
}

function createSavedCharacterInput(name) {
  return {
    abilities: {
      cha: 16,
      con: 13,
      dex: 12,
      int: 10,
      str: 14,
      wis: 11,
    },
    abilityScoreMethod: 'standard-array',
    armorClass: 13,
    background: 'Acolyte',
    builderSelections: {
      cantrips: [],
      equipment: ['Explorer Pack'],
      languages: ['Common'],
      originFeatAbility: '',
      originFeatCantrips: [],
      originFeatSpell: '',
      skills: ['Religion'],
      spells: [],
      tools: [],
    },
    builderStep: 'review',
    className: 'Cleric',
    concept: 'Temple envoy',
    hp: {
      current: 9,
      max: 9,
      temp: 0,
    },
    level: 1,
    meta: {},
    name,
    notes: 'Reusable library note seeded by the DB-mode bridge smoke.',
    portrait: null,
    pronouns: '',
    rulesProfileId: 'dnd5e-2024-core',
    speciesOrRace: 'Human',
    speed: 30,
  };
}

async function registerUser(serverUrl, body) {
  const response = await fetch(`${serverUrl}/api/auth/register`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json();
  const cookie = response.headers.get('set-cookie') ?? '';

  if (!response.ok || !payload?.ok || !cookie.includes('dnd_web_session=')) {
    throw new Error(
      `Unable to register DB-mode bridge smoke user: HTTP ${response.status}`,
    );
  }

  return {
    cookie,
    user: payload.data.user,
  };
}

/**
 * Participant credentials this harness holds, keyed by session and participant.
 *
 * The server no longer takes a claimed `participantId` on trust, so acting as
 * `dm-001` or `player-001` out of band requires the token that participant was
 * issued. Tokens arrive from two places: this harness's own session command
 * responses, and the browser tabs, via `captureBrowserCredential`.
 */
const participantTokens = new Map();

function participantTokenKey(sessionId, participantId) {
  return `${sessionId} ${participantId}`;
}

function rememberParticipantToken(sessionId, participantId, token) {
  if (sessionId && participantId && token) {
    participantTokens.set(participantTokenKey(sessionId, participantId), token);
  }
}

/**
 * Copies the credential a browser tab was issued into this harness, so the same
 * participant can also be driven over HTTP.
 */
async function captureBrowserCredential(page, label) {
  // Waits, because the credential only lands once the join command has round
  // tripped. Reading straight after the click is a race the click does not lose
  // often enough to be obvious.
  await waitFor(page, {
    label: `${label} participant credential`,
    predicate: `(() => {
      const stored = JSON.parse(
        localStorage.getItem('dnd-participant-credential') ?? '[]',
      );
      return Array.isArray(stored) && stored.length > 0;
    })()`,
  });

  const raw = await page.evaluate(
    `localStorage.getItem('dnd-participant-credential') ?? '[]'`,
  );
  const credentials = JSON.parse(raw);

  if (!Array.isArray(credentials) || credentials.length === 0) {
    throw new Error(`${label} holds no participant credential.`);
  }

  for (const credential of credentials) {
    rememberParticipantToken(
      credential.sessionId,
      credential.participantId,
      credential.token,
    );
  }

  return credentials;
}

/**
 * Hands a credential this harness holds to a browser tab.
 *
 * Needed because the harness creates the session over HTTP and a *different*
 * client - the DM browser tab - then continues it. The server will not let a tab
 * reconnect as `dm-001` just because it says so, which is the whole point of the
 * credential, so the harness has to pass on the one it was issued. A real DM
 * creates the session in their own browser and never needs this.
 */
async function injectBrowserCredential(page, sessionId, participantId) {
  const token = participantTokens.get(
    participantTokenKey(sessionId, participantId),
  );

  if (!token) {
    throw new Error(
      `No participant credential held for ${participantId} in ${sessionId}.`,
    );
  }

  await page.evaluate(
    `(() => {
      const stored = JSON.parse(
        localStorage.getItem('dnd-participant-credential') ?? '[]',
      );
      const credential = ${JSON.stringify(JSON.stringify({ participantId, sessionId, token }))};

      localStorage.setItem(
        'dnd-participant-credential',
        JSON.stringify([
          ...stored.filter(
            (candidate) =>
              candidate.sessionId !== JSON.parse(credential).sessionId ||
              candidate.participantId !== JSON.parse(credential).participantId,
          ),
          JSON.parse(credential),
        ]),
      );
      return true;
    })()`,
  );
}

async function postCommand({ body, cookie, path, serverUrl }) {
  const token = participantTokens.get(
    participantTokenKey(body?.payload?.sessionId, body?.actor?.participantId),
  );
  const response = await fetch(`${serverUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(token ? { 'x-dnd-participant-token': token } : {}),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json();

  // create/join/reconnect hand back a credential; keep it for later commands.
  if (payload?.ok && payload.data?.participantToken) {
    rememberParticipantToken(
      payload.data.sessionId,
      payload.data.participantId,
      payload.data.participantToken,
    );
  }

  return {
    ...payload,
    status: response.status,
  };
}

function assertOk(response, label) {
  if (!response.ok) {
    throw new Error(
      `${label} failed with HTTP ${response.status}: ${JSON.stringify(response.error ?? response)}`,
    );
  }
}

async function buildTrainingRoom({
  characterId,
  sessionId,
  serverUrl,
  unique,
}) {
  const createdScene = await postCommand({
    body: {
      actor: {
        participantId: 'dm-001',
      },
      commandId: `bridge-smoke-create-training-room-${unique}`,
      payload: {
        scene: {
          grid: {
            cellSizeFeet: 5,
            height: 8,
            width: 8,
          },
          name: 'Training Room',
        },
        sessionId,
      },
      type: 'create_scene',
    },
    path: '/api/scenes/command',
    serverUrl,
  });
  assertOk(createdScene, 'create_scene');

  const scene = createdScene.data.scene;

  if (!scene?.id) {
    throw new Error('Expected create_scene to return a Training Room scene.');
  }

  const activatedScene = await postCommand({
    body: {
      actor: {
        participantId: 'dm-001',
      },
      commandId: `bridge-smoke-activate-training-room-${unique}`,
      payload: {
        sceneId: scene.id,
        sessionId,
      },
      type: 'activate_scene_for_session',
    },
    path: '/api/scenes/command',
    serverUrl,
  });
  assertOk(activatedScene, 'activate_scene_for_session');

  const placedCharacter = await postCommand({
    body: {
      actor: {
        participantId: 'player-001',
      },
      commandId: `bridge-smoke-place-runtime-copy-${unique}`,
      payload: {
        participantId: 'player-001',
        position: {
          x: 0,
          y: 0,
        },
        sessionId,
      },
      type: 'place_character_in_active_scene',
    },
    path: '/api/movement/command',
    serverUrl,
  });
  assertOk(placedCharacter, 'place_character_in_active_scene');

  if (placedCharacter.data.character.id !== characterId) {
    throw new Error(
      'Expected Training Room placement to return the assigned runtime copy.',
    );
  }

  const activeSceneState = await postCommand({
    body: {
      actor: {
        participantId: 'dm-001',
      },
      commandId: `bridge-smoke-get-active-scene-${unique}`,
      payload: {
        sessionId,
      },
      type: 'get_active_scene_state',
    },
    path: '/api/movement/command',
    serverUrl,
  });
  assertOk(activeSceneState, 'get_active_scene_state');

  const placement = activeSceneState.data.placedCharacters.find(
    (candidate) => candidate.participantId === 'player-001',
  );

  if (
    activeSceneState.data.activeSceneId !== scene.id ||
    placement?.characterId !== characterId
  ) {
    throw new Error(
      'Expected active scene read model to include the assigned runtime copy in the Training Room.',
    );
  }

  const startedEncounter = await postCommand({
    body: {
      actor: {
        participantId: 'dm-001',
      },
      commandId: `bridge-smoke-start-encounter-${unique}`,
      payload: {
        sessionId,
      },
      type: 'start_encounter',
    },
    path: '/api/encounters/command',
    serverUrl,
  });
  assertOk(startedEncounter, 'start_encounter');

  const encounter = startedEncounter.data.encounter;
  const encounterParticipant = encounter.participants.find(
    (candidate) => candidate.participantId === 'player-001',
  );

  if (
    encounter.sceneId !== scene.id ||
    encounter.status !== 'active' ||
    encounterParticipant?.characterId !== characterId
  ) {
    throw new Error(
      'Expected started encounter to include the assigned runtime copy in the active Training Room.',
    );
  }

  return {
    activeSceneState: activeSceneState.data,
    encounter,
    scene,
  };
}

async function validateTrainingRoomReadModels({
  encounterId,
  sceneId,
  sessionId,
  serverUrl,
  unique,
}) {
  const activeSceneState = await postCommand({
    body: {
      actor: {
        participantId: 'dm-001',
      },
      commandId: `bridge-smoke-get-active-scene-after-reset-${unique}`,
      payload: {
        sessionId,
      },
      type: 'get_active_scene_state',
    },
    path: '/api/movement/command',
    serverUrl,
  });
  assertOk(activeSceneState, 'get_active_scene_state after local reset');

  if (activeSceneState.data.activeSceneId !== sceneId) {
    throw new Error(
      'Expected active scene read model to survive Player Local Reset.',
    );
  }

  const encounterState = await postCommand({
    body: {
      actor: {
        participantId: 'dm-001',
      },
      commandId: `bridge-smoke-get-encounter-after-reset-${unique}`,
      payload: {
        sessionId,
      },
      type: 'get_encounter_state',
    },
    path: '/api/encounters/command',
    serverUrl,
  });
  assertOk(encounterState, 'get_encounter_state after local reset');

  if (
    encounterState.data.encounter.id !== encounterId ||
    encounterState.data.encounter.sceneId !== sceneId ||
    encounterState.data.encounter.status !== 'active'
  ) {
    throw new Error(
      'Expected active encounter read model to survive Player Local Reset.',
    );
  }
}

function startProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  startedProcesses.push(child);
  processLogs.set(child.pid, {
    lines: [],
    name,
  });

  const capture = (chunk) => {
    const log = processLogs.get(child.pid);

    if (!log) {
      return;
    }

    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      log.lines.push(line);

      if (log.lines.length > 80) {
        log.lines.shift();
      }
    }
  };

  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  return child;
}

async function runDbReadinessCheck() {
  const output = [];
  const child = spawn(process.execPath, ['scripts/check-db-readiness.mjs'], {
    cwd: dbDir,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));

  const { code, signal } = await new Promise((resolveCheck, rejectCheck) => {
    child.on('error', rejectCheck);
    child.on('close', (exitCode, exitSignal) =>
      resolveCheck({
        code: exitCode,
        signal: exitSignal,
      }),
    );
  });
  const outputText = redactSecrets(output.join('').trim());

  if (outputText) {
    console.log(outputText);
  }

  if (code !== 0) {
    throw new Error(
      `DB readiness check failed${
        signal ? ` with signal ${signal}` : ` with exit code ${code}`
      }. Fix DATABASE_URL credentials and apply packages/db/migrations/ before running the browser bridge harness.`,
    );
  }
}

function launchBrowserProfile(name, browserPath, debugPort) {
  const userDataDir = mkdtempSync(resolve(tmpdir(), `dnd-${name}-`));
  profileDirs.push(userDataDir);

  return startProcess(name, browserPath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank',
  ]);
}

async function createCdpPage(debugPort, url) {
  const response = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`,
    {
      method: 'PUT',
    },
  );

  if (!response.ok) {
    throw new Error(
      `Unable to create Chrome tab: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const target = await response.json();

  if (!target.webSocketDebuggerUrl) {
    throw new Error('Chrome did not return a page WebSocket debugger URL.');
  }

  return CdpClient.connect(target.webSocketDebuggerUrl);
}

class CdpClient {
  static connect(webSocketUrl) {
    return new Promise((resolveClient, rejectClient) => {
      const socket = new WebSocket(webSocketUrl);
      const client = new CdpClient(socket);
      const timeout = setTimeout(() => {
        rejectClient(new Error('Timed out connecting to Chrome DevTools.'));
      }, 10000);

      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolveClient(client);
      });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        rejectClient(new Error('Chrome DevTools WebSocket failed to open.'));
      });
    });
  }

  constructor(socket) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;
    this.socket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
    this.socket.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error('Chrome DevTools WebSocket closed.'));
      }

      this.pending.clear();
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolveResponse, rejectResponse) => {
      this.pending.set(id, {
        reject: rejectResponse,
        resolve: resolveResponse,
      });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
        }),
      );
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      awaitPromise: true,
      expression,
      returnByValue: true,
      userGesture: true,
    });

    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          'Runtime.evaluate failed.',
      );
    }

    return response.result?.value;
  }

  close() {
    if (this.socket.readyState === 3) {
      return Promise.resolve();
    }

    return new Promise((resolveClose) => {
      const timeout = setTimeout(resolveClose, 1000);

      this.socket.addEventListener(
        'close',
        () => {
          clearTimeout(timeout);
          resolveClose();
        },
        {
          once: true,
        },
      );
      this.socket.close();
    });
  }

  handleMessage(rawData) {
    const text =
      typeof rawData === 'string'
        ? rawData
        : Buffer.from(rawData).toString('utf8');
    const message = JSON.parse(text);

    if (!message.id) {
      return;
    }

    const pending = this.pending.get(message.id);

    if (!pending) {
      return;
    }

    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(
        new Error(
          `${message.error.message}${
            message.error.data ? `: ${message.error.data}` : ''
          }`,
        ),
      );
      return;
    }

    pending.resolve(message.result);
  }
}

async function clickButton(page, labels) {
  await waitFor(page, {
    label: `button "${labels.join('" or "')}"`,
    predicate: hasEnabledVisibleButtonExpression(labels),
  });

  const point = await page.evaluate(`(() => {
    const labels = ${JSON.stringify(labels)};
    const button = [...document.querySelectorAll('button')].find(
      (candidate) =>
        labels.some((label) => candidate.textContent?.includes(label)) &&
        !candidate.disabled &&
        candidate.getClientRects().length > 0,
    );

    if (!button) {
      throw new Error('No enabled visible button found for ' + labels.join(' or '));
    }

    button.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = button.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);

  await page.send('Input.dispatchMouseEvent', {
    button: 'none',
    type: 'mouseMoved',
    x: point.x,
    y: point.y,
  });
  await page.send('Input.dispatchMouseEvent', {
    button: 'left',
    clickCount: 1,
    type: 'mousePressed',
    x: point.x,
    y: point.y,
  });
  await page.send('Input.dispatchMouseEvent', {
    button: 'left',
    clickCount: 1,
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
  });
}

async function clickButtonIfEnabled(page, labels) {
  const canClick = await page.evaluate(
    hasEnabledVisibleButtonExpression(labels),
  );

  if (canClick) {
    await clickButton(page, labels);
  }
}

function hasEnabledVisibleButtonExpression(labels) {
  return `(() => {
    const labels = ${JSON.stringify(labels)};
    return [...document.querySelectorAll('button')].some(
      (candidate) =>
        labels.some((label) => candidate.textContent?.includes(label)) &&
        !candidate.disabled &&
        candidate.getClientRects().length > 0,
    );
  })()`;
}

async function waitForNoVisibleButton(page, labels) {
  await waitFor(page, {
    label: `no visible button "${labels.join('" or "')}"`,
    predicate: `(() => {
      const labels = ${JSON.stringify(labels)};
      return ![...document.querySelectorAll('button')].some(
        (candidate) =>
          labels.some((label) => candidate.textContent?.includes(label)) &&
          candidate.getClientRects().length > 0,
      );
    })()`,
  });
}

async function waitForRuntimeShell(page, label) {
  await waitForAnyText(page, ['Runtime War Table', 'میز نبرد زنده'], label);
}

async function waitForAnyText(page, texts, label) {
  await waitFor(page, {
    label,
    predicate: `(() => {
      const bodyText = document.body?.innerText ?? '';
      return ${JSON.stringify(texts)}.some((text) => bodyText.includes(text));
    })()`,
  });
}

async function waitForCockpitHydrated(page) {
  await waitFor(page, {
    label: 'hydrated cockpit local state',
    predicate: `(() => Boolean(localStorage.getItem(${JSON.stringify(
      storageKey,
    )})))()`,
  });
}

async function waitForNoStoredSession(page) {
  await waitFor(page, {
    label: 'local cockpit session cleared',
    predicate: `(() => {
      const raw = localStorage.getItem(${JSON.stringify(storageKey)});

      if (!raw) {
        return true;
      }

      return !JSON.parse(raw).sessionId;
    })()`,
  });
}

async function setSessionInputValue(page, sessionId) {
  const assigned = await page.evaluate(
    getSessionInputAssignmentExpression(sessionId),
  );

  if (!assigned) {
    throw new Error('Unable to assign the session ID input.');
  }
}

async function recoverRuntimeSession(
  page,
  { modeLabels, runtimeUrl, sessionId },
) {
  await navigate(page, runtimeUrl);
  await waitForRuntimeShell(page, 'runtime shell before recovery');
  await waitForCockpitHydrated(page);
  await clickButton(page, modeLabels);
  await setSessionInputValue(page, sessionId);
  await clickButton(page, ['Recover', 'بازیابی']);
  await waitForStoredCockpitSessionId(page, sessionId);
}

async function waitForStoredCockpitSessionId(page, sessionId) {
  await waitFor(page, {
    label: `stored cockpit session ${sessionId}`,
    predicate: `(() => {
      const raw = localStorage.getItem(${JSON.stringify(storageKey)});

      if (!raw) {
        return false;
      }

      return JSON.parse(raw).sessionId === ${JSON.stringify(sessionId)};
    })()`,
  });
}

async function waitFor(page, { label, predicate, timeoutMs = smokeTimeoutMs }) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await page.evaluate(predicate);

      if (result) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  const diagnostics = await page
    .evaluate(getPageDiagnosticsExpression(storageKey))
    .then((rawDiagnostics) => normalizePageDiagnostics(rawDiagnostics))
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
      lastErrorMessage:
        lastError instanceof Error ? lastError.message : undefined,
    }),
  );
}

async function waitForHttp(url, { label, timeoutMs }) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for ${label}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() =>
          rejectPort(new Error('Unable to allocate a TCP port.')),
        );
        return;
      }

      const { port } = address;
      server.close(() => resolvePort(port));
    });
  });
}

function findBrowserExecutable() {
  if (
    process.env.RUNTIME_SMOKE_BROWSER &&
    existsSync(process.env.RUNTIME_SMOKE_BROWSER)
  ) {
    return process.env.RUNTIME_SMOKE_BROWSER;
  }

  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
          ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function logSmokeStep(label) {
  smokeStepIndex += 1;
  console.log(
    formatSmokeStep({
      index: smokeStepIndex,
      label,
      total: smokeStepLabels.length,
    }),
  );
}

function printProcessLogs() {
  for (const { lines, name } of processLogs.values()) {
    if (!lines.length) {
      continue;
    }

    console.error(`\n[${name}] recent output`);
    console.error(redactSecrets(lines.join('\n')));
  }
}

function loadRepoEnvironment() {
  const candidates = [
    resolve(repoRoot, '.env'),
    resolve(webDir, '.env'),
    resolve(serverDir, '.env'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    for (const line of readFileSync(candidate, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

      if (!match) {
        continue;
      }

      const [, key, rawValue] = match;

      if (!key || process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = parseEnvValue(rawValue ?? '');
    }

    return;
  }
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  const withoutComment =
    trimmed.startsWith('"') || trimmed.startsWith("'")
      ? trimmed
      : trimmed.replace(/\s+#.*$/, '');

  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1);
  }

  return withoutComment;
}

function redactSecrets(value) {
  const sensitiveValues = [
    process.env.DATABASE_URL,
    process.env.RUNTIME_SMOKE_BROWSER,
  ].filter(Boolean);

  return sensitiveValues.reduce(
    (current, secret) => current.split(secret).join('[redacted]'),
    String(value),
  );
}

async function cleanup() {
  const children = [...startedProcesses].reverse();

  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }

  await Promise.allSettled(
    children.map((child) => waitForProcessExit(child, 2000)),
  );

  for (const dir of profileDirs) {
    await removeProfileDir(dir);
  }
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolveExit) => {
    const done = () => {
      clearTimeout(timeout);
      child.off('close', done);
      child.off('exit', done);
      resolveExit();
    };
    const timeout = setTimeout(done, timeoutMs);

    child.once('close', done);
    child.once('exit', done);
  });
}

async function removeProfileDir(dir) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      rmSync(dir, {
        force: true,
        maxRetries: 3,
        recursive: true,
        retryDelay: 250,
      });
      return;
    } catch (error) {
      if (attempt === 6) {
        console.warn(
          `[runtime-bridge-db-smoke] unable to remove browser profile directory after cleanup: ${redactSecrets(
            error instanceof Error ? error.message : error,
          )}`,
        );
        return;
      }

      await delay(500);
    }
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
