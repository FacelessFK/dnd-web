'use client';

/**
 * One model, assembled once, for whichever role shell is on screen.
 *
 * This is the seam the M2 Game HUD is built on. The shells below it are
 * presentational: they read this model and call its actions, and neither of
 * them owns a `fetch`, an `EventSource`, a reducer, or a second copy of a
 * server-projected value. That is what makes "the browser is never
 * authoritative" checkable by reading one file instead of nine thousand lines.
 *
 * The assembly order is a dependency order, not a preference:
 *
 *  1. the session hook owns identity, the subscription and the reducer;
 *  2. drafts and selection are the browser's own, seeded from (1);
 *  3. the pure models derive everything the shells render from (1) and (2);
 *  4. the actions close over (1)-(3) and are the only way to change anything.
 *
 * Nothing at a later step writes to an earlier one except through a command.
 */
import { useMemo, useRef } from 'react';

import { useAuth } from './auth-context';
import { useI18n } from './i18n';
import {
  defaultDm,
  defaultPlayer,
  getCurrentTurnCombatantId,
  getCurrentTurnParticipantId,
  getDemoScenarioById,
  getKnownCharacterIds,
  getPlayerParticipantIds,
  samplePlayers,
  type RuntimeMode,
} from './runtime-cockpit-helpers';
import { useM1Table, type UseM1TableResult } from './use-m1-table';
import { useRuntimeCommands } from './use-runtime-commands';
import { useRuntimeSession } from './use-runtime-session';
import { createRuntimeHudActions } from './runtime-hud-actions';
import {
  selectRuntimeFeedEntries,
  useRuntimeDiagnostics,
} from './runtime-hud-diagnostics';
import { useRuntimeDrafts } from './runtime-hud-drafts';
import { buildRuntimeEventLabels } from './runtime-event-labels';
import { useRuntimeCharacterLibrary } from './runtime-hud-library';
import { deriveRuntimePlayerModel } from './runtime-hud-player-model';
import { deriveRuntimeSceneModel } from './runtime-hud-scene-model';
import { deriveRuntimeTableModel } from './runtime-hud-table-model';
import { useRuntimeSelection } from './runtime-hud-selection';
import { getLocalizedActiveSceneGuidance } from './runtime-scene-localization';
import type { M1ResolutionTarget } from '../app/runtime/m1-gm-panel';

export function useRuntimeHud(selectedDemoScenarioId: string) {
  const { t } = useI18n();
  const { loading: authLoading, user } = useAuth();

  // The M1 table's seat comes from the session hook, and the session hook needs
  // to hand frames to the table - so the reference is filled in immediately
  // after both exist. Both callbacks below run from event handlers, never
  // during this render, so the ref is always populated by the time they fire.
  const m1Ref = useRef<UseM1TableResult | null>(null);
  const diagnostics = useRuntimeDiagnostics();
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;

  const session = useRuntimeSession({
    onIdentityReset: () => {
      m1Ref.current?.resetTable();
      diagnosticsRef.current.reset();
    },
    onStreamEvent: (event) => {
      m1Ref.current?.ingestStreamEvent(event);
      diagnosticsRef.current.push(event.type, event);
    },
  });

  const m1 = useM1Table({
    participantId: session.activeParticipantId,
    sessionId: session.seats.sessionId,
  });
  m1Ref.current = m1;

  const { seats, state: runtime } = session;
  const mode: RuntimeMode = seats.mode;
  const sessionId = seats.sessionId;
  const streamRole: 'dm' | 'player' = mode === 'dm' ? 'dm' : 'player';

  const knownCharacterIds = getKnownCharacterIds(
    runtime.session,
    runtime.charactersByParticipant,
    runtime.knownCharacterIdsByParticipant,
  );
  const playerParticipantIds = useMemo(
    () => getPlayerParticipantIds(runtime.session),
    [runtime.session],
  );

  const selection = useRuntimeSelection({
    mode,
    playerParticipantId: seats.playerParticipantId,
    playerParticipantIds,
    scene: runtime.scene,
  });
  const actingParticipantId = selection.actingParticipantId;

  const drafts = useRuntimeDrafts({
    charactersByParticipant: runtime.charactersByParticipant,
    defaultPlayerDisplayName: defaultPlayer.displayName,
    encounter: runtime.encounter,
    playerParticipantId: seats.playerParticipantId,
    scene: runtime.scene,
    sceneId: runtime.sceneId,
    selectedSceneEntityId: selection.selection.sceneEntityId,
    selectedTransitionId: selection.selection.transitionId,
  });

  const library = useRuntimeCharacterLibrary({
    authLoading,
    enabled: mode === 'player',
    ownerUserId: user?.id ?? null,
    signInRequiredMessage: t('runtime.characterLibrary.signInRequired'),
  });

  // The command context is created once, so it reads actors through a ref
  // rather than closing over this render's values. Capturing them would make a
  // command act as whichever seat was selected when the hook first mounted.
  const actorsRef = useRef({
    acting: actingParticipantId,
    dm: seats.dmParticipantId,
    player: seats.playerParticipantId,
    sessionId,
    stream: session.activeParticipantId,
    streamDisplayName: session.activeDisplayName,
    streamRole,
  });
  actorsRef.current = {
    acting: actingParticipantId,
    dm: seats.dmParticipantId,
    player: seats.playerParticipantId,
    sessionId,
    stream: session.activeParticipantId,
    streamDisplayName: session.activeDisplayName,
    streamRole,
  };

  const commands = useRuntimeCommands({
    dispatch: session.dispatch,
    getActors: () => actorsRef.current,
    getSessionId: () => actorsRef.current.sessionId,
    onSettled: (label, payload) =>
      diagnosticsRef.current.recordSettled(label, payload),
  });

  const participants =
    runtime.session?.participants ??
    fallbackParticipants({
      dmParticipantId: seats.dmParticipantId,
      knownCharacterIds,
      playerDisplayName: seats.playerDisplayName,
      playerParticipantId: seats.playerParticipantId,
    });

  // Built after the roster, because that is what bounds it: a name reaches the
  // event feed only for a seat this role's current snapshot still lists, or a
  // creature its current scene projection still contains. Anything else is
  // named generically. This is presentation only - the server has already
  // decided what may be sent - but it is what keeps a cached name from
  // outliving the projection that justified it.
  const eventLabels = useMemo(
    () =>
      buildRuntimeEventLabels({
        charactersByParticipant: runtime.charactersByParticipant,
        ownParticipantId: session.activeParticipantId,
        participants,
        scene: runtime.scene,
      }),
    [
      participants,
      runtime.charactersByParticipant,
      runtime.scene,
      session.activeParticipantId,
    ],
  );

  const sceneModel = deriveRuntimeSceneModel({
    busyLabel: runtime.pendingCommand,
    currentTurnCombatantId: getCurrentTurnCombatantId(runtime.encounter),
    drafts: drafts.drafts,
    knownScenesById: runtime.knownScenesById,
    mode,
    scene: runtime.scene,
    sceneId: runtime.sceneId,
    selection: selection.selection,
    sessionId,
    t,
  });

  const playerModel = deriveRuntimePlayerModel({
    busyReason: sceneModel.busyReason,
    characterDraft: drafts.drafts.character,
    charactersByParticipant: runtime.charactersByParticipant,
    finalizedLibraryEntries: library.finalizedEntries,
    hasAuthUser: Boolean(user),
    knownCharacterIds,
    libraryLoading: library.loading,
    missingSessionReason: sceneModel.missingSessionReason,
    playerParticipantId: seats.playerParticipantId,
    selectedLibraryEntryId: library.selectedEntryId,
    sessionId,
    sessionState: runtime.session,
    t,
  });

  const tableModel = deriveRuntimeTableModel({
    actingParticipantId,
    activeScene: runtime.activeScene,
    attackableCombatants: sceneModel.attackableCombatants,
    busyLabel: runtime.pendingCommand,
    busyReason: sceneModel.busyReason,
    charactersByParticipant: runtime.charactersByParticipant,
    currentTurnCombatantId: getCurrentTurnCombatantId(runtime.encounter),
    currentTurnParticipantId: getCurrentTurnParticipantId(runtime.encounter),
    encounter: runtime.encounter,
    entries: diagnostics.entries,
    knownCharacterIds,
    missingSessionReason: sceneModel.missingSessionReason,
    mode,
    participants,
    player: playerModel,
    playerDisplayName: seats.playerDisplayName,
    playerParticipantId: seats.playerParticipantId,
    playerParticipantIds,
    recoveryNotes: runtime.recoveryNotes,
    scene: runtime.scene,
    sceneId: runtime.sceneId,
    selection: selection.selection,
    sessionId,
    sessionState: runtime.session,
    t,
  });

  const actions = createRuntimeHudActions({
    charactersByParticipant: runtime.charactersByParticipant,
    commands,
    dispatch: session.dispatch,
    drafts: drafts.drafts,
    knownCharacterIds,
    mode,
    ownerUserId: user?.id ?? null,
    player: playerModel,
    playerDisplayName: seats.playerDisplayName,
    playerParticipantId: seats.playerParticipantId,
    scene: sceneModel,
    sceneId: runtime.sceneId,
    sceneTarget: {
      activeSceneId: runtime.sceneId,
      loadedSceneId: runtime.scene?.id ?? null,
    },
    selectRequiredMessage: t('runtime.characterLibrary.selectRequired'),
    selectedDemoScenario: getDemoScenarioById(selectedDemoScenarioId),
    selectedLibraryEntryId: library.selectedEntryId,
    selection: selection.selection,
    signInRequiredMessage: t('runtime.characterLibrary.signInRequired'),
  });

  return {
    actingParticipantId,
    actions,
    activeSceneGuidance: getLocalizedActiveSceneGuidance({
      activeSceneId:
        runtime.sceneId || runtime.session?.session.activeSceneId || null,
      mode,
      scene: runtime.scene,
      t,
    }),
    commands,
    diagnostics,
    drafts: drafts.drafts,
    draftActions: drafts.actions,
    feedEntries: selectRuntimeFeedEntries(diagnostics.entries, t, eventLabels),
    knownCharacterIds,
    library,
    m1,
    /** Seats the GM may address: those holding an assigned runtime character. */
    m1ResolutionTargets: playerParticipantIds.flatMap(
      (candidateId): M1ResolutionTarget[] => {
        const resource = runtime.charactersByParticipant[candidateId];

        return resource
          ? [
              {
                activeConditions: resource.overlay.activeConditions,
                characterId: resource.character.id,
                displayName: resource.character.name,
                participantId: candidateId,
              },
            ]
          : [];
      },
    ),
    /**
     * Whatever the *server* sent in this role's scene projection. A concealed
     * creature is already absent from a player's copy, so nothing is filtered
     * here - the list is simply shorter for them, which is the point.
     */
    m1SceneCombatants: (runtime.scene?.entities ?? []).filter(
      (entity) => entity.combatant,
    ),
    mode,
    participants,
    player: playerModel,
    playerParticipantIds,
    runtime,
    scene: sceneModel,
    seats,
    selectedDemoScenarioId,
    selection: selection.selection,
    selectionActions: selection.actions,
    session,
    t,
    table: tableModel,
  };
}

export type RuntimeHudModel = ReturnType<typeof useRuntimeHud>;

/**
 * A roster to render before any session exists.
 *
 * Purely so the setup surface is not blank on first load. Every entry is
 * `disconnected` and none of them is authoritative - the moment a real snapshot
 * arrives it replaces this wholesale.
 */
function fallbackParticipants(params: {
  dmParticipantId: string;
  knownCharacterIds: Record<string, string | undefined>;
  playerDisplayName: string;
  playerParticipantId: string;
}) {
  const {
    dmParticipantId,
    knownCharacterIds,
    playerDisplayName,
    playerParticipantId,
  } = params;

  const seat = (id: string, displayName: string, role: 'dm' | 'player') => ({
    characterId: knownCharacterIds[id] ?? null,
    connectionStatus: 'disconnected' as const,
    displayName,
    id,
    joinedAt: '',
    lastSeenAt: '',
    pendingCharacterId: null,
    role,
  });

  return [
    seat(dmParticipantId, defaultDm.displayName, 'dm'),
    ...samplePlayers.map((samplePlayer) =>
      seat(samplePlayer.participantId, samplePlayer.displayName, 'player'),
    ),
    ...(samplePlayers.some(
      (samplePlayer) => samplePlayer.participantId === playerParticipantId,
    )
      ? []
      : [
          seat(
            playerParticipantId,
            playerDisplayName || playerParticipantId,
            'player',
          ),
        ]),
  ];
}
