import { useState } from 'react';
import { BACKGROUNDS } from '../../data/backgrounds';
import { ALL_SKILLS } from '../../data/skills';
import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import {
  getAvailableLanguageChoices,
  getBackgroundLanguageChoiceLimit,
  getConflictingSkill,
} from '../../store/selectors';
import type { Background, SkillName } from '../../types';
import { EntityCard } from '../shared/EntityCard';
import {
  EntityDetailPanel,
  PanelSection,
  StatPill,
  TraitCard,
} from '../shared/EntityDetailPanel';

export function BackgroundStep() {
  const store = useCharacterStore();
  const {
    background,
    backgroundLanguageChoices,
    backgroundSkillOverride,
    setBackground,
    setBackgroundLanguageChoices,
    setBackgroundSkillOverride,
  } = store;
  const { backgroundName, copy, feature, list, phrase, skill, tagline } =
    useBuilderI18n();
  const [panelBg, setPanelBg] = useState<Background | null>(null);
  const [localLanguages, setLocalLanguages] = useState<string[]>([]);

  const conflict = getConflictingSkill(store);

  const openPanel = (id: string) => {
    const nextBackground =
      BACKGROUNDS.find((candidate) => candidate.id === id) ?? null;
    setPanelBg(nextBackground);
    setLocalLanguages(
      nextBackground?.id === background?.id ? backgroundLanguageChoices : [],
    );
  };

  const handleSelect = () => {
    if (!panelBg) return;
    setBackground(panelBg);
    setBackgroundLanguageChoices(localLanguages);
    setBackgroundSkillOverride(null);
  };

  const previewState = {
    ...store,
    background: panelBg,
    backgroundLanguageChoices: localLanguages,
  };
  const languageLimit = getBackgroundLanguageChoiceLimit(previewState);
  const selectDisabled = Boolean(
    panelBg && localLanguages.length < languageLimit,
  );

  const toggleLanguage = (language: string) => {
    setLocalLanguages((current) => {
      if (current.includes(language)) {
        return current.filter((candidate) => candidate !== language);
      }
      if (current.length >= languageLimit) {
        return current;
      }
      return [...current, language];
    });
  };

  const usedSkills = new Set([
    ...store.classSkillChoices,
    ...(panelBg?.skillProficiencies ?? []),
  ]);
  const availableOverrides = ALL_SKILLS.filter(
    (value) => !usedSkills.has(value),
  );

  return (
    <div>
      <div className="mb-6">
        <h2
          className="mb-1 text-2xl font-bold"
          style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}
        >
          {copy.chooseBackgroundTitle}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {copy.chooseBackgroundDescription}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {BACKGROUNDS.map((candidate) => (
          <EntityCard
            id={candidate.id}
            imageUrl={candidate.imageUrl}
            key={candidate.id}
            name={backgroundName(candidate)}
            onSelect={openPanel}
            selected={background?.id === candidate.id}
            tagline={tagline(candidate)}
          />
        ))}
      </div>

      {background ? (
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
            {copy.selected}: {backgroundName(background)}
          </span>
          {conflict && !backgroundSkillOverride ? (
            <div className="mt-3">
              <p
                className="mb-2 text-xs"
                style={{ color: 'var(--color-error)' }}
              >
                {copy.skillConflict(skill(conflict))}
              </p>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                onChange={(event) =>
                  setBackgroundSkillOverride(event.target.value as SkillName)
                }
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
                value={backgroundSkillOverride ?? ''}
              >
                <option value="">{copy.selectReplacementSkill}</option>
                {availableOverrides.map((nextSkill) => (
                  <option key={nextSkill} value={nextSkill}>
                    {skill(nextSkill)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {conflict && backgroundSkillOverride ? (
            <span
              className="ml-2 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {copy.skillReplacement(
                skill(conflict),
                skill(backgroundSkillOverride),
              )}
            </span>
          ) : null}
        </div>
      ) : null}

      <EntityDetailPanel
        imageUrl={panelBg?.imageUrl ?? ''}
        onClose={() => setPanelBg(null)}
        onSelect={handleSelect}
        open={Boolean(panelBg)}
        selectDisabled={selectDisabled}
        selectLabel={
          selectDisabled
            ? `${languageLimit - localLanguages.length} ${phrase('Languages')}`
            : `${phrase('Select')} ${panelBg ? backgroundName(panelBg) : ''}`
        }
        title={panelBg ? backgroundName(panelBg) : ''}
      >
        {panelBg ? (
          <>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {tagline(panelBg)}
            </p>

            <PanelSection title={phrase('Skill Proficiencies')}>
              <div className="flex flex-wrap gap-1">
                {panelBg.skillProficiencies.map((value) => (
                  <StatPill key={value} label="" value={skill(value)} />
                ))}
              </div>
            </PanelSection>

            {panelBg.toolProficiencies.length > 0 ? (
              <PanelSection title={phrase('Tool Proficiencies')}>
                <div className="text-sm" style={{ color: 'var(--color-text)' }}>
                  {list(panelBg.toolProficiencies)}
                </div>
              </PanelSection>
            ) : null}

            {panelBg.languages > 0 ? (
              <PanelSection title={phrase('Languages')}>
                <div
                  className="mb-2 text-sm"
                  style={{ color: 'var(--color-text)' }}
                >
                  {copy.languageChoice(panelBg.languages)}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {getAvailableLanguageChoices(
                    previewState,
                    'background',
                  ).map((language) => {
                    const chosen = localLanguages.includes(language);

                    return (
                      <button
                        className="rounded-lg px-3 py-2 text-left text-xs transition-all"
                        key={language}
                        onClick={() => toggleLanguage(language)}
                        style={{
                          background: chosen
                            ? 'var(--color-gold-dim)'
                            : 'var(--color-surface-elevated)',
                          border: `1px solid ${
                            chosen
                              ? 'var(--color-gold)'
                              : 'var(--color-border)'
                          }`,
                          color: chosen
                            ? 'var(--color-gold)'
                            : 'var(--color-text)',
                        }}
                        type="button"
                      >
                        {phrase(language)}
                      </button>
                    );
                  })}
                </div>
                <div
                  className="mt-2 text-center text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {localLanguages.length} / {languageLimit}{' '}
                  {copy.selectedCount}
                </div>
              </PanelSection>
            ) : null}

            <PanelSection title={phrase('Background Feature')}>
              <TraitCard {...feature(panelBg.feature)} />
            </PanelSection>

            <PanelSection title={phrase('Starting Equipment')}>
              <ul className="space-y-1">
                {panelBg.equipment.map((item) => (
                  <li
                    className="flex gap-1.5 text-xs"
                    key={item}
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <span style={{ color: 'var(--color-gold)' }}>•</span>{' '}
                    {phrase(item)}
                  </li>
                ))}
              </ul>
            </PanelSection>

            <PanelSection title={phrase('Personality Traits')}>
              {panelBg.personalityTraits.map((trait) => (
                <div
                  className="mb-1 rounded-lg p-2 text-xs italic"
                  key={trait}
                  style={{
                    background: 'var(--color-surface-elevated)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  "{phrase(trait)}"
                </div>
              ))}
            </PanelSection>
          </>
        ) : null}
      </EntityDetailPanel>
    </div>
  );
}
