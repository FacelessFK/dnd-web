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
    'common.no': 'No',
    'common.none': 'None',
    'common.ready': 'Ready',
    'common.server': 'Server',
    'common.switchToEnglish': 'English',
    'common.switchToPersian': 'فارسی',
    'common.yes': 'Yes',
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
    'runtime.board.noCharacterToken': 'No character token',
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
    'runtime.sceneBuilder.action.activateScene': 'Activate Scene',
    'runtime.sceneBuilder.action.createScene': 'Create Custom Scene',
    'runtime.sceneBuilder.action.delete': 'Delete',
    'runtime.sceneBuilder.action.moveTo': 'Move to {cell}',
    'runtime.sceneBuilder.action.placeEntity': 'Place Entity',
    'runtime.sceneBuilder.action.update': 'Update',
    'runtime.sceneBuilder.activateScene': 'Activate scene',
    'runtime.sceneBuilder.chooseKnownScene': 'Choose a known scene...',
    'runtime.sceneBuilder.description':
      'Create custom tactical scenes and add simple authoritative scene entities. No fake local map edits are applied.',
    'runtime.sceneBuilder.editEntity': 'Edit passive entity',
    'runtime.sceneBuilder.editEntityDetail':
      'Combatants are intentionally excluded; use the Monster/NPC panel for combatant HP, movement, and attacks.',
    'runtime.sceneBuilder.entityAt': '{label} at {cell}',
    'runtime.sceneBuilder.entityFlag.blocksMovement': 'blocks movement',
    'runtime.sceneBuilder.entityFlag.blocksVision': 'blocks vision',
    'runtime.sceneBuilder.entityFlag.hidden': 'hidden',
    'runtime.sceneBuilder.entityFlag.transitionTo':
      '{kind} transition to {target}',
    'runtime.sceneBuilder.entityPalette': 'Entity palette',
    'runtime.sceneBuilder.entityPreset.cover.description':
      'Small object that blocks movement but keeps sight lines open.',
    'runtime.sceneBuilder.entityPreset.cover.label': 'Cover',
    'runtime.sceneBuilder.entityPreset.hiddenProp.description':
      'DM-side hidden prop for traps, clues, or reveals.',
    'runtime.sceneBuilder.entityPreset.hiddenProp.label': 'Hidden Prop',
    'runtime.sceneBuilder.entityPreset.marker.description':
      'Visible note marker that does not block the board.',
    'runtime.sceneBuilder.entityPreset.marker.label': 'Marker',
    'runtime.sceneBuilder.entityPreset.monsterSpawn.description':
      'Marker for planned monster or NPC placement.',
    'runtime.sceneBuilder.entityPreset.monsterSpawn.label': 'Monster Spawn',
    'runtime.sceneBuilder.entityPreset.playerSpawn.description':
      'Non-blocking marker for planned player token entry.',
    'runtime.sceneBuilder.entityPreset.playerSpawn.label': 'Player Spawn',
    'runtime.sceneBuilder.entityPreset.wall.description':
      'Long blocker for walls, doors, or chokepoints.',
    'runtime.sceneBuilder.entityPreset.wall.label': 'Wall',
    'runtime.sceneBuilder.entityType.monster': 'Monster',
    'runtime.sceneBuilder.entityType.object': 'Object',
    'runtime.sceneBuilder.entityType.playerSpawn': 'Player spawn',
    'runtime.sceneBuilder.entityType.terrain': 'Terrain',
    'runtime.sceneBuilder.field.cellFeet': 'Cell ft',
    'runtime.sceneBuilder.field.entityType': 'Entity type',
    'runtime.sceneBuilder.field.footprintHeight': 'Footprint H',
    'runtime.sceneBuilder.field.footprintWidth': 'Footprint W',
    'runtime.sceneBuilder.field.height': 'Height',
    'runtime.sceneBuilder.field.name': 'Name / label',
    'runtime.sceneBuilder.field.notes': 'Notes',
    'runtime.sceneBuilder.field.passiveEntity': 'Passive entity',
    'runtime.sceneBuilder.field.sceneId': 'Scene ID',
    'runtime.sceneBuilder.field.sceneName': 'Scene name',
    'runtime.sceneBuilder.field.selected': 'Selected',
    'runtime.sceneBuilder.field.transitionKind': 'Kind',
    'runtime.sceneBuilder.field.transitionNode': 'Transition node',
    'runtime.sceneBuilder.field.transitionTargetLabel': 'Target label',
    'runtime.sceneBuilder.field.transitionTargetScene': 'Known target scene',
    'runtime.sceneBuilder.field.transitionTargetSceneId': 'Target scene ID',
    'runtime.sceneBuilder.field.width': 'Width',
    'runtime.sceneBuilder.flag.blocksMovement': 'Blocks movement',
    'runtime.sceneBuilder.flag.blocksVision': 'Blocks vision',
    'runtime.sceneBuilder.flag.hiddenMap': 'Hidden from map styling',
    'runtime.sceneBuilder.flag.hiddenPlayerMap':
      'Hidden from player map styling',
    'runtime.sceneBuilder.noPassiveEntities.detail':
      'Place an object, terrain marker, or spawn marker before editing passive map entities.',
    'runtime.sceneBuilder.noPassiveEntities.title': 'No passive entities',
    'runtime.sceneBuilder.passiveEntities': 'Passive entities',
    'runtime.sceneBuilder.placeEntity': 'Place entity',
    'runtime.sceneBuilder.placeEntityDetail':
      'Target cell {cell}. Placement is persisted only after `place_entity_in_scene` succeeds.',
    'runtime.sceneBuilder.sceneDraft': 'Scene draft',
    'runtime.sceneBuilder.title': 'Scene Builder',
    'runtime.sceneBuilder.transitions.action.activate': 'Activate Link',
    'runtime.sceneBuilder.transitions.action.create': 'Create Transition',
    'runtime.sceneBuilder.transitions.create': 'Create transition',
    'runtime.sceneBuilder.transitions.createDetail':
      'Target cell {cell}. Linked activation changes the active scene only after the server accepts the command.',
    'runtime.sceneBuilder.transitions.description':
      'Author simple linked markers such as doors, stairs, portals, and gates. Only the DM can activate a transition.',
    'runtime.sceneBuilder.transitions.edit': 'Edit linked transition',
    'runtime.sceneBuilder.transitions.editDetail':
      'Passive scene entities and combatants are intentionally separate. Transition activation remains DM-controlled.',
    'runtime.sceneBuilder.transitions.kind.door': 'Door',
    'runtime.sceneBuilder.transitions.kind.gate': 'Gate',
    'runtime.sceneBuilder.transitions.kind.other': 'Other',
    'runtime.sceneBuilder.transitions.kind.portal': 'Portal',
    'runtime.sceneBuilder.transitions.kind.stairs': 'Stairs',
    'runtime.sceneBuilder.transitions.noNodes.detail':
      'Create a transition node before editing or activating linked scenes.',
    'runtime.sceneBuilder.transitions.noNodes.title': 'No transition nodes',
    'runtime.sceneBuilder.transitions.preset.door.description':
      'Linked doorway between nearby rooms or chambers.',
    'runtime.sceneBuilder.transitions.preset.door.label': 'Door',
    'runtime.sceneBuilder.transitions.preset.gate.description':
      'Large threshold, portcullis, or exterior scene exit.',
    'runtime.sceneBuilder.transitions.preset.gate.label': 'Gate',
    'runtime.sceneBuilder.transitions.preset.other.description':
      'Custom exit or DM-defined scene link.',
    'runtime.sceneBuilder.transitions.preset.other.label': 'Other',
    'runtime.sceneBuilder.transitions.preset.portal.description':
      'Arcane or unusual linked scene transition.',
    'runtime.sceneBuilder.transitions.preset.portal.label': 'Portal',
    'runtime.sceneBuilder.transitions.preset.stairs.description':
      'Vertical route to another level or elevation.',
    'runtime.sceneBuilder.transitions.preset.stairs.label': 'Stairs',
    'runtime.sceneBuilder.transitions.presets': 'Transition presets',
    'runtime.sceneBuilder.transitions.title': 'Scene Transitions',
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
    'runtime.notice.commandFailed': 'Command failed',
    'runtime.notice.recoveryWithNotes': 'Recovery completed with notes',
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
    'runtime.playerReadiness.detail.ready': 'Player setup is ready.',
    'runtime.playerReadiness.done': 'Done',
    'runtime.playerReadiness.eyebrow': 'Player readiness',
    'runtime.playerReadiness.item.assignment.blocked.detail':
      'A finalized character is required before assignment.',
    'runtime.playerReadiness.item.assignment.blocked.title':
      'Submit for assignment',
    'runtime.playerReadiness.item.assignment.done.detail':
      'The DM assigned this runtime character to the table.',
    'runtime.playerReadiness.item.assignment.done.title': 'Character assigned',
    'runtime.playerReadiness.item.assignment.ready.detail':
      'Submit the finalized character for DM assignment.',
    'runtime.playerReadiness.item.assignment.ready.title':
      'Submit for assignment',
    'runtime.playerReadiness.item.assignment.waiting.detail':
      'A runtime copy is submitted. Waiting for the DM to assign it.',
    'runtime.playerReadiness.item.assignment.waiting.title':
      'Waiting for assignment',
    'runtime.playerReadiness.item.character.blocked.detail':
      'Join before character setup matters.',
    'runtime.playerReadiness.item.character.blocked.title': 'Prepare character',
    'runtime.playerReadiness.item.character.done.detail':
      'A ready runtime character is available for this player.',
    'runtime.playerReadiness.item.character.done.title': 'Character ready',
    'runtime.playerReadiness.item.character.ready.detail':
      'Create a runtime draft or submit a saved Character Library entry.',
    'runtime.playerReadiness.item.character.ready.title': 'Prepare character',
    'runtime.playerReadiness.item.joined.blocked.detail':
      'A session is required before joining.',
    'runtime.playerReadiness.item.joined.blocked.title': 'Join table',
    'runtime.playerReadiness.item.joined.done.detail':
      'This player is joined at the table.',
    'runtime.playerReadiness.item.joined.done.title': 'Joined table',
    'runtime.playerReadiness.item.joined.ready.detail':
      'Join the table with your participant ID and display name.',
    'runtime.playerReadiness.item.joined.ready.title': 'Join table',
    'runtime.playerReadiness.item.placement.blocked.detail':
      'Scene and assignment are required before placement.',
    'runtime.playerReadiness.item.placement.blocked.title':
      'Waiting for placement',
    'runtime.playerReadiness.item.placement.done.detail':
      'Your token is placed in the active scene.',
    'runtime.playerReadiness.item.placement.done.title': 'Token placed',
    'runtime.playerReadiness.item.placement.waiting.detail':
      'Waiting for the DM to place your token.',
    'runtime.playerReadiness.item.placement.waiting.title':
      'Waiting for placement',
    'runtime.playerReadiness.item.scene.done.detail':
      'An active scene is loaded.',
    'runtime.playerReadiness.item.scene.done.title': 'Scene active',
    'runtime.playerReadiness.item.scene.waiting.detail':
      'Waiting for the DM to activate a scene.',
    'runtime.playerReadiness.item.scene.waiting.title': 'Waiting for scene',
    'runtime.playerReadiness.item.session.done.detail': 'A session is loaded.',
    'runtime.playerReadiness.item.session.done.title': 'Session loaded',
    'runtime.playerReadiness.item.session.ready.detail':
      'Paste a session ID from the DM, then join or recover.',
    'runtime.playerReadiness.item.session.ready.title': 'Choose session',
    'runtime.playerReadiness.item.turn.blocked.detail':
      'Placement is required before turn readiness matters.',
    'runtime.playerReadiness.item.turn.blocked.title': 'Waiting for turn',
    'runtime.playerReadiness.item.turn.ready.detail':
      '{count} turn option(s) are available.',
    'runtime.playerReadiness.item.turn.ready.title': 'Turn ready',
    'runtime.playerReadiness.item.turn.waiting.detail':
      'Current actor: {actor}. Watch the board and prepare.',
    'runtime.playerReadiness.item.turn.waiting.title': 'Waiting for turn',
    'runtime.playerReadiness.move': 'Move {state}',
    'runtime.playerReadiness.next': 'Next',
    'runtime.playerReadiness.progress': '{completed}/{total} ready',
    'runtime.playerReadiness.ready': 'ready',
    'runtime.playerReadiness.readyCount': '{count} next steps',
    'runtime.playerReadiness.selectedTarget': 'Selected target',
    'runtime.playerReadiness.summary.blocked': 'Player setup blocked',
    'runtime.playerReadiness.summary.readyNext': 'Ready for next step',
    'runtime.playerReadiness.summary.waitingTable': 'Waiting for the table',
    'runtime.playerReadiness.summary.waitingTurn': 'Waiting for your turn',
    'runtime.playerReadiness.summary.yourTurnNeedsAttention':
      'Your turn needs attention',
    'runtime.playerReadiness.summary.yourTurnReady': 'Your turn is ready',
    'runtime.playerReadiness.title': 'Readiness summary',
    'runtime.playerReadiness.tokenPosition': 'Token',
    'runtime.playerReadiness.waiting': 'Waiting',
    'runtime.playerReadiness.waitingCount': '{count} waiting',
    'runtime.playerNextStep.chooseSession.detail':
      'Paste a session ID from the DM, then join or recover.',
    'runtime.playerNextStep.chooseSession.title': 'Choose a session',
    'runtime.playerNextStep.createCharacter.detail':
      'Create a draft here or submit a saved Character Library entry, then wait for DM assignment.',
    'runtime.playerNextStep.createCharacter.title': 'Create your character',
    'runtime.playerNextStep.exploration.detail':
      'You can move outside combat; turn resources unlock after encounter start.',
    'runtime.playerNextStep.exploration.title': 'Exploration mode',
    'runtime.playerNextStep.finalize.detail':
      'Finish editing and finalize your character before sending it to the DM.',
    'runtime.playerNextStep.finalize.title': 'Finalize your character',
    'runtime.playerNextStep.join.detail':
      'Join the session as this participant before reading table state.',
    'runtime.playerNextStep.join.title': 'Join the table',
    'runtime.playerNextStep.noScene.detail':
      'The DM has not activated a scene yet, or you need to recover.',
    'runtime.playerNextStep.noScene.title': 'No active scene',
    'runtime.playerNextStep.placement.detail':
      'Your character has no token placement in the active scene.',
    'runtime.playerNextStep.placement.title': 'Token not placed',
    'runtime.playerNextStep.submit.detail':
      'Submit your finalized character for DM assignment so the table can see it.',
    'runtime.playerNextStep.submit.title': 'Submit for assignment',
    'runtime.playerNextStep.waitingDm.detail':
      'A submitted runtime copy is waiting in session state for the DM to assign it.',
    'runtime.playerNextStep.waitingDm.title': 'Waiting for DM assignment',
    'runtime.playerNextStep.waitingTurn.detail':
      'Watch the current actor and prepare your target or movement.',
    'runtime.playerNextStep.waitingTurn.title': 'Waiting for your turn',
    'runtime.playerNextStep.yourTurn.detail':
      'Move, attack, or spend your action economy. The server validates legality.',
    'runtime.playerNextStep.yourTurn.title': 'Your turn',
    'runtime.recovery.empty': 'No session',
    'runtime.recovery.detail.empty':
      'No recoverable runtime session is loaded in this browser yet.',
    'runtime.recovery.detail.notes': '{count} recovery note(s) were recorded.',
    'runtime.recovery.detail.partial':
      '{loaded}/{total} recovery read models are loaded.',
    'runtime.recovery.detail.recovered':
      '{loaded}/{total} recovery read models are loaded: session, scene, active-scene placement, characters, and encounter.',
    'runtime.recovery.eyebrow': 'Recovery',
    'runtime.recovery.item.activeScene.missing':
      'The active-scene placement read model is not loaded.',
    'runtime.recovery.item.activeScene.optional_missing':
      'No active-scene placement read model is currently expected.',
    'runtime.recovery.item.activeScene.recovered':
      'The active-scene placement read model is loaded.',
    'runtime.recovery.item.activeScene.title': 'Placement read model',
    'runtime.recovery.item.characters.missing':
      'No character read models are loaded yet.',
    'runtime.recovery.item.characters.optional_missing':
      'Character read models are optional until table characters exist.',
    'runtime.recovery.item.characters.recovered':
      'Character read models are loaded.',
    'runtime.recovery.item.characters.title': 'Characters',
    'runtime.recovery.item.encounter.missing':
      'The active encounter read model is not loaded.',
    'runtime.recovery.item.encounter.optional_missing':
      'No active encounter read model is loaded.',
    'runtime.recovery.item.encounter.recovered':
      'The active encounter read model is loaded.',
    'runtime.recovery.item.encounter.title': 'Encounter',
    'runtime.recovery.item.scene.missing':
      'An active scene is expected but the scene read model is not loaded.',
    'runtime.recovery.item.scene.optional_missing':
      'No active scene is currently expected.',
    'runtime.recovery.item.scene.recovered':
      'The active scene read model is loaded.',
    'runtime.recovery.item.scene.title': 'Scene',
    'runtime.recovery.item.session.missing':
      'No session is loaded in local runtime state.',
    'runtime.recovery.item.session.optional_missing':
      'Session recovery is optional until a session is chosen.',
    'runtime.recovery.item.session.recovered':
      'The session read model is present in local runtime state.',
    'runtime.recovery.item.session.title': 'Session',
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
    'runtime.turnTarget.advanceTurn': 'Advance Turn',
    'runtime.turnTarget.attackTarget': 'Attack Target',
    'runtime.turnTarget.description':
      'Turn controls submit actor-scoped commands; disabled buttons explain missing prerequisites.',
    'runtime.turnTarget.eyebrow': 'Encounter',
    'runtime.turnTarget.initiative': '· init {initiative}',
    'runtime.turnTarget.target': 'Target',
    'runtime.turnTarget.title': 'Turn & Target',
    'runtime.turnTarget.turnOrder': 'Turn order',
    'runtime.turnTarget.usage': 'Usage',
    'runtime.turnTarget.usageValue':
      '{movement} ft, action {action}, bonus {bonus}, reaction {reaction}',
    'runtime.turnTarget.useAction': 'Use Action',
    'runtime.turnTarget.useBonus': 'Use Bonus',
    'runtime.turnTarget.useReaction': 'Use Reaction',
    'runtime.overrides.actionUsed': 'Action used',
    'runtime.overrides.bonusActionUsed': 'Bonus action used',
    'runtime.overrides.conditionTags': 'Condition tags',
    'runtime.overrides.controlledParticipant': 'Controlled participant',
    'runtime.overrides.currentHp': 'Current HP',
    'runtime.overrides.description':
      'Administrative overrides. These are intentionally separate from normal encounter flow.',
    'runtime.overrides.endEncounter': 'End Encounter',
    'runtime.overrides.eyebrow': 'DM-only',
    'runtime.overrides.movementUsed': 'Movement used',
    'runtime.overrides.reactionUsed': 'Reaction used',
    'runtime.overrides.setConditions': 'Set Conditions',
    'runtime.overrides.setHp': 'Set HP',
    'runtime.overrides.setTurnActor': 'Set Turn Actor',
    'runtime.overrides.setUsage': 'Set Usage',
    'runtime.overrides.title': 'Overrides',
    'runtime.overrides.turnOverride': 'Turn override',
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
    'common.no': 'خیر',
    'common.none': 'هیچ',
    'common.ready': 'آماده',
    'common.server': 'سرور',
    'common.switchToEnglish': 'English',
    'common.switchToPersian': 'فارسی',
    'common.yes': 'بله',
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
      'درخواست‌های در انتظار، نسخه‌های runtime هستند که سرور از ارسال بازیکن ساخته است. تخصیص یکی از آن‌ها، کاراکتر runtime فعال شرکت‌کننده را مشخص می‌کند؛ ورودی‌های کتابخانه همچنان قابل استفاده مجدد می‌مانند.',
    'runtime.assignmentRequests.emptyDetail':
      'بازیکن‌ها می‌توانند از حالت بازیکن، پیش‌نویس نهایی‌شده runtime یا ورودی ذخیره‌شده کتابخانه کاراکتر را ارسال کنند.',
    'runtime.assignmentRequests.emptyTitle': 'درخواست کاراکتر در انتظار نیست',
    'runtime.assignmentRequests.hp': 'HP',
    'runtime.assignmentRequests.needsAssignment': 'نسخه runtime در انتظار',
    'runtime.assignmentRequests.previewUnavailableDetail':
      'برای نمایش پیش‌نمایش کامل درخواست، وضعیت میز را بازیابی کنید یا کاراکتر در انتظار را دوباره بخوانید.',
    'runtime.assignmentRequests.previewUnavailableTitle':
      'پیش‌نمایش کاراکتر در دسترس نیست',
    'runtime.assignmentRequests.assigned': 'کاراکتر runtime فعال',
    'runtime.assignmentRequests.replacementPending': 'نسخه جایگزین در انتظار',
    'runtime.assignmentRequests.runtimeCopy': 'نسخه runtime',
    'runtime.assignmentRequests.sourceLibraryEntry': 'ورودی کتابخانه منبع',
    'runtime.assignmentRequests.speed': 'سرعت',
    'runtime.assignmentRequests.submit': 'تخصیص نسخه runtime',
    'runtime.assignmentRequests.title': 'درخواست‌های تخصیص',
    'runtime.board.badge.move': 'مقصد حرکت',
    'runtime.board.badge.selected': 'توکن انتخاب‌شده',
    'runtime.board.badge.target': 'هدف حمله',
    'runtime.board.badge.turn': 'نوبت فعلی',
    'runtime.board.camera': 'دوربین',
    'runtime.board.gridLabel':
      'گرید تاکتیکی. با کلیدهای جهت‌دار سلول انتخاب‌شده را حرکت دهید، Home برای اولین سلول و End برای آخرین سلول.',
    'runtime.board.noCharacterToken': 'توکن کاراکتری نیست',
    'runtime.board.panDown': 'حرکت دوربین به پایین',
    'runtime.board.panLeft': 'حرکت دوربین به چپ',
    'runtime.board.panRight': 'حرکت دوربین به راست',
    'runtime.board.panUp': 'حرکت دوربین به بالا',
    'runtime.board.resetView': 'بازنشانی نما',
    'runtime.board.viewportSummary': 'زوم {zoom} · جابه‌جایی {panX}, {panY}',
    'runtime.board.zoomIn': 'زوم بیشتر',
    'runtime.board.zoomOut': 'زوم کمتر',
    'runtime.characterLibrary.blocker.alreadyAssigned':
      'این شرکت‌کننده از قبل کاراکتر تخصیص‌یافته دارد.',
    'runtime.characterLibrary.blocker.alreadySubmitted':
      'یک کاراکتر همین حالا منتظر تخصیص توسط DM است.',
    'runtime.characterLibrary.blocker.busy':
      'صبر کنید کار فعلی میز زنده تمام شود.',
    'runtime.characterLibrary.blocker.missingAuth':
      'برای بارگذاری کاراکترهای ذخیره‌شده وارد شوید.',
    'runtime.characterLibrary.blocker.missingSelection':
      'اول یک کاراکتر ذخیره‌شده و نهایی‌شده انتخاب کنید.',
    'runtime.characterLibrary.blocker.missingSession':
      'اول یک نشست بسازید، وارد کنید، یا بازیابی کنید.',
    'runtime.characterLibrary.blocker.noFinalizedEntries':
      'کاراکتر ذخیره‌شده و نهایی‌شده‌ای در دسترس نیست.',
    'runtime.characterLibrary.blocker.notJoined':
      'اول به عنوان این بازیکن وارد نشست شوید یا آن را بازیابی کنید.',
    'runtime.characterLibrary.description':
      'یک کاراکتر ذخیره‌شده و نهایی‌شده را وارد این نشست زنده کنید. سرور یک نسخه runtime جدا می‌سازد؛ HP، حرکت، وضعیت‌ها و overrideهای DM ورودی ذخیره‌شده را تغییر نمی‌دهند.',
    'runtime.characterLibrary.emptyDetail':
      'یک کاراکتر را در کتابخانه نهایی کنید و بعد این فهرست را به‌روزرسانی کنید.',
    'runtime.characterLibrary.emptyTitle':
      'کاراکتر ذخیره‌شده و نهایی‌شده‌ای نیست',
    'runtime.characterLibrary.entryClass': 'کلاس / سطح',
    'runtime.characterLibrary.entryId': 'ورودی کتابخانه',
    'runtime.characterLibrary.entryStatus': 'وضعیت کتابخانه',
    'runtime.characterLibrary.errorTitle': 'کتابخانه کاراکتر در دسترس نیست',
    'runtime.characterLibrary.loading': 'در حال بارگذاری کتابخانه',
    'runtime.characterLibrary.optionLabel': '{name} - {className} سطح {level}',
    'runtime.characterLibrary.refresh': 'به‌روزرسانی کتابخانه',
    'runtime.characterLibrary.selectLabel': 'کاراکتر ذخیره‌شده',
    'runtime.characterLibrary.selectRequired':
      'اول یک کاراکتر ذخیره‌شده و نهایی‌شده انتخاب کنید.',
    'runtime.characterLibrary.selectedDetail':
      'ارسال {name} یک نسخه runtime جدا برای این نشست می‌سازد. ورودی ذخیره‌شده کتابخانه همچنان قابل استفاده مجدد می‌ماند.',
    'runtime.characterLibrary.selectedTitle': 'ورودی ذخیره‌شده انتخاب شده',
    'runtime.characterLibrary.signInRequired':
      'برای بارگذاری کاراکترهای ذخیره‌شده وارد شوید.',
    'runtime.characterLibrary.status.assigned': 'کاراکتر runtime فعال',
    'runtime.characterLibrary.status.none': 'هنوز کاراکتری نیست',
    'runtime.characterLibrary.status.ready': 'آماده ارسال',
    'runtime.characterLibrary.status.submitted': 'در انتظار تخصیص توسط DM',
    'runtime.characterLibrary.submit': 'ارسال کاراکتر ذخیره‌شده',
    'runtime.characterLibrary.submitReadyDetail':
      'این کاراکتر نهایی‌شده آماده است. آن را ارسال کنید تا سرور یک نسخه runtime برای تخصیص توسط DM ثبت کند.',
    'runtime.characterLibrary.submitReadyTitle': 'آماده ساخت نسخه runtime',
    'runtime.characterLibrary.title': 'کتابخانه کاراکترهای ذخیره‌شده',
    'runtime.characterLibrary.waitingDetail':
      'نسخه runtime {characterId} در وضعیت مرجع نشست منتظر است. DM باید آن را تخصیص دهد تا کاراکتر فعال میز شما شود.',
    'runtime.characterLibrary.waitingTitle':
      'نسخه runtime در انتظار تخصیص توسط DM',
    'runtime.activeScene.buildDetail':
      'قبل از قرار دادن توکن‌ها، موجودیت‌های صحنه یا شروع برخورد، یک صحنه بسازید یا فعال کنید.',
    'runtime.activeScene.buildTitle': 'ساخت صحنه',
    'runtime.activeScene.idKnownDetail':
      'نشست یک شناسه صحنه فعال دارد، اما سند کامل صحنه هنوز بازیابی نشده است.',
    'runtime.activeScene.idKnownTitle': 'شناسه صحنه مشخص است',
    'runtime.activeScene.loadedDetail':
      '{sceneName} با گرید {width}x{height} و {entityCount} موجودیت صحنه بارگذاری شده است.',
    'runtime.activeScene.loadedTitle': 'صحنه بارگذاری شد',
    'runtime.activeScene.noneDetail':
      'DM هنوز صحنه‌ای را فعال نکرده، یا این مرورگر باید مدل‌های خواندنی را بازیابی کند.',
    'runtime.activeScene.noneTitle': 'صحنه فعالی نیست',
    'runtime.demoSetup.description':
      'اولین مسیر قابل بازی Training Room را با فرمان‌های فعلی سرور و داده‌های نمونه آماده می‌کند.',
    'runtime.demoSetup.encounter': 'برخورد',
    'runtime.demoSetup.encounterValue': 'شروع دستی بعد از آماده شدن میز',
    'runtime.demoSetup.eyebrow': 'مسیر playtest برای DM',
    'runtime.demoSetup.flow': 'جریان',
    'runtime.demoSetup.flowValue':
      'ساخت میز، نشاندن بازیکن‌ها، تخصیص کاراکترها، فعال‌سازی صحنه',
    'runtime.demoSetup.guardrail': 'مرجعیت',
    'runtime.demoSetup.guardrailValue':
      'DM بازی را شروع می‌کند؛ سرور همه فرمان‌ها را اعتبارسنجی می‌کند',
    'runtime.demoSetup.roster': 'گروه بازیکن‌ها',
    'runtime.demoSetup.runTrainingRoom': 'اجرای Training Room Skirmish',
    'runtime.demoSetup.scenarioLabel': 'سناریوی demo',
    'runtime.demoSetup.scene': 'صحنه',
    'runtime.demoSetup.setup': 'وضعیت آماده‌شده',
    'runtime.demoSetup.setupValue':
      'نشست، بازیکن‌ها، کاراکترها، صحنه، جای‌گذاری توکن‌ها',
    'runtime.demoSetup.title': 'آماده‌سازی اتاق تمرین',
    'runtime.demoSetup.action.assignPcs': 'تخصیص PCها',
    'runtime.demoSetup.action.createPcs': 'ساخت PCها',
    'runtime.demoSetup.action.createScene': 'ساخت صحنه',
    'runtime.demoSetup.action.joinPlayers': 'نشاندن بازیکن‌ها',
    'runtime.demoSetup.action.placeTokens': 'قرار دادن توکن‌ها',
    'runtime.demoSetup.action.startEncounter': 'شروع برخورد',
    'runtime.debug.description':
      'داده‌های خام protocol برای عیب‌یابی اینجا می‌مانند؛ نمای اصلی همان میز بالاست.',
    'runtime.debug.emptyDetail':
      'به SSE وصل شوید یا فرمان اجرا کنید تا دفترچه پر شود.',
    'runtime.debug.emptyTitle': 'هنوز رویدادی نیست',
    'runtime.debug.eyebrow': 'ردیابی توسعه',
    'runtime.debug.summary': 'آخرین پاسخ، snapshot نشست، و رخدادهای خام',
    'runtime.debug.title': 'دفترچه عیب‌یابی',
    'runtime.sceneBuilder.action.activateScene': 'فعال‌سازی صحنه',
    'runtime.sceneBuilder.action.createScene': 'ساخت صحنه سفارشی',
    'runtime.sceneBuilder.action.delete': 'حذف',
    'runtime.sceneBuilder.action.moveTo': 'انتقال به {cell}',
    'runtime.sceneBuilder.action.placeEntity': 'قرار دادن موجودیت',
    'runtime.sceneBuilder.action.update': 'به‌روزرسانی',
    'runtime.sceneBuilder.activateScene': 'فعال‌سازی صحنه',
    'runtime.sceneBuilder.chooseKnownScene': 'انتخاب صحنه شناخته‌شده...',
    'runtime.sceneBuilder.description':
      'صحنه‌های تاکتیکی سفارشی بسازید و موجودیت‌های ساده و مرجع صحنه را اضافه کنید. هیچ ویرایش محلی جعلی روی نقشه اعمال نمی‌شود.',
    'runtime.sceneBuilder.editEntity': 'ویرایش موجودیت منفعل',
    'runtime.sceneBuilder.editEntityDetail':
      'موجودیت‌های برخورد عمدا جدا هستند؛ برای HP، حرکت و حمله‌های آن‌ها از پنل هیولا/NPC استفاده کنید.',
    'runtime.sceneBuilder.entityAt': '{label} در {cell}',
    'runtime.sceneBuilder.entityFlag.blocksMovement': 'مسدودکننده حرکت',
    'runtime.sceneBuilder.entityFlag.blocksVision': 'مسدودکننده دید',
    'runtime.sceneBuilder.entityFlag.hidden': 'پنهان',
    'runtime.sceneBuilder.entityFlag.transitionTo': 'گذار {kind} به {target}',
    'runtime.sceneBuilder.entityPalette': 'پالت موجودیت‌ها',
    'runtime.sceneBuilder.entityPreset.cover.description':
      'شیء کوچکی که حرکت را می‌بندد اما خط دید را باز نگه می‌دارد.',
    'runtime.sceneBuilder.entityPreset.cover.label': 'پناه',
    'runtime.sceneBuilder.entityPreset.hiddenProp.description':
      'ابزار پنهان سمت DM برای تله، سرنخ، یا آشکارسازی.',
    'runtime.sceneBuilder.entityPreset.hiddenProp.label': 'ابزار پنهان',
    'runtime.sceneBuilder.entityPreset.marker.description':
      'نشانگر یادداشت که صفحه را مسدود نمی‌کند.',
    'runtime.sceneBuilder.entityPreset.marker.label': 'نشانگر',
    'runtime.sceneBuilder.entityPreset.monsterSpawn.description':
      'نشانگر جای‌گذاری برنامه‌ریزی‌شده برای هیولا یا NPC.',
    'runtime.sceneBuilder.entityPreset.monsterSpawn.label': 'شروع هیولا',
    'runtime.sceneBuilder.entityPreset.playerSpawn.description':
      'نشانگر غیرمسدودکننده برای ورود توکن بازیکن.',
    'runtime.sceneBuilder.entityPreset.playerSpawn.label': 'شروع بازیکن',
    'runtime.sceneBuilder.entityPreset.wall.description':
      'مانع کشیده برای دیوار، در، یا گلوگاه.',
    'runtime.sceneBuilder.entityPreset.wall.label': 'دیوار',
    'runtime.sceneBuilder.entityType.monster': 'هیولا',
    'runtime.sceneBuilder.entityType.object': 'شیء',
    'runtime.sceneBuilder.entityType.playerSpawn': 'شروع بازیکن',
    'runtime.sceneBuilder.entityType.terrain': 'زمین',
    'runtime.sceneBuilder.field.cellFeet': 'فوت خانه',
    'runtime.sceneBuilder.field.entityType': 'نوع موجودیت',
    'runtime.sceneBuilder.field.footprintHeight': 'ارتفاع اندازه',
    'runtime.sceneBuilder.field.footprintWidth': 'عرض اندازه',
    'runtime.sceneBuilder.field.height': 'ارتفاع',
    'runtime.sceneBuilder.field.name': 'نام / برچسب',
    'runtime.sceneBuilder.field.notes': 'یادداشت‌ها',
    'runtime.sceneBuilder.field.passiveEntity': 'موجودیت منفعل',
    'runtime.sceneBuilder.field.sceneId': 'شناسه صحنه',
    'runtime.sceneBuilder.field.sceneName': 'نام صحنه',
    'runtime.sceneBuilder.field.selected': 'انتخاب‌شده',
    'runtime.sceneBuilder.field.transitionKind': 'نوع',
    'runtime.sceneBuilder.field.transitionNode': 'گره گذار',
    'runtime.sceneBuilder.field.transitionTargetLabel': 'برچسب مقصد',
    'runtime.sceneBuilder.field.transitionTargetScene': 'صحنه مقصد شناخته‌شده',
    'runtime.sceneBuilder.field.transitionTargetSceneId': 'شناسه صحنه مقصد',
    'runtime.sceneBuilder.field.width': 'عرض',
    'runtime.sceneBuilder.flag.blocksMovement': 'حرکت را مسدود می‌کند',
    'runtime.sceneBuilder.flag.blocksVision': 'دید را مسدود می‌کند',
    'runtime.sceneBuilder.flag.hiddenMap': 'در سبک نقشه پنهان است',
    'runtime.sceneBuilder.flag.hiddenPlayerMap': 'در سبک نقشه بازیکن پنهان است',
    'runtime.sceneBuilder.noPassiveEntities.detail':
      'قبل از ویرایش موجودیت‌های منفعل نقشه، یک شیء، نشانگر زمین، یا نشانگر شروع قرار دهید.',
    'runtime.sceneBuilder.noPassiveEntities.title': 'موجودیت منفعلی نیست',
    'runtime.sceneBuilder.passiveEntities': 'موجودیت‌های منفعل',
    'runtime.sceneBuilder.placeEntity': 'قرار دادن موجودیت',
    'runtime.sceneBuilder.placeEntityDetail':
      'خانه مقصد {cell}. جای‌گذاری فقط بعد از موفقیت `place_entity_in_scene` پایدار می‌شود.',
    'runtime.sceneBuilder.sceneDraft': 'پیش‌نویس صحنه',
    'runtime.sceneBuilder.title': 'صحنه‌ساز',
    'runtime.sceneBuilder.transitions.action.activate': 'فعال‌سازی پیوند',
    'runtime.sceneBuilder.transitions.action.create': 'ساخت گذار',
    'runtime.sceneBuilder.transitions.create': 'ساخت گذار',
    'runtime.sceneBuilder.transitions.createDetail':
      'خانه مقصد {cell}. فعال‌سازی پیوند فقط بعد از پذیرش فرمان توسط سرور صحنه فعال را تغییر می‌دهد.',
    'runtime.sceneBuilder.transitions.description':
      'نشانگرهای پیوندی ساده مثل در، پله، پرتال و دروازه بسازید. فقط DM می‌تواند گذار را فعال کند.',
    'runtime.sceneBuilder.transitions.edit': 'ویرایش گذار پیوندی',
    'runtime.sceneBuilder.transitions.editDetail':
      'موجودیت‌های منفعل صحنه و موجودیت‌های برخورد عمدا جدا هستند. فعال‌سازی گذار همچنان در کنترل DM می‌ماند.',
    'runtime.sceneBuilder.transitions.kind.door': 'در',
    'runtime.sceneBuilder.transitions.kind.gate': 'دروازه',
    'runtime.sceneBuilder.transitions.kind.other': 'دیگر',
    'runtime.sceneBuilder.transitions.kind.portal': 'پرتال',
    'runtime.sceneBuilder.transitions.kind.stairs': 'پله',
    'runtime.sceneBuilder.transitions.noNodes.detail':
      'قبل از ویرایش یا فعال‌سازی صحنه‌های پیوندی، یک گره گذار بسازید.',
    'runtime.sceneBuilder.transitions.noNodes.title': 'گره گذاری وجود ندارد',
    'runtime.sceneBuilder.transitions.preset.door.description':
      'درگاه پیوندی میان اتاق‌ها یا تالارهای نزدیک.',
    'runtime.sceneBuilder.transitions.preset.door.label': 'در',
    'runtime.sceneBuilder.transitions.preset.gate.description':
      'آستانه بزرگ، دروازه، یا خروجی بیرونی صحنه.',
    'runtime.sceneBuilder.transitions.preset.gate.label': 'دروازه',
    'runtime.sceneBuilder.transitions.preset.other.description':
      'خروجی سفارشی یا پیوند صحنه‌ای تعریف‌شده توسط DM.',
    'runtime.sceneBuilder.transitions.preset.other.label': 'دیگر',
    'runtime.sceneBuilder.transitions.preset.portal.description':
      'گذار جادویی یا غیرمعمول به صحنه پیوندی.',
    'runtime.sceneBuilder.transitions.preset.portal.label': 'پرتال',
    'runtime.sceneBuilder.transitions.preset.stairs.description':
      'مسیر عمودی به سطح یا ارتفاع دیگر.',
    'runtime.sceneBuilder.transitions.preset.stairs.label': 'پله',
    'runtime.sceneBuilder.transitions.presets': 'الگوهای گذار',
    'runtime.sceneBuilder.transitions.title': 'گذارهای صحنه',
    'runtime.disabled.busy': 'در انتظار {label}.',
    'runtime.disabled.createOrRecoverActiveScene':
      'ابتدا یک صحنه فعال بسازید یا بازیابی کنید.',
    'runtime.disabled.createActivateRecoverScene':
      'ابتدا یک صحنه بسازید، فعال کنید، یا بازیابی کنید.',
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
      'یک participant بازیکن پیوسته را به‌عنوان کاراکتر فعال انتخاب کنید.',
    'runtime.disabled.invalidTarget':
      'یک بازیکن پیوسته یا هدف monster/NPC فعال انتخاب کنید.',
    'runtime.disabled.invalidTargetDifferent':
      'یک participant هدف متفاوت انتخاب کنید.',
    'runtime.disabled.loadOrAssignCharacter':
      'ابتدا این کاراکتر را بارگذاری یا تخصیص دهید.',
    'runtime.disabled.missingActiveScene':
      'قبل از حرکت یا شروع برخورد یک صحنه فعال بسازید یا بازیابی کنید.',
    'runtime.disabled.missingEncounter':
      'ابتدا برخورد را شروع یا بازیابی کنید.',
    'runtime.disabled.missingPlayerIdentity':
      'شناسه participant و نام نمایشی بازیکن را وارد کنید.',
    'runtime.disabled.missingSession':
      'ابتدا یک نشست بسازید، وارد کنید، یا بازیابی کنید.',
    'runtime.disabled.placeCharacter':
      'ابتدا حداقل یک کاراکتر را در صحنه فعال قرار دهید.',
    'runtime.disabled.playerTarget': 'یک هدف از کاراکترهای بازیکن انتخاب کنید.',
    'runtime.disabled.playerJoinMode':
      'برای پیوستن با بازیکن تنظیم‌شده به حالت بازیکن بروید.',
    'runtime.disabled.recoverCharacter':
      'ابتدا یک کاراکتر برای این participant بارگذاری یا بازیابی کنید.',
    'runtime.disabled.selectCombatant':
      'ابتدا یک monster/NPC combatant بسازید یا انتخاب کنید.',
    'runtime.disabled.selectedAlreadyAssigned':
      'این participant همین کاراکتر را قبلا تخصیص داده است.',
    'runtime.eyebrow': 'سطح کنترل مرجع برای میز بازی',
    'runtime.notice.commandFailed': 'Command ناموفق بود',
    'runtime.notice.recoveryWithNotes': 'بازیابی با یادداشت تکمیل شد',
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
    'runtime.encounterStatus.noCurrentActor': 'برخورد فعالی بارگذاری نشده',
    'runtime.encounterStatus.noEncounterUpdate':
      'هنوز به‌روزرسانی برخورد دریافت نشده.',
    'runtime.encounterStatus.noProgress': 'پیشرفت راندی نیست',
    'runtime.encounterStatus.notLoaded': 'بدون برخورد',
    'runtime.encounterStatus.progress':
      'راند {round} - نوبت {turn}/{turnCount}',
    'runtime.encounterStatus.title': 'وضعیت برخورد',
    'runtime.eventFeed.description':
      'خلاصه‌های خوانای به‌روزرسانی‌های زنده SSE. این هنوز replay نیست.',
    'runtime.eventFeed.emptyDetail':
      'به جریان نشست وصل شوید، سپس حرکت، حمله، یا بازیابی انجام دهید تا این فهرست رخداد پر شود.',
    'runtime.eventFeed.emptyTitle': 'هنوز خلاصه رویداد زنده‌ای نیست',
    'runtime.eventFeed.eyebrow': 'نشانه‌های زنده',
    'runtime.eventFeed.title': 'برخورد و رخدادها',
    'runtime.grid.actingToken': 'توکن فعال',
    'runtime.grid.description':
      'صحنه {scene}. روی خانه کلیک کنید یا مختصات را وارد کنید؛ حرکت همچنان از فرمان‌های سرور عبور می‌کند.',
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
    'runtime.playerReadiness.detail.ready': 'آمادگی بازیکن کامل است.',
    'runtime.playerReadiness.done': 'انجام شد',
    'runtime.playerReadiness.eyebrow': 'آمادگی بازیکن',
    'runtime.playerReadiness.item.assignment.blocked.detail':
      'قبل از تخصیص به یک کاراکتر نهایی‌شده نیاز است.',
    'runtime.playerReadiness.item.assignment.blocked.title': 'ارسال برای تخصیص',
    'runtime.playerReadiness.item.assignment.done.detail':
      'DM این کاراکتر runtime را به میز تخصیص داده است.',
    'runtime.playerReadiness.item.assignment.done.title': 'کاراکتر تخصیص یافت',
    'runtime.playerReadiness.item.assignment.ready.detail':
      'کاراکتر نهایی‌شده را برای تخصیص توسط DM ارسال کنید.',
    'runtime.playerReadiness.item.assignment.ready.title': 'ارسال برای تخصیص',
    'runtime.playerReadiness.item.assignment.waiting.detail':
      'یک نسخه runtime ارسال شده است و منتظر تخصیص توسط DM است.',
    'runtime.playerReadiness.item.assignment.waiting.title': 'در انتظار تخصیص',
    'runtime.playerReadiness.item.character.blocked.detail':
      'قبل از پیوستن، آماده‌سازی کاراکتر هنوز لازم نیست.',
    'runtime.playerReadiness.item.character.blocked.title':
      'آماده‌سازی کاراکتر',
    'runtime.playerReadiness.item.character.done.detail':
      'یک کاراکتر runtime آماده برای این بازیکن وجود دارد.',
    'runtime.playerReadiness.item.character.done.title': 'کاراکتر آماده است',
    'runtime.playerReadiness.item.character.ready.detail':
      'یک draft runtime بسازید یا یک ورودی ذخیره‌شده Character Library را ارسال کنید.',
    'runtime.playerReadiness.item.character.ready.title': 'آماده‌سازی کاراکتر',
    'runtime.playerReadiness.item.joined.blocked.detail':
      'قبل از پیوستن، به نشست نیاز است.',
    'runtime.playerReadiness.item.joined.blocked.title': 'پیوستن به میز',
    'runtime.playerReadiness.item.joined.done.detail':
      'این بازیکن به میز پیوسته است.',
    'runtime.playerReadiness.item.joined.done.title': 'بازیکن روی میز است',
    'runtime.playerReadiness.item.joined.ready.detail':
      'با شناسه participant و نام نمایشی بازیکن به میز بپیوندید.',
    'runtime.playerReadiness.item.joined.ready.title': 'پیوستن به میز',
    'runtime.playerReadiness.item.placement.blocked.detail':
      'قبل از جای‌گذاری به صحنه و تخصیص نیاز است.',
    'runtime.playerReadiness.item.placement.blocked.title':
      'در انتظار جای‌گذاری',
    'runtime.playerReadiness.item.placement.done.detail':
      'توکن شما در صحنه فعال قرار گرفته است.',
    'runtime.playerReadiness.item.placement.done.title': 'توکن قرار گرفت',
    'runtime.playerReadiness.item.placement.waiting.detail':
      'در انتظار DM برای قرار دادن توکن شما.',
    'runtime.playerReadiness.item.placement.waiting.title':
      'در انتظار جای‌گذاری',
    'runtime.playerReadiness.item.scene.done.detail':
      'یک صحنه فعال بارگذاری شده است.',
    'runtime.playerReadiness.item.scene.done.title': 'صحنه فعال است',
    'runtime.playerReadiness.item.scene.waiting.detail':
      'در انتظار DM برای فعال کردن صحنه.',
    'runtime.playerReadiness.item.scene.waiting.title': 'در انتظار صحنه',
    'runtime.playerReadiness.item.session.done.detail':
      'یک نشست بارگذاری شده است.',
    'runtime.playerReadiness.item.session.done.title': 'نشست بارگذاری شد',
    'runtime.playerReadiness.item.session.ready.detail':
      'Session ID را از DM وارد کنید، سپس بپیوندید یا بازیابی کنید.',
    'runtime.playerReadiness.item.session.ready.title': 'انتخاب نشست',
    'runtime.playerReadiness.item.turn.blocked.detail':
      'قبل از آمادگی نوبت به جای‌گذاری نیاز است.',
    'runtime.playerReadiness.item.turn.blocked.title': 'در انتظار نوبت',
    'runtime.playerReadiness.item.turn.ready.detail':
      '{count} گزینه نوبت در دسترس است.',
    'runtime.playerReadiness.item.turn.ready.title': 'نوبت آماده است',
    'runtime.playerReadiness.item.turn.waiting.detail':
      'بازیگر فعلی: {actor}. صفحه نبرد را نگاه کنید و آماده باشید.',
    'runtime.playerReadiness.item.turn.waiting.title': 'در انتظار نوبت',
    'runtime.playerReadiness.move': 'حرکت {state}',
    'runtime.playerReadiness.next': 'بعدی',
    'runtime.playerReadiness.progress': '{completed}/{total} آماده',
    'runtime.playerReadiness.ready': 'آماده',
    'runtime.playerReadiness.readyCount': '{count} قدم بعدی',
    'runtime.playerReadiness.selectedTarget': 'هدف انتخاب‌شده',
    'runtime.playerReadiness.summary.blocked': 'آمادگی بازیکن مسدود است',
    'runtime.playerReadiness.summary.readyNext': 'آماده قدم بعدی',
    'runtime.playerReadiness.summary.waitingTable': 'در انتظار میز',
    'runtime.playerReadiness.summary.waitingTurn': 'در انتظار نوبت شما',
    'runtime.playerReadiness.summary.yourTurnNeedsAttention':
      'نوبت شما نیاز به توجه دارد',
    'runtime.playerReadiness.summary.yourTurnReady': 'نوبت شما آماده است',
    'runtime.playerReadiness.title': 'خلاصه آمادگی',
    'runtime.playerReadiness.tokenPosition': 'توکن',
    'runtime.playerReadiness.waiting': 'در انتظار',
    'runtime.playerReadiness.waitingCount': '{count} در انتظار',
    'runtime.playerNextStep.chooseSession.detail':
      'Session ID را از DM وارد کنید، سپس بپیوندید یا بازیابی کنید.',
    'runtime.playerNextStep.chooseSession.title': 'انتخاب نشست',
    'runtime.playerNextStep.createCharacter.detail':
      'اینجا یک draft بسازید یا یک ورودی ذخیره‌شده Character Library را ارسال کنید، سپس منتظر تخصیص DM بمانید.',
    'runtime.playerNextStep.createCharacter.title': 'ساخت کاراکتر',
    'runtime.playerNextStep.exploration.detail':
      'خارج از combat می‌توانید حرکت کنید؛ منابع نوبت بعد از شروع برخورد فعال می‌شوند.',
    'runtime.playerNextStep.exploration.title': 'حالت اکتشاف',
    'runtime.playerNextStep.finalize.detail':
      'قبل از ارسال کاراکتر به DM، ویرایش را تمام و کاراکتر را finalize کنید.',
    'runtime.playerNextStep.finalize.title': 'نهایی‌سازی کاراکتر',
    'runtime.playerNextStep.join.detail':
      'قبل از خواندن وضعیت میز، با این participant به نشست بپیوندید.',
    'runtime.playerNextStep.join.title': 'پیوستن به میز',
    'runtime.playerNextStep.noScene.detail':
      'DM هنوز صحنه‌ای را فعال نکرده، یا شما باید بازیابی کنید.',
    'runtime.playerNextStep.noScene.title': 'صحنه فعالی نیست',
    'runtime.playerNextStep.placement.detail':
      'کاراکتر شما در صحنه فعال placement توکن ندارد.',
    'runtime.playerNextStep.placement.title': 'توکن قرار نگرفته',
    'runtime.playerNextStep.submit.detail':
      'کاراکتر نهایی‌شده را برای تخصیص DM ارسال کنید تا میز آن را ببیند.',
    'runtime.playerNextStep.submit.title': 'ارسال برای تخصیص',
    'runtime.playerNextStep.waitingDm.detail':
      'یک نسخه runtime ارسال‌شده در وضعیت نشست منتظر تخصیص توسط DM است.',
    'runtime.playerNextStep.waitingDm.title': 'در انتظار تخصیص DM',
    'runtime.playerNextStep.waitingTurn.detail':
      'بازیگر فعلی را دنبال کنید و هدف یا حرکت خود را آماده کنید.',
    'runtime.playerNextStep.waitingTurn.title': 'در انتظار نوبت شما',
    'runtime.playerNextStep.yourTurn.detail':
      'حرکت کنید، حمله کنید، یا اقتصاد اکشن خود را مصرف کنید. سرور قانونی بودن را اعتبارسنجی می‌کند.',
    'runtime.playerNextStep.yourTurn.title': 'نوبت شما',
    'runtime.recovery.empty': 'بدون نشست',
    'runtime.recovery.detail.empty':
      'هنوز نشست runtime قابل بازیابی در این مرورگر بارگذاری نشده است.',
    'runtime.recovery.detail.notes': '{count} یادداشت بازیابی ثبت شد.',
    'runtime.recovery.detail.partial':
      '{loaded}/{total} مدل خواندنی بازیابی بارگذاری شده است.',
    'runtime.recovery.detail.recovered':
      '{loaded}/{total} مدل خواندنی بازیابی بارگذاری شده است: نشست، صحنه، جای‌گذاری صحنه فعال، کاراکترها، و برخورد.',
    'runtime.recovery.eyebrow': 'بازیابی',
    'runtime.recovery.item.activeScene.missing':
      'مدل خواندنی جای‌گذاری صحنه فعال بارگذاری نشده است.',
    'runtime.recovery.item.activeScene.optional_missing':
      'فعلا مدل خواندنی جای‌گذاری صحنه فعال انتظار نمی‌رود.',
    'runtime.recovery.item.activeScene.recovered':
      'مدل خواندنی جای‌گذاری صحنه فعال بارگذاری شده است.',
    'runtime.recovery.item.activeScene.title': 'مدل جای‌گذاری',
    'runtime.recovery.item.characters.missing':
      'هنوز مدل خواندنی کاراکتری بارگذاری نشده است.',
    'runtime.recovery.item.characters.optional_missing':
      'تا وقتی کاراکتر میز وجود ندارد، مدل‌های کاراکتر اختیاری‌اند.',
    'runtime.recovery.item.characters.recovered':
      'مدل‌های خواندنی کاراکتر بارگذاری شده‌اند.',
    'runtime.recovery.item.characters.title': 'کاراکترها',
    'runtime.recovery.item.encounter.missing':
      'مدل خواندنی برخورد فعال بارگذاری نشده است.',
    'runtime.recovery.item.encounter.optional_missing':
      'مدل خواندنی برخورد فعالی بارگذاری نشده است.',
    'runtime.recovery.item.encounter.recovered':
      'مدل خواندنی برخورد فعال بارگذاری شده است.',
    'runtime.recovery.item.encounter.title': 'برخورد',
    'runtime.recovery.item.scene.missing':
      'صحنه فعال انتظار می‌رود، اما مدل خواندنی صحنه بارگذاری نشده است.',
    'runtime.recovery.item.scene.optional_missing':
      'فعلا صحنه فعالی انتظار نمی‌رود.',
    'runtime.recovery.item.scene.recovered':
      'مدل خواندنی صحنه فعال بارگذاری شده است.',
    'runtime.recovery.item.scene.title': 'صحنه',
    'runtime.recovery.item.session.missing':
      'هیچ نشستی در وضعیت runtime محلی بارگذاری نشده است.',
    'runtime.recovery.item.session.optional_missing':
      'تا وقتی نشست انتخاب نشده، بازیابی نشست اختیاری است.',
    'runtime.recovery.item.session.recovered':
      'مدل خواندنی نشست در وضعیت runtime محلی حاضر است.',
    'runtime.recovery.item.session.title': 'نشست',
    'runtime.recovery.loaded': 'بارگذاری شد',
    'runtime.recovery.missing': 'کم است',
    'runtime.recovery.notes': 'یادداشت‌های بازیابی',
    'runtime.recovery.optional': 'اختیاری',
    'runtime.recovery.partial': 'نیمه‌کامل',
    'runtime.recovery.progress': '{loaded}/{total} بارگذاری شده',
    'runtime.recovery.recovered': 'بازیابی شد',
    'runtime.recovery.title': 'وضعیت بازیابی',
    'runtime.roleNotice':
      'در حال کار به‌عنوان {name} ({participantId}). بازنشانی محلی فقط این مرورگر را پاک می‌کند؛ وضعیت سرور دست‌نخورده می‌ماند.',
    'runtime.session.create': 'ساخت نشست',
    'runtime.session.disconnectSse': 'قطع جریان SSE',
    'runtime.session.dmDisplayName': 'نام نمایشی DM',
    'runtime.session.dmParticipantId': 'شناسه participant برای DM',
    'runtime.session.join': 'پیوستن به نشست',
    'runtime.session.localReset': 'بازنشانی محلی',
    'runtime.session.playerDisplayName': 'نام نمایشی بازیکن',
    'runtime.session.playerParticipantId': 'شناسه participant بازیکن',
    'runtime.session.recover': 'بازیابی',
    'runtime.session.sessionId': 'شناسه Session',
    'runtime.session.sessionIdPlaceholder':
      'شناسه Session موجود را برای بازیابی وارد کنید',
    'runtime.session.subscribeSse': 'اتصال SSE',
    'runtime.statePanel.activeScene': 'صحنه فعال',
    'runtime.statePanel.currentTurn': 'نوبت فعلی',
    'runtime.statePanel.description':
      'IDها و مدل‌های خواندنی فعلی که در این مرورگر بارگذاری شده‌اند.',
    'runtime.statePanel.encounter': 'برخورد',
    'runtime.statePanel.eyebrow': 'وضعیت میز',
    'runtime.statePanel.sceneName': 'نام صحنه',
    'runtime.statePanel.session': 'نشست',
    'runtime.statePanel.title': 'وضعیت',
    'runtime.turnTarget.advanceTurn': 'بردن به نوبت بعد',
    'runtime.turnTarget.attackTarget': 'حمله به هدف',
    'runtime.turnTarget.description':
      'کنترل‌های نوبت فرمان‌های محدود به بازیگر می‌فرستند؛ دکمه‌های غیرفعال پیش‌نیازهای کم‌شده را توضیح می‌دهند.',
    'runtime.turnTarget.eyebrow': 'برخورد',
    'runtime.turnTarget.initiative': '· ابتکار {initiative}',
    'runtime.turnTarget.target': 'هدف',
    'runtime.turnTarget.title': 'نوبت و هدف',
    'runtime.turnTarget.turnOrder': 'ترتیب نوبت',
    'runtime.turnTarget.usage': 'مصرف نوبت',
    'runtime.turnTarget.usageValue':
      '{movement} فوت، اکشن {action}، بونس {bonus}، ری‌اکشن {reaction}',
    'runtime.turnTarget.useAction': 'مصرف اکشن',
    'runtime.turnTarget.useBonus': 'مصرف بونس',
    'runtime.turnTarget.useReaction': 'مصرف ری‌اکشن',
    'runtime.overrides.actionUsed': 'اکشن مصرف شده',
    'runtime.overrides.bonusActionUsed': 'بونس اکشن مصرف شده',
    'runtime.overrides.conditionTags': 'تگ‌های وضعیت',
    'runtime.overrides.controlledParticipant': 'participant تحت کنترل',
    'runtime.overrides.currentHp': 'HP فعلی',
    'runtime.overrides.description':
      'overrideهای مدیریتی DM. این کنترل‌ها عمدا از جریان عادی برخورد جدا هستند.',
    'runtime.overrides.endEncounter': 'پایان برخورد',
    'runtime.overrides.eyebrow': 'فقط DM',
    'runtime.overrides.movementUsed': 'حرکت مصرف‌شده',
    'runtime.overrides.reactionUsed': 'ری‌اکشن مصرف شده',
    'runtime.overrides.setConditions': 'ثبت وضعیت‌ها',
    'runtime.overrides.setHp': 'ثبت HP',
    'runtime.overrides.setTurnActor': 'ثبت بازیگر نوبت',
    'runtime.overrides.setUsage': 'ثبت مصرف نوبت',
    'runtime.overrides.title': 'Overrideها',
    'runtime.overrides.turnOverride': 'Override نوبت',
    'runtime.statusOverview.description':
      'فقط از مدل‌های خواندنی فعلی ساخته می‌شود؛ اعتبارسنجی فرمان‌ها همچنان روی سرور است.',
    'runtime.statusOverview.dmReadiness': 'آماده‌سازی DM',
    'runtime.statusOverview.eyebrow': 'وضعیت runtime',
    'runtime.statusOverview.nextAction': 'اقدام قابل‌مشاهده بعدی',
    'runtime.statusOverview.nextAction.dmDetail':
      'در انتظار اقدام بعدی DM روی میز تحت مرجعیت سرور.',
    'runtime.statusOverview.nextAction.ownerDetail': 'مسئول',
    'runtime.statusOverview.nextAction.playerDetail':
      'اقدام قابل‌مشاهده بعدی بازیکن آماده است.',
    'runtime.statusOverview.nextAction.tableDetail':
      'در انتظار پیش‌نیازهای میز یا مدل‌های خواندنی بارگذاری‌شده فعلی.',
    'runtime.statusOverview.playerReadiness': 'آمادگی بازیکن',
    'runtime.statusOverview.readiness': 'آمادگی',
    'runtime.statusOverview.readinessProgress': '{completed}/{total} تکمیل',
    'runtime.statusOverview.recovery': 'مدل‌های خواندنی',
    'runtime.statusOverview.recoveryModels': '{loaded}/{total} بارگذاری شده',
    'runtime.statusOverview.title': 'جریان میز',
    'runtime.statusOverview.turn': 'نوبت',
    'runtime.statusOverview.turnActive': '{actor}',
    'runtime.statusOverview.turnInactive': 'بازیگر فعالی نیست',
    'runtime.statusOverview.waiting.dm': 'اقدام DM',
    'runtime.statusOverview.waiting.player': 'اقدام بازیکن',
    'runtime.statusOverview.waiting.table': 'انتظار میز',
    'runtime.statusOverview.waitingProgress': '{count} در انتظار',
    'runtime.roster.assignment': 'تخصیص',
    'runtime.roster.assignment.assigned':
      'کاراکتر runtime {characterId} تخصیص یافته',
    'runtime.roster.assignment.needsCharacter': 'به کاراکتر runtime نیاز دارد',
    'runtime.roster.assignment.pendingAssignment':
      'نسخه runtime {characterId} در انتظار تخصیص توسط DM',
    'runtime.roster.connection.connected': 'متصل',
    'runtime.roster.connection.disconnected': 'قطع‌شده',
    'runtime.roster.currentTurnId': 'نوبت: {participantId}',
    'runtime.roster.currentTurnPlayer': 'نوبت: {name}',
    'runtime.roster.description':
      'وضعیت آماده‌سازی هر بازیکن از مدل‌های خواندنی نشست، جای‌گذاری صحنه فعال و برخورد.',
    'runtime.roster.emptyDetail':
      'بازیکن‌ها را به میز بپیوندانید تا فهرست آمادگی پر شود.',
    'runtime.roster.emptyTitle': 'بازیکنی روی میز نیست',
    'runtime.roster.encounter': 'برخورد',
    'runtime.roster.encounter.currentTurn': 'نوبت فعلی',
    'runtime.roster.encounter.noEncounter': 'برخورد فعالی نیست',
    'runtime.roster.encounter.notInEncounter': 'در ترتیب نوبت نیست',
    'runtime.roster.encounter.waitingTurn': 'در انتظار نوبت',
    'runtime.roster.eyebrow': 'فهرست آمادگی',
    'runtime.roster.placement': 'جای‌گذاری',
    'runtime.roster.placement.needsAssignment':
      'قبل از جای‌گذاری به تخصیص نیاز دارد',
    'runtime.roster.placement.needsPlacement': 'به جای‌گذاری توکن نیاز دارد',
    'runtime.roster.placement.placed': 'قرار داده شده',
    'runtime.roster.placement.placedAt': 'قرارگرفته در {x},{y}',
    'runtime.roster.placement.waitingScene': 'در انتظار صحنه فعال',
    'runtime.roster.readySummary': '{ready}/{total} آماده روی صفحه نبرد',
    'runtime.roster.setup.needsCharacter': 'نیازمند کاراکتر',
    'runtime.roster.setup.needsPlacement': 'نیازمند جای‌گذاری',
    'runtime.roster.setup.pendingAssignment': 'در انتظار DM',
    'runtime.roster.setup.ready': 'آماده روی صفحه نبرد',
    'runtime.roster.setup.waitingScene': 'در انتظار صحنه',
    'runtime.roster.title': 'فهرست بازیکن‌ها',
    'runtime.rosterPanel.description.dm':
      'همه کاراکترهای بازیکن‌های نشسته روی میز.',
    'runtime.rosterPanel.description.player':
      'کاراکتر بارگذاری‌شده شما از خواندنی‌ها و رخدادهای سرور.',
    'runtime.rosterPanel.emptyDetail':
      'بازیکن‌ها را به میز بپیوندانید یا یک سناریوی نمایشی نام‌دار اجرا کنید.',
    'runtime.rosterPanel.emptyTitle': 'بازیکنی بارگذاری نشده',
    'runtime.rosterPanel.eyebrow': 'فهرست',
    'runtime.rosterPanel.title': 'کاراکترها',
    'runtime.assignmentHelper.assigned': 'تخصیص‌یافته',
    'runtime.assignmentHelper.knownCharacter': 'کاراکتر شناخته‌شده',
    'runtime.assignmentHelper.pending': 'در انتظار',
    'runtime.assignmentHelper.player': 'بازیکن',
    'runtime.assignmentHelper.submit': 'تخصیص کاراکتر بارگذاری‌شده',
    'runtime.assignmentHelper.title': 'دستیار تخصیص',
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
    'runtime.tableSetup.item.session.blocked': 'ساخت نشست',
    'runtime.tableSetup.item.session.done': 'نشست بارگذاری شد',
    'runtime.tableSetup.item.session.ready': 'ساخت نشست',
    'runtime.tableSetup.detail.characters.blocked':
      'بازیکن‌ها باید قبل از تخصیص کاراکترها به میز بپیوندند.',
    'runtime.tableSetup.detail.characters.done':
      'کاراکترهای تخصیص‌یافته برای میز آماده‌اند.',
    'runtime.tableSetup.detail.characters.ready':
      'حداقل یک کاراکتر نهایی‌شده بازیکن را تخصیص دهید.',
    'runtime.tableSetup.detail.encounter.blocked':
      'قبل از شروع برخورد حداقل یک توکن قرار دهید.',
    'runtime.tableSetup.detail.encounter.done':
      'یک برخورد فعال است و کنترل‌های نوبت آماده‌اند.',
    'runtime.tableSetup.detail.encounter.ready':
      'وقتی میز برای ترتیب نوبت آماده است برخورد را شروع کنید.',
    'runtime.tableSetup.detail.placement.blocked':
      'ابتدا به تخصیص کاراکترها و صحنه فعال نیاز است.',
    'runtime.tableSetup.detail.placement.done':
      'توکن‌ها در صحنه فعال قرار گرفته‌اند.',
    'runtime.tableSetup.detail.placement.ready':
      'کاراکترهای تخصیص‌یافته را در صحنه فعال قرار دهید.',
    'runtime.tableSetup.detail.players.blocked':
      'قبل از پیوستن بازیکن‌ها به وضعیت نشست نیاز است.',
    'runtime.tableSetup.detail.players.done': 'بازیکن‌ها روی میز نشسته‌اند.',
    'runtime.tableSetup.detail.players.ready':
      'قبل از تخصیص کاراکترها حداقل یک بازیکن را به میز بپیوندانید.',
    'runtime.tableSetup.detail.scene.blocked':
      'بعد از ساخته شدن نشست یک صحنه بسازید و فعال کنید.',
    'runtime.tableSetup.detail.scene.done':
      'یک صحنه فعال برای میز بارگذاری شده است.',
    'runtime.tableSetup.detail.scene.ready':
      'یک صحنه فعال برای میز بسازید یا بازیابی کنید.',
    'runtime.tableSetup.detail.session.blocked':
      'قبل از بارگذاری میز نشست را بسازید یا بازیابی کنید.',
    'runtime.tableSetup.detail.session.done': 'وضعیت نشست بارگذاری شده است.',
    'runtime.tableSetup.detail.session.ready':
      'قبل از بارگذاری میز نشست را بسازید یا بازیابی کنید.',
    'runtime.tableSetup.readyForPlay': 'میز برای بازی آماده است.',
    'runtime.tableSetup.status.blocked': 'صبر',
    'runtime.tableSetup.status.done': 'انجام شد',
    'runtime.tableSetup.status.ready': 'بعدی',
    'runtime.tableSetup.title': 'آماده‌سازی میز',
    'runtime.actionEconomy.action': 'اکشن',
    'runtime.actionEconomy.available': 'آزاد',
    'runtime.actionEconomy.blocked': 'مسدود',
    'runtime.actionEconomy.bonusAction': 'بونس',
    'runtime.actionEconomy.latest': '{reason} - راند {round}، نوبت {turn}',
    'runtime.actionEconomy.noEncounter': 'نوبت فعالی نیست',
    'runtime.actionEconomy.noLatest':
      'هنوز به‌روزرسانی action economy ثبت نشده.',
    'runtime.actionEconomy.reaction': 'ری‌اکشن',
    'runtime.actionEconomy.ready': 'آماده',
    'runtime.actionEconomy.resource': '{name}: {state}',
    'runtime.actionEconomy.spent': 'همه مصرف شده',
    'runtime.actionEconomy.title': 'اقتصاد اکشن',
    'runtime.actionEconomy.unavailable': 'اقتصاد اکشن در دسترس نیست.',
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
    'runtime.outbox.refresh': 'بررسی صف خروجی',
    'runtime.outbox.status.backlog': 'صف خروجی {count}',
    'runtime.outbox.status.clear': 'صف خروجی پاک',
    'runtime.outbox.status.error': 'صف خروجی در دسترس نیست',
    'runtime.outbox.status.loading': 'صف خروجی ...',
    'runtime.outbox.status.off': 'صف خروجی خاموش',
    'runtime.outbox.status.unknown': 'صف خروجی -',
    'runtime.status.busy': 'درگیر: {label}',
    'runtime.status.stream': 'جریان {status}',
    'runtime.status.streamIdle': 'جریان غیرفعال',
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
