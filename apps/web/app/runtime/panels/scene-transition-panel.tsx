'use client';

import type { Scene } from '@dnd/protocol';

import {
  sceneTransitionKindOptions,
  type Cell,
  type SceneTransitionDraftForm,
  type SceneTransitionPreset,
  type SceneTransitionPresetId,
} from '../../../lib/runtime-cockpit-helpers';
import {
  getLocalizedSceneEntityPositionLabel,
  getLocalizedSceneTransitionKindLabel,
  getLocalizedSceneTransitionPresetDescription,
  getLocalizedSceneTransitionPresetLabel,
} from '../../../lib/runtime-scene-localization';
import {
  ActionButton,
  EmptyState,
  Panel,
  StatusRow,
} from '../hud/hud-primitives';
import {
  CheckboxField,
  LabeledInput,
  SelectField,
  TextAreaField,
} from '../hud/hud-fields';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';

export function SceneTransitionPanel({
  activateDisabledReason,
  createDisabledReason,
  deleteDisabledReason,
  draft,
  draftErrors,
  editDraft,
  editDraftErrors,
  onActivate,
  onCreate,
  onDelete,
  onDraftFieldChange,
  onDraftFlagChange,
  onDraftPresetSelect,
  onEditFieldChange,
  onEditFlagChange,
  onSelectTransition,
  onUpdate,
  sceneOptions,
  selectedCell,
  selectedTransition,
  selectedTransitionId,
  t,
  transitionPresets,
  transitions,
  updateDisabledReason,
}: {
  activateDisabledReason: string | null;
  createDisabledReason: string | null;
  deleteDisabledReason: string | null;
  draft: SceneTransitionDraftForm;
  draftErrors: string[];
  editDraft: SceneTransitionDraftForm;
  editDraftErrors: string[];
  onActivate: () => void | Promise<void>;
  onCreate: () => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onDraftFieldChange: (
    field:
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'notes'
      | 'targetLabel'
      | 'targetSceneId',
    value: string,
  ) => void;
  onDraftFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onDraftPresetSelect: (presetId: SceneTransitionPresetId) => void;
  onEditFieldChange: (
    field:
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'notes'
      | 'targetLabel'
      | 'targetSceneId',
    value: string,
  ) => void;
  onEditFlagChange: (
    field: 'blocksMovement' | 'blocksVision' | 'hidden',
    value: boolean,
  ) => void;
  onSelectTransition: (transitionId: string) => void;
  onUpdate: () => void | Promise<void>;
  sceneOptions: Array<{ label: string; value: string }>;
  selectedCell: Cell;
  selectedTransition?: Scene['entities'][number];
  selectedTransitionId: string;
  t: RuntimeTranslator;
  transitionPresets: readonly SceneTransitionPreset[];
  transitions: Scene['entities'];
  updateDisabledReason: string | null;
}) {
  const targetOptions = [
    { label: t('runtime.sceneBuilder.chooseKnownScene'), value: '' },
    ...sceneOptions,
  ];

  return (
    <Panel
      description={t('runtime.sceneBuilder.transitions.description')}
      eyebrow={t('runtime.overrides.eyebrow')}
      title={t('runtime.sceneBuilder.transitions.title')}
      tone="dm"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-violet-300/20 bg-violet-950/20 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.transitions.create')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.transitions.createDetail', {
                cell: `${selectedCell.x},${selectedCell.y}`,
              })}
            </p>
          </div>
          {draftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {draftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-300/70">
              {t('runtime.sceneBuilder.transitions.presets')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {transitionPresets.map((preset) => (
                <button
                  className="min-h-16 rounded-xl border border-violet-200/15 bg-[#22162a] px-3 py-2 text-left transition hover:border-violet-200/45 hover:bg-[#2f1e3b] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                  key={preset.id}
                  onClick={() => onDraftPresetSelect(preset.id)}
                  title={getLocalizedSceneTransitionPresetDescription(
                    preset.id,
                    t,
                  )}
                  type="button"
                >
                  <span className="block text-sm font-bold text-amber-50">
                    {getLocalizedSceneTransitionPresetLabel(preset.id, t)}
                  </span>
                  <span className="mt-1 block text-xs capitalize text-amber-100/55">
                    {getLocalizedSceneTransitionKindLabel(preset.draft.kind, t)}{' '}
                    · {preset.draft.footprintWidth}x
                    {preset.draft.footprintHeight}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={t('runtime.sceneBuilder.field.transitionKind')}
              onChange={(value) => onDraftFieldChange('kind', value)}
              options={sceneTransitionKindOptions.map((kind) => ({
                label: getLocalizedSceneTransitionKindLabel(kind, t),
                value: kind,
              }))}
              value={draft.kind}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.name')}
              onChange={(value) => onDraftFieldChange('name', value)}
              value={draft.name}
            />
          </div>
          <SelectField
            label={t('runtime.sceneBuilder.field.transitionTargetScene')}
            onChange={(value) => onDraftFieldChange('targetSceneId', value)}
            options={targetOptions}
            value={draft.targetSceneId}
          />
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.transitionTargetSceneId')}
              onChange={(value) => onDraftFieldChange('targetSceneId', value)}
              placeholder="scene_..."
              value={draft.targetSceneId}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.transitionTargetLabel')}
              onChange={(value) => onDraftFieldChange('targetLabel', value)}
              value={draft.targetLabel}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintWidth')}
              onChange={(value) => onDraftFieldChange('footprintWidth', value)}
              value={draft.footprintWidth}
            />
            <LabeledInput
              label={t('runtime.sceneBuilder.field.footprintHeight')}
              onChange={(value) => onDraftFieldChange('footprintHeight', value)}
              value={draft.footprintHeight}
            />
          </div>
          <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
            <CheckboxField
              checked={draft.blocksMovement}
              label={t('runtime.sceneBuilder.flag.blocksMovement')}
              onChange={(checked) =>
                onDraftFlagChange('blocksMovement', checked)
              }
            />
            <CheckboxField
              checked={draft.blocksVision}
              label={t('runtime.sceneBuilder.flag.blocksVision')}
              onChange={(checked) => onDraftFlagChange('blocksVision', checked)}
            />
            <CheckboxField
              checked={draft.hidden}
              label={t('runtime.sceneBuilder.flag.hiddenPlayerMap')}
              onChange={(checked) => onDraftFlagChange('hidden', checked)}
            />
          </div>
          <TextAreaField
            label={t('runtime.sceneBuilder.field.notes')}
            onChange={(value) => onDraftFieldChange('notes', value)}
            value={draft.notes}
          />
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label={t('runtime.sceneBuilder.transitions.action.create')}
            onClick={onCreate}
            variant="secondary"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-violet-300/20 bg-black/25 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.sceneBuilder.transitions.edit')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.sceneBuilder.transitions.editDetail')}
            </p>
          </div>
          {transitions.length ? (
            <SelectField
              label={t('runtime.sceneBuilder.field.transitionNode')}
              onChange={onSelectTransition}
              options={transitions.map((transition) => ({
                label: getLocalizedSceneEntityPositionLabel(transition, t),
                value: transition.id,
              }))}
              value={selectedTransitionId}
            />
          ) : (
            <EmptyState
              detail={t('runtime.sceneBuilder.transitions.noNodes.detail')}
              title={t('runtime.sceneBuilder.transitions.noNodes.title')}
            />
          )}
          {selectedTransition ? (
            <div className="grid gap-3">
              <StatusRow
                label={t('runtime.sceneBuilder.field.selected')}
                value={getLocalizedSceneEntityPositionLabel(
                  selectedTransition,
                  t,
                )}
              />
              {editDraftErrors.length ? (
                <p className="text-xs leading-5 text-amber-200">
                  {editDraftErrors.slice(0, 3).join(' ')}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label={t('runtime.sceneBuilder.field.transitionKind')}
                  onChange={(value) => onEditFieldChange('kind', value)}
                  options={sceneTransitionKindOptions.map((kind) => ({
                    label: getLocalizedSceneTransitionKindLabel(kind, t),
                    value: kind,
                  }))}
                  value={editDraft.kind}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.name')}
                  onChange={(value) => onEditFieldChange('name', value)}
                  value={editDraft.name}
                />
              </div>
              <SelectField
                label={t('runtime.sceneBuilder.field.transitionTargetScene')}
                onChange={(value) => onEditFieldChange('targetSceneId', value)}
                options={targetOptions}
                value={editDraft.targetSceneId}
              />
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label={t(
                    'runtime.sceneBuilder.field.transitionTargetSceneId',
                  )}
                  onChange={(value) =>
                    onEditFieldChange('targetSceneId', value)
                  }
                  placeholder="scene_..."
                  value={editDraft.targetSceneId}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.transitionTargetLabel')}
                  onChange={(value) => onEditFieldChange('targetLabel', value)}
                  value={editDraft.targetLabel}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintWidth')}
                  onChange={(value) =>
                    onEditFieldChange('footprintWidth', value)
                  }
                  value={editDraft.footprintWidth}
                />
                <LabeledInput
                  label={t('runtime.sceneBuilder.field.footprintHeight')}
                  onChange={(value) =>
                    onEditFieldChange('footprintHeight', value)
                  }
                  value={editDraft.footprintHeight}
                />
              </div>
              <div className="grid gap-2 rounded-2xl border border-amber-500/10 bg-black/20 p-3">
                <CheckboxField
                  checked={editDraft.blocksMovement}
                  label={t('runtime.sceneBuilder.flag.blocksMovement')}
                  onChange={(checked) =>
                    onEditFlagChange('blocksMovement', checked)
                  }
                />
                <CheckboxField
                  checked={editDraft.blocksVision}
                  label={t('runtime.sceneBuilder.flag.blocksVision')}
                  onChange={(checked) =>
                    onEditFlagChange('blocksVision', checked)
                  }
                />
                <CheckboxField
                  checked={editDraft.hidden}
                  label={t('runtime.sceneBuilder.flag.hiddenPlayerMap')}
                  onChange={(checked) => onEditFlagChange('hidden', checked)}
                />
              </div>
              <TextAreaField
                label={t('runtime.sceneBuilder.field.notes')}
                onChange={(value) => onEditFieldChange('notes', value)}
                value={editDraft.notes}
              />
              <div className="grid grid-cols-3 gap-2">
                <ActionButton
                  disabled={Boolean(updateDisabledReason)}
                  disabledReason={updateDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.update')}
                  onClick={onUpdate}
                  variant="secondary"
                />
                <ActionButton
                  disabled={Boolean(activateDisabledReason)}
                  disabledReason={activateDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.transitions.action.activate')}
                  onClick={onActivate}
                />
                <ActionButton
                  disabled={Boolean(deleteDisabledReason)}
                  disabledReason={deleteDisabledReason ?? undefined}
                  label={t('runtime.sceneBuilder.action.delete')}
                  onClick={onDelete}
                  variant="danger"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
