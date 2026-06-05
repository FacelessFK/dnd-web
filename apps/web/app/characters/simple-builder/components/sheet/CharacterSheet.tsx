import { useMemo, useState } from 'react';
import type { CharacterLibraryEntryId } from '@dnd/protocol';

import { useAuth } from '../../../../../lib/auth-context';
import {
  createCharacterLibraryEntry,
  updateCharacterLibraryEntry,
} from '../../../../../lib/character-library-api';
import {
  formatCharacterLibrarySaveFailure,
  getPortraitDataUrlValidationMessage,
} from '../../../../../lib/character-library-errors';
import {
  downloadCharacterSheetPdf,
  type CharacterSheetTemplateId,
} from '../../../../../lib/character-sheet-pdf';
import { CharacterSheetPdfPreview } from '../../../character-sheet-pdf-preview';
import {
  createSimpleBuilderLibraryEntry,
  createSimpleBuilderSelections,
  toCharacterLibraryEntryInput,
} from '../../library-entry';
import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import {
  getAC,
  getAllEquipment,
  getAllFeatures,
  getAbilityModifiers,
  getFinalAbilityScores,
  getHP,
  getInitiative,
  getPassivePerception,
  getSavingThrows,
  getSkills,
  getOtherProficienciesAndLanguagesSummary,
  getSpellcastingSummary,
  getSpeed,
} from '../../store/selectors';
import type { AbilityName, SkillName } from '../../types';
import { SheetSection } from './SheetSection';

function fmtMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function CharacterSheet({
  characterId,
  mode = 'new',
}: {
  characterId?: CharacterLibraryEntryId;
  mode?: 'edit' | 'new';
}) {
  const store = useCharacterStore();
  const { user } = useAuth();
  const [previewingPdfTemplate, setPreviewingPdfTemplate] =
    useState<CharacterSheetTemplateId | null>(null);
  const downloadingPdfTemplate = previewingPdfTemplate;
  const setDownloadingPdfTemplate = setPreviewingPdfTemplate;
  const [saving, setSaving] = useState(false);
  const [pdfNotice, setPdfNotice] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const {
    age,
    alignment,
    background,
    backstory,
    dndClass,
    height,
    name,
    portraitDataUrl,
    pronouns,
    race,
    subrace,
    weight,
  } = store;
  const {
    ability,
    alignment: alignmentLabel,
    backgroundName,
    className,
    copy,
    feature,
    isFa,
    phrase,
    raceName,
    skill,
    source,
  } = useBuilderI18n();

  const finals = getFinalAbilityScores(store);
  const mods = getAbilityModifiers(store);
  const savingThrows = getSavingThrows(store);
  const skills = getSkills(store);
  const passivePerception = getPassivePerception(store);
  const hp = getHP(store);
  const ac = getAC(store);
  const initiative = getInitiative(store);
  const speed = getSpeed(store);
  const otherProficiencies = getOtherProficienciesAndLanguagesSummary(store);
  const features = getAllFeatures(store);
  const equipment = getAllEquipment(store);
  const spellcastingSummary = getSpellcastingSummary(store);
  const previewLibraryEntry = useMemo(
    () =>
      previewingPdfTemplate
        ? createSimpleBuilderLibraryEntry(
            store,
            createSimpleBuilderSelections(store),
            previewingPdfTemplate,
            user?.id ?? 'dev-player-001',
          )
        : null,
    [previewingPdfTemplate, store, user?.id],
  );

  const handleDownloadPdf = async (
    templateId: CharacterSheetTemplateId,
  ): Promise<void> => {
    setDownloadingPdfTemplate(templateId);
    setPdfNotice('');
    if (typeof window !== 'undefined') {
      return;
    }

    try {
      const result = await downloadCharacterSheetPdf(
        createSimpleBuilderLibraryEntry(
          store,
          createSimpleBuilderSelections(store),
          templateId,
          user?.id ?? 'dev-player-001',
        ),
        { templateId },
      );

      setPdfNotice(
        result.fallbackReason
          ? `PDF جایگزین دانلود شد: ${result.fallbackReason}`
          : `${result.template.label} دانلود شد.`,
      );
    } catch (error) {
      setPdfNotice(
        error instanceof Error
          ? `دانلود PDF ناموفق بود: ${error.message}`
          : 'دانلود PDF ناموفق بود.',
      );
    } finally {
      setDownloadingPdfTemplate(null);
    }
  };

  const handleSaveCharacter = async (): Promise<void> => {
    if (!user) {
      setSaveNotice('برای ذخیره کاراکتر باید وارد حساب کاربری شوید.');
      return;
    }

    const portraitError = getPortraitDataUrlValidationMessage(
      portraitDataUrl,
      isFa,
    );

    if (portraitError) {
      setSaveNotice(portraitError);
      return;
    }

    setSaving(true);
    setSaveNotice('');

    const entry = createSimpleBuilderLibraryEntry(
      store,
      createSimpleBuilderSelections(store),
      'dnd-2024-template',
      user.id,
    );
    const input = toCharacterLibraryEntryInput(entry);
    const result =
      mode === 'edit' && characterId
        ? await updateCharacterLibraryEntry(user.id, characterId, input)
        : await createCharacterLibraryEntry(user.id, input);

    if (result.ok) {
      setSaveNotice(
        mode === 'edit'
          ? 'تغییرات کاراکتر در کتابخانه ذخیره شد.'
          : 'کاراکتر در کتابخانه حساب شما ذخیره شد.',
      );
    } else {
      setSaveNotice(
        `ذخیره ناموفق بود: ${formatCharacterLibrarySaveFailure(
          result.error.message,
          isFa,
        )}`,
      );
    }

    setSaving(false);
  };

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}
          >
            {copy.sheetTitle}
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {phrase('Level')} 1 - D&D 5e
          </p>
        </div>
        <button
          className="rounded-xl border px-5 py-2.5 text-sm font-medium transition-all hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
          onClick={() => window.print()}
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
          type="button"
        >
          {copy.printSheet}
        </button>
      </div>

      <div className="space-y-4">
        <SheetSection title={phrase('Character')}>
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
            <div
              className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border"
              style={{
                background: 'var(--color-surface-elevated)',
                borderColor: 'var(--color-border)',
              }}
            >
              {portraitDataUrl ? (
                <img
                  alt="پرتره کاراکتر"
                  className="h-full w-full object-cover object-top"
                  src={portraitDataUrl}
                />
              ) : (
                <span
                  className="text-3xl font-bold"
                  style={{ color: 'var(--color-gold)' }}
                >
                  D20
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <InfoRow label={phrase('Name')} value={name || copy.noValue} />
              <InfoRow
                label={copy.stepLabels.race ?? 'Race'}
                value={raceName(race, subrace)}
              />
              <InfoRow
                label={copy.stepLabels.class ?? 'Class'}
                value={className(dndClass)}
              />
              <InfoRow
                label={copy.stepLabels.background ?? 'Background'}
                value={backgroundName(background)}
              />
              <InfoRow
                label={copy.fieldAlignment}
                value={alignmentLabel(alignment)}
              />
              <InfoRow label={phrase('Level')} value="1" />
              <InfoRow label="XP" value="0" />
              {age ? <InfoRow label={copy.fieldAge} value={age} /> : null}
              {height ? (
                <InfoRow label={copy.fieldHeight} value={height} />
              ) : null}
              {weight ? (
                <InfoRow label={copy.fieldWeight} value={weight} />
              ) : null}
              {pronouns ? (
                <InfoRow label={copy.fieldPronouns} value={pronouns} />
              ) : null}
            </div>
          </div>
        </SheetSection>

        <SheetSection title={copy.stepLabels.abilityScores ?? 'Abilities'}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {(Object.keys(finals) as AbilityName[]).map((item) => (
              <div
                className="flex flex-col items-center gap-1 rounded-xl border p-3"
                key={item}
                style={{
                  background: 'var(--color-surface-elevated)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <span
                  className="text-[10px] font-bold tracking-widest"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {item}
                </span>
                <span
                  className="text-2xl font-bold"
                  style={{ color: 'var(--color-text)' }}
                >
                  {finals[item]}
                </span>
                <span
                  className="text-base font-semibold"
                  style={{ color: 'var(--color-gold)' }}
                >
                  {fmtMod(mods[item])}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {ability(item)}
                </span>
              </div>
            ))}
          </div>
        </SheetSection>

        <SheetSection title={phrase('Combat')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <CombatStat label={phrase('Armor Class')} value={ac} />
            <CombatStat
              label={phrase('Initiative')}
              value={fmtMod(initiative)}
            />
            <CombatStat label={phrase('Speed')} value={`${speed} فوت`} />
            <CombatStat label="HP" value={hp} />
            <CombatStat
              label={phrase('Hit Dice')}
              value={`1d${dndClass?.hitDie ?? 8}`}
            />
          </div>
          <div
            className="mt-3 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {phrase('Proficiency Bonus')}:{' '}
            <span className="font-bold" style={{ color: 'var(--color-gold)' }}>
              +2
            </span>
          </div>
        </SheetSection>

        <SheetSection title={phrase('Saving Throws')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {savingThrows.map((item) => (
              <div
                className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                key={item.ability}
                style={{ background: 'var(--color-surface-elevated)' }}
              >
                <ProfDot proficient={item.proficient} />
                <span
                  className="flex-1 text-xs font-medium"
                  style={{ color: 'var(--color-text)' }}
                >
                  {ability(item.ability)}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{
                    color: item.proficient
                      ? 'var(--color-gold)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {fmtMod(item.value)}
                </span>
              </div>
            ))}
          </div>
        </SheetSection>

        <SheetSection title={phrase('Skill Proficiencies')}>
          <div
            className="mb-3 inline-block rounded-lg p-2 text-xs"
            style={{
              background: 'var(--color-gold-dim)',
              color: 'var(--color-gold)',
            }}
          >
            {phrase('Perception')}: {passivePerception}
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {skills.map((item) => (
              <div
                className="flex items-center gap-2.5 rounded-lg px-3 py-1.5"
                key={item.skill}
                style={{ background: 'var(--color-surface-elevated)' }}
              >
                <ProfDot proficient={item.proficient} />
                <span
                  className="flex-1 text-xs"
                  style={{ color: 'var(--color-text)' }}
                >
                  {skill(item.skill)}
                  <span
                    className="ml-1 text-[10px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    ({ability(item.ability)})
                  </span>
                </span>
                <span
                  className="text-sm font-bold"
                  style={{
                    color: item.proficient
                      ? 'var(--color-gold)'
                      : 'var(--color-text-muted)',
                  }}
                >
                  {fmtMod(item.value)}
                </span>
              </div>
            ))}
          </div>
        </SheetSection>

        <SheetSection title={phrase('Proficiencies & Languages')}>
          <div className="space-y-4">
            <ProfList
              label={phrase('Languages')}
              items={otherProficiencies.languages.map(phrase)}
            />
            {otherProficiencies.skillGroups.map((group) => (
              <SkillSummaryGroup
                key={group.source}
                label={
                  isFa
                    ? `مهارت‌های ${source(group.source)}`
                    : `${source(group.source)} ${phrase('Skills')}`
                }
                phrase={phrase}
                skill={skill}
                skills={group.skills}
              />
            ))}
            {otherProficiencies.tools.length > 0 ? (
              <ProfList
                label={phrase('Tools')}
                items={otherProficiencies.tools.map(phrase)}
              />
            ) : null}
          </div>
        </SheetSection>

        <SheetSection title={phrase('Features & Traits')}>
          <div className="space-y-2">
            {features.map((item) => (
              <FeatureCard
                key={`${item.source}-${item.name}`}
                {...feature(item)}
                source={source(item.source)}
              />
            ))}
          </div>
        </SheetSection>

        <SheetSection title={phrase('Equipment')}>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {equipment.map((item) => (
              <li
                className="flex gap-2 text-sm"
                key={item}
                style={{ color: 'var(--color-text-muted)' }}
              >
                <span style={{ color: 'var(--color-gold)' }}>•</span>{' '}
                {phrase(item)}
              </li>
            ))}
          </ul>
        </SheetSection>

        {spellcastingSummary && dndClass?.spellcasting ? (
          <SheetSection title={phrase('Spellcasting')}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <InfoBadge
                  label={phrase('Ability')}
                  value={ability(spellcastingSummary.ability)}
                />
                <InfoBadge
                  label={phrase('Spell Save DC')}
                  value={spellcastingSummary.spellSaveDc}
                />
                <InfoBadge
                  label={phrase('Spell Attack')}
                  value={fmtMod(spellcastingSummary.spellAttackBonus)}
                />
                {dndClass.spellcasting.cantripsKnown > 0 ? (
                  <InfoBadge
                    label={phrase('Cantrips')}
                    value={spellcastingSummary.cantripsKnown}
                  />
                ) : null}
                <InfoBadge
                  label={phrase('Prepared Spells')}
                  value={spellcastingSummary.preparedLimit}
                />
                {spellcastingSummary.spellSlots.map((slot) => (
                  <InfoBadge
                    key={slot.level}
                    label={`${phrase('Level')} ${slot.level}`}
                    value={slot.slots}
                  />
                ))}
              </div>
              <ProfList
                label={phrase('Cantrips')}
                items={(spellcastingSummary.selectedCantrips.length
                  ? spellcastingSummary.selectedCantrips
                  : (dndClass.spellcasting.cantrips ?? [])
                ).map(phrase)}
              />
              <ProfList
                label={phrase('Prepared Spells')}
                items={(spellcastingSummary.selectedPreparedSpells.length
                  ? spellcastingSummary.selectedPreparedSpells
                  : (dndClass.spellcasting.preparedSpells ?? [])
                ).map(phrase)}
              />
            </div>
          </SheetSection>
        ) : null}

        {backstory ? (
          <SheetSection title={copy.fieldBackstory}>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {backstory}
            </p>
          </SheetSection>
        ) : null}

        <div
          className="no-print rounded-2xl border p-4"
          style={{
            background: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="rounded-xl border px-4 py-3 text-sm font-bold transition-all hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
              disabled={saving}
              onClick={() => void handleSaveCharacter()}
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              type="button"
            >
              {saving ? 'در حال ذخیره...' : 'ذخیره در کتابخانه'}
            </button>
            <button
              className="rounded-xl border px-4 py-3 text-sm font-bold transition-all hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={downloadingPdfTemplate !== null}
              onClick={() => void handleDownloadPdf('dnd-2024-template')}
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              type="button"
            >
              {downloadingPdfTemplate === 'dnd-2024-template'
                ? 'در حال آماده‌سازی...'
                : 'PDF شیت ۲۰۲۴'}
            </button>
            <button
              className="rounded-xl border px-4 py-3 text-sm font-bold transition-all hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={downloadingPdfTemplate !== null}
              onClick={() => void handleDownloadPdf('dnd-2014-template')}
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              type="button"
            >
              {downloadingPdfTemplate === 'dnd-2014-template'
                ? 'در حال آماده‌سازی...'
                : 'PDF شیت ۲۰۱۴'}
            </button>
          </div>
          {pdfNotice ? (
            <p
              className="mt-3 text-xs font-medium"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {pdfNotice}
            </p>
          ) : null}
          {saveNotice ? (
            <p
              className="mt-3 text-xs font-medium"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {saveNotice}
            </p>
          ) : null}
        </div>
        {previewingPdfTemplate && previewLibraryEntry ? (
          <CharacterSheetPdfPreview
            entry={previewLibraryEntry}
            onClose={() => setPreviewingPdfTemplate(null)}
            onNotice={setPdfNotice}
            templateId={previewingPdfTemplate}
          />
        ) : null}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-sm font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </div>
    </div>
  );
}

function CombatStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border p-3 text-center"
      style={{
        background: 'var(--color-surface-elevated)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-bold"
        style={{ color: 'var(--color-gold)' }}
      >
        {value}
      </div>
    </div>
  );
}

function ProfDot({ proficient }: { proficient: boolean }) {
  return (
    <div
      className="h-3 w-3 flex-shrink-0 rounded-full"
      style={{
        background: proficient ? 'var(--color-gold)' : 'var(--color-border)',
      }}
    />
  );
}

function ProfList({ label, items }: { items: string[]; label: string }) {
  return (
    <div>
      <div
        className="mb-1.5 text-[10px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <div className="text-sm" style={{ color: 'var(--color-text)' }}>
        {items.join('، ') || '-'}
      </div>
    </div>
  );
}

function SkillSummaryGroup({
  label,
  phrase,
  skill,
  skills,
}: {
  label: string;
  phrase: (value: string) => string;
  skill: (value: SkillName) => string;
  skills: { name: SkillName; description: string }[];
}) {
  return (
    <div>
      <div
        className="mb-1.5 text-[10px] font-bold uppercase tracking-widest"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <div className="space-y-1">
        {skills.map((item) => (
          <div className="text-sm" key={item.name}>
            <span
              className="font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              {skill(item.name)}:
            </span>{' '}
            <span style={{ color: 'var(--color-text-muted)' }}>
              {phrase(item.description)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({
  description,
  name,
  source,
}: {
  description: string;
  name: string;
  source: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <button
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-white/5"
        onClick={() => setOpen((value) => !value)}
        style={{ background: 'var(--color-surface-elevated)' }}
        type="button"
      >
        <div>
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            {name}
          </span>
          <span
            className="ml-2 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {source}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open ? (
        <div
          className="px-4 py-3 text-xs leading-relaxed"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {description}
        </div>
      ) : null}
    </div>
  );
}

function InfoBadge({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        background: 'var(--color-surface-elevated)',
        borderColor: 'var(--color-border)',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <div className="text-sm font-bold" style={{ color: 'var(--color-gold)' }}>
        {value}
      </div>
    </div>
  );
}
