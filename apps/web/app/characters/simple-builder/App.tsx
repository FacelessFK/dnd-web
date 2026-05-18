'use client';

import { useEffect, useState } from 'react';
import type {
  CharacterLibraryEntry,
  CharacterLibraryEntryId,
} from '@dnd/protocol';

import { useAuth } from '../../../lib/auth-context';
import {
  getCharacterLibraryEntry,
  updateCharacterLibraryEntry,
} from '../../../lib/character-library-api';
import {
  formatCharacterLibrarySaveFailure,
  getPortraitDataUrlValidationMessage,
} from '../../../lib/character-library-errors';
import { getPortraitImageSource } from '../../../lib/character-library-mappers';
import { LanguageSwitcher } from '../../../lib/i18n';
import { BACKGROUNDS } from './data/backgrounds';
import { CLASSES } from './data/classes';
import { RACES } from './data/races';
import { CharacterSheet } from './components/sheet/CharacterSheet';
import { AbilityScoresStep } from './components/steps/AbilityScoresStep';
import { BackgroundStep } from './components/steps/BackgroundStep';
import { CharacterDetailsStep } from './components/steps/CharacterDetailsStep';
import { ClassStep } from './components/steps/ClassStep';
import { RaceStep } from './components/steps/RaceStep';
import { StepLayout } from './components/layout/StepLayout';
import {
  createSimpleBuilderLibraryEntry,
  createSimpleBuilderSelections,
  toCharacterLibraryEntryInput,
} from './library-entry';
import { useBuilderI18n } from './localization';
import {
  CharacterStoreProvider,
  useCharacterStore,
} from './store/characterStore';
import {
  getBackgroundLanguageChoiceLimit,
  getConflictingSkill,
  getRaceLanguageChoiceLimit,
  getRaceSkillChoiceLimit,
  hasValidClassEquipmentChoices,
  hasValidSpellChoices,
} from './store/selectors';
import type { StepId } from './types';
import type { AbilityName, CharacterState, SkillName } from './types';

const STEP_ORDER: StepId[] = [
  'race',
  'class',
  'background',
  'abilityScores',
  'details',
  'sheet',
];

const entryAbilityToName: Record<
  keyof CharacterLibraryEntry['abilities'],
  AbilityName
> = {
  cha: 'CHA',
  con: 'CON',
  dex: 'DEX',
  int: 'INT',
  str: 'STR',
  wis: 'WIS',
};

function findByName<T extends { id: string; name: string }>(
  candidates: T[],
  value: string,
): T | null {
  const normalizedValue = value.trim().toLowerCase();

  return (
    candidates.find(
      (candidate) =>
        candidate.name.toLowerCase() === normalizedValue ||
        candidate.id.toLowerCase() === normalizedValue,
    ) ?? null
  );
}

function characterLibraryEntryToSimpleState(
  entry: CharacterLibraryEntry,
): CharacterState {
  const abilityScores = Object.fromEntries(
    Object.entries(entry.abilities).map(([ability, score]) => [
      entryAbilityToName[ability as keyof CharacterLibraryEntry['abilities']],
      score,
    ]),
  ) as CharacterState['abilityScores'];

  return {
    abilityScores,
    age: '',
    alignment: null,
    background: findByName(BACKGROUNDS, entry.background),
    backgroundLanguageChoices: entry.builderSelections.languages,
    backgroundSkillOverride: null,
    backstory: entry.notes ?? entry.concept ?? '',
    classEquipmentChoices: {},
    classSkillChoices: entry.builderSelections.skills as SkillName[],
    classSpellChoices: {
      cantrips: entry.builderSelections.cantrips,
      preparedSpells: entry.builderSelections.spells,
    },
    currentStep: 'details',
    dndClass: findByName(CLASSES, entry.className),
    height: '',
    name: entry.name,
    portraitDataUrl:
      entry.portrait?.kind === 'uploaded'
        ? (getPortraitImageSource(entry.portrait) ?? '')
        : '',
    pronouns: entry.pronouns ?? '',
    race: findByName(RACES, entry.speciesOrRace),
    raceLanguageChoices: [],
    raceSkillChoices: [],
    subrace: null,
    weight: '',
  };
}

function useStepValidity(): boolean {
  const store = useCharacterStore();
  const {
    background,
    backgroundLanguageChoices,
    backgroundSkillOverride,
    classSkillChoices,
    currentStep,
    dndClass,
    name,
    race,
    raceLanguageChoices,
    raceSkillChoices,
    subrace,
  } = store;

  switch (currentStep) {
    case 'race':
      if (!race) return false;
      if (race.subraces && !subrace) return false;
      if (raceLanguageChoices.length < getRaceLanguageChoiceLimit(store)) {
        return false;
      }
      if (raceSkillChoices.length < getRaceSkillChoiceLimit(store)) {
        return false;
      }
      return true;
    case 'class':
      if (!dndClass) return false;
      if (classSkillChoices.length < dndClass.numSkillChoices) return false;
      if (!hasValidClassEquipmentChoices(store)) return false;
      if (!hasValidSpellChoices(store)) return false;
      return true;
    case 'background': {
      if (!background) return false;
      const conflict = getConflictingSkill(store);
      if (conflict && !backgroundSkillOverride) return false;
      if (
        backgroundLanguageChoices.length <
        getBackgroundLanguageChoiceLimit(store)
      ) {
        return false;
      }
      return true;
    }
    case 'abilityScores':
      return true;
    case 'details':
      return name.trim().length > 0;
    case 'sheet':
      return true;
    default:
      return false;
  }
}

function BuilderApp({
  characterId,
  mode = 'new',
}: {
  characterId?: CharacterLibraryEntryId;
  mode?: 'edit' | 'new';
}) {
  const store = useCharacterStore();
  const { currentStep, setStep } = store;
  const { copy, isFa } = useBuilderI18n();
  const { user } = useAuth();
  const [savingDraft, setSavingDraft] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const isValid = useStepValidity();

  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentStep === 'details';

  const handleNext = () => {
    if (!isValid) return;
    const nextStep = STEP_ORDER[currentIndex + 1];
    if (nextStep) {
      setStep(nextStep);
    }
  };

  const handleBack = () => {
    const previousStep = STEP_ORDER[currentIndex - 1];
    if (previousStep) {
      setStep(previousStep);
    }
  };

  const handleNavigate = (step: StepId) => {
    const targetIndex = STEP_ORDER.indexOf(step);
    if (targetIndex < currentIndex) {
      setStep(step);
    }
  };

  const handleSaveDraft = async () => {
    if (!user || !characterId) {
      setSaveNotice(
        isFa
          ? 'برای ذخیره تغییرات باید وارد حساب کاربری شوید.'
          : 'Sign in before saving changes.',
      );
      return;
    }

    const portraitError = getPortraitDataUrlValidationMessage(
      store.portraitDataUrl,
      isFa,
    );

    if (portraitError) {
      setSaveNotice(portraitError);
      return;
    }

    setSavingDraft(true);
    setSaveNotice('');

    const entry = createSimpleBuilderLibraryEntry(
      store,
      createSimpleBuilderSelections(store),
      'dnd-2024-template',
      user.id,
    );
    const result = await updateCharacterLibraryEntry(
      user.id,
      characterId,
      toCharacterLibraryEntryInput(entry),
    );

    setSaveNotice(
      result.ok
        ? isFa
          ? 'تغییرات ذخیره شد؛ کتابخانه همین پرتره را نمایش می‌دهد.'
          : 'Changes saved; the library will show this portrait.'
        : `${isFa ? 'ذخیره ناموفق بود' : 'Save failed'}: ${formatCharacterLibrarySaveFailure(
            result.error.message,
            isFa,
          )}`,
    );
    setSavingDraft(false);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'race':
        return <RaceStep />;
      case 'class':
        return <ClassStep />;
      case 'background':
        return <BackgroundStep />;
      case 'abilityScores':
        return <AbilityScoresStep />;
      case 'details':
        return <CharacterDetailsStep />;
      case 'sheet':
        return <CharacterSheet characterId={characterId} mode={mode} />;
      default:
        return null;
    }
  };

  if (currentStep === 'sheet') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <header
          className="no-print sticky top-0 z-50 border-b border-[var(--color-border)] backdrop-blur-sm"
          style={{ background: 'rgba(15,17,23,0.85)' }}
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
            <button
              className="rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              onClick={() => setStep('details')}
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
              type="button"
            >
              {copy.back}
            </button>
            <span className="text-2xl">D20</span>
            <h1
              className="text-lg font-bold tracking-wide"
              style={{ color: 'var(--color-gold)' }}
            >
              {copy.builderTitle}
            </h1>
            <div className="ml-auto">
              <LanguageSwitcher />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">
          <CharacterSheet characterId={characterId} mode={mode} />
        </main>
      </div>
    );
  }

  return (
    <StepLayout
      currentStep={currentStep}
      isFirstStep={isFirstStep}
      isLastStep={isLastStep}
      isValid={isValid}
      onBack={handleBack}
      onNavigate={handleNavigate}
      onNext={handleNext}
      onSaveDraft={mode === 'edit' ? () => void handleSaveDraft() : undefined}
      saveDisabled={savingDraft}
      saveLabel={isFa ? 'ذخیره تغییرات' : 'Save Changes'}
      saveNotice={saveNotice}
    >
      {renderStep()}
    </StepLayout>
  );
}

export default function App({
  characterId,
  mode = 'new',
}: {
  characterId?: string;
  mode?: 'edit' | 'new';
}) {
  const { loading: authLoading, user } = useAuth();
  const [initialState, setInitialState] = useState<CharacterState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const editing = mode === 'edit' && characterId;

  useEffect(() => {
    let active = true;

    async function loadEntry() {
      if (!editing) {
        setInitialState(null);
        setLoadError(null);
        return;
      }

      if (!user) {
        return;
      }

      setLoadError(null);
      const result = await getCharacterLibraryEntry(
        user.id,
        characterId as CharacterLibraryEntryId,
      );

      if (!active) {
        return;
      }

      if (result.ok) {
        setInitialState(characterLibraryEntryToSimpleState(result.data));
      } else {
        setLoadError(result.error.message);
      }
    }

    void loadEntry();

    return () => {
      active = false;
    };
  }, [characterId, editing, user]);

  if (authLoading || (editing && user && !initialState && !loadError)) {
    return (
      <div
        className="grid min-h-screen place-items-center px-4 text-center"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        در حال آماده‌سازی کاراکتر...
      </div>
    );
  }

  if (editing && !user) {
    return (
      <div
        className="grid min-h-screen place-items-center px-4 text-center"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        برای ویرایش کاراکتر باید وارد حساب کاربری شوید.
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="grid min-h-screen place-items-center px-4 text-center"
        style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        ویرایش کاراکتر بارگذاری نشد: {loadError}
      </div>
    );
  }

  return (
    <CharacterStoreProvider
      initialState={initialState ?? undefined}
      key={editing ? characterId : 'new-character'}
    >
      <BuilderApp
        characterId={characterId as CharacterLibraryEntryId | undefined}
        mode={mode}
      />
    </CharacterStoreProvider>
  );
}
