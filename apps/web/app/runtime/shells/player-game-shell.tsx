'use client';

/**
 * The Player's game.
 *
 * Map first, then the three things a player acts on: their own state, what they
 * can do this turn, and what they want to tell the GM. Everything else is a
 * consequence of that ordering.
 *
 * **This module must not reach diagnostics.** Not the debug ledger, not raw
 * payloads, not the outbox badge, not a command name. That is checked by a test
 * that walks this file's import graph rather than by care at the call site, so
 * it keeps holding when someone adds a panel in a hurry. The same rule is why
 * the feed here takes localized summaries and the character card is asked not
 * to render source IDs: a raw identifier on a player's screen is a correlation
 * handle for exactly what the server's projection withholds.
 *
 * Availability is presented, never decided. Every control below is enabled or
 * disabled from projected state as a courtesy; the server refuses the command
 * either way.
 */
import { useRef } from 'react';

import type { RuntimeHudModel } from '../../../lib/use-runtime-hud';
import { selectPanelPresentation } from '../../../lib/runtime-hud-layout';
import { describeStreamStatus } from '../../../lib/m1-feedback';
import { getLocalizedPlayerNextStepTitle } from '../../../lib/runtime-localization';
import { M1FeedbackLayer } from '../m1-feedback-layer';
import { M1PlayerPanel } from '../m1-player-panel';
import { LatestEventFeed } from '../hud/action-economy-feedback';
import { EncounterStatusFeedback } from '../hud/encounter-feedback';
import { Notice } from '../hud/hud-primitives';
import { HudDrawer } from '../hud/hud-drawer';
import { CharacterOnboardingPanel } from '../panels/character-onboarding-panel';
import { CharacterSummary } from '../panels/character-summary';
import { PlayerActionRail } from './player-action-rail';
import { PlayerStatusBar } from './player-status-bar';
import { RuntimeMapStage } from './runtime-map-stage';
import { RuntimeShellFrame } from './runtime-shell-frame';
import { isProjectedScene } from '../../../lib/runtime-scene-view';

export type PlayerGameShellProps = {
  hud: RuntimeHudModel;
  onTogglePanel: (panel: 'inspector' | 'tools') => void;
  panelRequest: { inspector: boolean; tools: boolean };
  prefersReducedMotion: boolean;
  viewportWidthPx: number;
};

export function PlayerGameShell({
  hud,
  onTogglePanel,
  panelRequest,
  prefersReducedMotion,
  viewportWidthPx,
}: PlayerGameShellProps) {
  const { m1, player, runtime, seats, selection, t, table } = hud;
  const inspectorOpenerRef = useRef<HTMLButtonElement | null>(null);
  const onboardingOpenerRef = useRef<HTMLButtonElement | null>(null);
  const panels = selectPanelPresentation({
    request: panelRequest,
    viewportWidthPx,
  });

  const isOwnTurn =
    table.currentTurnRailSummary?.actorKind === 'character' &&
    runtime.encounter?.participants[runtime.encounter.currentTurnIndex]
      ?.participantId === seats.playerParticipantId;
  const stream = describeStreamStatus(
    hud.session.stream.status,
    Boolean(runtime.session),
  );
  // Deliberately says what the character can see, not "your payload was
  // projected". Fog is a fact about the character standing in a dark corridor;
  // the machinery that enforces it is not the player's business.
  const sightNote =
    runtime.scene && isProjectedScene(runtime.scene)
      ? t('runtime.playerShell.sightNote')
      : null;

  return (
    <RuntimeShellFrame
      hud={hud}
      inspectorLabel={t('runtime.playerShell.details')}
      inspectorOpen={panels.inspectorOpen}
      inspectorOpenerRef={inspectorOpenerRef}
      onToggleInspector={() => onTogglePanel('inspector')}
      onToggleTools={() => onTogglePanel('tools')}
      role="player"
      seatControlsCollapsible={panels.layout === 'drawer'}
      toolsLabel={t('runtime.playerShell.character')}
      toolsOpen={panels.toolsOpen}
      toolsOpenerRef={onboardingOpenerRef}
    >
      <PlayerStatusBar
        characterName={player.character?.character.name ?? null}
        conditions={player.character?.overlay.activeConditions ?? []}
        connectionLabel={t(stream.messageKey)}
        connectionTone={
          hud.session.stream.status === 'connected'
            ? 'success'
            : hud.session.streamEnabled
              ? 'warning'
              : 'info'
        }
        displayName={seats.playerDisplayName}
        hp={
          player.character
            ? {
                current: player.character.character.hp.current,
                max: player.character.character.hp.max,
                temp: player.character.character.hp.temp,
              }
            : null
        }
        roundNumber={runtime.encounter?.roundNumber ?? null}
        sessionCode={seats.sessionId}
        t={t}
        turnNumber={
          runtime.encounter ? runtime.encounter.currentTurnIndex + 1 : null
        }
      />

      {/*
        The next step is the player's primary instruction while they are not yet
        playing - it is what turns "nothing works" into "here is why".
      */}
      <Notice
        title={getLocalizedPlayerNextStepTitle(table.playerNextStep, t)}
        tone={table.playerNextStep.tone}
      >
        {hud.activeSceneGuidance.detail}
      </Notice>

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
          actorOptions={[]}
          characterNamesByParticipant={table.mapCharacterSummaries}
          currentTurnCombatantId={null}
          currentTurnParticipantId={
            runtime.encounter?.participants[runtime.encounter.currentTurnIndex]
              ?.participantId ?? null
          }
          currentTurnSummary={table.currentTurnRailSummary}
          mode="player"
          movement={table.movementFeedbackSummary}
          onDmReposition={() => undefined}
          onMove={hud.actions.moveSelectedActor}
          onSelectActor={() => undefined}
          onSelectCell={hud.selectionActions.selectCell}
          onSelectCombatant={hud.selectionActions.selectCombatant}
          onSelectParticipant={hud.selectionActions.selectTarget}
          onSelectSceneEntity={hud.selectionActions.selectMapSceneEntity}
          onUpdateCell={hud.selectionActions.updateCell}
          ownParticipantId={seats.playerParticipantId}
          repositionDisabledReason={null}
          scene={runtime.scene}
          sceneLabel={runtime.scene?.name ?? t('common.none')}
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
          title={t('runtime.playerShell.details')}
        >
          {sightNote ? (
            <p className="mb-3 text-xs text-slate-400">{sightNote}</p>
          ) : null}
          <PlayerActionRail
            actionEconomy={table.actionEconomyFeedbackSummary}
            attackDisabledReason={table.playerAttackDisabledReason}
            isOwnTurn={Boolean(isOwnTurn)}
            onAttack={hud.actions.attackTarget}
            onSelectTarget={(value) => {
              const [kind, id] = value.split(':', 2);

              if (kind === 'combatant' && id) {
                hud.selectionActions.selectTargetCombatant(id);
                return;
              }

              if (kind === 'participant' && id) {
                hud.selectionActions.selectTarget(id);
                hud.selectionActions.selectTargetCombatant('');
              }
            }}
            onUseResource={hud.actions.runEncounterCommand}
            selectedTargetValue={table.selectedAttackTargetValue}
            t={t}
            targetFeedback={table.actionTargetFeedbackSummary}
            targetOptions={table.attackTargetOptions}
          />

          <M1FeedbackLayer
            items={m1.feedback}
            onDismiss={m1.clearFeedback}
            prefersReducedMotion={prefersReducedMotion}
            statusKey={stream.messageKey}
          />

          <M1PlayerPanel
            activeConditions={player.character?.overlay.activeConditions ?? []}
            busyRequestId={m1.busyRequestId}
            errorKey={m1.errorKey}
            intentBusy={m1.busyLabel === 'submit_player_intent'}
            onSubmitIntent={(text) => void m1.submitIntent(text)}
            onSubmitResolution={(request) => void m1.submitResolution(request)}
            participantId={hud.session.activeParticipantId}
            table={m1.table}
          />

          <CharacterSummary
            currentTurnParticipantId={
              runtime.encounter?.participants[
                runtime.encounter.currentTurnIndex
              ]?.participantId ?? null
            }
            participantId={seats.playerParticipantId}
            resource={player.character}
            title={seats.playerDisplayName}
            variant="hero"
          />

          {/*
            Round, turn and the last combat result, from the player's own
            projection. `showEncounterId` is deliberately not passed.
          */}
          <EncounterStatusFeedback
            summary={table.encounterStatusSummary}
            t={t}
          />

          <LatestEventFeed entries={hud.feedEntries} t={t} />
        </HudDrawer>
      </div>

      {/*
        Onboarding is a phase, not a permanent panel. Once the GM has assigned
        the runtime character there is nothing here to do, so it collapses out
        of the way rather than sitting under the map forever.
      */}
      {player.isCharacterAssigned ? null : (
        <HudDrawer
          asDrawer={panels.toolsAsDrawer}
          onClose={() => onTogglePanel('tools')}
          open={panels.toolsOpen}
          panel="tools"
          openerRef={onboardingOpenerRef}
          title={t('runtime.playerShell.character')}
        >
          <CharacterOnboardingPanel
            characterDraft={hud.drafts.character}
            characterDraftErrors={player.characterDraftErrors}
            createDisabledReason={player.reasons.create}
            finalizeDisabledReason={player.reasons.finalize}
            isAssigned={player.isCharacterAssigned}
            libraryEntries={hud.library.finalizedEntries}
            libraryEntriesLoading={hud.library.loading}
            libraryEntryError={hud.library.error}
            libraryEntrySubmitDisabledReason={player.reasons.submitLibraryEntry}
            onAbilityChange={hud.draftActions.updateCharacterAbility}
            onCreate={hud.actions.createPlayerCharacter}
            onFieldChange={hud.draftActions.updateCharacterField}
            onFinalize={hud.actions.finalizePlayerCharacter}
            onHpChange={hud.draftActions.updateCharacterHp}
            onLibraryEntryChange={hud.library.setSelectedEntryId}
            onRefreshLibraryEntries={hud.library.refresh}
            onSubmit={hud.actions.submitPlayerCharacterForAssignment}
            onSubmitLibraryEntry={hud.actions.submitSelectedLibraryEntry}
            onUpdate={hud.actions.updatePlayerCharacter}
            pendingCharacterId={player.pendingCharacterId}
            playerCharacter={player.character}
            selectedLibraryEntry={hud.library.selectedEntry}
            selectedLibraryEntryId={hud.library.selectedEntryId}
            submitDisabledReason={player.reasons.submit}
            updateDisabledReason={player.reasons.update}
          />
        </HudDrawer>
      )}
    </RuntimeShellFrame>
  );
}
