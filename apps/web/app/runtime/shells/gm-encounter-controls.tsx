'use client';

/**
 * Turn control and the GM's overrides on one panel.
 *
 * Advancing the turn is the single most frequent thing a GM does during a
 * fight, so it sits in the inspector beside the map rather than behind the tool
 * region - reaching it must not cost a panel opening in the middle of combat.
 *
 * The overrides below it are the authority's escape hatch: set a player's HP,
 * set their conditions, correct whose turn it is, or correct what that turn has
 * already spent. They are destructive by nature and styled as such, but they are
 * not hidden - a GM who needs one usually needs it because something has already
 * gone wrong at the table.
 */
import type { EncounterStatusSummary } from '../../../lib/runtime-cockpit-helpers';
import type { TurnUsageDraft } from '../../../lib/runtime-hud-drafts';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { ActionButton, Panel, StatusRow } from '../hud/hud-primitives';
import {
  CheckboxField,
  LabeledInput,
  NumberInput,
  SelectField,
} from '../hud/hud-fields';

export type GmEncounterControlsProps = {
  conditionsDraft: string;
  encounterDisabledReason: string | null;
  encounterStatus: EncounterStatusSummary;
  hpDraft: string;
  characterDisabledReason: string | null;
  onAdvanceTurn: () => void | Promise<void>;
  onConditionsDraftChange: (value: string) => void;
  onHpDraftChange: (value: string) => void;
  onSelectActor: (participantId: string) => void;
  onSetConditions: () => void | Promise<void>;
  onSetHp: () => void | Promise<void>;
  onSetTurnActor: () => void | Promise<void>;
  onSetTurnUsage: () => void | Promise<void>;
  onTurnUsageChange: (
    update: (draft: TurnUsageDraft) => TurnUsageDraft,
  ) => void;
  playerOptions: Array<{ label: string; value: string }>;
  selectedActorId: string;
  t: RuntimeTranslator;
  turnUsage: TurnUsageDraft;
};

export function GmEncounterControls({
  characterDisabledReason,
  conditionsDraft,
  encounterDisabledReason,
  encounterStatus,
  hpDraft,
  onAdvanceTurn,
  onConditionsDraftChange,
  onHpDraftChange,
  onSelectActor,
  onSetConditions,
  onSetHp,
  onSetTurnActor,
  onSetTurnUsage,
  onTurnUsageChange,
  playerOptions,
  selectedActorId,
  t,
  turnUsage,
}: GmEncounterControlsProps) {
  return (
    <Panel
      description={t('runtime.turnTarget.description')}
      eyebrow={t('runtime.turnTarget.eyebrow')}
      title={t('runtime.turnTarget.title')}
      tone="dm"
    >
      <div className="grid gap-3" data-hud-region="gm-encounter">
        <StatusRow
          label={t('runtime.turnTarget.usage')}
          value={t('runtime.turnTarget.usageValue', {
            action: t(turnUsage.actionUsed ? 'common.yes' : 'common.no'),
            bonus: t(turnUsage.bonusActionUsed ? 'common.yes' : 'common.no'),
            movement: String(turnUsage.movementUsed),
            reaction: t(turnUsage.reactionUsed ? 'common.yes' : 'common.no'),
          })}
        />
        <StatusRow
          label={t('runtime.turnRail.title')}
          value={
            encounterStatus.currentActorLabel ??
            t('runtime.actionEconomy.noEncounter')
          }
        />

        <ActionButton
          disabled={Boolean(encounterDisabledReason)}
          disabledReason={encounterDisabledReason ?? undefined}
          label={t('runtime.turnTarget.advanceTurn')}
          onClick={onAdvanceTurn}
          testId="gm-advance-turn"
        />

        <div className="grid gap-3 rounded-2xl border border-red-300/20 bg-red-950/15 p-3">
          <p className="text-sm font-semibold text-red-100">
            {t('runtime.overrides.title')}
          </p>
          <SelectField
            label={t('runtime.overrides.controlledParticipant')}
            onChange={onSelectActor}
            options={playerOptions}
            value={selectedActorId}
          />
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <LabeledInput
              label={t('runtime.overrides.currentHp')}
              onChange={onHpDraftChange}
              value={hpDraft}
            />
            <ActionButton
              disabled={Boolean(characterDisabledReason)}
              disabledReason={characterDisabledReason ?? undefined}
              label={t('runtime.overrides.setHp')}
              onClick={onSetHp}
            />
          </div>
          <LabeledInput
            label={t('runtime.overrides.conditionTags')}
            onChange={onConditionsDraftChange}
            value={conditionsDraft}
          />
          <ActionButton
            disabled={Boolean(characterDisabledReason)}
            disabledReason={characterDisabledReason ?? undefined}
            label={t('runtime.overrides.setConditions')}
            onClick={onSetConditions}
            variant="secondary"
          />

          <div className="grid gap-2 rounded-xl border border-red-300/15 bg-black/25 p-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-red-200/80">
              {t('runtime.overrides.turnOverride')}
            </p>
            <CheckboxField
              checked={turnUsage.actionUsed}
              label={t('runtime.overrides.actionUsed')}
              onChange={(actionUsed) =>
                onTurnUsageChange((draft) => ({ ...draft, actionUsed }))
              }
            />
            <CheckboxField
              checked={turnUsage.bonusActionUsed}
              label={t('runtime.overrides.bonusActionUsed')}
              onChange={(bonusActionUsed) =>
                onTurnUsageChange((draft) => ({ ...draft, bonusActionUsed }))
              }
            />
            <CheckboxField
              checked={turnUsage.reactionUsed}
              label={t('runtime.overrides.reactionUsed')}
              onChange={(reactionUsed) =>
                onTurnUsageChange((draft) => ({ ...draft, reactionUsed }))
              }
            />
            <NumberInput
              label={t('runtime.overrides.movementUsed')}
              onChange={(movementUsed) =>
                onTurnUsageChange((draft) => ({ ...draft, movementUsed }))
              }
              value={turnUsage.movementUsed}
            />
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                disabled={Boolean(encounterDisabledReason)}
                disabledReason={encounterDisabledReason ?? undefined}
                label={t('runtime.overrides.setTurnActor')}
                onClick={onSetTurnActor}
                variant="secondary"
              />
              <ActionButton
                disabled={Boolean(encounterDisabledReason)}
                disabledReason={encounterDisabledReason ?? undefined}
                label={t('runtime.overrides.setUsage')}
                onClick={onSetTurnUsage}
                variant="secondary"
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
