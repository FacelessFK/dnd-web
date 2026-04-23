import type {
  ActiveEncounterRecordDatabase,
  StoredActiveEncounterRecordDocument,
} from '@dnd/db';
import type { Encounter, SessionId } from '@dnd/shared';

import {
  EncounterStoreError,
  type EncounterRepository,
} from './encounter-store.js';

export class DbBackedEncounterStore implements EncounterRepository {
  private readonly encountersBySession: Map<SessionId, Encounter>;

  private constructor(
    private readonly database: ActiveEncounterRecordDatabase,
    encountersBySession: Map<SessionId, Encounter>,
  ) {
    this.encountersBySession = encountersBySession;
  }

  static async fromDatabase(
    database: ActiveEncounterRecordDatabase,
  ): Promise<DbBackedEncounterStore> {
    const rows = await database.listActiveEncounterRecords();
    const encountersBySession = new Map<SessionId, Encounter>();

    for (const row of rows) {
      encountersBySession.set(row.sessionId, structuredClone(row.record));
    }

    return new DbBackedEncounterStore(database, encountersBySession);
  }

  async createEncounter(encounter: Encounter): Promise<Encounter> {
    const row = await this.database.insertActiveEncounterRecord({
      encounterId: encounter.id,
      sessionId: encounter.sessionId,
      sceneId: encounter.sceneId,
      record: this.toDocument(encounter),
    });

    if (!row) {
      throw new EncounterStoreError(
        'encounter_already_active',
        `Session "${encounter.sessionId}" already has an active encounter.`,
      );
    }

    const storedEncounter = this.fromDocument(row.record);

    this.encountersBySession.set(
      storedEncounter.sessionId,
      this.clone(storedEncounter),
    );

    return storedEncounter;
  }

  async endEncounter(encounter: Encounter): Promise<Encounter> {
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

    const deletedRow = await this.database.deleteActiveEncounterRecord({
      encounterId: encounter.id,
      sessionId: encounter.sessionId,
    });

    if (!deletedRow) {
      throw new EncounterStoreError(
        'no_active_encounter',
        `Session "${encounter.sessionId}" does not have an active encounter.`,
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

  async saveEncounter(encounter: Encounter): Promise<Encounter> {
    const row = await this.database.updateActiveEncounterRecord({
      encounterId: encounter.id,
      sessionId: encounter.sessionId,
      sceneId: encounter.sceneId,
      record: this.toDocument(encounter),
    });

    if (!row) {
      throw new EncounterStoreError(
        'no_active_encounter',
        `Session "${encounter.sessionId}" does not have an active encounter.`,
      );
    }

    const storedEncounter = this.fromDocument(row.record);

    this.encountersBySession.set(
      storedEncounter.sessionId,
      this.clone(storedEncounter),
    );

    return storedEncounter;
  }

  private toDocument(
    encounter: Encounter,
  ): StoredActiveEncounterRecordDocument {
    return this.clone(encounter);
  }

  private fromDocument(
    document: StoredActiveEncounterRecordDocument,
  ): Encounter {
    return this.clone(document);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
