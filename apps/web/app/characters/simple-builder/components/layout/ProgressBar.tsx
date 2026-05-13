import type { StepId } from '../../types'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'race', label: 'Race' },
  { id: 'class', label: 'Class' },
  { id: 'background', label: 'Background' },
  { id: 'abilityScores', label: 'Abilities' },
  { id: 'details', label: 'Details' },
  { id: 'sheet', label: 'Sheet' },
]

const STEP_ORDER: StepId[] = STEPS.map((s) => s.id)

interface Props {
  currentStep: StepId
  onNavigate: (step: StepId) => void
}

export function ProgressBar({ currentStep, onNavigate }: Props) {
  const currentIndex = STEP_ORDER.indexOf(currentStep)

  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-2xl mx-auto px-4 py-6">
      {STEPS.map((step, i) => {
        const isDone = i < currentIndex
        const isCurrent = i === currentIndex

        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <button
                onClick={() => isDone && onNavigate(step.id)}
                disabled={!isDone}
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-200 select-none',
                  isDone
                    ? 'bg-[var(--color-gold)] text-[#0f1117] cursor-pointer hover:brightness-110'
                    : isCurrent
                    ? 'border-2 border-[var(--color-gold)] text-[var(--color-gold)] ring-2 ring-[var(--color-gold)] ring-offset-2 ring-offset-[var(--color-bg)] animate-pulse cursor-default'
                    : 'border-2 border-[var(--color-border)] text-[var(--color-text-muted)] cursor-default',
                ].join(' ')}
              >
                {isDone ? '✓' : i + 1}
              </button>
              <span
                className={[
                  'text-[11px] mt-1 font-medium tracking-wide whitespace-nowrap',
                  isCurrent ? 'text-[var(--color-gold)]' : isDone ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-muted)] opacity-50',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  'flex-1 h-px mx-1 mb-4 transition-all duration-300',
                  isDone ? 'bg-[var(--color-gold)]' : 'bg-[var(--color-border)]',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
