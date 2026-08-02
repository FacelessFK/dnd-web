#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  assertWebUiTargetsServer,
  formatSmokeStep,
  formatSmokeWaitFailure,
  getChromeDisplayArgs,
  getCockpitModeSelectionExpression,
  getPageDiagnosticsExpression,
  getOpenGameMasterToolExpression,
  getSessionInputAssignmentExpression,
  getStoredCockpitSessionIdExpression,
  normalizePageDiagnostics,
} from './runtime-smoke-diagnostics.mjs';

import {
  getOwnedRecord,
  ownDirectoryAfter,
  spawnOwnedProcess,
  stopOwnedChild,
} from './harness-process-tree.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(scriptDir, '..');
const repoRoot = resolve(webDir, '../..');
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
  'starting authoritative server',
  'starting Next runtime UI',
  'launching separate DM and Player browser profiles',
  'building Training Room in DM profile',
  'starting encounter in DM profile',
  'joining and recovering table in Player profile',
  'validating Player profile guardrails',
  'validating Player local reset does not affect DM profile',
];
let smokeStepIndex = 0;

main().catch(async (error) => {
  console.error('\n[runtime-two-profile-smoke] failed');
  console.error(error instanceof Error ? error.stack : error);
  printProcessLogs();
  await cleanup();
  process.exit(1);
});

async function main() {
  const browserPath = findBrowserExecutable();

  if (!browserPath) {
    throw new Error(
      'No Chrome/Chromium executable found. Set RUNTIME_SMOKE_BROWSER=/path/to/chrome to run the two-profile browser smoke test.',
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

  logSmokeStep('starting authoritative server');
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
  // A second `next dev` on this tree would have recompiled the client chunks
  // against its own server URL; fail now instead of on a mystery timeout.
  await assertWebUiTargetsServer(runtimeUrl, serverUrl);

  logSmokeStep('launching separate DM and Player browser profiles');
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

  const dmPage = await createCdpPage(dmDebugPort, runtimeUrl);
  const playerPage = await createCdpPage(playerDebugPort, runtimeUrl);

  try {
    await Promise.all([enablePage(dmPage), enablePage(playerPage)]);

    await waitForRuntimeShell(dmPage, 'DM runtime shell');
    await waitForCockpitHydrated(dmPage);
    await clickButtonIfEnabled(dmPage, ['Local Reset', 'بازنشانی محلی']);
    await waitForNoStoredSession(dmPage);
    await selectCockpitMode(dmPage, ['DM Mode', 'حالت DM'], 'dm');

    logSmokeStep('building Training Room in DM profile');
    await waitForAnyText(
      dmPage,
      ['Training Room Skirmish'],
      'named demo scenario',
    );
    await clickButton(dmPage, [
      'Run Training Room Skirmish',
      'اجرای Training Room Skirmish',
    ]);
    await waitForCockpitState(dmPage, (state) =>
      Boolean(state?.sessionId && state?.sceneId),
    );
    const sessionId = await getStoredCockpitSessionId(dmPage);
    await waitForAnyText(dmPage, ['Training Room'], 'DM active scene');
    await waitForAnyText(dmPage, ['Aria'], 'DM sample character Aria');
    await waitForAnyText(dmPage, ['Borin'], 'DM sample character Borin');
    await waitForAnyText(
      dmPage,
      ['Tactical Grid', 'گرید تاکتیکی'],
      'DM tactical grid',
    );

    logSmokeStep('starting encounter in DM profile');
    // The M2 HUD keeps the GM's tools behind a collapsible region showing one
    // group at a time; the scenario controls live on the Table group.
    await openGmTool(dmPage, 'table');
    await clickButton(dmPage, ['Start Encounter', 'شروع برخورد']);
    await waitForEncounterSummary(dmPage, 'DM encounter summary');
    await waitForAnyText(
      dmPage,
      ['Combat & Event Feed', 'برخورد و رخدادها'],
      'DM event feed',
    );
    await openGmTool(dmPage, 'combatants');
    await waitForAnyText(
      dmPage,
      ['Monsters & NPCs', 'هیولاها و NPCها'],
      'DM combatant controls',
    );

    // The M2 hierarchy is structural rather than a reading order down one long
    // page: the map comes first, the tools are a region below it, and the
    // encounter controls sit in the inspector beside the map so advancing a
    // turn never costs a panel opening mid-fight.
    await waitForRegionOrder(
      dmPage,
      ['map', 'gm-encounter', 'gm-tools'],
      'DM map-first hierarchy',
    );

    logSmokeStep('joining and recovering table in Player profile');
    await waitForRuntimeShell(playerPage, 'Player runtime shell');
    await waitForCockpitHydrated(playerPage);
    await clickButtonIfEnabled(playerPage, ['Local Reset', 'بازنشانی محلی']);
    await waitForNoStoredSession(playerPage);
    await selectCockpitMode(
      playerPage,
      ['Player Mode', 'حالت بازیکن'],
      'player',
    );
    await setSessionInputValue(playerPage, sessionId);
    await clickButton(playerPage, ['Join Session', 'پیوستن به نشست']);
    await waitForCockpitState(playerPage, (state) => Boolean(state?.sessionId));
    await clickButton(playerPage, ['Recover', 'بازیابی']);
    await waitForAnyText(playerPage, ['Aria'], 'Player assigned character');
    await waitForAnyText(
      playerPage,
      ['Tactical Grid', 'گرید تاکتیکی'],
      'Player tactical grid',
    );
    // Status first so a player knows who they are and whether the table can
    // hear them, then the board, then what they can do with it.
    await waitForRegionOrder(
      playerPage,
      ['player-status', 'map', 'player-actions'],
      'Player map-first hierarchy',
    );

    logSmokeStep('validating Player profile guardrails');
    await expectVisibleButton(
      playerPage,
      ['Run Training Room Skirmish', 'اجرای Training Room Skirmish'],
      false,
    );
    await expectVisibleText(playerPage, ['Scene Builder', 'صحنه‌ساز'], false);
    await expectVisibleText(
      playerPage,
      ['Monsters & NPCs', 'هیولاها و NPCها'],
      false,
    );
    await expectVisibleText(
      dmPage,
      ['Monsters & NPCs', 'هیولاها و NPCها'],
      true,
    );

    logSmokeStep('validating Player local reset does not affect DM profile');
    await clickButton(playerPage, ['Local Reset', 'بازنشانی محلی']);
    await waitForNoStoredSession(playerPage);
    await expectVisibleText(dmPage, ['Training Room'], true);
    await expectVisibleText(dmPage, ['Aria'], true);
    await waitForStoredCockpitSessionId(dmPage, sessionId);
    // Local Reset returns this browser to the default seat, which is the DM
    // chair - so a player taking their seat back picks Player Mode again before
    // recovering. Recovering as the DM from a browser that never held that seat
    // is correctly refused, and asserting on it would be asserting the harness
    // took a wrong turn.
    await selectCockpitMode(
      playerPage,
      ['Player Mode', 'حالت بازیکن'],
      'player',
    );
    await setSessionInputValue(playerPage, sessionId);
    await clickButton(playerPage, ['Recover', 'بازیابی']);
    await waitForAnyText(playerPage, ['Aria'], 'Player recovery after reset');
    await waitForStoredCockpitSessionId(playerPage, sessionId);

    console.log(`[runtime-two-profile-smoke] passed with session ${sessionId}`);
  } finally {
    await Promise.allSettled([dmPage.close(), playerPage.close()]);
    await cleanup();
  }

  process.exit(0);
}

async function enablePage(page) {
  await page.send('Runtime.enable');
  await page.send('Page.enable');
}

function startProcess(name, command, args, options = {}) {
  // Owned as a process group. A server reached through a `corepack -> pnpm`
  // wrapper outlives a `kill` aimed at the handle; see `harness-process-tree`.
  const { child } = spawnOwnedProcess(name, command, args, {
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
    name,
    lines: [],
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
  child.on('exit', (code, signal) => {
    if (code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL') {
      return;
    }

    const log = processLogs.get(child.pid);
    log?.lines.push(`[process exited code=${code} signal=${signal}]`);
  });

  return child;
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

function launchBrowserProfile(name, browserPath, debugPort) {
  const userDataDir = mkdtempSync(resolve(tmpdir(), `dnd-${name}-`));
  profileDirs.push(userDataDir);

  const chrome = startProcess(name, browserPath, [
    // Headed runs put the DM on the left and the player on the right so both
    // seats stay visible side by side.
    ...getChromeDisplayArgs({
      windowPosition: { x: name.startsWith('dm') ? 0 : 960, y: 0 },
      windowSize: { height: 1040, width: 950 },
    }),
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

  // Removed only after this Chrome exits; a profile deleted beside a live
  // browser comes back half-written.
  ownDirectoryAfter(getOwnedRecord(chrome), userDataDir);

  return chrome;
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

async function waitForRuntimeShell(page, label) {
  await waitForAnyText(page, ['Runtime War Table', 'میز نبرد زنده'], label);
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

async function waitForAnyText(page, texts, label) {
  await waitFor(page, {
    label,
    predicate: hasVisibleTextExpression(texts),
  });
}

async function expectVisibleText(page, texts, expected) {
  const actual = await page.evaluate(hasVisibleTextExpression(texts));

  if (actual !== expected) {
    throw new Error(
      `Expected visible text ${JSON.stringify(texts)} to be ${expected}, got ${actual}.`,
    );
  }
}

async function expectVisibleButton(page, labels, expected) {
  const actual = await page.evaluate(`(() => {
      const labels = ${JSON.stringify(labels)};
      return [...document.querySelectorAll('button')].some(
        (candidate) =>
          labels.some((label) => candidate.textContent?.includes(label)) &&
          candidate.getClientRects().length > 0,
      );
    })()`);

  if (actual !== expected) {
    throw new Error(
      `Expected visible button ${JSON.stringify(labels)} to be ${expected}, got ${actual}.`,
    );
  }
}

function hasVisibleTextExpression(texts) {
  return `(() => {
    const bodyText = document.body?.innerText ?? '';
    return ${JSON.stringify(texts)}.some((text) => bodyText.includes(text));
  })()`;
}

async function waitForEncounterSummary(page, label) {
  await waitFor(page, {
    label,
    predicate: `(() => {
      const text = document.body?.innerText ?? '';
      const normalizedText = text.toLocaleLowerCase('en-US');
      const hasEncounterStatus =
        normalizedText.includes('encounter status') ||
        text.includes('وضعیت برخورد');
      const hasRoundProgress =
        normalizedText.includes('round') ||
        text.includes('راند');
      return hasEncounterStatus &&
        hasRoundProgress &&
        !normalizedText.includes('no active encounter loaded');
    })()`,
  });
}

async function waitForCockpitState(page, predicate) {
  await waitFor(page, {
    label: 'persisted cockpit state',
    predicate: `(() => {
      const raw = localStorage.getItem(${JSON.stringify(storageKey)});

      if (!raw) {
        return false;
      }

      return (${predicate.toString()})(JSON.parse(raw));
    })()`,
  });
}

async function waitForStoredCockpitSessionId(page, sessionId) {
  await waitFor(page, {
    label: `stored cockpit session ${sessionId}`,
    predicate: `(() => {
      const raw = localStorage.getItem(${JSON.stringify(storageKey)});

      if (!raw) {
        return false;
      }

      const state = JSON.parse(raw);
      return state?.sessionId === ${JSON.stringify(sessionId)};
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

async function getStoredCockpitSessionId(page) {
  const storedSessionId = await page.evaluate(
    getStoredCockpitSessionIdExpression(storageKey),
  );

  if (!storedSessionId) {
    throw new Error('Expected a stored cockpit session ID.');
  }

  return storedSessionId;
}

// A single write here reports success as soon as the DOM value changes, which
// says nothing about the value surviving a cockpit remount (see
// `getCockpitModeSelectionExpression`). Re-apply until it sticks.
async function setSessionInputValue(page, sessionId) {
  await waitFor(page, {
    label: `session ID input to hold ${sessionId}`,
    predicate: getSessionInputAssignmentExpression(sessionId),
  });
}

async function selectCockpitMode(page, modeLabels, expectedMode) {
  await waitFor(page, {
    label: `cockpit mode "${expectedMode}"`,
    predicate: getCockpitModeSelectionExpression(
      storageKey,
      modeLabels,
      expectedMode,
    ),
  });
}

/**
 * Assert the shell's regions appear in this order in the document.
 *
 * Structural rather than textual: the regions carry `data-hud-region`, so the
 * assertion survives a copy change and says what it means - which part of the
 * surface comes first - instead of which sentence does.
 */
async function waitForRegionOrder(page, regions, label) {
  await waitFor(page, {
    label,
    predicate: `(() => {
      const wanted = ${JSON.stringify(regions)};
      const found = wanted.map((region) =>
        document.querySelector('[data-hud-region="' + region + '"]'),
      );

      if (found.some((node) => !node)) {
        return false;
      }

      for (let index = 1; index < found.length; index += 1) {
        const position = found[index - 1].compareDocumentPosition(found[index]);

        if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) {
          return false;
        }
      }

      return true;
    })()`,
  });
}

/** Bring one GM tool group on screen before driving or asserting on it. */
async function openGmTool(page, tab) {
  await waitFor(page, {
    label: `GM ${tab} tools open`,
    predicate: getOpenGameMasterToolExpression(tab),
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
      lastErrorMessage: lastError?.message,
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

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for ${label} at ${url}.${
      lastError instanceof Error ? ` Last error: ${lastError.message}` : ''
    }`,
  );
}

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();

    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Unable to allocate a local TCP port.'));
        return;
      }

      const { port } = address;
      server.close(() => resolvePort(port));
    });
  });
}

function findBrowserExecutable() {
  if (process.env.RUNTIME_SMOKE_BROWSER) {
    return process.env.RUNTIME_SMOKE_BROWSER;
  }

  for (const candidate of getBrowserCandidates()) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (existsSync(candidate)) {
        return candidate;
      }

      continue;
    }

    const result = spawnSync(
      process.platform === 'win32' ? 'where.exe' : 'which',
      [candidate],
      {
        encoding: 'utf8',
      },
    );

    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.split(/\r?\n/)[0]?.trim() ?? null;
    }
  }

  return null;
}

function getBrowserCandidates() {
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'chrome.exe',
      'msedge.exe',
    ];
  }

  return [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
    'msedge',
  ];
}

async function cleanup() {
  await Promise.allSettled(
    [...startedProcesses].reverse().map((child) => stopProcess(child)),
  );

  for (const profileDir of profileDirs) {
    await removeDirectoryWithRetry(profileDir);
  }
}

async function stopProcess(child) {
  await stopOwnedChild(child);
}

async function removeDirectoryWithRetry(directory) {
  let lastError;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      rmSync(directory, {
        force: true,
        recursive: true,
      });
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  throw lastError;
}

function printProcessLogs() {
  for (const log of processLogs.values()) {
    if (!log.lines.length) {
      continue;
    }

    console.error(`\n[${log.name}] recent output`);
    for (const line of log.lines) {
      console.error(line);
    }
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
