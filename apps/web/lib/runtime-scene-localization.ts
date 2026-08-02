/**
 * Localized names for scene entities, transitions and their presets.
 *
 * Split from `runtime-localization` because these all describe one subject -
 * what is on the map - and the GM's map tools are the only caller. The active
 * scene guidance lives here too: it is the sentence that tells either role why
 * the board is empty.
 */
import type { Scene } from '@dnd/protocol';

import type {
  RuntimeEventSummary,
  RuntimeMode,
  SceneEntityPresetId,
  SceneTransitionPresetId,
  sceneEntityTypeOptions,
  sceneTransitionKindOptions,
} from './runtime-cockpit-helpers';
import type { RuntimeTranslator } from './runtime-localization';

export function getLocalizedSceneEntityTypeLabel(
  type: (typeof sceneEntityTypeOptions)[number],
  t: RuntimeTranslator,
): string {
  switch (type) {
    case 'monster':
      return t('runtime.sceneBuilder.entityType.monster');
    case 'object':
      return t('runtime.sceneBuilder.entityType.object');
    case 'player_spawn':
      return t('runtime.sceneBuilder.entityType.playerSpawn');
    case 'terrain':
      return t('runtime.sceneBuilder.entityType.terrain');
  }
}

export function getLocalizedSceneTransitionKindLabel(
  kind: (typeof sceneTransitionKindOptions)[number],
  t: RuntimeTranslator,
): string {
  switch (kind) {
    case 'door':
      return t('runtime.sceneBuilder.transitions.kind.door');
    case 'gate':
      return t('runtime.sceneBuilder.transitions.kind.gate');
    case 'other':
      return t('runtime.sceneBuilder.transitions.kind.other');
    case 'portal':
      return t('runtime.sceneBuilder.transitions.kind.portal');
    case 'stairs':
      return t('runtime.sceneBuilder.transitions.kind.stairs');
  }
}

export function getLocalizedSceneEntityPresetLabel(
  presetId: SceneEntityPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'cover':
      return t('runtime.sceneBuilder.entityPreset.cover.label');
    case 'hidden_prop':
      return t('runtime.sceneBuilder.entityPreset.hiddenProp.label');
    case 'marker':
      return t('runtime.sceneBuilder.entityPreset.marker.label');
    case 'monster_spawn':
      return t('runtime.sceneBuilder.entityPreset.monsterSpawn.label');
    case 'player_spawn':
      return t('runtime.sceneBuilder.entityPreset.playerSpawn.label');
    case 'wall':
      return t('runtime.sceneBuilder.entityPreset.wall.label');
  }
}

export function getLocalizedSceneEntityPresetDescription(
  presetId: SceneEntityPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'cover':
      return t('runtime.sceneBuilder.entityPreset.cover.description');
    case 'hidden_prop':
      return t('runtime.sceneBuilder.entityPreset.hiddenProp.description');
    case 'marker':
      return t('runtime.sceneBuilder.entityPreset.marker.description');
    case 'monster_spawn':
      return t('runtime.sceneBuilder.entityPreset.monsterSpawn.description');
    case 'player_spawn':
      return t('runtime.sceneBuilder.entityPreset.playerSpawn.description');
    case 'wall':
      return t('runtime.sceneBuilder.entityPreset.wall.description');
  }
}

export function getLocalizedSceneTransitionPresetLabel(
  presetId: SceneTransitionPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'door':
      return t('runtime.sceneBuilder.transitions.preset.door.label');
    case 'gate':
      return t('runtime.sceneBuilder.transitions.preset.gate.label');
    case 'other':
      return t('runtime.sceneBuilder.transitions.preset.other.label');
    case 'portal':
      return t('runtime.sceneBuilder.transitions.preset.portal.label');
    case 'stairs':
      return t('runtime.sceneBuilder.transitions.preset.stairs.label');
  }
}

export function getLocalizedSceneTransitionPresetDescription(
  presetId: SceneTransitionPresetId,
  t: RuntimeTranslator,
): string {
  switch (presetId) {
    case 'door':
      return t('runtime.sceneBuilder.transitions.preset.door.description');
    case 'gate':
      return t('runtime.sceneBuilder.transitions.preset.gate.description');
    case 'other':
      return t('runtime.sceneBuilder.transitions.preset.other.description');
    case 'portal':
      return t('runtime.sceneBuilder.transitions.preset.portal.description');
    case 'stairs':
      return t('runtime.sceneBuilder.transitions.preset.stairs.description');
  }
}

export function getLocalizedSceneEntityLabel(
  entity: Scene['entities'][number],
  t: RuntimeTranslator,
): string {
  const flags = [
    entity.transition
      ? t('runtime.sceneBuilder.entityFlag.transitionTo', {
          kind: getLocalizedSceneTransitionKindLabel(entity.transition.kind, t),
          target:
            entity.transition.targetLabel ??
            entity.transition.targetSceneId ??
            'unknown',
        })
      : null,
    entity.blocksMovement
      ? t('runtime.sceneBuilder.entityFlag.blocksMovement')
      : null,
    entity.blocksVision
      ? t('runtime.sceneBuilder.entityFlag.blocksVision')
      : null,
    entity.hidden ? t('runtime.sceneBuilder.entityFlag.hidden') : null,
  ].filter(Boolean);

  return `${entity.name} (${getLocalizedSceneEntityTypeLabel(entity.type, t)}${
    flags.length ? `, ${flags.join(', ')}` : ''
  })`;
}

export function getLocalizedSceneEntityPositionLabel(
  entity: Scene['entities'][number],
  t: RuntimeTranslator,
): string {
  return t('runtime.sceneBuilder.entityAt', {
    cell: `${entity.position.x},${entity.position.y}`,
    label: getLocalizedSceneEntityLabel(entity, t),
  });
}

export function getLocalizedActiveSceneGuidance({
  activeSceneId,
  mode,
  scene,
  t,
}: {
  activeSceneId: string | null;
  mode: RuntimeMode;
  scene: Scene | null;
  t: RuntimeTranslator;
}): RuntimeEventSummary {
  if (scene) {
    return {
      detail: t('runtime.activeScene.loadedDetail', {
        entityCount: String(scene.entities.length),
        height: String(scene.grid.height),
        sceneName: scene.name,
        width: String(scene.grid.width),
      }),
      title: t('runtime.activeScene.loadedTitle'),
      tone: 'success',
    };
  }

  if (activeSceneId) {
    return {
      detail: t('runtime.activeScene.idKnownDetail'),
      title: t('runtime.activeScene.idKnownTitle'),
      tone: 'warning',
    };
  }

  return mode === 'dm'
    ? {
        detail: t('runtime.activeScene.buildDetail'),
        title: t('runtime.activeScene.buildTitle'),
        tone: 'warning',
      }
    : {
        detail: t('runtime.activeScene.noneDetail'),
        title: t('runtime.activeScene.noneTitle'),
        tone: 'warning',
      };
}
