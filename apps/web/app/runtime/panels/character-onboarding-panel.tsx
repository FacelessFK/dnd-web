'use client';

import type { CharacterLibraryEntry, CharacterResource } from '@dnd/protocol';

import { useI18n } from '../../../lib/i18n';
import { localizeRuntimeCharacterStatus } from '../../../lib/runtime-localization';
import {
  abilityKeys,
  type AbilityKey,
  type CharacterDraftForm,
  type RuntimeNoticeTone,
} from '../../../lib/runtime-cockpit-helpers';
import {
  ActionButton,
  EmptyState,
  Notice,
  Panel,
  StatusBadge,
  StatusRow,
} from '../hud/hud-primitives';
import { LabeledInput, SelectField, TextAreaField } from '../hud/hud-fields';

export function CharacterOnboardingPanel({
  characterDraft,
  characterDraftErrors,
  createDisabledReason,
  finalizeDisabledReason,
  isAssigned,
  libraryEntries,
  libraryEntriesLoading,
  libraryEntryError,
  libraryEntrySubmitDisabledReason,
  onAbilityChange,
  onCreate,
  onFieldChange,
  onFinalize,
  onHpChange,
  onLibraryEntryChange,
  onRefreshLibraryEntries,
  onSubmit,
  onSubmitLibraryEntry,
  onUpdate,
  pendingCharacterId,
  playerCharacter,
  selectedLibraryEntry,
  selectedLibraryEntryId,
  submitDisabledReason,
  updateDisabledReason,
}: {
  characterDraft: CharacterDraftForm;
  characterDraftErrors: string[];
  createDisabledReason: string | null;
  finalizeDisabledReason: string | null;
  isAssigned: boolean;
  libraryEntries: CharacterLibraryEntry[];
  libraryEntriesLoading: boolean;
  libraryEntryError: string | null;
  libraryEntrySubmitDisabledReason: string | null;
  onAbilityChange: (abilityKey: AbilityKey, value: string) => void;
  onCreate: () => void | Promise<void>;
  onFieldChange: (
    field:
      | 'armorClass'
      | 'background'
      | 'className'
      | 'level'
      | 'name'
      | 'notes'
      | 'speciesOrRace'
      | 'speed',
    value: string,
  ) => void;
  onFinalize: () => void | Promise<void>;
  onHpChange: (field: keyof CharacterDraftForm['hp'], value: string) => void;
  onLibraryEntryChange: (entryId: string) => void;
  onRefreshLibraryEntries: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
  onSubmitLibraryEntry: () => void | Promise<void>;
  onUpdate: () => void | Promise<void>;
  pendingCharacterId: string | null;
  playerCharacter?: CharacterResource;
  selectedLibraryEntry: CharacterLibraryEntry | null;
  selectedLibraryEntryId: string;
  submitDisabledReason: string | null;
  updateDisabledReason: string | null;
}) {
  const { t } = useI18n();
  const statusTone: RuntimeNoticeTone = playerCharacter
    ? isAssigned
      ? 'success'
      : pendingCharacterId === playerCharacter.character.id
        ? 'info'
        : 'warning'
    : 'info';
  const statusLabel = playerCharacter
    ? isAssigned
      ? t('runtime.characterLibrary.status.assigned')
      : pendingCharacterId === playerCharacter.character.id
        ? t('runtime.characterLibrary.status.submitted')
        : t('runtime.characterLibrary.status.ready')
    : t('runtime.characterLibrary.status.none');
  const libraryEntryOptions = libraryEntries.map((entry) => ({
    label: t('runtime.characterLibrary.optionLabel', {
      className: entry.className,
      level: String(entry.level),
      name: entry.name,
    }),
    value: entry.id,
  }));

  return (
    <Panel
      description={t('runtime.characterSheet.description')}
      eyebrow={t('runtime.characterSheet.eyebrow')}
      title={t('runtime.characterSheet.title')}
      tone="player"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {playerCharacter?.character.name ??
                t('runtime.characterSheet.unnamed')}
            </p>
            {/*
              The owner line used to read "Owner: player-001". A player does
              not need their own participant ID to recognise their own sheet,
              and rendering it puts an identifier the role projection withholds
              onto the one panel every player lands on.
            */}
            <p className="mt-1 text-xs text-amber-100/60">
              {playerCharacter
                ? localizeRuntimeCharacterStatus(
                    playerCharacter.character.status,
                    t,
                  )
                : t('runtime.characterSheet.draftNotCreated')}
            </p>
          </div>
          <StatusBadge label={statusLabel} tone={statusTone} />
        </div>

        {characterDraftErrors.length ? (
          <Notice
            title={t('runtime.characterSheet.needsAttention')}
            tone="warning"
          >
            <ul className="list-disc space-y-1 pl-5">
              {characterDraftErrors.slice(0, 4).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {!isAssigned && playerCharacter?.character.status === 'ready' ? (
          <Notice
            title={
              pendingCharacterId === playerCharacter.character.id
                ? t('runtime.characterLibrary.waitingTitle')
                : t('runtime.characterLibrary.submitReadyTitle')
            }
            tone="warning"
          >
            {pendingCharacterId === playerCharacter.character.id
              ? t('runtime.characterLibrary.waitingDetail', {
                  characterId: pendingCharacterId,
                })
              : t('runtime.characterLibrary.submitReadyDetail')}
          </Notice>
        ) : null}

        <div className="grid gap-3 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.characterLibrary.title')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.characterLibrary.description')}
            </p>
          </div>

          {libraryEntryError ? (
            <Notice
              title={t('runtime.characterLibrary.errorTitle')}
              tone="danger"
            >
              {libraryEntryError}
            </Notice>
          ) : null}

          {libraryEntries.length ? (
            <>
              <SelectField
                label={t('runtime.characterLibrary.selectLabel')}
                onChange={onLibraryEntryChange}
                options={libraryEntryOptions}
                value={selectedLibraryEntryId}
              />
              {selectedLibraryEntry ? (
                <>
                  <dl className="grid gap-2 rounded-2xl border border-sky-300/15 bg-black/25 p-3 text-sm">
                    <StatusRow
                      label={t('runtime.characterLibrary.entryStatus')}
                      value={selectedLibraryEntry.status}
                    />
                    <StatusRow
                      label={t('runtime.characterLibrary.entryClass')}
                      value={`${selectedLibraryEntry.className} ${selectedLibraryEntry.level}`}
                    />
                    <StatusRow
                      label={t('runtime.characterLibrary.entryId')}
                      value={selectedLibraryEntry.id}
                    />
                  </dl>
                  <Notice
                    title={t('runtime.characterLibrary.selectedTitle')}
                    tone="info"
                  >
                    {t('runtime.characterLibrary.selectedDetail', {
                      name: selectedLibraryEntry.name,
                    })}
                  </Notice>
                </>
              ) : null}
            </>
          ) : (
            <EmptyState
              detail={t('runtime.characterLibrary.emptyDetail')}
              title={t('runtime.characterLibrary.emptyTitle')}
            />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <ActionButton
              disabled={libraryEntriesLoading}
              disabledReason={
                libraryEntriesLoading
                  ? t('runtime.characterLibrary.loading')
                  : undefined
              }
              label={
                libraryEntriesLoading
                  ? t('runtime.characterLibrary.loading')
                  : t('runtime.characterLibrary.refresh')
              }
              onClick={onRefreshLibraryEntries}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(libraryEntrySubmitDisabledReason)}
              disabledReason={libraryEntrySubmitDisabledReason ?? undefined}
              label={t('runtime.characterLibrary.submit')}
              onClick={onSubmitLibraryEntry}
              variant="secondary"
            />
          </div>
        </div>

        <div className="grid gap-3">
          <LabeledInput
            label={t('runtime.characterSheet.name')}
            onChange={(value) => onFieldChange('name', value)}
            value={characterDraft.name}
          />
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label={t('runtime.characterSheet.className')}
              onChange={(value) => onFieldChange('className', value)}
              value={characterDraft.className}
            />
            <LabeledInput
              label={t('runtime.characterSheet.level')}
              onChange={(value) => onFieldChange('level', value)}
              value={characterDraft.level}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label={t('runtime.characterSheet.species')}
              onChange={(value) => onFieldChange('speciesOrRace', value)}
              value={characterDraft.speciesOrRace}
            />
            <LabeledInput
              label={t('runtime.characterSheet.background')}
              onChange={(value) => onFieldChange('background', value)}
              value={characterDraft.background}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300/70">
            {t('runtime.characterSheet.abilities')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {abilityKeys.map((abilityKey) => (
              <LabeledInput
                key={abilityKey}
                label={abilityKey.toUpperCase()}
                onChange={(value) => onAbilityChange(abilityKey, value)}
                value={characterDraft.abilities[abilityKey]}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300/70">
            {t('runtime.characterSheet.combatBasics')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label={t('runtime.combatants.hpMax')}
              onChange={(value) => onHpChange('max', value)}
              value={characterDraft.hp.max}
            />
            <LabeledInput
              label={t('runtime.combatants.hpCurrent')}
              onChange={(value) => onHpChange('current', value)}
              value={characterDraft.hp.current}
            />
            <LabeledInput
              label={t('runtime.combatants.hpTemp')}
              onChange={(value) => onHpChange('temp', value)}
              value={characterDraft.hp.temp}
            />
            <LabeledInput
              label={t('runtime.characterSummary.armorClass')}
              onChange={(value) => onFieldChange('armorClass', value)}
              value={characterDraft.armorClass}
            />
            <LabeledInput
              label={t('runtime.characterSummary.speed')}
              onChange={(value) => onFieldChange('speed', value)}
              value={characterDraft.speed}
            />
          </div>
        </div>

        <TextAreaField
          label={t('runtime.characterSheet.notes')}
          onChange={(value) => onFieldChange('notes', value)}
          value={characterDraft.notes}
        />

        {playerCharacter ? (
          <div className="grid gap-2 rounded-2xl border border-amber-500/15 bg-black/25 p-3 text-sm">
            {/* The character ID row is gone for the same reason as the owner. */}
            <StatusRow
              label={t('runtime.characterSummary.proficiency')}
              value={`+${playerCharacter.derived.proficiencyBonus}`}
            />
            <StatusRow
              label={t('runtime.characterSummary.initiative')}
              value={`${playerCharacter.derived.initiativeModifier >= 0 ? '+' : ''}${playerCharacter.derived.initiativeModifier}`}
            />
            <StatusRow
              label={t('runtime.characterSummary.passivePerception')}
              value={String(playerCharacter.derived.passivePerception)}
            />
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-4">
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label={t('runtime.characterSheet.createDraft')}
            onClick={onCreate}
          />
          <ActionButton
            disabled={Boolean(updateDisabledReason)}
            disabledReason={updateDisabledReason ?? undefined}
            label={t('runtime.characterSheet.updateDraft')}
            onClick={onUpdate}
            variant="secondary"
          />
          <ActionButton
            disabled={Boolean(finalizeDisabledReason)}
            disabledReason={finalizeDisabledReason ?? undefined}
            label={t('runtime.characterSheet.finalize')}
            onClick={onFinalize}
            variant="secondary"
          />
          <ActionButton
            disabled={Boolean(submitDisabledReason)}
            disabledReason={submitDisabledReason ?? undefined}
            label={t('runtime.characterSheet.submitToDm')}
            onClick={onSubmit}
            variant="secondary"
          />
        </div>
      </div>
    </Panel>
  );
}
