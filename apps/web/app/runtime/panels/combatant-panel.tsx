'use client';

import {
  abilityKeys,
  getCombatantEntities,
  isCombatantEntityDefeated,
  type AbilityKey,
  type Cell,
  type CombatantDraftForm,
} from '../../../lib/runtime-cockpit-helpers';
import {
  ActionButton,
  EmptyState,
  Panel,
  StatusRow,
} from '../hud/hud-primitives';
import { CheckboxField, LabeledInput, SelectField } from '../hud/hud-fields';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';

export function CombatantPanel({
  attackDisabledReason,
  combatantDraft,
  combatantDraftErrors,
  combatants,
  createDisabledReason,
  currentTurnCombatantId,
  hpDraft,
  onAbilityChange,
  onAttack,
  onCreate,
  onFieldChange,
  onHiddenChange,
  onHpChange,
  onHpDraftChange,
  onReposition,
  onSelectCombatant,
  onSetCurrentTurn,
  onSetHp,
  repositionDisabledReason,
  selectedCell,
  selectedCombatant,
  selectedCombatantId,
  setHpDisabledReason,
  t,
  targetParticipantId,
}: {
  attackDisabledReason: string | null;
  combatantDraft: CombatantDraftForm;
  combatantDraftErrors: string[];
  combatants: ReturnType<typeof getCombatantEntities>;
  createDisabledReason: string | null;
  currentTurnCombatantId: string | null;
  hpDraft: string;
  onAbilityChange: (abilityKey: AbilityKey, value: string) => void;
  onAttack: () => void | Promise<void>;
  onCreate: () => void | Promise<void>;
  onFieldChange: (
    field:
      | 'armorClass'
      | 'footprintHeight'
      | 'footprintWidth'
      | 'kind'
      | 'name'
      | 'speed',
    value: string,
  ) => void;
  onHiddenChange: (value: boolean) => void;
  onHpChange: (field: keyof CombatantDraftForm['hp'], value: string) => void;
  onHpDraftChange: (value: string) => void;
  onReposition: () => void | Promise<void>;
  onSelectCombatant: (combatantId: string) => void;
  onSetCurrentTurn: () => void | Promise<void>;
  onSetHp: () => void | Promise<void>;
  repositionDisabledReason: string | null;
  selectedCell: Cell;
  selectedCombatant?: ReturnType<typeof getCombatantEntities>[number];
  selectedCombatantId: string;
  setHpDisabledReason: string | null;
  t: RuntimeTranslator;
  targetParticipantId: string;
}) {
  return (
    <Panel
      description={t('runtime.combatants.description')}
      eyebrow={t('runtime.overrides.eyebrow')}
      title={t('runtime.combatants.title')}
      tone="dm"
    >
      <div className="grid gap-4">
        <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-red-950/15 p-3">
          <div>
            <p className="text-sm font-bold text-amber-50">
              {t('runtime.combatants.createTitle')}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/60">
              {t('runtime.combatants.createDetail', {
                x: String(selectedCell.x),
                y: String(selectedCell.y),
              })}
            </p>
          </div>
          {combatantDraftErrors.length ? (
            <p className="text-xs leading-5 text-amber-200">
              {combatantDraftErrors.slice(0, 3).join(' ')}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label={t('runtime.combatants.kind')}
              onChange={(value) => onFieldChange('kind', value)}
              options={[
                { label: 'monster', value: 'monster' },
                { label: 'npc', value: 'npc' },
              ]}
              value={combatantDraft.kind}
            />
            <LabeledInput
              label={t('runtime.combatants.name')}
              onChange={(value) => onFieldChange('name', value)}
              testId="combatant-name"
              value={combatantDraft.name}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <LabeledInput
              label={t('runtime.combatants.hpMax')}
              onChange={(value) => onHpChange('max', value)}
              value={combatantDraft.hp.max}
            />
            <LabeledInput
              label={t('runtime.combatants.hpCurrent')}
              onChange={(value) => onHpChange('current', value)}
              value={combatantDraft.hp.current}
            />
            <LabeledInput
              label={t('runtime.combatants.hpTemp')}
              onChange={(value) => onHpChange('temp', value)}
              value={combatantDraft.hp.temp}
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <LabeledInput
              label="AC"
              onChange={(value) => onFieldChange('armorClass', value)}
              value={combatantDraft.armorClass}
            />
            <LabeledInput
              label={t('runtime.combatants.speed')}
              onChange={(value) => onFieldChange('speed', value)}
              value={combatantDraft.speed}
            />
            <LabeledInput
              label={t('runtime.combatants.sizeWidth')}
              onChange={(value) => onFieldChange('footprintWidth', value)}
              value={combatantDraft.footprintWidth}
            />
            <LabeledInput
              label={t('runtime.combatants.sizeHeight')}
              onChange={(value) => onFieldChange('footprintHeight', value)}
              value={combatantDraft.footprintHeight}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-300/70">
              {t('runtime.combatants.abilities')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {abilityKeys.map((abilityKey) => (
                <LabeledInput
                  key={abilityKey}
                  label={abilityKey.toUpperCase()}
                  onChange={(value) => onAbilityChange(abilityKey, value)}
                  value={combatantDraft.abilities[abilityKey]}
                />
              ))}
            </div>
          </div>
          <CheckboxField
            checked={combatantDraft.hidden}
            label={t('runtime.combatants.hidden')}
            onChange={onHiddenChange}
          />
          <ActionButton
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason ?? undefined}
            label={t('runtime.combatants.create')}
            onClick={onCreate}
            testId="combatant-create"
          />
        </div>

        <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-black/25 p-3">
          <p className="text-sm font-bold text-amber-50">
            {t('runtime.combatants.commandTitle')}
          </p>
          {combatants.length ? (
            <SelectField
              label={t('runtime.combatants.selected')}
              onChange={onSelectCombatant}
              options={combatants.map((combatant) => ({
                label: t('runtime.combatants.option', {
                  current: String(combatant.combatant.hp.current),
                  defeatSuffix: isCombatantEntityDefeated(combatant)
                    ? t('runtime.combatants.defeatedSuffix')
                    : '',
                  kind: combatant.combatant.kind,
                  max: String(combatant.combatant.hp.max),
                  name: combatant.name,
                }),
                value: combatant.id,
              }))}
              value={selectedCombatantId}
            />
          ) : (
            <EmptyState
              detail={t('runtime.combatants.emptyDetail')}
              title={t('runtime.combatants.emptyTitle')}
            />
          )}
          {selectedCombatant ? (
            <div className="grid gap-2 text-sm">
              <StatusRow
                label={t('runtime.combatants.status.selected')}
                value={t('runtime.combatants.status.selectedValue', {
                  name: selectedCombatant.name,
                  x: String(selectedCombatant.position.x),
                  y: String(selectedCombatant.position.y),
                })}
              />
              <StatusRow
                label={t('runtime.combatants.status.currentTurn')}
                value={
                  currentTurnCombatantId === selectedCombatant.id
                    ? t('common.yes')
                    : t('common.no')
                }
              />
              <StatusRow
                label={t('runtime.combatants.status.label')}
                value={
                  isCombatantEntityDefeated(selectedCombatant)
                    ? t('runtime.combatants.status.defeated')
                    : t('runtime.combatants.status.active')
                }
              />
              <StatusRow
                label={t('runtime.combatants.status.target')}
                value={targetParticipantId || t('common.none')}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              disabled={Boolean(repositionDisabledReason)}
              disabledReason={repositionDisabledReason ?? undefined}
              label={t('runtime.combatants.reposition')}
              onClick={onReposition}
              testId="combatant-reposition"
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(repositionDisabledReason)}
              disabledReason={repositionDisabledReason ?? undefined}
              label={t('runtime.combatants.makeTurn')}
              onClick={onSetCurrentTurn}
              variant="secondary"
            />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <LabeledInput
              label="HP"
              onChange={onHpDraftChange}
              value={hpDraft}
            />
            <ActionButton
              disabled={Boolean(setHpDisabledReason)}
              disabledReason={setHpDisabledReason ?? undefined}
              label={t('runtime.combatants.setHp')}
              onClick={onSetHp}
              variant="secondary"
            />
          </div>
          <ActionButton
            disabled={Boolean(attackDisabledReason)}
            disabledReason={attackDisabledReason ?? undefined}
            label={t('runtime.combatants.attackTarget')}
            onClick={onAttack}
            variant="danger"
          />
        </div>
      </div>
    </Panel>
  );
}
