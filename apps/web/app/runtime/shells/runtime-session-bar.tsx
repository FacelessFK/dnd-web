'use client';

/**
 * The seat controls, in one compact strip.
 *
 * Shared by the entry surface and both shells so "create, join, recover,
 * subscribe, reset" never drift apart between them. What differs by role is
 * only which primary action is offered - a GM creates a table, a player joins
 * one - and that is a single branch rather than two copies.
 *
 * Participant identifiers are deliberately absent. A player needs the session
 * code, which they typed in themselves; they never need to see or edit a
 * participant ID, and putting one on their screen would publish an identifier
 * the server works to keep out of their projection. The GM's identity fields
 * live in the GM tool region instead.
 */
import type { RuntimeMode } from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { ActionButton, ModeButton } from '../hud/hud-primitives';
import { LabeledInput } from '../hud/hud-fields';

export type RuntimeSessionBarProps = {
  busyReason: string | null;
  joinDisabledReason: string | null;
  mode: RuntimeMode;
  onCreateSession: () => void | Promise<void>;
  onJoinSession: () => void | Promise<void>;
  onLocalReset: () => void;
  onRecover: () => void | Promise<void>;
  onSessionIdChange: (value: string) => void;
  onSwitchMode: (mode: RuntimeMode) => void;
  onToggleSubscription: () => void;
  recoverDisabledReason: string | null;
  sessionId: string;
  streamEnabled: boolean;
  t: RuntimeTranslator;
};

export function RuntimeSessionBar({
  busyReason,
  joinDisabledReason,
  mode,
  onCreateSession,
  onJoinSession,
  onLocalReset,
  onRecover,
  onSessionIdChange,
  onSwitchMode,
  onToggleSubscription,
  recoverDisabledReason,
  sessionId,
  streamEnabled,
  t,
}: RuntimeSessionBarProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-[auto_minmax(160px,240px)_minmax(0,1fr)] lg:items-end">
      <div
        className="grid grid-cols-2 gap-2"
        role="group"
        aria-label={t('runtime.session.roleGroup')}
      >
        <ModeButton
          active={mode === 'dm'}
          label={t('runtime.mode.dm')}
          onClick={() => onSwitchMode('dm')}
          tone="dm"
        />
        <ModeButton
          active={mode === 'player'}
          label={t('runtime.mode.player')}
          onClick={() => onSwitchMode('player')}
          tone="player"
        />
      </div>

      <LabeledInput
        label={t('runtime.session.sessionId')}
        onChange={onSessionIdChange}
        placeholder={t('runtime.session.sessionIdPlaceholder')}
        testId="runtime-session-id"
        value={sessionId}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {mode === 'dm' ? (
          <ActionButton
            disabled={Boolean(busyReason)}
            disabledReason={busyReason ?? undefined}
            label={t('runtime.session.create')}
            onClick={onCreateSession}
          />
        ) : (
          <ActionButton
            disabled={Boolean(joinDisabledReason)}
            disabledReason={joinDisabledReason ?? undefined}
            label={t('runtime.session.join')}
            onClick={onJoinSession}
          />
        )}
        <ActionButton
          disabled={Boolean(recoverDisabledReason)}
          disabledReason={recoverDisabledReason ?? undefined}
          label={t('runtime.session.recover')}
          onClick={onRecover}
          variant="secondary"
        />
        <ActionButton
          disabled={!sessionId}
          disabledReason={
            sessionId ? undefined : t('runtime.disabled.missingSession')
          }
          label={
            streamEnabled
              ? t('runtime.session.disconnectSse')
              : t('runtime.session.subscribeSse')
          }
          onClick={onToggleSubscription}
          variant={streamEnabled ? 'danger' : 'secondary'}
        />
        <ActionButton
          disabled={Boolean(busyReason)}
          disabledReason={busyReason ?? undefined}
          label={t('runtime.session.localReset')}
          onClick={onLocalReset}
          variant="danger"
        />
      </div>
    </div>
  );
}
