import { useState } from 'react'
import { RACES } from '../../data/races'
import { useCharacterStore } from '../../store/characterStore'
import { EntityCard } from '../shared/EntityCard'
import { EntityDetailPanel, PanelSection, TraitCard, StatPill } from '../shared/EntityDetailPanel'
import type { Race, Subrace } from '../../types'

const ABILITY_LABELS: Record<string, string> = {
  STR: 'Strength', DEX: 'Dexterity', CON: 'Constitution',
  INT: 'Intelligence', WIS: 'Wisdom', CHA: 'Charisma',
}

function fmtAsi(asi: Partial<Record<string, number>>): string {
  return Object.entries(asi)
    .filter(([, v]) => v)
    .map(([k, v]) => `+${v} ${ABILITY_LABELS[k] ?? k}`)
    .join(', ') || 'None'
}

export function RaceStep() {
  const { race, subrace, setRace, setSubrace } = useCharacterStore()
  const [panelRace, setPanelRace] = useState<Race | null>(null)
  const [localSubrace, setLocalSubrace] = useState<Subrace | null>(null)

  const openPanel = (id: string) => {
    const r = RACES.find((r) => r.id === id) ?? null
    setPanelRace(r)
    setLocalSubrace(r?.id === race?.id ? subrace : null)
  }

  const handleSelect = () => {
    if (!panelRace) return
    setRace(panelRace)
    setSubrace(panelRace.subraces ? localSubrace : null)
  }

  const needsSubrace = !!panelRace?.subraces && !localSubrace
  const selectDisabled = needsSubrace

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
          Choose Your Race
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Your race determines your base traits, ability bonuses, and physical features.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {RACES.map((r) => (
          <EntityCard
            key={r.id}
            id={r.id}
            name={r.name}
            tagline={r.tagline}
            imageUrl={r.imageUrl}
            selected={race?.id === r.id}
            onSelect={openPanel}
          />
        ))}
      </div>

      {race && (
        <div className="mt-4 p-4 rounded-xl border" style={{ background: 'var(--color-gold-dim)', borderColor: 'var(--color-gold-border)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--color-gold)' }}>
            Selected: {race.name}{subrace ? ` (${subrace.name})` : ''}
          </span>
          {race.subraces && !subrace && (
            <span className="text-xs ml-2" style={{ color: 'var(--color-text-muted)' }}>
              — Choose a subrace to continue
            </span>
          )}
        </div>
      )}

      <EntityDetailPanel
        open={!!panelRace}
        onClose={() => setPanelRace(null)}
        title={panelRace?.name ?? ''}
        imageUrl={panelRace?.imageUrl ?? ''}
        onSelect={handleSelect}
        selectLabel={`Select ${panelRace?.name ?? ''}`}
        selectDisabled={selectDisabled}
      >
        {panelRace && (
          <>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{panelRace.tagline}</p>

            <PanelSection title="Core Stats">
              <StatPill label="Speed" value={`${panelRace.speed} ft`} />
              <StatPill label="Size" value={panelRace.size} />
            </PanelSection>

            <PanelSection title="Ability Score Increases">
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                {fmtAsi(panelRace.asi)}
              </div>
            </PanelSection>

            <PanelSection title="Languages">
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                {panelRace.languages.join(', ')}
              </div>
            </PanelSection>

            <PanelSection title="Racial Traits">
              {panelRace.traits.map((t) => (
                <TraitCard key={t.name} name={t.name} description={t.description} />
              ))}
            </PanelSection>

            {panelRace.subraces && (
              <PanelSection title="Choose Subrace">
                <div className="space-y-2">
                  {panelRace.subraces.map((sr) => (
                    <button
                      key={sr.id}
                      onClick={() => setLocalSubrace(sr)}
                      className="w-full text-left p-3 rounded-xl border transition-all duration-150"
                      style={{
                        background: localSubrace?.id === sr.id ? 'var(--color-gold-dim)' : 'var(--color-surface-elevated)',
                        borderColor: localSubrace?.id === sr.id ? 'var(--color-gold)' : 'var(--color-border)',
                      }}
                    >
                      <div className="text-sm font-semibold mb-0.5" style={{ color: localSubrace?.id === sr.id ? 'var(--color-gold)' : 'var(--color-text)' }}>
                        {sr.name}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{sr.description}</div>
                      {localSubrace?.id === sr.id && sr.traits.map((t) => (
                        <div key={t.name} className="mt-2 text-xs p-2 rounded-lg" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                          <strong style={{ color: 'var(--color-gold)' }}>{t.name}:</strong> {t.description}
                        </div>
                      ))}
                    </button>
                  ))}
                </div>
              </PanelSection>
            )}
          </>
        )}
      </EntityDetailPanel>
    </div>
  )
}
