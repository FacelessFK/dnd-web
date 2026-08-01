'use client';

/**
 * The shell's shared visual vocabulary.
 *
 * These are the pieces every runtime surface is built from - a framed panel, a
 * button that explains why it is disabled, a status chip, a notice. They are
 * deliberately dumb: no state, no commands, no knowledge of a session. Keeping
 * them here is what lets the Player and GM shells look like one product without
 * either importing the other.
 */
import type { ReactNode } from 'react';

import type { RuntimeNoticeTone } from '../../../lib/runtime-cockpit-helpers';

export function Panel({
  children,
  description,
  eyebrow,
  title,
  tone = 'neutral',
}: {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
  tone?: 'danger' | 'dm' | 'neutral' | 'player';
}) {
  const accents = {
    danger: 'border-red-400/25 from-red-950/30',
    dm: 'border-amber-400/30 from-amber-950/25',
    neutral: 'border-amber-500/20 from-stone-950/30',
    player: 'border-sky-300/25 from-sky-950/25',
  }[tone];
  const accentLine = {
    danger: 'from-red-300/70 via-red-300/20',
    dm: 'from-amber-300/80 via-amber-300/20',
    neutral: 'from-amber-300/70 via-amber-300/20',
    player: 'from-sky-200/70 via-sky-200/20',
  }[tone];
  const eyebrowColor = {
    danger: 'text-red-200/80',
    dm: 'text-amber-300/75',
    neutral: 'text-amber-300/70',
    player: 'text-sky-200/75',
  }[tone];
  const headerDivider = {
    danger: 'border-red-300/10',
    dm: 'border-amber-300/10',
    neutral: 'border-amber-500/10',
    player: 'border-sky-300/10',
  }[tone];

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br ${accents} to-[#1c130d]/90 p-4 shadow-xl shadow-black/25 ring-1 ring-white/5 backdrop-blur`}
    >
      <div
        className={`pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r ${accentLine} to-transparent`}
      />
      <div className={`mb-4 border-b ${headerDivider} pb-3`}>
        {eyebrow ? (
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.2em] ${eyebrowColor}`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 text-lg font-black tracking-tight text-amber-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-amber-100/65">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function ActionButton({
  disabled,
  disabledReason,
  label,
  onClick,
  testId,
  variant = 'primary',
}: {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onClick: () => void | Promise<void>;
  /**
   * Stable hook for browser harnesses.
   *
   * Several controls share a label - two "Delete" buttons, four "Name / label"
   * fields - so matching on visible text picks whichever renders first. That is
   * how an acceptance harness ends up silently driving the wrong panel.
   */
  testId?: string;
  variant?: 'danger' | 'primary' | 'secondary';
}) {
  const styles = {
    danger:
      'border-red-400/45 bg-red-900/80 text-red-50 shadow-red-950/30 hover:bg-red-800 disabled:border-red-400/10 disabled:bg-red-950/20 disabled:text-red-100/35',
    primary:
      'border-amber-300/55 bg-amber-400 text-stone-950 shadow-amber-950/40 hover:bg-amber-300 disabled:border-amber-300/10 disabled:bg-amber-950/20 disabled:text-amber-100/35',
    secondary:
      'border-amber-300/25 bg-[#2d2017] text-amber-50 hover:border-amber-200/55 hover:bg-[#3c2a1d] disabled:border-amber-300/10 disabled:bg-black/20 disabled:text-amber-100/35',
  }[variant];

  return (
    <button
      className={`min-h-10 rounded-xl border px-3 py-2 text-sm font-bold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${styles}`}
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        void onClick();
      }}
      title={disabled ? disabledReason : undefined}
      type="button"
    >
      {label}
      {disabled && disabledReason ? (
        <span className="sr-only">: {disabledReason}</span>
      ) : null}
    </button>
  );
}

export function ModeButton({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone: 'dm' | 'player';
}) {
  const activeStyles =
    tone === 'dm'
      ? 'border-amber-300 bg-amber-300 text-stone-950 shadow-amber-950/40'
      : 'border-sky-200 bg-sky-300 text-slate-950 shadow-sky-950/40';

  return (
    <button
      className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-black transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
        active
          ? activeStyles
          : 'border-amber-400/20 bg-black/20 text-amber-100/75 hover:border-amber-300/45 hover:text-amber-50'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-amber-100/55">{label}</dt>
      <dd className="break-all text-end font-semibold text-amber-50" dir="auto">
        {value}
      </dd>
    </div>
  );
}

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: RuntimeNoticeTone;
}) {
  const styles = {
    danger: 'border-red-300/30 bg-red-950/35 text-red-100',
    info: 'border-sky-200/25 bg-sky-950/25 text-sky-100',
    success: 'border-emerald-200/25 bg-emerald-950/25 text-emerald-100',
    warning: 'border-amber-200/30 bg-amber-950/35 text-amber-100',
  }[tone];

  return (
    <span
      className={`inline-flex min-h-9 items-center justify-center rounded-full border px-3 py-1 text-center text-xs font-bold uppercase tracking-[0.12em] ${styles}`}
    >
      {label}
    </span>
  );
}

export function Notice({
  children,
  title,
  tone,
}: {
  children: ReactNode;
  title: string;
  tone: RuntimeNoticeTone;
}) {
  const styles = {
    danger: 'border-red-300/35 bg-red-950/45 text-red-50',
    info: 'border-sky-200/25 bg-sky-950/35 text-sky-50',
    success: 'border-emerald-200/25 bg-emerald-950/35 text-emerald-50',
    warning: 'border-amber-200/35 bg-amber-950/45 text-amber-50',
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      <p className="font-bold">{title}</p>
      <div className="mt-1 leading-6 opacity-90">{children}</div>
    </div>
  );
}

export function EmptyState({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-amber-300/20 bg-black/20 p-4 text-sm">
      <p className="font-bold text-amber-100">{title}</p>
      <p className="mt-1 leading-5 text-amber-100/60">{detail}</p>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-500/15 bg-black/25 px-2 py-2">
      <dt className="text-xs text-amber-100/50">{label}</dt>
      <dd className="font-black text-amber-50">{value}</dd>
    </div>
  );
}
