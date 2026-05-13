'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CharacterLibraryEntry } from '@dnd/protocol';

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
  defaultCharacterLibraryOwnerParticipantId,
  filterCharacterLibraryEntries,
  getStatusLabel,
} from '../../lib/character-builder-helpers';
import { listCharacterLibraryEntries } from '../../lib/character-library-api';
import {
  characterLibraryEntryToCard,
  getPortraitImageSource,
} from '../../lib/character-library-mappers';
import { downloadCharacterSheetPdf } from '../../lib/character-sheet-pdf';
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

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(245,158,11,0.12),transparent_30%),linear-gradient(135deg,#0b1020_0%,#111827_52%,#0f172a_100%)]" />
      <div className="relative grid min-h-screen lg:grid-cols-[16rem_1fr]">
        <aside className="border-b border-slate-700/70 bg-slate-950/80 px-4 py-4 shadow-xl shadow-black/25 backdrop-blur lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <Link
            className="group flex items-center gap-3 text-slate-100"
            href="/"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-300/35 bg-amber-400 text-sm font-black text-slate-950 shadow-lg shadow-black/25">
              D20
            </span>
            <span>
              <span className="block text-base font-black uppercase tracking-[0.12em] text-slate-50 group-hover:text-amber-200">
                DND Web
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {t('nav.characterWorkspace')}
              </span>
            </span>
          </Link>

          <nav className="mt-4 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6 lg:mt-8 lg:block lg:space-y-2 lg:text-sm">
            <ShellNavLink href="/" icon="Home" label={t('common.dashboard')} />
            <ShellNavLink
              active={active === 'library'}
              href="/characters"
              icon="Library"
              label={t('nav.characterLibrary')}
            />
            <ShellNavLink
              href="/runtime"
              icon="Table"
              label={t('nav.runtimeTable')}
            />
            <ShellNavLink
              disabled
              icon={t('nav.soon')}
              label={t('nav.campaigns')}
            />
            <ShellNavLink
              disabled
              icon={t('nav.soon')}
              label={t('nav.compendium')}
            />
            <ShellNavLink
              disabled
              icon={t('nav.soon')}
              label={t('nav.journal')}
            />
          </nav>

          <div className="mt-8 hidden rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-sm shadow-inner shadow-black/25 lg:block">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
              {t('shell.builderMvp.title')}
            </p>
            <p className="mt-3 leading-6 text-slate-400">
              {t('shell.builderMvp.body')}
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 flex flex-col gap-4 border-b border-slate-700/70 bg-slate-950/82 px-4 py-4 backdrop-blur md:flex-row md:items-center md:justify-between lg:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300/80">
                {t('shell.characterTools')}
              </p>
              <h1 className="mt-1 text-xl font-black text-slate-50 sm:text-2xl">
                {title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <LanguageSwitcher />
              <span className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2">
                {t('shell.demoProfile')}
              </span>
            </div>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}

function ShellNavLink({
  active = false,
  disabled = false,
  href,
  icon,
  label,
}: {
  active?: boolean;
  disabled?: boolean;
  href?: string;
  icon: string;
  label: string;
}) {
  const className = [
    'flex min-w-0 items-center justify-center gap-2 rounded-xl border px-2 py-2 text-center font-bold transition lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 lg:text-left',
    active
      ? 'border-amber-300/45 bg-amber-400 text-slate-950 shadow-lg shadow-black/20'
      : 'border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-50',
    disabled ? 'cursor-not-allowed opacity-55 hover:bg-transparent' : '',
  ].join(' ');

  const content = (
    <>
      <span className="w-12 text-center text-[0.62rem] uppercase tracking-[0.12em] text-current lg:w-14">
        {icon}
      </span>
      <span className="sr-only lg:not-sr-only lg:min-w-0 lg:truncate">
        {label}
      </span>
    </>
  );

  if (!href || disabled) {
    return <span className={className}>{content}</span>;
  }

  return (
    <Link className={className} href={href}>
      {content}
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
        'rounded-2xl border border-slate-700 bg-slate-900/88 p-4 shadow-xl shadow-black/25 sm:p-5',
        className,
      ].join(' ')}
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
      aria-label={`${label} ${shouldShowImage ? 'art' : 'placeholder art'}`}
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
            Placeholder
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
  const [query, setQuery] = useState('');
  const [ownerParticipantId, setOwnerParticipantId] = useState(
    defaultCharacterLibraryOwnerParticipantId,
  );
  const [rawEntries, setRawEntries] = useState<CharacterLibraryEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<CharacterBuilderStatus | 'all'>('all');

  useEffect(() => {
    let active = true;

    async function loadEntries() {
      setLoading(true);
      const result = await listCharacterLibraryEntries(ownerParticipantId);

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
  }, [ownerParticipantId]);

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
      <div className="px-4 py-6 lg:px-6 lg:py-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">
              {t('page.characterLibrary.title')}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-400">
              Browse persisted characters for the selected dev owner, open a
              draft, or export a sheet without leaving the workspace.
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-xl border border-amber-300/45 bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-black/20 transition hover:bg-amber-300"
            href="/characters/new"
          >
            Create New Character
          </Link>
        </div>

        <ParchmentPanel className="mt-8">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto_auto] xl:items-center">
            <label className="block">
              <span className="sr-only">Search characters</span>
              <input
                className="w-full rounded-xl border border-slate-600 bg-slate-950/40 px-4 py-3 text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search characters..."
                type="search"
                value={query}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-amber-200/75">
                Dev Owner
              </span>
              <input
                className="w-full rounded-xl border border-slate-600 bg-slate-950/40 px-4 py-3 text-slate-50 outline-none transition placeholder:text-slate-500 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20 xl:w-56"
                onChange={(event) =>
                  setOwnerParticipantId(event.target.value.trim())
                }
                value={ownerParticipantId}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {[
                ['all', 'All'],
                ['draft', 'Drafts'],
                ['ready', 'Ready'],
                ['in_session', 'In Session'],
              ].map(([value, label]) => (
                <button
                  className={[
                    'rounded-xl border px-4 py-2 text-sm font-bold transition',
                    status === value
                      ? 'border-amber-300/45 bg-amber-400 text-slate-950'
                      : 'border-slate-600 bg-slate-950/35 text-slate-300 hover:border-slate-400',
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
                aria-label="Sort characters"
                className="rounded-xl border border-slate-600 bg-slate-950/40 px-4 py-2 text-slate-200 outline-none"
                defaultValue="recent"
              >
                <option value="recent">Sort by: Recently Updated</option>
                <option value="name">Sort by: Name</option>
                <option value="level">Sort by: Level</option>
              </select>
              <button
                className="rounded-xl border border-slate-600 bg-slate-950/40 px-3 py-2 text-slate-200"
                type="button"
              >
                ▦
              </button>
              <button
                className="rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-slate-500"
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
              Character Library could not load.
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
              Loading persisted characters...
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
              No persisted characters match that search.
            </p>
            <p className="mt-2 text-sm text-amber-100/65">
              Clear the filters or create a new character for this dev owner.
            </p>
          </ParchmentPanel>
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const downloadPdf = async (): Promise<void> => {
    if (!libraryEntry) {
      return;
    }

    setDownloadingPdf(true);

    try {
      const result = await downloadCharacterSheetPdf(libraryEntry);
      const templateMessage = result.fallbackReason
        ? `Downloaded fallback character sheet PDF: ${result.fallbackReason}`
        : `Downloaded ${result.template.label} from persisted character data.`;

      onPdfNotice(templateMessage);
    } catch (error) {
      onPdfNotice(
        error instanceof Error
          ? `Character sheet PDF download failed: ${error.message}`
          : 'Character sheet PDF download failed.',
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/25">
      <PlaceholderArt
        assetKey={entry.portraitAssetKey}
        imageSrc={getPortraitImageSource(entry.portrait)}
        label={entry.name}
        size="portrait"
      />
      <div className="p-5 text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black">{entry.name}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-400">
              {entry.speciesOrRace} {entry.className}
            </p>
          </div>
          <span className="rounded-xl border border-amber-300/35 bg-amber-400 px-3 py-2 text-center text-sm font-black text-slate-950">
            {entry.level}
            <span className="block text-[0.55rem] uppercase tracking-[0.18em]">
              Level
            </span>
          </span>
        </div>
        <p className="mt-4 min-h-12 text-sm leading-6 text-slate-300">
          {entry.summary}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-slate-700 pt-4">
          <StatusBadge status={entry.status} />
          <span className="text-sm font-bold text-slate-300">
            AC {entry.armorClass}
          </span>
        </div>
        <div className="mt-4 grid gap-2">
          <Link
            className="rounded-xl bg-amber-400 px-4 py-2 text-center text-sm font-bold text-slate-950 transition hover:bg-amber-300"
            href={`/characters/${entry.id}/edit`}
          >
            Edit
          </Link>
          <button
            className="rounded-xl border border-slate-600 bg-slate-950/35 px-4 py-2 text-sm font-black text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!libraryEntry || downloadingPdf}
            onClick={() => void downloadPdf()}
            type="button"
          >
            {downloadingPdf
              ? 'Preparing PDF...'
              : 'Download Character Sheet PDF'}
          </button>
          <button
            className="rounded-xl bg-slate-950/35 px-4 py-2 text-sm font-bold text-slate-500"
            disabled
            type="button"
          >
            Duplicate - Pending
          </button>
          <button
            className="rounded-xl bg-slate-950/35 px-4 py-2 text-sm font-bold text-red-200/55"
            disabled
            type="button"
          >
            Delete - Pending
          </button>
          <button
            className="rounded-xl border border-slate-700 bg-slate-950/35 px-4 py-2 text-sm font-black text-slate-500"
            disabled
            type="button"
          >
            Use in Session - Pending
          </button>
        </div>
      </div>
    </article>
  );
}

export function CharacterBuilderPage(props: CharacterBuilderPageProps) {
  void props;

  return <SimpleCharacterBuilder />;
}
