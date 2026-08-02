#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import {
  assertWebUiTargetsServer,
  formatSmokeStep,
  formatSmokeWaitFailure,
  getAbsentVisibleTextsOutsideSelectorExpression,
  getChromeDisplayArgs,
  getPageDiagnosticsExpression,
  getOpenGameMasterToolExpression,
  getPresentVisibleTextsExpression,
  getSessionInputAssignmentExpression,
  getStoredCockpitSessionIdExpression,
  normalizePageDiagnostics,
} from './runtime-smoke-diagnostics.mjs';

import {
  getOwnedRecord,
  ownDirectoryAfter,
  spawnOwnedProcess,
  teardownOwnedProcesses,
} from './harness-process-tree.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const corepackCommand =
  process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const storageKey = 'dnd-runtime-cockpit';
const smokeTimeoutMs = Number.parseInt(
  process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? '120000',
  10,
);

const processLogs = new Map();
const smokeStepLabels = [
  'starting authoritative server',
  'starting Next runtime UI',
  'launching headless browser',
  'running named DM demo scenario',
  'starting encounter from UI',
  'validating recovery after reload',
  'validating player mode guardrails',
  'validating local reset stays local',
];
const startedProcesses = [];
let chromeUserDataDir;
let smokeStepIndex = 0;

main().catch(async (error) => {
  console.error('\n[runtime-smoke] failed');
  console.error(error instanceof Error ? error.stack : error);
  printProcessLogs();
  await cleanup();
  process.exit(1);
});

async function main() {
  const browserPath = findBrowserExecutable();

  if (!browserPath) {
    throw new Error(
      'No Chrome/Chromium executable found. Set RUNTIME_SMOKE_BROWSER=/path/to/chrome to run the browser smoke test.',
    );
  }

  if (typeof WebSocket !== 'function') {
    throw new Error(
      'This smoke test requires a Node runtime with global WebSocket support.',
    );
  }

  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const debugPort = await getFreePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const runtimeUrl = `http://127.0.0.1:${webPort}/runtime`;

  logSmokeStep('starting authoritative server');
  const serverProcess = startProcess(
    'server',
    corepackCommand,
    ['pnpm', '--filter', '@dnd/server', 'dev'],
    {
      NEXT_PUBLIC_APP_URL: webOrigin,
      SERVER_PERSISTENCE_MODE: 'in-memory',
      SERVER_PORT: String(serverPort),
    },
  );

  await waitForHttp(`${serverUrl}/`, {
    label: 'server root',
    timeoutMs: smokeTimeoutMs,
  });

  logSmokeStep('starting Next runtime UI');
  const webProcess = startProcess(
    'web',
    corepackCommand,
    [
      'pnpm',
      '--filter',
      '@dnd/web',
      'exec',
      'next',
      'dev',
      '-p',
      String(webPort),
      '-H',
      '127.0.0.1',
    ],
    {
      NEXT_PUBLIC_SERVER_URL: serverUrl,
    },
  );

  await waitForHttp(runtimeUrl, {
    label: '/runtime',
    timeoutMs: smokeTimeoutMs,
  });
  // A second `next dev` on this tree would have recompiled the client chunks
  // against its own server URL; fail now instead of on a mystery timeout.
  await assertWebUiTargetsServer(runtimeUrl, serverUrl);

  logSmokeStep('launching headless browser');
  const browserProcess = launchBrowser(browserPath, debugPort);
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, {
    label: 'Chrome DevTools',
    timeoutMs: smokeTimeoutMs,
  });

  const page = await createCdpPage(debugPort, runtimeUrl);

  try {
    await page.send('Runtime.enable');
    await page.send('Page.enable');

    await waitForAnyText(
      page,
      ['Runtime War Table', 'میز نبرد زنده'],
      'runtime shell',
    );
    await page.evaluate(`(() => {
      localStorage.setItem('dnd-web.locale', 'en');
      window.location.reload();
      return true;
    })()`);
    await waitForText(page, 'Runtime War Table', 'English runtime shell');
    await waitForCockpitHydrated(page);
    await clickButtonIfEnabled(page, 'Local Reset');
    await waitForNoStoredSession(page);
    await clickButton(page, 'DM Mode');

    logSmokeStep('running named DM demo scenario');
    await waitForText(page, 'Training Room Skirmish', 'named demo scenario');
    await clickButton(page, 'Run Training Room Skirmish');
    await waitForCockpitState(page, (state) =>
      Boolean(state?.sessionId && state?.sceneId),
    );
    await waitForText(page, 'Training Room', 'active scene after demo setup');
    await waitForText(page, 'Tactical Grid', 'tactical grid');
    await waitForAnyText(
      page,
      ['No active turn', 'نوبت فعالی نیست'],
      'localized no-active-turn status',
    );

    // The M2 HUD shows one GM tool group at a time, so each assertion below
    // names the group it belongs to rather than assuming one long page.
    await openGmTool(page, 'roster');
    await waitForText(page, 'Aria', 'sample character Aria');
    await waitForText(page, 'Borin', 'sample character Borin');
    await waitForAnyText(
      page,
      ['Conditions:', 'وضعیت‌ها:'],
      'localized character summary labels',
    );

    await openGmTool(page, 'scene');
    await waitForAnyText(
      page,
      ['Target scene ID is required.', 'شناسه صحنه مقصد الزامی است.'],
      'localized transition validation',
    );

    await openGmTool(page, 'combatants');
    await waitForAnyText(
      page,
      [
        'Create or select a monster/NPC combatant first.',
        'ابتدا یک موجود مبارز monster/NPC بسازید یا انتخاب کنید.',
      ],
      'localized combatant selection blocker',
    );

    logSmokeStep('starting encounter from UI');
    await openGmTool(page, 'table');
    await clickButton(page, 'Start Encounter');
    await waitFor(page, {
      label: 'encounter summary',
      predicate: `(() => {
        const text = document.body?.innerText ?? '';
        const normalizedText = text.toLocaleLowerCase('en-US');
        const hasEncounterStatus =
          normalizedText.includes('encounter status') ||
          normalizedText.includes('وضعیت encounter');
        const hasRoundProgress =
          normalizedText.includes('round') ||
          text.includes('راند');
        return hasEncounterStatus &&
          hasRoundProgress &&
          !normalizedText.includes('no active encounter loaded');
      })()`,
    });
    await waitForAnyText(
      page,
      ['Combat & Event Feed', 'برخورد و رخدادها'],
      'event feed panel',
    );
    await openGmTool(page, 'combatants');
    await waitForAnyText(
      page,
      ['Monsters & NPCs', 'هیولاها و NPCها'],
      'DM combatant controls panel',
    );
    await waitForAnyText(
      page,
      ['Create combatant', 'ساخت موجود مبارز'],
      'localized DM combatant helper copy',
    );

    logSmokeStep('validating recovery after reload');
    await page.send('Page.reload', { ignoreCache: true });
    await waitForAnyText(
      page,
      ['Runtime War Table', 'میز نبرد زنده'],
      'runtime shell after reload',
    );
    await waitForCockpitHydrated(page);
    await clickButton(page, 'Recover');
    await waitForText(page, 'Training Room', 'recovered scene');
    await openGmTool(page, 'roster');
    await waitForText(page, 'Aria', 'recovered character Aria');
    await waitForText(page, 'Borin', 'recovered character Borin');
    await waitFor(page, {
      label: 'recovery status summary',
      predicate: `(() => {
        const text = document.body?.innerText ?? '';
        const normalizedText = text.toLocaleLowerCase('en-US');
        const hasRecoveryStatus =
          normalizedText.includes('recovery status') ||
          text.includes('وضعیت بازیابی');
        const hasFullRecovery =
          normalizedText.includes('5/5 loaded') ||
          text.includes('5/5 بارگذاری شده');
        return hasRecoveryStatus && hasFullRecovery;
      })()`,
    });
    await waitFor(page, {
      label: 'recovered encounter summary',
      predicate: `(() => {
        const text = document.body?.innerText ?? '';
        const normalizedText = text.toLocaleLowerCase('en-US');
        const hasEncounterStatus =
          normalizedText.includes('encounter status') ||
          normalizedText.includes('وضعیت encounter');
        const hasRoundProgress =
          normalizedText.includes('round') ||
          text.includes('راند');
        return hasEncounterStatus && hasRoundProgress;
      })()`,
    });

    logSmokeStep('validating player mode guardrails');
    await clickButton(page, 'Player Mode');
    // The Player surface is a distinct shell in M2, not the GM page with
    // sections hidden - so this asserts which shell mounted rather than that a
    // particular panel eyebrow is on screen.
    await waitFor(page, {
      label: 'player game shell mounted',
      predicate: `Boolean(document.querySelector('[data-runtime-shell="player"]'))`,
    });
    await clickButton(page, 'Recover');
    await waitForText(page, 'Aria', 'player assigned character');
    await waitForText(page, 'Tactical Grid', 'player tactical grid');
    await waitFor(page, {
      label: 'player status and action regions',
      predicate: `(() => {
        const status = document.querySelector('[data-hud-region="player-status"]');
        const actions = document.querySelector('[data-hud-region="player-actions"]');
        return Boolean(status && actions && status.innerText.trim().length > 0);
      })()`,
    });
    await expectVisibleButton(page, 'Run Training Room Skirmish', false);
    await expectVisibleText(page, ['Scene Builder', 'صحنه‌ساز'], false);
    await expectVisibleText(
      page,
      ['Monsters & NPCs', 'هیولاها و NPCها'],
      false,
    );
    // The Player shell must never mount the GM's tool region or the debug
    // ledger. Both are structural, so both are checked structurally.
    await waitFor(page, {
      label: 'player shell carries no GM tools or diagnostics',
      predicate: `(() => {
        const forbidden = [
          '[data-hud-region="gm-tools"]',
          '[data-hud-region="gm-inspector"]',
          '[data-testid="runtime-diagnostics-toggle"]',
          '[data-testid="runtime-diagnostics-body"]',
        ];
        return forbidden.every((selector) => !document.querySelector(selector));
      })()`,
    });
    const sessionIdBeforeLocalReset = await getStoredCockpitSessionId(page);

    logSmokeStep('validating local reset stays local');
    await clickButton(page, 'Local Reset');
    await waitForNoStoredSession(page);
    await waitFor(page, {
      label: 'session input reset',
      predicate: `(() => {
        const input = [...document.querySelectorAll('input')].find(
          (candidate) => candidate.getAttribute('placeholder')?.includes('Paste an existing session ID'),
        );
        return Boolean(input && input.value === '');
      })()`,
    });
    await waitFor(page, {
      label: 'stale recovered table content hidden after local reset',
      predicate: getAbsentVisibleTextsOutsideSelectorExpression(
        ['Aria', 'Borin'],
        '[data-runtime-demo-scenario]',
      ),
    });
    await setSessionInputValue(page, sessionIdBeforeLocalReset);
    await clickButton(page, 'Recover');
    await waitFor(page, {
      label: 'full table recovery after local reset',
      predicate: `(() => {
        const text = document.body?.innerText ?? '';
        const normalizedText = text.toLocaleLowerCase('en-US');
        const hasStableScene = (${getPresentVisibleTextsExpression(['Training Room'])});
        const hasRecoveryStatus =
          normalizedText.includes('recovery status') ||
          text.includes('وضعیت بازیابی');
        const hasFullRecovery =
          normalizedText.includes('5/5 loaded') ||
          text.includes('5/5 بارگذاری شده');
        const hasEncounterStatus =
          normalizedText.includes('encounter status') ||
          normalizedText.includes('وضعیت encounter');
        const hasRoundProgress =
          normalizedText.includes('round') ||
          text.includes('راند');
        return hasStableScene &&
          hasRecoveryStatus &&
          hasFullRecovery &&
          hasEncounterStatus &&
          hasRoundProgress;
      })()`,
    });
    await waitFor(page, {
      label: 'recovered cockpit state after local reset',
      predicate: `(() => {
        const raw = localStorage.getItem(${JSON.stringify(storageKey)});

        if (!raw) {
          return false;
        }

        const state = JSON.parse(raw);
        return state.sessionId === ${JSON.stringify(sessionIdBeforeLocalReset)} &&
          Boolean(state.sceneId);
      })()`,
    });

    console.log('[runtime-smoke] passed');
  } finally {
    await page.close();
    await cleanup();
  }

  // Keep these references live for lints and for clearer cleanup ownership.
  void serverProcess;
  void webProcess;
  void browserProcess;

  process.exit(0);
}

function startProcess(name, command, args, env = {}) {
  const usesWindowsCommandShim =
    process.platform === 'win32' && command.endsWith('.cmd');
  // This harness starts the server through `corepack pnpm --filter @dnd/server
  // dev`, i.e. `corepack -> pnpm -> node --watch -> server`. Signalling the
  // recorded handle stops corepack and orphans the rest, which is how M3 wave
  // one finished a green sweep with four servers still holding ports. The tree
  // logic is shared; see `harness-process-tree.mjs`.
  const { child } = spawnOwnedProcess(
    name,
    usesWindowsCommandShim ? (process.env.ComSpec ?? 'cmd.exe') : command,
    usesWindowsCommandShim ? ['/d', '/s', '/c', command, ...args] : args,
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

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

function launchBrowser(browserPath, debugPort) {
  chromeUserDataDir = mkdtempSync(resolve(tmpdir(), 'dnd-runtime-smoke-'));

  const chrome = startProcess('chrome', browserPath, [
    ...getChromeDisplayArgs({ windowSize: { height: 1000, width: 1600 } }),
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeUserDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-sandbox',
    'about:blank',
  ]);

  // Deleted only once this Chrome has exited, never beside it.
  ownDirectoryAfter(getOwnedRecord(chrome), chromeUserDataDir);

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

async function clickButton(page, label) {
  await waitFor(page, {
    label: `button "${label}"`,
    predicate: hasEnabledVisibleButtonExpression(label),
  });

  const point = await page.evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const button = [...document.querySelectorAll('button')].find(
      (candidate) =>
        candidate.textContent?.includes(label) &&
        !candidate.disabled &&
        candidate.getClientRects().length > 0,
    );

    if (!button) {
      throw new Error('No enabled visible button found for ' + label);
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

async function clickButtonIfEnabled(page, label) {
  const canClick = await page.evaluate(
    hasEnabledVisibleButtonExpression(label),
  );

  if (canClick) {
    await clickButton(page, label);
  }
}

function hasEnabledVisibleButtonExpression(label) {
  return `(() => [...document.querySelectorAll('button')].some(
    (candidate) =>
      candidate.textContent?.includes(${JSON.stringify(label)}) &&
      !candidate.disabled &&
      candidate.getClientRects().length > 0,
  ))()`;
}

async function waitForText(page, text, label = text) {
  await waitFor(page, {
    label,
    predicate: `(() => (document.body?.innerText ?? '').includes(${JSON.stringify(
      text,
    )}))()`,
  });
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

async function expectVisibleText(page, text, expected) {
  const actual = await page.evaluate(
    `(() => {
      const bodyText = document.body?.innerText ?? '';
      return bodyText.includes(${JSON.stringify(text)});
    })()`,
  );

  if (actual !== expected) {
    throw new Error(
      `Expected visible text ${JSON.stringify(text)} to be ${expected}, got ${actual}.`,
    );
  }
}

async function expectVisibleButton(page, label, expected) {
  const actual =
    await page.evaluate(`(() => [...document.querySelectorAll('button')].some(
    (candidate) =>
      candidate.textContent?.includes(${JSON.stringify(label)}) &&
      candidate.getClientRects().length > 0,
  ))()`);

  if (actual !== expected) {
    throw new Error(
      `Expected visible button ${JSON.stringify(label)} to be ${expected}, got ${actual}.`,
    );
  }
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

/** Bring one GM tool group on screen before asserting on what it contains. */
async function openGmTool(page, tab) {
  await waitFor(page, {
    label: `GM ${tab} tools open`,
    predicate: getOpenGameMasterToolExpression(tab),
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
    throw new Error('Expected a stored cockpit session ID before Local Reset.');
  }

  return storedSessionId;
}

async function setSessionInputValue(page, sessionId) {
  const assigned = await page.evaluate(
    getSessionInputAssignmentExpression(sessionId),
  );

  if (!assigned) {
    throw new Error(
      'Unable to restore the session ID input after Local Reset.',
    );
  }
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
  startedProcesses.splice(0);
  await teardownOwnedProcesses();
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
