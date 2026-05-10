import type {
  CharacterLibraryEntry,
  CharacterLibraryEntryId,
  CharacterLibraryEntryInput,
  RuntimeErrorCode,
} from '@dnd/protocol';

import {
  createCommandId,
  sendCharacterLibraryCommand,
  type RuntimeApiFailure,
} from './runtime-api';

export type CharacterLibraryApiResult<TData> =
  | {
      data: TData;
      ok: true;
    }
  | {
      error: RuntimeApiFailure;
      ok: false;
    };

function actor(ownerParticipantId: string) {
  return {
    participantId: ownerParticipantId,
  };
}

function apiFailure(
  message: string,
  code?: RuntimeErrorCode,
): CharacterLibraryApiResult<never> {
  return {
    error: {
      code,
      message,
    },
    ok: false,
  };
}

export async function listCharacterLibraryEntries(
  ownerParticipantId: string,
): Promise<CharacterLibraryApiResult<CharacterLibraryEntry[]>> {
  const result = await sendCharacterLibraryCommand({
    actor: actor(ownerParticipantId),
    commandId: createCommandId('character-library-list'),
    payload: {
      ownerParticipantId,
    },
    type: 'list_character_library_entries',
  });

  if (!result.ok) {
    return result;
  }

  if (!('entries' in result.response.data)) {
    return apiFailure('Runtime server did not return a character list.');
  }

  return {
    data: result.response.data.entries,
    ok: true,
  };
}

export async function getCharacterLibraryEntry(
  ownerParticipantId: string,
  entryId: CharacterLibraryEntryId,
): Promise<CharacterLibraryApiResult<CharacterLibraryEntry>> {
  const result = await sendCharacterLibraryCommand({
    actor: actor(ownerParticipantId),
    commandId: createCommandId('character-library-get'),
    payload: {
      entryId,
      ownerParticipantId,
    },
    type: 'get_character_library_entry',
  });

  return unwrapEntry(result, 'Runtime server did not return a character.');
}

export async function createCharacterLibraryEntry(
  ownerParticipantId: string,
  entry: CharacterLibraryEntryInput,
): Promise<CharacterLibraryApiResult<CharacterLibraryEntry>> {
  const result = await sendCharacterLibraryCommand({
    actor: actor(ownerParticipantId),
    commandId: createCommandId('character-library-create'),
    payload: {
      entry,
      ownerParticipantId,
    },
    type: 'create_character_library_entry',
  });

  return unwrapEntry(
    result,
    'Runtime server did not return the created character.',
  );
}

export async function updateCharacterLibraryEntry(
  ownerParticipantId: string,
  entryId: CharacterLibraryEntryId,
  entry: CharacterLibraryEntryInput,
): Promise<CharacterLibraryApiResult<CharacterLibraryEntry>> {
  const result = await sendCharacterLibraryCommand({
    actor: actor(ownerParticipantId),
    commandId: createCommandId('character-library-update'),
    payload: {
      entry,
      entryId,
      ownerParticipantId,
    },
    type: 'update_character_library_entry',
  });

  return unwrapEntry(
    result,
    'Runtime server did not return the updated character.',
  );
}

export async function finalizeCharacterLibraryEntry(
  ownerParticipantId: string,
  entryId: CharacterLibraryEntryId,
): Promise<CharacterLibraryApiResult<CharacterLibraryEntry>> {
  const result = await sendCharacterLibraryCommand({
    actor: actor(ownerParticipantId),
    commandId: createCommandId('character-library-finalize'),
    payload: {
      entryId,
      ownerParticipantId,
    },
    type: 'finalize_character_library_entry',
  });

  return unwrapEntry(
    result,
    'Runtime server did not return the finalized character.',
  );
}

function unwrapEntry(
  result: Awaited<ReturnType<typeof sendCharacterLibraryCommand>>,
  fallbackMessage: string,
): CharacterLibraryApiResult<CharacterLibraryEntry> {
  if (!result.ok) {
    return result;
  }

  if (!('entry' in result.response.data)) {
    return apiFailure(fallbackMessage);
  }

  return {
    data: result.response.data.entry,
    ok: true,
  };
}
