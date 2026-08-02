'use client';

/**
 * Setting up and running the table itself: seats, scaffolding and the encounter.
 *
 * The demo scenario buttons live here rather than beside the map because they
 * are setup, not play. Everything they do is an ordinary command sequence a GM
 * could issue by hand; the scenario is a shortcut for getting a table to the
 * point where there is something to run.
 *
 * The GM's own seat fields are here too. They are the only place a participant
 * ID is editable, and they belong behind the tools rather than in the header
 * where a player-facing surface would inherit them.
 */
import type {
  DmTableSetupChecklist,
  RuntimeEventSummary,
} from '../../../lib/runtime-cockpit-helpers';
import {
  demoScenarios,
  getDemoScenarioById,
  getDemoScenarioSummary,
} from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';
import { ActionButton, Panel, StatusRow } from '../hud/hud-primitives';
import { LabeledInput, SelectField } from '../hud/hud-fields';
import { DmTableSetupPanel } from '../hud/table-status-panels';

export type GmTablePanelProps = {
  busyReason: string | null;
  checklist: DmTableSetupChecklist;
  dmDisplayName: string;
  dmParticipantId: string;
  encounterDisabledReason: string | null;
  missingSessionReason: string | null;
  onCreateScene: () => void | Promise<void>;
  onCreatePcs: () => void | Promise<void>;
  onDmDisplayNameChange: (value: string) => void;
  onDmParticipantIdChange: (value: string) => void;
  onEndEncounter: () => void | Promise<void>;
  onFinalizePcs: () => void | Promise<void>;
  onJoinPlayers: () => void | Promise<void>;
  onPlaceTokens: () => void | Promise<void>;
  onRunScenario: () => void | Promise<void>;
  onSelectScenario: (scenarioId: string) => void;
  onStartEncounter: () => void | Promise<void>;
  placeTokensDisabledReason: string | null;
  scenarioId: string;
  startEncounterDisabledReason: string | null;
  t: RuntimeTranslator;
  activeSceneGuidance: RuntimeEventSummary;
};

export function GmTablePanel({
  activeSceneGuidance,
  busyReason,
  checklist,
  dmDisplayName,
  dmParticipantId,
  encounterDisabledReason,
  missingSessionReason,
  onCreateScene,
  onCreatePcs,
  onDmDisplayNameChange,
  onDmParticipantIdChange,
  onEndEncounter,
  onFinalizePcs,
  onJoinPlayers,
  onPlaceTokens,
  onRunScenario,
  onSelectScenario,
  onStartEncounter,
  placeTokensDisabledReason,
  scenarioId,
  startEncounterDisabledReason,
  t,
}: GmTablePanelProps) {
  const scenario = getDemoScenarioById(scenarioId);
  const summary = getDemoScenarioSummary(scenario);
  const setupReason = missingSessionReason ?? busyReason;

  return (
    <div className="grid gap-4">
      <DmTableSetupPanel checklist={checklist} t={t} />

      <Panel
        description={t('runtime.demoSetup.description')}
        eyebrow={t('runtime.demoSetup.eyebrow')}
        title={t('runtime.demoSetup.title')}
        tone="dm"
      >
        <div className="grid gap-3" data-runtime-demo-scenario>
          <SelectField
            label={t('runtime.demoSetup.scenarioLabel')}
            onChange={onSelectScenario}
            options={demoScenarios.map((entry) => ({
              label: entry.name,
              value: entry.id,
            }))}
            value={scenario.id}
          />
          <div className="rounded-2xl border border-amber-300/15 bg-black/20 p-3">
            <p className="text-sm font-bold text-amber-50" dir="auto">
              {summary.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-100/65" dir="auto">
              {summary.detail}
            </p>
            <div className="mt-3 grid gap-2 text-xs text-amber-100/70 sm:grid-cols-2">
              <StatusRow
                label={t('runtime.demoSetup.scene')}
                value={summary.sceneLabel}
              />
              <StatusRow
                label={t('runtime.demoSetup.roster')}
                value={summary.rosterLabel}
              />
            </div>
          </div>
          <ActionButton
            disabled={Boolean(busyReason)}
            disabledReason={busyReason ?? undefined}
            label={t('runtime.demoSetup.runTrainingRoom')}
            onClick={onRunScenario}
          />
          <div className="grid grid-cols-2 gap-2">
            <ActionButton
              disabled={Boolean(setupReason)}
              disabledReason={setupReason ?? undefined}
              label={t('runtime.demoSetup.action.joinPlayers')}
              onClick={onJoinPlayers}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(setupReason)}
              disabledReason={setupReason ?? undefined}
              label={t('runtime.demoSetup.action.createPcs')}
              onClick={onCreatePcs}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(setupReason)}
              disabledReason={setupReason ?? undefined}
              label={t('runtime.demoSetup.action.assignPcs')}
              onClick={onFinalizePcs}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(setupReason)}
              disabledReason={setupReason ?? undefined}
              label={t('runtime.demoSetup.action.createScene')}
              onClick={onCreateScene}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(placeTokensDisabledReason)}
              disabledReason={placeTokensDisabledReason ?? undefined}
              label={t('runtime.demoSetup.action.placeTokens')}
              onClick={onPlaceTokens}
              variant="secondary"
            />
            <ActionButton
              disabled={Boolean(startEncounterDisabledReason)}
              disabledReason={startEncounterDisabledReason ?? undefined}
              label={t('runtime.demoSetup.action.startEncounter')}
              onClick={onStartEncounter}
            />
          </div>
          <p className="text-xs leading-5 text-amber-100/60" dir="auto">
            {activeSceneGuidance.detail}
          </p>
          <ActionButton
            disabled={Boolean(encounterDisabledReason)}
            disabledReason={encounterDisabledReason ?? undefined}
            label={t('runtime.overrides.endEncounter')}
            onClick={onEndEncounter}
            variant="danger"
          />
        </div>
      </Panel>

      <Panel
        description={t('runtime.gmTools.seatDescription')}
        eyebrow={t('runtime.overrides.eyebrow')}
        title={t('runtime.gmTools.seatTitle')}
        tone="dm"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledInput
            label={t('runtime.session.dmParticipantId')}
            onChange={onDmParticipantIdChange}
            value={dmParticipantId}
          />
          <LabeledInput
            label={t('runtime.session.dmDisplayName')}
            onChange={onDmDisplayNameChange}
            value={dmDisplayName}
          />
        </div>
      </Panel>
    </div>
  );
}
