import { randomUUID } from 'node:crypto';

import type { CharacterLibraryEntryDatabase } from '@dnd/db';
import type {
  CharacterLibraryCommand,
  CharacterLibraryEntry,
  CharacterLibraryEntryInput,
  CharacterLibraryEntryId,
  CharacterLibraryPortraitReference,
  RuntimeErrorCode,
} from '@dnd/protocol';

const MAX_PORTRAIT_BYTES = 1_000_000;
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
  listEntries(
    ownerParticipantId: string,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry[]>;
  updateEntry(
    entry: CharacterLibraryEntry,
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

  listEntries(ownerParticipantId: string): CharacterLibraryEntry[] {
    return [...this.entries.values()]
      .filter((entry) => entry.ownerParticipantId === ownerParticipantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((entry) => this.clone(entry));
  }

  updateEntry(entry: CharacterLibraryEntry): CharacterLibraryEntry {
    this.getEntry({
      entryId: entry.id,
      ownerParticipantId: entry.ownerParticipantId,
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
      ownerParticipantId: entry.ownerParticipantId,
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

  async listEntries(
    ownerParticipantId: string,
  ): Promise<CharacterLibraryEntry[]> {
    const rows =
      await this.database.listCharacterLibraryEntries(ownerParticipantId);

    return rows.map((row) => this.fromDocument(row.entry));
  }

  async updateEntry(
    entry: CharacterLibraryEntry,
  ): Promise<CharacterLibraryEntry> {
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
  ) {}

  createEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'create_character_library_entry' }
    >,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry> {
    this.assertOwnerActor(command);
    this.validateEntryInput(command.payload.entry);

    const now = this.now();
    const entry: CharacterLibraryEntry = {
      ...this.clone(command.payload.entry),
      createdAt: now,
      id: this.createEntryId(),
      ownerParticipantId: command.payload.ownerParticipantId,
      status: 'draft',
      updatedAt: now,
    };

    return this.repository.createEntry(entry);
  }

  updateEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'update_character_library_entry' }
    >,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry> {
    this.assertOwnerActor(command);
    this.validateEntryInput(command.payload.entry);

    return this.resolveRepositoryResult(
      this.repository.getEntry(command.payload),
      (existing) => {
        return this.repository.updateEntry({
          ...this.clone(command.payload.entry),
          createdAt: existing.createdAt,
          id: existing.id,
          ownerParticipantId: existing.ownerParticipantId,
          status: existing.status,
          updatedAt: this.now(),
        });
      },
    );
  }

  finalizeEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'finalize_character_library_entry' }
    >,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry> {
    this.assertOwnerActor(command);

    return this.resolveRepositoryResult(
      this.repository.getEntry(command.payload),
      (existing) => {
        if (existing.status === 'finalized') {
          throw new CharacterLibraryStoreError(
            'invalid_character_library_entry',
            `Character library entry "${existing.id}" is already finalized.`,
          );
        }

        this.validateEntryInput(existing);

        return this.repository.updateEntry({
          ...existing,
          builderStep: 'review',
          status: 'finalized',
          updatedAt: this.now(),
        });
      },
    );
  }

  getEntry(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'get_character_library_entry' }
    >,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry> {
    this.assertOwnerActor(command);

    return this.repository.getEntry(command.payload);
  }

  listEntries(
    command: Extract<
      CharacterLibraryCommand,
      { type: 'list_character_library_entries' }
    >,
  ): CharacterLibraryRepositoryResult<CharacterLibraryEntry[]> {
    this.assertOwnerActor(command);

    return this.repository.listEntries(command.payload.ownerParticipantId);
  }

  withRepository(
    repository: CharacterLibraryRepository,
  ): CharacterLibraryService {
    return new CharacterLibraryService(repository);
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
