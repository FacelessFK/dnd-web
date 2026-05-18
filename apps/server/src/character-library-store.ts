import { randomUUID } from 'node:crypto';

import type { CharacterLibraryEntryDatabase } from '@dnd/db';
import {
  uploadedPortraitSizeMaxBytes,
  type CharacterLibraryCommand,
  type CharacterLibraryEntry,
  type CharacterLibraryEntryInput,
  type CharacterLibraryEntryId,
  type CharacterLibraryPortraitReference,
  type RuntimeErrorCode,
} from '@dnd/protocol';

import {
  type CharacterPortraitStorage,
  validateStoredPortraitReference,
} from './character-portrait-storage.js';

const MAX_PORTRAIT_BYTES = uploadedPortraitSizeMaxBytes;
const ALLOWED_PORTRAIT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export class CharacterLibraryStoreError extends Error {
  constructor(
    readonly code: RuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterLibraryStoreError';
  }
}

export type CharacterLibraryRepositoryResult<T> = T | Promise<T>;

export interface CharacterLibraryRepository {
  createEntry(
    entry: CharacterLibraryEntry,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry>;
  getEntry(params: {
    entryId: CharacterLibraryEntryId;
    ownerParticipantId: string;
  }): CharacterLibraryRepositoryResult<CharacterLibraryEntry>;
  getEntryByUser(params: {
    entryId: CharacterLibraryEntryId;
    ownerUserId: string;
  }): CharacterLibraryRepositoryResult<CharacterLibraryEntry>;
  listEntries(
    ownerParticipantId: string,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry[]>;
  listEntriesByUser(
    ownerUserId: string,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry[]>;
  updateEntry(
    entry: CharacterLibraryEntry,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry>;
  updateEntryByUser(
    entry: CharacterLibraryEntry & { ownerUserId: string },
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry>;
}

export class InMemoryCharacterLibraryRepository implements CharacterLibraryRepository {
  private readonly entries = new Map<string, CharacterLibraryEntry>();

  createEntry(entry: CharacterLibraryEntry): CharacterLibraryEntry {
    if (this.entries.has(entry.id)) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        `Character library entry "${entry.id}" already exists.`,
      );
    }

    this.entries.set(entry.id, this.clone(entry));

    return this.clone(entry);
  }

  getEntry(params: {
    entryId: CharacterLibraryEntryId;
    ownerParticipantId: string;
  }): CharacterLibraryEntry {
    const entry = this.entries.get(params.entryId);

    if (!entry || entry.ownerParticipantId !== params.ownerParticipantId) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        `Character library entry "${params.entryId}" does not exist for owner "${params.ownerParticipantId}".`,
      );
    }

    return this.clone(entry);
  }

  getEntryByUser(params: {
    entryId: CharacterLibraryEntryId;
    ownerUserId: string;
  }): CharacterLibraryEntry {
    const entry = this.entries.get(params.entryId);

    if (!entry || entry.ownerUserId !== params.ownerUserId) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        `Character library entry "${params.entryId}" does not exist for authenticated user.`,
      );
    }

    return this.clone(entry);
  }

  listEntries(ownerParticipantId: string): CharacterLibraryEntry[] {
    return [...this.entries.values()]
      .filter((entry) => entry.ownerParticipantId === ownerParticipantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((entry) => this.clone(entry));
  }

  listEntriesByUser(ownerUserId: string): CharacterLibraryEntry[] {
    return [...this.entries.values()]
      .filter((entry) => entry.ownerUserId === ownerUserId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((entry) => this.clone(entry));
  }

  updateEntry(entry: CharacterLibraryEntry): CharacterLibraryEntry {
    if (!entry.ownerParticipantId) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        `Character library entry "${entry.id}" is missing legacy ownerParticipantId.`,
      );
    }

    this.getEntry({
      entryId: entry.id,
      ownerParticipantId: entry.ownerParticipantId,
    });
    this.entries.set(entry.id, this.clone(entry));

    return this.clone(entry);
  }

  updateEntryByUser(
    entry: CharacterLibraryEntry & { ownerUserId: string },
  ): CharacterLibraryEntry {
    this.getEntryByUser({
      entryId: entry.id,
      ownerUserId: entry.ownerUserId,
    });
    this.entries.set(entry.id, this.clone(entry));

    return this.clone(entry);
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

export class DbBackedCharacterLibraryRepository implements CharacterLibraryRepository {
  constructor(private readonly database: CharacterLibraryEntryDatabase) {}

  async createEntry(
    entry: CharacterLibraryEntry,
  ): Promise<CharacterLibraryEntry> {
    const row = await this.database.insertCharacterLibraryEntry({
      entry: this.clone(entry) as Record<string, unknown>,
      entryId: entry.id,
      ownerParticipantId: entry.ownerParticipantId ?? entry.ownerUserId ?? '',
      ownerUserId: entry.ownerUserId ?? null,
    });

    if (!row) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        `Character library entry "${entry.id}" already exists.`,
      );
    }

    return this.fromDocument(row.entry);
  }

  async getEntry(params: {
    entryId: CharacterLibraryEntryId;
    ownerParticipantId: string;
  }): Promise<CharacterLibraryEntry> {
    const row = await this.database.getCharacterLibraryEntry(params);

    if (!row) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        `Character library entry "${params.entryId}" does not exist for owner "${params.ownerParticipantId}".`,
      );
    }

    return this.fromDocument(row.entry);
  }

  async getEntryByUser(params: {
    entryId: CharacterLibraryEntryId;
    ownerUserId: string;
  }): Promise<CharacterLibraryEntry> {
    const row = await this.database.getCharacterLibraryEntryByUser(params);

    if (!row) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        `Character library entry "${params.entryId}" does not exist for authenticated user.`,
      );
    }

    return this.fromDocument(row.entry);
  }

  async listEntries(
    ownerParticipantId: string,
  ): Promise<CharacterLibraryEntry[]> {
    const rows =
      await this.database.listCharacterLibraryEntries(ownerParticipantId);

    return rows.map((row) => this.fromDocument(row.entry));
  }

  async listEntriesByUser(
    ownerUserId: string,
  ): Promise<CharacterLibraryEntry[]> {
    const rows =
      await this.database.listCharacterLibraryEntriesByUser(ownerUserId);

    return rows.map((row) => this.fromDocument(row.entry));
  }

  async updateEntry(
    entry: CharacterLibraryEntry,
  ): Promise<CharacterLibraryEntry> {
    if (!entry.ownerParticipantId) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        `Character library entry "${entry.id}" is missing legacy ownerParticipantId.`,
      );
    }

    const row = await this.database.updateCharacterLibraryEntry({
      entry: this.clone(entry) as Record<string, unknown>,
      entryId: entry.id,
      ownerParticipantId: entry.ownerParticipantId,
    });

    if (!row) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        `Character library entry "${entry.id}" does not exist for owner "${entry.ownerParticipantId}".`,
      );
    }

    return this.fromDocument(row.entry);
  }

  async updateEntryByUser(
    entry: CharacterLibraryEntry & { ownerUserId: string },
  ): Promise<CharacterLibraryEntry> {
    const row = await this.database.updateCharacterLibraryEntryByUser({
      entry: this.clone(entry) as Record<string, unknown>,
      entryId: entry.id,
      ownerParticipantId: entry.ownerParticipantId ?? entry.ownerUserId,
      ownerUserId: entry.ownerUserId,
    });

    if (!row) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        `Character library entry "${entry.id}" does not exist for authenticated user.`,
      );
    }

    return this.fromDocument(row.entry);
  }

  private fromDocument(
    document: Record<string, unknown>,
  ): CharacterLibraryEntry {
    return this.clone(document) as CharacterLibraryEntry;
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

export class CharacterLibraryService {
  constructor(
    private readonly repository: CharacterLibraryRepository = new InMemoryCharacterLibraryRepository(),
    private readonly portraitStorage?: CharacterPortraitStorage,
  ) {}

  async createEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'create_character_library_entry' }
    >,
    ownerUserId?: string,
  ): Promise<CharacterLibraryEntry> {
    this.assertOwnerActor(command);
    this.validateEntryInput(command.payload.entry);

    const now = this.now();
    const entry = await this.materializePortrait(
      {
        ...this.clone(command.payload.entry),
        createdAt: now,
        id: this.createEntryId(),
        ownerParticipantId: command.payload.ownerParticipantId,
        ownerUserId,
        status: 'draft',
        updatedAt: now,
      },
      ownerUserId,
    );

    return this.repository.createEntry(entry);
  }

  async updateEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'update_character_library_entry' }
    >,
    ownerUserId?: string,
  ): Promise<CharacterLibraryEntry> {
    this.assertOwnerActor(command);
    this.validateEntryInput(command.payload.entry);
    const existing = ownerUserId
      ? await this.repository.getEntryByUser({
          entryId: command.payload.entryId,
          ownerUserId,
        })
      : await this.repository.getEntry(command.payload);
    const updatedEntry = await this.materializePortrait(
      {
        ...this.clone(command.payload.entry),
        createdAt: existing.createdAt,
        id: existing.id,
        ownerParticipantId: existing.ownerParticipantId ?? ownerUserId,
        ownerUserId: existing.ownerUserId,
        status: existing.status,
        updatedAt: this.now(),
      },
      ownerUserId,
    );

    return ownerUserId
      ? this.repository.updateEntryByUser({
          ...updatedEntry,
          ownerUserId,
        })
      : this.repository.updateEntry(updatedEntry);
  }

  async finalizeEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'finalize_character_library_entry' }
    >,
    ownerUserId?: string,
  ): Promise<CharacterLibraryEntry> {
    this.assertOwnerActor(command);
    const existing = ownerUserId
      ? await this.repository.getEntryByUser({
          entryId: command.payload.entryId,
          ownerUserId,
        })
      : await this.repository.getEntry(command.payload);

    if (existing.status === 'finalized') {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        `Character library entry "${existing.id}" is already finalized.`,
      );
    }

    this.validateEntryInput(existing);

    const finalizedEntry = await this.materializePortrait(
      {
        ...existing,
        builderStep: 'review',
        status: 'finalized',
        updatedAt: this.now(),
      },
      ownerUserId,
    );

    return ownerUserId
      ? this.repository.updateEntryByUser({
          ...finalizedEntry,
          ownerUserId,
        })
      : this.repository.updateEntry(finalizedEntry);
  }

  async getEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'get_character_library_entry' }
    >,
    ownerUserId?: string,
  ): Promise<CharacterLibraryEntry> {
    this.assertOwnerActor(command);

    const entry = ownerUserId
      ? await this.repository.getEntryByUser({
          entryId: command.payload.entryId,
          ownerUserId,
        })
      : await this.repository.getEntry(command.payload);

    return this.materializeAndPersistExistingPortrait(entry, ownerUserId);
  }

  async listEntries(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'list_character_library_entries' }
    >,
    ownerUserId?: string,
  ): Promise<CharacterLibraryEntry[]> {
    this.assertOwnerActor(command);

    const entries = ownerUserId
      ? await this.repository.listEntriesByUser(ownerUserId)
      : await this.repository.listEntries(command.payload.ownerParticipantId);

    return Promise.all(
      entries.map((entry) =>
        this.materializeAndPersistExistingPortrait(entry, ownerUserId),
      ),
    );
  }

  withRepository(
    repository: CharacterLibraryRepository,
  ): CharacterLibraryService {
    return new CharacterLibraryService(repository, this.portraitStorage);
  }

  async readPortrait(params: {
    entryId: CharacterLibraryEntryId;
    fileName: string;
    ownerUserId: string;
  }) {
    if (!this.portraitStorage) {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        'Character portrait storage is not configured.',
      );
    }

    await this.repository.getEntryByUser({
      entryId: params.entryId,
      ownerUserId: params.ownerUserId,
    });

    try {
      return await this.portraitStorage.read(params);
    } catch {
      throw new CharacterLibraryStoreError(
        'character_library_entry_not_found',
        'Character portrait file was not found.',
      );
    }
  }

  private async materializeAndPersistExistingPortrait(
    entry: CharacterLibraryEntry,
    ownerUserId?: string,
  ): Promise<CharacterLibraryEntry> {
    const materialized = await this.materializePortrait(entry, ownerUserId);

    if (materialized === entry || !materialized.portrait?.kind) {
      return entry;
    }

    if (ownerUserId) {
      return this.repository.updateEntryByUser({
        ...materialized,
        ownerUserId,
      });
    }

    return materialized.ownerParticipantId
      ? this.repository.updateEntry(materialized)
      : materialized;
  }

  private async materializePortrait(
    entry: CharacterLibraryEntry,
    ownerUserId?: string,
  ): Promise<CharacterLibraryEntry> {
    const portrait = entry.portrait ?? null;

    if (!portrait || portrait.kind === 'asset') {
      return entry;
    }

    if (!this.portraitStorage || !ownerUserId) {
      return entry;
    }

    try {
      if (!portrait.dataUrl) {
        validateStoredPortraitReference({
          entryId: entry.id,
          ownerUserId,
          portrait,
        });

        return entry;
      }

      return {
        ...entry,
        portrait: await this.portraitStorage.store({
          entryId: entry.id,
          ownerUserId,
          portrait,
        }),
      };
    } catch (error) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        error instanceof Error
          ? error.message
          : 'Unable to store character portrait.',
      );
    }
  }

  private validateEntryInput(entry: CharacterLibraryEntryInput): void {
    if (!entry.name.trim() || entry.level < 1 || entry.level > 20) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        'Character library entry is missing required identity or level fields.',
      );
    }

    this.validatePortrait(entry.portrait ?? null);
  }

  private validatePortrait(
    portrait: CharacterLibraryPortraitReference | null,
  ): void {
    if (!portrait || portrait.kind === 'asset') {
      return;
    }

    if (!ALLOWED_PORTRAIT_TYPES.has(portrait.mimeType)) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        `Portrait type "${portrait.mimeType}" is not supported.`,
      );
    }

    if (portrait.sizeBytes > MAX_PORTRAIT_BYTES) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        'Portrait upload is larger than the 1 MB MVP limit.',
      );
    }

    if (!portrait.dataUrl) {
      return;
    }

    const expectedPrefix = `data:${portrait.mimeType};base64,`;

    if (!portrait.dataUrl.startsWith(expectedPrefix)) {
      throw new CharacterLibraryStoreError(
        'invalid_character_library_entry',
        'Portrait upload must be a base64 data URL matching its MIME type.',
      );
    }
  }

  private assertOwnerActor(command: CharacterLibraryCommand): void {
    if (command.actor.participantId === command.payload.ownerParticipantId) {
      return;
    }

    throw new CharacterLibraryStoreError(
      'invalid_participant_session_association',
      `Actor "${command.actor.participantId}" cannot manage owner "${command.payload.ownerParticipantId}" character library entries.`,
    );
  }

  private resolveRepositoryResult<TValue, TResult>(
    value: CharacterLibraryRepositoryResult<TValue>,
    next: (value: TValue) => CharacterLibraryRepositoryResult<TResult>,
  ): CharacterLibraryRepositoryResult<TResult> {
    if (value instanceof Promise) {
      return value.then(next);
    }

    return next(value);
  }

  private createEntryId(): CharacterLibraryEntryId {
    return `charlib_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}
