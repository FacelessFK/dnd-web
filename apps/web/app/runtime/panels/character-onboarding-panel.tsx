'use client';

import type { CharacterLibraryEntry, CharacterResource } from '@dnd/protocol';

import { useI18n } from '../../../lib/i18n';
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
  playerParticipantId,
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
  playerParticipantId: string;
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
      description="Create and maintain your own character draft. The server validates and returns the authoritative sheet."
      eyebrow="Character sheet"
      title="Player Character"
      tone="player"
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {playerCharacter?.character.name ?? 'Unwritten adventurer'}
            </p>
            <p className="mt-1 text-xs text-amber-100/60">
              Owner: {playerParticipantId}
              {playerCharacter
                ? ` · ${playerCharacter.character.status}`
                : ' · draft not created'}
            </p>
          </div>
          <StatusBadge label={statusLabel} tone={statusTone} />
        </div>

        {characterDraftErrors.length ? (
          <Notice title="Sheet needs attention" tone="warning">
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
            label="Name"
            onChange={(value) => onFieldChange('name', value)}
            value={characterDraft.name}
          />
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Class"
              onChange={(value) => onFieldChange('className', value)}
              value={characterDraft.className}
            />
            <LabeledInput
              label="Level (create only)"
              onChange={(value) => onFieldChange('level', value)}
              value={characterDraft.level}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Species/Race"
              onChange={(value) => onFieldChange('speciesOrRace', value)}
              value={characterDraft.speciesOrRace}
            />
            <LabeledInput
              label="Background"
              onChange={(value) => onFieldChange('background', value)}
              value={characterDraft.background}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300/70">
            Abilities
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
            Combat Basics
          </p>
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="HP Max"
              onChange={(value) => onHpChange('max', value)}
              value={characterDraft.hp.max}
            />
            <LabeledInput
              label="HP Current"
              onChange={(value) => onHpChange('current', value)}
              value={characterDraft.hp.current}
            />
            <LabeledInput
              label="Temp HP"
              onChange={(value) => onHpChange('temp', value)}
              value={characterDraft.hp.temp}
            />
            <LabeledInput
              label="Armor Class"
              onChange={(value) => onFieldChange('armorClass', value)}
              value={characterDraft.armorClass}
            />
            <LabeledInput
              label="Speed"
              onChange={(value) => onFieldChange('speed', value)}
              value={characterDraft.speed}
            />
          </div>
        </div>

        <TextAreaField
          label="Notes"
          onChange={(value) => onFieldChange('notes', value)}
          value={characterDraft.notes}
        />

        {playerCharacter ? (
          <div className="grid gap-2 rounded-2xl border border-amber-500/15 bg-black/25 p-3 text-sm">
            <StatusRow
              label="Character ID"
              value={playerCharacter.character.id}
            />
            <StatusRow
              label="Proficiency"
              value={`+${playerCharacter.derived.proficiencyBonus}`}
            />
            <StatusRow
              label="Initiative"
              value={`${playerCharacter.derived.initiativeModifier >= 0 ? '+' : ''}${playerCharacter.derived.initiativeModifier}`}
            />
            <StatusRow
              label="Passive Perception"
              value={String(playerCharacter.derived.passivePerception)}
            />
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-4">
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label="Create Draft"
            onClick={onCreate}
          />
          <ActionButton
            disabled={Boolean(updateDisabledReason)}
            disabledReason={updateDisabledReason ?? undefined}
            label="Update Draft"
            onClick={onUpdate}
            variant="secondary"
          />
          <ActionButton
            disabled={Boolean(finalizeDisabledReason)}
            disabledReason={finalizeDisabledReason ?? undefined}
            label="Finalize"
            onClick={onFinalize}
            variant="secondary"
          />
          <ActionButton
            disabled={Boolean(submitDisabledReason)}
            disabledReason={submitDisabledReason ?? undefined}
            label="Submit to DM"
            onClick={onSubmit}
            variant="secondary"
          />
        </div>
      </div>
    </Panel>
  );
}
