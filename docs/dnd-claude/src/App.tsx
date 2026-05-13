import { useCharacterStore } from './store/characterStore'
import { getConflictingSkill } from './store/selectors'
import { StepLayout } from './components/layout/StepLayout'
import { RaceStep } from './components/steps/RaceStep'
import { ClassStep } from './components/steps/ClassStep'
import { BackgroundStep } from './components/steps/BackgroundStep'
import { AbilityScoresStep } from './components/steps/AbilityScoresStep'
import { CharacterDetailsStep } from './components/steps/CharacterDetailsStep'
import { CharacterSheet } from './components/sheet/CharacterSheet'
import type { StepId } from './types'

const STEP_ORDER: StepId[] = ['race', 'class', 'background', 'abilityScores', 'details', 'sheet']

function useStepValidity(): boolean {
  const store = useCharacterStore()
  const { currentStep, race, subrace, dndClass, classSkillChoices, background,
    backgroundSkillOverride, name } = store

  switch (currentStep) {
    case 'race':
      if (!race) return false
      if (race.subraces && !subrace) return false
      return true
    case 'class':
      if (!dndClass) return false
      if (classSkillChoices.length < dndClass.numSkillChoices) return false
      return true
    case 'background': {
      if (!background) return false
      const conflict = getConflictingSkill(store)
      if (conflict && !backgroundSkillOverride) return false
      return true
    }
    case 'abilityScores':
      return true
    case 'details':
      return name.trim().length > 0
    case 'sheet':
      return true
    default:
      return false
  }
}

export default function App() {
  const { currentStep, setStep } = useCharacterStore()
  const isValid = useStepValidity()

  const currentIndex = STEP_ORDER.indexOf(currentStep)
  const isFirstStep = currentIndex === 0
  const isLastStep = currentStep === 'details'

  const handleNext = () => {
    if (!isValid) return
    const nextIndex = currentIndex + 1
    if (nextIndex < STEP_ORDER.length) {
      setStep(STEP_ORDER[nextIndex])
    }
  }

  const handleBack = () => {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) {
      setStep(STEP_ORDER[prevIndex])
    }
  }

  const handleNavigate = (step: StepId) => {
    const targetIndex = STEP_ORDER.indexOf(step)
    if (targetIndex < currentIndex) {
      setStep(step)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 'race': return <RaceStep />
      case 'class': return <ClassStep />
      case 'background': return <BackgroundStep />
      case 'abilityScores': return <AbilityScoresStep />
      case 'details': return <CharacterDetailsStep />
      case 'sheet': return <CharacterSheet />
      default: return null
    }
  }

  if (currentStep === 'sheet') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <header className="no-print sticky top-0 z-50 backdrop-blur-sm border-b border-(--color-border)"
          style={{ background: 'rgba(15,17,23,0.85)' }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setStep('details')}
              className="text-sm px-3 py-1.5 rounded-lg border transition-colors hover:border-(--color-gold) hover:text-(--color-gold)"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
            >
              ← Back
            </button>
            <span className="text-2xl">⚔️</span>
            <h1 className="text-lg font-bold tracking-wide" style={{ color: 'var(--color-gold)' }}>
              D&D Character Builder
            </h1>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          <CharacterSheet />
        </main>
      </div>
    )
  }

  return (
    <StepLayout
      currentStep={currentStep}
      onNavigate={handleNavigate}
      onNext={handleNext}
      onBack={handleBack}
      isValid={isValid}
      isFirstStep={isFirstStep}
      isLastStep={isLastStep}
    >
      {renderStep()}
    </StepLayout>
  )
}
