import { useState } from 'react';
import { getLanguageDescription } from '../../data/languages';
import { RACES } from '../../data/races';
import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import {
  getAvailableLanguageChoices,
  getAvailableRaceSkillChoices,
  getRaceLanguageChoiceLimit,
  getRaceSkillChoiceLimit,
} from '../../store/selectors';
import type { AbilityName, Race, SkillName, Subrace } from '../../types';
import { EntityCard } from '../shared/EntityCard';
import {
  EntityDetailPanel,
  PanelSection,
  StatPill,
  TraitCard,
} from '../shared/EntityDetailPanel';
import { SelectableOption } from '../shared/SelectableOption';

function fmtAsi(
  asi: Partial<Record<string, number>>,
  ability: (value: AbilityName) => string,
  noneLabel: string,
): string {
  return (
    Object.entries(asi)
      .filter(([, value]) => value)
      .map(([key, value]) => `+${value} ${ability(key as AbilityName)}`)
      .join('، ') || noneLabel
  );
}

function RacePreviewImage({
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

export function RaceStep() {
  const store = useCharacterStore();
  const {
    race,
    raceLanguageChoices,
    raceSkillChoices,
    setRace,
    setRaceLanguageChoices,
    setRaceSkillChoices,
    setSubrace,
    subrace,
  } = store;
  const {
    ability,
    copy,
    dirClass,
    feature,
    list,
    phrase,
    raceName,
    skill,
    tagline,
  } = useBuilderI18n();
  const [panelRace, setPanelRace] = useState<Race | null>(null);
  const [localSubrace, setLocalSubrace] = useState<Subrace | null>(null);
  const [localLanguages, setLocalLanguages] = useState<string[]>([]);
  const [localSkills, setLocalSkills] = useState<SkillName[]>([]);

  const openPanel = (id: string) => {
    const nextRace = RACES.find((candidate) => candidate.id === id) ?? null;
    setPanelRace(nextRace);
    setLocalSubrace(nextRace?.id === race?.id ? subrace : null);
    setLocalLanguages(nextRace?.id === race?.id ? raceLanguageChoices : []);
    setLocalSkills(nextRace?.id === race?.id ? raceSkillChoices : []);
  };

  const handleSelect = () => {
    if (!panelRace) return;
    setRace(panelRace);
    setSubrace(panelRace.subraces ? localSubrace : null);
    setRaceLanguageChoices(localLanguages);
    setRaceSkillChoices(localSkills);
  };

  const previewState = {
    ...store,
    race: panelRace,
    raceLanguageChoices: localLanguages,
    raceSkillChoices: localSkills,
    subrace: localSubrace,
  };
  const raceLanguageLimit = getRaceLanguageChoiceLimit(previewState);
  const raceSkillLimit = getRaceSkillChoiceLimit(previewState);
  const selectDisabled = Boolean(
    (panelRace?.subraces && !localSubrace) ||
    localLanguages.length < raceLanguageLimit ||
    localSkills.length < raceSkillLimit,
  );

  const toggleLanguage = (language: string) => {
    setLocalLanguages((current) =>
      toggleChoice(current, language, raceLanguageLimit),
    );
  };

  const toggleSkill = (nextSkill: SkillName) => {
    setLocalSkills((current) =>
      toggleChoice(current, nextSkill, raceSkillLimit),
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h2
          className="mb-1 text-2xl font-bold"
          style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}
        >
          {copy.chooseRaceTitle}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {copy.chooseRaceDescription}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {RACES.map((candidate) => (
          <EntityCard
            id={candidate.id}
            imageUrl={candidate.imageUrl}
            key={candidate.id}
            name={raceName(candidate)}
            onSelect={openPanel}
            selected={race?.id === candidate.id}
            tagline={tagline(candidate)}
          />
        ))}
      </div>

      {race ? (
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
            {copy.selected}: {raceName(race, subrace)}
          </span>
          {race.subraces && !subrace ? (
            <span
              className="ml-2 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              - {copy.subraceRequired}
            </span>
          ) : null}
        </div>
      ) : null}

      <EntityDetailPanel
        imageUrl={panelRace?.symbolUrl ?? ''}
        onClose={() => setPanelRace(null)}
        onSelect={handleSelect}
        open={Boolean(panelRace)}
        selectDisabled={selectDisabled}
        selectLabel={`${phrase('Select')} ${
          panelRace ? raceName(panelRace, localSubrace) : ''
        }`}
        title={panelRace ? raceName(panelRace) : ''}
      >
        {panelRace ? (
          <>
            <p
              className={`text-sm ${dirClass}`}
              style={{ color: 'var(--color-text-muted)' }}
            >
              {tagline(panelRace)}
            </p>

            <RacePreviewImage
              imageUrl={panelRace.imageUrl}
              title={raceName(panelRace)}
            />

            {panelRace.subraces ? (
              <PanelSection title={copy.subraceRequired}>
                <div className="space-y-2">
                  {panelRace.subraces.map((candidate) => {
                    const active = localSubrace?.id === candidate.id;

                    return (
                      <button
                        className={`w-full rounded-xl border p-3 transition-all duration-150 ${dirClass}`}
                        key={candidate.id}
                        onClick={() => {
                          setLocalSubrace(candidate);
                          setLocalLanguages([]);
                        }}
                        style={{
                          background: active
                            ? 'var(--color-gold-dim)'
                            : 'var(--color-surface-elevated)',
                          borderColor: active
                            ? 'var(--color-gold)'
                            : 'var(--color-border)',
                        }}
                        type="button"
                      >
                        <div
                          className="mb-3 aspect-[4/3] overflow-hidden rounded-lg border"
                          style={{
                            background: 'var(--color-surface)',
                            borderColor: active
                              ? 'var(--color-gold-border)'
                              : 'var(--color-border)',
                          }}
                        >
                          <img
                            alt={phrase(candidate.name)}
                            className="h-full w-full object-cover object-top"
                            loading="lazy"
                            src={candidate.imageUrl}
                          />
                        </div>
                        <div
                          className="mb-0.5 text-sm font-semibold"
                          style={{
                            color: active
                              ? 'var(--color-gold)'
                              : 'var(--color-text)',
                          }}
                        >
                          {phrase(candidate.name)}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {phrase(candidate.description)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </PanelSection>
            ) : null}

            <PanelSection title={phrase('Core Stats')}>
              <StatPill
                label={phrase('Speed')}
                value={`${panelRace.speed} فوت`}
              />
              <StatPill label={phrase('Size')} value={phrase(panelRace.size)} />
            </PanelSection>

            <PanelSection title={phrase('Ability Score Increase')}>
              <div
                className="text-sm font-medium"
                style={{ color: 'var(--color-text)' }}
              >
                {fmtAsi(panelRace.asi, ability, copy.noValue)}
              </div>
            </PanelSection>

            <PanelSection title={phrase('Languages')}>
              <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                {list(panelRace.languages)}
              </div>
            </PanelSection>

            {raceLanguageLimit > 0 ? (
              <PanelSection
                title={`${phrase('Languages')}: ${raceLanguageLimit} ${phrase('choice')}`}
              >
                <ChoiceGrid
                  options={getAvailableLanguageChoices(previewState, 'race')}
                  selected={localLanguages}
                  onToggle={toggleLanguage}
                  phrase={phrase}
                  getDescription={(language) =>
                    phrase(getLanguageDescription(language))
                  }
                />
                <ChoiceCount
                  current={localLanguages.length}
                  target={raceLanguageLimit}
                  suffix={copy.selectedCount}
                />
              </PanelSection>
            ) : null}

            {raceSkillLimit > 0 ? (
              <PanelSection
                title={`${phrase('Skill Versatility')}: ${raceSkillLimit} ${phrase('Skill Proficiencies')}`}
              >
                <ChoiceGrid
                  options={getAvailableRaceSkillChoices(previewState)}
                  selected={localSkills}
                  onToggle={toggleSkill}
                  phrase={skill}
                />
                <ChoiceCount
                  current={localSkills.length}
                  target={raceSkillLimit}
                  suffix={copy.selectedCount}
                />
              </PanelSection>
            ) : null}

            <PanelSection title={phrase('Features & Traits')}>
              {panelRace.traits.map((trait) => (
                <TraitCard key={trait.name} {...feature(trait)} />
              ))}
              {localSubrace
                ? localSubrace.traits.map((trait) => (
                    <TraitCard key={trait.name} {...feature(trait)} />
                  ))
                : null}
            </PanelSection>
          </>
        ) : null}
      </EntityDetailPanel>
    </div>
  );
}

function ChoiceGrid<T extends string>({
  getDescription,
  onToggle,
  options,
  phrase,
  selected,
}: {
  getDescription?: (value: T) => string;
  onToggle: (value: T) => void;
  options: T[];
  phrase: (value: T) => string;
  selected: T[];
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((option) => {
        const chosen = selected.includes(option);

        return (
          <SelectableOption
            description={getDescription?.(option)}
            key={option}
            onClick={() => onToggle(option)}
            selected={chosen}
          >
            {phrase(option)}
          </SelectableOption>
        );
      })}
    </div>
  );
}

function ChoiceCount({
  current,
  suffix,
  target,
}: {
  current: number;
  suffix: string;
  target: number;
}) {
  return (
    <div
      className="mt-2 text-center text-xs"
      style={{ color: 'var(--color-text-muted)' }}
    >
      {current} / {target} {suffix}
    </div>
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
