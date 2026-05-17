'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CharacterLibraryEntry } from '@dnd/protocol';

import { useAuth } from '../../lib/auth-context';
import {
  getCharacterBuilderAssetFallbackLabel,
  getCharacterBuilderAssetPath,
  type CharacterBuilderAssetKey,
} from '../../lib/character-builder-assets';
import {
  type CharacterBuilderLibraryEntry,
  type CharacterBuilderStatus,
} from '../../lib/character-builder-data';
import {
  filterCharacterLibraryEntries,
  getStatusLabel,
} from '../../lib/character-builder-helpers';
import { listCharacterLibraryEntries } from '../../lib/character-library-api';
import {
  characterLibraryEntryToCard,
  getPortraitImageSource,
} from '../../lib/character-library-mappers';
import {
  downloadCharacterSheetPdf,
  type CharacterSheetTemplateId,
} from '../../lib/character-sheet-pdf';
import { LanguageSwitcher, useI18n } from '../../lib/i18n';
import SimpleCharacterBuilder from './simple-builder/App';

type CharacterBuilderPageProps = {
  mode: 'new' | 'edit';
  characterId?: string;
};

function statusClasses(status: CharacterBuilderStatus): string {
  switch (status) {
    case 'draft':
      return 'border-stone-400/40 bg-stone-800/85 text-stone-100';
    case 'ready':
      return 'border-emerald-300/45 bg-emerald-950/80 text-emerald-100';
    case 'in_session':
      return 'border-sky-300/45 bg-sky-950/80 text-sky-100';
  }
}

function Shell({
  active,
  children,
  title,
}: {
  active: 'library' | 'builder';
  children: ReactNode;
  title: string;
}) {
  const { t } = useI18n();
  const { logout, user } = useAuth();

  return (
    <main
      className="min-h-screen overflow-x-hidden"
      style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(201,168,76,0.12),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(168,85,247,0.14),transparent_28%),linear-gradient(180deg,#0f1117_0%,#111421_58%,#0b0d13_100%)]" />
      <div className="relative min-h-screen">
        <header
          className="sticky top-0 z-30 border-b backdrop-blur-sm"
          style={{
            background: 'rgba(15,17,23,0.88)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="mx-auto max-w-5xl px-4">
            <div className="flex flex-wrap items-center gap-3 py-3">
              <Link
                className="group flex items-center gap-3"
                href="/characters"
              >
                <span className="text-2xl">D20</span>
                <span
                  className="text-lg font-bold tracking-wide group-hover:text-[var(--color-gold)]"
                  style={{
                    color: 'var(--color-gold)',
                    letterSpacing: '-0.2px',
                  }}
                >
                  {title}
                </span>
              </Link>
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                Library
              </span>
              <nav className="ml-auto flex flex-wrap items-center gap-2 text-xs font-bold">
                <ShellNavLink
                  href="/characters"
                  active={active === 'library'}
                  label={t('nav.characterLibrary')}
                />
                <ShellNavLink href="/characters/new" label="Builder" />
                <ShellNavLink href="/runtime" label={t('nav.runtimeTable')} />
              </nav>
              <LanguageSwitcher />
              {user ? (
                <>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text-muted)]">
                    {user.displayName}
                  </span>
                  <button
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--color-text)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                    onClick={() => void logout()}
                    type="button"
                  >
                    خروج
                  </button>
                </>
              ) : (
                <Link
                  className="rounded-full border border-[var(--color-gold-border)] bg-[var(--color-gold)] px-4 py-2 text-sm font-black text-[#0f1117]"
                  href="/login"
                >
                  ورود
                </Link>
              )}
            </div>
          </div>
        </header>
        <section className="mx-auto max-w-5xl">{children}</section>
      </div>
    </main>
  );
}

function ShellNavLink({
  active = false,
  disabled = false,
  href,
  label,
}: {
  active?: boolean;
  disabled?: boolean;
  href?: string;
  label: string;
}) {
  const className = [
    'inline-flex min-w-0 items-center justify-center rounded-xl border px-3 py-2 text-center font-bold transition',
    active
      ? 'border-[var(--color-gold-border)] bg-[var(--color-gold)] text-[#0f1117] shadow-lg shadow-black/20'
      : 'border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]',
    disabled ? 'cursor-not-allowed opacity-55 hover:bg-transparent' : '',
  ].join(' ');

  if (!href || disabled) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Link className={className} href={href}>
      {label}
    </Link>
  );
}

function ParchmentPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        'rounded-2xl border p-4 shadow-xl shadow-black/25 sm:p-5',
        className,
      ].join(' ')}
      style={{
        background: 'rgba(30,33,48,0.88)',
        borderColor: 'var(--color-border)',
      }}
    >
      {children}
    </section>
  );
}

function PlaceholderArt({
  assetKey,
  imageSrc,
  label,
  priority = false,
  size = 'large',
}: {
  assetKey?: CharacterBuilderAssetKey;
  imageSrc?: string | null;
  label: string;
  priority?: boolean;
  size?: 'avatar' | 'choice' | 'large' | 'portrait' | 'small' | 'wide';
}) {
  const imagePath =
    imageSrc ?? (assetKey ? getCharacterBuilderAssetPath(assetKey) : null);
  const [failedAssetPath, setFailedAssetPath] = useState<string | null>(null);
  const shouldShowImage = Boolean(imagePath && imagePath !== failedAssetPath);
  const imagePositionClass =
    assetKey?.startsWith('portrait.') || imageSrc?.startsWith('data:')
      ? 'object-top'
      : 'object-center';
  const fallbackLabel = assetKey
    ? getCharacterBuilderAssetFallbackLabel(assetKey)
    : label;
  const initials = fallbackLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');

  return (
    <div
      aria-label={`${label} ${shouldShowImage ? 'تصویر' : 'تصویر جایگزین'}`}
      className={[
        'relative grid overflow-hidden rounded-2xl border border-amber-400/35 bg-[radial-gradient(circle_at_28%_18%,rgba(168,85,247,0.55),transparent_24%),radial-gradient(circle_at_72%_80%,rgba(217,119,6,0.38),transparent_30%),linear-gradient(135deg,#1b1225,#101827_55%,#21140c)] shadow-inner shadow-black/45',
        size === 'avatar'
          ? 'mx-auto aspect-[4/5] w-full max-w-sm rounded-3xl'
          : '',
        size === 'choice' ? 'aspect-square w-full rounded-b-none' : '',
        size === 'small' ? 'h-20 w-20' : '',
        size === 'large' ? 'h-48 w-full' : '',
        size === 'portrait' ? 'h-72 w-full sm:h-80 md:h-72 2xl:h-64' : '',
        size === 'wide' ? 'h-40 w-full' : '',
      ].join(' ')}
    >
      {shouldShowImage && imagePath ? (
        <Image
          alt=""
          className={`object-cover ${imagePositionClass}`}
          fill
          onError={() => setFailedAssetPath(imagePath)}
          priority={priority}
          sizes={
            size === 'small'
              ? '80px'
              : size === 'avatar'
                ? '(min-width: 1280px) 384px, min(100vw, 384px)'
                : size === 'choice'
                  ? '(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw'
                  : size === 'wide'
                    ? '(min-width: 1280px) 360px, 100vw'
                    : size === 'portrait'
                      ? '(min-width: 1536px) 25vw, (min-width: 768px) 50vw, 100vw'
                      : '(min-width: 1280px) 420px, 100vw'
          }
          src={imagePath}
        />
      ) : (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_46%,rgba(251,191,36,0.12)_48%,transparent_50%)]" />
          <span className="m-auto rounded-full border border-amber-200/35 bg-black/35 px-4 py-2 text-xl font-black tracking-[0.18em] text-amber-100">
            {initials || 'CB'}
          </span>
          <span className="absolute bottom-2 left-2 right-2 truncate rounded-full bg-black/45 px-2 py-1 text-center text-[0.65rem] uppercase tracking-[0.18em] text-amber-100/70">
            تصویر جایگزین
          </span>
        </>
      )}
      {shouldShowImage ? (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,3,2,0.02),rgba(5,3,2,0.2))]" />
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: CharacterBuilderStatus }) {
  return (
    <span
      className={[
        'inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em]',
        statusClasses(status),
      ].join(' ')}
    >
      {getStatusLabel(status)}
    </span>
  );
}

export function CharacterLibraryPage() {
  const { t } = useI18n();
  const { error: authError, loading: authLoading, user } = useAuth();
  const [query, setQuery] = useState('');
  const [rawEntries, setRawEntries] = useState<CharacterLibraryEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<CharacterBuilderStatus | 'all'>('all');

  useEffect(() => {
    let active = true;

    async function loadEntries() {
      if (!user) {
        setRawEntries([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const result = await listCharacterLibraryEntries(user.id);

      if (!active) {
        return;
      }

      if (result.ok) {
        setRawEntries(result.data);
        setLoadError(null);
      } else {
        setRawEntries([]);
        setLoadError(result.error.message);
      }

      setLoading(false);
    }

    void loadEntries();

    return () => {
      active = false;
    };
  }, [user]);

  const cards = useMemo(
    () => rawEntries.map(characterLibraryEntryToCard),
    [rawEntries],
  );

  const entries = useMemo(
    () =>
      filterCharacterLibraryEntries(cards, {
        query,
        status,
      }),
    [cards, query, status],
  );
  const entriesById = useMemo(
    () => new Map(rawEntries.map((entry) => [entry.id, entry])),
    [rawEntries],
  );

  return (
    <Shell active="library" title={t('page.characterLibrary.title')}>
      <div className="px-4 py-6 lg:py-8">
        {!authLoading && !user ? (
          <ParchmentPanel>
            <h2 className="text-2xl font-black text-slate-50">
              برای دیدن کاراکترها وارد شوید
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              کتابخانه کاراکترها به حساب کاربری وصل شده است؛ بعد از ورود، فقط
              کاراکترهای خودتان نمایش داده می‌شود.
            </p>
            {authError ? (
              <p className="mt-3 text-sm text-red-100">{authError}</p>
            ) : null}
            <Link
              className="mt-5 inline-flex rounded-xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950"
              href="/login"
            >
              ورود یا ثبت‌نام
            </Link>
          </ParchmentPanel>
        ) : null}

        {user ? (
          <>
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">
                  {t('page.characterLibrary.title')}
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--color-text-muted)]">
                  کاراکترهای ذخیره‌شده حساب خودتان را ببینید، پیش‌نویس را باز
                  کنید، تصویر پرتره را نگه دارید، یا بدون خروج از محیط کار شیت
                  خروجی بگیرید.
                </p>
              </div>
              <Link
                className="inline-flex w-fit rounded-xl border border-amber-300/45 bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-black/20 transition hover:bg-amber-300"
                href="/characters/new"
              >
                ساخت کاراکتر جدید
              </Link>
            </div>

            <ParchmentPanel className="mt-8">
              <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
                <label className="block">
                  <span className="sr-only">جست‌وجوی کاراکترها</span>
                  <input
                    className="w-full rounded-xl border bg-[var(--color-surface)] px-4 py-3 text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-gold)] focus:ring-2 focus:ring-[var(--color-gold-dim)]"
                    style={{ borderColor: 'var(--color-border)' }}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="جست‌وجوی کاراکترها..."
                    type="search"
                    value={query}
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  {[
                    ['all', 'همه'],
                    ['draft', 'پیش‌نویس‌ها'],
                    ['ready', 'آماده‌ها'],
                    ['in_session', 'داخل جلسه'],
                  ].map(([value, label]) => (
                    <button
                      className={[
                        'rounded-xl border px-4 py-2 text-sm font-bold transition',
                        status === value
                          ? 'border-[var(--color-gold-border)] bg-[var(--color-gold)] text-[#0f1117]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-text)]',
                      ].join(' ')}
                      key={value}
                      onClick={() =>
                        setStatus(value as CharacterBuilderStatus | 'all')
                      }
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 text-sm">
                  <select
                    aria-label="مرتب‌سازی کاراکترها"
                    className="rounded-xl border bg-[var(--color-surface)] px-4 py-2 text-[var(--color-text)] outline-none"
                    style={{ borderColor: 'var(--color-border)' }}
                    defaultValue="recent"
                  >
                    <option value="recent">
                      مرتب‌سازی: تازه‌ترین بروزرسانی
                    </option>
                    <option value="name">مرتب‌سازی: نام</option>
                    <option value="level">مرتب‌سازی: سطح</option>
                  </select>
                  <button
                    className="rounded-xl border bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
                    style={{ borderColor: 'var(--color-border)' }}
                    type="button"
                  >
                    ▦
                  </button>
                  <button
                    className="rounded-xl border bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text-muted)] opacity-65"
                    style={{ borderColor: 'var(--color-border)' }}
                    type="button"
                  >
                    ☰
                  </button>
                </div>
              </div>
            </ParchmentPanel>

            {loadError ? (
              <ParchmentPanel className="mt-6">
                <p className="text-lg font-black text-red-100">
                  کتابخانه کاراکترها بارگذاری نشد.
                </p>
                <p className="mt-2 text-sm text-amber-100/70">{loadError}</p>
              </ParchmentPanel>
            ) : null}

            {pdfNotice ? (
              <ParchmentPanel className="mt-6">
                <p className="text-sm font-bold text-amber-50">{pdfNotice}</p>
              </ParchmentPanel>
            ) : null}

            {loading ? (
              <ParchmentPanel className="mt-6 text-center">
                <p className="text-lg font-bold text-amber-50">
                  در حال بارگذاری کاراکترهای ذخیره‌شده...
                </p>
              </ParchmentPanel>
            ) : null}

            <div className="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
              {entries.map((entry) => (
                <CharacterCard
                  entry={entry}
                  key={entry.id}
                  libraryEntry={entriesById.get(entry.id)}
                  onPdfNotice={setPdfNotice}
                />
              ))}
            </div>

            {!loading && !loadError && entries.length === 0 ? (
              <ParchmentPanel className="mt-6 text-center">
                <p className="text-lg font-bold text-amber-50">
                  هیچ کاراکتر ذخیره‌شده‌ای با این جست‌وجو پیدا نشد.
                </p>
                <p className="mt-2 text-sm text-amber-100/65">
                  فیلترها را پاک کنید یا برای حساب خودتان کاراکتر تازه بسازید.
                </p>
              </ParchmentPanel>
            ) : null}
          </>
        ) : null}
      </div>
    </Shell>
  );
}

function CharacterCard({
  entry,
  libraryEntry,
  onPdfNotice,
}: {
  entry: CharacterBuilderLibraryEntry;
  libraryEntry?: CharacterLibraryEntry;
  onPdfNotice: (notice: string) => void;
}) {
  const [downloadingPdfTemplate, setDownloadingPdfTemplate] =
    useState<CharacterSheetTemplateId | null>(null);

  const downloadPdf = async (
    templateId: CharacterSheetTemplateId,
  ): Promise<void> => {
    if (!libraryEntry) {
      return;
    }

    setDownloadingPdfTemplate(templateId);

    try {
      const result = await downloadCharacterSheetPdf(libraryEntry, {
        templateId,
      });
      const templateMessage = result.fallbackReason
        ? `PDF جایگزین شیت کاراکتر دانلود شد: ${result.fallbackReason}`
        : `${result.template.label} از داده‌های ذخیره‌شده کاراکتر دانلود شد.`;

      onPdfNotice(templateMessage);
    } catch (error) {
      onPdfNotice(
        error instanceof Error
          ? `دانلود PDF شیت کاراکتر ناموفق بود: ${error.message}`
          : 'دانلود PDF شیت کاراکتر ناموفق بود.',
      );
    } finally {
      setDownloadingPdfTemplate(null);
    }
  };

  return (
    <article
      className="overflow-hidden rounded-2xl border shadow-xl shadow-black/25 transition hover:-translate-y-0.5 hover:border-[var(--color-gold-border)]"
      style={{
        background: 'rgba(30,33,48,0.9)',
        borderColor: 'var(--color-border)',
      }}
    >
      <PlaceholderArt
        assetKey={entry.portraitAssetKey}
        imageSrc={getPortraitImageSource(entry.portrait)}
        label={entry.name}
        size="portrait"
      />
      <div className="p-5 text-[var(--color-text)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black">{entry.name}</h3>
            <p className="mt-1 text-sm font-semibold text-[var(--color-text-muted)]">
              {entry.speciesOrRace} {entry.className}
            </p>
          </div>
          <span className="rounded-xl border border-[var(--color-gold-border)] bg-[var(--color-gold)] px-3 py-2 text-center text-sm font-black text-[#0f1117]">
            {entry.level}
            <span className="block text-[0.55rem] uppercase tracking-[0.18em]">
              سطح
            </span>
          </span>
        </div>
        <p className="mt-4 min-h-12 text-sm leading-6 text-[var(--color-text-muted)]">
          {entry.summary}
        </p>
        <div
          className="mt-4 flex items-center justify-between border-t pt-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <StatusBadge status={entry.status} />
          <span className="text-sm font-bold text-[var(--color-text-muted)]">
            درجه زره {entry.armorClass}
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          <Link
            className="rounded-xl bg-[var(--color-gold)] px-4 py-2 text-center text-sm font-bold text-[#0f1117] transition hover:brightness-110"
            href={`/characters/${entry.id}/edit`}
          >
            ویرایش
          </Link>
          <button
            className="rounded-xl bg-black/25 px-4 py-2 text-sm font-bold text-[var(--color-text-muted)] opacity-65"
            disabled
            type="button"
          >
            تکثیر - در انتظار
          </button>
          <button
            className="rounded-xl bg-black/25 px-4 py-2 text-sm font-bold text-red-200/55"
            disabled
            type="button"
          >
            حذف - در انتظار
          </button>
          <button
            className="rounded-xl border bg-black/25 px-4 py-2 text-sm font-black text-[var(--color-text-muted)] opacity-65"
            style={{ borderColor: 'var(--color-border)' }}
            disabled
            type="button"
          >
            استفاده در جلسه - در انتظار
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-xl border bg-black/20 px-4 py-2 text-sm font-black text-[var(--color-text)] transition hover:border-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-45"
              style={{ borderColor: 'var(--color-border)' }}
              disabled={!libraryEntry || downloadingPdfTemplate !== null}
              onClick={() => void downloadPdf('dnd-2024-template')}
              type="button"
            >
              {downloadingPdfTemplate === 'dnd-2024-template'
                ? 'در حال آماده‌سازی...'
                : 'شیت ۲۰۲۴'}
            </button>
            <button
              className="rounded-xl border bg-black/20 px-4 py-2 text-sm font-black text-[var(--color-text)] transition hover:border-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-45"
              style={{ borderColor: 'var(--color-border)' }}
              disabled={!libraryEntry || downloadingPdfTemplate !== null}
              onClick={() => void downloadPdf('dnd-2014-template')}
              type="button"
            >
              {downloadingPdfTemplate === 'dnd-2014-template'
                ? 'در حال آماده‌سازی...'
                : 'شیت ۲۰۱۴'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CharacterBuilderPage(props: CharacterBuilderPageProps) {
  return (
    <SimpleCharacterBuilder characterId={props.characterId} mode={props.mode} />
  );
}
