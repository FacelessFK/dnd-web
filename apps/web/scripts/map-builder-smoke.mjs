#!/usr/bin/env node
// Drives the /maps map builder in a real browser: paints terrain with several
// tools, exercises undo/redo, places a prop, and publishes the map to a live
// runtime session created through the authoritative server.
//
// Captures screenshots alongside the assertions so the editor can be reviewed
// visually as well as functionally.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  cleanup,
  clickButton,
  corepackCommand,
  createCdpPage,
  delay,
  findBrowserExecutable,
  getFreePort,
  launchBrowser,
  printProcessLogs,
  repoRoot,
  startProcess,
  waitFor,
  waitForHttp,
} from './harness-lib.mjs';
import { assertWebUiTargetsServer } from './runtime-smoke-diagnostics.mjs';

const args = process.argv.slice(2);
const outDir = resolve(
  repoRoot,
  readFlag('--out') ?? 'apps/web/.visual-capture',
);
const bootTimeoutMs = 180000;
const viewportWidth = 1600;
const viewportHeight = 1000;

function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

main().catch(async (error) => {
  console.error('\n[map-builder-smoke] failed');
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

  mkdirSync(outDir, { recursive: true });

  const serverPort = await getFreePort();
  const webPort = await getFreePort();
  const debugPort = await getFreePort();
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const webOrigin = `http://127.0.0.1:${webPort}`;

  step('starting authoritative server');
  startProcess(
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
    timeoutMs: bootTimeoutMs,
  });

  step('starting Next UI');
  startProcess(
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
    { NEXT_PUBLIC_SERVER_URL: serverUrl },
  );
  await waitForHttp(`${webOrigin}/maps`, {
    label: '/maps',
    timeoutMs: bootTimeoutMs,
  });
  // A second `next dev` on this tree would have recompiled the client chunks
  // against its own server URL; fail now instead of on a mystery timeout.
  await assertWebUiTargetsServer(`${webOrigin}/maps`, serverUrl);

  step('launching headless browser');
  launchBrowser(browserPath, debugPort, {
    height: viewportHeight,
    width: viewportWidth,
  });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, {
    label: 'Chrome DevTools',
    timeoutMs: bootTimeoutMs,
  });

  // A session is created up front through the runtime page so "Publish to
  // table" has a real DM session to target.
  step('creating a runtime session for publishing');
  const runtimePage = await createCdpPage(debugPort, `${webOrigin}/runtime`);

  await runtimePage.send('Runtime.enable');
  await runtimePage.send('Page.enable');
  await waitForDocument(runtimePage, '/runtime');
  await runtimePage.evaluate(`(() => {
    localStorage.setItem('dnd-web.locale', 'en');
    window.location.reload();
    return true;
  })()`);
  await delay(2500);
  await waitFor(runtimePage, {
    label: 'cockpit hydrated',
    predicate: `Boolean(localStorage.getItem('dnd-runtime-cockpit'))`,
    timeoutMs: bootTimeoutMs,
  });
  await clickButton(runtimePage, 'DM Mode');
  await delay(500);
  await clickButton(runtimePage, 'Create Session');
  await waitFor(runtimePage, {
    label: 'session created',
    predicate: `(() => {
      const raw = localStorage.getItem('dnd-runtime-cockpit');
      if (!raw) return false;
      return Boolean(JSON.parse(raw).sessionId);
    })()`,
    timeoutMs: bootTimeoutMs,
  });

  const sessionId = await runtimePage.evaluate(
    `JSON.parse(localStorage.getItem('dnd-runtime-cockpit')).sessionId`,
  );

  console.log(`[map-builder-smoke] session ${sessionId}`);
  await runtimePage.close();

  step('opening the map builder');
  const page = await createCdpPage(debugPort, `${webOrigin}/maps`);

  try {
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 2,
      height: viewportHeight,
      mobile: false,
      width: viewportWidth,
    });
    await waitForDocument(page, '/maps');

    // Start from a clean map so the run does not inherit a previous document.
    await page.evaluate(`(() => {
      localStorage.removeItem('dnd-web.map-builder');
      localStorage.setItem('dnd-web.locale', 'en');
      window.location.reload();
      return true;
    })()`);
    await delay(3000);

    await waitFor(page, {
      label: 'map builder canvas',
      predicate: `Boolean(document.querySelector('[data-map-builder-canvas] canvas'))`,
      timeoutMs: bootTimeoutMs,
    });

    step('loading the Training Room preset');
    await clickButton(page, 'Training Room');
    await delay(800);
    await assertTerrain(page, 'preset loaded', (terrain) => {
      if (terrain.width !== 16 || terrain.height !== 12) {
        return `expected a 16x12 map, got ${terrain.width}x${terrain.height}`;
      }

      if (terrain.counts.wall_brick < 40) {
        return `expected the preset's brick walls, got ${terrain.counts.wall_brick}`;
      }

      return null;
    });
    await capture(page, '10-map-builder-preset');

    step('painting with the rectangle tool');
    await clickButton(page, 'Rectangle');
    await selectTile(page, 'Lava');
    await dragOnCanvas(page, { x: 0.35, y: 0.4 }, { x: 0.5, y: 0.6 });
    await delay(500);
    await assertTerrain(page, 'rectangle painted', (terrain) =>
      terrain.counts.lava > 0 ? null : 'expected lava cells after the drag',
    );

    const lavaAfterRectangle = await readTerrain(page);

    step('undo and redo');
    await clickButton(page, 'Undo');
    await delay(400);
    await assertTerrain(page, 'undo cleared the rectangle', (terrain) =>
      (terrain.counts.lava ?? 0) === 0
        ? null
        : `expected no lava after undo, got ${terrain.counts.lava}`,
    );

    await clickButton(page, 'Redo');
    await delay(400);
    await assertTerrain(page, 'redo restored the rectangle', (terrain) =>
      terrain.counts.lava === lavaAfterRectangle.counts.lava
        ? null
        : `expected ${lavaAfterRectangle.counts.lava} lava cells after redo, got ${terrain.counts.lava}`,
    );

    step('painting with the brush tool');
    await clickButton(page, 'Brush');
    await selectTile(page, 'Water');
    await dragOnCanvas(page, { x: 0.3, y: 0.75 }, { x: 0.62, y: 0.75 });
    await delay(500);
    await assertTerrain(page, 'brush stroke painted', (terrain) =>
      terrain.counts.water > 2
        ? null
        : `expected a run of water cells, got ${terrain.counts.water}`,
    );

    step('placing a prop');
    await clickButton(page, 'Props');
    await delay(300);
    await clickCanvas(page, { x: 0.42, y: 0.3 });
    await delay(500);
    await assertDocument(page, 'prop placed', (document) =>
      document.entities.length === 1
        ? null
        : `expected 1 prop, got ${document.entities.length}`,
    );
    await capture(page, '11-map-builder-painted');

    step('publishing the map to the runtime session');
    await clickButton(page, 'Publish to table');
    await waitFor(page, {
      label: 'publish result',
      predicate: `(() => {
        const text = document.body?.innerText ?? '';
        return text.includes('Published as scene') ||
          text.includes('Open the runtime table') ||
          text.includes('scene_') ||
          /error|failed/i.test(text);
      })()`,
      timeoutMs: bootTimeoutMs,
    });

    const publishText = await page.evaluate(`(() => {
      const node = document.querySelector('[role="status"]');
      return node ? node.textContent : '';
    })()`);

    if (!publishText.includes('Published as scene')) {
      throw new Error(`Publish did not succeed: ${publishText}`);
    }

    console.log(`[map-builder-smoke] ${publishText.trim()}`);
    await capture(page, '12-map-builder-published');

    // The published scene must exist on the authoritative server with the
    // painted terrain and the placed prop, not just in the browser.
    const sceneId = publishText.match(/scene_[a-z0-9-]+/i)?.[0];

    if (!sceneId) {
      throw new Error(`Could not read a scene id from: ${publishText}`);
    }

    step('verifying the published scene on the server');

    // Session-scoped commands need the participant credential the server issued
    // to this browser at create/join time. Read it out of the browser rather
    // than asserting `dm-001`: the server no longer takes a participant ID on
    // trust, which is the point of the credential.
    //
    // Read from the map builder page, not the runtime page - that one was closed
    // before the builder opened. Credentials live in `localStorage`, shared
    // across the origin, which is exactly why a DM can paint in `/maps` and
    // publish to the table they created in `/runtime`.
    const participantToken = await page.evaluate(
      `(() => {
        const stored = JSON.parse(
          localStorage.getItem('dnd-participant-credential') ?? '[]',
        );
        const match = stored.find(
          (candidate) =>
            candidate.sessionId === ${JSON.stringify(sessionId)} &&
            candidate.participantId === 'dm-001',
        );
        return match?.token ?? '';
      })()`,
    );

    if (!participantToken) {
      throw new Error(
        'The runtime tab holds no participant credential, so the published scene cannot be verified as the DM.',
      );
    }

    const sceneResponse = await fetch(`${serverUrl}/api/scenes/command`, {
      body: JSON.stringify({
        actor: { participantId: 'dm-001' },
        commandId: `map-builder-smoke-get-scene-${Date.now()}`,
        payload: { sceneId, sessionId },
        type: 'get_scene',
      }),
      headers: {
        'content-type': 'application/json',
        'x-dnd-participant-token': participantToken,
      },
      method: 'POST',
    });
    const scenePayload = await sceneResponse.json();

    if (!scenePayload.ok) {
      throw new Error(
        `get_scene failed: ${JSON.stringify(scenePayload.error ?? scenePayload)}`,
      );
    }

    const scene = scenePayload.data.scene;

    if (scene.grid.width !== 16 || scene.grid.height !== 12) {
      throw new Error(
        `published scene grid is ${scene.grid.width}x${scene.grid.height}, expected 16x12`,
      );
    }

    if (!scene.terrain || scene.terrain.runs.length < 2) {
      throw new Error('published scene is missing a painted terrain layer');
    }

    const publishedTiles = new Set(scene.terrain.runs.map((run) => run.tile));

    for (const expected of ['wall_brick', 'lava', 'water']) {
      if (!publishedTiles.has(expected)) {
        throw new Error(`published terrain is missing ${expected} tiles`);
      }
    }

    if (scene.entities.length !== 1) {
      throw new Error(
        `expected 1 published prop, got ${scene.entities.length}`,
      );
    }

    console.log(
      `[map-builder-smoke] server scene ${sceneId}: ${scene.terrain.runs.length} terrain runs, ${scene.entities.length} prop(s)`,
    );

    if (page.consoleErrors.length > 0) {
      console.log(
        `\n[map-builder-smoke] console errors (${page.consoleErrors.length}):`,
      );
      for (const message of page.consoleErrors.slice(0, 10)) {
        console.log(`  - ${message}`);
      }
    }

    console.log('\n[map-builder-smoke] passed');
  } finally {
    await page.close();
    await cleanup();
  }

  process.exit(0);
}

// A tab created through /json/new can still be on about:blank when the first
// evaluate lands, and about:blank has an opaque origin that denies storage.
async function waitForDocument(page, pathname) {
  await waitFor(page, {
    label: `${pathname} document`,
    predicate: `(() => {
      try {
        return location.pathname === ${JSON.stringify(pathname)} &&
          document.readyState !== 'loading' &&
          Boolean(window.localStorage);
      } catch {
        return false;
      }
    })()`,
    timeoutMs: bootTimeoutMs,
  });
}

let stepIndex = 0;

function step(label) {
  stepIndex += 1;
  console.log(`[map-builder-smoke] step ${stepIndex}: ${label}`);
}

async function selectTile(page, label) {
  await page.evaluate(`(() => {
    const label = ${JSON.stringify(label)};
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.getAttribute('aria-label') === label,
    );

    if (!button) {
      throw new Error('Tile swatch not found: ' + label);
    }

    button.click();
    return true;
  })()`);
  await delay(200);
}

async function canvasRect(page) {
  return page.evaluate(`(() => {
    const node = document.querySelector('[data-map-builder-canvas]');
    const rect = node.getBoundingClientRect();
    return {
      height: rect.height,
      left: rect.left,
      top: rect.top,
      width: rect.width,
    };
  })()`);
}

async function clickCanvas(page, at) {
  const rect = await canvasRect(page);
  const x = Math.round(rect.left + rect.width * at.x);
  const y = Math.round(rect.top + rect.height * at.y);

  await dispatchPointer(page, 'mousePressed', x, y);
  await dispatchPointer(page, 'mouseReleased', x, y);
}

async function dragOnCanvas(page, from, to) {
  const rect = await canvasRect(page);
  const startX = Math.round(rect.left + rect.width * from.x);
  const startY = Math.round(rect.top + rect.height * from.y);
  const endX = Math.round(rect.left + rect.width * to.x);
  const endY = Math.round(rect.top + rect.height * to.y);

  await dispatchPointer(page, 'mousePressed', startX, startY);

  const steps = 8;

  for (let index = 1; index <= steps; index += 1) {
    await dispatchPointer(
      page,
      'mouseMoved',
      Math.round(startX + ((endX - startX) * index) / steps),
      Math.round(startY + ((endY - startY) * index) / steps),
    );
    await delay(30);
  }

  await dispatchPointer(page, 'mouseReleased', endX, endY);
}

function dispatchPointer(page, type, x, y) {
  return page.send('Input.dispatchMouseEvent', {
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mouseMoved' ? 0 : 1,
    pointerType: 'mouse',
    type,
    x,
    y,
  });
}

async function readTerrain(page) {
  const raw = await page.evaluate(
    `localStorage.getItem('dnd-web.map-builder')`,
  );

  if (!raw) {
    throw new Error('The map builder has not persisted a document yet.');
  }

  const { document } = JSON.parse(raw);
  const counts = {};

  for (const run of document.terrain.runs) {
    counts[run.tile] = (counts[run.tile] ?? 0) + run.length;
  }

  return {
    counts,
    height: document.grid.height,
    width: document.grid.width,
  };
}

async function assertTerrain(page, label, check) {
  const terrain = await readTerrain(page);
  const failure = check(terrain);

  if (failure) {
    throw new Error(`${label}: ${failure}`);
  }

  console.log(`[map-builder-smoke]   ok - ${label}`);
}

async function assertDocument(page, label, check) {
  const raw = await page.evaluate(
    `localStorage.getItem('dnd-web.map-builder')`,
  );
  const { document } = JSON.parse(raw);
  const failure = check(document);

  if (failure) {
    throw new Error(`${label}: ${failure}`);
  }

  console.log(`[map-builder-smoke]   ok - ${label}`);
}

async function capture(page, name) {
  const result = await page.send('Page.captureScreenshot', { format: 'png' });

  writeFileSync(
    resolve(outDir, `${name}.png`),
    Buffer.from(result.data, 'base64'),
  );
  console.log(`[map-builder-smoke]   captured ${name}`);
}
