import { useState } from 'react'
import { BACKGROUNDS } from '../../data/backgrounds'
import { useCharacterStore } from '../../store/characterStore'
import { getConflictingSkill } from '../../store/selectors'
import { ALL_SKILLS } from '../../data/skills'
import { EntityCard } from '../shared/EntityCard'
import { EntityDetailPanel, PanelSection, TraitCard, StatPill } from '../shared/EntityDetailPanel'
import type { Background, SkillName } from '../../types'

export function BackgroundStep() {
  const store = useCharacterStore()
  const { background, backgroundSkillOverride, setBackground, setBackgroundSkillOverride } = store
  const [panelBg, setPanelBg] = useState<Background | null>(null)

  const conflict = getConflictingSkill(store)

  const openPanel = (id: string) => {
    const bg = BACKGROUNDS.find((b) => b.id === id) ?? null
    setPanelBg(bg)
  }

  const handleSelect = () => {
    if (!panelBg) return
    setBackground(panelBg)
    setBackgroundSkillOverride(null)
  }

  const usedSkills = new Set([
    ...store.classSkillChoices,
    ...(panelBg?.skillProficiencies ?? []),
  ])
  const availableOverrides = ALL_SKILLS.filter((s) => !usedSkills.has(s))

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
          Choose Your Background
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Your background tells the story of who you were before you became an adventurer.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {BACKGROUNDS.map((bg) => (
          <EntityCard
            key={bg.id}
            id={bg.id}
            name={bg.name}
            tagline={bg.tagline}
            imageUrl={bg.imageUrl}
            selected={background?.id === bg.id}
            onSelect={openPanel}
          />
        ))}
      </div>

      {background && (
        <div className="mt-4 p-4 rounded-xl border" style={{ background: 'var(--color-gold-dim)', borderColor: 'var(--color-gold-border)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--color-gold)' }}>
            Selected: {background.name}
          </span>
          {conflict && !backgroundSkillOverride && (
            <div className="mt-3">
              <p className="text-xs mb-2" style={{ color: 'var(--color-error)' }}>
                Skill conflict: you already have <strong>{conflict}</strong> from your class. Choose a replacement:
              </p>
              <select
                value={backgroundSkillOverride ?? ''}
                onChange={(e) => setBackgroundSkillOverride(e.target.value as SkillName)}
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                <option value="">Select replacement skill…</option>
                {availableOverrides.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
          {conflict && backgroundSkillOverride && (
            <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
              Replaced {conflict} with {backgroundSkillOverride}
            </span>
          )}
        </div>
      )}

      <EntityDetailPanel
        open={!!panelBg}
        onClose={() => setPanelBg(null)}
        title={panelBg?.name ?? ''}
        imageUrl={panelBg?.imageUrl ?? ''}
        onSelect={handleSelect}
        selectLabel={`Select ${panelBg?.name ?? ''}`}
      >
        {panelBg && (
          <>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{panelBg.tagline}</p>

            <PanelSection title="Skill Proficiencies">
              <div className="flex flex-wrap gap-1">
                {panelBg.skillProficiencies.map((s) => (
                  <StatPill key={s} label="" value={s} />
                ))}
              </div>
            </PanelSection>

            {panelBg.toolProficiencies.length > 0 && (
              <PanelSection title="Tool Proficiencies">
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>{panelBg.toolProficiencies.join(', ')}</div>
              </PanelSection>
            )}

            {panelBg.languages > 0 && (
              <PanelSection title="Languages">
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                  {panelBg.languages} language{panelBg.languages > 1 ? 's' : ''} of your choice
                </div>
              </PanelSection>
            )}

            <PanelSection title="Background Feature">
              <TraitCard name={panelBg.feature.name} description={panelBg.feature.description} />
            </PanelSection>

            <PanelSection title="Starting Equipment">
              <ul className="space-y-1">
                {panelBg.equipment.map((item, i) => (
                  <li key={i} className="text-xs flex gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                    <span style={{ color: 'var(--color-gold)' }}>•</span> {item}
                  </li>
                ))}
              </ul>
            </PanelSection>

            <PanelSection title="Personality Traits">
              {panelBg.personalityTraits.map((t, i) => (
                <div key={i} className="text-xs italic mb-1 p-2 rounded-lg" style={{ background: 'var(--color-surface-elevated)', color: 'var(--color-text-muted)' }}>
                  "{t}"
                </div>
              ))}
            </PanelSection>
          </>
        )}
      </EntityDetailPanel>
    </div>
  )
}
