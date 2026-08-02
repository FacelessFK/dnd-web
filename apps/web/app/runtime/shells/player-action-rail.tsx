'use client';

/**
 * What this player can do right now, in the order they should consider it.
 *
 * Contextual by construction rather than by hiding things: a pending roll
 * outranks everything, because the table is waiting on it; the connection
 * outranks gameplay, because nothing they click will land; and outside their
 * own turn the turn actions are disabled *with the reason attached* rather than
 * removed, so the surface does not silently change shape between turns.
 *
 * Availability here is presentation. Every one of these still goes to the
 * server, and the server is still the gate - a player whose browser thinks they
 * may act gets exactly as far as a command that is refused.
 */
import type {
  ActionEconomyFeedbackSummary,
  ActionTargetFeedbackSummary,
} from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import type { SimpleEncounterCommandType } from '../../../lib/runtime-encounter-commands';
import { ActionButton, StatusBadge } from '../hud/hud-primitives';
import { SelectField } from '../hud/hud-fields';
import {
  ActionEconomyFeedback,
  getActionEconomyResource,
} from '../hud/action-economy-feedback';
import { ActionTargetFeedback } from '../hud/encounter-feedback';

export type PlayerActionRailProps = {
  actionEconomy: ActionEconomyFeedbackSummary;
  attackDisabledReason: string | null;
  isOwnTurn: boolean;
  onAttack: () => void | Promise<void>;
  onSelectTarget: (value: string) => void;
  onUseResource: (type: SimpleEncounterCommandType) => void | Promise<void>;
  selectedTargetValue: string;
  t: RuntimeTranslator;
  targetFeedback: ActionTargetFeedbackSummary;
  targetOptions: Array<{ label: string; value: string }>;
};

export function PlayerActionRail({
  actionEconomy,
  attackDisabledReason,
  isOwnTurn,
  onAttack,
  onSelectTarget,
  onUseResource,
  selectedTargetValue,
  t,
  targetFeedback,
  targetOptions,
}: PlayerActionRailProps) {
  const unavailable = t('runtime.actionEconomy.unavailable');
  const resources = (['action', 'bonusAction', 'reaction'] as const).map((id) =>
    getActionEconomyResource(actionEconomy, id, unavailable),
  );
  const resourceLabels = {
    action: t('runtime.turnTarget.useAction'),
    bonusAction: t('runtime.turnTarget.useBonus'),
    reaction: t('runtime.turnTarget.useReaction'),
  } as const;

  return (
    <section
      aria-label={t('runtime.playerActions.title')}
      className={`grid gap-3 rounded-3xl border p-3 shadow-xl shadow-black/30 transition-colors ${
        isOwnTurn
          ? 'border-amber-300/55 bg-amber-950/35 ring-1 ring-amber-300/25'
          : 'border-slate-600/40 bg-slate-950/50'
      }`}
      data-hud-region="player-actions"
      data-own-turn={isOwnTurn ? 'true' : 'false'}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black uppercase tracking-[0.16em] text-amber-200/85">
          {t('runtime.playerActions.title')}
        </h2>
        {/* Colour is never the only turn indicator: the chip says it too. */}
        <StatusBadge
          label={
            isOwnTurn
              ? t('runtime.playerActions.yourTurn')
              : t('runtime.playerActions.waiting')
          }
          tone={isOwnTurn ? 'success' : 'info'}
        />
      </div>

      <SelectField
        label={t('runtime.turnTarget.target')}
        onChange={onSelectTarget}
        options={targetOptions}
        testId="player-attack-target"
        value={selectedTargetValue}
      />
      <ActionTargetFeedback summary={targetFeedback} t={t} />

      <ActionButton
        disabled={Boolean(attackDisabledReason)}
        disabledReason={attackDisabledReason ?? undefined}
        label={t('runtime.turnTarget.attackTarget')}
        onClick={onAttack}
      />

      <ActionEconomyFeedback summary={actionEconomy} t={t} />
      <div className="grid grid-cols-3 gap-2">
        {resources.map((resource) => (
          <ActionButton
            disabled={Boolean(resource.blockedReason)}
            disabledReason={resource.blockedReason ?? undefined}
            key={resource.id}
            label={resourceLabels[resource.id]}
            onClick={() => onUseResource(resource.commandType)}
            variant="secondary"
          />
        ))}
      </div>
    </section>
  );
}
