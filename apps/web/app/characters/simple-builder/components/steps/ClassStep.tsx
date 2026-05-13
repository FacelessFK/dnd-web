import { useState } from 'react';
import { CLASSES } from '../../data/classes';
import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import type { DnDClass, SkillName } from '../../types';
import { EntityCard } from '../shared/EntityCard';
import {
  EntityDetailPanel,
  PanelSection,
  StatPill,
  TraitCard,
} from '../shared/EntityDetailPanel';

export function ClassStep() {
  const { classSkillChoices, dndClass, setClass, setClassSkillChoices } =
    useCharacterStore();
  const { ability, className, copy, feature, list, phrase, skill, tagline } =
    useBuilderI18n();
  const [panelClass, setPanelClass] = useState<DnDClass | null>(null);
  const [localSkills, setLocalSkills] = useState<SkillName[]>([]);

  const openPanel = (id: string) => {
    const nextClass = CLASSES.find((candidate) => candidate.id === id) ?? null;
    setPanelClass(nextClass);
    setLocalSkills(nextClass?.id === dndClass?.id ? classSkillChoices : []);
  };

  const toggleSkill = (nextSkill: SkillName) => {
    if (!panelClass) return;
    setLocalSkills((current) => {
      if (current.includes(nextSkill)) {
        return current.filter((candidate) => candidate !== nextSkill);
      }
      if (current.length >= panelClass.numSkillChoices) {
        return current;
      }
      return [...current, nextSkill];
    });
  };

  const neededSkills = panelClass
    ? panelClass.numSkillChoices - localSkills.length
    : 0;
  const selectDisabled = Boolean(
    panelClass && localSkills.length < panelClass.numSkillChoices,
  );

  const handleSelect = () => {
    if (!panelClass) return;
    setClass(panelClass);
    setClassSkillChoices(localSkills);
  };

  return (
    <div>
      <div className="mb-6">
        <h2
          className="mb-1 text-2xl font-bold"
          style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}
        >
          {copy.chooseClassTitle}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {copy.chooseClassDescription}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {CLASSES.map((candidate) => (
          <EntityCard
            id={candidate.id}
            imageUrl={candidate.imageUrl}
            key={candidate.id}
            name={className(candidate)}
            onSelect={openPanel}
            selected={dndClass?.id === candidate.id}
            tagline={tagline(candidate)}
          />
        ))}
      </div>

      {dndClass ? (
        <div
          className="mt-4 rounded-xl border p-4"
          style={{
            background: 'var(--color-gold-dim)',
            borderColor: 'var(--color-gold-border)',
          }}
        >
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--color-gold)' }}
          >
            {copy.selected}: {className(dndClass)}
          </span>
          <span
            className="ml-2 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {phrase('Skill Proficiencies')}:{' '}
            {classSkillChoices.map(skill).join('، ')}
          </span>
        </div>
      ) : null}

      <EntityDetailPanel
        imageUrl={panelClass?.imageUrl ?? ''}
        onClose={() => setPanelClass(null)}
        onSelect={handleSelect}
        open={Boolean(panelClass)}
        selectDisabled={selectDisabled}
        selectLabel={
          selectDisabled
            ? `${neededSkills} ${phrase('Skill Proficiencies')}`
            : `${phrase('Select')} ${panelClass ? className(panelClass) : ''}`
        }
        title={panelClass ? className(panelClass) : ''}
      >
        {panelClass ? (
          <>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {tagline(panelClass)}
            </p>

            <PanelSection title={phrase('Core Stats')}>
              <StatPill
                label={phrase('Hit Die')}
                value={`d${panelClass.hitDie}`}
              />
              <StatPill
                label={phrase('Primary')}
                value={phrase(panelClass.primaryAbility)}
              />
              <StatPill
                label={phrase('Saves')}
                value={panelClass.savingThrows.map(ability).join('، ')}
              />
            </PanelSection>

            {panelClass.armorProficiencies.length > 0 ? (
              <PanelSection title={phrase('Armor Proficiencies')}>
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                  {list(panelClass.armorProficiencies)}
                </div>
              </PanelSection>
            ) : null}

            <PanelSection title={phrase('Weapon Proficiencies')}>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                {list(panelClass.weaponProficiencies)}
              </div>
            </PanelSection>

            {panelClass.spellcasting ? (
              <PanelSection title={phrase('Spellcasting')}>
                {panelClass.spellcasting.note ? (
                  <div
                    className="rounded-lg p-3 text-xs"
                    style={{
                      background: 'var(--color-surface-elevated)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {phrase(panelClass.spellcasting.note)}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <StatPill
                      label={phrase('Ability')}
                      value={ability(panelClass.spellcasting.ability)}
                    />
                    {panelClass.spellcasting.cantripsKnown > 0 ? (
                      <StatPill
                        label={phrase('Cantrips')}
                        value={panelClass.spellcasting.cantripsKnown}
                      />
                    ) : null}
                    {panelClass.spellcasting.spellSlots.map((slot) => (
                      <StatPill
                        key={slot.level}
                        label={`Level ${slot.level}`}
                        value={slot.slots}
                      />
                    ))}
                    {panelClass.spellcasting.cantrips ? (
                      <div
                        className="mt-2 text-xs"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {phrase('Starting Cantrips')}:{' '}
                        {list(panelClass.spellcasting.cantrips)}
                      </div>
                    ) : null}
                  </div>
                )}
              </PanelSection>
            ) : null}

            <PanelSection title={phrase('Level 1 Features')}>
              {panelClass.features.map((classFeature) => (
                <TraitCard key={classFeature.name} {...feature(classFeature)} />
              ))}
            </PanelSection>

            <PanelSection
              title={`${copy.stepLabels.class}: ${panelClass.numSkillChoices} ${phrase('Skill Proficiencies')}`}
            >
              <div className="grid grid-cols-2 gap-1.5">
                {panelClass.skillChoices.map((nextSkill) => {
                  const chosen = localSkills.includes(nextSkill);
                  const maxReached =
                    localSkills.length >= panelClass.numSkillChoices;
                  const disabled = !chosen && maxReached;

                  return (
                    <button
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-all duration-100 disabled:opacity-40"
                      disabled={disabled}
                      key={nextSkill}
                      onClick={() => toggleSkill(nextSkill)}
                      style={{
                        background: chosen
                          ? 'var(--color-gold-dim)'
                          : 'var(--color-surface-elevated)',
                        border: `1px solid ${
                          chosen ? 'var(--color-gold)' : 'var(--color-border)'
                        }`,
                        color: chosen
                          ? 'var(--color-gold)'
                          : 'var(--color-text)',
                      }}
                      type="button"
                    >
                      <span
                        className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px]"
                        style={{
                          background: chosen
                            ? 'var(--color-gold)'
                            : 'var(--color-border)',
                          color: chosen ? '#0f1117' : 'transparent',
                        }}
                      >
                        {chosen ? '✓' : ''}
                      </span>
                      {skill(nextSkill)}
                    </button>
                  );
                })}
              </div>
              <div
                className="mt-2 text-center text-xs"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {localSkills.length} / {panelClass.numSkillChoices}{' '}
                {copy.selectedCount}
              </div>
            </PanelSection>
          </>
        ) : null}
      </EntityDetailPanel>
    </div>
  );
}
