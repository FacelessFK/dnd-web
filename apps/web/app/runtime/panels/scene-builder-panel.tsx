'use client';

import type { Scene } from '@dnd/protocol';

import {
  sceneEntityTypeOptions,
  type Cell,
  type RuntimeEventSummary,
  type SceneDraftForm,
  type SceneEntityDraftForm,
  type SceneEntityPreset,
  type SceneEntityPresetId,
} from '../../../lib/runtime-cockpit-helpers';
import {
  getLocalizedSceneEntityPositionLabel,
  getLocalizedSceneEntityPresetDescription,
  getLocalizedSceneEntityPresetLabel,
  getLocalizedSceneEntityTypeLabel,
} from '../../../lib/runtime-scene-localization';
import {
  ActionButton,
  EmptyState,
  Notice,
  Panel,
  StatusRow,
} from '../hud/hud-primitives';
import { CheckboxField, LabeledInput, SelectField } from '../hud/hud-fields';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import type { RuntimeSceneEntity } from '../../../lib/runtime-scene-view';

export function SceneBuilderPanel({
  activateDisabledReason,
  activationSceneId,
  activeSceneGuidance,
  createDisabledReason,
  deleteEntityDisabledReason,
  entityDraft,
  entityDraftErrors,
  entityEditDraft,
  entityEditDraftErrors,
  entityPresets,
  passiveEntities,
  onActivateScene,
  onActivationSceneIdChange,
  onCreateScene,
  onDeleteEntity,
  onEditEntityFieldChange,
  onEditEntityFlagChange,
  onEntityFieldChange,
  onEntityFlagChange,
  onEntityPresetSelect,
  onPlaceEntity,
  onRepositionEntity,
  onSceneFieldChange,
  onSelectEntity,
  onUpdateEntity,
  placeEntityDisabledReason,
  repositionEntityDisabledReason,
  scene,
  sceneDraft,
  sceneDraftErrors,
  selectedCell,
  selectedEntity,
  selectedEntityId,
  t,
  updateEntityDisabledReason,
}: {
  activateDisabledReason: string | null;
  activationSceneId: string;
  activeSceneGuidance: RuntimeEventSummary;
  createDisabledReason: string | null;
  deleteEntityDisabledReason: string | null;
  entityDraft: SceneEntityDraftForm;
  entityDraftErrors: string[];
  entityEditDraft: SceneEntityDraftForm;
  entityEditDraftErrors: string[];
  entityPresets: readonly SceneEntityPreset[];
  passiveEntities: RuntimeSceneEntity[];
  onActivateScene: () => void | Promise<void>;
  onActivationSceneIdChange: (value: string) => void;
  onCreateScene: () => void | Promise<void>;
  onDeleteEntity: () => void | Promise<void>;
  onEditEntityFieldChange: (
    field: 'footprintHeight' | 'footprintWidth' | 'name' | 'type',
    value: string,
  ) => void;
  onEditEntityFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onEntityFieldChange: (
    field: 'footprintHeight' | 'footprintWidth' | 'name' | 'type',
    value: string,
  ) => void;
  onEntityFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onEntityPresetSelect: (presetId: SceneEntityPresetId) => void;
  onPlaceEntity: () => void | Promise<void>;
  onRepositionEntity: () => void | Promise<void>;
  onSceneFieldChange: (field: keyof SceneDraftForm, value: string) => void;
  onSelectEntity: (entityId: string) => void;
  onUpdateEntity: () => void | Promise<void>;
  placeEntityDisabledReason: string | null;
  repositionEntityDisabledReason: string | null;
  /**
   * The authoritative scene. This is a GM authoring surface, so it is handed
   * the map as stored, never a per-viewer projection.
   */
  scene: Scene | null;
  sceneDraft: SceneDraftForm;
  sceneDraftErrors: string[];
  selectedCell: Cell;
  selectedEntity?: RuntimeSceneEntity;
  selectedEntityId: string;
  t: RuntimeTranslator;
  updateEntityDisabledReason: string | null;
}) {
  return (
    <Panel
      description={t('runtime.sceneBuilder.description')}
      eyebrow={t('runtime.overrides.eyebrow')}
      title={t('runtime.sceneBuilder.title')}
      tone="dm"
    >
      <div className="grid gap-4">
        <Notice
          title={activeSceneGuidance.title}
          tone={activeSceneGuidance.tone}
        >
          {activeSceneGuidance.detail}
        </Notice>

        <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">
            {t('runtime.sceneBuilder.sceneDraft')}
          </p>
          {sceneDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {sceneDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <LabeledInput
            label={t('runtime.sceneBuilder.field.sceneName')}
            onChange={(value) => onSceneFieldChange('name', value)}
            value={sceneDraft.name}
          />
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.width')}
              onChange={(value) => onSceneFieldChange('width', value)}
              value={sceneDraft.width}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.height')}
              onChange={(value) => onSceneFieldChange('height', value)}
              value={sceneDraft.height}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.cellFeet')}
              onChange={(value) => onSceneFieldChange('cellSizeFeet', value)}
              value={sceneDraft.cellSizeFeet}
            />
          </div>
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.action.createScene')}
            onClick={onCreateScene}
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-500/15 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">
            {t('runtime.sceneBuilder.activateScene')}
          </p>
          <LabeledInput
            label={t('runtime.sceneBuilder.field.sceneId')}
            onChange={onActivationSceneIdChange}
            placeholder={scene?.id ?? 'scene_...'}
            value={activationSceneId}
          />
          <ActionButton
            disabled={Boolean(activateDisabledReason)}
            disabledReason={activateDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.action.activateScene')}
            onClick={onActivateScene}
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-orange-300/20 bg-orange-950/15 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.placeEntity')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.placeEntityDetail', {
                cell: `${selectedCell.x},${selectedCell.y}`,
              })}
            </p>
          </div>
          {entityDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {entityDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300/70">
              {t('runtime.sceneBuilder.entityPalette')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {entityPresets.map((preset) => (
                <button
                  className="min-h-16 rounded-xl border border-amber-300/15 bg-[#241a12] px-3 py-2 text-left transition hover:border-amber-200/45 hover:bg-[#322318] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                  key={preset.id}
                  onClick={() => onEntityPresetSelect(preset.id)}
                  title={getLocalizedSceneEntityPresetDescription(preset.id, t)}
                  type="button"
                >
                  <span className="block text-sm font-bold text-amber-50">
                    {getLocalizedSceneEntityPresetLabel(preset.id, t)}
                  </span>
                  <span className="mt-1 block text-xs capitalize text-amber-100/55">
                    {getLocalizedSceneEntityTypeLabel(preset.draft.type, t)} ·{' '}
                    {preset.draft.footprintWidth}x{preset.draft.footprintHeight}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <SelectField
            label={t('runtime.sceneBuilder.field.entityType')}
            onChange={(value) => onEntityFieldChange('type', value)}
            options={sceneEntityTypeOptions.map((entityType) => ({
              label: getLocalizedSceneEntityTypeLabel(entityType, t),
              value: entityType,
            }))}
            value={entityDraft.type}
          />
          <LabeledInput
            label={t('runtime.sceneBuilder.field.name')}
            onChange={(value) => onEntityFieldChange('name', value)}
            testId="scene-entity-name"
            value={entityDraft.name}
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintWidth')}
              onChange={(value) => onEntityFieldChange('footprintWidth', value)}
              value={entityDraft.footprintWidth}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintHeight')}
              onChange={(value) =>
                onEntityFieldChange('footprintHeight', value)
              }
              value={entityDraft.footprintHeight}
            />
          </div>
          <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
            <CheckboxField
              checked={entityDraft.blocksMovement}
              label={t('runtime.sceneBuilder.flag.blocksMovement')}
              onChange={(checked) =>
                onEntityFlagChange('blocksMovement', checked)
              }
            />
            <CheckboxField
              checked={entityDraft.blocksVision}
              label={t('runtime.sceneBuilder.flag.blocksVision')}
              onChange={(checked) =>
                onEntityFlagChange('blocksVision', checked)
              }
            />
            <CheckboxField
              checked={entityDraft.hidden}
              label={t('runtime.sceneBuilder.flag.hiddenMap')}
              onChange={(checked) => onEntityFlagChange('hidden', checked)}
            />
          </div>
          <ActionButton
            disabled={Boolean(placeEntityDisabledReason)}
            disabledReason={placeEntityDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.action.placeEntity')}
            onClick={onPlaceEntity}
            testId="scene-entity-place"
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-300/20 bg-black/25 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.editEntity')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.editEntityDetail')}
            </p>
          </div>
          {passiveEntities.length ? (
            <SelectField
              label={t('runtime.sceneBuilder.field.passiveEntity')}
              onChange={onSelectEntity}
              options={passiveEntities.map((entity) => ({
                label: getLocalizedSceneEntityPositionLabel(entity, t),
                value: entity.id,
              }))}
              testId="scene-entity-select"
              value={selectedEntityId}
            />
          ) : (
            <EmptyState
              detail={t('runtime.sceneBuilder.noPassiveEntities.detail')}
              title={t('runtime.sceneBuilder.noPassiveEntities.title')}
            />
          )}
          {selectedEntity ? (
            <div className="grid gap-3">
              <StatusRow
                label={t('runtime.sceneBuilder.field.selected')}
                value={getLocalizedSceneEntityPositionLabel(selectedEntity, t)}
              />
              {entityEditDraftErrors.length ? (
                <p className="text-xs leading-5 text-amber-200">
                  {entityEditDraftErrors.slice(0, 3).join(' ')}
                </p>
              ) : null}
              <SelectField
                label={t('runtime.sceneBuilder.field.entityType')}
                onChange={(value) => onEditEntityFieldChange('type', value)}
                options={sceneEntityTypeOptions.map((entityType) => ({
                  label: getLocalizedSceneEntityTypeLabel(entityType, t),
                  value: entityType,
                }))}
                value={entityEditDraft.type}
              />
              <LabeledInput
                label={t('runtime.sceneBuilder.field.name')}
                onChange={(value) => onEditEntityFieldChange('name', value)}
                value={entityEditDraft.name}
              />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintWidth')}
                  onChange={(value) =>
                    onEditEntityFieldChange('footprintWidth', value)
                  }
                  value={entityEditDraft.footprintWidth}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintHeight')}
                  onChange={(value) =>
                    onEditEntityFieldChange('footprintHeight', value)
                  }
                  value={entityEditDraft.footprintHeight}
                />
              </div>
              <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
                <CheckboxField
                  checked={entityEditDraft.blocksMovement}
                  label={t('runtime.sceneBuilder.flag.blocksMovement')}
                  onChange={(checked) =>
                    onEditEntityFlagChange('blocksMovement', checked)
                  }
                />
                <CheckboxField
                  checked={entityEditDraft.blocksVision}
                  label={t('runtime.sceneBuilder.flag.blocksVision')}
                  onChange={(checked) =>
                    onEditEntityFlagChange('blocksVision', checked)
                  }
                />
                <CheckboxField
                  checked={entityEditDraft.hidden}
                  label={t('runtime.sceneBuilder.flag.hiddenMap')}
                  onChange={(checked) =>
                    onEditEntityFlagChange('hidden', checked)
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <ActionButton
                  disabled={Boolean(updateEntityDisabledReason)}
                  disabledReason={updateEntityDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.update')}
                  onClick={onUpdateEntity}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(repositionEntityDisabledReason)}
                  disabledReason={repositionEntityDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.moveTo', {
                    cell: `${selectedCell.x},${selectedCell.y}`,
                  })}
                  onClick={onRepositionEntity}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(deleteEntityDisabledReason)}
                  disabledReason={deleteEntityDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.delete')}
                  onClick={onDeleteEntity}
                  testId="scene-entity-delete"
                  variant="danger"
                />
              </div>
            </div>
          ) : null}
          {passiveEntities.length ? (
            <div className="grid gap-2 text-xs text-amber-100/70">
              <p className="font-bold uppercase tracking-[0.14em] text-amber-300/70">
                {t('runtime.sceneBuilder.passiveEntities')}
              </p>
              {passiveEntities.slice(-5).map((entity) => (
                <div
                  className="rounded-xl border border-amber-500/10 bg-black/20 px-3 py-2"
                  key={entity.id}
                >
                  {getLocalizedSceneEntityPositionLabel(entity, t)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
