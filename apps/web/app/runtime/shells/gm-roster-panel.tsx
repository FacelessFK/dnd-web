'use client';

/**
 * The seats at the table, and the characters waiting to fill them.
 *
 * This is the GM's assignment queue. It is one of the few surfaces where raw
 * identifiers are the right thing to render: assignment is an operation on
 * records, the GM is the authority over them, and a runtime copy is only
 * distinguishable from the library entry it came from by its ID.
 *
 * Note which ID is which. `pendingCharacterId` is the *runtime copy* the player
 * submitted; `sourceLibraryEntryId` is the reusable record it was copied from.
 * Assigning writes to the former and never the latter - that separation is the
 * Character Library boundary, and showing both is how a GM can see it holding.
 */
import type { CharacterResource } from '@dnd/protocol';

import type { getPendingAssignmentRequests } from '../../../lib/runtime-cockpit-helpers';
import { getAssignmentRequestCharacterPreview } from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import {
  ActionButton,
  EmptyState,
  Notice,
  Panel,
  StatusBadge,
  StatusRow,
} from '../hud/hud-primitives';
import { SelectField } from '../hud/hud-fields';
import { CharacterSummary } from '../panels/character-summary';

export type GmRosterPanelProps = {
  assignSelectedDisabledReason: string | null;
  busyReason: string | null;
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  currentTurnParticipantId: string | null;
  onAssignPending: (participantId: string, characterId: string) => void;
  onAssignSelected: () => void;
  onSelectActor: (participantId: string) => void;
  pendingRequests: ReturnType<typeof getPendingAssignmentRequests>;
  playerParticipants: Array<{ displayName: string; id: string }>;
  selectedActorId: string;
  selectedActorKnownCharacterId: string | undefined;
  t: RuntimeTranslator;
};

export function GmRosterPanel({
  assignSelectedDisabledReason,
  busyReason,
  charactersByParticipant,
  currentTurnParticipantId,
  onAssignPending,
  onAssignSelected,
  onSelectActor,
  pendingRequests,
  playerParticipants,
  selectedActorId,
  selectedActorKnownCharacterId,
  t,
}: GmRosterPanelProps) {
  return (
    <Panel
      description={t('runtime.rosterPanel.description.dm')}
      eyebrow={t('runtime.rosterPanel.eyebrow')}
      title={t('runtime.rosterPanel.title')}
      tone="dm"
    >
      <div className="grid gap-3">
        {playerParticipants.length ? (
          playerParticipants.map((participant) => (
            <CharacterSummary
              currentTurnParticipantId={currentTurnParticipantId}
              key={participant.id}
              participantId={participant.id}
              resource={charactersByParticipant[participant.id]}
              showSourceIds
              title={participant.displayName}
            />
          ))
        ) : (
          <EmptyState
            detail={t('runtime.rosterPanel.emptyDetail')}
            title={t('runtime.rosterPanel.emptyTitle')}
          />
        )}

        <div className="grid gap-3 rounded-2xl border border-sky-300/20 bg-sky-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.assignmentRequests.title')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.assignmentRequests.description')}
            </p>
          </div>
          {pendingRequests.length ? (
            pendingRequests.map((request) => {
              const preview = getAssignmentRequestCharacterPreview(
                request.character,
              );

              return (
                <div
                  className="grid gap-2 rounded-2xl border border-sky-300/15 bg-black/25 p-3"
                  key={`${request.participantId}-${request.pendingCharacterId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className="text-sm font-semibold text-amber-50"
                        dir="auto"
                      >
                        {request.displayName}
                      </p>
                      <p className="mt-1 break-all text-xs text-amber-100/60">
                        {request.participantId}
                      </p>
                    </div>
                    <StatusBadge
                      label={
                        request.assignedCharacterId
                          ? t('runtime.assignmentRequests.replacementPending')
                          : t('runtime.assignmentRequests.needsAssignment')
                      }
                      tone="warning"
                    />
                  </div>
                  {preview ? (
                    <dl className="grid gap-2 rounded-2xl border border-sky-300/15 bg-sky-950/20 p-3 text-sm">
                      <StatusRow
                        label={t('runtime.assignmentRequests.character')}
                        value={preview.name}
                      />
                      <StatusRow
                        label={t('runtime.assignmentRequests.build')}
                        value={preview.build}
                      />
                      <StatusRow
                        label={t('runtime.assignmentRequests.hp')}
                        value={preview.hitPoints}
                      />
                      <StatusRow
                        label={t('runtime.assignmentRequests.ac')}
                        value={preview.armorClass}
                      />
                      <StatusRow
                        label={t('runtime.assignmentRequests.speed')}
                        value={preview.speed}
                      />
                      <StatusRow
                        label={t('runtime.assignmentRequests.runtimeCopy')}
                        value={request.pendingCharacterId}
                      />
                      {preview.sourceLibraryEntryId ? (
                        <StatusRow
                          label={t(
                            'runtime.assignmentRequests.sourceLibraryEntry',
                          )}
                          value={preview.sourceLibraryEntryId}
                        />
                      ) : null}
                    </dl>
                  ) : (
                    <Notice
                      title={t(
                        'runtime.assignmentRequests.previewUnavailableTitle',
                      )}
                      tone="info"
                    >
                      {t('runtime.assignmentRequests.previewUnavailableDetail')}
                    </Notice>
                  )}
                  <ActionButton
                    disabled={Boolean(busyReason)}
                    disabledReason={busyReason ?? undefined}
                    label={t('runtime.assignmentRequests.submit')}
                    onClick={() =>
                      onAssignPending(
                        request.participantId,
                        request.pendingCharacterId,
                      )
                    }
                    variant="secondary"
                  />
                </div>
              );
            })
          ) : (
            <EmptyState
              detail={t('runtime.assignmentRequests.emptyDetail')}
              title={t('runtime.assignmentRequests.emptyTitle')}
            />
          )}
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">
            {t('runtime.assignmentHelper.title')}
          </p>
          <SelectField
            label={t('runtime.assignmentHelper.player')}
            onChange={onSelectActor}
            options={playerParticipants.map((participant) => ({
              label: `${participant.displayName} (${participant.id})`,
              value: participant.id,
            }))}
            value={selectedActorId}
          />
          <StatusRow
            label={t('runtime.assignmentHelper.knownCharacter')}
            value={selectedActorKnownCharacterId ?? t('common.none')}
          />
          <ActionButton
            disabled={Boolean(assignSelectedDisabledReason)}
            disabledReason={assignSelectedDisabledReason ?? undefined}
            label={t('runtime.assignmentHelper.submit')}
            onClick={onAssignSelected}
            variant="secondary"
          />
        </div>
      </div>
    </Panel>
  );
}
