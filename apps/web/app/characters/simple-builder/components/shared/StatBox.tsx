import type { AbilityName } from '../../types'
import { getAbilityModifier } from '../../store/selectors'

interface Props {
  ability: AbilityName
  base: number
  racialBonus: number
  final: number
}

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export function StatBox({ ability, base, racialBonus, final }: Props) {
  const mod = getAbilityModifier(final)
  const hasBonus = racialBonus > 0

  return (
    <div
      className="flex flex-col items-center gap-1 p-3 rounded-xl border"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <span className="text-[11px] font-bold tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
        {ability}
      </span>
      <div
        className="text-3xl font-bold leading-none"
        style={{ color: 'var(--color-text)' }}
      >
        {final}
      </div>
      <div
        className="text-lg font-semibold"
        style={{ color: 'var(--color-gold)' }}
      >
        {fmtMod(mod)}
      </div>
      {hasBonus && (
        <div className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--color-gold-dim)', color: 'var(--color-gold)' }}>
          {base} + {racialBonus}
        </div>
      )}
    </div>
  )
}
