'use client';

import { LanguageSwitcher } from '../../../lib/i18n';
import { CharacterSheet } from './components/sheet/CharacterSheet';
import { AbilityScoresStep } from './components/steps/AbilityScoresStep';
import { BackgroundStep } from './components/steps/BackgroundStep';
import { CharacterDetailsStep } from './components/steps/CharacterDetailsStep';
import { ClassStep } from './components/steps/ClassStep';
import { RaceStep } from './components/steps/RaceStep';
import { StepLayout } from './components/layout/StepLayout';
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

const STEP_ORDER: StepId[] = [
  'race',
  'class',
  'background',
  'abilityScores',
  'details',
  'sheet',
];

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
      return hasValidSpellChoices(store);
    case 'details':
      return name.trim().length > 0;
    case 'sheet':
      return true;
    default:
      return false;
  }
}

function BuilderApp() {
  const { currentStep, setStep } = useCharacterStore();
  const { copy } = useBuilderI18n();
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
        return <CharacterSheet />;
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
          <CharacterSheet />
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
    >
      {renderStep()}
    </StepLayout>
  );
}

export default function App() {
  return (
    <CharacterStoreProvider>
      <BuilderApp />
    </CharacterStoreProvider>
  );
}
