import type { ReactNode } from 'react';
import { LanguageSwitcher } from '../../../../../lib/i18n';
import { useBuilderI18n } from '../../localization';
import type { StepId } from '../../types';
import { ProgressBar } from './ProgressBar';

interface Props {
  currentStep: StepId;
  onNavigate: (step: StepId) => void;
  onNext: () => void;
  onBack: () => void;
  isValid: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  children: ReactNode;
}

export function StepLayout({
  currentStep,
  onNavigate,
  onNext,
  onBack,
  isValid,
  isFirstStep,
  isLastStep,
  children,
}: Props) {
  const { copy } = useBuilderI18n();

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      <header
        className="no-print sticky top-0 z-50 border-b border-[var(--color-border)] backdrop-blur-sm"
        style={{ background: 'rgba(15,17,23,0.85)' }}
      >
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-2xl">D20</span>
            <h1
              className="text-lg font-bold tracking-wide"
              style={{ color: 'var(--color-gold)', letterSpacing: '-0.2px' }}
            >
              {copy.builderTitle}
            </h1>
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
              5e
            </span>
            <div className="ml-auto">
              <LanguageSwitcher />
            </div>
          </div>
          <ProgressBar currentStep={currentStep} onNavigate={onNavigate} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>

      <footer
        className="no-print sticky bottom-0 border-t border-[var(--color-border)] backdrop-blur-sm"
        style={{ background: 'rgba(15,17,23,0.9)' }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <button
            className="rounded-xl border border-[var(--color-border)] px-6 py-2.5 text-sm font-medium transition-all duration-150 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-30"
            disabled={isFirstStep}
            onClick={onBack}
            style={{ color: 'var(--color-text-muted)' }}
            type="button"
          >
            {copy.back}
          </button>
          <button
            className="rounded-xl px-8 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!isValid}
            onClick={onNext}
            style={{
              background: isValid ? 'var(--color-gold)' : 'var(--color-border)',
              boxShadow: isValid ? '0 0 16px rgba(201,168,76,0.3)' : 'none',
              color: isValid ? '#0f1117' : 'var(--color-text-muted)',
            }}
            type="button"
          >
            {isLastStep ? copy.viewSheet : copy.next}
          </button>
        </div>
      </footer>
    </div>
  );
}
