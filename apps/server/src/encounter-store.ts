import type { SessionErrorCode } from '@dnd/protocol';
import type { Encounter, SessionId } from '@dnd/shared';

export type EncounterRepositoryResult<T> = T | Promise<T>;

export interface EncounterRepository {
  createEncounter(encounter: Encounter): EncounterRepositoryResult<Encounter>;
  endEncounter(encounter: Encounter): EncounterRepositoryResult<Encounter>;
  findEncounterBySession(sessionId: SessionId): Encounter | null;
  getEncounterBySession(sessionId: SessionId): Encounter;
  saveEncounter(encounter: Encounter): EncounterRepositoryResult<Encounter>;
}

export class EncounterStoreError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EncounterStoreError';
  }
}

export class InMemoryEncounterStore implements EncounterRepository {
  private readonly encountersBySession = new Map<SessionId, Encounter>();

  createEncounter(encounter: Encounter): Encounter {
    if (this.encountersBySession.has(encounter.sessionId)) {
      throw new EncounterStoreError(
        'encounter_already_active',
        `Session "${encounter.sessionId}" already has an active encounter.`,
      );
    }

    this.encountersBySession.set(encounter.sessionId, this.clone(encounter));

    return this.clone(encounter);
  }

  endEncounter(encounter: Encounter): Encounter {
    const activeEncounter = this.encountersBySession.get(encounter.sessionId);

    if (!activeEncounter) {
      throw new EncounterStoreError(
        'no_active_encounter',
        `Session "${encounter.sessionId}" does not have an active encounter.`,
      );
    }

    if (activeEncounter.id !== encounter.id) {
      throw new EncounterStoreError(
        'invalid_encounter_session_association',
        `Encounter "${encounter.id}" is not the active encounter for session "${encounter.sessionId}".`,
      );
    }

    this.encountersBySession.delete(encounter.sessionId);

    return this.clone(encounter);
  }

  findEncounterBySession(sessionId: SessionId): Encounter | null {
    const encounter = this.encountersBySession.get(sessionId);

    return encounter ? this.clone(encounter) : null;
  }

  getEncounterBySession(sessionId: SessionId): Encounter {
    const encounter = this.findEncounterBySession(sessionId);

    if (encounter) {
      return encounter;
    }

    throw new EncounterStoreError(
      'no_active_encounter',
      `Session "${sessionId}" does not have an active encounter.`,
    );
  }

  saveEncounter(encounter: Encounter): Encounter {
    if (!this.encountersBySession.has(encounter.sessionId)) {
      throw new EncounterStoreError(
        'no_active_encounter',
        `Session "${encounter.sessionId}" does not have an active encounter.`,
      );
    }

    this.encountersBySession.set(encounter.sessionId, this.clone(encounter));

    return this.clone(encounter);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
