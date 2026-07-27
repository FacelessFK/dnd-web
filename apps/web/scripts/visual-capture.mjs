#!/usr/bin/env node
// Boots the local server + web app, drives the Training Room demo, and writes
// PNG screenshots for visual review of the tactical surfaces.
//
// This is a review aid, not an assertion harness: it fails on navigation or
// timeout problems, but it does not judge pixels. Use it to look at the real
// product surface after a UI change.
//
//   node apps/web/scripts/visual-capture.mjs [--out DIR] [--locale en|fa]
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

const args = process.argv.slice(2);
const outDir = resolve(
  repoRoot,
  readFlag('--out') ?? 'apps/web/.visual-capture',
);
const locale = readFlag('--locale') ?? 'en';
const viewportWidth = Number.parseInt(readFlag('--width') ?? '1600', 10);
const viewportHeight = Number.parseInt(readFlag('--height') ?? '1000', 10);
const bootTimeoutMs = 180000;

function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

main().catch(async (error) => {
  console.error('\n[visual-capture] failed');
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

  console.log('[visual-capture] starting authoritative server');
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

  console.log('[visual-capture] starting Next runtime UI');
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
  await waitForHttp(`${webOrigin}/runtime`, {
    label: '/runtime',
    timeoutMs: bootTimeoutMs,
  });

  console.log('[visual-capture] launching headless browser');
  launchBrowser(browserPath, debugPort, {
    height: viewportHeight,
    width: viewportWidth,
  });
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, {
    label: 'Chrome DevTools',
    timeoutMs: bootTimeoutMs,
  });

  const page = await createCdpPage(debugPort, `${webOrigin}/runtime`);

  try {
    await page.send('Runtime.enable');
    await page.send('Page.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      deviceScaleFactor: 2,
      height: viewportHeight,
      mobile: false,
      width: viewportWidth,
    });

    await waitFor(page, {
      label: 'runtime shell',
      predicate: `Boolean(document.querySelector('main, body > div'))`,
      timeoutMs: bootTimeoutMs,
    });
    await page.evaluate(`(() => {
      localStorage.setItem('dnd-web.locale', ${JSON.stringify(locale)});
      window.location.reload();
      return true;
    })()`);
    await delay(2500);
    await waitFor(page, {
      label: 'cockpit hydrated',
      predicate: `Boolean(localStorage.getItem('dnd-runtime-cockpit'))`,
      timeoutMs: bootTimeoutMs,
    });

    await capture(page, '01-landing');

    await clickButton(page, locale === 'fa' ? 'حالت DM' : 'DM Mode');
    await delay(600);
    await capture(page, '02-dm-mode');

    console.log('[visual-capture] running Training Room demo');
    await clickButton(
      page,
      locale === 'fa'
        ? 'اجرای درگیری اتاق تمرین'
        : 'Run Training Room Skirmish',
    );
    await waitFor(page, {
      label: 'demo scene ready',
      predicate: `(() => {
        const raw = localStorage.getItem('dnd-runtime-cockpit');
        if (!raw) return false;
        const state = JSON.parse(raw);
        return Boolean(state.sessionId && state.sceneId);
      })()`,
      timeoutMs: bootTimeoutMs,
    });
    await delay(1500);
    await capture(page, '03-scene-active');
    await captureBoard(page, '03b-board');

    await clickButton(page, locale === 'fa' ? 'شروع' : 'Start Encounter');
    await delay(2000);
    await capture(page, '04-encounter');
    await captureBoard(page, '04b-board-encounter');

    if (page.consoleErrors.length > 0) {
      console.log(
        `\n[visual-capture] console errors (${page.consoleErrors.length}):`,
      );
      for (const message of page.consoleErrors.slice(0, 15)) {
        console.log(`  - ${message}`);
      }
    }

    console.log(`\n[visual-capture] screenshots written to ${outDir}`);
  } finally {
    await page.close();
    await cleanup();
  }

  process.exit(0);
}

async function capture(page, name) {
  // Keep the board anchored in frame so full-page captures stay comparable.
  await page.evaluate(`(() => {
    const node = document.querySelector('[data-tactical-map]') ??
      document.querySelector('[role="grid"]');
    if (node) {
      node.scrollIntoView({ block: 'center' });
    } else {
      window.scrollTo(0, 0);
    }
    return true;
  })()`);
  await delay(400);

  const result = await page.send('Page.captureScreenshot', {
    captureBeyondViewport: false,
    format: 'png',
  });
  const target = resolve(outDir, `${name}.png`);

  writeFileSync(target, Buffer.from(result.data, 'base64'));
  console.log(`[visual-capture] captured ${name}`);
}

// Captures just the tactical board region so board work can be reviewed without
// the surrounding cockpit chrome dominating the image.
async function captureBoard(page, name) {
  const box = await page.evaluate(`(() => {
    const node =
      document.querySelector('[data-tactical-map]') ??
      document.querySelector('[role="grid"]');

    if (!node) {
      return null;
    }

    const rect = node.getBoundingClientRect();

    // Page.captureScreenshot clips in document coordinates, so fold in scroll.
    return {
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
    };
  })()`);

  if (!box || box.width < 8 || box.height < 8) {
    console.log(`[visual-capture] skipped ${name} (no board region found)`);
    return;
  }

  const result = await page.send('Page.captureScreenshot', {
    clip: { ...box, scale: 2 },
    captureBeyondViewport: true,
    format: 'png',
  });
  const target = resolve(outDir, `${name}.png`);

  writeFileSync(target, Buffer.from(result.data, 'base64'));
  console.log(`[visual-capture] captured ${name}`);
}
