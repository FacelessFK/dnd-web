#!/usr/bin/env node
/**
 * The M1 backend across a real server restart.
 *
 * This is not the browser acceptance smoke. There is no M1 web UI yet, so this
 * drives the authenticated HTTP command routes and the SSE stream directly. It
 * is here to answer one question the unit tests structurally cannot: does the
 * authoritative state come back when the process that produced it is gone?
 *
 * "Restart" means what it says. Process A is spawned, killed, its PID confirmed
 * reaped and its port confirmed closed; process B is a separate spawn with a
 * different PID against the same database. A second runtime object inside one
 * process would prove nothing about persistence.
 *
 * Each run provisions its own database and drops it afterwards, so three
 * consecutive runs are three clean rooms rather than one accumulating one.
 *
 * Determinism without pinning dice: the server's rollers are real, so this
 * asserts *rules* rather than remembered faces. A replayed command must return
 * a byte-identical resolution - including its UUID, which a re-roll could not
 * coincidentally reproduce - and a poisoned attack must report two dice with the
 * lower one selected, whatever those two dice happen to be.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import pg from 'pg';

const { Client } = pg;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(scriptDir, '..');
const repoRoot = resolve(serverDir, '../..');
const dbDir = resolve(repoRoot, 'packages/db');
const smokeTimeoutMs = Number.parseInt(
  process.env.M1_DB_SMOKE_TIMEOUT_MS ?? '120000',
  10,
);

const processLogs = new Map();
const startedProcesses = [];
let provisioned = null;

main().catch(async (error) => {
  console.error('\n[m1-db-restart-smoke] failed');
  console.error(redact(error instanceof Error ? error.stack : String(error)));
  printProcessLogs();
  await cleanup();
  process.exit(1);
});

async function main() {
  const adminUrl = requireDatabaseUrl();

  step('provisioning an isolated test database');
  provisioned = await provisionDatabase(adminUrl);

  step('applying migrations and verifying readiness');
  await runNodeScript(resolve(dbDir, 'scripts/apply-db-migrations.mjs'), {
    DATABASE_URL: provisioned.url,
  });
  await runNodeScript(resolve(dbDir, 'scripts/check-db-readiness.mjs'), {
    DATABASE_URL: provisioned.url,
  });

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const unique = randomUUID().slice(0, 8);
  const gm = {
    displayName: `GM ${unique}`,
    email: `m1-gm-${unique}@example.test`,
    password: `m1-gm-password-${unique}`,
  };
  const player = {
    displayName: `Player ${unique}`,
    email: `m1-player-${unique}@example.test`,
    password: `m1-player-password-${unique}`,
  };
  const intruder = {
    displayName: `Intruder ${unique}`,
    email: `m1-intruder-${unique}@example.test`,
    password: `m1-intruder-password-${unique}`,
  };

  step('starting server process A');
  const processA = await startServer('server-a', port, provisioned.url);
  await waitForHttp(`${baseUrl}/`);
  console.log(`[m1-db-restart-smoke]   process A pid=${processA.pid}`);

  step('authenticating GM and Player accounts');
  const gmAuth = await register(baseUrl, gm);
  const playerAuth = await register(baseUrl, player);
  // Registered before the restart so the hostile-recovery attempt afterwards is
  // a real account rather than an unknown one - the interesting case.
  await register(baseUrl, intruder);

  step('creating the session and binding both seats');
  const created = await command(
    baseUrl,
    '/api/session/command',
    {
      commandId: `create-session-${unique}`,
      type: 'create_session',
      actor: {
        participantId: 'dm-001',
        displayName: 'Dungeon Master',
        role: 'dm',
      },
      payload: { rulesProfileId: 'dnd5e-2024-core' },
    },
    { cookie: gmAuth.cookie },
  );
  const sessionId = created.data.sessionId;
  const gmTokenBefore = created.data.participantToken;

  const joined = await command(
    baseUrl,
    '/api/session/command',
    {
      commandId: `join-session-${unique}`,
      type: 'join_session',
      actor: {
        participantId: 'player-001',
        displayName: 'Player One',
        role: 'player',
      },
      payload: { sessionId },
    },
    { cookie: playerAuth.cookie },
  );
  const playerTokenBefore = joined.data.participantToken;

  assert(
    gmTokenBefore && playerTokenBefore,
    'both seats were issued credentials',
  );

  step('assigning the runtime character from a Character Library entry');
  const libraryEntry = await createLibraryEntry(baseUrl, playerAuth, unique);
  const submitted = await command(
    baseUrl,
    '/api/characters/command',
    {
      commandId: `bridge-entry-${unique}`,
      type: 'submit_character_library_entry_for_assignment',
      actor: { participantId: 'player-001' },
      payload: {
        sessionId,
        entryId: libraryEntry.id,
        ownerParticipantId: playerAuth.ownerParticipantId,
      },
    },
    { cookie: playerAuth.cookie, participantToken: playerTokenBefore },
  );
  const characterId = submitted.data.characterId;

  await command(
    baseUrl,
    '/api/characters/command',
    {
      commandId: `assign-character-${unique}`,
      type: 'assign_character_to_participant',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, participantId: 'player-001', characterId },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  assert(characterId, 'the bridge produced a runtime character');

  step('building the scene, combatants and encounter');
  const scene = await command(
    baseUrl,
    '/api/scenes/command',
    {
      commandId: `create-scene-${unique}`,
      type: 'create_scene',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        scene: {
          name: 'Restart Hall',
          grid: { width: 10, height: 8, cellSizeFeet: 5 },
        },
      },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );
  const sceneId = scene.data.scene.id;

  await command(
    baseUrl,
    '/api/scenes/command',
    {
      commandId: `activate-scene-${unique}`,
      type: 'activate_scene_for_session',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, sceneId },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  await command(
    baseUrl,
    '/api/movement/command',
    {
      commandId: `place-player-${unique}`,
      type: 'place_character_in_active_scene',
      actor: { participantId: 'player-001' },
      payload: {
        sessionId,
        participantId: 'player-001',
        position: { x: 0, y: 0 },
      },
    },
    { cookie: playerAuth.cookie, participantToken: playerTokenBefore },
  );

  const visibleScene = await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `create-visible-combatant-${unique}`,
      type: 'dm_create_combatant_in_active_scene',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        combatant: combatantInput('Visible Ghoul', { x: 1, y: 0 }),
      },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );
  const visibleCombatantId = visibleScene.data.scene.entities.find(
    (entity) => entity.combatant && entity.name === 'Visible Ghoul',
  ).id;

  const hiddenScene = await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `create-hidden-combatant-${unique}`,
      type: 'dm_create_combatant_in_active_scene',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        combatant: combatantInput('Lurking Ghoul', { x: 3, y: 3 }),
      },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );
  const hiddenCombatantId = hiddenScene.data.scene.entities.find(
    (entity) => entity.combatant && entity.name === 'Lurking Ghoul',
  ).id;

  await command(
    baseUrl,
    '/api/encounters/command',
    {
      commandId: `start-encounter-${unique}`,
      type: 'start_encounter',
      actor: { participantId: 'dm-001' },
      payload: { sessionId },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `set-turn-${unique}`,
      type: 'dm_set_current_turn_participant',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, participantId: 'player-001' },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  step('requesting and resolving an ability check');
  const checkRequestId = await requestResolution(baseUrl, {
    commandId: `request-check-${unique}`,
    cookie: gmAuth.cookie,
    dc: 12,
    kind: 'ability_check',
    participantToken: gmTokenBefore,
    sessionId,
  });
  const checkSubmitCommandId = `submit-check-${unique}`;
  const checkResult = await command(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: checkSubmitCommandId,
      type: 'submit_resolution',
      actor: { participantId: 'player-001' },
      payload: { sessionId, requestId: checkRequestId },
    },
    { cookie: playerAuth.cookie, participantToken: playerTokenBefore },
  );
  const checkResolution = checkResult.data.state.resolutions.at(-1);

  assert(
    checkResolution.kind === 'ability_check',
    'the check resolved as a check',
  );

  step('requesting and resolving a saving throw');
  const saveRequestId = await requestResolution(baseUrl, {
    commandId: `request-save-${unique}`,
    cookie: gmAuth.cookie,
    dc: 11,
    kind: 'saving_throw',
    participantToken: gmTokenBefore,
    sessionId,
  });
  const saveResult = await command(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: `submit-save-${unique}`,
      type: 'submit_resolution',
      actor: { participantId: 'player-001' },
      payload: { sessionId, requestId: saveRequestId },
    },
    { cookie: playerAuth.cookie, participantToken: playerTokenBefore },
  );
  const saveResolution = saveResult.data.state.resolutions.at(-1);

  assert(saveResolution.kind === 'saving_throw', 'the save resolved as a save');
  assert(
    saveResolution.stance === 'normal' && saveResolution.dice.length === 1,
    'the save was rolled before poisoned was applied',
  );

  step('leaving one request pending and cancelling another');
  const pendingRequestId = await requestResolution(baseUrl, {
    commandId: `request-pending-${unique}`,
    cookie: gmAuth.cookie,
    dc: 18,
    kind: 'ability_check',
    participantToken: gmTokenBefore,
    sessionId,
  });
  const cancelledRequestId = await requestResolution(baseUrl, {
    commandId: `request-cancelled-${unique}`,
    cookie: gmAuth.cookie,
    dc: 9,
    kind: 'ability_check',
    participantToken: gmTokenBefore,
    sessionId,
  });
  await command(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: `cancel-${unique}`,
      type: 'cancel_resolution_request',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, requestId: cancelledRequestId },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  step('applying poisoned and proving it changes the attack roll');
  await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `poison-${unique}`,
      type: 'dm_set_character_active_conditions',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        participantId: 'player-001',
        characterId,
        activeConditions: ['poisoned'],
      },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  const attack = await command(
    baseUrl,
    '/api/encounters/command',
    {
      commandId: `attack-poisoned-${unique}`,
      type: 'attack',
      actor: { participantId: 'player-001' },
      payload: { sessionId, targetCombatantId: visibleCombatantId },
    },
    { cookie: playerAuth.cookie, participantToken: playerTokenBefore },
  );

  assert(attack.ok === true, 'the poisoned attack resolved');

  step('submitting and deciding a player intent');
  const intentText = 'من پشت ستون سنگر می‌گیرم.';
  const intentResult = await command(
    baseUrl,
    '/api/intents/command',
    {
      commandId: `intent-${unique}`,
      type: 'submit_player_intent',
      actor: { participantId: 'player-001' },
      payload: { sessionId, text: intentText },
    },
    { cookie: playerAuth.cookie, participantToken: playerTokenBefore },
  );
  const intentId = intentResult.data.state.intents.at(-1).id;

  await command(
    baseUrl,
    '/api/intents/command',
    {
      commandId: `intent-status-${unique}`,
      type: 'update_player_intent_status',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        intentId,
        status: 'resolved',
        gmNote: 'The pillar holds.',
      },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  step('concealing one combatant and leaving the other visible');
  await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `conceal-${unique}`,
      type: 'dm_set_combatant_hidden',
      actor: { participantId: 'dm-001' },
      payload: { sessionId, combatantId: hiddenCombatantId, hidden: true },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  step('recording the authoritative state before the restart');
  const encounterBefore = (
    await command(
      baseUrl,
      '/api/encounters/command',
      {
        commandId: `read-encounter-before-${unique}`,
        type: 'get_encounter_state',
        actor: { participantId: 'dm-001' },
        payload: { sessionId },
      },
      { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
    )
  ).data.encounter;
  const characterBefore = (
    await command(
      baseUrl,
      '/api/characters/command',
      {
        commandId: `read-character-before-${unique}`,
        type: 'get_character',
        actor: { participantId: 'dm-001' },
        payload: { sessionId, characterId },
      },
      { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
    )
  ).data;
  const libraryBefore = await readLibraryEntry(
    baseUrl,
    playerAuth,
    libraryEntry.id,
  );

  step('stopping server process A');
  await stopProcess(processA);
  assertProcessGone(processA.pid);
  await assertPortClosed(port);
  console.log(`[m1-db-restart-smoke]   process A pid=${processA.pid} is gone`);

  step('starting a distinct server process B on the same database');
  const processB = await startServer('server-b', port, provisioned.url);
  await waitForHttp(`${baseUrl}/`);
  console.log(`[m1-db-restart-smoke]   process B pid=${processB.pid}`);
  assert(
    processB.pid !== processA.pid,
    `process B pid ${processB.pid} differs from process A pid ${processA.pid}`,
  );

  step('confirming the pre-restart participant credentials no longer work');
  const staleGm = await rawCommand(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: `stale-gm-${unique}`,
      type: 'request_resolution',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        kind: 'ability_check',
        targetParticipantId: 'player-001',
        ability: 'wis',
        dc: 10,
      },
    },
    { cookie: gmAuth.cookie, participantToken: gmTokenBefore },
  );

  assert(
    staleGm.status === 401,
    `stale GM credential is refused (got ${staleGm.status})`,
  );

  const staleReconnect = await rawCommand(
    baseUrl,
    '/api/session/command',
    {
      commandId: `stale-reconnect-${unique}`,
      type: 'reconnect_session',
      actor: { participantId: 'player-001', role: 'player' },
      payload: { sessionId },
    },
    { participantToken: playerTokenBefore },
  );

  assert(
    staleReconnect.status === 401,
    `an unauthenticated reconnect with a stale token is refused (got ${staleReconnect.status})`,
  );

  step('recovering both seats with reauthenticated accounts');
  const gmAuthAfter = await login(baseUrl, gm);
  const gmRecovered = await command(
    baseUrl,
    '/api/session/command',
    {
      commandId: `recover-gm-${unique}`,
      type: 'reconnect_session',
      actor: { participantId: 'dm-001', role: 'dm' },
      payload: { sessionId },
    },
    { cookie: gmAuthAfter.cookie },
  );
  const gmTokenAfter = gmRecovered.data.participantToken;

  const playerAuthAfter = await login(baseUrl, player);
  const playerRecovered = await command(
    baseUrl,
    '/api/session/command',
    {
      commandId: `recover-player-${unique}`,
      type: 'reconnect_session',
      actor: { participantId: 'player-001', role: 'player' },
      payload: { sessionId },
    },
    { cookie: playerAuthAfter.cookie },
  );
  const playerTokenAfter = playerRecovered.data.participantToken;

  assert(
    gmTokenAfter && gmTokenAfter !== gmTokenBefore,
    'the GM received a new credential',
  );
  assert(
    playerTokenAfter && playerTokenAfter !== playerTokenBefore,
    'the player received a new credential',
  );

  step('confirming an unrelated account cannot recover the player seat');
  const intruderAuthAfter = await login(baseUrl, intruder);
  const hostile = await rawCommand(
    baseUrl,
    '/api/session/command',
    {
      commandId: `hostile-recover-${unique}`,
      type: 'reconnect_session',
      actor: { participantId: 'player-001', role: 'player' },
      payload: { sessionId },
    },
    { cookie: intruderAuthAfter.cookie },
  );

  // The precise signal matters. Recovery is the only path that skips the
  // participant-credential gate, so if the binding check had wrongly matched
  // this account the intruder would have been let straight through with a 200.
  // Being stopped at the credential gate is proof the binding refused them.
  assert(
    hostile.status === 401 && hostile.body.error?.code === 'unauthenticated',
    `an unrelated account is not recovered into the player seat (got ${hostile.status} ${hostile.body.error?.code ?? ''})`,
  );

  const playerStillWorks = await rawCommand(
    baseUrl,
    '/api/intents/command',
    {
      commandId: `post-hostile-intent-${unique}`,
      type: 'submit_player_intent',
      actor: { participantId: 'player-001' },
      payload: { sessionId, text: 'Still here.' },
    },
    { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
  );

  assert(
    playerStillWorks.status === 200,
    'the failed hostile recovery did not invalidate the legitimate seat',
  );

  step('verifying persisted session, scene and encounter state');
  const snapshotAfter = gmRecovered.data.state;
  const dmSeat = snapshotAfter.participants.find(
    (entry) => entry.id === 'dm-001',
  );
  const playerSeat = snapshotAfter.participants.find(
    (entry) => entry.id === 'player-001',
  );

  assert(dmSeat?.role === 'dm', 'the GM seat survived');
  assert(
    playerSeat?.characterId === characterId,
    'the runtime character assignment survived',
  );
  assert(
    !JSON.stringify(snapshotAfter).includes(gmAuthAfter.userId),
    'no account identifier leaks into session state',
  );

  const encounterAfter = (
    await command(
      baseUrl,
      '/api/encounters/command',
      {
        commandId: `read-encounter-after-${unique}`,
        type: 'get_encounter_state',
        actor: { participantId: 'dm-001' },
        payload: { sessionId },
      },
      { cookie: gmAuthAfter.cookie, participantToken: gmTokenAfter },
    )
  ).data.encounter;

  assertDeepEqual(
    encounterAfter.participants.length,
    encounterBefore.participants.length,
    'encounter slot count',
  );
  assertDeepEqual(
    encounterAfter.currentTurnIndex,
    encounterBefore.currentTurnIndex,
    'currentTurnIndex',
  );
  assertDeepEqual(
    encounterAfter.participants.map((entry) => entry.initiative),
    encounterBefore.participants.map((entry) => entry.initiative),
    'initiative order',
  );

  const dmScene = (
    await command(
      baseUrl,
      '/api/scenes/command',
      {
        commandId: `read-scene-dm-${unique}`,
        type: 'get_scene',
        actor: { participantId: 'dm-001' },
        payload: { sessionId, sceneId },
      },
      { cookie: gmAuthAfter.cookie, participantToken: gmTokenAfter },
    )
  ).data.scene;
  const playerScene = (
    await command(
      baseUrl,
      '/api/scenes/command',
      {
        commandId: `read-scene-player-${unique}`,
        type: 'get_scene',
        actor: { participantId: 'player-001' },
        payload: { sessionId, sceneId },
      },
      { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
    )
  ).data.scene;

  assert(
    dmScene.entities.some(
      (entity) => entity.id === hiddenCombatantId && entity.hidden,
    ),
    'the concealed combatant is still concealed for the GM',
  );
  assert(
    !playerScene.entities.some((entity) => entity.id === hiddenCombatantId),
    'the concealed combatant is still withheld from the player scene',
  );
  assert(
    playerScene.entities.some((entity) => entity.id === visibleCombatantId),
    'the revealed combatant is still visible to the player',
  );

  const playerEncounter = (
    await command(
      baseUrl,
      '/api/encounters/command',
      {
        commandId: `read-encounter-player-${unique}`,
        type: 'get_encounter_state',
        actor: { participantId: 'player-001' },
        payload: { sessionId },
      },
      { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
    )
  ).data.encounter;

  assert(
    !JSON.stringify(playerEncounter).includes(hiddenCombatantId),
    'the concealed combatant ID stays out of the player encounter after restart',
  );
  assert(
    playerEncounter.participants.some(
      (entry) => entry.kind === 'concealed_combatant',
    ),
    'the player encounter keeps a concealed slot',
  );
  assertDeepEqual(
    playerEncounter.participants.length,
    encounterAfter.participants.length,
    'player encounter slot count',
  );

  step('verifying HP and the poisoned condition survived');
  const characterAfter = (
    await command(
      baseUrl,
      '/api/characters/command',
      {
        commandId: `read-character-after-${unique}`,
        type: 'get_character',
        actor: { participantId: 'dm-001' },
        payload: { sessionId, characterId },
      },
      { cookie: gmAuthAfter.cookie, participantToken: gmTokenAfter },
    )
  ).data;

  assertDeepEqual(
    characterAfter.character.hp,
    characterBefore.character.hp,
    'HP',
  );
  assert(
    characterAfter.overlay.activeConditions.includes('poisoned'),
    'poisoned survived the restart',
  );

  step('proving poisoned still changes the authoritative attack stance');
  await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `reset-usage-${unique}`,
      type: 'dm_set_current_turn_usage',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        turnUsage: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          movementUsed: 0,
        },
      },
    },
    { cookie: gmAuthAfter.cookie, participantToken: gmTokenAfter },
  );

  const gmStream = await openStream(baseUrl, sessionId, 'dm-001', gmTokenAfter);
  const playerStream = await openStream(
    baseUrl,
    sessionId,
    'player-001',
    playerTokenAfter,
  );

  await command(
    baseUrl,
    '/api/encounters/command',
    {
      commandId: `attack-after-restart-${unique}`,
      type: 'attack',
      actor: { participantId: 'player-001' },
      payload: { sessionId, targetCombatantId: visibleCombatantId },
    },
    { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
  );

  await waitFor(
    () => gmStream.framesNamed('combat_event').length > 0,
    'the GM stream received the post-restart combat event',
  );

  const postRestartRoll = gmStream.framesNamed('combat_event').at(-1).roll;

  assert(
    postRestartRoll.stance === 'disadvantage',
    'poisoned still imposes disadvantage',
  );
  assert(postRestartRoll.dice.length === 2, 'poisoned still rolls two dice');
  assert(
    postRestartRoll.d20 === Math.min(...postRestartRoll.dice),
    `the lower die still counted (${JSON.stringify(postRestartRoll.dice)} -> ${postRestartRoll.d20})`,
  );
  assert(
    postRestartRoll.stanceSources?.some(
      (source) => source.detail === 'poisoned',
    ),
    'the event still names poisoned as the stance source',
  );

  step('proving removing poisoned restores the normal stance');
  await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `cure-${unique}`,
      type: 'dm_set_character_active_conditions',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        participantId: 'player-001',
        characterId,
        activeConditions: [],
      },
    },
    { cookie: gmAuthAfter.cookie, participantToken: gmTokenAfter },
  );
  await command(
    baseUrl,
    '/api/dm/command',
    {
      commandId: `reset-usage-2-${unique}`,
      type: 'dm_set_current_turn_usage',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId,
        turnUsage: {
          actionUsed: false,
          bonusActionUsed: false,
          reactionUsed: false,
          movementUsed: 0,
        },
      },
    },
    { cookie: gmAuthAfter.cookie, participantToken: gmTokenAfter },
  );
  await command(
    baseUrl,
    '/api/encounters/command',
    {
      commandId: `attack-cured-${unique}`,
      type: 'attack',
      actor: { participantId: 'player-001' },
      payload: { sessionId, targetCombatantId: visibleCombatantId },
    },
    { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
  );

  await waitFor(
    () => gmStream.framesNamed('combat_event').length > 1,
    'the GM stream received the cured combat event',
  );

  const curedRoll = gmStream.framesNamed('combat_event').at(-1).roll;

  assert(
    curedRoll.stance === 'normal',
    'removing poisoned restored the normal stance',
  );
  assert(curedRoll.dice.length === 1, 'a cured attack rolls one die again');

  step('continuing the session with new post-restart commands');
  const postRestartIntentText = 'I check the ledger for the missing page.';

  await command(
    baseUrl,
    '/api/intents/command',
    {
      commandId: `post-restart-intent-${unique}`,
      type: 'submit_player_intent',
      actor: { participantId: 'player-001' },
      payload: { sessionId, text: postRestartIntentText },
    },
    { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
  );

  // The GM's authoritative view of the table comes back on the next command
  // they issue, and on their stream. Both are reads of the recovered server,
  // which is the thing under test - querying the database directly would only
  // prove the rows exist, not that the process rebuilt its state from them.
  const probeRequestId = await requestResolution(baseUrl, {
    commandId: `post-restart-request-${unique}`,
    cookie: gmAuthAfter.cookie,
    dc: 14,
    kind: 'ability_check',
    participantToken: gmTokenAfter,
    reason: 'GM-only rationale that must not reach an unrelated stream.',
    sessionId,
  });
  const gmTable = lastRequestResolutionState;

  step('verifying the persisted resolution audit and request statuses');
  const recoveredCheck = gmTable.resolutions.find(
    (entry) => entry.id === checkResolution.id,
  );
  const recoveredSave = gmTable.resolutions.find(
    (entry) => entry.id === saveResolution.id,
  );

  assertDeepEqual(
    recoveredCheck,
    checkResolution,
    'the persisted check audit record',
  );
  assertDeepEqual(
    recoveredSave,
    saveResolution,
    'the persisted save audit record',
  );

  const statusById = new Map(
    gmTable.requests.map((entry) => [entry.id, entry.status]),
  );

  assertDeepEqual(
    statusById.get(checkRequestId),
    'resolved',
    'resolved check status',
  );
  assertDeepEqual(
    statusById.get(saveRequestId),
    'resolved',
    'resolved save status',
  );
  assertDeepEqual(
    statusById.get(pendingRequestId),
    'pending',
    'pending request status',
  );
  assertDeepEqual(
    statusById.get(cancelledRequestId),
    'cancelled',
    'cancelled request status',
  );
  assertDeepEqual(
    gmTable.requests
      .filter((entry) => entry.status === 'pending')
      .map((entry) => entry.id)
      .sort(),
    [pendingRequestId, probeRequestId].sort(),
    'exactly the pre-restart pending request and the new one are pending',
  );

  step('verifying the persisted intent and its terminal status');
  await waitFor(
    () => gmStream.framesNamed('player_intent_state').length > 0,
    'the GM stream received the post-restart intent event',
  );

  const gmIntents = gmStream.framesNamed('player_intent_state').at(-1)
    .state.intents;
  const recoveredIntent = gmIntents.find((entry) => entry.id === intentId);

  assert(recoveredIntent, 'the pre-restart intent survived');
  assertDeepEqual(
    recoveredIntent.text,
    intentText,
    'intent text, untranslated',
  );
  assertDeepEqual(recoveredIntent.status, 'resolved', 'intent terminal status');
  assertDeepEqual(recoveredIntent.gmNote, 'The pillar holds.', 'GM note');
  assert(
    gmIntents.some((entry) => entry.text === postRestartIntentText),
    'the GM sees the new post-restart intent',
  );

  step('verifying idempotency survived the restart');
  const replay = await command(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: checkSubmitCommandId,
      type: 'submit_resolution',
      actor: { participantId: 'player-001' },
      payload: { sessionId, requestId: checkRequestId },
    },
    { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
  );
  const replayedResolution = replay.data.state.resolutions.find(
    (entry) => entry.id === checkResolution.id,
  );

  assertDeepEqual(
    replayedResolution,
    checkResolution,
    'a replayed pre-restart command returns the identical roll',
  );

  const conflicting = await rawCommand(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: checkSubmitCommandId,
      type: 'submit_resolution',
      actor: { participantId: 'player-001' },
      payload: { sessionId, requestId: pendingRequestId },
    },
    { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
  );

  assert(
    conflicting.status === 409 &&
      conflicting.body.error?.code === 'command_id_conflict',
    `a conflicting fingerprint is refused (got ${conflicting.status} ${conflicting.body.error?.code ?? ''})`,
  );

  const rerollAttempt = await rawCommand(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: `reroll-attempt-${unique}`,
      type: 'submit_resolution',
      actor: { participantId: 'player-001' },
      payload: { sessionId, requestId: checkRequestId },
    },
    { cookie: playerAuthAfter.cookie, participantToken: playerTokenAfter },
  );

  assert(
    rerollAttempt.status === 409 &&
      rerollAttempt.body.error?.code === 'resolution_request_already_resolved',
    `a resolved request cannot be rolled again under a new command ID (got ${rerollAttempt.status})`,
  );

  step('verifying GM and player projections on the recovered streams');
  await waitFor(
    () =>
      gmStream
        .framesNamed('resolution_state')
        .some((frame) =>
          frame.state.requests.some((entry) => entry.id === probeRequestId),
        ),
    'the GM stream carried the post-restart request',
  );
  await waitFor(
    () =>
      playerStream
        .framesNamed('resolution_state')
        .some((frame) =>
          frame.state.requests.some((entry) => entry.id === probeRequestId),
        ),
    'the addressed player stream carried the post-restart request',
  );

  assert(
    !playerStream.raw().includes(hiddenCombatantId),
    'no player stream frame carried the concealed combatant ID after restart',
  );
  assert(
    !playerStream.raw().includes(gmAuthAfter.userId) &&
      !playerStream.raw().includes(playerAuthAfter.userId),
    'no account identifier reached the player stream',
  );

  gmStream.close();
  playerStream.close();

  step('verifying the Character Library row was not touched by runtime state');
  const libraryAfter = await readLibraryEntry(
    baseUrl,
    playerAuthAfter,
    libraryEntry.id,
  );

  assertDeepEqual(libraryAfter.hp, libraryBefore.hp, 'library entry HP');
  assertDeepEqual(
    libraryAfter.updatedAt,
    libraryBefore.updatedAt,
    'library entry updatedAt',
  );
  assert(
    !JSON.stringify(libraryAfter).includes('poisoned'),
    'no runtime condition wrote back into the library entry',
  );
  assert(
    libraryAfter.id !== characterId,
    'the runtime character is a separate record from its library source',
  );
  assertDeepEqual(
    characterAfter.character.meta?.sourceCharacterLibraryEntryId,
    libraryEntry.id,
    'runtime provenance',
  );

  step('verifying outbox rows exist for the M1 events');
  const outboxCounts = await readOutboxEventCounts(provisioned.url);

  assert(
    (outboxCounts.resolution_state ?? 0) > 0,
    'resolution_state outbox rows were written',
  );
  assert(
    (outboxCounts.player_intent_state ?? 0) > 0,
    'player_intent_state outbox rows were written',
  );

  await stopProcess(processB);
  await cleanup();

  console.log('\n[m1-db-restart-smoke] passed');
}

// ------------------------------------------------------------------ helpers

function combatantInput(name, position) {
  return {
    kind: 'monster',
    name,
    position,
    footprint: { width: 1, height: 1 },
    hp: { max: 60, current: 60, temp: 0 },
    armorClass: 10,
    speed: 30,
    abilities: { str: 14, dex: 12, con: 12, int: 8, wis: 10, cha: 8 },
  };
}

/**
 * Issues a GM request and remembers the projection that came back with it.
 *
 * The M1 routes answer with the caller's own view of the table, so a GM command
 * doubles as the GM's read. There is no separate read command, and adding one
 * for the harness's convenience would be protocol surface invented for a test.
 */
let lastRequestResolutionState = { intents: [], requests: [], resolutions: [] };

async function requestResolution(baseUrl, params) {
  const response = await command(
    baseUrl,
    '/api/resolutions/command',
    {
      commandId: params.commandId,
      type: 'request_resolution',
      actor: { participantId: 'dm-001' },
      payload: {
        sessionId: params.sessionId,
        kind: params.kind,
        targetParticipantId: 'player-001',
        ability: params.kind === 'saving_throw' ? 'con' : 'dex',
        dc: params.dc,
        ...(params.reason ? { reason: params.reason } : {}),
      },
    },
    { cookie: params.cookie, participantToken: params.participantToken },
  );

  lastRequestResolutionState = {
    intents: [],
    requests: response.data.state.requests,
    resolutions: response.data.state.resolutions,
  };

  return response.data.state.requests.at(-1).id;
}

async function createLibraryEntry(baseUrl, auth, unique) {
  const created = await command(
    baseUrl,
    '/api/character-library/command',
    {
      commandId: `library-create-${unique}`,
      type: 'create_character_library_entry',
      actor: { participantId: auth.ownerParticipantId },
      payload: {
        ownerParticipantId: auth.ownerParticipantId,
        entry: {
          abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
          abilityScoreMethod: 'standard-array',
          armorClass: 14,
          background: 'Soldier',
          builderSelections: {
            cantrips: [],
            equipment: ['Explorer Pack'],
            languages: ['Common'],
            originFeatAbility: '',
            originFeatCantrips: [],
            originFeatSpell: '',
            skills: ['Athletics'],
            spells: [],
            tools: [],
          },
          builderStep: 'review',
          className: 'Fighter',
          concept: 'Restart survivor',
          hp: { current: 40, max: 40, temp: 0 },
          level: 5,
          name: `Restart Borin ${unique.slice(0, 4)}`,
          notes: 'Library source of truth.',
          rulesProfileId: 'dnd5e-2024-core',
          speciesOrRace: 'Dwarf',
          speed: 30,
        },
      },
    },
    { cookie: auth.cookie },
  );

  const finalized = await command(
    baseUrl,
    '/api/character-library/command',
    {
      commandId: `library-finalize-${unique}`,
      type: 'finalize_character_library_entry',
      actor: { participantId: auth.ownerParticipantId },
      payload: {
        entryId: created.data.entry.id,
        ownerParticipantId: auth.ownerParticipantId,
      },
    },
    { cookie: auth.cookie },
  );

  return finalized.data.entry;
}

async function readLibraryEntry(baseUrl, auth, entryId) {
  const response = await command(
    baseUrl,
    '/api/character-library/command',
    {
      commandId: `library-read-${randomUUID()}`,
      type: 'get_character_library_entry',
      actor: { participantId: auth.ownerParticipantId },
      payload: { entryId, ownerParticipantId: auth.ownerParticipantId },
    },
    { cookie: auth.cookie },
  );

  return response.data.entry;
}

async function readOutboxEventCounts(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    const result = await client.query(
      'select event_type, count(*)::int as row_count from command_event_outbox_records group by event_type',
    );

    return Object.fromEntries(
      result.rows.map((row) => [row.event_type, row.row_count]),
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function register(baseUrl, account) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    body: JSON.stringify(account),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Register failed: ${JSON.stringify(body)}`);
  }

  // The Character Library treats the account ID as the owning participant, so
  // there is no separate owner identifier to read back.
  return {
    cookie: extractAuthCookie(response),
    ownerParticipantId: body.data.user.id,
    userId: body.data.user.id,
  };
}

async function login(baseUrl, account) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    body: JSON.stringify({ email: account.email, password: account.password }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Login failed: ${JSON.stringify(body)}`);
  }

  return {
    cookie: extractAuthCookie(response),
    ownerParticipantId: body.data.user.id,
    userId: body.data.user.id,
  };
}

function extractAuthCookie(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  const cookie = raw.find((entry) => entry.startsWith('dnd_web_session='));

  if (!cookie) {
    throw new Error('The auth response carried no session cookie.');
  }

  return cookie.split(';')[0];
}

async function rawCommand(baseUrl, path, body, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.participantToken
        ? { 'x-dnd-participant-token': options.participantToken }
        : {}),
    },
    method: 'POST',
  });

  return { body: await response.json(), status: response.status };
}

async function command(baseUrl, path, body, options = {}) {
  const result = await rawCommand(baseUrl, path, body, options);

  if (!options.allowError && result.status !== 200) {
    throw new Error(
      `${body.type} failed with ${result.status}: ${redact(JSON.stringify(result.body))}`,
    );
  }

  return result.body;
}

/**
 * Subscribes to the SSE route and parses named frames.
 *
 * Named, because the event name is the contract a client listens on. Reading
 * the payload without the name would let a regression that dropped every name
 * still pass.
 */
async function openStream(baseUrl, sessionId, participantId, participantToken) {
  const query = new URLSearchParams({ participantId, participantToken });
  const controller = new AbortController();
  const response = await fetch(
    `${baseUrl}/api/sessions/${sessionId}/stream?${query.toString()}`,
    { signal: controller.signal },
  );

  if (!response.ok) {
    throw new Error(`Stream subscription failed with ${response.status}.`);
  }

  let buffer = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();

        if (done) {
          return;
        }

        buffer += decoder.decode(value, { stream: true });
      }
    } catch {
      // Aborting the stream is how it is closed; nothing to report.
    }
  })();

  return {
    close: () => controller.abort(),
    framesNamed: (name) =>
      buffer
        .split('\n\n')
        .map((block) => block.trim())
        .filter((block) => block.startsWith(`event: ${name}\n`))
        .map((block) =>
          JSON.parse(
            block
              .split('\n')
              .find((line) => line.startsWith('data: '))
              .slice('data: '.length),
          ),
        ),
    raw: () => buffer,
  };
}

async function waitFor(predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;

  // Polls the parsed stream buffer rather than sleeping a fixed amount. The
  // loop exits the moment the condition holds, so a slow machine waits longer
  // and a fast one does not wait at all.
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await delay(25);
  }

  throw new Error(`Timed out waiting for: ${label}`);
}

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      'DATABASE_URL is required. Point it at a Postgres the smoke may create and drop databases on.',
    );
  }

  return url;
}

/**
 * Creates a database of its own for this run.
 *
 * Isolation is not politeness here: the smoke asserts exact counts of pending
 * requests and outbox rows, and a shared database would make those assertions
 * depend on whatever the previous run left behind.
 */
async function provisionDatabase(adminUrl) {
  const name = `dnd_web_m1_smoke_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const admin = new Client({ connectionString: adminUrl });

  await admin.connect();

  try {
    await admin.query(
      `create database ${name} encoding 'UTF8' template template0`,
    );
  } finally {
    await admin.end().catch(() => undefined);
  }

  const url = new URL(adminUrl);

  url.pathname = `/${name}`;

  console.log(`[m1-db-restart-smoke]   provisioned isolated database ${name}`);

  return { adminUrl, name, url: url.toString() };
}

async function dropDatabase() {
  if (!provisioned) {
    return;
  }

  const admin = new Client({ connectionString: provisioned.adminUrl });

  try {
    await admin.connect();
    await admin.query(
      `drop database if exists ${provisioned.name} with (force)`,
    );
    console.log(
      `[m1-db-restart-smoke]   dropped isolated database ${provisioned.name}`,
    );
  } catch (error) {
    console.error(
      `[m1-db-restart-smoke]   could not drop ${provisioned.name}: ${redact(String(error))}`,
    );
  } finally {
    await admin.end().catch(() => undefined);
    provisioned = null;
  }
}

async function runNodeScript(scriptPath, env) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(`${scriptPath} exited with ${code}:\n${redact(output)}`),
      );
    });
  });
}

async function startServer(label, port, databaseUrl) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: {
      ...process.env,
      AUTH_COOKIE_SECURE: 'false',
      DATABASE_URL: databaseUrl,
      SERVER_PERSISTENCE_MODE: 'db',
      SERVER_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  processLogs.set(label, []);
  child.stdout.on('data', (chunk) => {
    processLogs.get(label).push(chunk.toString());
  });
  child.stderr.on('data', (chunk) => {
    processLogs.get(label).push(chunk.toString());
  });

  const handle = { child, label, pid: child.pid };

  startedProcesses.push(handle);

  return handle;
}

async function stopProcess(handle) {
  if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
    return;
  }

  const exited = new Promise((resolvePromise) => {
    handle.child.once('exit', resolvePromise);
  });

  handle.child.kill('SIGTERM');

  const timer = setTimeout(() => {
    handle.child.kill('SIGKILL');
  }, 5000);

  await exited;
  clearTimeout(timer);
}

function assertProcessGone(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    return;
  }

  throw new Error(`Process ${pid} is still running after being stopped.`);
}

/** Binding the port is the proof it was released, not an inference from it. */
async function assertPortClosed(port) {
  await new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();

    probe.once('error', (error) => {
      rejectPromise(
        new Error(
          `Port ${port} is still held after shutdown: ${error.message}`,
        ),
      );
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolvePromise());
    });
  });
}

async function waitForHttp(url, timeoutMs = smokeTimeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        await response.arrayBuffer();
        return;
      }
    } catch {
      // Not listening yet.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function getFreePort() {
  return new Promise((resolvePromise) => {
    const probe = createServer();

    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();

      probe.close(() => resolvePromise(port));
    });
  });
}

function step(label) {
  console.log(`[m1-db-restart-smoke] ${label}`);
}

function assert(condition, label) {
  if (condition) {
    console.log(`[m1-db-restart-smoke]   ok - ${label}`);
    return;
  }

  throw new Error(`Assertion failed: ${label}`);
}

/**
 * Compares by value, not by key order.
 *
 * A record that has been through jsonb comes back with Postgres's key order,
 * not the order the server wrote. `JSON.stringify` would call that a
 * difference, which would make every persistence assertion here fail for a
 * reason that has nothing to do with persistence.
 */
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

function assertDeepEqual(actual, expected, label) {
  const actualJson = stableStringify(actual);
  const expectedJson = stableStringify(expected);

  if (actualJson === expectedJson) {
    console.log(`[m1-db-restart-smoke]   ok - ${label}`);
    return;
  }

  throw new Error(
    `Assertion failed: ${label}\n  expected ${redact(expectedJson)}\n  actual   ${redact(actualJson)}`,
  );
}

function printProcessLogs() {
  for (const [label, chunks] of processLogs) {
    if (chunks.length === 0) {
      continue;
    }

    console.error(`\n--- ${label} output (last 4000 chars) ---`);
    console.error(redact(chunks.join('').slice(-4000)));
  }
}

/**
 * Strips anything that would turn a failure report into a credential leak: the
 * connection strings, and the participant tokens the smoke holds.
 */
function redact(value) {
  const secrets = [
    process.env.DATABASE_URL,
    provisioned?.url,
    provisioned?.adminUrl,
  ].filter(Boolean);

  return secrets
    .reduce(
      (text, secret) => text.split(secret).join('[redacted]'),
      String(value),
    )
    .replace(/("participantToken":")[^"]+/g, '$1[redacted]')
    .replace(/(dnd_web_session=)[^;\s]+/g, '$1[redacted]')
    .replace(/(participantToken=)[^&\s"]+/g, '$1[redacted]');
}

async function cleanup() {
  for (const handle of startedProcesses) {
    await stopProcess(handle).catch(() => undefined);
  }

  startedProcesses.length = 0;

  await dropDatabase();
}
