'use client';

/**
 * What the GM has selected, and the actions that belong to it.
 *
 * Target-aware rather than exhaustive. Selecting a combatant offers HP,
 * conceal/reveal, reposition and turn control; selecting a passive entity
 * offers move, reveal and remove; selecting an empty cell offers placement.
 * The full command catalogue lives in the tool region - putting it here would
 * make the inspector another wall to read rather than the answer to "what can I
 * do with this thing".
 *
 * No protocol command names appear. `set_combatant_hp` is a wire detail; the
 * button says what it does to the creature.
 */
import type { Scene } from '@dnd/protocol';

import type { Cell } from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { getLocalizedSceneEntityLabel } from '../../../lib/runtime-scene-localization';
import {
  ActionButton,
  EmptyState,
  Panel,
  StatusBadge,
  StatusRow,
} from '../hud/hud-primitives';
import { LabeledInput } from '../hud/hud-fields';

export type GmInspectorProps = {
  hpDraft: string;
  onDeleteEntity: () => void | Promise<void>;
  onHpDraftChange: (value: string) => void;
  onRepositionCombatant: () => void | Promise<void>;
  onRepositionEntity: () => void | Promise<void>;
  onSetCombatantHidden: (combatantId: string, hidden: boolean) => void;
  onSetCurrentTurn: () => void | Promise<void>;
  onSetHp: () => void | Promise<void>;
  reasons: {
    deleteSceneEntity: string | null;
    repositionSceneEntity: string | null;
    selectedCombatant: string | null;
  };
  selectedCell: Cell;
  selectedCombatant?: Scene['entities'][number];
  selectedEntity?: Scene['entities'][number];
  t: RuntimeTranslator;
};

export function GmInspector({
  hpDraft,
  onDeleteEntity,
  onHpDraftChange,
  onRepositionCombatant,
  onRepositionEntity,
  onSetCombatantHidden,
  onSetCurrentTurn,
  onSetHp,
  reasons,
  selectedCell,
  selectedCombatant,
  selectedEntity,
  t,
}: GmInspectorProps) {
  const combatant = selectedCombatant?.combatant;

  return (
    <Panel
      description={t('runtime.gmInspector.description')}
      eyebrow={t('runtime.gmInspector.eyebrow')}
      title={t('runtime.gmInspector.title')}
      tone="dm"
    >
      <div className="grid gap-3" data-hud-region="gm-inspector">
        <StatusRow
          label={t('runtime.gmInspector.cell')}
          value={`${selectedCell.x}, ${selectedCell.y}`}
        />

        {combatant && selectedCombatant ? (
          <div className="grid gap-3 rounded-2xl border border-red-300/25 bg-red-950/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-black text-amber-50"
                  dir="auto"
                >
                  {selectedCombatant.name}
                </p>
                <p className="mt-1 text-xs text-amber-100/60">
                  {combatant.kind} · {combatant.hp.current}/{combatant.hp.max}
                </p>
              </div>
              <StatusBadge
                label={
                  selectedCombatant.hidden
                    ? t('runtime.gmInspector.concealed')
                    : t('runtime.gmInspector.visible')
                }
                tone={selectedCombatant.hidden ? 'warning' : 'success'}
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <LabeledInput
                label={t('runtime.combatants.hpCurrent')}
                onChange={onHpDraftChange}
                testId="gm-inspector-hp"
                value={hpDraft}
              />
              <ActionButton
                disabled={Boolean(reasons.selectedCombatant)}
                disabledReason={reasons.selectedCombatant ?? undefined}
                label={t('runtime.combatants.setHp')}
                onClick={onSetHp}
                testId="gm-inspector-set-hp"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                disabled={Boolean(reasons.selectedCombatant)}
                disabledReason={reasons.selectedCombatant ?? undefined}
                label={
                  selectedCombatant.hidden
                    ? t('runtime.combatants.reveal')
                    : t('runtime.combatants.conceal')
                }
                onClick={() =>
                  onSetCombatantHidden(
                    selectedCombatant.id,
                    !selectedCombatant.hidden,
                  )
                }
                variant="secondary"
              />
              <ActionButton
                disabled={Boolean(reasons.selectedCombatant)}
                disabledReason={reasons.selectedCombatant ?? undefined}
                label={t('runtime.combatants.reposition')}
                onClick={onRepositionCombatant}
                variant="secondary"
              />
              <ActionButton
                disabled={Boolean(reasons.selectedCombatant)}
                disabledReason={reasons.selectedCombatant ?? undefined}
                label={t('runtime.combatants.setTurn')}
                onClick={onSetCurrentTurn}
                variant="secondary"
              />
            </div>
          </div>
        ) : null}

        {selectedEntity ? (
          <div className="grid gap-2 rounded-2xl border border-orange-300/20 bg-orange-950/15 p-3">
            <p className="text-sm font-bold text-amber-50" dir="auto">
              {getLocalizedSceneEntityLabel(selectedEntity, t)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                disabled={Boolean(reasons.repositionSceneEntity)}
                disabledReason={reasons.repositionSceneEntity ?? undefined}
                label={t('runtime.sceneBuilder.action.repositionEntity')}
                onClick={onRepositionEntity}
                variant="secondary"
              />
              <ActionButton
                disabled={Boolean(reasons.deleteSceneEntity)}
                disabledReason={reasons.deleteSceneEntity ?? undefined}
                label={t('runtime.sceneBuilder.action.deleteEntity')}
                onClick={onDeleteEntity}
                variant="danger"
              />
            </div>
          </div>
        ) : null}

        {!combatant && !selectedEntity ? (
          <EmptyState
            detail={t('runtime.gmInspector.emptyDetail')}
            title={t('runtime.gmInspector.emptyTitle')}
          />
        ) : null}
      </div>
    </Panel>
  );
}
