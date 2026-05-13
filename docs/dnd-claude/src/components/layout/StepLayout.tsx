import type { ReactNode } from 'react'
import type { StepId } from '../../types'
import { ProgressBar } from './ProgressBar'

interface Props {
  currentStep: StepId
  onNavigate: (step: StepId) => void
  onNext: () => void
  onBack: () => void
  isValid: boolean
  isFirstStep: boolean
  isLastStep: boolean
  children: ReactNode
}

export function StepLayout({ currentStep, onNavigate, onNext, onBack, isValid, isFirstStep, isLastStep, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      <header className="no-print sticky top-0 z-50 backdrop-blur-sm border-b border-[var(--color-border)]"
        style={{ background: 'rgba(15,17,23,0.85)' }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-3 py-3">
            <span className="text-2xl">⚔️</span>
            <h1 className="text-lg font-bold tracking-wide" style={{ color: 'var(--color-gold)', letterSpacing: '-0.2px' }}>
              D&D Character Builder
            </h1>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)]">
              5e
            </span>
          </div>
          <ProgressBar currentStep={currentStep} onNavigate={onNavigate} />
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      <footer className="no-print sticky bottom-0 border-t border-[var(--color-border)] backdrop-blur-sm"
        style={{ background: 'rgba(15,17,23,0.9)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <button
            onClick={onBack}
            disabled={isFirstStep}
            className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed border border-[var(--color-border)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ← Back
          </button>
          <button
            onClick={onNext}
            disabled={!isValid}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
            style={{
              background: isValid ? 'var(--color-gold)' : 'var(--color-border)',
              color: isValid ? '#0f1117' : 'var(--color-text-muted)',
              boxShadow: isValid ? '0 0 16px rgba(201,168,76,0.3)' : 'none',
            }}
          >
            {isLastStep ? 'View Character Sheet →' : 'Next →'}
          </button>
        </div>
      </footer>
    </div>
  )
}
