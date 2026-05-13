import { useCharacterStore } from '../../store/characterStore'
import { getFinalAbilityScores, getAbilityModifier, getPointsRemaining, getCostToIncrease } from '../../store/selectors'
import type { AbilityName } from '../../types'

const ABILITIES: { key: AbilityName; label: string; desc: string }[] = [
  { key: 'STR', label: 'Strength', desc: 'Athletic ability, melee attacks' },
  { key: 'DEX', label: 'Dexterity', desc: 'Agility, ranged attacks, AC' },
  { key: 'CON', label: 'Constitution', desc: 'Endurance, hit points' },
  { key: 'INT', label: 'Intelligence', desc: 'Memory, reasoning, wizard magic' },
  { key: 'WIS', label: 'Wisdom', desc: 'Awareness, cleric & druid magic' },
  { key: 'CHA', label: 'Charisma', desc: 'Presence, bard & sorcerer magic' },
]

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export function AbilityScoresStep() {
  const store = useCharacterStore()
  const { abilityScores, setAbilityScore, resetAbilityScores } = store
  const finals = getFinalAbilityScores(store)
  const pointsLeft = getPointsRemaining(abilityScores)

  const raceAsi = store.race?.asi ?? {}
  const subraceAsi = store.subrace?.asi ?? {}

  const racialBonus = (ability: AbilityName): number =>
    (raceAsi[ability] ?? 0) + (subraceAsi[ability] ?? 0)

  const canIncrease = (ability: AbilityName): boolean => {
    const score = abilityScores[ability]
    if (score >= 15) return false
    return pointsLeft >= getCostToIncrease(score)
  }

  const canDecrease = (ability: AbilityName): boolean => abilityScores[ability] > 8

  const increment = (ability: AbilityName) => {
    if (!canIncrease(ability)) return
    setAbilityScore(ability, abilityScores[ability] + 1)
  }

  const decrement = (ability: AbilityName) => {
    if (!canDecrease(ability)) return
    setAbilityScore(ability, abilityScores[ability] - 1)
  }

  const pointsExhausted = pointsLeft === 0

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
            Ability Scores
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Distribute your points using point buy. All stats start at 8.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="px-5 py-2.5 rounded-xl border text-center"
            style={{
              background: pointsExhausted ? 'rgba(201,168,76,0.1)' : 'var(--color-surface)',
              borderColor: pointsExhausted ? 'var(--color-gold)' : 'var(--color-border)',
            }}
          >
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Points Left</div>
            <div
              className="text-2xl font-bold"
              style={{ color: pointsExhausted ? 'var(--color-gold)' : pointsLeft <= 5 ? 'var(--color-error)' : 'var(--color-text)' }}
            >
              {pointsLeft}
            </div>
          </div>
          <button
            onClick={resetAbilityScores}
            className="text-xs px-3 py-2 rounded-lg border transition-colors hover:border-[var(--color-gold)]"
            style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {ABILITIES.map(({ key, label, desc }) => {
          const base = abilityScores[key]
          const bonus = racialBonus(key)
          const final = finals[key]
          const mod = getAbilityModifier(final)

          return (
            <div
              key={key}
              className="flex items-center gap-3 p-4 rounded-xl border"
              style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              {/* Ability label */}
              <div className="w-28 flex-shrink-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{label}</div>
                <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{desc}</div>
              </div>

              {/* Stepper */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => decrement(key)}
                  disabled={!canDecrease(key)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                >
                  −
                </button>
                <div
                  className="w-10 text-center text-xl font-bold"
                  style={{ color: 'var(--color-text)' }}
                >
                  {base}
                </div>
                <button
                  onClick={() => increment(key)}
                  disabled={!canIncrease(key)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                >
                  +
                </button>
              </div>

              {/* Racial bonus */}
              {bonus > 0 && (
                <div className="flex-shrink-0 text-xs px-2 py-1 rounded-full" style={{ background: 'var(--color-gold-dim)', color: 'var(--color-gold)' }}>
                  +{bonus} racial
                </div>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Final score + modifier */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-center">
                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Total</div>
                  <div className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>{final}</div>
                </div>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold border"
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
          )
        })}
      </div>

      <div className="mt-6 p-4 rounded-xl text-xs" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
        <strong style={{ color: 'var(--color-text)' }}>Point Buy rules:</strong> Start at 8 (all stats). 27 points to spend.
        Scores 8–13 cost 1 point each. Scores 14–15 cost 2 points each. Maximum score is 15 before racial bonuses.
      </div>
    </div>
  )
}
