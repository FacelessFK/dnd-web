#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertWebUiTargetsServer,
  formatSmokeStep,
  formatSmokeWaitFailure,
  getChromeDisplayArgs,
  normalizePageDiagnostics,
} from './runtime-smoke-diagnostics.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(scriptDir, '..');
const repoRoot = resolve(webDir, '../..');
const dbDir = resolve(repoRoot, 'packages/db');
const serverDir = resolve(repoRoot, 'apps/server');
const nextBin = resolve(webDir, 'node_modules/next/dist/bin/next');
const smokeTimeoutMs = Number.parseInt(
  process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? '120000',
  10,
);

const processLogs = new Map();
const startedProcesses = [];
const profileDirs = [];
const tempDirs = [];
const smokeStepLabels = [
  'checking DB-mode configuration',
  'checking UTF-8 DB readiness',
  'starting DB-backed authoritative server',
  'starting Next character UI',
  'creating authenticated Persian draft entry',
  'verifying persisted library reload in browser',
  'verifying portrait upload persistence in browser',
  'verifying Review PDF artifact in browser',
  'finalizing entry through browser UI and verifying card PDF artifact',
];
let smokeStepIndex = 0;

loadRepoEnvironment();

main().catch(async (error) => {
  console.error('\n[character-builder-export-db-smoke] failed');
  console.error(redactSecrets(error instanceof Error ? error.stack : error));
  printProcessLogs();
  await cleanup();
  process.exit(1);
});

async function main() {
  logSmokeStep('checking DB-mode configuration');

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for the DB-mode Character Builder export smoke. Apply packages/db/migrations first, then rerun with SERVER_PERSISTENCE_MODE=db and DATABASE_URL set.',
    );
  }

  logSmokeStep('checking UTF-8 DB readiness');
  await runDbReadinessCheck();

  const browserPath = findBrowserExecutable();

  if (!browserPath) {
    throw new Error(
      'No Chrome/Chromium executable found. Set RUNTIME_SMOKE_BROWSER=/path/to/chrome to run the DB-mode Character Builder export smoke.',
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
  const charactersUrl = `${webOrigin}/characters`;
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `builder-export-${unique}@example.test`;
  const password = `builder-export-password-${unique}`;
  const characterName = `آزمونگر UTF-8 ${unique.slice(-6)}`;

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

  logSmokeStep('starting Next character UI');
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
  await waitForHttp(charactersUrl, {
    label: '/characters',
    timeoutMs: smokeTimeoutMs,
  });
  // A second `next dev` on this tree would have recompiled the client chunks
  // against its own server URL; fail now instead of on a mystery timeout.
  await assertWebUiTargetsServer(charactersUrl, serverUrl);

  logSmokeStep('creating authenticated Persian draft entry');
  const registered = await registerUser(serverUrl, {
    displayName: 'Builder Export Player',
    email,
    password,
  });
  const createdEntry = await postCommand({
    body: {
      actor: { participantId: registered.user.id },
      commandId: `builder-export-create-entry-${unique}`,
      payload: {
        entry: createPersianCharacterInput(characterName),
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

  const listedDraft = await postCommand({
    body: {
      actor: { participantId: registered.user.id },
      commandId: `builder-export-list-draft-${unique}`,
      payload: {
        ownerParticipantId: registered.user.id,
      },
      type: 'list_character_library_entries',
    },
    cookie: registered.cookie,
    path: '/api/character-library/command',
    serverUrl,
  });
  assertOk(listedDraft, 'list_character_library_entries draft');

  if (
    !listedDraft.data.entries.some(
      (entry) => entry.id === entryId && entry.name === characterName,
    )
  ) {
    throw new Error('Created Persian draft did not persist in DB list output.');
  }

  launchBrowserProfile('builder-export-chrome', browserPath, debugPort);
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, {
    label: 'Chrome DevTools',
    timeoutMs: smokeTimeoutMs,
  });
  const page = await createCdpPage(debugPort, charactersUrl);

  try {
    await enablePage(page);
    await navigate(page, charactersUrl);
    await loginInBrowser(page, serverUrl, { email, password });
    await setLocale(page, 'en');

    logSmokeStep('verifying persisted library reload in browser');
    await navigate(page, charactersUrl);
    await waitForAnyText(page, [characterName], 'persisted Persian card');
    await navigate(
      page,
      `${charactersUrl}?reload=${encodeURIComponent(unique)}`,
    );
    await waitForAnyText(
      page,
      [characterName],
      'persisted Persian card after reload',
    );

    logSmokeStep('verifying portrait upload persistence in browser');
    await navigate(page, `${webOrigin}/characters/${entryId}/edit`);
    await waitForInputValue(
      page,
      characterName,
      'edit builder loaded persisted entry',
    );
    const portraitFilePath = createSmokePortraitFile(unique);
    await uploadPortraitFile(page, portraitFilePath);
    await waitForPortraitPreview(page, 'uploaded portrait preview');
    await clickButton(page, ['Save Changes']);
    await waitForAnyText(
      page,
      ['Changes saved', 'portrait'],
      'portrait save notice',
    );
    await assertPersistedPortrait({
      cookie: registered.cookie,
      entryId,
      ownerParticipantId: registered.user.id,
      serverUrl,
      unique,
    });
    await navigate(
      page,
      `${charactersUrl}?portrait=${encodeURIComponent(unique)}`,
    );
    await waitForCardPortraitImage(page, characterName);

    logSmokeStep('verifying Review PDF artifact in browser');
    await navigate(page, `${webOrigin}/characters/${entryId}/edit`);
    await waitForInputValue(
      page,
      characterName,
      'edit builder loaded persisted entry after portrait save',
    );
    await clickButton(page, ['View Character Sheet']);
    await waitForAnyText(
      page,
      ['Character Sheet', characterName],
      'review sheet',
    );
    await enablePdfArtifactCapture(page);
    await clickFirstPdfButton(page);
    await waitForAnyText(
      page,
      ['preview is ready', 'PDF preview ready'],
      'review PDF preview notice',
    );
    await waitForPdfPreviewContent(page, {
      characterName,
      label: 'Review PDF preview content',
    });
    await waitForPdfArtifact(page, 'Review PDF artifact');
    await clickButton(page, ['Download PDF']);
    await waitForAnyText(
      page,
      [
        'downloaded from saved character data',
        'Fallback character sheet PDF downloaded',
      ],
      'review PDF download notice',
    );

    logSmokeStep(
      'finalizing entry through browser UI and verifying card PDF artifact',
    );
    await navigate(
      page,
      `${charactersUrl}?finalized=${encodeURIComponent(unique)}`,
    );
    await waitForAnyText(page, [characterName], 'draft card before finalize');
    await clickCardButton(page, characterName, ['Finalize Character']);
    await waitForAnyText(page, ['is finalized.'], 'browser finalize notice');
    await enablePdfArtifactCapture(page);
    await clickCardPdfButton(page, characterName);
    await waitForAnyText(
      page,
      ['preview is ready', 'PDF preview ready'],
      'card PDF preview notice',
    );
    await waitForPdfPreviewContent(page, {
      characterName,
      label: 'card PDF preview content',
    });
    await waitForPdfArtifact(page, 'card PDF artifact');
    await clickButton(page, ['Download PDF']);
    await waitForAnyText(
      page,
      [
        'downloaded from saved character data',
        'Fallback character sheet PDF downloaded',
      ],
      'card PDF download notice',
    );

    const listedFinalized = await postCommand({
      body: {
        actor: { participantId: registered.user.id },
        commandId: `builder-export-list-finalized-${unique}`,
        payload: {
          ownerParticipantId: registered.user.id,
        },
        type: 'list_character_library_entries',
      },
      cookie: registered.cookie,
      path: '/api/character-library/command',
      serverUrl,
    });
    assertOk(listedFinalized, 'list_character_library_entries finalized');

    const finalEntry = listedFinalized.data.entries.find(
      (entry) => entry.id === entryId,
    );

    if (!finalEntry || finalEntry.status !== 'finalized') {
      throw new Error('Finalized Persian entry did not persist as finalized.');
    }

    console.log(
      `[character-builder-export-db-smoke] passed for Persian entry ${entryId}`,
    );
  } finally {
    await page.close().catch(() => undefined);
    await cleanup();
  }
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

async function setLocale(page, locale) {
  await page.evaluate(`(() => {
    window.localStorage.setItem('dnd-web.locale', ${JSON.stringify(locale)});
  })()`);
}

function createPersianCharacterInput(name) {
  return {
    abilities: {
      cha: 10,
      con: 14,
      dex: 13,
      int: 11,
      str: 16,
      wis: 12,
    },
    abilityScoreMethod: 'point-buy',
    armorClass: 15,
    background: 'Soldier',
    builderSelections: {
      cantrips: [],
      equipment: ['Chain Mail', 'Longsword', 'Shield', 'Explorer Pack'],
      languages: ['Common', 'Elvish'],
      originFeatAbility: '',
      originFeatCantrips: [],
      originFeatSpell: '',
      skills: ['Athletics', 'Insight', 'Perception'],
      spells: [],
      tools: ['Gaming Set'],
    },
    builderStep: 'review',
    className: 'Fighter',
    concept: 'نگهبان فارسی برای آزمون ذخیره UTF-8',
    hp: {
      current: 12,
      max: 12,
      temp: 0,
    },
    level: 1,
    name,
    notes: 'یادداشت فارسی باید بدون تغییر در JSONB ذخیره و بازیابی شود.',
    portrait: null,
    pronouns: 'او',
    rulesProfileId: 'dnd-2024-free-rules',
    speciesOrRace: 'Human',
    speed: 30,
  };
}

function createSmokePortraitFile(unique) {
  const tempDir = mkdtempSync(resolve(tmpdir(), 'dnd-builder-portrait-'));
  tempDirs.push(tempDir);
  const filePath = resolve(tempDir, `portrait-${unique}.png`);
  const transparentPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

  writeFileSync(filePath, Buffer.from(transparentPng, 'base64'));

  return filePath;
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
      `Unable to register DB-mode Character Builder smoke user: HTTP ${response.status}`,
    );
  }

  return {
    cookie,
    user: payload.data.user,
  };
}

async function postCommand({ body, cookie, path, serverUrl }) {
  const response = await fetch(`${serverUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      ...(cookie ? { cookie } : {}),
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const payload = await response.json();

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
      }. Reprovision the local DB as UTF-8 and apply packages/db/migrations/ before running the Character Builder export smoke.`,
    );
  }
}

function launchBrowserProfile(name, browserPath, debugPort) {
  const userDataDir = mkdtempSync(resolve(tmpdir(), `dnd-${name}-`));
  profileDirs.push(userDataDir);

  return startProcess(name, browserPath, [
    ...getChromeDisplayArgs({ windowSize: { height: 1000, width: 1400 } }),
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

async function enablePdfArtifactCapture(page) {
  await page.evaluate(`(() => {
    window.__DND_ENABLE_PDF_SMOKE_ARTIFACTS = true;
    delete window.__DND_LAST_CHARACTER_SHEET_PDF;
  })()`);
}

async function waitForPdfArtifact(page, label) {
  const artifact = await waitForValue(page, {
    label,
    predicate: `(() => {
      const artifact = window.__DND_LAST_CHARACTER_SHEET_PDF;

      return artifact &&
        artifact.header === '%PDF-' &&
        artifact.byteLength > 5 &&
        artifact.fileName?.endsWith('.pdf')
        ? artifact
        : null;
    })()`,
  });

  return artifact;
}

async function waitForPdfPreviewContent(page, { characterName, label }) {
  await waitFor(page, {
    label,
    predicate: `(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');

      if (!dialog || dialog.getClientRects().length === 0) {
        return false;
      }

      const text = dialog.textContent ?? '';
      const printableSheet = dialog.querySelector('section[dir="ltr"]');
      const expectedText = [
        'Review Character Sheet',
        'Download PDF',
        'Close Preview',
        ${JSON.stringify(characterName)},
        'Character Name',
        'Class & Level',
        'Fighter 1',
        'Species',
        'Human',
        'Background',
        'Soldier',
        'Armor Class',
      ];

      return Boolean(printableSheet && expectedText.every((value) => text.includes(value)));
    })()`,
  });
}

async function uploadPortraitFile(page, filePath) {
  await page.send('DOM.enable');
  const document = await page.send('DOM.getDocument', {
    depth: -1,
    pierce: true,
  });
  const result = await page.send('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: 'input[type="file"][accept*="image"]',
  });

  if (!result.nodeId) {
    throw new Error('Unable to find the character portrait file input.');
  }

  await page.send('DOM.setFileInputFiles', {
    files: [filePath],
    nodeId: result.nodeId,
  });
}

async function waitForPortraitPreview(page, label) {
  await waitFor(page, {
    label,
    predicate: `(() => [...document.querySelectorAll('img')].some(
      (image) =>
        image.getAttribute('src')?.startsWith('data:image/') &&
        image.getClientRects().length > 0,
    ))()`,
  });
}

async function waitForCardPortraitImage(page, characterName) {
  await waitFor(page, {
    label: 'persisted card portrait image',
    predicate: `(() => {
      const article = [...document.querySelectorAll('article')].find(
        (candidate) => candidate.textContent?.includes(${JSON.stringify(characterName)}),
      );

      return Boolean(article && [...article.querySelectorAll('img')].some(
        (image) => {
          const src = image.getAttribute('src') ?? '';

          return (
            image.getClientRects().length > 0 &&
            (src.startsWith('data:image/') ||
              src.includes('/api/character-library/portraits/'))
          );
        },
      ));
    })()`,
  });
}

async function assertPersistedPortrait({
  cookie,
  entryId,
  ownerParticipantId,
  serverUrl,
  unique,
}) {
  const response = await postCommand({
    body: {
      actor: { participantId: ownerParticipantId },
      commandId: `builder-export-get-portrait-${unique}`,
      payload: {
        entryId,
        ownerParticipantId,
      },
      type: 'get_character_library_entry',
    },
    cookie,
    path: '/api/character-library/command',
    serverUrl,
  });
  assertOk(response, 'get_character_library_entry portrait');

  const portrait = response.data.entry.portrait;

  if (
    !portrait ||
    portrait.kind !== 'uploaded' ||
    (!portrait.dataUrl && !portrait.url)
  ) {
    throw new Error('Uploaded portrait did not persist on the library entry.');
  }
}

async function waitForValue(
  page,
  { label, predicate, timeoutMs = smokeTimeoutMs },
) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await page.evaluate(predicate);

      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  const diagnostics = await collectPageDiagnostics(page).catch((error) => ({
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

async function clickButton(page, labels) {
  await waitFor(page, {
    label: `button "${labels.join('" or "')}"`,
    predicate: hasEnabledVisibleButtonExpression(labels),
  });

  await clickVisibleButton(
    page,
    `(() => {
      const labels = ${JSON.stringify(labels)};
      return [...document.querySelectorAll('button')].find(
        (candidate) =>
          labels.some((label) => candidate.textContent?.includes(label)) &&
          !candidate.disabled &&
          candidate.getClientRects().length > 0,
      );
    })()`,
  );
}

async function clickFirstPdfButton(page) {
  const predicate = `(() => [...document.querySelectorAll('button')].some(
    (candidate) =>
      /PDF/i.test(candidate.textContent ?? '') &&
      !candidate.disabled &&
      candidate.getClientRects().length > 0,
  ))()`;

  await waitFor(page, {
    label: 'enabled PDF button',
    predicate,
  });
  await clickVisibleButton(
    page,
    `(() => [...document.querySelectorAll('button')].find(
      (candidate) =>
        /PDF/i.test(candidate.textContent ?? '') &&
        !candidate.disabled &&
        candidate.getClientRects().length > 0,
    ))()`,
  );
}

async function clickCardButton(page, characterName, labels) {
  const predicate = `(() => {
    const labels = ${JSON.stringify(labels)};
    const article = [...document.querySelectorAll('article')].find(
      (candidate) => candidate.textContent?.includes(${JSON.stringify(characterName)}),
    );

    return Boolean(article && [...article.querySelectorAll('button')].some(
      (candidate) =>
        labels.some((label) => candidate.textContent?.includes(label)) &&
        !candidate.disabled &&
        candidate.getClientRects().length > 0,
    ));
  })()`;

  await waitFor(page, {
    label: `enabled card button "${labels.join('" or "')}"`,
    predicate,
  });
  await clickVisibleButton(
    page,
    `(() => {
      const labels = ${JSON.stringify(labels)};
      const article = [...document.querySelectorAll('article')].find(
        (candidate) => candidate.textContent?.includes(${JSON.stringify(characterName)}),
      );

      return article
        ? [...article.querySelectorAll('button')].find(
            (candidate) =>
              labels.some((label) => candidate.textContent?.includes(label)) &&
              !candidate.disabled &&
              candidate.getClientRects().length > 0,
          )
        : null;
    })()`,
  );
}

async function clickCardPdfButton(page, characterName) {
  const predicate = `(() => {
    const article = [...document.querySelectorAll('article')].find(
      (candidate) => candidate.textContent?.includes(${JSON.stringify(characterName)}),
    );

    return Boolean(article && [...article.querySelectorAll('button')].some(
      (candidate) => !candidate.disabled && candidate.getClientRects().length > 0,
    ));
  })()`;

  await waitFor(page, {
    label: 'enabled card PDF button',
    predicate,
  });
  await clickVisibleButton(
    page,
    `(() => {
      const article = [...document.querySelectorAll('article')].find(
        (candidate) => candidate.textContent?.includes(${JSON.stringify(characterName)}),
      );

      return article
        ? [...article.querySelectorAll('button')].find(
            (candidate) => !candidate.disabled && candidate.getClientRects().length > 0,
          )
        : null;
    })()`,
  );
}

async function clickVisibleButton(page, findButtonExpression) {
  const point = await page.evaluate(`(() => {
    const button = ${findButtonExpression};

    if (!button) {
      throw new Error('No enabled visible button found.');
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
    predicate: `(() => {
      const bodyText = document.body?.innerText ?? '';
      return ${JSON.stringify(texts)}.some((text) => bodyText.includes(text));
    })()`,
  });
}

async function waitForInputValue(page, value, label) {
  await waitFor(page, {
    label,
    predicate: `(() => [...document.querySelectorAll('input, textarea')].some(
      (candidate) => candidate.value === ${JSON.stringify(value)},
    ))()`,
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

  const diagnostics = await collectPageDiagnostics(page).catch((error) => ({
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

async function collectPageDiagnostics(page) {
  const rawDiagnostics = await page.evaluate(`(() => ({
    cockpitState: null,
    enabledButtons: [...document.querySelectorAll('button')]
      .filter((button) => !button.disabled && button.getClientRects().length > 0)
      .slice(0, 20)
      .map((button) => button.textContent?.trim() ?? ''),
    url: window.location.href,
    visibleText: (document.body?.innerText ?? '').slice(0, 4000),
  }))()`);

  return normalizePageDiagnostics(rawDiagnostics);
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

  return sensitiveValues
    .reduce(
      (current, secret) => current.split(secret).join('[redacted]'),
      String(value),
    )
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s]+@/gi, '$1[redacted]@');
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
    await removeDirectory(dir);
  }

  for (const dir of tempDirs) {
    await removeDirectory(dir);
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

async function removeDirectory(dir) {
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
          `[character-builder-export-db-smoke] unable to remove temporary directory after cleanup: ${redactSecrets(
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
