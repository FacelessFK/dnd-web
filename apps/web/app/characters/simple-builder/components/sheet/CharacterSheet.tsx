import { useState } from 'react'
import { useCharacterStore } from '../../store/characterStore'
import {
  getFinalAbilityScores, getAbilityModifiers,
  getSavingThrows, getSkills, getPassivePerception,
  getHP, getAC, getInitiative, getSpeed,
  getAllLanguages, getAllProficiencies, getAllFeatures, getAllEquipment,
} from '../../store/selectors'
import { SheetSection } from './SheetSection'
import type { AbilityName } from '../../types'

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

const ABILITY_FULL: Record<AbilityName, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
}

export function CharacterSheet() {
  const store = useCharacterStore()
  const { name, alignment, age, height, weight, pronouns, backstory, race, subrace, dndClass, background } = store

  const finals = getFinalAbilityScores(store)
  const mods = getAbilityModifiers(store)
  const savingThrows = getSavingThrows(store)
  const skills = getSkills(store)
  const passivePerception = getPassivePerception(store)
  const hp = getHP(store)
  const ac = getAC(store)
  const initiative = getInitiative(store)
  const speed = getSpeed(store)
  const languages = getAllLanguages(store)
  const proficiencies = getAllProficiencies(store)
  const features = getAllFeatures(store)
  const equipment = getAllEquipment(store)

  const isCaster = !!(dndClass?.spellcasting && dndClass.spellcasting.spellSlots.length > 0)
  const raceName = race ? `${race.name}${subrace ? ` (${subrace.name})` : ''}` : '—'

  return (
    <div>
      {/* Print / nav header */}
      <div className="no-print mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
            Character Sheet
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Level 1 · D&D 5e</p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-xl border text-sm font-medium transition-all hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          🖨 Print Sheet
        </button>
      </div>

      <div className="space-y-4">
        {/* Header */}
        <SheetSection title="Character">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <InfoRow label="Name" value={name || '—'} />
            <InfoRow label="Race" value={raceName} />
            <InfoRow label="Class" value={dndClass?.name ?? '—'} />
            <InfoRow label="Background" value={background?.name ?? '—'} />
            <InfoRow label="Alignment" value={alignment ?? '—'} />
            <InfoRow label="Level" value="1" />
            <InfoRow label="XP" value="0" />
            {age && <InfoRow label="Age" value={age} />}
            {height && <InfoRow label="Height" value={height} />}
            {weight && <InfoRow label="Weight" value={weight} />}
            {pronouns && <InfoRow label="Pronouns" value={pronouns} />}
          </div>
        </SheetSection>

        {/* Ability Scores */}
        <SheetSection title="Ability Scores">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {(Object.keys(finals) as AbilityName[]).map((a) => (
              <div key={a} className="flex flex-col items-center gap-1 p-3 rounded-xl border" style={{ background: 'var(--color-surface-elevated)', borderColor: 'var(--color-border)' }}>
                <span className="text-[10px] font-bold tracking-widest" style={{ color: 'var(--color-text-muted)' }}>{a}</span>
                <span className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{finals[a]}</span>
                <span className="text-base font-semibold" style={{ color: 'var(--color-gold)' }}>{fmtMod(mods[a])}</span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{ABILITY_FULL[a]}</span>
              </div>
            ))}
          </div>
        </SheetSection>

        {/* Combat */}
        <SheetSection title="Combat">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <CombatStat label="Armor Class" value={ac} />
            <CombatStat label="Initiative" value={fmtMod(initiative)} />
            <CombatStat label="Speed" value={`${speed} ft`} />
            <CombatStat label="Max HP" value={hp} />
            <CombatStat label="Hit Dice" value={`1d${dndClass?.hitDie ?? 8}`} />
          </div>
          <div className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Proficiency Bonus: <span className="font-bold" style={{ color: 'var(--color-gold)' }}>+2</span>
          </div>
        </SheetSection>

        {/* Saving Throws */}
        <SheetSection title="Saving Throws">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {savingThrows.map((st) => (
              <div key={st.ability} className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: 'var(--color-surface-elevated)' }}>
                <ProfDot proficient={st.proficient} />
                <span className="text-xs font-medium flex-1" style={{ color: 'var(--color-text)' }}>{st.ability}</span>
                <span className="text-sm font-bold" style={{ color: st.proficient ? 'var(--color-gold)' : 'var(--color-text-muted)' }}>
                  {fmtMod(st.value)}
                </span>
              </div>
            ))}
          </div>
        </SheetSection>

        {/* Skills */}
        <SheetSection title="Skills">
          <div className="mb-3 text-xs p-2 rounded-lg inline-block" style={{ background: 'var(--color-gold-dim)', color: 'var(--color-gold)' }}>
            Passive Perception: {passivePerception}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {skills.map((s) => (
              <div key={s.skill} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg" style={{ background: 'var(--color-surface-elevated)' }}>
                <ProfDot proficient={s.proficient} />
                <span className="text-xs flex-1" style={{ color: 'var(--color-text)' }}>
                  {s.skill}
                  <span className="ml-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>({s.ability})</span>
                </span>
                <span className="text-sm font-bold" style={{ color: s.proficient ? 'var(--color-gold)' : 'var(--color-text-muted)' }}>
                  {fmtMod(s.value)}
                </span>
              </div>
            ))}
          </div>
        </SheetSection>

        {/* Proficiencies & Languages */}
        <SheetSection title="Proficiencies & Languages">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {proficiencies.armor.length > 0 && <ProfList label="Armor" items={proficiencies.armor} />}
            <ProfList label="Weapons" items={proficiencies.weapons} />
            {proficiencies.tools.length > 0 && <ProfList label="Tools" items={proficiencies.tools} />}
            <ProfList label="Languages" items={languages} />
          </div>
        </SheetSection>

        {/* Features & Traits */}
        <SheetSection title="Features & Traits">
          <div className="space-y-2">
            {features.map((f, i) => (
              <FeatureCard key={i} name={f.name} source={f.source} description={f.description} />
            ))}
          </div>
        </SheetSection>

        {/* Equipment */}
        <SheetSection title="Equipment">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {equipment.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                <span style={{ color: 'var(--color-gold)' }}>•</span> {item}
              </li>
            ))}
          </ul>
        </SheetSection>

        {/* Spells (casters only) */}
        {isCaster && dndClass?.spellcasting && (
          <SheetSection title="Spellcasting">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <InfoBadge label="Ability" value={dndClass.spellcasting.ability} />
                {dndClass.spellcasting.cantripsKnown > 0 && (
                  <InfoBadge label="Cantrips Known" value={dndClass.spellcasting.cantripsKnown} />
                )}
                {dndClass.spellcasting.spellsKnown !== undefined && (
                  <InfoBadge label="Spells Known" value={dndClass.spellcasting.spellsKnown} />
                )}
                {dndClass.spellcasting.spellSlots.map((s) => (
                  <InfoBadge key={s.level} label={`Level ${s.level} Slots`} value={s.slots} />
                ))}
              </div>
              {dndClass.spellcasting.cantrips && dndClass.spellcasting.cantrips.length > 0 && (
                <ProfList label="Starting Cantrips" items={dndClass.spellcasting.cantrips} />
              )}
            </div>
          </SheetSection>
        )}

        {/* Backstory */}
        {backstory && (
          <SheetSection title="Backstory">
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{backstory}</p>
          </SheetSection>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--color-text)' }}>{value}</div>
    </div>
  )
}

function CombatStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-xl border text-center" style={{ background: 'var(--color-surface-elevated)', borderColor: 'var(--color-border)' }}>
      <div className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: 'var(--color-gold)' }}>{value}</div>
    </div>
  )
}

function ProfDot({ proficient }: { proficient: boolean }) {
  return (
    <div
      className="w-3 h-3 rounded-full flex-shrink-0"
      style={{ background: proficient ? 'var(--color-gold)' : 'var(--color-border)' }}
    />
  )
}

function ProfList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div className="text-sm" style={{ color: 'var(--color-text)' }}>{items.join(', ') || '—'}</div>
    </div>
  )
}

function FeatureCard({ name, source, description }: { name: string; source: string; description: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/5"
        style={{ background: 'var(--color-surface-elevated)' }}
      >
        <div>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{name}</span>
          <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>{source}</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 py-3 text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </div>
      )}
    </div>
  )
}

function InfoBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="px-3 py-2 rounded-lg border" style={{ background: 'var(--color-surface-elevated)', borderColor: 'var(--color-border)' }}>
      <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: 'var(--color-gold)' }}>{value}</div>
    </div>
  )
}
