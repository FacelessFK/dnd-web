import { useState } from 'react';
import { CLASSES } from '../../data/classes';
import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import {
  getPreparedSpellLimit,
  hasValidClassEquipmentChoices,
  hasValidSpellChoices,
} from '../../store/selectors';
import type { DnDClass, SkillName } from '../../types';
import { EntityCard } from '../shared/EntityCard';
import {
  EntityDetailPanel,
  PanelSection,
  StatPill,
  TraitCard,
} from '../shared/EntityDetailPanel';
import { InfoButton, InfoModal } from '../shared/InfoModal';
import { SelectableOption } from '../shared/SelectableOption';

function ClassPreviewImage({
  imageUrl,
  title,
}: {
  imageUrl: string;
  title: string;
}) {
  return (
    <div
      className="aspect-[4/3] overflow-hidden rounded-xl border"
      style={{
        background: 'var(--color-surface-elevated)',
        borderColor: 'var(--color-border)',
      }}
    >
      <img
        alt={title}
        className="h-full w-full object-cover object-top"
        loading="lazy"
        src={imageUrl}
      />
    </div>
  );
}

export function ClassStep() {
  const store = useCharacterStore();
  const {
    classEquipmentChoices,
    classSkillChoices,
    classSpellChoices,
    dndClass,
    setClass,
    setClassEquipmentChoices,
    setClassSkillChoices,
    setClassSpellChoices,
  } = store;
  const { ability, className, copy, feature, list, phrase, skill, tagline } =
    useBuilderI18n();
  const [panelClass, setPanelClass] = useState<DnDClass | null>(null);
  const [localSkills, setLocalSkills] = useState<SkillName[]>([]);
  const [localEquipmentChoices, setLocalEquipmentChoices] = useState<
    Record<string, string[]>
  >({});
  const [localSpellChoices, setLocalSpellChoices] = useState({
    cantrips: [] as string[],
    preparedSpells: [] as string[],
  });
  const [helpTopic, setHelpTopic] = useState<'cantrips' | 'spells' | null>(
    null,
  );

  const openPanel = (id: string) => {
    const nextClass = CLASSES.find((candidate) => candidate.id === id) ?? null;
    setPanelClass(nextClass);
    setLocalSkills(nextClass?.id === dndClass?.id ? classSkillChoices : []);
    setLocalEquipmentChoices(
      nextClass?.id === dndClass?.id ? classEquipmentChoices : {},
    );
    setLocalSpellChoices(
      nextClass?.id === dndClass?.id
        ? classSpellChoices
        : { cantrips: [], preparedSpells: [] },
    );
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
  const previewState = {
    ...store,
    classEquipmentChoices: localEquipmentChoices,
    classSpellChoices: localSpellChoices,
    dndClass: panelClass,
  };
  const selectDisabled = Boolean(
    panelClass &&
      (localSkills.length < panelClass.numSkillChoices ||
        !hasValidClassEquipmentChoices(previewState) ||
        !hasValidSpellChoices(previewState)),
  );
  const selectLabel = (() => {
    if (!panelClass) return phrase('Select');
    if (neededSkills > 0) {
      return `${neededSkills} ${phrase('Skill Proficiencies')}`;
    }
    if (!hasValidClassEquipmentChoices(previewState)) {
      return phrase('Choose starting equipment');
    }
    if (!hasValidSpellChoices(previewState)) {
      return phrase('Choose spells');
    }
    return `${phrase('Select')} ${className(panelClass)}`;
  })();

  const handleSelect = () => {
    if (!panelClass) return;
    setClass(panelClass);
    setClassSkillChoices(localSkills);
    setClassEquipmentChoices(localEquipmentChoices);
    setClassSpellChoices(localSpellChoices);
  };

  const chooseEquipmentOption = (groupId: string, items: string[]) => {
    setLocalEquipmentChoices((current) => ({ ...current, [groupId]: items }));
  };

  const toggleSpell = (
    type: 'cantrips' | 'preparedSpells',
    spell: string,
    limit: number,
  ) => {
    setLocalSpellChoices((current) => ({
      ...current,
      [type]: toggleChoice(current[type], spell, limit),
    }));
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
        imageUrl={panelClass?.symbolUrl ?? ''}
        onClose={() => setPanelClass(null)}
        onSelect={handleSelect}
        open={Boolean(panelClass)}
        selectDisabled={selectDisabled}
        selectLabel={selectLabel}
        title={panelClass ? className(panelClass) : ''}
      >
        {panelClass ? (
          <>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {tagline(panelClass)}
            </p>

            <ClassPreviewImage
              imageUrl={panelClass.imageUrl}
              title={className(panelClass)}
            />

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

            {panelClass.equipmentChoices?.length ? (
              <PanelSection title={phrase('Starting Equipment')}>
                <div className="space-y-3">
                  {panelClass.equipmentChoices.map((group) => (
                    <div key={group.id}>
                      <div
                        className="mb-1.5 text-xs font-semibold"
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {phrase(group.label)}
                      </div>
                      <div className="space-y-1.5">
                        {group.options.map((option) => {
                          const chosen = arraysEqual(
                            localEquipmentChoices[group.id] ?? [],
                            option.items,
                          );

                          return (
                            <SelectableOption
                              description={list(option.items)}
                              key={option.id}
                              onClick={() =>
                                chooseEquipmentOption(group.id, option.items)
                              }
                              selected={chosen}
                            >
                              {phrase(option.label)}
                            </SelectableOption>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </PanelSection>
            ) : null}

            {panelClass.spellcasting?.cantripOptions ? (
              <PanelSection
                title={`${phrase('Cantrips')}: ${panelClass.spellcasting.cantripsKnown}`}
              >
                <div className="mb-2 flex justify-end">
                  <InfoButton
                    label="What are cantrips?"
                    onClick={() => setHelpTopic('cantrips')}
                  />
                </div>
                <SpellChoiceGrid
                  limit={panelClass.spellcasting.cantripsKnown}
                  onToggle={(spell) =>
                    toggleSpell(
                      'cantrips',
                      spell,
                      panelClass.spellcasting?.cantripsKnown ?? 0,
                    )
                  }
                  options={panelClass.spellcasting.cantripOptions}
                  phrase={phrase}
                  selected={localSpellChoices.cantrips}
                />
              </PanelSection>
            ) : null}

            {panelClass.spellcasting?.preparedSpellOptions ? (
              <PanelSection
                title={`${phrase('Prepared Spells')}: ${getPreparedSpellLimit(previewState)}`}
              >
                <div className="mb-2 flex justify-end">
                  <InfoButton
                    label="What are spells?"
                    onClick={() => setHelpTopic('spells')}
                  />
                </div>
                <SpellChoiceGrid
                  limit={getPreparedSpellLimit(previewState)}
                  onToggle={(spell) =>
                    toggleSpell(
                      'preparedSpells',
                      spell,
                      getPreparedSpellLimit(previewState),
                    )
                  }
                  options={panelClass.spellcasting.preparedSpellOptions}
                  phrase={phrase}
                  selected={localSpellChoices.preparedSpells}
                />
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
      <InfoModal
        onClose={() => setHelpTopic(null)}
        open={helpTopic === 'cantrips'}
        title={phrase('Cantrips')}
      >
        Cantrips are simple spells your character can cast at will. They do not
        use spell slots and are always available once chosen.
      </InfoModal>
      <InfoModal
        onClose={() => setHelpTopic(null)}
        open={helpTopic === 'spells'}
        title={phrase('Spells')}
      >
        Spells are magical effects powered by your class. Prepared or known
        spells are the options your character can cast during play.
      </InfoModal>
    </div>
  );
}

function SpellChoiceGrid({
  limit,
  onToggle,
  options,
  phrase,
  selected,
}: {
  limit: number;
  onToggle: (spell: string) => void;
  options: string[];
  phrase: (value: string) => string;
  selected: string[];
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((option) => {
          const chosen = selected.includes(option);
          const disabled = !chosen && selected.length >= limit;

          return (
            <SelectableOption
              disabled={disabled}
              key={option}
              onClick={() => onToggle(option)}
              selected={chosen}
            >
              {phrase(option)}
            </SelectableOption>
          );
        })}
      </div>
      <div
        className="mt-2 text-center text-xs"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {selected.length} / {limit}
      </div>
    </>
  );
}

function toggleChoice<T>(values: T[], value: T, maxSelected: number): T[] {
  if (values.includes(value)) {
    return values.filter((candidate) => candidate !== value);
  }
  if (maxSelected === 1) {
    return [value];
  }
  if (values.length >= maxSelected) {
    return values;
  }
  return [...values, value];
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
