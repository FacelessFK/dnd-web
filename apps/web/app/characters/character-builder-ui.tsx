'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

import {
  getCharacterBuilderAssetFallbackLabel,
  type CharacterBuilderAssetKey,
} from '../../lib/character-builder-assets';
import {
  abilityKeys,
  backgroundChoices,
  builderSteps,
  cantripOptions,
  classChoices,
  equipmentOptions,
  languageOptions,
  mockCharacterLibraryEntries,
  skillOptions,
  spellOptions,
  speciesChoices,
  toolOptions,
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
} from '../../lib/character-builder-helpers';

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

const casterClasses = new Set([
  'Bard',
  'Cleric',
  'Paladin',
  'Ranger',
  'Warlock',
  'Wizard',
]);

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
  return (
    <main className="min-h-screen overflow-hidden bg-[#090806] text-amber-50">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(124,58,237,0.22),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(217,119,6,0.18),transparent_28%),linear-gradient(135deg,#100b09_0%,#080b10_55%,#050403_100%)]" />
      <div className="relative grid min-h-screen lg:grid-cols-[18rem_1fr]">
        <aside className="border-r border-amber-700/30 bg-black/35 px-5 py-6 shadow-2xl shadow-black/50 backdrop-blur">
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
  size?: 'small' | 'large' | 'wide';
}) {
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
      aria-label={`${label} placeholder art`}
      className={[
        'relative grid overflow-hidden rounded-2xl border border-amber-400/35 bg-[radial-gradient(circle_at_28%_18%,rgba(168,85,247,0.55),transparent_24%),radial-gradient(circle_at_72%_80%,rgba(217,119,6,0.38),transparent_30%),linear-gradient(135deg,#1b1225,#101827_55%,#21140c)] shadow-inner shadow-black/45',
        size === 'small' ? 'h-20 w-20' : '',
        size === 'large' ? 'h-48 w-full' : '',
        size === 'wide' ? 'h-40 w-full' : '',
      ].join(' ')}
    >
      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_46%,rgba(251,191,36,0.12)_48%,transparent_50%)]" />
      <span className="m-auto rounded-full border border-amber-200/35 bg-black/35 px-4 py-2 text-xl font-black tracking-[0.18em] text-amber-100">
        {initials || 'CB'}
      </span>
      <span className="absolute bottom-2 left-2 right-2 truncate rounded-full bg-black/45 px-2 py-1 text-center text-[0.65rem] uppercase tracking-[0.18em] text-amber-100/70">
        Placeholder
      </span>
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
        size="large"
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
        />

        <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <ParchmentPanel className="min-w-0">
            <BuilderStepContent draft={draft} setDraft={updateDraft} />

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
                    disabled={currentStepIndex < 0}
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
}: {
  currentStep: BuilderStepId;
  onStepChange: (step: BuilderStepId) => void;
}) {
  const currentIndex = getBuilderStepIndex(currentStep);

  return (
    <div className="overflow-x-auto rounded-3xl border border-amber-500/20 bg-black/25 px-4 py-5">
      <ol className="grid min-w-[58rem] grid-cols-9 gap-3">
        {builderSteps.map((step, index) => {
          const active = step.id === currentStep;
          const complete = index < currentIndex;

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
                {step.label}
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
          <PlaceholderArt label={draft.name || 'Adventurer'} />
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

  return (
    <>
      <StepHeading
        intro="Choose your character's species. This scaffold shows descriptive metadata only."
        title="Step 2 — Species"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {speciesChoices.map((choice) => (
          <ChoiceCard
            choice={choice}
            key={choice.id}
            onSelect={() =>
              setDraft({
                ...draft,
                speciesOrRace: choice.id,
              })
            }
            selected={draft.speciesOrRace === choice.id}
          />
        ))}
      </div>
      {selectedSpecies ? (
        <PreviewStrip
          icon="✦"
          items={selectedSpecies.metadata}
          title={`${selectedSpecies.title} Traits`}
        />
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

  return (
    <>
      <StepHeading
        intro="Choose training, role, and combat identity. No runtime combat integration is performed here yet."
        title="Step 3 — Class"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {classChoices.map((choice) => (
            <ChoiceCard
              choice={choice}
              key={choice.id}
              onSelect={() =>
                setDraft({
                  ...draft,
                  className: choice.id,
                })
              }
              selected={draft.className === choice.id}
            >
              <span className="mt-2 inline-flex rounded-full bg-emerald-950/80 px-2 py-1 text-xs font-bold text-emerald-100">
                {choice.difficulty}
              </span>
            </ChoiceCard>
          ))}
        </div>
        {selectedClass ? (
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
                value={abilityLabels[selectedClass.primaryAbility]}
              />
              <PreviewRow label="Armor" value={selectedClass.armor} />
              <PreviewRow label="Weapons" value={selectedClass.weapons} />
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

  return (
    <>
      <StepHeading
        intro="Your background frames who you were before the first adventure."
        title="Step 4 — Background"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-3">
          {backgroundChoices.map((choice) => (
            <button
              className={[
                'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition',
                draft.background === choice.id
                  ? 'border-purple-300/70 bg-purple-950/50 shadow-lg shadow-purple-950/25'
                  : 'border-amber-500/20 bg-amber-950/12 hover:border-amber-300/45',
              ].join(' ')}
              key={choice.id}
              onClick={() =>
                setDraft({
                  ...draft,
                  background: choice.id,
                  builderSelections: {
                    ...draft.builderSelections,
                    languages: choice.languages,
                    skills: choice.proficiencies,
                    tools: choice.tools,
                  },
                })
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
        {selectedBackground ? (
          <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-5">
            <h3 className="text-3xl font-black text-amber-50">
              {selectedBackground.title}
            </h3>
            <p className="mt-3 text-sm leading-6 text-amber-100/65">
              {selectedBackground.description}
            </p>
            <PreviewStrip
              icon="✧"
              items={selectedBackground.proficiencies}
              title="Proficiencies"
            />
            <PreviewStrip
              icon="◌"
              items={selectedBackground.languages}
              title="Languages"
            />
            <PreviewStrip
              icon="◆"
              items={selectedBackground.tools}
              title="Tools"
            />
            <div className="mt-4 rounded-2xl border border-purple-300/25 bg-purple-950/25 p-4">
              <p className="font-black text-amber-200">
                Feature: {selectedBackground.feature}
              </p>
              <p className="mt-2 text-sm leading-6 text-amber-100/65">
                Descriptive metadata only. No rules effects are applied in this
                scaffold.
              </p>
            </div>
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
  const selectedClass = getSelectedClass(draft);

  return (
    <>
      <StepHeading
        intro="Tune local ability previews with simple min/max constraints. This is not full official point-buy automation."
        title="Step 5 — Ability Scores"
      >
        {selectedClass ? (
          <div className="mt-5 rounded-2xl border border-amber-500/20 bg-black/30 p-4 text-sm text-amber-100/75">
            Recommended for {selectedClass.title}:{' '}
            <span className="font-black text-amber-200">
              {abilityLabels[selectedClass.primaryAbility]}
            </span>
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
              {draft.abilities[ability]}
            </p>
            <p className="text-2xl font-black">
              {formatAbilityModifier(draft.abilities[ability])}
            </p>
            <p className="text-xs font-semibold uppercase">Modifier</p>
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
  return (
    <>
      <StepHeading
        intro="Choose skills, languages, tools, and special options as local metadata. Counts are intentionally lightweight."
        title="Step 6 — Choices & Proficiencies"
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <SelectionGroup
          maxSelected={2}
          options={skillOptions}
          selected={draft.builderSelections.skills}
          title="Skill Proficiencies"
          update={(skills) =>
            setDraft({
              ...draft,
              builderSelections: {
                ...draft.builderSelections,
                skills,
              },
            })
          }
        />
        <SelectionGroup
          maxSelected={3}
          options={languageOptions}
          selected={draft.builderSelections.languages}
          title="Languages"
          update={(languages) =>
            setDraft({
              ...draft,
              builderSelections: {
                ...draft.builderSelections,
                languages,
              },
            })
          }
        />
        <SelectionGroup
          maxSelected={1}
          options={toolOptions}
          selected={draft.builderSelections.tools}
          title="Tool Proficiencies"
          update={(tools) =>
            setDraft({
              ...draft,
              builderSelections: {
                ...draft.builderSelections,
                tools,
              },
            })
          }
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <SelectionGroup
          maxSelected={3}
          options={cantripOptions}
          selected={draft.builderSelections.cantrips}
          title="Cantrips / Special Choices"
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
  return (
    <>
      <StepHeading
        intro="Accept a recommended loadout or choose equipment metadata manually. No inventory or weapon rules are wired."
        title="Step 7 — Equipment"
      />
      <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
        <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-5">
          <h3 className="text-2xl font-black text-amber-50">
            Recommended Loadout
          </h3>
          <p className="mt-2 text-sm text-amber-100/65">
            A balanced starting package for a {draft.className}{' '}
            {draft.background}.
          </p>
          <PlaceholderArt label={`${draft.className} loadout`} size="wide" />
          <PrimaryButton
            onClick={() =>
              setDraft({
                ...draft,
                builderSelections: {
                  ...draft.builderSelections,
                  equipment: [
                    'Quarterstaff',
                    'Arcane Focus',
                    "Scholar's Pack",
                    'Spellbook',
                    'Traveling Clothes',
                  ],
                },
              })
            }
          >
            Use Recommended
          </PrimaryButton>
        </div>
        <SelectionGroup
          maxSelected={6}
          options={equipmentOptions}
          selected={draft.builderSelections.equipment}
          title="Manual Choice"
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
  const isCaster = casterClasses.has(draft.className);

  return (
    <>
      <StepHeading
        intro="Prepare spell metadata for future library integration. No spellcasting rules or effects are implemented."
        title="Step 8 — Spells"
      />
      {isCaster ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <SelectionGroup
            maxSelected={4}
            options={spellOptions}
            selected={draft.builderSelections.spells}
            title={`${draft.className} Spell List`}
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
          <div className="rounded-3xl border border-purple-300/25 bg-black/30 p-5">
            <PlaceholderArt label="Magic Missile" size="wide" />
            <h3 className="mt-4 text-2xl font-black text-amber-50">
              Spell Preview
            </h3>
            <p className="mt-3 text-sm leading-6 text-amber-100/65">
              Spell descriptions are mock metadata. Runtime spellcasting, slots,
              attacks, saves, and effects are intentionally out of scope.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-amber-500/20 bg-black/30 p-8 text-center">
          <p className="text-2xl font-black text-amber-50">
            No spell setup required yet.
          </p>
          <p className="mt-3 text-amber-100/65">
            {draft.className} is treated as a non-caster for this local
            scaffold.
          </p>
        </div>
      )}
    </>
  );
}

function ReviewStep({ draft }: { draft: CharacterBuilderDraft }) {
  const summary = deriveCharacterBuilderSummary(draft);

  return (
    <>
      <StepHeading
        intro="Review the local draft. Finalization is a visible placeholder until backend library persistence exists."
        title="Step 9 — Review"
      />
      <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
        <div className="overflow-hidden rounded-3xl border border-amber-500/25 bg-[linear-gradient(180deg,#d6bb83,#b9965f)] text-stone-950">
          <PlaceholderArt label={draft.name} />
          <div className="p-5">
            <h3 className="text-3xl font-black">{summary.name}</h3>
            <p className="mt-1 font-bold">{summary.title}</p>
            <p className="mt-4 text-sm leading-6">{draft.concept}</p>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ReviewCard title="Ability Scores">
            {abilityKeys.map((ability) => (
              <PreviewRow
                key={ability}
                label={abilityLabels[ability]}
                value={`${draft.abilities[ability]} (${formatAbilityModifier(
                  draft.abilities[ability],
                )})`}
              />
            ))}
          </ReviewCard>
          <ReviewCard title="Derived Preview">
            <PreviewRow label="Hit Points" value={summary.hitPoints} />
            <PreviewRow label="Armor Class" value={summary.armorClass} />
            <PreviewRow label="Speed" value={`${summary.speed} ft.`} />
            <PreviewRow
              label="Proficiency"
              value={`+${summary.proficiencyBonus}`}
            />
          </ReviewCard>
          <ReviewCard title="Proficiencies">
            <TagList values={draft.builderSelections.skills} />
            <TagList values={draft.builderSelections.languages} />
            <TagList values={draft.builderSelections.tools} />
          </ReviewCard>
          <ReviewCard title="Equipment & Spells">
            <TagList values={draft.builderSelections.equipment} />
            <TagList values={draft.builderSelections.cantrips} />
            <TagList values={draft.builderSelections.spells} />
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
        size="wide"
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

function SelectionGroup({
  maxSelected,
  options,
  selected,
  title,
  update,
}: {
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
        {options.map((option) => {
          const active = selected.includes(option);

          return (
            <button
              className={[
                'rounded-2xl border px-4 py-3 text-left text-sm font-bold transition',
                active
                  ? 'border-purple-300/70 bg-purple-950/65 text-amber-50'
                  : 'border-amber-500/20 bg-black/25 text-amber-100/65 hover:border-amber-300/45',
              ].join(' ')}
              key={option}
              onClick={() =>
                update(toggleBuilderSelection(selected, option, maxSelected))
              }
              type="button"
            >
              {active ? '✓ ' : '○ '}
              {option}
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

  return (
    <aside className="rounded-3xl border border-amber-500/25 bg-black/35 p-5 shadow-2xl shadow-black/40">
      <h2 className="text-xl font-black text-amber-50">Character Summary</h2>
      <div className="mt-5 flex items-start gap-4">
        <PlaceholderArt label={summary.name} size="small" />
        <div>
          <h3 className="text-xl font-black text-amber-50">{summary.name}</h3>
          <p className="text-sm text-amber-100/60">{summary.title}</p>
          <div className="mt-2">
            <StatusBadge status={summary.status} />
          </div>
        </div>
      </div>

      <dl className="mt-6 space-y-2 text-sm">
        <PreviewRow label="Species" value={selectedSpecies?.title ?? '—'} />
        <PreviewRow label="Class" value={selectedClass?.title ?? '—'} />
        <PreviewRow
          label="Background"
          value={selectedBackground?.title ?? '—'}
        />
        <PreviewRow label="Level" value={summary.level} />
        <PreviewRow label="HP" value={summary.hitPoints} />
        <PreviewRow label="AC" value={summary.armorClass} />
        <PreviewRow label="Speed" value={`${summary.speed} ft.`} />
      </dl>

      <div className="mt-6 border-t border-amber-500/15 pt-5">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-amber-300">
          Builder Progress
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {builderSteps.map((step, index) => {
            const active = step.id === draft.builderStep;
            const complete = index < completionCount;

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
                title={step.label}
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
