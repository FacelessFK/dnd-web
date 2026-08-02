#!/usr/bin/env node
// Two-profile browser plumbing for the live scene acceptance harness.
//
// Split from the smoke itself so the assertions read as product statements
// rather than DevTools wiring. Two things here are deliberately different from
// the older `runtime-two-profile-smoke.mjs` copy of this machinery:
//
//  - **Cleanup is signal-safe.** Normal exit, a thrown exception, SIGINT and
//    SIGTERM all run the same teardown exactly once. A harness that leaks a
//    `next dev` and two Chrome profiles poisons the next run with a port clash
//    and a stale compile, which is indistinguishable from a product defect.
//  - **The stream is recorded as bytes.** `installStreamRecorder` patches
//    `EventSource` before any application script runs, so every frame is kept as
//    the raw text the server sent. Asserting on a parsed object cannot prove a
//    concealed ID is absent from the wire - only searching the bytes can.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getOwnedRecord,
  ownDirectoryAfter,
  spawnOwnedProcess,
  teardownOwnedProcesses,
} from './harness-process-tree.mjs';
import { getChromeDisplayArgs } from './runtime-smoke-diagnostics.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const webDir = resolve(scriptDir, '..');
export const repoRoot = resolve(webDir, '../..');
export const serverDir = resolve(repoRoot, 'apps/server');
export const nextBin = resolve(webDir, 'node_modules/next/dist/bin/next');
export const storageKey = 'dnd-runtime-cockpit';

const processLogs = new Map();
const startedProcesses = [];
const profileDirs = [];

let cleanupPromise = null;
let signalHandlersInstalled = false;

/**
 * Register teardown for every way this process can end.
 *
 * `once: true` on the signal handlers plus the memoised `cleanupPromise` means a
 * second Ctrl-C while teardown is already running does not start a second one
 * and leave half the children killed.
 */
export function installCleanupHandlers() {
  if (signalHandlersInstalled) {
    return;
  }

  signalHandlersInstalled = true;

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void cleanup().then(() => {
        process.exit(signal === 'SIGINT' ? 130 : 143);
      });
    });
  }

  process.once('uncaughtException', (error) => {
    console.error('[live-scene-smoke] uncaught exception');
    console.error(error instanceof Error ? error.stack : error);
    void cleanup().then(() => process.exit(1));
  });

  process.once('unhandledRejection', (error) => {
    console.error('[live-scene-smoke] unhandled rejection');
    console.error(error instanceof Error ? error.stack : error);
    void cleanup().then(() => process.exit(1));
  });
}

export function cleanup() {
  cleanupPromise ??= runCleanup();

  return cleanupPromise;
}

async function runCleanup() {
  // Sequential and newest-first, through the shared owner. The previous form
  // stopped every recorded handle in parallel and then deleted profile
  // directories, which raced Chrome's own exit; the owner ties each directory
  // to the process that must release it first.
  startedProcesses.splice(0);
  await teardownOwnedProcesses();
  profileDirs.splice(0);
}

export function startProcess(name, command, args, options = {}) {
  // One owned process group per spawn. See `harness-process-tree.mjs`: the
  // handle a harness records is not always the process holding the port.
  const { child } = spawnOwnedProcess(name, command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      ...options.env,
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    ownedPort: options.ownedPort ?? null,
  });

  startedProcesses.push(child);
  processLogs.set(child.pid, { lines: [], name });

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

      if (log.lines.length > 120) {
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

    processLogs
      .get(child.pid)
      ?.lines.push(`[process exited code=${code} signal=${signal}]`);
  });

  return child;
}

export function getProcessLogTails() {
  const tails = {};

  for (const log of processLogs.values()) {
    if (log.lines.length) {
      tails[log.name] = log.lines.slice(-60);
    }
  }

  return tails;
}

export function printProcessLogs() {
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

export function launchBrowserProfile(
  name,
  browserPath,
  debugPort,
  options = {},
) {
  const userDataDir = mkdtempSync(resolve(tmpdir(), `dnd-${name}-`));
  profileDirs.push(userDataDir);

  const chrome = startProcess(name, browserPath, [
    ...getChromeDisplayArgs({
      windowPosition: options.windowPosition,
      windowSize: options.windowSize ?? { height: 1040, width: 950 },
    }),
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-sandbox',
    // A two-profile run always leaves one window behind the other, and Chrome
    // throttles timers and animation frames in a window it considers occluded.
    // The Player's board then stops repainting and its React work crawls, so a
    // live update reads as no update - a property of the compositor rather than
    // of anything the product did.
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'about:blank',
  ]);

  // Removed only after this Chrome exits. A profile deleted from under a live
  // browser comes back half-written, and the next run inherits a state no
  // product code ever produces.
  ownDirectoryAfter(getOwnedRecord(chrome), userDataDir);

  return chrome;
}

export async function createCdpPage(debugPort, url) {
  const response = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
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

export class CdpClient {
  static connect(webSocketUrl) {
    return new Promise((resolveClient, rejectClient) => {
      const socket = new WebSocket(webSocketUrl);
      const client = new CdpClient(socket);
      const timeout = setTimeout(() => {
        rejectClient(new Error('Timed out connecting to Chrome DevTools.'));
      }, 15000);

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
    this.consoleErrors = [];
    this.failedRequests = [];
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
      this.socket.send(JSON.stringify({ id, method, params }));
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
        { once: true },
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
      this.handleEvent(message);
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

  handleEvent(message) {
    if (
      message.method === 'Runtime.consoleAPICalled' &&
      message.params?.type === 'error'
    ) {
      this.consoleErrors.push(
        (message.params.args ?? [])
          .map((arg) => arg.value ?? arg.description ?? '')
          .join(' '),
      );
      return;
    }

    if (message.method === 'Runtime.exceptionThrown') {
      this.consoleErrors.push(
        message.params?.exceptionDetails?.exception?.description ??
          message.params?.exceptionDetails?.text ??
          'uncaught exception',
      );
      return;
    }

    if (message.method === 'Network.loadingFailed') {
      this.failedRequests.push(
        `${message.params?.type ?? 'unknown'}: ${
          message.params?.errorText ?? 'failed'
        }`,
      );
    }
  }
}

export async function enablePage(page) {
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');
}

/**
 * Record every SSE frame as raw text, before the application can parse it.
 *
 * Installed with `Page.addScriptToEvaluateOnNewDocument` so it survives the
 * reload the refresh assertions perform. The recorder is inspection only: it
 * observes what the server sent and never changes what the page does with it.
 */
export async function installStreamRecorder(page) {
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const NativeEventSource = window.EventSource;

      if (!NativeEventSource || window.__dndStreamRecorderInstalled) {
        return;
      }

      window.__dndStreamRecorderInstalled = true;
      window.__dndFrames = [];
      window.__dndResponses = [];
      window.__dndStreamUrls = [];
      window.__dndOpenStreams = 0;

      // Command and read responses travel over fetch, not the stream. The
      // encounter a client holds after reconnecting arrives this way, and a
      // projection bug in a read handler would be invisible to an SSE-only
      // audit, so both channels are recorded.
      const nativeFetch = window.fetch.bind(window);

      window.fetch = async (input, init) => {
        const response = await nativeFetch(input, init);
        const url = typeof input === 'string' ? input : (input?.url ?? '');

        try {
          const body = await response.clone().text();

          if (window.__dndResponses.length < 400) {
            window.__dndResponses.push({
              at: Date.now(),
              raw: body.slice(0, 400000),
              status: response.status,
              url: String(url),
            });
          }
        } catch {
          // A body that cannot be re-read is not worth failing the page over.
        }

        return response;
      };

      window.EventSource = function PatchedEventSource(url, config) {
        const source = new NativeEventSource(url, config);

        window.__dndStreamUrls.push(String(url));
        window.__dndOpenStreams += 1;

        const nativeAddEventListener = source.addEventListener.bind(source);

        source.addEventListener = (type, listener, options) => {
          if (typeof listener === 'function') {
            return nativeAddEventListener(
              type,
              (event) => {
                if (typeof event.data === 'string') {
                  window.__dndFrames.push({
                    at: Date.now(),
                    name: type,
                    raw: event.data,
                  });
                }

                return listener(event);
              },
              options,
            );
          }

          return nativeAddEventListener(type, listener, options);
        };

        const nativeClose = source.close.bind(source);

        source.close = () => {
          window.__dndOpenStreams -= 1;
          return nativeClose();
        };

        return source;
      };

      window.EventSource.prototype = NativeEventSource.prototype;
      for (const key of ['CONNECTING', 'OPEN', 'CLOSED']) {
        window.EventSource[key] = NativeEventSource[key];
      }
    })()`,
  });
}

export async function readFrames(page, name = null) {
  const frames = await page.evaluate(
    'JSON.stringify(window.__dndFrames ?? [])',
  );
  const parsed = JSON.parse(frames ?? '[]');

  return name ? parsed.filter((frame) => frame.name === name) : parsed;
}

export async function readResponses(page) {
  const raw = await page.evaluate(
    'JSON.stringify(window.__dndResponses ?? [])',
  );

  return JSON.parse(raw ?? '[]');
}

export async function clearFrames(page) {
  await page.evaluate(`(() => {
    window.__dndFrames = [];
    window.__dndResponses = [];
    return true;
  })()`);
}

export async function waitForHttp(url, { label, timeoutMs }) {
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

export function getFreePort() {
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

export function findBrowserExecutable() {
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
      { encoding: 'utf8' },
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

export function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}
