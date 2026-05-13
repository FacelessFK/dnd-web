import { useState } from 'react'
import { CLASSES } from '../../data/classes'
import { useCharacterStore } from '../../store/characterStore'
import { EntityCard } from '../shared/EntityCard'
import { EntityDetailPanel, PanelSection, TraitCard, StatPill } from '../shared/EntityDetailPanel'
import type { DnDClass, SkillName } from '../../types'

export function ClassStep() {
  const { dndClass, classSkillChoices, setClass, setClassSkillChoices } = useCharacterStore()
  const [panelClass, setPanelClass] = useState<DnDClass | null>(null)
  const [localSkills, setLocalSkills] = useState<SkillName[]>([])

  const openPanel = (id: string) => {
    const cls = CLASSES.find((c) => c.id === id) ?? null
    setPanelClass(cls)
    setLocalSkills(cls?.id === dndClass?.id ? classSkillChoices : [])
  }

  const toggleSkill = (skill: SkillName) => {
    if (!panelClass) return
    setLocalSkills((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill)
      if (prev.length >= panelClass.numSkillChoices) return prev
      return [...prev, skill]
    })
  }

  const selectDisabled = !panelClass || localSkills.length < panelClass.numSkillChoices

  const handleSelect = () => {
    if (!panelClass) return
    setClass(panelClass)
    setClassSkillChoices(localSkills)
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
          Choose Your Class
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Your class defines your role in combat, your abilities, and your path to power.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {CLASSES.map((cls) => (
          <EntityCard
            key={cls.id}
            id={cls.id}
            name={cls.name}
            tagline={cls.tagline}
            imageUrl={cls.imageUrl}
            selected={dndClass?.id === cls.id}
            onSelect={openPanel}
          />
        ))}
      </div>

      {dndClass && (
        <div className="mt-4 p-4 rounded-xl border" style={{ background: 'var(--color-gold-dim)', borderColor: 'var(--color-gold-border)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--color-gold)' }}>
            Selected: {dndClass.name}
          </span>
          <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
            Skills: {classSkillChoices.join(', ')}
          </span>
        </div>
      )}

      <EntityDetailPanel
        open={!!panelClass}
        onClose={() => setPanelClass(null)}
        title={panelClass?.name ?? ''}
        imageUrl={panelClass?.imageUrl ?? ''}
        onSelect={handleSelect}
        selectLabel={selectDisabled
          ? `Pick ${(panelClass?.numSkillChoices ?? 0) - localSkills.length} more skill${(panelClass?.numSkillChoices ?? 0) - localSkills.length === 1 ? '' : 's'}`
          : `Select ${panelClass?.name ?? ''}`}
        selectDisabled={selectDisabled}
      >
        {panelClass && (
          <>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{panelClass.tagline}</p>

            <PanelSection title="Core Stats">
              <StatPill label="Hit Die" value={`d${panelClass.hitDie}`} />
              <StatPill label="Primary" value={panelClass.primaryAbility} />
              <StatPill label="Saves" value={panelClass.savingThrows.join(', ')} />
            </PanelSection>

            {panelClass.armorProficiencies.length > 0 && (
              <PanelSection title="Armor Proficiencies">
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>{panelClass.armorProficiencies.join(', ')}</div>
              </PanelSection>
            )}

            <PanelSection title="Weapon Proficiencies">
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>{panelClass.weaponProficiencies.join(', ')}</div>
            </PanelSection>

            {panelClass.spellcasting && (
              <PanelSection title="Spellcasting">
                {panelClass.spellcasting.note ? (
                  <div className="text-xs p-3 rounded-lg" style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-muted)' }}>
                    {panelClass.spellcasting.note}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <StatPill label="Ability" value={panelClass.spellcasting.ability} />
                    {panelClass.spellcasting.cantripsKnown > 0 && (
                      <StatPill label="Cantrips" value={panelClass.spellcasting.cantripsKnown} />
                    )}
                    {panelClass.spellcasting.spellSlots.map((s) => (
                      <StatPill key={s.level} label={`L${s.level} Slots`} value={s.slots} />
                    ))}
                    {panelClass.spellcasting.cantrips && (
                      <div className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Starting cantrips: {panelClass.spellcasting.cantrips.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </PanelSection>
            )}

            <PanelSection title="Level 1 Features">
              {panelClass.features.map((f) => (
                <TraitCard key={f.name} name={f.name} description={f.description} />
              ))}
            </PanelSection>

            <PanelSection title={`Choose ${panelClass.numSkillChoices} Skills`}>
              <div className="grid grid-cols-2 gap-1.5">
                {panelClass.skillChoices.map((skill) => {
                  const chosen = localSkills.includes(skill)
                  const maxReached = localSkills.length >= panelClass.numSkillChoices
                  const disabled = !chosen && maxReached

                  return (
                    <button
                      key={skill}
                      onClick={() => toggleSkill(skill)}
                      disabled={disabled}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-all duration-100 disabled:opacity-40"
                      style={{
                        background: chosen ? 'var(--color-gold-dim)' : 'var(--color-surface-elevated)',
                        border: `1px solid ${chosen ? 'var(--color-gold)' : 'var(--color-border)'}`,
                        color: chosen ? 'var(--color-gold)' : 'var(--color-text)',
                      }}
                    >
                      <span className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[10px]"
                        style={{ background: chosen ? 'var(--color-gold)' : 'var(--color-border)', color: chosen ? '#0f1117' : 'transparent' }}>
                        {chosen && '✓'}
                      </span>
                      {skill}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                {localSkills.length} / {panelClass.numSkillChoices} selected
              </div>
            </PanelSection>
          </>
        )}
      </EntityDetailPanel>
    </div>
  )
}
