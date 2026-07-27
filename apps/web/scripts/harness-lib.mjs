#!/usr/bin/env node
// Shared browser-harness plumbing: local server/web processes, a headless Chrome
// launch, and a minimal CDP client. Extracted so visual capture runs and future
// smokes do not each re-implement process and DevTools wiring.
//
// The existing `runtime-smoke.mjs` family still carries its own copy; this module
// is additive on purpose so those passing harnesses stay untouched.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(scriptDir, '../../..');
export const corepackCommand =
  process.platform === 'win32' ? 'corepack.cmd' : 'corepack';

const processLogs = new Map();
const startedProcesses = [];
let chromeUserDataDir;

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

export function startProcess(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  processLogs.set(name, []);

  const record = (chunk) => {
    const lines = processLogs.get(name);

    lines.push(chunk.toString());

    if (lines.length > 80) {
      lines.splice(0, lines.length - 80);
    }
  };

  child.stdout.on('data', record);
  child.stderr.on('data', record);
  startedProcesses.push(child);

  return child;
}

export function printProcessLogs() {
  for (const [name, lines] of processLogs.entries()) {
    if (lines.length === 0) {
      continue;
    }

    console.error(`\n--- ${name} output (tail) ---`);
    console.error(lines.join(''));
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

export function launchBrowser(browserPath, debugPort, { width, height }) {
  chromeUserDataDir = mkdtempSync(resolve(tmpdir(), 'dnd-visual-'));

  return startProcess('chrome', browserPath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${chromeUserDataDir}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
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

  return CdpClient.connect(target.webSocketDebuggerUrl);
}

export class CdpClient {
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
    this.consoleErrors = [];
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

export async function waitForHttp(url, { label, timeoutMs = 120000 }) {
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

export async function waitFor(page, { label, predicate, timeoutMs = 60000 }) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await page.evaluate(predicate);

    if (result) {
      return;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

export function waitForText(page, text, label = text) {
  return waitFor(page, {
    label,
    predicate: `(document.body?.innerText ?? '').includes(${JSON.stringify(text)})`,
  });
}

export async function clickButton(page, label) {
  await waitFor(page, {
    label: `button "${label}"`,
    predicate: `(() => {
      const label = ${JSON.stringify(label)};
      return [...document.querySelectorAll('button')].some((candidate) => {
        const text = (candidate.textContent ?? '').trim();
        return !candidate.disabled &&
          candidate.offsetParent !== null &&
          (text === label || text.includes(label));
      });
    })()`,
  });

  await page.evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      const text = (candidate.textContent ?? '').trim();
      return !candidate.disabled &&
        candidate.offsetParent !== null &&
        (text === label || text.includes(label));
    });

    if (!button) {
      throw new Error('Button not found: ' + label);
    }

    button.scrollIntoView({ block: 'center' });
    button.click();
    return true;
  })()`);
}

export function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');

  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    delay(4000),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

export async function cleanup() {
  for (const child of startedProcesses.splice(0).reverse()) {
    await stopProcess(child);
  }

  if (chromeUserDataDir) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(chromeUserDataDir, { force: true, recursive: true });
        break;
      } catch {
        await delay(200);
      }
    }

    chromeUserDataDir = undefined;
  }
}
