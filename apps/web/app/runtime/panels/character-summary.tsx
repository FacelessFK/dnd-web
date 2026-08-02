'use client';

/**
 * One character, at a glance.
 *
 * Shared by both shells, which is why the provenance block is opt-in. Those two
 * rows are a runtime character ID and the library entry it was copied from -
 * the GM's roster is built out of exactly that, and a player has no use for
 * either. Rendering them by default is how a raw identifier reaches a player's
 * screen, so a caller has to ask.
 */
import type { CharacterResource } from '@dnd/protocol';

import { useI18n } from '../../../lib/i18n';
import { getCharacterLibrarySourceProvenance } from '../../../lib/runtime-cockpit-helpers';
import { localizeRuntimeCharacterStatus } from '../../../lib/runtime-localization';
import {
  EmptyState,
  Stat,
  StatusBadge,
  StatusRow,
} from '../hud/hud-primitives';

export function CharacterSummary({
  currentTurnParticipantId,
  participantId,
  resource,
  showSourceIds = false,
  title,
  variant = 'normal',
}: {
  currentTurnParticipantId: string | null;
  participantId: string;
  resource?: CharacterResource;
  /** GM surfaces only. See the module note. */
  showSourceIds?: boolean;
  title: string;
  variant?: 'hero' | 'normal';
}) {
  const { t } = useI18n();

  if (!resource) {
    return (
      <EmptyState
        detail={t('runtime.characterSummary.emptyDetail', { name: title })}
        title={t('runtime.characterSummary.emptyTitle')}
      />
    );
  }

  const sourceProvenance = showSourceIds
    ? getCharacterLibrarySourceProvenance(resource)
    : null;

  return (
    <article
      className={`rounded-2xl border p-3 ${
        participantId === currentTurnParticipantId
          ? 'border-amber-300/45 bg-amber-950/35 shadow-lg shadow-amber-950/25'
          : variant === 'hero'
            ? 'border-sky-300/35 bg-sky-950/25'
            : 'border-amber-500/15 bg-black/25'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-black text-amber-50" dir="auto">
            {resource.character.name}
          </h3>
          <p className="text-sm text-amber-100/60" dir="auto">
            {title} · {resource.character.className} {resource.character.level}
          </p>
        </div>
        <StatusBadge
          label={localizeRuntimeCharacterStatus(resource.character.status, t)}
          tone={participantId === currentTurnParticipantId ? 'warning' : 'info'}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Stat
          label={t('runtime.characterSummary.hitPoints')}
          value={`${resource.character.hp.current}/${resource.character.hp.max}`}
        />
        <Stat
          label={t('runtime.characterSummary.armorClass')}
          value={String(resource.character.armorClass)}
        />
        <Stat
          label={t('runtime.characterSummary.speed')}
          value={t('runtime.characterSummary.speedValue', {
            feet: String(resource.character.speed),
          })}
        />
        <Stat
          label={t('runtime.characterSummary.proficiency')}
          value={`+${resource.derived.proficiencyBonus}`}
        />
        <Stat
          label={t('runtime.characterSummary.initiative')}
          value={`${resource.derived.initiativeModifier >= 0 ? '+' : ''}${resource.derived.initiativeModifier}`}
        />
        <Stat
          label={t('runtime.characterSummary.passivePerception')}
          value={String(resource.derived.passivePerception)}
        />
      </dl>
      <p className="mt-3 text-xs text-amber-100/60" dir="auto">
        {t('runtime.characterSummary.conditions')}:{' '}
        {resource.overlay.activeConditions.length
          ? resource.overlay.activeConditions.join(', ')
          : t('common.none')}
      </p>
      {sourceProvenance ? (
        <dl className="mt-3 grid gap-2 rounded-xl border border-sky-300/15 bg-sky-950/20 p-2 text-xs">
          <StatusRow
            label={t('runtime.assignmentRequests.runtimeCopy')}
            value={sourceProvenance.runtimeCharacterId}
          />
          <StatusRow
            label={t('runtime.assignmentRequests.sourceLibraryEntry')}
            value={sourceProvenance.sourceLibraryEntryId}
          />
        </dl>
      ) : null}
    </article>
  );
}
