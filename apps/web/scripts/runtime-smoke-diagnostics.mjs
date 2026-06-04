const defaultTextLimit = 2000;

export function formatSmokeStep({ index, label, total }) {
  return `[runtime-smoke] ${index}/${total} ${label}`;
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
