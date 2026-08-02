'use client';

/**
 * The signed-in player's saved characters, as offered to a table.
 *
 * Only finalized entries appear. A draft cannot be brought into a session -
 * the bridge command copies a *record*, and copying a half-built one produces a
 * runtime character with no HP - so filtering here means the list never offers
 * a choice the server would refuse.
 *
 * Entries are owner-scoped by the request itself. This module never widens that:
 * with no signed-in account it holds nothing, rather than falling back to some
 * unscoped read.
 */
import { useEffect, useState } from 'react';

import type { CharacterLibraryEntry } from '@dnd/protocol';

import { listCharacterLibraryEntries } from './character-library-api';
import { getFinalizedLibraryEntriesForRuntime } from './runtime-cockpit-helpers';

type UseRuntimeCharacterLibraryParams = {
  authLoading: boolean;
  /** Null while signed out, which is a reason to hold nothing. */
  ownerUserId: string | null;
  /** The library is a player-side concern; the GM assigns what arrives. */
  enabled: boolean;
  signInRequiredMessage: string;
};

export function useRuntimeCharacterLibrary(
  params: UseRuntimeCharacterLibraryParams,
) {
  const { authLoading, enabled, ownerUserId, signInRequiredMessage } = params;

  const [entries, setEntries] = useState<CharacterLibraryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState('');

  useEffect(() => {
    let canceled = false;

    if (authLoading || !enabled || !ownerUserId) {
      setEntries([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    void listCharacterLibraryEntries(ownerUserId)
      .then((result) => {
        if (canceled) {
          return;
        }

        if (result.ok) {
          setEntries(result.data);
          return;
        }

        setEntries([]);
        setError(result.error.message);
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [authLoading, enabled, ownerUserId]);

  const finalizedEntries = getFinalizedLibraryEntriesForRuntime(entries);

  // Keep the selection on an entry that still exists, so submitting cannot
  // reference one the account has since deleted or un-finalized.
  useEffect(() => {
    setSelectedEntryId((current) =>
      finalizedEntries.some((entry) => entry.id === current)
        ? current
        : (finalizedEntries[0]?.id ?? ''),
    );
    // `finalizedEntries` is derived fresh each render; the entry list it is
    // derived from is the real dependency.
  }, [entries]);

  async function refresh(): Promise<void> {
    if (!ownerUserId) {
      setEntries([]);
      setError(signInRequiredMessage);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await listCharacterLibraryEntries(ownerUserId);

    if (result.ok) {
      setEntries(result.data);
      setError(null);
    } else {
      setEntries([]);
      setError(result.error.message);
    }

    setLoading(false);
  }

  return {
    error,
    finalizedEntries,
    loading,
    refresh,
    selectedEntry:
      finalizedEntries.find((entry) => entry.id === selectedEntryId) ?? null,
    selectedEntryId,
    setSelectedEntryId,
  };
}

export type RuntimeLibraryModel = ReturnType<typeof useRuntimeCharacterLibrary>;
