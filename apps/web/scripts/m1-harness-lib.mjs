#!/usr/bin/env node
/**
 * Plumbing shared by the two M1 acceptance harnesses.
 *
 * `runtime-smoke.mjs` and its two-profile sibling each carry their own copy of
 * this machinery. Those harnesses pass and are deliberately left alone, so this
 * is a third implementation rather than a refactor of them - but only one, and
 * both M1 harnesses use it.
 *
 * What is here beyond the older copies, because M1 acceptance needs it:
 *
 * - isolated Chrome profiles with a name, so GM, Player and a hostile third
 *   account never share a cookie jar, a localStorage or a credential;
 * - a page-side raw named-frame SSE reader. `EventSource` only surfaces frames
 *   whose `event:` name has a listener, which makes it useless for proving a
 *   name was *not* sent or that a hidden ID never appeared in the bytes. This
 *   reads the response body and parses `event:`/`data:` itself;
 * - failure artifacts (screenshot, console, failed requests, captured frames,
 *   page text, storage key names) written outside the repository.
 */
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getChromeDisplayArgs } from './runtime-smoke-diagnostics.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const webDir = resolve(scriptDir, '..');
export const repoRoot = resolve(webDir, '../..');
export const serverDir = resolve(repoRoot, 'apps/server');
export const dbDir = resolve(repoRoot, 'packages/db');
export const nextBin = resolve(webDir, 'node_modules/next/dist/bin/next');
export const cockpitStorageKey = 'dnd-runtime-cockpit';
export const credentialStorageKey = 'dnd-participant-credential';

export const defaultTimeoutMs = Number.parseInt(
  process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? '120000',
  10,
);

const processLogs = new Map();
const startedProcesses = [];
const profileDirs = [];

/**
 * Where failure evidence goes.
 *
 * Never inside the working tree: a screenshot or a state dump committed by
 * accident is exactly the kind of artifact CLAUDE.md forbids, and CI uploads
 * from an explicit path rather than from wherever the repo happens to be.
 */
export const artifactRoot =
  process.env.M1_SMOKE_ARTIFACT_DIR ??
  resolve(tmpdir(), 'dnd-m1-smoke-artifacts');

export function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();

    server.unref();
    server.on('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

export function startProcess(name, command, args, options = {}) {
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
  processLogs.set(child, { lines: [], name });

  const capture = (chunk) => {
    const log = processLogs.get(child);

    if (!log) {
      return;
    }

    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      log.lines.push(line);

      if (log.lines.length > 200) {
        log.lines.shift();
      }
    }
  };

  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  return child;
}

export function getProcessLog(child) {
  return processLogs.get(child)?.lines.join('\n') ?? '';
}

export function collectProcessLogs() {
  const collected = {};

  for (const [, log] of processLogs) {
    collected[log.name] = log.lines.join('\n');
  }

  return collected;
}

export function printProcessLogs() {
  for (const [, log] of processLogs) {
    if (log.lines.length === 0) {
      continue;
    }

    console.error(`\n--- ${log.name} output (tail) ---`);
    console.error(log.lines.slice(-60).join('\n'));
  }
}

export function findBrowserExecutable() {
  const explicitPath = process.env.RUNTIME_SMOKE_BROWSER;

  if (explicitPath) {
    return explicitPath;
  }

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * One Chrome per role, each with its own `--user-data-dir`.
 *
 * That directory is what actually isolates the profiles: cookies, localStorage,
 * sessionStorage and therefore the auth session and the participant credential
 * all live in it. Two tabs of one Chrome would share every one of those and
 * would prove nothing about a second account.
 */
export function launchBrowserProfile(name, browserPath, debugPort, options) {
  const userDataDir = mkdtempSync(resolve(tmpdir(), `dnd-m1-${name}-`));

  profileDirs.push(userDataDir);

  return startProcess('chrome:' + name, browserPath, [
    ...getChromeDisplayArgs({
      windowPosition: options?.windowPosition,
      windowSize: options?.windowSize,
    }),
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,MediaRouter',
    '--no-sandbox',
    'about:blank',
  ]);
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

  const page = await CdpClient.connect(target.webSocketDebuggerUrl, url);

  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');

  return page;
}

export class CdpClient {
  static connect(webSocketUrl, label) {
    return new Promise((resolveClient, rejectClient) => {
      const socket = new WebSocket(webSocketUrl);
      const client = new CdpClient(socket, label);
      const timeout = setTimeout(() => {
        rejectClient(new Error('Timed out connecting to Chrome DevTools.'));
      }, 20000);

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

  constructor(socket, label) {
    this.label = label ?? 'page';
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.failedRequests = [];
    this.requestUrlsById = new Map();
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
      const timeout = setTimeout(resolveClose, 1500);

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
    }

    if (message.method === 'Runtime.exceptionThrown') {
      this.consoleErrors.push(
        message.params?.exceptionDetails?.exception?.description ??
          message.params?.exceptionDetails?.text ??
          'uncaught exception',
      );
    }

    if (message.method === 'Network.requestWillBeSent') {
      this.requestUrlsById.set(
        message.params.requestId,
        message.params.request?.url ?? '',
      );
    }

    if (message.method === 'Network.responseReceived') {
      const status = message.params.response?.status ?? 0;

      if (status >= 400) {
        this.failedRequests.push({
          status,
          url: message.params.response?.url ?? '',
        });
      }
    }

    if (message.method === 'Network.loadingFailed') {
      const url = this.requestUrlsById.get(message.params.requestId) ?? '';

      // A cancelled request is what a closed EventSource or an aborted stream
      // reader looks like, and both happen on purpose here.
      if (!message.params.canceled) {
        this.failedRequests.push({
          error: message.params.errorText,
          url,
        });
      }
    }
  }
}

export function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export async function waitForHttp(
  url,
  { label, timeoutMs = defaultTimeoutMs },
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Keep polling until the deadline.
    }

    await delay(400);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}.`);
}

export async function waitForPortRelease(port, { timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const free = await new Promise((resolveFree) => {
      const probe = createServer();

      probe.once('error', () => resolveFree(false));
      probe.once('listening', () => probe.close(() => resolveFree(true)));
      probe.listen(port, '127.0.0.1');
    });

    if (free) {
      return;
    }

    await delay(250);
  }

  throw new Error(`Port ${port} was still held after ${timeoutMs}ms.`);
}

export async function waitFor(
  page,
  { label, predicate, timeoutMs = defaultTimeoutMs },
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const result = await page.evaluate(predicate);

      if (result) {
        return result;
      }

      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for ${label} in ${page.label}.${
      lastError ? ` Last evaluation error: ${lastError}` : ''
    }`,
  );
}

export function toLabelArray(labels) {
  return Array.isArray(labels) ? labels : [labels];
}

function visibleButtonExpression(labels) {
  return `[...document.querySelectorAll('button')].filter((candidate) => {
    const text = (candidate.textContent ?? '').replace(/\\s+/g, ' ').trim();
    return candidate.offsetParent !== null &&
      ${JSON.stringify(toLabelArray(labels))}.some((label) => text === label || text.includes(label));
  })`;
}

/**
 * Clicks the button whose accessible name matches, preferring an exact match.
 *
 * The preference is not cosmetic. "Reposition" and "DM Reposition" both exist
 * in DM mode and do different things to different creatures; a substring match
 * picked the wrong one and quietly moved the player's token instead of the
 * monster's, and every assertion afterwards still passed.
 */
export async function clickButton(page, labels, options = {}) {
  const scope = options.scope ? JSON.stringify(options.scope) : 'null';
  const expression = `(() => {
    const scope = ${scope};
    const root = scope ? document.querySelector(scope) : document;
    if (!root) { return null; }
    const wanted = ${JSON.stringify(toLabelArray(labels))};
    const candidates = [...root.querySelectorAll('button')].filter(
      (candidate) => !candidate.disabled && candidate.offsetParent !== null,
    );
    const nameOf = (candidate) =>
      (candidate.textContent ?? '').replace(/\\s+/g, ' ').trim();
    const button =
      candidates.find((candidate) => wanted.includes(nameOf(candidate))) ??
      candidates.find((candidate) =>
        wanted.some((label) => nameOf(candidate).includes(label)),
      );
    if (!button) { return null; }
    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  })()`;

  await waitFor(page, {
    label: `enabled button ${JSON.stringify(toLabelArray(labels))}`,
    predicate: expression,
    timeoutMs: options.timeoutMs,
  });
}

export async function clickButtonIfEnabled(page, labels) {
  await page.evaluate(`(() => {
    const wanted = ${JSON.stringify(toLabelArray(labels))};
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      const text = (candidate.textContent ?? '').replace(/\\s+/g, ' ').trim();
      return !candidate.disabled &&
        candidate.offsetParent !== null &&
        wanted.some((label) => text === label || text.includes(label));
    });
    if (button) { button.click(); }
    return true;
  })()`);
}

export function isVisibleButtonPresent(page, labels) {
  return page.evaluate(`(${visibleButtonExpression(labels)}).length > 0`);
}

export async function expectNoVisibleButton(page, labels, label) {
  const present = await isVisibleButtonPresent(page, labels);

  if (present) {
    throw new Error(`${label}: expected no visible button in ${page.label}.`);
  }
}

export function waitForText(page, texts, label) {
  return waitFor(page, {
    label,
    predicate: `(() => {
      const text = document.body?.innerText ?? '';
      return ${JSON.stringify(toLabelArray(texts))}.some((candidate) => text.includes(candidate));
    })()`,
  });
}

export function waitForNoText(page, texts, label) {
  return waitFor(page, {
    label,
    predicate: `(() => {
      const text = document.body?.innerText ?? '';
      return ${JSON.stringify(toLabelArray(texts))}.every((candidate) => !text.includes(candidate));
    })()`,
  });
}

export function readText(page, selector) {
  return page.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    return node ? node.innerText.replace(/\\s+/g, ' ').trim() : null;
  })()`);
}

export function readPageText(page) {
  return page.evaluate(`(document.body?.innerText ?? '')`);
}

/**
 * Sets a React-controlled field the way a user would leave it.
 *
 * Assigning `.value` alone does not reach React, which tracks the previous
 * value on the DOM node; going through the prototype setter is what makes the
 * synthetic `change` carry the new value.
 */
export async function setFieldValue(page, selector, value) {
  const changed = await page.evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) { return false; }
    const proto = Object.getPrototypeOf(node);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor.set.call(node, ${JSON.stringify(String(value))});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);

  if (!changed) {
    throw new Error(`No element matched ${selector} in ${page.label}.`);
  }
}

/**
 * Sets an input or select found by its own visible label.
 *
 * The runtime cockpit builds its fields as `<label><span>Name</span><input/></label>`
 * with no id, so the label text is the accessible name and the only locator
 * that is not "the fourth input in this panel". `occurrence` disambiguates the
 * handful of labels that legitimately repeat across panels.
 */
export async function setLabeledField(page, labelText, value, options = {}) {
  const changed = await page.evaluate(`(() => {
    const wanted = ${JSON.stringify(labelText)};
    const occurrence = ${Number(options.occurrence ?? 0)};
    const labels = [...document.querySelectorAll('label')].filter((candidate) => {
      if (candidate.offsetParent === null) { return false; }
      const span = candidate.querySelector('span');
      const text = (span?.textContent ?? candidate.textContent ?? '')
        .replace(/\\s+/g, ' ')
        .trim();
      return text === wanted;
    });
    const node = labels[occurrence]?.querySelector('input, select');
    if (!node) { return false; }
    const proto = Object.getPrototypeOf(node);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    descriptor.set.call(node, ${JSON.stringify(String(value))});
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);

  if (!changed) {
    throw new Error(`No field labelled "${labelText}" in ${page.label}.`);
  }
}

export function readLabeledOptions(page, labelText) {
  return page.evaluate(`(() => {
    const wanted = ${JSON.stringify(labelText)};
    const label = [...document.querySelectorAll('label')].find((candidate) => {
      if (candidate.offsetParent === null) { return false; }
      const span = candidate.querySelector('span');
      const text = (span?.textContent ?? '').replace(/\\s+/g, ' ').trim();
      return text === wanted;
    });
    const select = label?.querySelector('select');
    if (!select) { return null; }
    return [...select.options].map((option) => ({
      label: option.textContent.replace(/\\s+/g, ' ').trim(),
      value: option.value,
    }));
  })()`);
}

export async function navigate(page, url) {
  await page.send('Page.navigate', { url });
  await waitFor(page, {
    label: `navigation to ${url}`,
    predicate: `(() => window.location.href === ${JSON.stringify(url)})()`,
  });
}

export async function reload(page) {
  await page.send('Page.reload', { ignoreCache: false });
}

/** Pins the locale so assertions can name one language's copy. */
export async function forceLocale(page, locale) {
  await page.evaluate(
    `(() => { localStorage.setItem('dnd-web.locale', ${JSON.stringify(locale)}); return true; })()`,
  );
}

export async function registerAccount(serverUrl, body) {
  const response = await fetch(`${serverUrl}/api/auth/register`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const payload = await response.json();
  const cookie = response.headers.get('set-cookie') ?? '';

  if (!response.ok || !payload?.ok || !cookie.includes('dnd_web_session=')) {
    throw new Error(
      `Unable to register ${body.email}: HTTP ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  return { cookie, user: payload.data.user };
}

export async function loginInBrowser(page, serverUrl, credentials) {
  const result = await page.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(`${serverUrl}/api/auth/login`)}, {
      body: JSON.stringify(${JSON.stringify(credentials)}),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return { body: await response.json(), status: response.status };
  })()`);

  if (result.status !== 200 || !result.body?.ok) {
    throw new Error(
      `Browser login failed with HTTP ${result.status} in ${page.label}.`,
    );
  }
}

/**
 * Installs a raw named-frame SSE reader in place of `EventSource`.
 *
 * Two constraints force this shape.
 *
 * First, the assertions need the bytes. `EventSource` only delivers a frame
 * whose `event:` name has a listener, so it can never prove a name was absent,
 * and it hands back a parsed `data` with the framing already discarded -
 * useless for "this hidden ID never appeared anywhere in Player traffic".
 *
 * Second, and less obviously: the server keeps exactly ONE subscriber per
 * participant, and a new connection closes the previous one. An observer
 * subscription opened alongside the application's would therefore not observe
 * the table - it would silently take the seat's stream away from the UI, and
 * the panels would stop updating. So the harness cannot watch from beside the
 * app; it has to be the transport the app is already using.
 *
 * This replaces `window.EventSource` with a fetch-based implementation that
 * parses `event:`/`data:` itself, records every frame verbatim, and then
 * dispatches to the application's listeners so the cockpit behaves normally.
 * One connection, real UI, raw bytes.
 *
 * Installed through `Page.addScriptToEvaluateOnNewDocument` so it survives the
 * reloads the recovery steps depend on.
 */
export async function installSseRecorder(page) {
  const source = `(() => {
    if (window.__m1SseInstalled) { return; }
    window.__m1SseInstalled = true;
    window.__m1Sse = { frames: [], opens: 0, status: 'idle' };

    const NativeEventSource = window.EventSource;

    class RecordingEventSource extends EventTarget {
      constructor(url) {
        super();
        this.url = String(url);
        this.readyState = 0;
        this.onopen = null;
        this.onerror = null;
        this.onmessage = null;
        this._controller = new AbortController();
        this._run();
      }

      close() {
        this.readyState = 2;
        this._controller.abort();
      }

      async _run() {
        const state = window.__m1Sse;

        try {
          const response = await fetch(this.url, {
            headers: { accept: 'text/event-stream' },
            signal: this._controller.signal,
          });

          if (!response.ok || !response.body) {
            state.status = 'http_' + response.status;
            this.readyState = 2;
            this._fire('error', new Event('error'));
            return;
          }

          this.readyState = 1;
          state.opens += 1;
          state.status = 'open';
          this._fire('open', new Event('open'));

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          for (;;) {
            const { done, value } = await reader.read();

            if (done) {
              state.status = 'closed';
              this.readyState = 2;
              this._fire('error', new Event('error'));
              return;
            }

            buffer += decoder.decode(value, { stream: true });

            let separator = buffer.indexOf('\\n\\n');

            while (separator !== -1) {
              const block = buffer.slice(0, separator);
              buffer = buffer.slice(separator + 2);
              separator = buffer.indexOf('\\n\\n');
              this._deliver(block);
            }
          }
        } catch (error) {
          if (this._controller.signal.aborted) {
            state.status = 'aborted';
            return;
          }

          state.status = 'error';
          this.readyState = 2;
          this._fire('error', new Event('error'));
        }
      }

      _deliver(block) {
        let name = null;
        const dataLines = [];

        for (const line of block.split('\\n')) {
          if (line.startsWith('event:')) {
            name = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (!name && dataLines.length === 0) {
          return;
        }

        const raw = dataLines.join('\\n');
        let parsed = null;

        try {
          parsed = JSON.parse(raw);
        } catch (error) {
          parsed = null;
        }

        // Recorded before dispatch, so a listener that throws still leaves the
        // frame in the evidence.
        window.__m1Sse.frames.push({
          event: name ?? 'message',
          parsed,
          raw,
          receivedAt: Date.now(),
          url: this.url,
        });

        const message = new MessageEvent(name ?? 'message', { data: raw });

        this._fire(name ?? 'message', message);
      }

      _fire(type, event) {
        const handler =
          type === 'open'
            ? this.onopen
            : type === 'error'
              ? this.onerror
              : type === 'message'
                ? this.onmessage
                : null;

        if (typeof handler === 'function') {
          handler.call(this, event);
        }

        this.dispatchEvent(event);
      }
    }

    RecordingEventSource.CONNECTING = 0;
    RecordingEventSource.OPEN = 1;
    RecordingEventSource.CLOSED = 2;
    RecordingEventSource.native = NativeEventSource;

    window.EventSource = RecordingEventSource;
  })()`;

  await page.send('Page.addScriptToEvaluateOnNewDocument', { source });
  await page.evaluate(source);
}

/** Waits until the recorded stream has actually connected at least once. */
export function waitForSseOpen(page, label) {
  return waitFor(page, {
    label: `${label} recorded SSE connection`,
    predicate: `window.__m1Sse?.status === 'open'`,
  });
}

export function readSseFrames(page) {
  return page.evaluate(`(window.__m1Sse?.frames ?? []).map((frame) => ({
    event: frame.event,
    parsed: frame.parsed,
    raw: frame.raw,
    receivedAt: frame.receivedAt,
  }))`);
}

/** Storage key names only. Never the credential values behind them. */
export function readStorageKeys(page) {
  return page.evaluate(`(() => {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      keys.push(localStorage.key(index));
    }
    return keys.sort();
  })()`);
}

export function readCredentialShape(page) {
  return page.evaluate(`(() => {
    const stored = JSON.parse(localStorage.getItem('dnd-participant-credential') ?? '[]');
    return stored.map((entry) => ({
      participantId: entry.participantId,
      sessionId: entry.sessionId,
      tokenLength: (entry.token ?? '').length,
    }));
  })()`);
}

/**
 * A stable fingerprint of a credential, for proving it changed.
 *
 * Never the token itself: this is printed, written to artifacts and pasted into
 * a pull request body.
 */
export async function fingerprintCredential(page, sessionId, participantId) {
  return page.evaluate(`(async () => {
    const stored = JSON.parse(localStorage.getItem('dnd-participant-credential') ?? '[]');
    const credential = stored.find(
      (candidate) =>
        candidate.sessionId === ${JSON.stringify(sessionId)} &&
        candidate.participantId === ${JSON.stringify(participantId)},
    );
    if (!credential) { return null; }
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(credential.token),
    );
    return [...new Uint8Array(digest)]
      .slice(0, 6)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  })()`);
}

/** Lifts a token out of a tab so the harness can run a negative probe with it. */
export function extractToken(page, sessionId, participantId) {
  return page.evaluate(`(() => {
    const stored = JSON.parse(localStorage.getItem('dnd-participant-credential') ?? '[]');
    return stored.find(
      (candidate) =>
        candidate.sessionId === ${JSON.stringify(sessionId)} &&
        candidate.participantId === ${JSON.stringify(participantId)},
    )?.token ?? null;
  })()`);
}

export async function postCommand({ body, cookie, path, serverUrl, token }) {
  const response = await fetch(`${serverUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(token ? { 'x-dnd-participant-token': token } : {}),
      'content-type': 'application/json',
    },
    method: 'POST',
  });

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { ...(payload ?? {}), status: response.status };
}

export async function captureArtifacts(runDir, name, pages, extra = {}) {
  mkdirSync(runDir, { recursive: true });

  const bundle = { ...extra, pages: {} };

  for (const [pageName, page] of Object.entries(pages)) {
    if (!page) {
      continue;
    }

    const record = {
      consoleErrors: page.consoleErrors,
      failedRequests: page.failedRequests,
    };

    try {
      const shot = await page.send('Page.captureScreenshot', {
        format: 'png',
      });

      writeFileSync(
        resolve(runDir, `${name}-${pageName}.png`),
        Buffer.from(shot.data, 'base64'),
      );
      record.screenshot = `${name}-${pageName}.png`;
    } catch (error) {
      record.screenshotError = String(error);
    }

    for (const [key, reader] of [
      ['url', () => page.evaluate('location.href')],
      ['visibleText', () => readPageText(page)],
      ['storageKeys', () => readStorageKeys(page)],
      ['credentials', () => readCredentialShape(page)],
      ['sseFrames', () => readSseFrames(page)],
    ]) {
      try {
        record[key] = await reader();
      } catch (error) {
        record[key] = `unavailable: ${String(error)}`;
      }
    }

    bundle.pages[pageName] = record;
  }

  bundle.processLogs = collectProcessLogs();

  writeFileSync(
    resolve(runDir, `${name}.json`),
    JSON.stringify(bundle, null, 2),
  );

  return runDir;
}

export async function stopProcess(child, { timeoutMs = 8000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    delay(timeoutMs),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise((resolveExit) => child.once('exit', resolveExit)),
      delay(4000),
    ]);
  }
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function cleanup() {
  for (const child of startedProcesses.splice(0).reverse()) {
    await stopProcess(child);
  }

  processLogs.clear();

  for (const dir of profileDirs.splice(0)) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        rmSync(dir, { force: true, recursive: true });
        break;
      } catch {
        await delay(250);
      }
    }
  }
}

/**
 * Loads the repo-root `.env` without overriding anything already exported.
 *
 * DB mode is opt-in and both M1 harnesses need it: `AuthService` is only wired
 * up when `SERVER_PERSISTENCE_MODE=db`, so an in-memory server answers register
 * and login with a 500 and there is no authenticated GM or Player to drive.
 */
export function loadRepoEnvironment() {
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

export async function runDbReadinessCheck(env = process.env) {
  const output = [];
  const child = spawn(process.execPath, ['scripts/check-db-readiness.mjs'], {
    cwd: dbDir,
    env: { ...env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));

  const { code, signal } = await new Promise((resolveCheck, rejectCheck) => {
    child.on('error', rejectCheck);
    child.on('close', (exitCode, exitSignal) =>
      resolveCheck({ code: exitCode, signal: exitSignal }),
    );
  });
  const text = redactSecrets(output.join('').trim());

  if (text) {
    console.log(text);
  }

  if (code !== 0) {
    throw new Error(
      `DB readiness check failed${
        signal ? ` with signal ${signal}` : ` with exit code ${code}`
      }. Apply packages/db/migrations/ and set DATABASE_URL before running this harness.`,
    );
  }
}

export function redactSecrets(value) {
  return String(value ?? '')
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgres://[redacted]')
    .replace(/("token"\s*:\s*)"[^"]+"/g, '$1"[redacted]"')
    .replace(/participantToken=[^&\s'"]+/g, 'participantToken=[redacted]');
}
