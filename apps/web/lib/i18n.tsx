'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const locales = ['en', 'fa'] as const;

export type Locale = (typeof locales)[number];

const localeStorageKey = 'dnd-web.locale';
const defaultLocale: Locale = 'fa';

const messages = {
  en: {
    'app.brand': 'DND Web',
    'common.characters': 'Characters',
    'common.dashboard': 'Dashboard',
    'common.language': 'Language',
    'common.ready': 'Ready',
    'common.server': 'Server',
    'common.switchToEnglish': 'English',
    'common.switchToPersian': 'فارسی',
    'home.card.characters.description':
      'Browse saved heroes and export sheets.',
    'home.card.characters.title': 'Character Library',
    'home.card.runtime.description':
      'Create sessions, recover state, and drive encounters.',
    'home.card.runtime.title': 'Runtime War Table',
    'home.card.server.description': 'Check the local backend directly.',
    'home.card.server.title': 'Server Status',
    'home.eyebrow': 'Browser runtime and character tools',
    'home.intro':
      'Run sessions, manage characters, and inspect the live tabletop from one practical workspace. Pick the surface you need and keep moving.',
    'home.title': 'D&D DM-Driven Platform',
    'nav.campaigns': 'Campaigns',
    'nav.characterLibrary': 'Character Library',
    'nav.characterWorkspace': 'Character workspace',
    'nav.compendium': 'Compendium',
    'nav.journal': 'Journal',
    'nav.runtimeTable': 'Runtime Table',
    'nav.soon': 'Soon',
    'page.characterBuilder.title': 'Character Builder',
    'page.characterLibrary.title': 'Character Library',
    'runtime.assignmentRequests.ac': 'AC',
    'runtime.assignmentRequests.build': 'Build',
    'runtime.assignmentRequests.character': 'Character',
    'runtime.assignmentRequests.description':
      "Pending requests are server-created runtime copies from player submissions. Assigning one makes it the participant's active runtime character; source library entries stay reusable.",
    'runtime.assignmentRequests.emptyDetail':
      'Players can submit finalized runtime drafts or saved Character Library entries from Player mode.',
    'runtime.assignmentRequests.emptyTitle': 'No pending character requests',
    'runtime.assignmentRequests.hp': 'HP',
    'runtime.assignmentRequests.needsAssignment': 'Runtime copy pending',
    'runtime.assignmentRequests.previewUnavailableDetail':
      'Recover table state or read the pending character to show the full request preview.',
    'runtime.assignmentRequests.previewUnavailableTitle':
      'Character preview unavailable',
    'runtime.assignmentRequests.assigned': 'Active runtime character',
    'runtime.assignmentRequests.replacementPending': 'Replacement copy pending',
    'runtime.assignmentRequests.runtimeCopy': 'Runtime copy',
    'runtime.assignmentRequests.sourceLibraryEntry': 'Source library entry',
    'runtime.assignmentRequests.speed': 'Speed',
    'runtime.assignmentRequests.submit': 'Assign Runtime Copy',
    'runtime.assignmentRequests.title': 'Assignment Requests',
    'runtime.board.badge.move': 'Movement target',
    'runtime.board.badge.selected': 'Selected token',
    'runtime.board.badge.target': 'Attack target',
    'runtime.board.badge.turn': 'Current turn',
    'runtime.board.camera': 'Camera',
    'runtime.board.gridLabel':
      'Tactical grid. Use arrow keys to move the selected cell, Home for the first cell, and End for the last cell.',
    'runtime.board.panDown': 'Pan down',
    'runtime.board.panLeft': 'Pan left',
    'runtime.board.panRight': 'Pan right',
    'runtime.board.panUp': 'Pan up',
    'runtime.board.resetView': 'Reset view',
    'runtime.board.viewportSummary': '{zoom} zoom · pan {panX}, {panY}',
    'runtime.board.zoomIn': 'Zoom in',
    'runtime.board.zoomOut': 'Zoom out',
    'runtime.characterLibrary.blocker.alreadyAssigned':
      'This participant already has an assigned character.',
    'runtime.characterLibrary.blocker.alreadySubmitted':
      'A character is already waiting for DM assignment.',
    'runtime.characterLibrary.blocker.busy':
      'Wait for the current runtime task to finish.',
    'runtime.characterLibrary.blocker.missingAuth':
      'Sign in before loading saved Character Library entries.',
    'runtime.characterLibrary.blocker.missingSelection':
      'Choose a finalized saved character first.',
    'runtime.characterLibrary.blocker.missingSession':
      'Create, paste, or recover a session first.',
    'runtime.characterLibrary.blocker.noFinalizedEntries':
      'No finalized saved characters are available.',
    'runtime.characterLibrary.blocker.notJoined':
      'Join or recover this session as the player first.',
    'runtime.characterLibrary.description':
      'Submit a finalized saved character into this live session. The server creates a separate runtime copy; live HP, movement, conditions, and DM overrides do not mutate the saved entry.',
    'runtime.characterLibrary.emptyDetail':
      'Finalize a character in the Character Library, then refresh this list.',
    'runtime.characterLibrary.emptyTitle': 'No finalized saved characters',
    'runtime.characterLibrary.entryClass': 'Class / level',
    'runtime.characterLibrary.entryId': 'Library entry',
    'runtime.characterLibrary.entryStatus': 'Library status',
    'runtime.characterLibrary.errorTitle': 'Character Library unavailable',
    'runtime.characterLibrary.loading': 'Loading library',
    'runtime.characterLibrary.optionLabel':
      '{name} - {className} level {level}',
    'runtime.characterLibrary.refresh': 'Refresh Library',
    'runtime.characterLibrary.selectLabel': 'Saved character',
    'runtime.characterLibrary.selectRequired':
      'Choose a finalized saved character first.',
    'runtime.characterLibrary.selectedDetail':
      'Submitting {name} creates a separate runtime copy for this session. The saved library entry remains reusable.',
    'runtime.characterLibrary.selectedTitle': 'Saved entry selected',
    'runtime.characterLibrary.signInRequired':
      'Sign in before loading saved Character Library entries.',
    'runtime.characterLibrary.status.assigned': 'Active runtime character',
    'runtime.characterLibrary.status.none': 'No character yet',
    'runtime.characterLibrary.status.ready': 'Ready to submit',
    'runtime.characterLibrary.status.submitted': 'Pending DM assignment',
    'runtime.characterLibrary.submit': 'Submit Saved Character',
    'runtime.characterLibrary.submitReadyDetail':
      'This finalized character is ready. Submit it so the server records a runtime copy for DM assignment.',
    'runtime.characterLibrary.submitReadyTitle': 'Ready for runtime copy',
    'runtime.characterLibrary.title': 'Saved Character Library',
    'runtime.characterLibrary.waitingDetail':
      'Runtime copy {characterId} is waiting in authoritative session state. The DM must assign it before it becomes your active table character.',
    'runtime.characterLibrary.waitingTitle':
      'Runtime copy pending DM assignment',
    'runtime.activeScene.buildDetail':
      'Create or activate a scene before placing tokens, entities, or starting an encounter.',
    'runtime.activeScene.buildTitle': 'Build a scene',
    'runtime.activeScene.idKnownDetail':
      'The session has an active scene ID, but the full scene document has not been recovered yet.',
    'runtime.activeScene.idKnownTitle': 'Scene ID known',
    'runtime.activeScene.loadedDetail':
      '{sceneName} is loaded with a {width}x{height} grid and {entityCount} scene entities.',
    'runtime.activeScene.loadedTitle': 'Scene loaded',
    'runtime.activeScene.noneDetail':
      'The DM has not activated a scene yet, or this browser needs to recover read models.',
    'runtime.activeScene.noneTitle': 'No active scene',
    'runtime.demoSetup.description':
      'Prepares the first playable Training Room pass from existing server commands and sample data.',
    'runtime.demoSetup.encounter': 'Encounter',
    'runtime.demoSetup.encounterValue': 'Manual start after setup is ready',
    'runtime.demoSetup.eyebrow': 'DM playtest path',
    'runtime.demoSetup.flow': 'Flow',
    'runtime.demoSetup.flowValue':
      'Create table, seat players, assign PCs, activate scene',
    'runtime.demoSetup.guardrail': 'Authority',
    'runtime.demoSetup.guardrailValue':
      'DM starts play; server validates every command',
    'runtime.demoSetup.roster': 'Roster',
    'runtime.demoSetup.runTrainingRoom': 'Run Training Room Skirmish',
    'runtime.demoSetup.scenarioLabel': 'Demo scenario',
    'runtime.demoSetup.scene': 'Scene',
    'runtime.demoSetup.setup': 'Prepared state',
    'runtime.demoSetup.setupValue':
      'Session, players, PCs, scene, token placement',
    'runtime.demoSetup.title': 'Training Room Setup',
    'runtime.demoSetup.action.assignPcs': 'Assign PCs',
    'runtime.demoSetup.action.createPcs': 'Create PCs',
    'runtime.demoSetup.action.createScene': 'Create Scene',
    'runtime.demoSetup.action.joinPlayers': 'Join Players',
    'runtime.demoSetup.action.placeTokens': 'Place Tokens',
    'runtime.demoSetup.action.startEncounter': 'Start Encounter',
    'runtime.debug.description':
      'Raw protocol payloads stay here for debugging; the table view above is the primary surface.',
    'runtime.debug.emptyDetail':
      'Subscribe to SSE or run commands to populate the ledger.',
    'runtime.debug.emptyTitle': 'No events yet',
    'runtime.debug.eyebrow': 'Dev trace',
    'runtime.debug.summary':
      'Last response, session snapshot, and raw event log',
    'runtime.debug.title': 'Debug Ledger',
    'runtime.disabled.busy': 'Waiting on {label}.',
    'runtime.disabled.createOrRecoverActiveScene':
      'Create or recover an active scene first.',
    'runtime.disabled.createActivateRecoverScene':
      'Create, activate, or recover a scene first.',
    'runtime.disabled.combatantDefeated':
      'The selected monster/NPC is defeated and cannot act.',
    'runtime.disabled.combatantTurn':
      'The selected combatant must be the current turn actor.',
    'runtime.disabled.currentTurnCombatant':
      'Current turn is a monster/NPC; use the DM combatant attack control.',
    'runtime.disabled.dmOnlyControl': 'Switch to DM mode for this control.',
    'runtime.disabled.dmOnlyCombatant':
      'Switch to DM mode for monster/NPC controls.',
    'runtime.disabled.dmOnlyScene': 'Switch to DM mode for scene building.',
    'runtime.disabled.invalidActor':
      'Choose a joined player participant as the acting character.',
    'runtime.disabled.invalidTarget':
      'Choose a joined player participant or active monster/NPC target.',
    'runtime.disabled.invalidTargetDifferent':
      'Choose a different target participant.',
    'runtime.disabled.loadOrAssignCharacter':
      'Load or assign this character first.',
    'runtime.disabled.missingActiveScene':
      'Create/recover an active scene before moving or starting combat.',
    'runtime.disabled.missingEncounter': 'Start or recover an encounter first.',
    'runtime.disabled.missingPlayerIdentity':
      'Enter a player participant ID and display name.',
    'runtime.disabled.missingSession':
      'Create, paste, or recover a session first.',
    'runtime.disabled.placeCharacter':
      'Place at least one character in the active scene first.',
    'runtime.disabled.playerTarget': 'Choose a player character target.',
    'runtime.disabled.playerJoinMode':
      'Switch to Player mode to join as the configured player.',
    'runtime.disabled.recoverCharacter':
      'Load or recover a character for this participant first.',
    'runtime.disabled.selectCombatant':
      'Create or select a monster/NPC combatant first.',
    'runtime.disabled.selectedAlreadyAssigned':
      'Selected participant already has this character assigned.',
    'runtime.eyebrow': 'Authoritative table surface',
    'runtime.encounterStatus.active': 'Active',
    'runtime.encounterStatus.ended': 'Ended',
    'runtime.encounterStatus.hit': 'hit',
    'runtime.encounterStatus.id': 'ID {id}',
    'runtime.encounterStatus.latestCombat':
      '{attacker} {result} {target} for {damage} damage.',
    'runtime.encounterStatus.latestEncounter':
      '{reason} - round {round}, turn {turn}',
    'runtime.encounterStatus.miss': 'missed',
    'runtime.encounterStatus.nextActor': 'Next {actor}',
    'runtime.encounterStatus.noCombatResult': 'No combat result yet.',
    'runtime.encounterStatus.noCurrentActor': 'No active encounter loaded',
    'runtime.encounterStatus.noEncounterUpdate':
      'No encounter update received yet.',
    'runtime.encounterStatus.noProgress': 'No round progress',
    'runtime.encounterStatus.notLoaded': 'No encounter',
    'runtime.encounterStatus.progress':
      'Round {round} - turn {turn}/{turnCount}',
    'runtime.encounterStatus.title': 'Encounter status',
    'runtime.eventFeed.description':
      'Readable summaries of live SSE updates. This is still not replay.',
    'runtime.eventFeed.emptyDetail':
      'Subscribe to the session stream, then move, attack, or recover to populate this feed.',
    'runtime.eventFeed.emptyTitle': 'No live events summarized',
    'runtime.eventFeed.eyebrow': 'Live omens',
    'runtime.eventFeed.title': 'Combat & Event Feed',
    'runtime.grid.actingToken': 'Acting token',
    'runtime.grid.description':
      'Scene {scene}. Click a cell or type coordinates; movement still goes through server commands.',
    'runtime.grid.dmEyebrow': 'DM war table',
    'runtime.grid.dmReposition': 'DM Reposition',
    'runtime.grid.moveActor': 'Move Actor',
    'runtime.grid.moveToken': 'Move Token',
    'runtime.grid.playerEyebrow': 'Player view',
    'runtime.grid.title': 'Tactical Grid',
    'runtime.playerReadiness.actions': '{count} action options ready',
    'runtime.playerReadiness.attack': 'Attack {state}',
    'runtime.playerReadiness.blocked': 'Blocked',
    'runtime.playerReadiness.currentActor': 'Current actor',
    'runtime.playerReadiness.done': 'Done',
    'runtime.playerReadiness.eyebrow': 'Player readiness',
    'runtime.playerReadiness.move': 'Move {state}',
    'runtime.playerReadiness.next': 'Next',
    'runtime.playerReadiness.progress': '{completed}/{total} ready',
    'runtime.playerReadiness.ready': 'ready',
    'runtime.playerReadiness.readyCount': '{count} next steps',
    'runtime.playerReadiness.selectedTarget': 'Selected target',
    'runtime.playerReadiness.title': 'Readiness summary',
    'runtime.playerReadiness.tokenPosition': 'Token',
    'runtime.playerReadiness.waiting': 'Waiting',
    'runtime.playerReadiness.waitingCount': '{count} waiting',
    'runtime.recovery.empty': 'No session',
    'runtime.recovery.eyebrow': 'Recovery',
    'runtime.recovery.loaded': 'Loaded',
    'runtime.recovery.missing': 'Missing',
    'runtime.recovery.notes': 'Recovery notes',
    'runtime.recovery.optional': 'Optional',
    'runtime.recovery.partial': 'Partial',
    'runtime.recovery.progress': '{loaded}/{total} loaded',
    'runtime.recovery.recovered': 'Recovered',
    'runtime.recovery.title': 'Recovery status',
    'runtime.roleNotice':
      'Acting as {name} ({participantId}). Local Reset clears only this browser; backend state remains untouched.',
    'runtime.session.create': 'Create Session',
    'runtime.session.disconnectSse': 'Disconnect SSE',
    'runtime.session.dmDisplayName': 'DM display name',
    'runtime.session.dmParticipantId': 'DM participant ID',
    'runtime.session.join': 'Join Session',
    'runtime.session.localReset': 'Local Reset',
    'runtime.session.playerDisplayName': 'Player display name',
    'runtime.session.playerParticipantId': 'Player participant ID',
    'runtime.session.recover': 'Recover',
    'runtime.session.sessionId': 'Session ID',
    'runtime.session.sessionIdPlaceholder':
      'Paste an existing session ID to recover',
    'runtime.session.subscribeSse': 'Subscribe SSE',
    'runtime.statePanel.activeScene': 'Active scene',
    'runtime.statePanel.currentTurn': 'Current turn',
    'runtime.statePanel.description':
      'Current IDs and read models loaded into this browser.',
    'runtime.statePanel.encounter': 'Encounter',
    'runtime.statePanel.eyebrow': 'Table status',
    'runtime.statePanel.sceneName': 'Scene name',
    'runtime.statePanel.session': 'Session',
    'runtime.statePanel.title': 'State',
    'runtime.statusOverview.description':
      'Derived from current read models only; commands still validate on the server.',
    'runtime.statusOverview.dmReadiness': 'DM setup',
    'runtime.statusOverview.eyebrow': 'Runtime status',
    'runtime.statusOverview.nextAction': 'Next visible action',
    'runtime.statusOverview.nextAction.dmDetail':
      'Waiting for the DM to take the next server-authoritative table action.',
    'runtime.statusOverview.nextAction.ownerDetail': 'Owner',
    'runtime.statusOverview.nextAction.playerDetail':
      'You have the next visible player action available.',
    'runtime.statusOverview.nextAction.tableDetail':
      'Waiting on table prerequisites or currently loaded read models.',
    'runtime.statusOverview.playerReadiness': 'Player readiness',
    'runtime.statusOverview.readiness': 'Readiness',
    'runtime.statusOverview.readinessProgress': '{completed}/{total} complete',
    'runtime.statusOverview.recovery': 'Read models',
    'runtime.statusOverview.recoveryModels': '{loaded}/{total} loaded',
    'runtime.statusOverview.title': 'Table flow',
    'runtime.statusOverview.turn': 'Turn',
    'runtime.statusOverview.turnActive': '{actor}',
    'runtime.statusOverview.turnInactive': 'No active actor',
    'runtime.statusOverview.waiting.dm': 'DM action',
    'runtime.statusOverview.waiting.player': 'Player action',
    'runtime.statusOverview.waiting.table': 'Table wait',
    'runtime.statusOverview.waitingProgress': '{count} waiting',
    'runtime.roster.assignment': 'Assignment',
    'runtime.roster.assignment.assigned':
      'Assigned runtime character {characterId}',
    'runtime.roster.assignment.needsCharacter': 'Needs runtime character',
    'runtime.roster.assignment.pendingAssignment':
      'Runtime copy {characterId} pending DM assignment',
    'runtime.roster.connection.connected': 'Connected',
    'runtime.roster.connection.disconnected': 'Disconnected',
    'runtime.roster.currentTurnId': 'Turn: {participantId}',
    'runtime.roster.currentTurnPlayer': 'Turn: {name}',
    'runtime.roster.description':
      'Per-player setup status from session, active-scene, and encounter read models.',
    'runtime.roster.emptyDetail':
      'Join players to populate the readiness roster.',
    'runtime.roster.emptyTitle': 'No players seated',
    'runtime.roster.encounter': 'Encounter',
    'runtime.roster.encounter.currentTurn': 'Current turn',
    'runtime.roster.encounter.noEncounter': 'No active encounter',
    'runtime.roster.encounter.notInEncounter': 'Not in turn order',
    'runtime.roster.encounter.waitingTurn': 'Waiting turn',
    'runtime.roster.eyebrow': 'Readiness roster',
    'runtime.roster.placement': 'Placement',
    'runtime.roster.placement.needsAssignment':
      'Assignment required before placement',
    'runtime.roster.placement.needsPlacement': 'Needs token placement',
    'runtime.roster.placement.placed': 'Placed',
    'runtime.roster.placement.placedAt': 'Placed at {x},{y}',
    'runtime.roster.placement.waitingScene': 'Waiting for active scene',
    'runtime.roster.readySummary': '{ready}/{total} board-ready',
    'runtime.roster.setup.needsCharacter': 'Needs character',
    'runtime.roster.setup.needsPlacement': 'Needs placement',
    'runtime.roster.setup.pendingAssignment': 'Pending DM',
    'runtime.roster.setup.ready': 'Board-ready',
    'runtime.roster.setup.waitingScene': 'Waiting scene',
    'runtime.roster.title': 'Player roster',
    'runtime.rosterPanel.description.dm':
      'All joined player characters at the table.',
    'runtime.rosterPanel.description.player':
      'Your loaded character resource from server reads/events.',
    'runtime.rosterPanel.emptyDetail':
      'Join players or run a named demo scenario.',
    'runtime.rosterPanel.emptyTitle': 'No players loaded',
    'runtime.rosterPanel.eyebrow': 'Roster',
    'runtime.rosterPanel.title': 'Characters',
    'runtime.assignmentHelper.assigned': 'Assigned',
    'runtime.assignmentHelper.knownCharacter': 'Known character',
    'runtime.assignmentHelper.pending': 'Pending',
    'runtime.assignmentHelper.player': 'Player',
    'runtime.assignmentHelper.submit': 'Assign Loaded Character',
    'runtime.assignmentHelper.title': 'Assignment helper',
    'runtime.tableSetup.eyebrow': 'DM readiness',
    'runtime.tableSetup.item.characters.blocked': 'Assign characters',
    'runtime.tableSetup.item.characters.done': 'Characters assigned',
    'runtime.tableSetup.item.characters.ready': 'Assign characters',
    'runtime.tableSetup.item.encounter.blocked': 'Start encounter',
    'runtime.tableSetup.item.encounter.done': 'Encounter active',
    'runtime.tableSetup.item.encounter.ready': 'Start encounter',
    'runtime.tableSetup.item.placement.blocked': 'Place tokens',
    'runtime.tableSetup.item.placement.done': 'Tokens placed',
    'runtime.tableSetup.item.placement.ready': 'Place tokens',
    'runtime.tableSetup.item.players.blocked': 'Seat players',
    'runtime.tableSetup.item.players.done': 'Players seated',
    'runtime.tableSetup.item.players.ready': 'Seat players',
    'runtime.tableSetup.item.scene.blocked': 'Activate scene',
    'runtime.tableSetup.item.scene.done': 'Scene active',
    'runtime.tableSetup.item.scene.ready': 'Activate scene',
    'runtime.tableSetup.item.session.blocked': 'Create session',
    'runtime.tableSetup.item.session.done': 'Session loaded',
    'runtime.tableSetup.item.session.ready': 'Create session',
    'runtime.tableSetup.detail.characters.blocked':
      'Players need to join before character assignment matters.',
    'runtime.tableSetup.detail.characters.done':
      'Assigned characters are ready for the table.',
    'runtime.tableSetup.detail.characters.ready':
      'Assign at least one finalized player character.',
    'runtime.tableSetup.detail.encounter.blocked':
      'Place at least one token before encounter start.',
    'runtime.tableSetup.detail.encounter.done':
      'An encounter is active and turn controls are available.',
    'runtime.tableSetup.detail.encounter.ready':
      'Start an encounter when the table is ready for initiative.',
    'runtime.tableSetup.detail.placement.blocked':
      'Characters need assignments and an active scene first.',
    'runtime.tableSetup.detail.placement.done':
      'Tokens are placed in the active scene.',
    'runtime.tableSetup.detail.placement.ready':
      'Place assigned player characters into the active scene.',
    'runtime.tableSetup.detail.players.blocked':
      'Session state is required before players can join.',
    'runtime.tableSetup.detail.players.done':
      'Players are seated at the table.',
    'runtime.tableSetup.detail.players.ready':
      'Join at least one player before assigning characters.',
    'runtime.tableSetup.detail.scene.blocked':
      'Create and activate a scene after the session exists.',
    'runtime.tableSetup.detail.scene.done':
      'An active scene is loaded for the table.',
    'runtime.tableSetup.detail.scene.ready':
      'Create or recover an active scene for the table.',
    'runtime.tableSetup.detail.session.blocked':
      'Create or recover a session before the table can load.',
    'runtime.tableSetup.detail.session.done': 'Session state is loaded.',
    'runtime.tableSetup.detail.session.ready':
      'Create or recover a session before the table can load.',
    'runtime.tableSetup.readyForPlay': 'The table is ready for play.',
    'runtime.tableSetup.status.blocked': 'Wait',
    'runtime.tableSetup.status.done': 'Done',
    'runtime.tableSetup.status.ready': 'Next',
    'runtime.tableSetup.title': 'Table Setup',
    'runtime.actionEconomy.action': 'Action',
    'runtime.actionEconomy.available': 'available',
    'runtime.actionEconomy.blocked': 'blocked',
    'runtime.actionEconomy.bonusAction': 'Bonus',
    'runtime.actionEconomy.latest': '{reason} - round {round}, turn {turn}',
    'runtime.actionEconomy.noEncounter': 'No active turn',
    'runtime.actionEconomy.noLatest': 'No action economy update yet.',
    'runtime.actionEconomy.reaction': 'Reaction',
    'runtime.actionEconomy.ready': 'Ready',
    'runtime.actionEconomy.resource': '{name}: {state}',
    'runtime.actionEconomy.spent': 'All spent',
    'runtime.actionEconomy.title': 'Action economy',
    'runtime.actionEconomy.unavailable': 'Action economy unavailable.',
    'runtime.actionEconomy.used': 'used',
    'runtime.actionFeedback.ac': 'AC {armorClass}',
    'runtime.actionFeedback.acUnknown': 'AC unknown',
    'runtime.actionFeedback.attackBlocked': 'Blocked',
    'runtime.actionFeedback.attackReady': 'Ready',
    'runtime.actionFeedback.damage': '{damage} damage',
    'runtime.actionFeedback.hit': 'Hit',
    'runtime.actionFeedback.hp': 'HP {current}/{max} +{temp}',
    'runtime.actionFeedback.hpUnknown': 'HP unknown',
    'runtime.actionFeedback.miss': 'Miss',
    'runtime.actionFeedback.noResult': 'No attack result yet.',
    'runtime.actionFeedback.noTarget': 'No target',
    'runtime.actionFeedback.noTargetDetail':
      'Choose a target to preview attack readiness.',
    'runtime.actionFeedback.resultSummary':
      '{attacker} attacked {target}; HP {previous} -> {current}.',
    'runtime.actionFeedback.resultTitle': 'Latest result',
    'runtime.actionFeedback.roll': 'Roll {roll}',
    'runtime.actionFeedback.status': 'Status {status}',
    'runtime.actionFeedback.targetKind.character': 'Character',
    'runtime.actionFeedback.targetKind.combatant': 'Monster/NPC',
    'runtime.actionFeedback.targetTitle': 'Selected target',
    'runtime.mode.dm': 'DM Mode',
    'runtime.mode.player': 'Player Mode',
    'runtime.movementFeedback.after':
      'After move {after} ft used, {remaining} ft left',
    'runtime.movementFeedback.afterUnknown': 'After move unknown',
    'runtime.movementFeedback.blocked': 'Move blocked',
    'runtime.movementFeedback.budget':
      '{remaining} ft left of {speed} ft ({used} used)',
    'runtime.movementFeedback.current': 'From {cell}',
    'runtime.movementFeedback.destination': 'To {cell}',
    'runtime.movementFeedback.distance': '{distance} ft',
    'runtime.movementFeedback.distanceUnknown': 'Distance unknown',
    'runtime.movementFeedback.explorationBudget': 'Exploration move',
    'runtime.movementFeedback.noPosition': 'not placed',
    'runtime.movementFeedback.ready': 'Move ready',
    'runtime.movementFeedback.title': 'Movement preview',
    'runtime.nav.characters': 'Characters',
    'runtime.outbox.refresh': 'Check Outbox',
    'runtime.outbox.status.backlog': 'Outbox {count}',
    'runtime.outbox.status.clear': 'Outbox clear',
    'runtime.outbox.status.error': 'Outbox unavailable',
    'runtime.outbox.status.loading': 'Outbox ...',
    'runtime.outbox.status.off': 'Outbox off',
    'runtime.outbox.status.unknown': 'Outbox -',
    'runtime.status.busy': 'Busy: {label}',
    'runtime.status.stream': 'Stream {status}',
    'runtime.status.streamIdle': 'Stream idle',
    'runtime.summary':
      'A role-aware browser surface for the existing backend. The server still owns truth; SSE is live-only, and recovery rebuilds state from read models.',
    'runtime.title': 'Runtime War Table',
    'runtime.turnRail.action': 'Action {state}',
    'runtime.turnRail.actorKind.character': 'Character',
    'runtime.turnRail.actorKind.combatant': 'Monster/NPC',
    'runtime.turnRail.available': 'available',
    'runtime.turnRail.bonus': 'Bonus {state}',
    'runtime.turnRail.movement': 'Movement',
    'runtime.turnRail.movementRemaining':
      '{remaining} ft left of {speed} ft ({used} used)',
    'runtime.turnRail.movementUnknown': '{used} ft used',
    'runtime.turnRail.reaction': 'Reaction {state}',
    'runtime.turnRail.roundInitiative':
      'Round {round} · initiative {initiative}',
    'runtime.turnRail.title': 'Current turn',
    'runtime.turnRail.used': 'used',
    'shell.builderMvp.body':
      'Persisted character library entries with DB-mode development ownership. Production account security is intentionally pending.',
    'shell.builderMvp.title': 'Builder MVP',
    'shell.characterTools': 'Character tools',
    'shell.demoProfile': 'Demo Profile',
  },
  fa: {
    'app.brand': 'DND Web',
    'common.characters': 'کاراکترها',
    'common.dashboard': 'داشبورد',
    'common.language': 'زبان',
    'common.ready': 'آماده',
    'common.server': 'سرور',
    'common.switchToEnglish': 'English',
    'common.switchToPersian': 'فارسی',
    'home.card.characters.description':
      'قهرمان‌های ذخیره‌شده را ببینید و شیت خروجی بگیرید.',
    'home.card.characters.title': 'کتابخانه کاراکترها',
    'home.card.runtime.description':
      'جلسه بسازید، وضعیت را بازیابی کنید و برخوردها را از میز بازی پیش ببرید.',
    'home.card.runtime.title': 'میز نبرد زنده',
    'home.card.server.description': 'بک‌اند محلی را مستقیم بررسی کنید.',
    'home.card.server.title': 'وضعیت سرور',
    'home.eyebrow': 'میز زنده مرورگر و ابزارهای کاراکتر',
    'home.intro':
      'جلسه‌ها را اجرا کنید، کاراکترها را مدیریت کنید و میز بازی زنده را از یک محیط کاری کاربردی ببینید. بخش مورد نیازتان را انتخاب کنید و ادامه دهید.',
    'home.title': 'پلتفرم D&D با هدایت DM',
    'nav.campaigns': 'کمپین‌ها',
    'nav.characterLibrary': 'کتابخانه کاراکترها',
    'nav.characterWorkspace': 'محیط کاراکتر',
    'nav.compendium': 'دانش‌نامه',
    'nav.journal': 'ژورنال',
    'nav.runtimeTable': 'میز زنده',
    'nav.soon': 'به‌زودی',
    'page.characterBuilder.title': 'سازنده کاراکتر',
    'page.characterLibrary.title': 'کتابخانه کاراکترها',
    'runtime.assignmentRequests.ac': 'AC',
    'runtime.assignmentRequests.build': 'ساختار',
    'runtime.assignmentRequests.character': 'کاراکتر',
    'runtime.assignmentRequests.description':
      'درخواست‌های pending نسخه‌های runtime هستند که سرور از submission بازیکن ساخته است. Assign کردن یکی از آن‌ها، کاراکتر runtime فعال شرکت‌کننده را مشخص می‌کند؛ ورودی‌های کتابخانه همچنان قابل استفاده مجدد می‌مانند.',
    'runtime.assignmentRequests.emptyDetail':
      'بازیکن‌ها می‌توانند از حالت Player، draft نهایی‌شده runtime یا ورودی ذخیره‌شده کتابخانه کاراکتر را submit کنند.',
    'runtime.assignmentRequests.emptyTitle': 'درخواست کاراکتر pending نیست',
    'runtime.assignmentRequests.hp': 'HP',
    'runtime.assignmentRequests.needsAssignment': 'نسخه runtime pending',
    'runtime.assignmentRequests.previewUnavailableDetail':
      'برای نمایش preview کامل درخواست، وضعیت میز را recover کنید یا کاراکتر pending را دوباره بخوانید.',
    'runtime.assignmentRequests.previewUnavailableTitle':
      'Preview کاراکتر در دسترس نیست',
    'runtime.assignmentRequests.assigned': 'کاراکتر runtime فعال',
    'runtime.assignmentRequests.replacementPending': 'نسخه جایگزین pending',
    'runtime.assignmentRequests.runtimeCopy': 'نسخه runtime',
    'runtime.assignmentRequests.sourceLibraryEntry': 'ورودی کتابخانه منبع',
    'runtime.assignmentRequests.speed': 'سرعت',
    'runtime.assignmentRequests.submit': 'Assign نسخه runtime',
    'runtime.assignmentRequests.title': 'درخواست‌های assignment',
    'runtime.board.badge.move': 'مقصد حرکت',
    'runtime.board.badge.selected': 'توکن انتخاب‌شده',
    'runtime.board.badge.target': 'هدف حمله',
    'runtime.board.badge.turn': 'نوبت فعلی',
    'runtime.board.camera': 'دوربین',
    'runtime.board.gridLabel':
      'گرید تاکتیکی. با کلیدهای جهت‌دار سلول انتخاب‌شده را حرکت دهید، Home برای اولین سلول و End برای آخرین سلول.',
    'runtime.board.panDown': 'حرکت دوربین به پایین',
    'runtime.board.panLeft': 'حرکت دوربین به چپ',
    'runtime.board.panRight': 'حرکت دوربین به راست',
    'runtime.board.panUp': 'حرکت دوربین به بالا',
    'runtime.board.resetView': 'بازنشانی نما',
    'runtime.board.viewportSummary': 'زوم {zoom} · جابه‌جایی {panX}, {panY}',
    'runtime.board.zoomIn': 'زوم بیشتر',
    'runtime.board.zoomOut': 'زوم کمتر',
    'runtime.characterLibrary.blocker.alreadyAssigned':
      'این شرکت‌کننده از قبل کاراکتر assign شده دارد.',
    'runtime.characterLibrary.blocker.alreadySubmitted':
      'یک کاراکتر همین حالا منتظر assign شدن توسط DM است.',
    'runtime.characterLibrary.blocker.busy':
      'صبر کنید کار فعلی میز زنده تمام شود.',
    'runtime.characterLibrary.blocker.missingAuth':
      'برای بارگذاری کاراکترهای ذخیره‌شده وارد شوید.',
    'runtime.characterLibrary.blocker.missingSelection':
      'اول یک کاراکتر ذخیره‌شده و نهایی‌شده انتخاب کنید.',
    'runtime.characterLibrary.blocker.missingSession':
      'اول یک session بسازید، وارد کنید، یا بازیابی کنید.',
    'runtime.characterLibrary.blocker.noFinalizedEntries':
      'کاراکتر ذخیره‌شده و نهایی‌شده‌ای در دسترس نیست.',
    'runtime.characterLibrary.blocker.notJoined':
      'اول به عنوان این بازیکن وارد session شوید یا آن را بازیابی کنید.',
    'runtime.characterLibrary.description':
      'یک کاراکتر ذخیره‌شده و نهایی‌شده را وارد این session زنده کنید. سرور یک نسخه runtime جدا می‌سازد؛ HP، حرکت، conditionها و overrideهای DM ورودی ذخیره‌شده را تغییر نمی‌دهند.',
    'runtime.characterLibrary.emptyDetail':
      'یک کاراکتر را در کتابخانه نهایی کنید و بعد این فهرست را refresh کنید.',
    'runtime.characterLibrary.emptyTitle':
      'کاراکتر ذخیره‌شده و نهایی‌شده‌ای نیست',
    'runtime.characterLibrary.entryClass': 'کلاس / سطح',
    'runtime.characterLibrary.entryId': 'ورودی کتابخانه',
    'runtime.characterLibrary.entryStatus': 'وضعیت کتابخانه',
    'runtime.characterLibrary.errorTitle': 'کتابخانه کاراکتر در دسترس نیست',
    'runtime.characterLibrary.loading': 'در حال بارگذاری کتابخانه',
    'runtime.characterLibrary.optionLabel': '{name} - {className} سطح {level}',
    'runtime.characterLibrary.refresh': 'Refresh کتابخانه',
    'runtime.characterLibrary.selectLabel': 'کاراکتر ذخیره‌شده',
    'runtime.characterLibrary.selectRequired':
      'اول یک کاراکتر ذخیره‌شده و نهایی‌شده انتخاب کنید.',
    'runtime.characterLibrary.selectedDetail':
      'Submit کردن {name} یک نسخه runtime جدا برای این session می‌سازد. ورودی ذخیره‌شده کتابخانه همچنان قابل استفاده مجدد می‌ماند.',
    'runtime.characterLibrary.selectedTitle': 'ورودی ذخیره‌شده انتخاب شده',
    'runtime.characterLibrary.signInRequired':
      'برای بارگذاری کاراکترهای ذخیره‌شده وارد شوید.',
    'runtime.characterLibrary.status.assigned': 'کاراکتر runtime فعال',
    'runtime.characterLibrary.status.none': 'هنوز کاراکتری نیست',
    'runtime.characterLibrary.status.ready': 'آماده submit',
    'runtime.characterLibrary.status.submitted': 'در انتظار assignment توسط DM',
    'runtime.characterLibrary.submit': 'Submit کاراکتر ذخیره‌شده',
    'runtime.characterLibrary.submitReadyDetail':
      'این کاراکتر نهایی‌شده آماده است. آن را submit کنید تا سرور یک نسخه runtime برای assignment توسط DM ثبت کند.',
    'runtime.characterLibrary.submitReadyTitle': 'آماده ساخت نسخه runtime',
    'runtime.characterLibrary.title': 'کتابخانه کاراکترهای ذخیره‌شده',
    'runtime.characterLibrary.waitingDetail':
      'نسخه runtime {characterId} در وضعیت مرجع session منتظر است. DM باید آن را assign کند تا کاراکتر فعال میز شما شود.',
    'runtime.characterLibrary.waitingTitle':
      'نسخه runtime در انتظار assignment توسط DM',
    'runtime.activeScene.buildDetail':
      'قبل از قرار دادن توکن‌ها، entityها یا شروع برخورد، یک صحنه بسازید یا فعال کنید.',
    'runtime.activeScene.buildTitle': 'ساخت صحنه',
    'runtime.activeScene.idKnownDetail':
      'session یک active scene ID دارد، اما سند کامل صحنه هنوز recover نشده است.',
    'runtime.activeScene.idKnownTitle': 'شناسه صحنه مشخص است',
    'runtime.activeScene.loadedDetail':
      '{sceneName} با گرید {width}x{height} و {entityCount} entity صحنه بارگذاری شده است.',
    'runtime.activeScene.loadedTitle': 'صحنه بارگذاری شد',
    'runtime.activeScene.noneDetail':
      'DM هنوز صحنه‌ای را فعال نکرده، یا این مرورگر باید read modelها را recover کند.',
    'runtime.activeScene.noneTitle': 'صحنه فعالی نیست',
    'runtime.demoSetup.description':
      'اولین مسیر قابل بازی Training Room را با فرمان‌های فعلی سرور و داده‌های نمونه آماده می‌کند.',
    'runtime.demoSetup.encounter': 'برخورد',
    'runtime.demoSetup.encounterValue': 'شروع دستی بعد از آماده شدن setup',
    'runtime.demoSetup.eyebrow': 'مسیر playtest برای DM',
    'runtime.demoSetup.flow': 'جریان',
    'runtime.demoSetup.flowValue':
      'ساخت میز، نشاندن بازیکن‌ها، assignment کاراکترها، فعال‌سازی صحنه',
    'runtime.demoSetup.guardrail': 'مرجعیت',
    'runtime.demoSetup.guardrailValue':
      'DM بازی را شروع می‌کند؛ سرور همه فرمان‌ها را اعتبارسنجی می‌کند',
    'runtime.demoSetup.roster': 'Roster',
    'runtime.demoSetup.runTrainingRoom': 'اجرای Training Room Skirmish',
    'runtime.demoSetup.scenarioLabel': 'سناریوی demo',
    'runtime.demoSetup.scene': 'صحنه',
    'runtime.demoSetup.setup': 'وضعیت آماده‌شده',
    'runtime.demoSetup.setupValue':
      'Session، بازیکن‌ها، کاراکترها، صحنه، placement توکن‌ها',
    'runtime.demoSetup.title': 'Setup اتاق تمرین',
    'runtime.demoSetup.action.assignPcs': 'تخصیص PCها',
    'runtime.demoSetup.action.createPcs': 'ساخت PCها',
    'runtime.demoSetup.action.createScene': 'ساخت صحنه',
    'runtime.demoSetup.action.joinPlayers': 'نشاندن بازیکن‌ها',
    'runtime.demoSetup.action.placeTokens': 'قرار دادن توکن‌ها',
    'runtime.demoSetup.action.startEncounter': 'شروع برخورد',
    'runtime.debug.description':
      'Payloadهای خام protocol برای debug اینجا می‌مانند؛ نمای اصلی همان table view بالاست.',
    'runtime.debug.emptyDetail':
      'SSE را subscribe کنید یا command اجرا کنید تا ledger پر شود.',
    'runtime.debug.emptyTitle': 'هنوز رویدادی نیست',
    'runtime.debug.eyebrow': 'ردیابی توسعه',
    'runtime.debug.summary': 'آخرین پاسخ، snapshot جلسه، و event log خام',
    'runtime.debug.title': 'دفترچه Debug',
    'runtime.disabled.busy': 'در انتظار {label}.',
    'runtime.disabled.createOrRecoverActiveScene':
      'ابتدا یک active scene بسازید یا recover کنید.',
    'runtime.disabled.createActivateRecoverScene':
      'ابتدا یک صحنه بسازید، فعال کنید، یا recover کنید.',
    'runtime.disabled.combatantDefeated':
      'monster/NPC انتخاب‌شده شکست خورده و نمی‌تواند عمل کند.',
    'runtime.disabled.combatantTurn':
      'combatant انتخاب‌شده باید بازیگر نوبت فعلی باشد.',
    'runtime.disabled.currentTurnCombatant':
      'نوبت فعلی monster/NPC است؛ از کنترل حمله combatant در DM استفاده کنید.',
    'runtime.disabled.dmOnlyControl': 'برای این کنترل به حالت DM بروید.',
    'runtime.disabled.dmOnlyCombatant':
      'برای کنترل‌های monster/NPC به حالت DM بروید.',
    'runtime.disabled.dmOnlyScene': 'برای ساخت صحنه به حالت DM بروید.',
    'runtime.disabled.invalidActor':
      'یک participant بازیکن joinشده را به‌عنوان کاراکتر فعال انتخاب کنید.',
    'runtime.disabled.invalidTarget':
      'یک بازیکن joinشده یا هدف monster/NPC فعال انتخاب کنید.',
    'runtime.disabled.invalidTargetDifferent':
      'یک participant هدف متفاوت انتخاب کنید.',
    'runtime.disabled.loadOrAssignCharacter':
      'ابتدا این کاراکتر را بارگذاری یا assign کنید.',
    'runtime.disabled.missingActiveScene':
      'قبل از حرکت یا شروع combat یک active scene بسازید یا recover کنید.',
    'runtime.disabled.missingEncounter':
      'ابتدا encounter را شروع یا recover کنید.',
    'runtime.disabled.missingPlayerIdentity':
      'شناسه participant و نام نمایشی بازیکن را وارد کنید.',
    'runtime.disabled.missingSession':
      'ابتدا یک session بسازید، paste کنید، یا recover کنید.',
    'runtime.disabled.placeCharacter':
      'ابتدا حداقل یک کاراکتر را در active scene قرار دهید.',
    'runtime.disabled.playerTarget': 'یک هدف از کاراکترهای بازیکن انتخاب کنید.',
    'runtime.disabled.playerJoinMode':
      'برای join شدن با بازیکن تنظیم‌شده به حالت بازیکن بروید.',
    'runtime.disabled.recoverCharacter':
      'ابتدا یک کاراکتر برای این participant بارگذاری یا recover کنید.',
    'runtime.disabled.selectCombatant':
      'ابتدا یک monster/NPC combatant بسازید یا انتخاب کنید.',
    'runtime.disabled.selectedAlreadyAssigned':
      'این participant همین کاراکتر را قبلا assign کرده است.',
    'runtime.eyebrow': 'سطح کنترل مرجع برای میز بازی',
    'runtime.encounterStatus.active': 'فعال',
    'runtime.encounterStatus.ended': 'تمام شده',
    'runtime.encounterStatus.hit': 'برخورد کرد',
    'runtime.encounterStatus.id': 'ID {id}',
    'runtime.encounterStatus.latestCombat':
      '{attacker} به {target} {result} و {damage} آسیب زد.',
    'runtime.encounterStatus.latestEncounter':
      '{reason} - راند {round}، نوبت {turn}',
    'runtime.encounterStatus.miss': 'خطا رفت',
    'runtime.encounterStatus.nextActor': 'بعدی {actor}',
    'runtime.encounterStatus.noCombatResult': 'هنوز نتیجه combat ثبت نشده.',
    'runtime.encounterStatus.noCurrentActor': 'encounter فعالی بارگذاری نشده',
    'runtime.encounterStatus.noEncounterUpdate':
      'هنوز به‌روزرسانی encounter دریافت نشده.',
    'runtime.encounterStatus.noProgress': 'پیشرفت راندی نیست',
    'runtime.encounterStatus.notLoaded': 'بدون encounter',
    'runtime.encounterStatus.progress':
      'راند {round} - نوبت {turn}/{turnCount}',
    'runtime.encounterStatus.title': 'وضعیت encounter',
    'runtime.eventFeed.description':
      'خلاصه‌های خوانای updateهای زنده SSE. این هنوز replay نیست.',
    'runtime.eventFeed.emptyDetail':
      'به stream جلسه subscribe کنید، سپس حرکت، حمله، یا recover انجام دهید تا این feed پر شود.',
    'runtime.eventFeed.emptyTitle': 'هنوز خلاصه رویداد زنده‌ای نیست',
    'runtime.eventFeed.eyebrow': 'نشانه‌های زنده',
    'runtime.eventFeed.title': 'Combat و رخدادها',
    'runtime.grid.actingToken': 'توکن فعال',
    'runtime.grid.description':
      'صحنه {scene}. روی cell کلیک کنید یا مختصات را وارد کنید؛ حرکت همچنان از commandهای سرور عبور می‌کند.',
    'runtime.grid.dmEyebrow': 'میز نبرد DM',
    'runtime.grid.dmReposition': 'جابجایی DM',
    'runtime.grid.moveActor': 'حرکت بازیگر',
    'runtime.grid.moveToken': 'حرکت توکن',
    'runtime.grid.playerEyebrow': 'نمای بازیکن',
    'runtime.grid.title': 'گرید تاکتیکی',
    'runtime.playerReadiness.actions': '{count} گزینه اکشن آماده',
    'runtime.playerReadiness.attack': 'حمله {state}',
    'runtime.playerReadiness.blocked': 'مسدود',
    'runtime.playerReadiness.currentActor': 'نوبت فعلی',
    'runtime.playerReadiness.done': 'انجام شد',
    'runtime.playerReadiness.eyebrow': 'آمادگی بازیکن',
    'runtime.playerReadiness.move': 'حرکت {state}',
    'runtime.playerReadiness.next': 'بعدی',
    'runtime.playerReadiness.progress': '{completed}/{total} آماده',
    'runtime.playerReadiness.ready': 'آماده',
    'runtime.playerReadiness.readyCount': '{count} قدم بعدی',
    'runtime.playerReadiness.selectedTarget': 'هدف انتخاب‌شده',
    'runtime.playerReadiness.title': 'خلاصه آمادگی',
    'runtime.playerReadiness.tokenPosition': 'توکن',
    'runtime.playerReadiness.waiting': 'در انتظار',
    'runtime.playerReadiness.waitingCount': '{count} در انتظار',
    'runtime.recovery.empty': 'بدون session',
    'runtime.recovery.eyebrow': 'بازیابی',
    'runtime.recovery.loaded': 'بارگذاری شد',
    'runtime.recovery.missing': 'کم است',
    'runtime.recovery.notes': 'یادداشت‌های بازیابی',
    'runtime.recovery.optional': 'اختیاری',
    'runtime.recovery.partial': 'نیمه‌کامل',
    'runtime.recovery.progress': '{loaded}/{total} بارگذاری شده',
    'runtime.recovery.recovered': 'بازیابی شد',
    'runtime.recovery.title': 'وضعیت بازیابی',
    'runtime.roleNotice':
      'در حال کار به‌عنوان {name} ({participantId}). Local Reset فقط این مرورگر را پاک می‌کند؛ وضعیت backend دست‌نخورده می‌ماند.',
    'runtime.session.create': 'ساخت Session',
    'runtime.session.disconnectSse': 'قطع SSE',
    'runtime.session.dmDisplayName': 'نام نمایشی DM',
    'runtime.session.dmParticipantId': 'شناسه participant برای DM',
    'runtime.session.join': 'پیوستن به Session',
    'runtime.session.localReset': 'Local Reset',
    'runtime.session.playerDisplayName': 'نام نمایشی بازیکن',
    'runtime.session.playerParticipantId': 'شناسه participant بازیکن',
    'runtime.session.recover': 'Recover',
    'runtime.session.sessionId': 'Session ID',
    'runtime.session.sessionIdPlaceholder':
      'برای recover، شناسه session موجود را paste کنید',
    'runtime.session.subscribeSse': 'Subscribe SSE',
    'runtime.statePanel.activeScene': 'صحنه فعال',
    'runtime.statePanel.currentTurn': 'نوبت فعلی',
    'runtime.statePanel.description':
      'IDها و read modelهای فعلی که در این مرورگر بارگذاری شده‌اند.',
    'runtime.statePanel.encounter': 'Encounter',
    'runtime.statePanel.eyebrow': 'وضعیت میز',
    'runtime.statePanel.sceneName': 'نام صحنه',
    'runtime.statePanel.session': 'Session',
    'runtime.statePanel.title': 'State',
    'runtime.statusOverview.description':
      'فقط از read modelهای فعلی ساخته می‌شود؛ اعتبارسنجی فرمان‌ها همچنان روی سرور است.',
    'runtime.statusOverview.dmReadiness': 'آماده‌سازی DM',
    'runtime.statusOverview.eyebrow': 'وضعیت runtime',
    'runtime.statusOverview.nextAction': 'اقدام قابل‌مشاهده بعدی',
    'runtime.statusOverview.nextAction.dmDetail':
      'در انتظار اقدام بعدی DM روی میز server-authoritative.',
    'runtime.statusOverview.nextAction.ownerDetail': 'مسئول',
    'runtime.statusOverview.nextAction.playerDetail':
      'اقدام قابل‌مشاهده بعدی بازیکن آماده است.',
    'runtime.statusOverview.nextAction.tableDetail':
      'در انتظار پیش‌نیازهای میز یا read modelهای بارگذاری‌شده فعلی.',
    'runtime.statusOverview.playerReadiness': 'آمادگی بازیکن',
    'runtime.statusOverview.readiness': 'آمادگی',
    'runtime.statusOverview.readinessProgress': '{completed}/{total} تکمیل',
    'runtime.statusOverview.recovery': 'Read modelها',
    'runtime.statusOverview.recoveryModels': '{loaded}/{total} بارگذاری شده',
    'runtime.statusOverview.title': 'جریان میز',
    'runtime.statusOverview.turn': 'نوبت',
    'runtime.statusOverview.turnActive': '{actor}',
    'runtime.statusOverview.turnInactive': 'بازیگر فعالی نیست',
    'runtime.statusOverview.waiting.dm': 'اقدام DM',
    'runtime.statusOverview.waiting.player': 'اقدام بازیکن',
    'runtime.statusOverview.waiting.table': 'انتظار میز',
    'runtime.statusOverview.waitingProgress': '{count} در انتظار',
    'runtime.roster.assignment': 'Assignment',
    'runtime.roster.assignment.assigned':
      'کاراکتر runtime {characterId} assign شده',
    'runtime.roster.assignment.needsCharacter': 'به کاراکتر runtime نیاز دارد',
    'runtime.roster.assignment.pendingAssignment':
      'نسخه runtime {characterId} در انتظار assignment توسط DM',
    'runtime.roster.connection.connected': 'متصل',
    'runtime.roster.connection.disconnected': 'قطع‌شده',
    'runtime.roster.currentTurnId': 'نوبت: {participantId}',
    'runtime.roster.currentTurnPlayer': 'نوبت: {name}',
    'runtime.roster.description':
      'وضعیت setup هر بازیکن از read modelهای session، active-scene و encounter.',
    'runtime.roster.emptyDetail':
      'بازیکن‌ها را join کنید تا roster آمادگی پر شود.',
    'runtime.roster.emptyTitle': 'بازیکنی روی میز نیست',
    'runtime.roster.encounter': 'Encounter',
    'runtime.roster.encounter.currentTurn': 'نوبت فعلی',
    'runtime.roster.encounter.noEncounter': 'encounter فعالی نیست',
    'runtime.roster.encounter.notInEncounter': 'در ترتیب نوبت نیست',
    'runtime.roster.encounter.waitingTurn': 'در انتظار نوبت',
    'runtime.roster.eyebrow': 'Roster آمادگی',
    'runtime.roster.placement': 'Placement',
    'runtime.roster.placement.needsAssignment':
      'قبل از placement به assignment نیاز دارد',
    'runtime.roster.placement.needsPlacement': 'به placement توکن نیاز دارد',
    'runtime.roster.placement.placed': 'قرار داده شده',
    'runtime.roster.placement.placedAt': 'قرارگرفته در {x},{y}',
    'runtime.roster.placement.waitingScene': 'در انتظار active scene',
    'runtime.roster.readySummary': '{ready}/{total} آماده روی board',
    'runtime.roster.setup.needsCharacter': 'نیازمند کاراکتر',
    'runtime.roster.setup.needsPlacement': 'نیازمند placement',
    'runtime.roster.setup.pendingAssignment': 'در انتظار DM',
    'runtime.roster.setup.ready': 'آماده روی board',
    'runtime.roster.setup.waitingScene': 'در انتظار scene',
    'runtime.roster.title': 'Roster بازیکن‌ها',
    'runtime.rosterPanel.description.dm':
      'همه کاراکترهای بازیکن‌های نشسته روی میز.',
    'runtime.rosterPanel.description.player':
      'کاراکتر بارگذاری‌شده شما از read/eventهای سرور.',
    'runtime.rosterPanel.emptyDetail':
      'بازیکن‌ها را join کنید یا یک سناریوی demo نام‌دار اجرا کنید.',
    'runtime.rosterPanel.emptyTitle': 'بازیکنی بارگذاری نشده',
    'runtime.rosterPanel.eyebrow': 'Roster',
    'runtime.rosterPanel.title': 'کاراکترها',
    'runtime.assignmentHelper.assigned': 'تخصیص‌یافته',
    'runtime.assignmentHelper.knownCharacter': 'کاراکتر شناخته‌شده',
    'runtime.assignmentHelper.pending': 'در انتظار',
    'runtime.assignmentHelper.player': 'بازیکن',
    'runtime.assignmentHelper.submit': 'تخصیص کاراکتر بارگذاری‌شده',
    'runtime.assignmentHelper.title': 'دستیار assignment',
    'runtime.tableSetup.eyebrow': 'آمادگی DM',
    'runtime.tableSetup.item.characters.blocked': 'تخصیص کاراکترها',
    'runtime.tableSetup.item.characters.done': 'کاراکترها تخصیص یافتند',
    'runtime.tableSetup.item.characters.ready': 'تخصیص کاراکترها',
    'runtime.tableSetup.item.encounter.blocked': 'شروع برخورد',
    'runtime.tableSetup.item.encounter.done': 'برخورد فعال است',
    'runtime.tableSetup.item.encounter.ready': 'شروع برخورد',
    'runtime.tableSetup.item.placement.blocked': 'قرار دادن توکن‌ها',
    'runtime.tableSetup.item.placement.done': 'توکن‌ها قرار گرفتند',
    'runtime.tableSetup.item.placement.ready': 'قرار دادن توکن‌ها',
    'runtime.tableSetup.item.players.blocked': 'نشاندن بازیکن‌ها',
    'runtime.tableSetup.item.players.done': 'بازیکن‌ها نشسته‌اند',
    'runtime.tableSetup.item.players.ready': 'نشاندن بازیکن‌ها',
    'runtime.tableSetup.item.scene.blocked': 'فعال‌سازی صحنه',
    'runtime.tableSetup.item.scene.done': 'صحنه فعال است',
    'runtime.tableSetup.item.scene.ready': 'فعال‌سازی صحنه',
    'runtime.tableSetup.item.session.blocked': 'ساخت session',
    'runtime.tableSetup.item.session.done': 'session بارگذاری شد',
    'runtime.tableSetup.item.session.ready': 'ساخت session',
    'runtime.tableSetup.detail.characters.blocked':
      'بازیکن‌ها باید قبل از assignment کاراکترها join شوند.',
    'runtime.tableSetup.detail.characters.done':
      'کاراکترهای تخصیص‌یافته برای میز آماده‌اند.',
    'runtime.tableSetup.detail.characters.ready':
      'حداقل یک کاراکتر نهایی‌شده بازیکن را تخصیص دهید.',
    'runtime.tableSetup.detail.encounter.blocked':
      'قبل از شروع encounter حداقل یک توکن قرار دهید.',
    'runtime.tableSetup.detail.encounter.done':
      'یک encounter فعال است و کنترل‌های نوبت آماده‌اند.',
    'runtime.tableSetup.detail.encounter.ready':
      'وقتی میز برای initiative آماده است encounter را شروع کنید.',
    'runtime.tableSetup.detail.placement.blocked':
      'ابتدا به assignment کاراکترها و active scene نیاز است.',
    'runtime.tableSetup.detail.placement.done':
      'توکن‌ها در active scene قرار گرفته‌اند.',
    'runtime.tableSetup.detail.placement.ready':
      'کاراکترهای تخصیص‌یافته را در active scene قرار دهید.',
    'runtime.tableSetup.detail.players.blocked':
      'قبل از join شدن بازیکن‌ها به وضعیت session نیاز است.',
    'runtime.tableSetup.detail.players.done': 'بازیکن‌ها روی میز نشسته‌اند.',
    'runtime.tableSetup.detail.players.ready':
      'قبل از assignment کاراکترها حداقل یک بازیکن را join کنید.',
    'runtime.tableSetup.detail.scene.blocked':
      'بعد از ساخته شدن session یک صحنه بسازید و فعال کنید.',
    'runtime.tableSetup.detail.scene.done':
      'یک active scene برای میز بارگذاری شده است.',
    'runtime.tableSetup.detail.scene.ready':
      'یک active scene برای میز بسازید یا recover کنید.',
    'runtime.tableSetup.detail.session.blocked':
      'قبل از بارگذاری میز session را بسازید یا recover کنید.',
    'runtime.tableSetup.detail.session.done': 'وضعیت session بارگذاری شده است.',
    'runtime.tableSetup.detail.session.ready':
      'قبل از بارگذاری میز session را بسازید یا recover کنید.',
    'runtime.tableSetup.readyForPlay': 'میز برای بازی آماده است.',
    'runtime.tableSetup.status.blocked': 'صبر',
    'runtime.tableSetup.status.done': 'انجام شد',
    'runtime.tableSetup.status.ready': 'بعدی',
    'runtime.tableSetup.title': 'Setup میز',
    'runtime.actionEconomy.action': 'Action',
    'runtime.actionEconomy.available': 'آزاد',
    'runtime.actionEconomy.blocked': 'مسدود',
    'runtime.actionEconomy.bonusAction': 'Bonus',
    'runtime.actionEconomy.latest': '{reason} - راند {round}، نوبت {turn}',
    'runtime.actionEconomy.noEncounter': 'نوبت فعالی نیست',
    'runtime.actionEconomy.noLatest':
      'هنوز به‌روزرسانی action economy ثبت نشده.',
    'runtime.actionEconomy.reaction': 'Reaction',
    'runtime.actionEconomy.ready': 'آماده',
    'runtime.actionEconomy.resource': '{name}: {state}',
    'runtime.actionEconomy.spent': 'همه مصرف شده',
    'runtime.actionEconomy.title': 'Action economy',
    'runtime.actionEconomy.unavailable': 'Action economy در دسترس نیست.',
    'runtime.actionEconomy.used': 'مصرف شده',
    'runtime.actionFeedback.ac': 'AC {armorClass}',
    'runtime.actionFeedback.acUnknown': 'AC نامشخص',
    'runtime.actionFeedback.attackBlocked': 'مسدود',
    'runtime.actionFeedback.attackReady': 'آماده',
    'runtime.actionFeedback.damage': '{damage} آسیب',
    'runtime.actionFeedback.hit': 'برخورد',
    'runtime.actionFeedback.hp': 'HP {current}/{max} +{temp}',
    'runtime.actionFeedback.hpUnknown': 'HP نامشخص',
    'runtime.actionFeedback.miss': 'خطا',
    'runtime.actionFeedback.noResult': 'هنوز نتیجه حمله‌ای ثبت نشده.',
    'runtime.actionFeedback.noTarget': 'بدون هدف',
    'runtime.actionFeedback.noTargetDetail':
      'یک هدف انتخاب کنید تا آمادگی حمله دیده شود.',
    'runtime.actionFeedback.resultSummary':
      '{attacker} به {target} حمله کرد؛ HP {previous} -> {current}.',
    'runtime.actionFeedback.resultTitle': 'آخرین نتیجه',
    'runtime.actionFeedback.roll': 'Roll {roll}',
    'runtime.actionFeedback.status': 'وضعیت {status}',
    'runtime.actionFeedback.targetKind.character': 'کاراکتر',
    'runtime.actionFeedback.targetKind.combatant': 'هیولا/NPC',
    'runtime.actionFeedback.targetTitle': 'هدف انتخاب‌شده',
    'runtime.mode.dm': 'حالت DM',
    'runtime.mode.player': 'حالت بازیکن',
    'runtime.movementFeedback.after':
      'بعد از حرکت {after} فوت مصرف‌شده، {remaining} فوت مانده',
    'runtime.movementFeedback.afterUnknown': 'بعد از حرکت نامشخص',
    'runtime.movementFeedback.blocked': 'حرکت مسدود',
    'runtime.movementFeedback.budget':
      '{remaining} فوت مانده از {speed} فوت ({used} مصرف شده)',
    'runtime.movementFeedback.current': 'از {cell}',
    'runtime.movementFeedback.destination': 'به {cell}',
    'runtime.movementFeedback.distance': '{distance} فوت',
    'runtime.movementFeedback.distanceUnknown': 'فاصله نامشخص',
    'runtime.movementFeedback.explorationBudget': 'حرکت اکتشافی',
    'runtime.movementFeedback.noPosition': 'قرار نگرفته',
    'runtime.movementFeedback.ready': 'حرکت آماده',
    'runtime.movementFeedback.title': 'پیش‌نمایش حرکت',
    'runtime.nav.characters': 'کاراکترها',
    'runtime.outbox.refresh': 'بررسی Outbox',
    'runtime.outbox.status.backlog': 'Outbox {count}',
    'runtime.outbox.status.clear': 'Outbox پاک',
    'runtime.outbox.status.error': 'Outbox در دسترس نیست',
    'runtime.outbox.status.loading': 'Outbox ...',
    'runtime.outbox.status.off': 'Outbox خاموش',
    'runtime.outbox.status.unknown': 'Outbox -',
    'runtime.status.busy': 'درگیر: {label}',
    'runtime.status.stream': 'استریم {status}',
    'runtime.status.streamIdle': 'استریم غیرفعال',
    'runtime.summary':
      'یک سطح مرورگری متناسب با نقش کاربر برای بک‌اند فعلی. وضعیت نهایی همچنان دست سرور است؛ SSE فقط رویدادهای زنده را می‌رساند و بازیابی، وضعیت را از مدل‌های خواندنی بازسازی می‌کند.',
    'runtime.title': 'میز نبرد زنده',
    'runtime.turnRail.action': 'اکشن {state}',
    'runtime.turnRail.actorKind.character': 'کاراکتر',
    'runtime.turnRail.actorKind.combatant': 'هیولا/NPC',
    'runtime.turnRail.available': 'آماده',
    'runtime.turnRail.bonus': 'بونس {state}',
    'runtime.turnRail.movement': 'حرکت',
    'runtime.turnRail.movementRemaining':
      '{remaining} فوت مانده از {speed} فوت ({used} مصرف شده)',
    'runtime.turnRail.movementUnknown': '{used} فوت مصرف شده',
    'runtime.turnRail.reaction': 'ری‌اکشن {state}',
    'runtime.turnRail.roundInitiative':
      'راند {round} · initiative {initiative}',
    'runtime.turnRail.title': 'نوبت فعلی',
    'runtime.turnRail.used': 'مصرف‌شده',
    'shell.builderMvp.body':
      'ورودی‌های کتابخانه کاراکتر با مالکیت توسعه‌ای در حالت DB ذخیره می‌شوند. امنیت حساب تولیدی عمدا برای مراحل بعدی مانده است.',
    'shell.builderMvp.title': 'نسخه اولیه سازنده',
    'shell.characterTools': 'ابزارهای کاراکتر',
    'shell.demoProfile': 'پروفایل دمو',
  },
} satisfies Record<Locale, Record<string, string>>;

type Messages = typeof messages.en;
type MessageKey = keyof Messages;

type I18nContextValue = {
  dir: 'ltr' | 'rtl';
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  return defaultLocale;
}

function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedLocale = window.localStorage.getItem(localeStorageKey);

  return locales.includes(storedLocale as Locale)
    ? (storedLocale as Locale)
    : null;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [hasLoadedStoredLocale, setHasLoadedStoredLocale] = useState(false);
  const dir = locale === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    const storedLocale = readStoredLocale();

    if (storedLocale) {
      setLocaleState(storedLocale);
    }

    setHasLoadedStoredLocale(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredLocale) {
      return;
    }

    window.localStorage.setItem(localeStorageKey, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [dir, hasLoadedStoredLocale, locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      dir,
      locale,
      setLocale: setLocaleState,
      t: (key, values = {}) => {
        let message = messages[locale][key] ?? messages.en[key] ?? key;

        for (const [name, replacement] of Object.entries(values)) {
          message = message.replaceAll(`{${name}}`, replacement);
        }

        return message;
      },
    }),
    [dir, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider.');
  }

  return context;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      aria-label={t('common.language')}
      className="inline-flex w-fit rounded-xl border border-slate-700 bg-slate-950/45 p-1 text-xs font-black text-slate-300 shadow-lg shadow-black/10"
      role="group"
    >
      {locales.map((candidate) => (
        <button
          aria-pressed={locale === candidate}
          className={[
            'rounded-lg px-3 py-1.5 transition',
            locale === candidate
              ? 'bg-amber-400 text-slate-950'
              : 'hover:bg-slate-800 hover:text-slate-50',
          ].join(' ')}
          key={candidate}
          onClick={() => setLocale(candidate)}
          type="button"
        >
          {candidate === 'fa'
            ? t('common.switchToPersian')
            : t('common.switchToEnglish')}
        </button>
      ))}
    </div>
  );
}
