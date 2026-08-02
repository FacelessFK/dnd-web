'use client';

/**
 * The board, and the controls that belong on it.
 *
 * This is the dominant region of both shells. Everything here is either the map
 * itself or something you would reach for without looking away from it: whose
 * turn it is, how far the selected token can still move, and the coordinates
 * being aimed at.
 *
 * The renderer is untouched. `TacticalMap` owns the canvas and the pointer
 * handling exactly as it did, and this component only decides what sits above
 * and below it - which is what keeps ROADMAP M4's option to swap the drawing
 * layer open.
 */
import type { ActiveSceneState } from '@dnd/protocol';

import type {
  Cell,
  CurrentTurnRailSummary,
  MovementFeedbackSummary,
  RuntimeMode,
} from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { ActionButton } from '../hud/hud-primitives';
import { NumberInput, SelectField } from '../hud/hud-fields';
import { CurrentTurnRail } from '../hud/action-economy-feedback';
import { MovementFeedback } from '../hud/encounter-feedback';
import { TacticalMap } from '../tactical-map';
import type { RuntimeScene } from '../../../lib/runtime-scene-view';

export type RuntimeMapStageProps = {
  actingParticipantId: string;
  activeScene: ActiveSceneState | null;
  actorOptions: Array<{ label: string; value: string }>;
  characterNamesByParticipant: Record<
    string,
    { name: string; hp: { current: number; max: number } } | undefined
  >;
  currentTurnCombatantId: string | null;
  currentTurnParticipantId: string | null;
  currentTurnSummary: CurrentTurnRailSummary | null;
  mode: RuntimeMode;
  movement: MovementFeedbackSummary;
  onDmReposition: () => void | Promise<void>;
  onMove: () => void | Promise<void>;
  onSelectActor: (participantId: string) => void;
  onSelectCell: (cell: Cell) => void;
  onSelectCombatant: (combatantId: string) => void;
  onSelectParticipant: (participantId: string) => void;
  onSelectSceneEntity: (entityId: string) => void;
  onUpdateCell: (update: (current: Cell) => Cell) => void;
  ownParticipantId: string;
  repositionDisabledReason: string | null;
  scene: RuntimeScene | null;
  sceneLabel: string;
  selectedCell: Cell;
  selectedCombatantId: string;
  selectedSceneEntityId: string;
  targetCombatantId: string;
  targetParticipantId: string;
  t: RuntimeTranslator;
};

export function RuntimeMapStage(props: RuntimeMapStageProps) {
  const { mode, movement, t } = props;

  return (
    <section
      aria-label={t('runtime.grid.title')}
      className="relative flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-stone-950/60 to-[#150e09]/95 p-3 shadow-2xl shadow-black/40 ring-1 ring-white/5 sm:p-4"
      data-hud-region="map"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        {/* Not CSS-uppercased: `innerText` is what both a screen reader
            and an acceptance harness read, and Persian has no case anyway. */}
        <h2 className="text-sm font-black tracking-[0.14em] text-amber-200/85">
          {t('runtime.grid.title')}
        </h2>
        <p className="min-w-0 truncate text-xs text-amber-100/60" dir="auto">
          {props.sceneLabel}
        </p>
      </header>

      <CurrentTurnRail summary={props.currentTurnSummary} t={t} />
      <MovementFeedback summary={movement} t={t} />

      <div className="min-h-0 min-w-0 flex-1">
        <TacticalMap
          activeScene={props.activeScene}
          characterNamesByParticipant={props.characterNamesByParticipant}
          currentTurnCombatantId={props.currentTurnCombatantId}
          currentTurnParticipantId={props.currentTurnParticipantId}
          mode={mode}
          movementBudgetFeet={movement.movementRemainingFeet}
          movingParticipantId={props.actingParticipantId || null}
          onSelectCell={props.onSelectCell}
          onSelectCombatant={props.onSelectCombatant}
          onSelectParticipant={props.onSelectParticipant}
          onSelectSceneEntity={props.onSelectSceneEntity}
          ownParticipantId={props.ownParticipantId || null}
          scene={props.scene}
          selectedCell={props.selectedCell}
          selectedCombatantId={props.selectedCombatantId}
          selectedSceneEntityId={props.selectedSceneEntityId}
          targetCombatantId={props.targetCombatantId}
          targetParticipantId={props.targetParticipantId}
        />
      </div>

      <div className="grid gap-2 rounded-2xl border border-amber-500/15 bg-black/30 p-3 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end">
        <NumberInput
          label="X"
          onChange={(x) => props.onUpdateCell((cell) => ({ ...cell, x }))}
          value={props.selectedCell.x}
        />
        <NumberInput
          label="Y"
          onChange={(y) => props.onUpdateCell((cell) => ({ ...cell, y }))}
          value={props.selectedCell.y}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton
            disabled={Boolean(movement.moveBlockedReason)}
            disabledReason={movement.moveBlockedReason ?? undefined}
            label={
              mode === 'dm'
                ? t('runtime.grid.moveActor')
                : t('runtime.grid.moveToken')
            }
            onClick={props.onMove}
            variant={mode === 'dm' ? 'secondary' : 'primary'}
          />
          {mode === 'dm' ? (
            <ActionButton
              disabled={Boolean(props.repositionDisabledReason)}
              disabledReason={props.repositionDisabledReason ?? undefined}
              label={t('runtime.grid.dmReposition')}
              onClick={props.onDmReposition}
            />
          ) : null}
        </div>
        {mode === 'dm' ? (
          <div className="sm:col-span-3">
            <SelectField
              label={t('runtime.grid.actingToken')}
              onChange={props.onSelectActor}
              options={props.actorOptions}
              value={props.actingParticipantId}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
