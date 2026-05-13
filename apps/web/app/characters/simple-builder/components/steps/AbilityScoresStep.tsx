import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import {
  getAbilityModifier,
  getCostToIncrease,
  getFinalAbilityScores,
  getPointsRemaining,
} from '../../store/selectors';
import type { AbilityName } from '../../types';

const ABILITIES: AbilityName[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function AbilityScoresStep() {
  const store = useCharacterStore();
  const { abilityScores, resetAbilityScores, setAbilityScore } = store;
  const { ability, abilityDescription, copy, phrase } = useBuilderI18n();
  const finals = getFinalAbilityScores(store);
  const pointsLeft = getPointsRemaining(abilityScores);

  const raceAsi = store.race?.asi ?? {};
  const subraceAsi = store.subrace?.asi ?? {};

  const racialBonus = (name: AbilityName): number =>
    (raceAsi[name] ?? 0) + (subraceAsi[name] ?? 0);

  const canIncrease = (name: AbilityName): boolean => {
    const score = abilityScores[name];
    if (score >= 15) return false;
    return pointsLeft >= getCostToIncrease(score);
  };

  const canDecrease = (name: AbilityName): boolean => abilityScores[name] > 8;

  const increment = (name: AbilityName) => {
    if (!canIncrease(name)) return;
    setAbilityScore(name, abilityScores[name] + 1);
  };

  const decrement = (name: AbilityName) => {
    if (!canDecrease(name)) return;
    setAbilityScore(name, abilityScores[name] - 1);
  };

  const pointsExhausted = pointsLeft === 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            className="mb-1 text-2xl font-bold"
            style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}
          >
            {copy.stepLabels.abilityScores}
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {copy.pointBuyDescription}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="rounded-xl border px-5 py-2.5 text-center"
            style={{
              background: pointsExhausted
                ? 'rgba(201,168,76,0.1)'
                : 'var(--color-surface)',
              borderColor: pointsExhausted
                ? 'var(--color-gold)'
                : 'var(--color-border)',
            }}
          >
            <div
              className="text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {copy.pointsLeft}
            </div>
            <div
              className="text-2xl font-bold"
              style={{
                color: pointsExhausted
                  ? 'var(--color-gold)'
                  : pointsLeft <= 5
                    ? 'var(--color-error)'
                    : 'var(--color-text)',
              }}
            >
              {pointsLeft}
            </div>
          </div>
          <button
            className="rounded-lg border px-3 py-2 text-xs transition-colors hover:border-[var(--color-gold)]"
            onClick={resetAbilityScores}
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
            }}
            type="button"
          >
            {copy.reset}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {ABILITIES.map((key) => {
          const base = abilityScores[key];
          const bonus = racialBonus(key);
          const final = finals[key];
          const mod = getAbilityModifier(final);

          return (
            <div
              className="flex items-center gap-3 rounded-xl border p-4"
              key={key}
              style={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
              }}
            >
              <div className="w-28 flex-shrink-0">
                <div
                  className="text-sm font-semibold"
                  style={{ color: 'var(--color-text)' }}
                >
                  {ability(key)}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {abilityDescription(key)}
                </div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold transition-all hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                  disabled={!canDecrease(key)}
                  onClick={() => decrement(key)}
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  type="button"
                >
                  -
                </button>
                <div
                  className="w-10 text-center text-xl font-bold"
                  style={{ color: 'var(--color-text)' }}
                >
                  {base}
                </div>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-bold transition-all hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                  disabled={!canIncrease(key)}
                  onClick={() => increment(key)}
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                  }}
                  type="button"
                >
                  +
                </button>
              </div>

              {bonus > 0 ? (
                <div
                  className="flex-shrink-0 rounded-full px-2 py-1 text-xs"
                  style={{
                    background: 'var(--color-gold-dim)',
                    color: 'var(--color-gold)',
                  }}
                >
                  +{bonus} {copy.stepLabels.race}
                </div>
              ) : null}

              <div className="flex-1" />

              <div className="flex flex-shrink-0 items-center gap-3">
                <div className="text-center">
                  <div
                    className="text-xs"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {phrase('Total')}
                  </div>
                  <div
                    className="text-xl font-bold"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {final}
                  </div>
                </div>
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl border text-lg font-bold"
                  style={{
                    background: 'var(--color-surface-elevated)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-gold)',
                  }}
                >
                  {fmtMod(mod)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-6 rounded-xl p-4 text-xs"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
        }}
      >
        <strong style={{ color: 'var(--color-text)' }}>
          {copy.pointBuyRules}
        </strong>
      </div>
    </div>
  );
}
