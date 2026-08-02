/**
 * Where one player stands with their own character.
 *
 * Pure. Answers the four questions the onboarding flow turns on - is there a
 * character, is it finalized, has it been submitted, has the GM assigned it -
 * and turns each blocked control into one localized sentence.
 *
 * The distinction between *assigned* and *submitted* is the one worth keeping
 * straight, because the runtime character and the library entry it was copied
 * from are different records. A player holds a runtime copy the moment they
 * submit; the GM's assignment is what makes it the seat's character. Conflating
 * the two is how a player ends up being told to wait for something that has
 * already happened.
 */
import type { CharacterLibraryEntry, CharacterResource } from '@dnd/protocol';

import {
  getLibraryEntrySubmissionBlocker,
  validateCharacterDraftForm,
  type CharacterDraftForm,
  type LibraryEntrySubmissionBlocker,
  type SessionSnapshot,
} from './runtime-cockpit-helpers';
import type { RuntimeTranslator } from './runtime-localization';

export type RuntimePlayerModelInput = {
  busyReason: string | null;
  characterDraft: CharacterDraftForm;
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  finalizedLibraryEntries: CharacterLibraryEntry[];
  hasAuthUser: boolean;
  knownCharacterIds: Record<string, string | undefined>;
  libraryLoading: boolean;
  missingSessionReason: string | null;
  playerParticipantId: string;
  selectedLibraryEntryId: string;
  sessionId: string;
  sessionState: SessionSnapshot | null;
  t: RuntimeTranslator;
};

export function deriveRuntimePlayerModel(input: RuntimePlayerModelInput) {
  const {
    busyReason,
    characterDraft,
    charactersByParticipant,
    finalizedLibraryEntries,
    hasAuthUser,
    knownCharacterIds,
    libraryLoading,
    missingSessionReason,
    playerParticipantId,
    selectedLibraryEntryId,
    sessionId,
    sessionState,
    t,
  } = input;

  const seat = sessionState?.participants.find(
    (participant) => participant.id === playerParticipantId,
  );
  const character = charactersByParticipant[playerParticipantId];
  const isJoined = Boolean(seat);
  const assignedCharacterId = seat?.characterId ?? null;
  const pendingCharacterId = seat?.pendingCharacterId ?? null;
  const characterId =
    character?.character.id ??
    pendingCharacterId ??
    knownCharacterIds[playerParticipantId];
  const isCharacterAssigned = Boolean(
    characterId && assignedCharacterId === characterId,
  );
  const isCharacterSubmitted = Boolean(
    characterId && pendingCharacterId === characterId,
  );
  const isCharacterReady = character?.character.status === 'ready';

  const characterDraftErrors = validateCharacterDraftForm(characterDraft);
  const setupReason =
    busyReason ??
    missingSessionReason ??
    (isJoined ? null : t('runtime.disabled.joinAsPlayer'));
  const draftReason = characterDraftErrors.length
    ? t('runtime.disabled.fixCharacterSheet', {
        error: characterDraftErrors[0]!,
      })
    : null;
  const noCharacterReason = character
    ? null
    : t('runtime.disabled.createOrRecoverCharacter');

  const submissionBlocker = getLibraryEntrySubmissionBlocker({
    // A library still loading is a form of busy: submitting mid-load can pick
    // an entry the list is about to replace.
    busyLabel: libraryLoading ? 'character library' : null,
    finalizedEntryCount: finalizedLibraryEntries.length,
    hasAuthUser,
    isPlayerCharacterAssigned: isCharacterAssigned,
    isPlayerCharacterSubmitted: isCharacterSubmitted,
    isPlayerJoined: isJoined,
    selectedEntryId: selectedLibraryEntryId,
    sessionId,
  });

  return {
    assignedCharacterId,
    character,
    characterDraftErrors,
    characterId,
    isCharacterAssigned,
    isCharacterReady,
    isCharacterSubmitted,
    isJoined,
    pendingCharacterId,
    reasons: {
      create:
        setupReason ??
        draftReason ??
        (character ? t('runtime.disabled.characterAlreadyLoaded') : null),
      finalize:
        setupReason ??
        noCharacterReason ??
        (isCharacterReady
          ? t('runtime.disabled.characterAlreadyFinalized')
          : null),
      submit:
        setupReason ??
        noCharacterReason ??
        (isCharacterReady
          ? null
          : t('runtime.disabled.finalizeBeforeSubmitting')) ??
        (isCharacterAssigned
          ? t('runtime.disabled.characterAlreadyAssigned')
          : null) ??
        (isCharacterSubmitted
          ? t('runtime.disabled.characterAwaitingAssignment')
          : null),
      submitLibraryEntry: submissionBlocker
        ? describeLibraryEntryBlocker(submissionBlocker, t)
        : null,
      update: setupReason ?? draftReason ?? noCharacterReason,
    },
    submissionBlocker,
  };
}

export type RuntimePlayerModel = ReturnType<typeof deriveRuntimePlayerModel>;

export function describeLibraryEntryBlocker(
  blocker: LibraryEntrySubmissionBlocker,
  t: RuntimeTranslator,
): string {
  switch (blocker) {
    case 'already_assigned':
      return t('runtime.characterLibrary.blocker.alreadyAssigned');
    case 'already_submitted':
      return t('runtime.characterLibrary.blocker.alreadySubmitted');
    case 'busy':
      return t('runtime.characterLibrary.blocker.busy');
    case 'missing_auth':
      return t('runtime.characterLibrary.blocker.missingAuth');
    case 'missing_selection':
      return t('runtime.characterLibrary.blocker.missingSelection');
    case 'missing_session':
      return t('runtime.characterLibrary.blocker.missingSession');
    case 'no_finalized_entries':
      return t('runtime.characterLibrary.blocker.noFinalizedEntries');
    case 'not_joined':
      return t('runtime.characterLibrary.blocker.notJoined');
  }
}
