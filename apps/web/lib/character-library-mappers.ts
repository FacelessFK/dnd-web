import type {
  CharacterLibraryEntry,
  CharacterLibraryEntryInput,
  CharacterLibraryPortraitReference,
} from '@dnd/protocol';

import {
  getCharacterBuilderAssetManifestEntries,
  getCharacterBuilderAssetPath,
  type CharacterBuilderAssetKey,
} from './character-builder-assets';
import type {
  CharacterBuilderDraft,
  CharacterBuilderLibraryEntry,
} from './character-builder-data';
import {
  createDefaultCharacterBuilderDraft,
  deriveCharacterBuilderSummary,
  normalizeCharacterBuilderDraft,
} from './character-builder-helpers';
import {
  deriveRuleDerivedPreview,
  getRuleSpeciesById,
} from './character-builder-rules-helpers';

export const defaultCharacterLibraryOwnerParticipantId = 'dev-player-001';

const knownAssetKeys = new Set(
  getCharacterBuilderAssetManifestEntries().map((entry) => entry.key),
);

function asKnownAssetKey(value: string): CharacterBuilderAssetKey | undefined {
  return knownAssetKeys.has(value as CharacterBuilderAssetKey)
    ? (value as CharacterBuilderAssetKey)
    : undefined;
}

export function getSpeciesFallbackAssetKey(
  speciesOrRace: string,
  rulesProfileId: string,
): CharacterBuilderAssetKey | undefined {
  return getRuleSpeciesById(speciesOrRace, rulesProfileId)?.assetKey;
}

export function getDraftPortraitReference(
  draft: CharacterBuilderDraft,
): CharacterLibraryPortraitReference | null {
  if (draft.portrait) {
    return draft.portrait;
  }

  const assetKey = getSpeciesFallbackAssetKey(
    draft.speciesOrRace,
    draft.rulesProfileId,
  );

  return assetKey ? { assetKey, kind: 'asset' } : null;
}

export function getPortraitImageSource(
  portrait: CharacterLibraryPortraitReference | null | undefined,
): string | null {
  if (!portrait) {
    return null;
  }

  if (portrait.kind === 'uploaded') {
    return portrait.dataUrl;
  }

  const assetKey = asKnownAssetKey(portrait.assetKey);

  return assetKey ? getCharacterBuilderAssetPath(assetKey) : null;
}

export function createUploadedPortraitReferenceFromDataUrl(
  dataUrl: string,
  options: {
    fileName?: string;
    uploadedAt?: string;
  } = {},
): CharacterLibraryPortraitReference | null {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      dataUrl.trim(),
    );

  if (!match) {
    return null;
  }

  const mimeType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp';
  const base64Payload = match[2] ?? '';
  const padding = base64Payload.endsWith('==')
    ? 2
    : base64Payload.endsWith('=')
      ? 1
      : 0;
  const sizeBytes = Math.max(
    1,
    Math.floor((base64Payload.length * 3) / 4) - padding,
  );

  return {
    dataUrl,
    fileName: options.fileName ?? null,
    kind: 'uploaded',
    mimeType,
    sizeBytes,
    uploadedAt: options.uploadedAt ?? new Date().toISOString(),
  };
}

export function getPortraitAssetKey(
  portrait: CharacterLibraryPortraitReference | null | undefined,
): CharacterBuilderAssetKey | undefined {
  return portrait?.kind === 'asset'
    ? asKnownAssetKey(portrait.assetKey)
    : undefined;
}

export function draftToCharacterLibraryEntryInput(
  draft: CharacterBuilderDraft,
): CharacterLibraryEntryInput {
  const normalizedDraft = normalizeCharacterBuilderDraft(draft);
  const preview = deriveRuleDerivedPreview(normalizedDraft);

  return {
    abilities: normalizedDraft.abilities,
    abilityScoreMethod: normalizedDraft.abilityScoreMethod,
    armorClass: preview.armorClass.value,
    background: normalizedDraft.background,
    builderSelections: normalizedDraft.builderSelections,
    builderStep: normalizedDraft.builderStep,
    className: normalizedDraft.className,
    concept: normalizedDraft.concept,
    hp: {
      current: Math.min(normalizedDraft.hp.current, preview.hitPoints.value),
      max: preview.hitPoints.value,
      temp: normalizedDraft.hp.temp,
    },
    level: normalizedDraft.level,
    name: normalizedDraft.name,
    notes: normalizedDraft.notes,
    portrait: getDraftPortraitReference(normalizedDraft),
    pronouns: normalizedDraft.pronouns,
    rulesProfileId: normalizedDraft.rulesProfileId,
    speciesOrRace: normalizedDraft.speciesOrRace,
    speed: preview.speed,
  };
}

export function characterLibraryEntryToDraft(
  entry: CharacterLibraryEntry,
): CharacterBuilderDraft {
  return createDefaultCharacterBuilderDraft({
    abilities: entry.abilities,
    abilityScoreMethod: entry.abilityScoreMethod,
    armorClass: entry.armorClass,
    background: entry.background,
    builderSelections: entry.builderSelections,
    builderStep: entry.builderStep,
    className: entry.className,
    concept: entry.concept,
    hp: entry.hp,
    id: entry.id,
    level: entry.level,
    name: entry.name,
    notes: entry.notes ?? '',
    ownerParticipantId: entry.ownerParticipantId,
    portrait: entry.portrait ?? null,
    pronouns: entry.pronouns ?? '',
    rulesProfileId: entry.rulesProfileId,
    speciesOrRace: entry.speciesOrRace,
    speed: entry.speed,
    status: entry.status === 'finalized' ? 'ready' : 'draft',
  });
}

export function characterLibraryEntryToCard(
  entry: CharacterLibraryEntry,
): CharacterBuilderLibraryEntry {
  const draft = characterLibraryEntryToDraft(entry);
  const summary = deriveCharacterBuilderSummary(draft);
  const portrait =
    entry.portrait ??
    getDraftPortraitReference({
      ...draft,
      portrait: null,
    });

  return {
    armorClass: summary.armorClass,
    className: entry.className,
    id: entry.id,
    level: entry.level,
    name: entry.name,
    ownerParticipantId: entry.ownerParticipantId,
    portrait,
    portraitAssetKey: getPortraitAssetKey(portrait),
    speciesOrRace: entry.speciesOrRace,
    status: entry.status === 'finalized' ? 'ready' : 'draft',
    summary:
      entry.concept ||
      entry.notes ||
      'هنوز خلاصه‌ای برای کاراکتر ثبت نشده است.',
  };
}
