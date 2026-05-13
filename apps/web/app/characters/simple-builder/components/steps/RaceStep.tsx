import { useState } from 'react';
import { RACES } from '../../data/races';
import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import type {
  AbilityName,
  GenderedImageUrls,
  Race,
  Subrace,
} from '../../types';
import { EntityCard } from '../shared/EntityCard';
import {
  EntityDetailPanel,
  PanelSection,
  StatPill,
  TraitCard,
} from '../shared/EntityDetailPanel';

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

function PortraitPair({
  imageUrls,
  title,
}: {
  imageUrls: GenderedImageUrls;
  title: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { alt: `${title} male portrait`, src: imageUrls.male },
        { alt: `${title} female portrait`, src: imageUrls.female },
      ].map((image) => (
        <div
          className="aspect-square overflow-hidden rounded-xl border"
          key={image.src}
          style={{
            background: 'var(--color-surface-elevated)',
            borderColor: 'var(--color-border)',
          }}
        >
          <img
            alt={image.alt}
            className="h-full w-full object-cover object-top"
            loading="lazy"
            src={image.src}
          />
        </div>
      ))}
    </div>
  );
}

export function RaceStep() {
  const { race, setRace, setSubrace, subrace } = useCharacterStore();
  const { ability, copy, dirClass, feature, list, phrase, raceName, tagline } =
    useBuilderI18n();
  const [panelRace, setPanelRace] = useState<Race | null>(null);
  const [localSubrace, setLocalSubrace] = useState<Subrace | null>(null);

  const openPanel = (id: string) => {
    const nextRace = RACES.find((candidate) => candidate.id === id) ?? null;
    setPanelRace(nextRace);
    setLocalSubrace(nextRace?.id === race?.id ? subrace : null);
  };

  const handleSelect = () => {
    if (!panelRace) return;
    setRace(panelRace);
    setSubrace(panelRace.subraces ? localSubrace : null);
  };

  const selectDisabled = Boolean(panelRace?.subraces && !localSubrace);

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
            imageUrls={candidate.portraitUrls}
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
        imageUrl={panelRace?.imageUrl ?? ''}
        imageUrls={panelRace?.portraitUrls}
        onClose={() => setPanelRace(null)}
        onSelect={handleSelect}
        open={Boolean(panelRace)}
        selectDisabled={selectDisabled}
        selectLabel={`${phrase('Select')} ${panelRace ? raceName(panelRace) : ''}`}
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

            <PortraitPair
              imageUrls={panelRace.portraitUrls}
              title={raceName(panelRace)}
            />

            <PanelSection title={phrase('Core Stats')}>
              <StatPill
                label={phrase('Speed')}
                value={`${panelRace.speed} ft`}
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

            <PanelSection title={phrase('Features & Traits')}>
              {panelRace.traits.map((trait) => (
                <TraitCard key={trait.name} {...feature(trait)} />
              ))}
            </PanelSection>

            {panelRace.subraces ? (
              <PanelSection title={copy.subraceRequired}>
                <div className="space-y-2">
                  {panelRace.subraces.map((candidate) => {
                    const active = localSubrace?.id === candidate.id;

                    return (
                      <button
                        className={`w-full rounded-xl border p-3 transition-all duration-150 ${dirClass}`}
                        key={candidate.id}
                        onClick={() => setLocalSubrace(candidate)}
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
                        <div className="mb-3 grid grid-cols-2 gap-2">
                          {[
                            {
                              alt: `${candidate.name} male portrait`,
                              src: candidate.portraitUrls.male,
                            },
                            {
                              alt: `${candidate.name} female portrait`,
                              src: candidate.portraitUrls.female,
                            },
                          ].map((image) => (
                            <span
                              className="block aspect-square overflow-hidden rounded-lg border"
                              key={image.src}
                              style={{
                                background: 'var(--color-surface)',
                                borderColor: active
                                  ? 'var(--color-gold-border)'
                                  : 'var(--color-border)',
                              }}
                            >
                              <img
                                alt={image.alt}
                                className="h-full w-full object-cover object-top"
                                loading="lazy"
                                src={image.src}
                              />
                            </span>
                          ))}
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
                        {active
                          ? candidate.traits.map((trait) => {
                              const localizedTrait = feature(trait);

                              return (
                                <div
                                  className="mt-2 rounded-lg p-2 text-xs"
                                  key={trait.name}
                                  style={{
                                    background: 'var(--color-surface)',
                                    color: 'var(--color-text-muted)',
                                  }}
                                >
                                  <strong
                                    style={{ color: 'var(--color-gold)' }}
                                  >
                                    {localizedTrait.name}:
                                  </strong>{' '}
                                  {localizedTrait.description}
                                </div>
                              );
                            })
                          : null}
                      </button>
                    );
                  })}
                </div>
              </PanelSection>
            ) : null}
          </>
        ) : null}
      </EntityDetailPanel>
    </div>
  );
}
