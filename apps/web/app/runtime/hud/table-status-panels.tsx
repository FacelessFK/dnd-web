'use client';

/**
 * Panels that answer "is this table ready" for the GM.
 *
 * Both render a checklist the pure helpers produced. Nothing here decides
 * whether a step is done - that judgement lives in `runtime-cockpit-helpers`
 * with its own tests, and these only choose the words and the colour.
 */
import type {
  DmTableSetupChecklist,
  RecoveryReliabilitySummary,
  RuntimeNoticeTone,
} from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { Panel, StatusBadge } from './hud-primitives';

export function DmTableSetupPanel({
  checklist,
  t,
}: {
  checklist: DmTableSetupChecklist;
  t: RuntimeTranslator;
}) {
  const nextAction =
    checklist.items.find((item) => item.status !== 'done') ?? null;

  return (
    <Panel
      description={`${t('runtime.statusOverview.readinessProgress', {
        completed: String(checklist.completedCount),
        total: String(checklist.totalCount),
      })}. ${
        nextAction
          ? getDmTableSetupItemDetail(nextAction, t)
          : t('runtime.tableSetup.readyForPlay')
      }`}
      eyebrow={t('runtime.tableSetup.eyebrow')}
      title={t('runtime.tableSetup.title')}
      tone="dm"
    >
      <ol className="grid gap-2">
        {checklist.items.map((item) => {
          const tone = getDmTableSetupItemTone(item.status);
          const label = getDmTableSetupItemLabel(item.status, t);

          return (
            <li
              className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-amber-500/15 bg-black/20 p-3"
              key={item.id}
            >
              <StatusBadge label={label} tone={tone} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-50">
                  {getDmTableSetupItemTitle(item, t)}
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-100/60">
                  {getDmTableSetupItemDetail(item, t)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function getDmTableSetupItemLabel(
  status: DmTableSetupChecklist['items'][number]['status'],
  t: RuntimeTranslator,
): string {
  const labels: Record<
    DmTableSetupChecklist['items'][number]['status'],
    string
  > = {
    blocked: t('runtime.tableSetup.status.blocked'),
    done: t('runtime.tableSetup.status.done'),
    ready: t('runtime.tableSetup.status.ready'),
  };

  return labels[status];
}

export function getDmTableSetupItemTitle(
  item: DmTableSetupChecklist['items'][number],
  t: RuntimeTranslator,
): string {
  switch (item.id) {
    case 'characters':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.characters.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.characters.ready')
          : t('runtime.tableSetup.item.characters.blocked');
    case 'encounter':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.encounter.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.encounter.ready')
          : t('runtime.tableSetup.item.encounter.blocked');
    case 'placement':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.placement.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.placement.ready')
          : t('runtime.tableSetup.item.placement.blocked');
    case 'players':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.players.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.players.ready')
          : t('runtime.tableSetup.item.players.blocked');
    case 'scene':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.scene.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.scene.ready')
          : t('runtime.tableSetup.item.scene.blocked');
    case 'session':
      return item.status === 'done'
        ? t('runtime.tableSetup.item.session.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.item.session.ready')
          : t('runtime.tableSetup.item.session.blocked');
  }
}

export function getDmTableSetupItemDetail(
  item: DmTableSetupChecklist['items'][number],
  t: RuntimeTranslator,
): string {
  switch (item.id) {
    case 'characters':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.characters.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.characters.ready')
          : t('runtime.tableSetup.detail.characters.blocked');
    case 'encounter':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.encounter.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.encounter.ready')
          : t('runtime.tableSetup.detail.encounter.blocked');
    case 'placement':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.placement.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.placement.ready')
          : t('runtime.tableSetup.detail.placement.blocked');
    case 'players':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.players.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.players.ready')
          : t('runtime.tableSetup.detail.players.blocked');
    case 'scene':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.scene.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.scene.ready')
          : t('runtime.tableSetup.detail.scene.blocked');
    case 'session':
      return item.status === 'done'
        ? t('runtime.tableSetup.detail.session.done')
        : item.status === 'ready'
          ? t('runtime.tableSetup.detail.session.ready')
          : t('runtime.tableSetup.detail.session.blocked');
  }
}

export function getDmTableSetupItemTone(
  status: DmTableSetupChecklist['items'][number]['status'],
): RuntimeNoticeTone {
  const tones: Record<
    DmTableSetupChecklist['items'][number]['status'],
    RuntimeNoticeTone
  > = {
    blocked: 'info',
    done: 'success',
    ready: 'warning',
  };

  return tones[status];
}

export function RecoveryReliabilityPanel({
  summary,
  t,
}: {
  summary: RecoveryReliabilitySummary;
  t: RuntimeTranslator;
}) {
  return (
    <Panel
      description={getRecoveryReliabilitySummaryDetail(summary, t)}
      eyebrow={t('runtime.recovery.eyebrow')}
      title={t('runtime.recovery.title')}
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge
            label={getRecoveryReliabilityStatusLabel(summary.status, t)}
            tone={getRecoveryReliabilityStatusTone(summary.status)}
          />
          <StatusBadge
            label={t('runtime.recovery.progress', {
              loaded: String(summary.loadedCount),
              total: String(summary.totalCount),
            })}
            tone={getRecoveryReliabilityStatusTone(summary.status)}
          />
        </div>
        <ol className="grid gap-2">
          {summary.items.map((item) => (
            <li
              className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-amber-500/15 bg-black/20 p-3"
              key={item.id}
            >
              <StatusBadge
                label={getRecoveryReliabilityItemLabel(item.status, t)}
                tone={getRecoveryReliabilityItemTone(item.status)}
              />
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-50">
                  {getRecoveryReliabilityItemTitle(item, t)}
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-100/60">
                  {getRecoveryReliabilityItemDetail(item, t)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {summary.notes.length ? (
          <div className="rounded-xl border border-amber-300/15 bg-amber-950/15 p-3 text-xs leading-5 text-amber-100/75">
            <p className="font-bold text-amber-100">
              {t('runtime.recovery.notes')}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {summary.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function getRecoveryReliabilityStatusLabel(
  status: RecoveryReliabilitySummary['status'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'empty':
      return t('runtime.recovery.empty');
    case 'partial':
      return t('runtime.recovery.partial');
    case 'recovered':
      return t('runtime.recovery.recovered');
  }
}

export function getRecoveryReliabilitySummaryDetail(
  summary: RecoveryReliabilitySummary,
  t: RuntimeTranslator,
): string {
  const noteText = summary.notes.length
    ? ` ${t('runtime.recovery.detail.notes', {
        count: String(summary.notes.length),
      })}`
    : '';

  if (summary.status === 'empty') {
    return t('runtime.recovery.detail.empty');
  }

  if (summary.status === 'recovered') {
    return `${t('runtime.recovery.detail.recovered', {
      loaded: String(summary.loadedCount),
      total: String(summary.totalCount),
    })}${noteText}`;
  }

  return `${t('runtime.recovery.detail.partial', {
    loaded: String(summary.loadedCount),
    total: String(summary.totalCount),
  })}${noteText}`;
}

export function getRecoveryReliabilityStatusTone(
  status: RecoveryReliabilitySummary['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'empty':
      return 'info';
    case 'partial':
      return 'warning';
    case 'recovered':
      return 'success';
  }
}

export function getRecoveryReliabilityItemLabel(
  status: RecoveryReliabilitySummary['items'][number]['status'],
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'missing':
      return t('runtime.recovery.missing');
    case 'optional_missing':
      return t('runtime.recovery.optional');
    case 'recovered':
      return t('runtime.recovery.loaded');
  }
}

export function getRecoveryReliabilityItemTitle(
  item: RecoveryReliabilitySummary['items'][number],
  t: RuntimeTranslator,
): string {
  return t(
    `runtime.recovery.item.${item.id}.title` as Parameters<RuntimeTranslator>[0],
  );
}

export function getRecoveryReliabilityItemDetail(
  item: RecoveryReliabilitySummary['items'][number],
  t: RuntimeTranslator,
): string {
  return t(
    `runtime.recovery.item.${item.id}.${item.status}` as Parameters<RuntimeTranslator>[0],
  );
}

export function getRecoveryReliabilityItemTone(
  status: RecoveryReliabilitySummary['items'][number]['status'],
): RuntimeNoticeTone {
  switch (status) {
    case 'missing':
      return 'warning';
    case 'optional_missing':
      return 'info';
    case 'recovered':
      return 'success';
  }
}
