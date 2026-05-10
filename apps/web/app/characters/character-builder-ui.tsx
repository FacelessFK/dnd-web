'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

import {
  getCharacterBuilderAssetFallbackLabel,
  getCharacterBuilderAssetPath,
  getCharacterBuilderEquipmentAssetKey,
  getCharacterBuilderSpellAssetKey,
  type CharacterBuilderAssetKey,
} from '../../lib/character-builder-assets';
import {
  abilityKeys,
  backgroundChoices,
  builderSteps,
  classChoices,
  mockCharacterLibraryEntries,
  speciesChoices,
  type AbilityKey,
  type BuilderStepId,
  type CharacterBuilderDraft,
  type CharacterBuilderLibraryEntry,
  type CharacterBuilderStatus,
} from '../../lib/character-builder-data';
import {
  createDefaultCharacterBuilderDraft,
  deriveCharacterBuilderSummary,
  filterCharacterLibraryEntries,
  formatAbilityModifier,
  getBuilderCompletionCount,
  getBuilderStepIndex,
  getNextBuilderStep,
  getPreviousBuilderStep,
  getSelectedBackground,
  getSelectedClass,
  getSelectedSpecies,
  getStatusLabel,
  normalizeCharacterBuilderDraft,
  toggleBuilderSelection,
  updateAbilityScore,
  updateAbilityScoreMethod,
} from '../../lib/character-builder-helpers';
import {
  deriveAbilityScoreAssignmentState,
  deriveAbilityScorePreview,
  deriveCharacterRuleReviewSummary,
  deriveDefaultBuilderSelections,
  deriveEquipmentSuggestions,
  deriveProficiencyChoiceState,
  deriveRuleDerivedPreview,
  getAbilityScoreMethodLabel,
  getAvailableSpellsForClass,
  getRuleBackgroundById,
  getRuleClassById,
  getRuleProfileById,
  getRuleSpeciesById,
  getRuleSpellByName,
  getRulesProfileLabel,
  getSpellSchoolsForClass,
  getValidationIssuesForStep,
  isCharacterBuilderDraftValid,
  sanitizeDraftForRulesProfile,
  validateCharacterBuilderDraft,
} from '../../lib/character-builder-rules-helpers';
import {
  rulesProfiles,
  type AbilityScoreMethod,
} from '../../lib/character-builder-rules-data';

type CharacterBuilderPageProps = {
  mode: 'new' | 'edit';
  characterId?: string;
};

const abilityLabels: Record<AbilityKey, string> = {
  cha: 'Charisma',
  con: 'Constitution',
  dex: 'Dexterity',
  int: 'Intelligence',
  str: 'Strength',
  wis: 'Wisdom',
};

function getDraftPortraitAssetKey(
  draft: CharacterBuilderDraft,
): CharacterBuilderAssetKey | undefined {
  const normalizedDraftName = draft.name.trim().toLowerCase();
  const libraryEntry = mockCharacterLibraryEntries.find(
    (entry) => entry.name.toLowerCase() === normalizedDraftName,
  );

  return libraryEntry?.portraitAssetKey;
}

function getSpellOptionAssetKey(
  spellName: string,
): CharacterBuilderAssetKey | null {
  return getCharacterBuilderSpellAssetKey(
    spellName,
    getRuleSpellByName(spellName)?.school,
  );
}

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

function applyRuleDefaults(
  draft: CharacterBuilderDraft,
): CharacterBuilderDraft {
  const builderSelections = deriveDefaultBuilderSelections(draft);
  const nextDraft = {
    ...draft,
    builderSelections,
  };
  const preview = deriveRuleDerivedPreview(nextDraft);

  return {
    ...nextDraft,
    armorClass: preview.armorClass.value,
    hp: {
      ...nextDraft.hp,
      current: Math.min(nextDraft.hp.current, preview.hitPoints.value),
      max: preview.hitPoints.value,
    },
    speed: preview.speed,
  };
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
  const sidebarTexturePath = getCharacterBuilderAssetPath('texture.sidebar');

  return (
    <main className="min-h-screen overflow-hidden bg-[#090806] text-amber-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(124,58,237,0.22),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(217,119,6,0.18),transparent_28%),linear-gradient(135deg,#100b09_0%,#080b10_55%,#050403_100%)]" />
      <div className="relative grid min-h-screen lg:grid-cols-[18rem_1fr]">
        <aside
          className="border-r border-amber-700/30 bg-black/35 bg-cover bg-center px-5 py-6 shadow-2xl shadow-black/50 backdrop-blur"
          style={
            sidebarTexturePath
              ? {
                  backgroundImage: `linear-gradient(rgba(5,3,2,0.68), rgba(5,3,2,0.86)), url(${sidebarTexturePath})`,
                }
              : undefined
          }
        >
          <Link
            className="group flex items-center gap-4 text-amber-100"
            href="/"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full border border-amber-300/60 bg-gradient-to-br from-amber-400/25 to-purple-950/60 text-3xl shadow-lg shadow-amber-950/40">
              ✦
            </span>
            <span>
              <span className="block text-xl font-black uppercase tracking-[0.24em] text-amber-200 group-hover:text-amber-100">
                DND Web
              </span>
              <span className="text-xs uppercase tracking-[0.38em] text-amber-400/70">
                Adventurer&apos;s Archive
              </span>
            </span>
          </Link>

          <nav className="mt-10 space-y-2 text-sm">
            <ShellNavLink href="/" icon="⌂" label="Dashboard" />
            <ShellNavLink
              active={active === 'library'}
              href="/characters"
              icon="♟"
              label="Character Library"
            />
            <ShellNavLink href="/runtime" icon="⚔" label="Runtime Table" />
            <ShellNavLink disabled icon="✧" label="Campaigns" />
            <ShellNavLink disabled icon="☉" label="Compendium" />
            <ShellNavLink disabled icon="✎" label="Journal" />
          </nav>

          <div className="mt-10 rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-950/30 to-purple-950/30 p-5 text-center shadow-inner shadow-black/50">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">
              Builder MVP
            </p>
            <p className="mt-3 text-sm leading-6 text-amber-100/75">
              Local mock data only. Backend library persistence, auth, and
              account ownership are intentionally pending.
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="flex flex-col gap-4 border-b border-amber-700/25 bg-black/25 px-6 py-5 backdrop-blur md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-purple-200/75">
                Character product scaffold
              </p>
              <h1 className="mt-1 text-2xl font-black text-amber-50">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-3 text-sm text-amber-100/75">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-amber-300/30 bg-black/35">
                ?
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-full border border-amber-300/30 bg-black/35">
                ◇
              </span>
              <span className="rounded-full border border-amber-300/30 bg-black/35 px-4 py-2">
                Demo Profile
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
    'flex items-center gap-3 rounded-2xl border px-4 py-3 transition',
    active
      ? 'border-purple-300/55 bg-purple-950/65 text-amber-50 shadow-lg shadow-purple-950/35'
      : 'border-transparent text-amber-100/70 hover:border-amber-500/25 hover:bg-amber-950/20 hover:text-amber-50',
    disabled ? 'cursor-not-allowed opacity-55 hover:bg-transparent' : '',
  ].join(' ');

  const content = (
    <>
      <span className="w-6 text-center text-lg text-amber-300">{icon}</span>
      <span>{label}</span>
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
        'rounded-3xl border border-amber-500/25 bg-[linear-gradient(145deg,rgba(27,21,15,0.96),rgba(9,8,7,0.94))] p-5 shadow-2xl shadow-black/35',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  );
}

function PlaceholderArt({
  assetKey,
  label,
  size = 'large',
}: {
  assetKey?: CharacterBuilderAssetKey;
  label: string;
  size?: 'avatar' | 'choice' | 'large' | 'portrait' | 'small' | 'wide';
}) {
  const imagePath = assetKey ? getCharacterBuilderAssetPath(assetKey) : null;
  const [failedAssetPath, setFailedAssetPath] = useState<string | null>(null);
  const shouldShowImage = Boolean(imagePath && imagePath !== failedAssetPath);
  const imagePositionClass = assetKey?.startsWith('portrait.')
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

function PrimaryButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="rounded-2xl border border-amber-300/55 bg-gradient-to-r from-purple-950 via-purple-800 to-purple-950 px-5 py-3 text-sm font-black text-amber-50 shadow-lg shadow-purple-950/35 transition hover:border-amber-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className="rounded-2xl border border-amber-300/25 bg-black/30 px-5 py-3 text-sm font-bold text-amber-100 transition hover:border-amber-200/60 hover:bg-amber-950/25 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ValidationPanel({
  issues,
  title,
}: {
  issues: ReturnType<typeof validateCharacterBuilderDraft>;
  title: string;
}) {
  if (issues.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-950/20 px-4 py-3 text-sm font-bold text-emerald-100/75">
        {title}: ready.
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/82">
      <p className="font-black uppercase tracking-[0.14em] text-amber-200">
        {title}
      </p>
      <ul className="mt-2 space-y-1">
        {issues.map((issue) => (
          <li key={`${issue.step}-${issue.message}`}>
            {issue.severity === 'error' ? 'Required' : 'Note'}: {issue.message}
          </li>
        ))}
      </ul>
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
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CharacterBuilderStatus | 'all'>('all');

  const entries = useMemo(
    () =>
      filterCharacterLibraryEntries(mockCharacterLibraryEntries, {
        query,
        status,
      }),
    [query, status],
  );

  return (
    <Shell active="library" title="Character Library">
      <div className="px-6 py-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-5xl font-black tracking-tight text-amber-50">
              Character Library
            </h2>
            <p className="mt-3 max-w-2xl text-lg leading-8 text-amber-100/70">
              Your heroes, their stories, and the realms they will shape. These
              entries are local mock data until library persistence lands.
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-2xl border border-amber-300/55 bg-gradient-to-r from-purple-950 via-purple-800 to-purple-950 px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-amber-50 shadow-lg shadow-purple-950/35 transition hover:border-amber-200 hover:brightness-110"
            href="/characters/new"
          >
            ✦ Create New Character
          </Link>
        </div>

        <ParchmentPanel className="mt-8">
          <div className="grid gap-4 xl:grid-cols-[1fr_auto_auto] xl:items-center">
            <label className="block">
              <span className="sr-only">Search characters</span>
              <input
                className="w-full rounded-2xl border border-amber-500/25 bg-black/35 px-4 py-3 text-amber-50 outline-none transition placeholder:text-amber-100/35 focus:border-purple-300/70 focus:ring-2 focus:ring-purple-400/25"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search characters..."
                type="search"
                value={query}
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
                      ? 'border-purple-300/70 bg-purple-950/70 text-amber-50'
                      : 'border-amber-500/25 bg-black/25 text-amber-100/70 hover:border-amber-300/50',
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
                className="rounded-xl border border-amber-500/25 bg-black/35 px-4 py-2 text-amber-100 outline-none"
                defaultValue="recent"
              >
                <option value="recent">Sort by: Recently Updated</option>
                <option value="name">Sort by: Name</option>
                <option value="level">Sort by: Level</option>
              </select>
              <button
                className="rounded-xl border border-amber-500/25 bg-black/35 px-3 py-2 text-amber-200"
                type="button"
              >
                ▦
              </button>
              <button
                className="rounded-xl border border-amber-500/25 bg-black/35 px-3 py-2 text-amber-200/55"
                type="button"
              >
                ☰
              </button>
            </div>
          </div>
        </ParchmentPanel>

        <div className="mt-6 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {entries.map((entry) => (
            <CharacterCard entry={entry} key={entry.id} />
          ))}
        </div>

        {entries.length === 0 ? (
          <ParchmentPanel className="mt-6 text-center">
            <p className="text-lg font-bold text-amber-50">
              No characters match that search.
            </p>
            <p className="mt-2 text-sm text-amber-100/65">
              Clear the filters or create a new local draft.
            </p>
          </ParchmentPanel>
        ) : null}
      </div>
    </Shell>
  );
}

function CharacterCard({ entry }: { entry: CharacterBuilderLibraryEntry }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-amber-500/30 bg-[#20160d] shadow-2xl shadow-black/40">
      <PlaceholderArt
        assetKey={entry.portraitAssetKey}
        label={entry.name}
        size="portrait"
      />
      <div className="bg-[linear-gradient(180deg,#d8bd84,#b9965f)] p-5 text-stone-950">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black">{entry.name}</h3>
            <p className="mt-1 text-sm font-semibold">
              {entry.speciesOrRace} {entry.className}
            </p>
          </div>
          <span className="rounded-2xl border border-stone-950/35 bg-stone-950 px-3 py-2 text-center text-sm font-black text-amber-100">
            {entry.level}
            <span className="block text-[0.55rem] uppercase tracking-[0.18em]">
              Level
            </span>
          </span>
        </div>
        <p className="mt-4 min-h-12 text-sm leading-6 text-stone-800">
          {entry.summary}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-stone-900/20 pt-4">
          <StatusBadge status={entry.status} />
          <span className="text-sm font-bold">AC {entry.armorClass}</span>
        </div>
        <div className="mt-4 grid gap-2">
          <Link
            className="rounded-xl bg-stone-950 px-4 py-2 text-center text-sm font-bold text-amber-100 transition hover:bg-stone-800"
            href={`/characters/${entry.id}/edit`}
          >
            Edit
          </Link>
          <button
            className="rounded-xl bg-stone-950/75 px-4 py-2 text-sm font-bold text-amber-100/55"
            disabled
            type="button"
          >
            Duplicate · Pending
          </button>
          <button
            className="rounded-xl bg-stone-950/75 px-4 py-2 text-sm font-bold text-red-200/55"
            disabled
            type="button"
          >
            Delete · Pending
          </button>
          <button
            className="rounded-xl border border-purple-700/45 bg-purple-950/75 px-4 py-2 text-sm font-black text-purple-100/65"
            disabled
            type="button"
          >
            Use in Session · Pending
          </button>
        </div>
      </div>
    </article>
  );
}

export function CharacterBuilderPage({
  characterId,
  mode,
}: CharacterBuilderPageProps) {
  const matchingEntry = mockCharacterLibraryEntries.find(
    (entry) => entry.id === characterId,
  );
  const [draft, setDraft] = useState(() =>
    createDefaultCharacterBuilderDraft(
      matchingEntry
        ? {
            armorClass: matchingEntry.armorClass,
            className: matchingEntry.className,
            level: matchingEntry.level,
            name: matchingEntry.name,
            speciesOrRace: matchingEntry.speciesOrRace,
            status:
              matchingEntry.status === 'in_session'
                ? 'ready'
                : matchingEntry.status,
          }
        : {},
    ),
  );
  const [notice, setNotice] = useState(
    mode === 'edit'
      ? 'Loaded a mock character into the local builder. Backend library persistence is pending.'
      : 'New local draft started. Save and finalize actions are placeholders for now.',
  );

  const currentStepIndex = getBuilderStepIndex(draft.builderStep);
  const validationIssues = validateCharacterBuilderDraft(draft);
  const currentStepIssues = getValidationIssuesForStep(
    draft,
    draft.builderStep,
  );
  const currentStepHasErrors = currentStepIssues.some(
    (issue) => issue.severity === 'error',
  );
  const draftIsValid = isCharacterBuilderDraftValid(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);

  const updateDraft = (nextDraft: CharacterBuilderDraft) => {
    setDraft(normalizeCharacterBuilderDraft(nextDraft));
  };

  return (
    <Shell active="builder" title="Character Builder">
      <div className="px-4 py-6 xl:px-6">
        <Stepper
          currentStep={draft.builderStep}
          onStepChange={(step) =>
            updateDraft({
              ...draft,
              builderStep: step,
            })
          }
          speciesLabel={selectedProfile.speciesLabel}
        />

        <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <ParchmentPanel className="min-w-0">
            <BuilderStepContent draft={draft} setDraft={updateDraft} />
            <ValidationPanel
              issues={
                draft.builderStep === 'review'
                  ? validationIssues
                  : currentStepIssues
              }
              title={
                draft.builderStep === 'review'
                  ? 'Finalize Requirements'
                  : 'Step Requirements'
              }
            />

            <div className="mt-8 flex flex-col gap-3 border-t border-amber-500/20 pt-5 md:flex-row md:items-center md:justify-between">
              <SecondaryButton
                disabled={draft.builderStep === 'identity'}
                onClick={() =>
                  updateDraft({
                    ...draft,
                    builderStep: getPreviousBuilderStep(draft.builderStep),
                  })
                }
              >
                ← Back
              </SecondaryButton>
              <div className="flex flex-col gap-3 md:flex-row">
                <SecondaryButton
                  onClick={() =>
                    setNotice(
                      'Draft save acknowledged locally. Backend persistence integration is pending.',
                    )
                  }
                >
                  Save Draft
                </SecondaryButton>
                {draft.builderStep === 'review' ? (
                  <PrimaryButton
                    disabled={!draftIsValid}
                    onClick={() => {
                      updateDraft({
                        ...draft,
                        status: 'ready',
                      });
                      setNotice(
                        'Finalize is local-only in this scaffold. Backend character library integration is pending.',
                      );
                    }}
                  >
                    Finalize Character
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    disabled={currentStepIndex < 0 || currentStepHasErrors}
                    onClick={() =>
                      updateDraft({
                        ...draft,
                        builderStep: getNextBuilderStep(draft.builderStep),
                      })
                    }
                  >
                    Continue →
                  </PrimaryButton>
                )}
              </div>
            </div>
          </ParchmentPanel>

          <CharacterSummaryPanel draft={draft} notice={notice} />
        </div>

        <div className="mt-5 rounded-2xl border border-purple-300/25 bg-purple-950/25 px-4 py-3 text-sm text-purple-100/85">
          {notice}
        </div>
      </div>
    </Shell>
  );
}

function Stepper({
  currentStep,
  onStepChange,
  speciesLabel,
}: {
  currentStep: BuilderStepId;
  onStepChange: (step: BuilderStepId) => void;
  speciesLabel: string;
}) {
  const currentIndex = getBuilderStepIndex(currentStep);

  return (
    <div className="overflow-x-auto rounded-3xl border border-amber-500/20 bg-black/25 px-4 py-5">
      <ol className="grid min-w-[58rem] grid-cols-9 gap-3">
        {builderSteps.map((step, index) => {
          const active = step.id === currentStep;
          const complete = index < currentIndex;
          const label = step.id === 'species' ? speciesLabel : step.label;

          return (
            <li className="relative text-center" key={step.id}>
              <button
                className={[
                  'mx-auto grid h-11 w-11 place-items-center rounded-full border text-sm font-black transition',
                  active
                    ? 'border-purple-200 bg-purple-700 text-white shadow-[0_0_22px_rgba(192,132,252,0.85)]'
                    : complete
                      ? 'border-amber-300/70 bg-amber-950 text-amber-100'
                      : 'border-amber-500/35 bg-black/45 text-amber-100/75',
                ].join(' ')}
                onClick={() => onStepChange(step.id)}
                type="button"
              >
                {complete ? '✓' : index + 1}
              </button>
              <p
                className={[
                  'mt-2 text-xs font-bold',
                  active ? 'text-amber-50' : 'text-amber-200/65',
                ].join(' ')}
              >
                {label}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BuilderStepContent({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  switch (draft.builderStep) {
    case 'identity':
      return <IdentityStep draft={draft} setDraft={setDraft} />;
    case 'species':
      return <SpeciesStep draft={draft} setDraft={setDraft} />;
    case 'class':
      return <ClassStep draft={draft} setDraft={setDraft} />;
    case 'background':
      return <BackgroundStep draft={draft} setDraft={setDraft} />;
    case 'ability-scores':
      return <AbilityScoresStep draft={draft} setDraft={setDraft} />;
    case 'proficiencies':
      return <ProficienciesStep draft={draft} setDraft={setDraft} />;
    case 'equipment':
      return <EquipmentStep draft={draft} setDraft={setDraft} />;
    case 'spells':
      return <SpellsStep draft={draft} setDraft={setDraft} />;
    case 'review':
      return <ReviewStep draft={draft} />;
  }
}

function StepHeading({
  children,
  intro,
  title,
}: {
  children?: ReactNode;
  intro: string;
  title: string;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-4xl font-black text-amber-50">{title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100/68">
        {intro}
      </p>
      {children}
    </div>
  );
}

function Field({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-black text-amber-200">{label}</span>
      {hint ? (
        <span className="mb-2 mt-1 block text-xs text-amber-100/55">
          {hint}
        </span>
      ) : null}
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-2xl border border-amber-500/25 bg-black/35 px-4 py-3 text-amber-50 outline-none transition placeholder:text-amber-100/35 focus:border-purple-300/70 focus:ring-2 focus:ring-purple-400/25';

function IdentityStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const portraitAssetKey = getDraftPortraitAssetKey(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);

  return (
    <>
      <StepHeading
        intro="Every legend begins with a name. Define the character before their first scene at the table."
        title="Step 1 — Identity"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Field
            hint="This is local state only; it is not saved to the backend yet."
            label="Character Name"
          >
            <input
              className={inputClass}
              maxLength={50}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  name: event.target.value,
                })
              }
              value={draft.name}
            />
          </Field>
          <Field label="Pronouns">
            <select
              className={inputClass}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  pronouns: event.target.value,
                })
              }
              value={draft.pronouns}
            >
              <option>she / her</option>
              <option>he / him</option>
              <option>they / them</option>
              <option>custom / pending</option>
            </select>
          </Field>
          <Field
            hint="Controls which local rules data, ability bonus source, score limits, and legal options are used later in the builder."
            label="Rules Profile"
          >
            <select
              className={inputClass}
              onChange={(event) =>
                setDraft(
                  applyRuleDefaults(
                    sanitizeDraftForRulesProfile(draft, event.target.value),
                  ),
                )
              }
              value={draft.rulesProfileId}
            >
              {rulesProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {getRulesProfileLabel(profile)}
                </option>
              ))}
            </select>
            <div className="mt-3 rounded-2xl border border-purple-300/20 bg-purple-950/20 p-3 text-xs leading-5 text-amber-100/68">
              <p className="font-black text-amber-200">
                {selectedProfile.sourceName} · {selectedProfile.version}
              </p>
              <p>{selectedProfile.notes}</p>
              <p className="mt-1">
                Ability bonuses come from {selectedProfile.abilityBonusSource};
                options are labeled as {selectedProfile.speciesLabel}.
              </p>
            </div>
          </Field>
          <Field
            hint="A short phrase that captures the character's essence."
            label="Short Concept"
          >
            <input
              className={inputClass}
              maxLength={120}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  concept: event.target.value,
                })
              }
              value={draft.concept}
            />
          </Field>
          <Field label="Personality Notes">
            <textarea
              className={`${inputClass} min-h-36`}
              maxLength={500}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  notes: event.target.value,
                })
              }
              value={draft.notes}
            />
          </Field>
        </div>
        <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-4">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.18em] text-amber-300">
            Portrait / Avatar
          </p>
          <PlaceholderArt
            assetKey={portraitAssetKey}
            label={draft.name || 'Adventurer'}
            size="avatar"
          />
          <button
            className="mt-4 w-full rounded-2xl border border-amber-400/25 bg-black/35 px-4 py-3 text-sm font-bold text-amber-100/45"
            disabled
            type="button"
          >
            Upload Image · Backend storage pending
          </button>
        </div>
      </div>
    </>
  );
}

function SpeciesStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const selectedSpecies = getSelectedSpecies(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);
  const selectedSpeciesRules = getRuleSpeciesById(
    draft.speciesOrRace,
    draft.rulesProfileId,
  );
  const profileSpeciesChoices = speciesChoices.filter((choice) =>
    selectedProfile.availableSpeciesIds.includes(choice.id),
  );

  return (
    <>
      <StepHeading
        intro={`Choose a legal ${selectedProfile.speciesLabel.toLowerCase()} for ${selectedProfile.displayName}. Size, speed, traits, and later previews are read from local profile data.`}
        title={`Step 2 — ${selectedProfile.speciesLabel}`}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {profileSpeciesChoices.map((choice) => (
          <ChoiceCard
            choice={choice}
            key={choice.id}
            onSelect={() =>
              setDraft(
                applyRuleDefaults({
                  ...draft,
                  speciesOrRace: choice.id,
                }),
              )
            }
            selected={draft.speciesOrRace === choice.id}
          />
        ))}
      </div>
      {selectedSpecies && selectedSpeciesRules ? (
        <>
          <PreviewStrip
            icon="✦"
            items={selectedSpeciesRules.traits.map((trait) => trait.label)}
            title={`${selectedSpecies.title} Traits`}
          />
          <div className="mt-4 grid gap-3 rounded-2xl border border-amber-500/20 bg-black/25 p-4 text-sm md:grid-cols-3">
            <PreviewRow
              label="Creature Type"
              value={selectedSpeciesRules.creatureType}
            />
            <PreviewRow label="Size" value={selectedSpeciesRules.size} />
            <PreviewRow
              label="Speed"
              value={`${selectedSpeciesRules.speed} ft.`}
            />
          </div>
        </>
      ) : null}
    </>
  );
}

function ClassStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const selectedClass = getSelectedClass(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);
  const selectedClassRules = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const profileClassChoices = classChoices.filter((choice) =>
    selectedProfile.availableClassIds.includes(choice.id),
  );

  return (
    <>
      <StepHeading
        intro={`Choose a legal class for ${selectedProfile.displayName}. Runtime combat integration is still out of scope.`}
        title="Step 3 — Class"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {profileClassChoices.map((choice) => (
            <ChoiceCard
              choice={choice}
              key={choice.id}
              onSelect={() =>
                setDraft(
                  applyRuleDefaults({
                    ...draft,
                    className: choice.id,
                  }),
                )
              }
              selected={draft.className === choice.id}
            >
              <span className="mt-2 inline-flex rounded-full bg-emerald-950/80 px-2 py-1 text-xs font-bold text-emerald-100">
                {choice.difficulty}
              </span>
            </ChoiceCard>
          ))}
        </div>
        {selectedClass && selectedClassRules ? (
          <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-5">
            <PlaceholderArt
              assetKey={selectedClass.assetKey}
              label={selectedClass.title}
              size="small"
            />
            <h3 className="mt-4 text-3xl font-black text-amber-50">
              {selectedClass.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-amber-100/65">
              {selectedClass.description}
            </p>
            <dl className="mt-5 space-y-4 text-sm">
              <PreviewRow label="Role" value={selectedClass.role} />
              <PreviewRow
                label="Primary Ability"
                value={selectedClassRules.primaryAbilities
                  .map((ability) => abilityLabels[ability])
                  .join(', ')}
              />
              <PreviewRow
                label="Hit Die"
                value={`d${selectedClassRules.hitDie}`}
              />
              <PreviewRow
                label="Saving Throws"
                value={selectedClassRules.savingThrowProficiencies
                  .map((ability) => ability.toUpperCase())
                  .join(', ')}
              />
              <PreviewRow label="Armor" value={selectedClass.armor} />
              <PreviewRow label="Weapons" value={selectedClass.weapons} />
              <PreviewRow
                label="Skills"
                value={`Choose ${selectedClassRules.skillChoices.choose}`}
              />
              <PreviewRow
                label="Spellcasting"
                value={
                  selectedClassRules.spellcasting
                    ? `${abilityLabels[selectedClassRules.spellcasting.ability]} / ${selectedClassRules.spellcasting.preparedSpells} level 1 spells`
                    : 'None at level 1'
                }
              />
            </dl>
            <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-amber-300">
              Level 1 Features
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-100/70">
              {selectedClass.features.map((feature) => (
                <li key={feature}>◇ {feature}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  );
}

function BackgroundStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const selectedBackground = getSelectedBackground(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);
  const selectedBackgroundRules = getRuleBackgroundById(
    draft.background,
    draft.rulesProfileId,
  );
  const profileBackgroundChoices = backgroundChoices.filter((choice) =>
    selectedProfile.availableBackgroundIds.includes(choice.id),
  );

  return (
    <>
      <StepHeading
        intro={`Choose a legal background for ${selectedProfile.displayName}. It supplies profile-specific ability bonuses or metadata, fixed skills, tools, and starting equipment.`}
        title="Step 4 — Background"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-3">
          {profileBackgroundChoices.map((choice) => (
            <button
              className={[
                'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition',
                draft.background === choice.id
                  ? 'border-purple-300/70 bg-purple-950/50 shadow-lg shadow-purple-950/25'
                  : 'border-amber-500/20 bg-amber-950/12 hover:border-amber-300/45',
              ].join(' ')}
              key={choice.id}
              onClick={() =>
                setDraft(
                  applyRuleDefaults({
                    ...draft,
                    background: choice.id,
                  }),
                )
              }
              type="button"
            >
              <PlaceholderArt
                assetKey={choice.assetKey}
                label={choice.title}
                size="small"
              />
              <span>
                <span className="block text-xl font-black text-amber-50">
                  {choice.title}
                </span>
                <span className="text-sm text-amber-100/65">
                  {choice.description}
                </span>
              </span>
            </button>
          ))}
        </div>
        {selectedBackground && selectedBackgroundRules ? (
          <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-5">
            <h3 className="text-3xl font-black text-amber-50">
              {selectedBackground.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-amber-100/65">
              {selectedBackground.description}
            </p>
            <PreviewStrip
              icon="✧"
              items={selectedBackgroundRules.skills}
              title="Proficiencies"
            />
            <PreviewStrip
              icon="◌"
              items={selectedBackgroundRules.abilityScoreOptions.map(
                (ability) => abilityLabels[ability],
              )}
              title="Ability Options"
            />
            <PreviewStrip
              icon="◆"
              items={selectedBackground.tools}
              title="Tools"
            />
            <div className="mt-4 rounded-2xl border border-purple-300/25 bg-purple-950/25 p-4">
              <p className="font-black text-amber-200">
                Origin Feat: {selectedBackgroundRules.originFeat}
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-100/65">
                {selectedProfile.abilityBonusSource === 'background'
                  ? "Ability boosts are previewed from this background's legal options."
                  : `${selectedProfile.displayName} uses ${selectedProfile.speciesLabel.toLowerCase()} ability boosts; this background's options are metadata only.`}{' '}
                Feat benefits are metadata only.
              </p>
            </div>
            <PreviewStrip
              icon="*"
              items={selectedBackgroundRules.equipment}
              title="Suggested Equipment"
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

function AbilityScoresStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const summary = deriveCharacterBuilderSummary(draft);
  const abilityPreview = deriveAbilityScorePreview(draft);
  const rulePreview = deriveRuleDerivedPreview(draft);
  const assignmentState = deriveAbilityScoreAssignmentState(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);
  const selectedClass = getSelectedClass(draft);
  const selectedClassRules = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const selectedBackgroundRules = getRuleBackgroundById(
    draft.background,
    draft.rulesProfileId,
  );

  return (
    <>
      <StepHeading
        intro={`Assign base scores using ${selectedProfile.displayName}. The builder enforces score method limits, legal bonuses, final caps, and derived combat basics as a local preview.`}
        title="Step 5 — Ability Scores"
      >
        <div className="mt-5 grid gap-3 rounded-2xl border border-amber-500/20 bg-black/30 p-4 text-sm text-amber-100/75 md:grid-cols-[minmax(0,1fr)_16rem] md:items-center">
          <div>
            <p className="font-black text-amber-200">
              Score Method: {getAbilityScoreMethodLabel(assignmentState.method)}
            </p>
            <p className="mt-1">
              Base range {assignmentState.minBase}-{assignmentState.maxBase};
              final cap {assignmentState.finalScoreCap}.
              {assignmentState.remaining !== null
                ? ` Point buy remaining: ${assignmentState.remaining}/${assignmentState.budget}.`
                : ` Standard array: ${assignmentState.standardArray.join(', ')}.`}
            </p>
          </div>
          <select
            className={inputClass}
            onChange={(event) =>
              setDraft(
                updateAbilityScoreMethod(
                  draft,
                  event.target.value as AbilityScoreMethod,
                ),
              )
            }
            value={assignmentState.method}
          >
            {assignmentState.allowedMethods.map((method) => (
              <option key={method} value={method}>
                {getAbilityScoreMethodLabel(method)}
              </option>
            ))}
          </select>
        </div>
        {selectedClass && selectedClassRules ? (
          <div className="mt-5 rounded-2xl border border-amber-500/20 bg-black/30 p-4 text-sm text-amber-100/75">
            Recommended for {selectedClass.title}:{' '}
            <span className="font-black text-amber-200">
              {selectedClassRules.primaryAbilities
                .map((ability) => abilityLabels[ability])
                .join(', ')}
            </span>
            {selectedBackgroundRules &&
            selectedProfile.abilityBonusSource === 'background' ? (
              <span className="mt-2 block">
                {selectedBackgroundRules.displayName} can boost:{' '}
                {selectedBackgroundRules.abilityScoreOptions
                  .map((ability) => abilityLabels[ability])
                  .join(', ')}
              </span>
            ) : null}
          </div>
        ) : null}
      </StepHeading>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {abilityKeys.map((ability) => (
          <div
            className="rounded-3xl border border-amber-500/25 bg-[linear-gradient(180deg,#d6bb83,#b9965f)] p-4 text-center text-stone-950 shadow-lg shadow-black/30"
            key={ability}
          >
            <p className="text-xl font-black uppercase">{ability}</p>
            <p className="text-xs font-bold">{abilityLabels[ability]}</p>
            <p className="my-4 text-6xl font-black">
              {abilityPreview[ability].final}
            </p>
            <p className="text-2xl font-black">
              {formatAbilityModifier(abilityPreview[ability].final)}
            </p>
            <p className="text-xs font-semibold uppercase">Modifier</p>
            <p className="mt-2 text-xs font-bold">
              Base {abilityPreview[ability].base}
              {abilityPreview[ability].rulesBonus
                ? ` +${abilityPreview[ability].rulesBonus} ${abilityPreview[ability].rulesBonusLabel}`
                : ` +0 ${abilityPreview[ability].rulesBonusLabel}`}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                className="rounded-xl bg-stone-950 px-3 py-2 text-amber-100"
                onClick={() => setDraft(updateAbilityScore(draft, ability, -1))}
                type="button"
              >
                −
              </button>
              <button
                className="rounded-xl bg-purple-950 px-3 py-2 text-amber-100"
                onClick={() => setDraft(updateAbilityScore(draft, ability, 1))}
                type="button"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <StatTile label="HP" value={summary.hitPoints} />
        <StatTile
          label="Initiative"
          value={
            summary.initiative >= 0
              ? `+${summary.initiative}`
              : summary.initiative
          }
        />
        <StatTile label="AC" value={summary.armorClass} />
        <StatTile label="Speed" value={`${summary.speed} ft.`} />
        <StatTile label="Proficiency" value={`+${summary.proficiencyBonus}`} />
      </div>
      <p className="mt-4 text-sm text-amber-100/60">
        Combat Basics Preview: HP uses class hit die d
        {rulePreview.hitPoints.hitDie}, final CON modifier{' '}
        {rulePreview.hitPoints.conModifier >= 0 ? '+' : ''}
        {rulePreview.hitPoints.conModifier}, and any species HP trait. AC uses{' '}
        {rulePreview.armorClass.armorLabel}
        {rulePreview.armorClass.shieldLabel
          ? ` plus ${rulePreview.armorClass.shieldLabel}`
          : ''}{' '}
        as a local preview.
      </p>
    </>
  );
}

function ProficienciesStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const proficiencyState = deriveProficiencyChoiceState(draft);

  return (
    <>
      <StepHeading
        intro="Class and background grants are fixed, while the remaining local choices are limited by the selected SRD class, background, and language rules."
        title="Step 6 — Choices & Proficiencies"
      />
      <div className="mb-5 grid gap-4 xl:grid-cols-4">
        <RuleGrantPanel
          title="Background Skills"
          values={proficiencyState.fixedSkills}
        />
        <RuleGrantPanel
          title="Saving Throws"
          values={proficiencyState.savingThrows.map((ability) =>
            ability.toUpperCase(),
          )}
        />
        <RuleGrantPanel
          title="Fixed Languages"
          values={proficiencyState.fixedLanguages}
        />
        <RuleGrantPanel
          title="Fixed Tools"
          values={proficiencyState.fixedTools}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <SelectionGroup
          maxSelected={proficiencyState.skillChoiceLimit}
          options={proficiencyState.skillOptions}
          selected={proficiencyState.selectedSkillChoices}
          title={`${draft.className} Skill Choices`}
          update={(skills) =>
            setDraft({
              ...draft,
              builderSelections: {
                ...draft.builderSelections,
                skills: [...proficiencyState.fixedSkills, ...skills],
              },
            })
          }
        />
        <SelectionGroup
          maxSelected={proficiencyState.languageChoiceLimit}
          options={proficiencyState.languageOptions}
          selected={proficiencyState.selectedLanguages}
          title="Standard Languages"
          update={(languages) =>
            setDraft({
              ...draft,
              builderSelections: {
                ...draft.builderSelections,
                languages: [...proficiencyState.fixedLanguages, ...languages],
              },
            })
          }
        />
        <SelectionGroup
          maxSelected={proficiencyState.toolChoiceLimit}
          options={proficiencyState.toolOptions}
          selected={proficiencyState.selectedToolChoices}
          title="Tool Choices"
          update={(tools) =>
            setDraft({
              ...draft,
              builderSelections: {
                ...draft.builderSelections,
                tools: [...proficiencyState.fixedTools, ...tools],
              },
            })
          }
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-purple-300/25 bg-purple-950/20 p-5">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-purple-200">
            Metadata-only promise
          </p>
          <p className="mt-3 text-sm leading-6 text-amber-100/68">
            These choices do not affect runtime commands, attack rolls, or
            backend character resources yet. They exist as future integration
            seams for a proper character library.
          </p>
        </div>
      </div>
    </>
  );
}

function EquipmentStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const equipmentSuggestions = deriveEquipmentSuggestions(draft);
  const rulePreview = deriveRuleDerivedPreview(draft);
  const recommendedAssetKey = getCharacterBuilderEquipmentAssetKey(
    equipmentSuggestions[0] ?? draft.className,
  );

  return (
    <>
      <StepHeading
        intro="Accept the SRD class/background equipment metadata or choose local equipment labels manually. No inventory, attacks, money, or encumbrance are wired."
        title="Step 7 — Equipment"
      />
      <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
        <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-5">
          <h3 className="text-2xl font-black text-amber-50">
            Recommended Loadout
          </h3>
          <p className="mt-2 text-sm text-amber-100/65">
            Based on {draft.className} and {draft.background}. AC preview now:{' '}
            {rulePreview.armorClass.value}.
          </p>
          <PlaceholderArt
            assetKey={recommendedAssetKey}
            label={`${draft.className} loadout`}
            size="wide"
          />
          <TagList values={equipmentSuggestions.slice(0, 8)} />
          <PrimaryButton
            onClick={() =>
              setDraft({
                ...draft,
                builderSelections: {
                  ...draft.builderSelections,
                  equipment: equipmentSuggestions,
                },
              })
            }
          >
            Use Recommended
          </PrimaryButton>
        </div>
        <SelectionGroup
          getOptionAssetKey={getCharacterBuilderEquipmentAssetKey}
          maxSelected={12}
          options={equipmentSuggestions}
          selected={draft.builderSelections.equipment}
          title="Suggested Equipment Choices"
          update={(equipment) =>
            setDraft({
              ...draft,
              builderSelections: {
                ...draft.builderSelections,
                equipment,
              },
            })
          }
        />
      </div>
    </>
  );
}

function SpellsStep({
  draft,
  setDraft,
}: {
  draft: CharacterBuilderDraft;
  setDraft: (draft: CharacterBuilderDraft) => void;
}) {
  const selectedClassRules = getRuleClassById(
    draft.className,
    draft.rulesProfileId,
  );
  const spellcasting = selectedClassRules?.spellcasting;
  const [levelFilter, setLevelFilter] = useState('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const availableSpells = getAvailableSpellsForClass(
    draft.className,
    draft.rulesProfileId,
  );
  const schoolOptions = getSpellSchoolsForClass(
    draft.className,
    draft.rulesProfileId,
  );
  const filteredSpells = availableSpells.filter((spell) => {
    const matchesLevel =
      levelFilter === 'all' || String(spell.level) === levelFilter;
    const matchesSchool =
      schoolFilter === 'all' || spell.school === schoolFilter;

    return matchesLevel && matchesSchool;
  });
  const filteredCantrips = filteredSpells
    .filter((spell) => spell.level === 0)
    .map((spell) => spell.name);
  const filteredLeveledSpells = filteredSpells
    .filter((spell) => spell.level > 0)
    .map((spell) => spell.name);
  const previewSpellName =
    draft.builderSelections.spells[0] ??
    draft.builderSelections.cantrips[0] ??
    '';
  const previewSpellAssetKey = previewSpellName
    ? getSpellOptionAssetKey(previewSpellName)
    : selectedClassRules?.assetKey;

  return (
    <>
      <StepHeading
        intro="Prepare spell metadata from the selected class spell list. This stays local metadata; spell effects, slots in play, attacks, saves, and casting rules are not wired."
        title="Step 8 — Spells"
      />
      {spellcasting ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3 rounded-3xl border border-amber-500/20 bg-black/30 p-4">
              <label className="text-sm font-bold text-amber-100/75">
                Level
                <select
                  className="ml-2 rounded-xl border border-amber-500/25 bg-black/40 px-3 py-2 text-amber-50"
                  onChange={(event) => setLevelFilter(event.target.value)}
                  value={levelFilter}
                >
                  <option value="all">All</option>
                  <option value="0">Cantrips</option>
                  <option value="1">Level 1</option>
                </select>
              </label>
              <label className="text-sm font-bold text-amber-100/75">
                School
                <select
                  className="ml-2 rounded-xl border border-amber-500/25 bg-black/40 px-3 py-2 text-amber-50"
                  onChange={(event) => setSchoolFilter(event.target.value)}
                  value={schoolFilter}
                >
                  <option value="all">All</option>
                  {schoolOptions.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {spellcasting.cantripsKnown > 0 ? (
              <SelectionGroup
                getOptionAssetKey={getSpellOptionAssetKey}
                maxSelected={spellcasting.cantripsKnown}
                options={filteredCantrips}
                selected={draft.builderSelections.cantrips.filter((spell) =>
                  filteredCantrips.includes(spell),
                )}
                title={`${draft.className} Cantrips`}
                update={(cantrips) =>
                  setDraft({
                    ...draft,
                    builderSelections: {
                      ...draft.builderSelections,
                      cantrips,
                    },
                  })
                }
              />
            ) : null}
            <SelectionGroup
              getOptionAssetKey={getSpellOptionAssetKey}
              maxSelected={spellcasting.preparedSpells}
              options={filteredLeveledSpells}
              selected={draft.builderSelections.spells.filter((spell) =>
                filteredLeveledSpells.includes(spell),
              )}
              title={`${draft.className} Level 1 Spells`}
              update={(spells) =>
                setDraft({
                  ...draft,
                  builderSelections: {
                    ...draft.builderSelections,
                    spells,
                  },
                })
              }
            />
          </div>
          <div className="rounded-3xl border border-purple-300/25 bg-black/30 p-5">
            <PlaceholderArt
              assetKey={previewSpellAssetKey ?? undefined}
              label={previewSpellName || draft.className}
              size="wide"
            />
            <h3 className="mt-4 text-2xl font-black text-amber-50">
              {draft.className} Spell Setup
            </h3>
            <p className="mt-3 text-sm leading-6 text-amber-100/65">
              Ability {abilityLabels[spellcasting.ability]}. Choose{' '}
              {spellcasting.cantripsKnown} cantrips and{' '}
              {spellcasting.preparedSpells} level 1 spells from local SRD
              metadata. Class slots are noted as {spellcasting.spellSlotsLevel1}{' '}
              level 1 slot(s), but not executed here.
            </p>
            <PreviewStrip
              icon="*"
              items={draft.builderSelections.cantrips}
              title="Selected Cantrips"
            />
            <PreviewStrip
              icon="*"
              items={draft.builderSelections.spells}
              title="Selected Spells"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-8 text-center">
          <p className="text-2xl font-black text-amber-50">
            No spell setup required for this class in this MVP.
          </p>
          <p className="mt-3 text-amber-100/65">
            {draft.className} has no level 1 class spellcasting metadata in the
            local builder. Background origin feats and species spell traits are
            noted elsewhere but not automated as spell choices yet.
          </p>
        </div>
      )}
    </>
  );
}

function ReviewStep({ draft }: { draft: CharacterBuilderDraft }) {
  const summary = deriveCharacterBuilderSummary(draft);
  const abilityPreview = deriveAbilityScorePreview(draft);
  const ruleReview = deriveCharacterRuleReviewSummary(draft);
  const portraitAssetKey = getDraftPortraitAssetKey(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);

  return (
    <>
      <StepHeading
        intro="Review the local draft. Finalization is a visible placeholder until backend library persistence exists."
        title="Step 9 — Review"
      />
      <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
        <div className="overflow-hidden rounded-3xl border border-amber-500/25 bg-[linear-gradient(180deg,#d6bb83,#b9965f)] text-stone-950">
          <PlaceholderArt assetKey={portraitAssetKey} label={draft.name} />
          <div className="p-5">
            <h3 className="text-3xl font-black">{summary.name}</h3>
            <p className="mt-1 font-bold">{summary.title}</p>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-stone-700">
              {selectedProfile.displayName}
            </p>
            <p className="mt-4 text-sm leading-6">{draft.concept}</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ReviewCard title="Rules Profile">
            <PreviewRow label="Source" value={selectedProfile.sourceName} />
            <PreviewRow label="Version" value={selectedProfile.version} />
            <PreviewRow label="Year" value={selectedProfile.year} />
            <PreviewRow
              label="Type"
              value={`${selectedProfile.status} ${selectedProfile.sourceType}`}
            />
            <PreviewRow
              label="Ability Bonuses"
              value={selectedProfile.abilityBonusSource}
            />
          </ReviewCard>
          <ReviewCard title="Ability Scores">
            {abilityKeys.map((ability) => (
              <PreviewRow
                key={ability}
                label={abilityLabels[ability]}
                value={`${abilityPreview[ability].final} (${formatAbilityModifier(
                  abilityPreview[ability].final,
                )})`}
              />
            ))}
          </ReviewCard>
          <ReviewCard title="Derived Preview">
            <PreviewRow label="Hit Points" value={summary.hitPoints} />
            <PreviewRow label="Armor Class" value={summary.armorClass} />
            <PreviewRow
              label="Initiative"
              value={
                ruleReview.initiative >= 0
                  ? `+${ruleReview.initiative}`
                  : ruleReview.initiative
              }
            />
            <PreviewRow label="Speed" value={`${summary.speed} ft.`} />
            <PreviewRow
              label="Proficiency"
              value={`+${summary.proficiencyBonus}`}
            />
            <PreviewRow
              label="Saving Throws"
              value={ruleReview.savingThrows
                .map((ability) => ability.toUpperCase())
                .join(', ')}
            />
          </ReviewCard>
          <ReviewCard title="Proficiencies">
            <TagList values={ruleReview.skills} />
            <TagList values={ruleReview.languages} />
            <TagList values={ruleReview.tools} />
          </ReviewCard>
          <ReviewCard title="Equipment & Spells">
            <TagList values={ruleReview.equipment} />
            <TagList values={ruleReview.spells.cantrips} />
            <TagList values={ruleReview.spells.leveled} />
          </ReviewCard>
        </div>
      </div>
    </>
  );
}

function ChoiceCard({
  children,
  choice,
  onSelect,
  selected,
}: {
  children?: ReactNode;
  choice: {
    assetKey?: CharacterBuilderAssetKey;
    description: string;
    id: string;
    metadata: string[];
    title: string;
  };
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      className={[
        'overflow-hidden rounded-3xl border text-left transition',
        selected
          ? 'border-purple-300 bg-purple-950/35 shadow-[0_0_24px_rgba(168,85,247,0.35)]'
          : 'border-amber-500/20 bg-black/25 hover:border-amber-300/50',
      ].join(' ')}
      onClick={onSelect}
      type="button"
    >
      <PlaceholderArt
        assetKey={choice.assetKey}
        label={choice.title}
        size="choice"
      />
      <div className="bg-[linear-gradient(180deg,#d8bd84,#b9965f)] p-4 text-stone-950">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-2xl font-black">{choice.title}</h3>
          {selected ? (
            <span className="rounded-full bg-purple-950 px-2 py-1 text-xs font-black text-amber-100">
              ✓
            </span>
          ) : null}
        </div>
        <p className="mt-2 min-h-12 text-sm leading-5">{choice.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {choice.metadata.slice(0, 3).map((item) => (
            <span
              className="rounded-full bg-stone-950/80 px-2 py-1 text-xs font-bold text-amber-100"
              key={item}
            >
              {item}
            </span>
          ))}
        </div>
        {children}
      </div>
    </button>
  );
}

function PreviewStrip({
  icon,
  items,
  title,
}: {
  icon: string;
  items: string[];
  title: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-amber-500/20 bg-black/25 p-4">
      <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-300">
        {icon} {title}
      </p>
      <TagList values={items} />
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-amber-500/10 py-2 last:border-0">
      <dt className="text-amber-100/58">{label}</dt>
      <dd className="text-right font-bold text-amber-50">{value}</dd>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-black/30 p-4 text-center">
      <p className="text-sm uppercase tracking-[0.18em] text-amber-300/75">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-amber-50">{value}</p>
    </div>
  );
}

function RuleGrantPanel({
  title,
  values,
}: {
  title: string;
  values: string[];
}) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-black/25 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-300">
        {title}
      </p>
      <TagList values={values} />
    </div>
  );
}

function AssetThumb({
  assetKey,
  label,
}: {
  assetKey?: CharacterBuilderAssetKey | null;
  label: string;
}) {
  const imagePath = assetKey ? getCharacterBuilderAssetPath(assetKey) : null;
  const [failedAssetPath, setFailedAssetPath] = useState<string | null>(null);
  const shouldShowImage = Boolean(imagePath && imagePath !== failedAssetPath);
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
    <span className="relative grid h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-amber-300/25 bg-[radial-gradient(circle_at_25%_15%,rgba(168,85,247,0.5),transparent_35%),linear-gradient(135deg,#21140c,#0b0a0a)]">
      {shouldShowImage && imagePath ? (
        <Image
          alt=""
          className="object-cover"
          fill
          onError={() => setFailedAssetPath(imagePath)}
          sizes="44px"
          src={imagePath}
        />
      ) : (
        <span className="m-auto text-xs font-black text-amber-100/80">
          {initials || 'CB'}
        </span>
      )}
    </span>
  );
}

function SelectionGroup({
  getOptionAssetKey,
  maxSelected,
  options,
  selected,
  title,
  update,
}: {
  getOptionAssetKey?: (option: string) => CharacterBuilderAssetKey | null;
  maxSelected: number;
  options: string[];
  selected: string[];
  title: string;
  update: (values: string[]) => void;
}) {
  return (
    <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xl font-black text-amber-50">{title}</h3>
        <span className="rounded-full border border-amber-400/25 px-3 py-1 text-xs font-bold text-amber-100/65">
          {selected.length} / {maxSelected}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.length === 0 ? (
          <p className="rounded-2xl border border-amber-500/15 bg-black/20 px-4 py-3 text-sm text-amber-100/45">
            No selectable options for the current rules choices.
          </p>
        ) : null}
        {options.map((option) => {
          const active = selected.includes(option);
          const disabled = !active && selected.length >= maxSelected;
          const optionAssetKey = getOptionAssetKey?.(option) ?? null;

          return (
            <button
              className={[
                'rounded-2xl border px-4 py-3 text-left text-sm font-bold transition',
                active
                  ? 'border-purple-300/70 bg-purple-950/65 text-amber-50'
                  : disabled
                    ? 'cursor-not-allowed border-amber-500/10 bg-black/15 text-amber-100/35'
                    : 'border-amber-500/20 bg-black/25 text-amber-100/65 hover:border-amber-300/45',
              ].join(' ')}
              disabled={disabled}
              key={option}
              onClick={() =>
                update(toggleBuilderSelection(selected, option, maxSelected))
              }
              type="button"
            >
              {active ? '✓ ' : '○ '}
              {optionAssetKey ? (
                <span className="mx-3 inline-flex align-middle">
                  <AssetThumb assetKey={optionAssetKey} label={option} />
                </span>
              ) : null}
              <span>{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReviewCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-5">
      <h3 className="mb-3 text-xl font-black text-amber-50">{title}</h3>
      {children}
    </div>
  );
}

function TagList({ values }: { values: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {values.length > 0 ? (
        values.map((value) => (
          <span
            className="rounded-full border border-amber-400/20 bg-amber-950/35 px-3 py-1 text-xs font-bold text-amber-100/75"
            key={value}
          >
            {value}
          </span>
        ))
      ) : (
        <span className="text-sm text-amber-100/45">None selected yet.</span>
      )}
    </div>
  );
}

function CharacterSummaryPanel({
  draft,
  notice,
}: {
  draft: CharacterBuilderDraft;
  notice: string;
}) {
  const summary = deriveCharacterBuilderSummary(draft);
  const selectedSpecies = getSelectedSpecies(draft);
  const selectedClass = getSelectedClass(draft);
  const selectedBackground = getSelectedBackground(draft);
  const completionCount = getBuilderCompletionCount(draft);
  const ruleReview = deriveCharacterRuleReviewSummary(draft);
  const portraitAssetKey = getDraftPortraitAssetKey(draft);
  const selectedProfile = getRuleProfileById(draft.rulesProfileId);

  return (
    <aside className="rounded-3xl border border-amber-500/25 bg-black/35 p-5 shadow-2xl shadow-black/40">
      <h2 className="text-xl font-black text-amber-50">Character Summary</h2>
      <div className="mt-5 flex items-start gap-4">
        <PlaceholderArt
          assetKey={portraitAssetKey}
          label={summary.name}
          size="small"
        />
        <div>
          <h3 className="text-xl font-black text-amber-50">{summary.name}</h3>
          <p className="text-sm text-amber-100/60">{summary.title}</p>
          <div className="mt-2">
            <StatusBadge status={summary.status} />
          </div>
        </div>
      </div>

      <dl className="mt-6 space-y-2 text-sm">
        <PreviewRow label="Rules" value={selectedProfile.displayName} />
        <PreviewRow
          label={selectedProfile.speciesLabel}
          value={selectedSpecies?.title ?? '—'}
        />
        <PreviewRow label="Class" value={selectedClass?.title ?? '—'} />
        <PreviewRow
          label="Background"
          value={selectedBackground?.title ?? '—'}
        />
        <PreviewRow label="Level" value={summary.level} />
        <PreviewRow label="HP" value={summary.hitPoints} />
        <PreviewRow label="AC" value={summary.armorClass} />
        <PreviewRow label="Speed" value={`${summary.speed} ft.`} />
        <PreviewRow
          label="Proficiency"
          value={`+${ruleReview.proficiencyBonus}`}
        />
        <PreviewRow
          label="Skills"
          value={`${ruleReview.skills.length} total`}
        />
      </dl>

      <div className="mt-6 border-t border-amber-500/15 pt-5">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-300">
          Builder Progress
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {builderSteps.map((step, index) => {
            const active = step.id === draft.builderStep;
            const complete = index < completionCount;
            const label =
              step.id === 'species' ? selectedProfile.speciesLabel : step.label;

            return (
              <span
                className={[
                  'grid h-8 w-8 place-items-center rounded-full border text-xs font-black',
                  active
                    ? 'border-purple-200 bg-purple-700 text-white shadow-[0_0_18px_rgba(192,132,252,0.8)]'
                    : complete
                      ? 'border-emerald-300/50 bg-emerald-950 text-emerald-100'
                      : 'border-amber-500/25 bg-black/30 text-amber-100/55',
                ].join(' ')}
                key={step.id}
                title={label}
              >
                {index + 1}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-purple-300/25 bg-purple-950/25 p-4 text-sm leading-6 text-purple-100/80">
        {notice}
      </div>
    </aside>
  );
}
