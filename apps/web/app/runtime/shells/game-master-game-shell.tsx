'use client';

/**
 * The GM's workspace.
 *
 * Same hierarchy as the Player's, aimed at adjudication rather than play: a
 * dominant map, one contextual inspector beside it, one collapsible tool region
 * below, and one compact feedback strip. A GM should be able to reach any
 * common action in one panel opening and one click after selecting a target.
 *
 * Diagnostics exist here and are a tab, never the landing tab. Preserving them
 * matters - a GM debugging a live table genuinely needs the frame log - but a
 * normal GM view has to read as a game interface rather than a server console,
 * which is why nothing here depends on them being open.
 */
import { useRef } from 'react';

import {
  sceneEntityPresets,
  sceneTransitionPresets,
} from '../../../lib/runtime-cockpit-helpers';
import type { RuntimeHudModel } from '../../../lib/use-runtime-hud';
import {
  selectPanelPresentation,
  type GameMasterToolTab,
} from '../../../lib/runtime-hud-layout';
import { describeStreamStatus } from '../../../lib/m1-feedback';
import { M1FeedbackLayer } from '../m1-feedback-layer';
import { M1GmPanel } from '../m1-gm-panel';
import { LatestEventFeed } from '../hud/action-economy-feedback';
import { EncounterStatusFeedback } from '../hud/encounter-feedback';
import { HudDrawer } from '../hud/hud-drawer';
import { RecoveryReliabilityPanel } from '../hud/table-status-panels';
import { RuntimeStatusOverviewPanel } from '../hud/runtime-status-overview-panel';
import { RuntimeDiagnosticsPanel } from '../diagnostics/runtime-diagnostics-panel';
import { CombatantPanel } from '../panels/combatant-panel';
import { SceneBuilderPanel } from '../panels/scene-builder-panel';
import { SceneTransitionPanel } from '../panels/scene-transition-panel';
import { GmEncounterControls } from './gm-encounter-controls';
import { GmInspector } from './gm-inspector';
import { GmRosterPanel } from './gm-roster-panel';
import { GmTablePanel } from './gm-table-panel';
import { GmToolRegion } from './gm-tool-region';
import { RuntimeMapStage } from './runtime-map-stage';
import { RuntimeShellFrame } from './runtime-shell-frame';

export type GameMasterGameShellProps = {
  activeTab: GameMasterToolTab;
  hud: RuntimeHudModel;
  onSelectScenario: (scenarioId: string) => void;
  onSelectTab: (tab: GameMasterToolTab) => void;
  onTogglePanel: (panel: 'inspector' | 'tools') => void;
  panelRequest: { inspector: boolean; tools: boolean };
  prefersReducedMotion: boolean;
  viewportWidthPx: number;
};

export function GameMasterGameShell({
  activeTab,
  hud,
  onSelectScenario,
  onSelectTab,
  onTogglePanel,
  panelRequest,
  prefersReducedMotion,
  viewportWidthPx,
}: GameMasterGameShellProps) {
  const { drafts, m1, runtime, scene, seats, selection, t, table } = hud;
  const inspectorOpenerRef = useRef<HTMLButtonElement | null>(null);
  const toolsOpenerRef = useRef<HTMLButtonElement | null>(null);
  const panels = selectPanelPresentation({
    request: panelRequest,
    viewportWidthPx,
  });
  const stream = describeStreamStatus(
    hud.session.stream.status,
    Boolean(runtime.session),
  );

  return (
    <RuntimeShellFrame
      hud={hud}
      inspectorLabel={t('runtime.gmShell.inspector')}
      inspectorOpen={panels.inspectorOpen}
      inspectorOpenerRef={inspectorOpenerRef}
      onToggleInspector={() => onTogglePanel('inspector')}
      onToggleTools={() => onTogglePanel('tools')}
      role="gm"
      seatControlsCollapsible={panels.layout === 'drawer'}
      toolsLabel={t('runtime.gmShell.tools')}
      toolsOpen={panels.toolsOpen}
      toolsOpenerRef={toolsOpenerRef}
    >
      {/*
        The column split is a media query, not a measured width.

        `gridTemplateColumns` used to come from React's observed viewport, which
        made the layout depend on a `resize` event actually arriving. When one
        did not - a headed browser applying a device-metrics override - the
        shell kept the desktop template, and a 380px inspector column inside a
        406px row squeezed the map to 26px. The map being dominant is the
        milestone's acceptance criterion, so it must not hinge on an event.

        `inspectorOpen` still comes from React, because whether a panel was
        asked for is genuinely state. Only the width branch is CSS.
      */}
      <div
        className={`grid min-h-0 grid-cols-[minmax(0,1fr)] gap-4 ${
          panels.inspectorOpen
            ? 'min-[900px]:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]'
            : ''
        }`}
      >
        <RuntimeMapStage
          actingParticipantId={hud.actingParticipantId}
          activeScene={runtime.activeScene}
          actorOptions={table.playerParticipants.map((participant) => ({
            label: `${participant.displayName} (${participant.id})`,
            value: participant.id,
          }))}
          characterNamesByParticipant={table.mapCharacterSummaries}
          currentTurnCombatantId={
            runtime.encounter
              ? ((
                  runtime.encounter.participants[
                    runtime.encounter.currentTurnIndex
                  ] as { combatantId?: string } | undefined
                )?.combatantId ?? null)
              : null
          }
          currentTurnParticipantId={
            runtime.encounter?.participants[runtime.encounter.currentTurnIndex]
              ?.participantId ?? null
          }
          currentTurnSummary={table.currentTurnRailSummary}
          mode="dm"
          movement={table.movementFeedbackSummary}
          onDmReposition={hud.actions.dmRepositionSelected}
          onMove={hud.actions.moveSelectedActor}
          onSelectActor={hud.selectionActions.selectActor}
          onSelectCell={hud.selectionActions.selectCell}
          onSelectCombatant={hud.selectionActions.selectCombatant}
          onSelectParticipant={hud.selectionActions.selectTarget}
          onSelectSceneEntity={hud.selectionActions.selectMapSceneEntity}
          onUpdateCell={hud.selectionActions.updateCell}
          ownParticipantId={seats.dmParticipantId}
          repositionDisabledReason={table.disabledReasons.dmCharacter}
          scene={runtime.scene}
          sceneLabel={table.activeSceneLabel}
          selectedCell={selection.cell}
          selectedCombatantId={selection.combatantId}
          selectedSceneEntityId={selection.sceneEntityId}
          t={t}
          targetCombatantId={selection.targetCombatantId}
          targetParticipantId={selection.targetParticipantId}
        />

        <HudDrawer
          asDrawer={panels.inspectorAsDrawer}
          onClose={() => onTogglePanel('inspector')}
          open={panels.inspectorOpen}
          panel="inspector"
          openerRef={inspectorOpenerRef}
          title={t('runtime.gmShell.inspector')}
        >
          <GmInspector
            hpDraft={drafts.combatantHp}
            onDeleteEntity={hud.actions.deleteSceneEntity}
            onHpDraftChange={hud.draftActions.setCombatantHp}
            onRepositionCombatant={hud.actions.repositionCombatant}
            onRepositionEntity={hud.actions.repositionSceneEntity}
            onSetCombatantHidden={hud.actions.setCombatantHidden}
            onSetCurrentTurn={hud.actions.dmSetTurnCombatant}
            onSetHp={hud.actions.setCombatantHp}
            reasons={scene.reasons}
            selectedCell={selection.cell}
            selectedCombatant={scene.selectedCombatant}
            selectedEntity={scene.selectedSceneEntity}
            t={t}
          />

          <GmEncounterControls
            characterDisabledReason={table.disabledReasons.dmCharacter}
            conditionsDraft={drafts.conditions}
            encounterDisabledReason={table.disabledReasons.dmEncounter}
            encounterStatus={table.encounterStatusSummary}
            hpDraft={drafts.hp}
            onAdvanceTurn={() =>
              hud.actions.runEncounterCommand('advance_turn')
            }
            onConditionsDraftChange={hud.draftActions.setConditions}
            onHpDraftChange={hud.draftActions.setHp}
            onSelectActor={hud.selectionActions.selectActor}
            onSetConditions={hud.actions.dmSetConditions}
            onSetHp={hud.actions.dmSetCurrentHp}
            onSetTurnActor={hud.actions.dmSetTurnParticipant}
            onSetTurnUsage={hud.actions.dmSetTurnUsage}
            onTurnUsageChange={hud.draftActions.setTurnUsage}
            playerOptions={table.playerParticipants.map((participant) => ({
              label: `${participant.displayName} (${participant.id})`,
              value: participant.id,
            }))}
            selectedActorId={selection.actorParticipantId}
            t={t}
            turnUsage={drafts.turnUsage}
          />

          <M1FeedbackLayer
            items={m1.feedback}
            onDismiss={m1.clearFeedback}
            prefersReducedMotion={prefersReducedMotion}
            statusKey={stream.messageKey}
          />

          <M1GmPanel
            busyLabel={m1.busyLabel}
            combatants={hud.m1SceneCombatants}
            errorKey={m1.errorKey}
            onCancelRequest={(request) => void m1.cancelRequest(request)}
            onRequestResolution={(input) => void m1.requestResolution(input)}
            onSetCombatantHidden={hud.actions.setCombatantHidden}
            onSetPoisoned={hud.actions.setPoisoned}
            onUpdateIntentStatus={(intentId, status) =>
              void m1.updateIntentStatus(intentId, status)
            }
            participantId={hud.session.activeParticipantId}
            table={m1.table}
            targets={hud.m1ResolutionTargets}
          />

          <RuntimeStatusOverviewPanel
            overview={table.runtimeStatusOverview}
            t={t}
          />

          {/*
            Recovery state is gameplay, not diagnostics: it is how a GM knows
            whether the table they are looking at is the whole table. It stays
            in the inspector so it is readable without opening the tools.
          */}
          <RecoveryReliabilityPanel
            summary={table.recoveryReliabilitySummary}
            t={t}
          />
        </HudDrawer>
      </div>

      <section
        aria-label={t('runtime.gmShell.feedback')}
        className="grid gap-3 lg:grid-cols-2"
        data-hud-region="gm-feedback"
      >
        <EncounterStatusFeedback
          showEncounterId
          summary={table.encounterStatusSummary}
          t={t}
        />
        <LatestEventFeed entries={hud.feedEntries} t={t} />
      </section>

      <HudDrawer
        asDrawer={panels.toolsAsDrawer}
        onClose={() => onTogglePanel('tools')}
        open={panels.toolsOpen}
        panel="tools"
        openerRef={toolsOpenerRef}
        title={t('runtime.gmShell.tools')}
      >
        <GmToolRegion activeTab={activeTab} onSelectTab={onSelectTab} t={t}>
          {activeTab === 'scene' ? (
            <>
              <SceneBuilderPanel
                activateDisabledReason={scene.reasons.activateScene}
                activationSceneId={drafts.sceneActivationId}
                activeSceneGuidance={hud.activeSceneGuidance}
                createDisabledReason={scene.reasons.createCustomScene}
                deleteEntityDisabledReason={scene.reasons.deleteSceneEntity}
                entityDraft={drafts.sceneEntity}
                entityDraftErrors={scene.sceneEntityDraftErrors}
                entityEditDraft={drafts.sceneEntityEdit}
                entityEditDraftErrors={scene.sceneEntityEditDraftErrors}
                entityPresets={sceneEntityPresets}
                onActivateScene={hud.actions.activateSelectedScene}
                onActivationSceneIdChange={
                  hud.draftActions.setSceneActivationId
                }
                onCreateScene={hud.actions.createCustomScene}
                onDeleteEntity={hud.actions.deleteSceneEntity}
                onEditEntityFieldChange={
                  hud.draftActions.updateSceneEntityEditField
                }
                onEditEntityFlagChange={
                  hud.draftActions.updateSceneEntityEditFlag
                }
                onEntityFieldChange={hud.draftActions.updateSceneEntityField}
                onEntityFlagChange={hud.draftActions.updateSceneEntityFlag}
                onEntityPresetSelect={hud.draftActions.applySceneEntityPreset}
                onPlaceEntity={hud.actions.placeSceneEntity}
                onRepositionEntity={hud.actions.repositionSceneEntity}
                onSceneFieldChange={hud.draftActions.updateSceneField}
                onSelectEntity={hud.selectionActions.selectPassiveSceneEntity}
                onUpdateEntity={hud.actions.updateSceneEntity}
                passiveEntities={scene.passiveSceneEntities}
                placeEntityDisabledReason={scene.reasons.placeSceneEntity}
                repositionEntityDisabledReason={
                  scene.reasons.repositionSceneEntity
                }
                scene={runtime.scene}
                sceneDraft={drafts.scene}
                sceneDraftErrors={scene.sceneDraftErrors}
                selectedCell={selection.cell}
                selectedEntity={scene.selectedSceneEntity}
                selectedEntityId={selection.sceneEntityId}
                t={t}
                updateEntityDisabledReason={scene.reasons.updateSceneEntity}
              />
              <SceneTransitionPanel
                activateDisabledReason={scene.reasons.activateTransition}
                createDisabledReason={scene.reasons.createTransition}
                deleteDisabledReason={scene.reasons.deleteTransition}
                draft={drafts.sceneTransition}
                draftErrors={scene.localizedTransitionDraftErrors}
                editDraft={drafts.sceneTransitionEdit}
                editDraftErrors={scene.localizedTransitionEditDraftErrors}
                onActivate={hud.actions.activateSceneTransition}
                onCreate={hud.actions.createSceneTransition}
                onDelete={hud.actions.deleteSceneTransition}
                onDraftFieldChange={hud.draftActions.updateSceneTransitionField}
                onDraftFlagChange={hud.draftActions.updateSceneTransitionFlag}
                onDraftPresetSelect={
                  hud.draftActions.applySceneTransitionPreset
                }
                onEditFieldChange={
                  hud.draftActions.updateSceneTransitionEditField
                }
                onEditFlagChange={
                  hud.draftActions.updateSceneTransitionEditFlag
                }
                onSelectTransition={
                  hud.selectionActions.selectSceneTransitionNode
                }
                onUpdate={hud.actions.updateSceneTransition}
                sceneOptions={scene.knownSceneOptions}
                selectedCell={selection.cell}
                selectedTransition={scene.selectedTransition}
                selectedTransitionId={selection.transitionId}
                t={t}
                transitionPresets={sceneTransitionPresets}
                transitions={scene.transitionSceneEntities}
                updateDisabledReason={scene.reasons.updateTransition}
              />
            </>
          ) : null}

          {activeTab === 'combatants' ? (
            <CombatantPanel
              attackDisabledReason={scene.reasons.combatantAttack}
              combatantDraft={drafts.combatant}
              combatantDraftErrors={scene.localizedCombatantDraftErrors}
              combatants={scene.combatants}
              createDisabledReason={scene.reasons.createCombatant}
              currentTurnCombatantId={null}
              hpDraft={drafts.combatantHp}
              onAbilityChange={hud.draftActions.updateCombatantAbility}
              onAttack={hud.actions.dmCombatantAttackTarget}
              onCreate={hud.actions.createCombatant}
              onFieldChange={hud.draftActions.updateCombatantField}
              onHiddenChange={hud.draftActions.updateCombatantHidden}
              onHpChange={hud.draftActions.updateCombatantHp}
              onHpDraftChange={hud.draftActions.setCombatantHp}
              onReposition={hud.actions.repositionCombatant}
              onSelectCombatant={hud.selectionActions.selectCombatant}
              onSetCurrentTurn={hud.actions.dmSetTurnCombatant}
              onSetHp={hud.actions.setCombatantHp}
              repositionDisabledReason={scene.reasons.selectedCombatant}
              selectedCell={selection.cell}
              selectedCombatant={scene.selectedCombatant}
              selectedCombatantId={selection.combatantId}
              setHpDisabledReason={scene.reasons.selectedCombatant}
              t={t}
              targetParticipantId={selection.targetParticipantId}
            />
          ) : null}

          {activeTab === 'roster' ? (
            <GmRosterPanel
              assignSelectedDisabledReason={table.dmAssignSelectedReason}
              busyReason={scene.busyReason}
              charactersByParticipant={runtime.charactersByParticipant}
              currentTurnParticipantId={
                runtime.encounter?.participants[
                  runtime.encounter.currentTurnIndex
                ]?.participantId ?? null
              }
              onAssignPending={(participantId, characterId) =>
                void hud.actions.dmAssignPendingCharacter(
                  participantId,
                  characterId,
                )
              }
              onAssignSelected={hud.actions.dmAssignSelectedLoadedCharacter}
              onSelectActor={hud.selectionActions.selectActor}
              pendingRequests={table.pendingAssignmentRequests}
              playerParticipants={table.playerParticipants}
              selectedActorId={selection.actorParticipantId}
              selectedActorKnownCharacterId={
                table.selectedActorKnownCharacterId
              }
              t={t}
            />
          ) : null}

          {activeTab === 'table' ? (
            <GmTablePanel
              activeSceneGuidance={hud.activeSceneGuidance}
              busyReason={scene.busyReason}
              checklist={table.dmTableSetupChecklist}
              dmDisplayName={seats.dmDisplayName}
              dmParticipantId={seats.dmParticipantId}
              encounterDisabledReason={table.disabledReasons.dmEncounter}
              missingSessionReason={scene.missingSessionReason}
              onCreatePcs={hud.actions.createSampleCharacters}
              onCreateScene={hud.actions.createAndActivateScene}
              onDmDisplayNameChange={(dmDisplayName) =>
                hud.session.setSeats((current) => ({
                  ...current,
                  dmDisplayName,
                }))
              }
              onDmParticipantIdChange={(dmParticipantId) =>
                hud.session.actions.switchIdentity({
                  dmParticipantId: dmParticipantId.trim(),
                })
              }
              onEndEncounter={hud.actions.dmEndEncounter}
              onFinalizePcs={hud.actions.finalizeAndAssignCharacters}
              onJoinPlayers={hud.actions.joinSamplePlayers}
              onPlaceTokens={hud.actions.placeSampleCharacters}
              onRunScenario={hud.actions.runFreshDemoSetup}
              onSelectScenario={onSelectScenario}
              onStartEncounter={hud.actions.startEncounter}
              placeTokensDisabledReason={table.disabledReasons.placeTokens}
              scenarioId={hud.selectedDemoScenarioId}
              startEncounterDisabledReason={
                table.disabledReasons.startEncounter
              }
              t={t}
            />
          ) : null}

          {activeTab === 'diagnostics' ? (
            <>
              <RuntimeDiagnosticsPanel
                entries={hud.diagnostics.entries}
                lastResponse={hud.diagnostics.lastResponse}
                onOpenChange={hud.session.actions.setDiagnosticsOpen}
                open={runtime.diagnosticsOpen}
                sessionSnapshot={
                  runtime.session ?? { sessionId: seats.sessionId }
                }
                t={t}
              />
            </>
          ) : null}
        </GmToolRegion>
      </HudDrawer>
    </RuntimeShellFrame>
  );
}
