import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { uploadedPortraitSizeMaxBytes } from '@dnd/protocol';
import type { CharacterLibraryPortraitReference } from '@dnd/protocol';

const allowedMimeExtensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

type UploadedPortrait = Extract<
  CharacterLibraryPortraitReference,
  { kind: 'uploaded' }
>;

export type StoredCharacterPortrait = {
  data: Buffer;
  mimeType: UploadedPortrait['mimeType'];
};

export interface CharacterPortraitStorage {
  read(params: {
    entryId: string;
    fileName: string;
    ownerUserId: string;
  }): Promise<StoredCharacterPortrait>;
  store(params: {
    entryId: string;
    ownerUserId: string;
    portrait: UploadedPortrait;
  }): Promise<UploadedPortrait>;
}

export class FileSystemCharacterPortraitStorage implements CharacterPortraitStorage {
  constructor(
    private readonly rootDirectory: string,
    private readonly routeBasePath = '/api/character-library/portraits',
  ) {}

  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
  ): FileSystemCharacterPortraitStorage {
    return new FileSystemCharacterPortraitStorage(
      env.CHARACTER_PORTRAIT_STORAGE_DIR?.trim() ||
        path.resolve(process.cwd(), 'data/character-portraits'),
    );
  }

  async read(params: {
    entryId: string;
    fileName: string;
    ownerUserId: string;
  }): Promise<StoredCharacterPortrait> {
    assertSafePathSegment(params.ownerUserId, 'owner user ID');
    assertSafePathSegment(params.entryId, 'entry ID');
    assertSafeFileName(params.fileName);

    const mimeType = getMimeTypeFromFileName(params.fileName);
    const data = await readFile(
      path.join(
        this.rootDirectory,
        params.ownerUserId,
        params.entryId,
        params.fileName,
      ),
    );

    return { data, mimeType };
  }

  async store(params: {
    entryId: string;
    ownerUserId: string;
    portrait: UploadedPortrait;
  }): Promise<UploadedPortrait> {
    const dataUrl = params.portrait.dataUrl;

    if (!dataUrl) {
      return params.portrait;
    }

    assertSafePathSegment(params.ownerUserId, 'owner user ID');
    assertSafePathSegment(params.entryId, 'entry ID');

    const data = decodePortraitDataUrl(dataUrl, params.portrait.mimeType);

    if (data.byteLength > uploadedPortraitSizeMaxBytes) {
      throw new Error('Portrait upload is larger than the 1 MB storage limit.');
    }

    const extension = allowedMimeExtensions[params.portrait.mimeType];
    const fileName = `${randomUUID()}.${extension}`;
    const directory = path.join(
      this.rootDirectory,
      params.ownerUserId,
      params.entryId,
    );

    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, fileName), data, { flag: 'wx' });

    return {
      fileName,
      kind: 'uploaded',
      mimeType: params.portrait.mimeType,
      sizeBytes: data.byteLength,
      storageKey: `${params.ownerUserId}/${params.entryId}/${fileName}`,
      uploadedAt: params.portrait.uploadedAt,
      url: `${this.routeBasePath}/${encodeURIComponent(
        params.ownerUserId,
      )}/${encodeURIComponent(params.entryId)}/${encodeURIComponent(fileName)}`,
    };
  }
}

export function validateStoredPortraitReference(params: {
  entryId: string;
  ownerUserId: string;
  portrait: UploadedPortrait;
}): void {
  if (!params.portrait.url) {
    return;
  }

  const expectedPrefix = `/api/character-library/portraits/${encodeURIComponent(
    params.ownerUserId,
  )}/${encodeURIComponent(params.entryId)}/`;

  if (!params.portrait.url.startsWith(expectedPrefix)) {
    throw new Error('Stored portrait URL does not belong to this character.');
  }
}

function decodePortraitDataUrl(
  dataUrl: string,
  mimeType: UploadedPortrait['mimeType'],
): Buffer {
  const expectedPrefix = `data:${mimeType};base64,`;

  if (!dataUrl.startsWith(expectedPrefix)) {
    throw new Error('Portrait upload must match its MIME type.');
  }

  const payload = dataUrl.slice(expectedPrefix.length);

  return Buffer.from(payload, 'base64');
}

function getMimeTypeFromFileName(
  fileName: string,
): UploadedPortrait['mimeType'] {
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (fileName.endsWith('.png')) {
    return 'image/png';
  }

  if (fileName.endsWith('.webp')) {
    return 'image/webp';
  }

  throw new Error('Unsupported portrait file type.');
}

function assertSafePathSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9_-]+[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function assertSafeFileName(value: string): void {
  if (!/^[a-f0-9-]+\.(?:jpg|png|webp)$/.test(value)) {
    throw new Error('Invalid portrait file name.');
  }
}
