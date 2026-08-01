const defaultTextLimit = 2000;

export function formatSmokeStep({ index, label, total }) {
  return `[runtime-smoke] ${index}/${total} ${label}`;
}

// The harnesses run headless so CI and the default local commands stay
// unchanged. Setting RUNTIME_SMOKE_HEADED=1 opens a real window instead, which
// is the only way to watch a two-profile run happen. Five harnesses launch
// Chrome, so the decision lives here once and is unit-tested rather than
// duplicated five times.
export function isHeadedSmokeRun(env = process.env) {
  const raw = (env.RUNTIME_SMOKE_HEADED ?? '').trim().toLowerCase();

  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * Next inlines `NEXT_PUBLIC_SERVER_URL` into the compiled client chunks, and
 * every harness compiles into the same `apps/web/.next`. A second `next dev` on
 * this working tree - a leftover server from a killed run, a developer's
 * `pnpm dev`, or a second harness - recompiles those chunks against ITS server
 * URL. The harness's own browser then posts commands to a port owned by a
 * different (or already dead) server and fails with "Failed to fetch", which
 * surfaces as a wait timing out on state that was never going to arrive.
 *
 * The page renders the server URL it will actually call, so the served page is
 * the authoritative check. Asserting it up front turns that silent mis-wiring
 * into an immediate, named failure instead of a flake.
 */
export function findMismatchedHarnessServerUrl(pageHtml, expectedServerUrl) {
  const origins = new Set(
    (pageHtml.match(/https?:\/\/127\.0\.0\.1:\d+/g) ?? []).filter(
      (origin) => origin !== expectedServerUrl,
    ),
  );

  if (!pageHtml.includes(expectedServerUrl) && origins.size === 0) {
    // No origin rendered at all: nothing to contradict the expectation.
    return null;
  }

  if (pageHtml.includes(expectedServerUrl)) {
    return null;
  }

  return [...origins][0] ?? null;
}

export function formatHarnessServerUrlMismatch(expectedServerUrl, foundUrl) {
  return [
    `The web UI is wired to ${foundUrl}, not this run's server ${expectedServerUrl}.`,
    'Another `next dev` on this working tree recompiled apps/web/.next with its',
    'own NEXT_PUBLIC_SERVER_URL. Stop any other dev server or harness (including',
    'leftovers from a killed run) and try again.',
  ].join('\n');
}

/**
 * Fails fast when the served page is wired to a different server than this run
 * started. Call once the web server answers and before driving any UI.
 */
export async function assertWebUiTargetsServer(pageUrl, expectedServerUrl) {
  const response = await fetch(pageUrl);
  const html = await response.text();
  const mismatch = findMismatchedHarnessServerUrl(html, expectedServerUrl);

  if (mismatch) {
    throw new Error(
      formatHarnessServerUrlMismatch(expectedServerUrl, mismatch),
    );
  }
}

export function getChromeDisplayArgs({
  env = process.env,
  windowPosition,
  windowSize,
} = {}) {
  if (!isHeadedSmokeRun(env)) {
    return ['--headless=new'];
  }

  const args = [];

  // Only ever set when asked for. Chrome picks its own backend otherwise, and
  // hardcoding one here would break every machine whose session is not the one
  // guessed - a headed run on X11 given `wayland` does not fall back, it fails
  // to open a window at all.
  const ozonePlatform = (env.RUNTIME_SMOKE_OZONE_PLATFORM ?? '').trim();

  if (ozonePlatform) {
    args.push(`--ozone-platform=${ozonePlatform}`);
  }

  if (windowSize) {
    args.push(`--window-size=${windowSize.width},${windowSize.height}`);
  }

  if (windowPosition) {
    args.push(`--window-position=${windowPosition.x},${windowPosition.y}`);
  }

  return args;
}

export function formatSmokeWaitFailure({
  diagnostics,
  label,
  lastErrorMessage,
}) {
  const sections = [`Timed out waiting for ${label}.`];

  if (lastErrorMessage) {
    sections.push(`Last evaluation error: ${lastErrorMessage}`);
  }

  if (diagnostics?.url) {
    sections.push(`Current URL: ${diagnostics.url}`);
  }

  if (diagnostics?.cockpitState) {
    sections.push(`Cockpit state: ${diagnostics.cockpitState}`);
  }

  if (diagnostics?.enabledButtons?.length) {
    sections.push(`Enabled buttons: ${diagnostics.enabledButtons.join(', ')}`);
  }

  sections.push(`Visible page text:\n${diagnostics?.visibleText ?? ''}`);

  return sections.join('\n');
}

export function getPageDiagnosticsExpression(
  storageKey,
  textLimit = defaultTextLimit,
) {
  return `(() => {
    const enabledButtons = [...document.querySelectorAll('button')]
      .filter((candidate) => !candidate.disabled && candidate.getClientRects().length > 0)
      .map((candidate) => candidate.textContent?.replace(/\\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 24);

    return {
      enabledButtons,
      rawCockpitState: localStorage.getItem(${JSON.stringify(storageKey)}),
      url: window.location.href,
      visibleText: (document.body?.innerText ?? '').slice(0, ${Number(textLimit)}),
    };
  })()`;
}

export function getAbsentVisibleTextsExpression(texts) {
  return `(() => {
    const bodyText = document.body?.innerText ?? '';
    return ${JSON.stringify(texts)}.every((text) => !bodyText.includes(text));
  })()`;
}

export function getAbsentVisibleTextsOutsideSelectorExpression(
  texts,
  ignoredSelector,
) {
  return `(() => {
    const body = document.body;

    if (!body) {
      return true;
    }

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;

        if (!parent || parent.closest(${JSON.stringify(ignoredSelector)})) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          typeof parent.getClientRects === 'function' &&
          parent.getClientRects().length === 0
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let bodyText = '';

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      bodyText += node.nodeValue ?? '';
    }

    return ${JSON.stringify(texts)}.every((text) => !bodyText.includes(text));
  })()`;
}

export function getPresentVisibleTextsExpression(texts) {
  return `(() => {
    const bodyText = document.body?.innerText ?? '';
    return ${JSON.stringify(texts)}.every((text) => bodyText.includes(text));
  })()`;
}

export function getStoredCockpitSessionIdExpression(storageKey) {
  return `(() => {
    const raw = localStorage.getItem(${JSON.stringify(storageKey)});

    if (!raw) {
      return '';
    }

    const state = JSON.parse(raw);
    return typeof state?.sessionId === 'string' ? state.sessionId : '';
  })()`;
}

/**
 * The cockpit reads its persisted local state in a mount effect, so any remount
 * replays that stored state over whatever the page currently shows. Next's dev
 * server compiles `/runtime` on demand, and a compile that lands while a
 * harness is already driving the page remounts the cockpit and silently
 * discards the click it just made - the mode toggle springs back and the button
 * the next step waits for never appears. That is the whole flake: the run dies
 * much later, on a wait that looks unrelated.
 *
 * Confirming the mode against the stored state, and re-clicking when it has
 * reverted, makes the step converge instead of depending on compile timing.
 */
export function getCockpitModeSelectionExpression(
  storageKey,
  labels,
  expectedMode,
) {
  return `(() => {
    const raw = localStorage.getItem(${JSON.stringify(storageKey)});

    if (raw) {
      try {
        if (JSON.parse(raw).mode === ${JSON.stringify(expectedMode)}) {
          return true;
        }
      } catch {
        // Fall through and re-click; a corrupt blob is not a selected mode.
      }
    }

    const labels = ${JSON.stringify(labels)};
    const button = [...document.querySelectorAll('button')].find(
      (candidate) =>
        !candidate.disabled &&
        candidate.offsetParent !== null &&
        labels.some((label) =>
          (candidate.textContent ?? '').trim().includes(label),
        ),
    );

    if (button) {
      button.click();
    }

    return false;
  })()`;
}

export function getSessionInputAssignmentExpression(sessionId) {
  return `(() => {
    const sessionLabels = ['Session ID', 'شناسه Session'];
    const sessionPlaceholders = [
      'Paste an existing session ID',
      'شناسه Session موجود',
    ];
    const input =
      [...document.querySelectorAll('label')]
        .find((candidate) =>
          sessionLabels.some((label) => candidate.textContent?.includes(label)),
        )
        ?.querySelector('input') ??
      [...document.querySelectorAll('input')].find((candidate) =>
        sessionPlaceholders.some((placeholder) =>
          candidate.getAttribute('placeholder')?.includes(placeholder),
        ),
      );

    if (!input) {
      return false;
    }

    const value = ${JSON.stringify(sessionId)};
    const valueSetter =
      Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value')?.set ??
      (typeof HTMLInputElement === 'function'
        ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        : undefined);

    if (valueSetter) {
      valueSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return input.value === value;
  })()`;
}

export function normalizePageDiagnostics(rawDiagnostics) {
  return {
    cockpitState: summarizeCockpitState(rawDiagnostics?.rawCockpitState),
    enabledButtons: Array.isArray(rawDiagnostics?.enabledButtons)
      ? rawDiagnostics.enabledButtons
      : [],
    url:
      typeof rawDiagnostics?.url === 'string' ? rawDiagnostics.url : 'unknown',
    visibleText:
      typeof rawDiagnostics?.visibleText === 'string'
        ? rawDiagnostics.visibleText
        : '',
  };
}

export function summarizeCockpitState(rawCockpitState) {
  if (!rawCockpitState) {
    return 'empty';
  }

  let state;

  try {
    state = JSON.parse(rawCockpitState);
  } catch {
    return `unparseable: ${truncateForSummary(rawCockpitState)}`;
  }

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return `unexpected: ${truncateForSummary(rawCockpitState)}`;
  }

  const summaryFields = [
    'sessionId',
    'sceneId',
    'roleMode',
    'selectedParticipantId',
  ];
  const summary = summaryFields
    .filter((field) => state[field])
    .map((field) => `${field}=${state[field]}`);

  if (summary.length) {
    return summary.join(', ');
  }

  return `keys=${Object.keys(state).sort().join(', ') || 'none'}`;
}

function truncateForSummary(value, limit = 160) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1)}...`;
}
