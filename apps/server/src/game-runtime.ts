import { randomUUID } from 'node:crypto';

import {
  applyFixedDamage,
  calculateAttackModifier,
  calculateAttackTotal,
  calculateMovementDistanceFeet,
  deriveCharacterStats,
  doesOccupancyFitWithinGrid,
  isAttackHit,
  rollD20,
} from '@dnd/rules';
import type {
  ActiveSceneState,
  AttackCommand,
  AdvanceTurnCommand,
  AssignCharacterToParticipantCommand,
  ActivateSceneForSessionCommand,
  CharacterAssignmentSuccess,
  CharacterInput,
  CharacterResource,
  CharacterUpdateInput,
  CombatEvent,
  CreateCharacterCommand,
  CreateSceneCommand,
  CreateSessionCommand,
  EncounterStateUpdateReason,
  FinalizeCharacterCommand,
  GetEncounterStateCommand,
  GetActiveSceneStateCommand,
  GetSceneCommand,
  GetCharacterCommand,
  JoinSessionCommand,
  MoveCharacterInActiveSceneCommand,
  MovementStateUpdateReason,
  PlaceEntityInSceneCommand,
  PlaceCharacterInActiveSceneCommand,
  RecordMovementUsageCommand,
  ReconnectSessionCommand,
  SceneActivationSuccess,
  StartEncounterCommand,
  UpdateCharacterCommand,
  UseActionCommand,
  UseBonusActionCommand,
} from '@dnd/protocol';
import type {
  Character,
  CharacterId,
  CharacterMeta,
  Encounter,
  EncounterParticipant,
  EncounterOverlay,
  Participant,
  ParticipantId,
  RulesProfile,
  Scene,
  SceneId,
  SessionSnapshot,
  SessionId,
} from '@dnd/shared';

import {
  CharacterRepository,
  CharacterStoreError,
  InMemoryCharacterStore,
  type StoredCharacterRecord,
} from './character-store.js';
import {
  EncounterRepository,
  InMemoryEncounterStore,
} from './encounter-store.js';
import {
  advanceEncounterTurn,
  assertEncounterBelongsToSession,
  assertEncounterParticipantsArePlaced,
  assertEncounterSceneIsActive,
  assertEncounterTurnActor,
  assertSceneBelongsToEncounter,
  createEncounterRecord,
  EncounterRuntimeError,
  markEncounterActionUsed,
  markEncounterBonusActionUsed,
  recordEncounterMovementUsage,
  requireCurrentEncounterParticipant,
} from './encounter-runtime.js';
import {
  DEFAULT_RULES_PROFILE_ID,
  InMemoryRulesProfileStore,
} from './rules-profile-store.js';
import {
  InMemorySceneStore,
  SceneRepository,
  SceneStoreError,
} from './scene-store.js';
import {
  assertGridDefinitionIsValid,
  assertSceneBelongsToSession,
  assertSceneEntityPlacement,
  createSceneEntity,
  createSceneRecord,
} from './scene-runtime.js';
import {
  assertCharacterCanBeSpawnedInActiveScene,
  assertCharacterDestinationAvailable,
  assertMovementWithinAllowance,
  buildMovementBlockingOccupancies,
  requireActiveSceneId,
  requireAssignedCharacterId,
  requireCharacterPlacedInActiveScene,
  withCharacterPlacedInScene,
} from './movement-runtime.js';
import {
  createConnectionId,
  InMemorySessionStore,
  SessionStoreError,
} from './session-store.js';

export { createConnectionId };

export class InMemoryGameRuntime {
  constructor(
    readonly sessions = new InMemorySessionStore(),
    readonly rulesProfiles = new InMemoryRulesProfileStore(),
    readonly characters: CharacterRepository = new InMemoryCharacterStore(),
    readonly scenes: SceneRepository = new InMemorySceneStore(),
    readonly encounters: EncounterRepository = new InMemoryEncounterStore(),
    readonly d20Roller: () => number = () => rollD20(),
  ) {}

  createSession(command: CreateSessionCommand) {
    this.rulesProfiles.getRulesProfile(command.payload.rulesProfileId);

    return this.sessions.createSession(command);
  }

  joinSession(command: JoinSessionCommand) {
    return this.sessions.joinSession(command);
  }

  reconnectSession(command: ReconnectSessionCommand) {
    return this.sessions.reconnectSession(command);
  }

  getSessionSnapshotForParticipant(
    sessionId: string,
    participantId: string,
  ): SessionSnapshot {
    return this.sessions.getSessionSnapshotForParticipant(
      sessionId,
      participantId,
    );
  }

  connectParticipant(
    sessionId: string,
    participantId: string,
    subscriber: Parameters<InMemorySessionStore['connectParticipant']>[2],
  ): void {
    this.sessions.connectParticipant(sessionId, participantId, subscriber);
  }

  disconnectParticipant(
    sessionId: string,
    participantId: string,
    connectionId: string,
  ): void {
    this.sessions.disconnectParticipant(sessionId, participantId, connectionId);
  }

  createCharacter(command: CreateCharacterCommand): CharacterResource {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const ownerParticipant = this.requireParticipant(
      snapshot,
      command.payload.ownerParticipantId,
    );

    this.assertActorCanEditCharacter(actor, ownerParticipant);

    const rulesProfile = this.rulesProfiles.getRulesProfile(
      snapshot.session.rulesProfileId,
    );
    const record = this.characters.createCharacter(
      this.createDraftCharacterRecord({
        ownerParticipantId: ownerParticipant.id,
        rulesProfileId: rulesProfile.id,
        character: command.payload.character,
      }),
    );

    return this.buildCharacterResource(record, rulesProfile);
  }

  getCharacter(command: GetCharacterCommand): CharacterResource {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const record = this.characters.getCharacter(command.payload.characterId);

    this.assertCharacterBelongsToSession(snapshot, record.character.id, record);

    return this.buildCharacterResource(
      record,
      this.rulesProfiles.getRulesProfile(record.character.rulesProfileId),
    );
  }

  updateCharacter(command: UpdateCharacterCommand): CharacterResource {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const record = this.characters.getCharacter(command.payload.characterId);
    const ownerParticipant = this.requireParticipant(
      snapshot,
      record.character.ownerParticipantId,
    );

    this.assertCharacterBelongsToSession(snapshot, record.character.id, record);
    this.assertActorCanEditCharacter(actor, ownerParticipant);

    const updatedRecord = this.characters.saveCharacter(
      this.withUpdatedCharacterDetails(record, command.payload.character),
    );

    return this.buildCharacterResource(
      updatedRecord,
      this.rulesProfiles.getRulesProfile(
        updatedRecord.character.rulesProfileId,
      ),
    );
  }

  finalizeCharacter(command: FinalizeCharacterCommand): CharacterResource {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const record = this.characters.getCharacter(command.payload.characterId);
    const ownerParticipant = this.requireParticipant(
      snapshot,
      record.character.ownerParticipantId,
    );

    this.assertCharacterBelongsToSession(snapshot, record.character.id, record);
    this.assertActorCanEditCharacter(actor, ownerParticipant);
    this.assertCharacterCanBeFinalized(record.character);

    const finalizedRecord = this.characters.saveCharacter({
      character: {
        ...record.character,
        status: 'ready',
        updatedAt: this.now(),
      },
      overlay: record.overlay,
    });

    return this.buildCharacterResource(
      finalizedRecord,
      this.rulesProfiles.getRulesProfile(
        finalizedRecord.character.rulesProfileId,
      ),
    );
  }

  assignCharacterToParticipant(
    command: AssignCharacterToParticipantCommand,
  ): CharacterAssignmentSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const participant = this.requireParticipant(
      snapshot,
      command.payload.participantId,
    );
    const record = this.characters.getCharacter(command.payload.characterId);

    this.assertActorCanEditCharacter(actor, participant);
    this.assertCharacterBelongsToSession(snapshot, record.character.id, record);

    if (record.character.ownerParticipantId !== participant.id) {
      throw new CharacterStoreError(
        'invalid_participant_session_association',
        `Character "${record.character.id}" belongs to participant "${record.character.ownerParticipantId}" and cannot be assigned to "${participant.id}".`,
      );
    }

    const state = this.sessions.assignCharacterToParticipant(
      snapshot.session.id,
      participant.id,
      record.character.id,
    );

    return {
      sessionId: snapshot.session.id,
      participantId: participant.id,
      characterId: record.character.id,
      state,
    };
  }

  createScene(command: CreateSceneCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'create scenes');
    assertGridDefinitionIsValid(command.payload.scene.grid);

    return this.scenes.createScene(
      createSceneRecord(snapshot.session.id, command.payload.scene),
    );
  }

  getScene(command: GetSceneCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    assertSceneBelongsToSession(snapshot, scene);

    return scene;
  }

  activateSceneForSession(
    command: ActivateSceneForSessionCommand,
  ): SceneActivationSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'activate scenes');
    assertSceneBelongsToSession(snapshot, scene);

    return {
      sessionId: snapshot.session.id,
      sceneId: scene.id,
      state: this.sessions.activateScene(snapshot.session.id, scene.id),
    };
  }

  placeEntityInScene(command: PlaceEntityInSceneCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'place scene entities');
    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    const entity = createSceneEntity(command.payload.entity);

    assertSceneEntityPlacement(scene, entity);

    return this.scenes.saveScene({
      ...scene,
      entities: [...scene.entities, entity],
      updatedAt: this.now(),
    });
  }

  placeCharacterInActiveScene(
    command: PlaceCharacterInActiveSceneCommand,
  ): CharacterResource {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const participant = this.requireParticipant(
      snapshot,
      command.payload.participantId,
    );

    this.assertActorCanEditCharacter(actor, participant);

    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);
    const record = this.requireAssignedCharacterRecord(snapshot, participant);
    const allCharacterRecords =
      this.getResolvedSessionCharacterRecords(snapshot);

    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);
    assertCharacterCanBeSpawnedInActiveScene(
      record,
      activeSceneId,
      command.payload.position,
    );
    assertCharacterDestinationAvailable({
      scene,
      footprint: record.overlay.footprint,
      targetPosition: command.payload.position,
      blockingOccupancies: buildMovementBlockingOccupancies({
        scene,
        characterRecords: allCharacterRecords,
        excludedCharacterId: record.character.id,
      }),
      characterId: record.character.id,
    });

    const updatedRecord = this.characters.saveCharacter(
      withCharacterPlacedInScene({
        record,
        sceneId: activeSceneId,
        position: command.payload.position,
      }),
    );

    this.publishMovementStateUpdate({
      sessionId: snapshot.session.id,
      activeSceneId,
      participantId: participant.id,
      record: updatedRecord,
      reason: 'character_placed',
    });

    return this.buildCharacterResource(
      updatedRecord,
      this.rulesProfiles.getRulesProfile(
        updatedRecord.character.rulesProfileId,
      ),
    );
  }

  moveCharacterInActiveScene(
    command: MoveCharacterInActiveSceneCommand,
  ): CharacterResource {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const participant = this.requireParticipant(
      snapshot,
      command.payload.participantId,
    );

    this.assertActorCanEditCharacter(actor, participant);

    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);
    const record = this.requireAssignedCharacterRecord(snapshot, participant);
    const allCharacterRecords =
      this.getResolvedSessionCharacterRecords(snapshot);

    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    const currentPosition = requireCharacterPlacedInActiveScene(
      record,
      activeSceneId,
    );
    const movementCostFeet = calculateMovementDistanceFeet(
      {
        x: currentPosition.x,
        y: currentPosition.y,
      },
      command.payload.position,
      scene.grid.cellSizeFeet,
    );

    assertMovementWithinAllowance({
      origin: {
        x: currentPosition.x,
        y: currentPosition.y,
      },
      target: command.payload.position,
      speedFeet: record.character.speed,
      cellSizeFeet: scene.grid.cellSizeFeet,
      characterId: record.character.id,
    });

    const encounter = this.findActiveEncounterForParticipant(
      snapshot.session.id,
      actor.id,
    );

    let updatedEncounter: Encounter | null = null;

    if (encounter) {
      const currentTurnParticipant = assertEncounterTurnActor(
        encounter,
        actor.id,
      );

      if (
        currentTurnParticipant.participantId !== participant.id ||
        currentTurnParticipant.characterId !== record.character.id
      ) {
        throw new EncounterRuntimeError(
          'invalid_turn_actor',
          `Participant "${actor.id}" cannot move character "${record.character.id}" because it is not the current turn owner in encounter "${encounter.id}".`,
        );
      }

      // Zero-cost movement is an encounter no-op: it still republishes the
      // authoritative movement position if requested, but it does not spend
      // movement or emit `encounter_state`.
      if (movementCostFeet > 0) {
        updatedEncounter = recordEncounterMovementUsage({
          encounter,
          additionalMovementFeet: movementCostFeet,
          movementAllowanceFeet: record.character.speed,
        });
      }
    }

    assertCharacterDestinationAvailable({
      scene,
      footprint: record.overlay.footprint,
      targetPosition: command.payload.position,
      blockingOccupancies: buildMovementBlockingOccupancies({
        scene,
        characterRecords: allCharacterRecords,
        excludedCharacterId: record.character.id,
      }),
      characterId: record.character.id,
    });

    const updatedRecord = this.characters.saveCharacter(
      withCharacterPlacedInScene({
        record,
        sceneId: activeSceneId,
        position: command.payload.position,
      }),
    );

    if (updatedEncounter) {
      this.saveAndPublishEncounter({
        sessionId: snapshot.session.id,
        encounter: updatedEncounter,
        reason: 'movement_used',
      });
    }

    // NOTE:
    // `movement_state` and `encounter_state` are emitted independently.
    // Clients must treat them as separate authoritative updates.
    this.publishMovementStateUpdate({
      sessionId: snapshot.session.id,
      activeSceneId,
      participantId: participant.id,
      record: updatedRecord,
      reason: 'character_moved',
    });

    return this.buildCharacterResource(
      updatedRecord,
      this.rulesProfiles.getRulesProfile(
        updatedRecord.character.rulesProfileId,
      ),
    );
  }

  getActiveSceneState(command: GetActiveSceneStateCommand): ActiveSceneState {
    return this.getActiveSceneStateForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
  }

  startEncounter(command: StartEncounterCommand): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);
    const activeSceneState = this.getActiveSceneStateForParticipant(
      snapshot.session.id,
      actor.id,
    );

    this.assertActorIsDm(actor, 'start encounters');
    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    return this.saveAndPublishEncounter({
      sessionId: snapshot.session.id,
      encounter: createEncounterRecord({
        sessionId: snapshot.session.id,
        sceneId: activeSceneId,
        participants: this.buildEncounterParticipantsFromActiveScene(
          snapshot,
          activeSceneState,
        ),
      }),
      reason: 'encounter_started',
    });
  }

  getEncounterState(command: GetEncounterStateCommand): Encounter {
    return this.getEncounterStateForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
  }

  useAction(command: UseActionCommand): Encounter {
    const { encounter } = this.getCurrentTurnMutationContext(
      command.payload.sessionId,
      command.actor.participantId,
    );

    return this.saveAndPublishEncounter({
      sessionId: command.payload.sessionId,
      encounter: markEncounterActionUsed(encounter),
      reason: 'action_used',
    });
  }

  useBonusAction(command: UseBonusActionCommand): Encounter {
    const { encounter } = this.getCurrentTurnMutationContext(
      command.payload.sessionId,
      command.actor.participantId,
    );

    return this.saveAndPublishEncounter({
      sessionId: command.payload.sessionId,
      encounter: markEncounterBonusActionUsed(encounter),
      reason: 'bonus_action_used',
    });
  }

  recordMovementUsage(command: RecordMovementUsageCommand): Encounter {
    const { encounter, currentTurnCharacterRecord } =
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      );

    return this.saveAndPublishEncounter({
      sessionId: command.payload.sessionId,
      encounter: recordEncounterMovementUsage({
        encounter,
        additionalMovementFeet: command.payload.amountFeet,
        movementAllowanceFeet: currentTurnCharacterRecord.character.speed,
      }),
      reason: 'movement_used',
    });
  }

  attack(command: AttackCommand): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const activeSceneId = requireActiveSceneId(snapshot);
    const encounter = this.getEncounterStateForParticipant(
      snapshot.session.id,
      actor.id,
    );
    const attackerEncounterParticipant = assertEncounterTurnActor(
      encounter,
      actor.id,
    );
    const attackerParticipant = this.requireParticipant(
      snapshot,
      attackerEncounterParticipant.participantId,
    );
    const attackerRecord = this.requireAssignedCharacterRecord(
      snapshot,
      attackerParticipant,
    );
    const targetParticipant = this.requireParticipant(
      snapshot,
      command.payload.targetParticipantId,
    );

    if (targetParticipant.id === attackerParticipant.id) {
      throw new EncounterRuntimeError(
        'self_target_not_allowed',
        `Participant "${attackerParticipant.id}" cannot target their own character with an attack.`,
      );
    }

    if (
      attackerRecord.character.id !== attackerEncounterParticipant.characterId
    ) {
      throw new CharacterStoreError(
        'internal_server_error',
        `Encounter "${encounter.id}" resolved attacker character "${attackerEncounterParticipant.characterId}", but session state loaded assigned character "${attackerRecord.character.id}".`,
      );
    }

    const targetRecord = this.requireAssignedCharacterRecord(
      snapshot,
      targetParticipant,
    );
    const targetEncounterParticipant = encounter.participants.find(
      (participant) => participant.participantId === targetParticipant.id,
    );

    if (
      !targetEncounterParticipant ||
      targetEncounterParticipant.characterId !== targetRecord.character.id
    ) {
      throw new EncounterRuntimeError(
        'invalid_attack_target',
        `Participant "${targetParticipant.id}" is not a valid target in encounter "${encounter.id}".`,
      );
    }

    const targetPosition = targetRecord.overlay.position;

    if (!targetPosition || targetPosition.sceneId !== activeSceneId) {
      throw new EncounterRuntimeError(
        'invalid_attack_target',
        `Participant "${targetParticipant.id}" does not have a valid active-scene attack target in scene "${activeSceneId}".`,
      );
    }

    const d20 = rollD20(this.d20Roller);
    const modifier = calculateAttackModifier(attackerRecord.character);
    const total = calculateAttackTotal(d20, modifier);
    const hit = isAttackHit(total, targetRecord.character.armorClass);
    const damage = hit ? 1 : 0;
    const previousTargetHp = targetRecord.character.hp.current;
    const currentTargetHp = hit
      ? applyFixedDamage(previousTargetHp, damage)
      : previousTargetHp;
    const updatedEncounter = markEncounterActionUsed(encounter);

    if (hit && currentTargetHp !== previousTargetHp) {
      this.characters.saveCharacter(
        this.withUpdatedCharacterHitPoints(targetRecord, currentTargetHp),
      );
    }

    const savedEncounter = this.saveAndPublishEncounter({
      sessionId: snapshot.session.id,
      encounter: updatedEncounter,
      reason: 'action_used',
    });

    this.publishCombatEvent({
      type: 'combat_event',
      reason: 'attack_resolved',
      sessionId: snapshot.session.id,
      encounterId: savedEncounter.id,
      attackerParticipantId: attackerParticipant.id,
      attackerCharacterId: attackerRecord.character.id,
      targetParticipantId: targetParticipant.id,
      targetCharacterId: targetRecord.character.id,
      roll: {
        d20,
        modifier,
        total,
      },
      targetArmorClass: targetRecord.character.armorClass,
      hit,
      damage,
      targetHp: {
        previous: previousTargetHp,
        current: currentTargetHp,
      },
    });

    return savedEncounter;
  }

  advanceTurn(command: AdvanceTurnCommand): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'advance encounter turns');

    return this.saveAndPublishEncounter({
      sessionId: snapshot.session.id,
      encounter: advanceEncounterTurn(
        this.getEncounterStateForParticipant(snapshot.session.id, actor.id),
      ),
      reason: 'turn_advanced',
    });
  }

  getActiveSceneStateForParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): ActiveSceneState {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      sessionId,
      participantId,
    );
    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);

    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    return {
      sessionId: snapshot.session.id,
      activeSceneId,
      placedCharacters: snapshot.participants.flatMap((participant) => {
        if (!participant.characterId) {
          return [];
        }

        const record = this.requireAssignedCharacterRecord(
          snapshot,
          participant,
        );
        const position = record.overlay.position;

        if (!position || position.sceneId !== activeSceneId) {
          return [];
        }

        if (
          !doesOccupancyFitWithinGrid(scene.grid, {
            position: {
              x: position.x,
              y: position.y,
            },
            footprint: record.overlay.footprint,
          })
        ) {
          throw new CharacterStoreError(
            'internal_server_error',
            `Character "${record.character.id}" has an invalid stored active-scene placement in scene "${activeSceneId}".`,
          );
        }

        return [
          {
            characterId: record.character.id,
            participantId: participant.id,
            position: {
              x: position.x,
              y: position.y,
            },
            footprint: structuredClone(record.overlay.footprint),
          },
        ];
      }),
    };
  }

  getEncounterStateForParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      sessionId,
      participantId,
    );
    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);
    const encounter = this.encounters.getEncounterBySession(
      snapshot.session.id,
    );

    assertEncounterBelongsToSession(encounter, snapshot.session.id);
    assertSceneBelongsToSession(snapshot, scene);
    assertSceneBelongsToEncounter(encounter, scene);
    assertEncounterSceneIsActive(encounter, activeSceneId);

    const activeSceneState = this.getActiveSceneStateForParticipant(
      snapshot.session.id,
      participantId,
    );

    assertEncounterParticipantsArePlaced(
      encounter,
      activeSceneState.placedCharacters.map(
        (placement) => placement.participantId,
      ),
    );
    requireCurrentEncounterParticipant(encounter);

    return encounter;
  }

  getDefaultRulesProfileId(): string {
    return DEFAULT_RULES_PROFILE_ID;
  }

  private buildCharacterResource(
    record: StoredCharacterRecord,
    rulesProfile: RulesProfile,
  ): CharacterResource {
    return {
      character: record.character,
      derived: deriveCharacterStats(record.character),
      overlay: record.overlay,
      rulesProfile,
    };
  }

  private createDraftCharacterRecord(params: {
    ownerParticipantId: ParticipantId;
    rulesProfileId: string;
    character: CharacterInput;
  }): StoredCharacterRecord {
    const now = this.now();
    const characterId = this.createCharacterId();
    const character: Character = {
      id: characterId,
      ownerParticipantId: params.ownerParticipantId,
      status: 'draft',
      name: params.character.name,
      rulesProfileId: params.rulesProfileId,
      level: params.character.level,
      className: params.character.className,
      speciesOrRace: params.character.speciesOrRace,
      background: params.character.background,
      abilities: structuredClone(params.character.abilities),
      hp: structuredClone(params.character.hp),
      armorClass: params.character.armorClass,
      speed: params.character.speed,
      notes: params.character.notes ?? null,
      meta: structuredClone(params.character.meta ?? {}),
      createdAt: now,
      updatedAt: now,
    };

    return {
      character,
      overlay: this.createEncounterOverlay(characterId),
    };
  }

  private withUpdatedCharacterDetails(
    record: StoredCharacterRecord,
    characterUpdate: CharacterUpdateInput,
  ): StoredCharacterRecord {
    return {
      character: {
        ...record.character,
        status: 'draft',
        name: characterUpdate.name,
        className: characterUpdate.className,
        speciesOrRace: characterUpdate.speciesOrRace,
        background: characterUpdate.background,
        abilities: structuredClone(characterUpdate.abilities),
        hp: structuredClone(characterUpdate.hp),
        armorClass: characterUpdate.armorClass,
        speed: characterUpdate.speed,
        notes: characterUpdate.notes ?? null,
        meta: structuredClone(characterUpdate.meta ?? ({} as CharacterMeta)),
        updatedAt: this.now(),
      },
      overlay: record.overlay,
    };
  }

  private withUpdatedCharacterHitPoints(
    record: StoredCharacterRecord,
    currentHp: number,
  ): StoredCharacterRecord {
    return {
      character: {
        ...record.character,
        hp: {
          ...record.character.hp,
          current: currentHp,
        },
        updatedAt: this.now(),
      },
      overlay: record.overlay,
    };
  }

  private createEncounterOverlay(characterId: CharacterId): EncounterOverlay {
    return {
      characterId,
      footprint: {
        width: 1,
        height: 1,
      },
      position: null,
      activeConditions: [],
      concentration: null,
      currentVisibility: 'visible',
    };
  }

  private assertCharacterCanBeFinalized(character: Character): void {
    if (character.status !== 'draft') {
      throw new CharacterStoreError(
        'invalid_character_state',
        `Character "${character.id}" is already marked "${character.status}".`,
      );
    }

    if (
      !character.name.trim() ||
      !character.rulesProfileId.trim() ||
      !character.className.trim() ||
      character.level < 1 ||
      character.level > 20 ||
      character.hp.max < 1 ||
      character.hp.current < 0 ||
      character.hp.current > character.hp.max
    ) {
      throw new CharacterStoreError(
        'invalid_character_state',
        `Character "${character.id}" does not satisfy the minimum readiness rules.`,
      );
    }
  }

  private requireParticipant(
    snapshot: SessionSnapshot,
    participantId: ParticipantId,
  ): Participant {
    const participant = snapshot.participants.find(
      (candidate) => candidate.id === participantId,
    );

    if (!participant) {
      throw new SessionStoreError(
        'participant_not_found',
        `Participant "${participantId}" is not a member of session "${snapshot.session.id}".`,
      );
    }

    return participant;
  }

  private assertActorCanEditCharacter(
    actor: Participant,
    participant: Participant,
  ): void {
    if (actor.role === 'dm' || actor.id === participant.id) {
      return;
    }

    throw new CharacterStoreError(
      'invalid_participant_session_association',
      `Participant "${actor.id}" cannot edit character state for "${participant.id}".`,
    );
  }

  private assertActorIsDm(actor: Participant, action: string): void {
    if (actor.role === 'dm') {
      return;
    }

    throw new SceneStoreError(
      'invalid_role_assumption',
      `Participant "${actor.id}" must be the DM to ${action}.`,
    );
  }

  private assertCharacterBelongsToSession(
    snapshot: SessionSnapshot,
    characterId: CharacterId,
    record: StoredCharacterRecord,
  ): void {
    const ownerParticipant = snapshot.participants.find(
      (participant) => participant.id === record.character.ownerParticipantId,
    );

    if (!ownerParticipant) {
      throw new CharacterStoreError(
        'invalid_participant_session_association',
        `Character "${characterId}" belongs to participant "${record.character.ownerParticipantId}", who is not in session "${snapshot.session.id}".`,
      );
    }

    if (record.character.rulesProfileId !== snapshot.session.rulesProfileId) {
      throw new CharacterStoreError(
        'invalid_participant_session_association',
        `Character "${characterId}" was created for rules profile "${record.character.rulesProfileId}" and cannot be used in session "${snapshot.session.id}".`,
      );
    }
  }

  private requireAssignedCharacterRecord(
    snapshot: SessionSnapshot,
    participant: Participant,
  ): StoredCharacterRecord {
    const characterId = requireAssignedCharacterId(participant);
    const record = this.characters.getCharacter(characterId);

    this.assertCharacterBelongsToSession(snapshot, characterId, record);

    if (record.character.ownerParticipantId !== participant.id) {
      throw new CharacterStoreError(
        'invalid_participant_session_association',
        `Character "${characterId}" belongs to participant "${record.character.ownerParticipantId}" and cannot be controlled by "${participant.id}".`,
      );
    }

    return record;
  }

  private publishMovementStateUpdate(params: {
    sessionId: SessionId;
    activeSceneId: SceneId;
    participantId: ParticipantId;
    record: StoredCharacterRecord;
    reason: MovementStateUpdateReason;
  }): void {
    const position = params.record.overlay.position;

    if (!position || position.sceneId !== params.activeSceneId) {
      throw new CharacterStoreError(
        'internal_server_error',
        `Character "${params.record.character.id}" is missing an authoritative active-scene position for movement propagation.`,
      );
    }

    this.sessions.publishMovementStateUpdate({
      sessionId: params.sessionId,
      activeSceneId: params.activeSceneId,
      participantId: params.participantId,
      characterId: params.record.character.id,
      position: {
        x: position.x,
        y: position.y,
      },
      footprint: params.record.overlay.footprint,
      reason: params.reason,
    });
  }

  private publishEncounterStateUpdate(params: {
    sessionId: SessionId;
    encounter: Encounter;
    reason: EncounterStateUpdateReason;
  }): void {
    this.sessions.publishEncounterStateUpdate({
      type: 'encounter_state',
      reason: params.reason,
      sessionId: params.sessionId,
      encounter: params.encounter,
    });
  }

  private publishCombatEvent(update: CombatEvent): void {
    this.sessions.publishCombatEvent(update);
  }

  private saveAndPublishEncounter(params: {
    encounter: Encounter;
    sessionId: SessionId;
    reason: EncounterStateUpdateReason;
  }): Encounter {
    const savedEncounter =
      params.reason === 'encounter_started'
        ? this.encounters.createEncounter(params.encounter)
        : this.encounters.saveEncounter(params.encounter);

    this.publishEncounterStateUpdate({
      sessionId: params.sessionId,
      encounter: savedEncounter,
      reason: params.reason,
    });

    return savedEncounter;
  }

  private getResolvedSessionCharacterRecords(
    snapshot: SessionSnapshot,
  ): StoredCharacterRecord[] {
    return snapshot.participants.flatMap((participant) => {
      if (!participant.characterId) {
        return [];
      }

      // Session state currently treats assigned character IDs as an
      // authoritative runtime invariant. If one no longer resolves from
      // storage, the runtime is inconsistent and the repository error should
      // surface instead of being silently ignored.
      return [this.characters.getCharacter(participant.characterId)];
    });
  }

  private findActiveEncounterForParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): Encounter | null {
    const encounter = this.encounters.findEncounterBySession(sessionId);

    if (!encounter) {
      return null;
    }

    return this.getEncounterStateForParticipant(sessionId, participantId);
  }

  private getCurrentTurnMutationContext(
    sessionId: SessionId,
    actorParticipantId: ParticipantId,
  ): {
    encounter: Encounter;
    currentTurnCharacterRecord: StoredCharacterRecord;
  } {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      sessionId,
      actorParticipantId,
    );
    const encounter = this.getEncounterStateForParticipant(
      sessionId,
      actorParticipantId,
    );
    const currentTurnParticipant = assertEncounterTurnActor(
      encounter,
      actorParticipantId,
    );
    const currentTurnSessionParticipant = this.requireParticipant(
      snapshot,
      currentTurnParticipant.participantId,
    );
    const currentTurnCharacterRecord = this.requireAssignedCharacterRecord(
      snapshot,
      currentTurnSessionParticipant,
    );

    if (
      currentTurnCharacterRecord.character.id !==
      currentTurnParticipant.characterId
    ) {
      throw new CharacterStoreError(
        'internal_server_error',
        `Encounter "${encounter.id}" resolved current turn character "${currentTurnParticipant.characterId}", but session state loaded assigned character "${currentTurnCharacterRecord.character.id}".`,
      );
    }

    return {
      encounter,
      currentTurnCharacterRecord,
    };
  }

  private buildEncounterParticipantsFromActiveScene(
    snapshot: SessionSnapshot,
    activeSceneState: ActiveSceneState,
  ): EncounterParticipant[] {
    return activeSceneState.placedCharacters.map((placement) => {
      const participant = this.requireParticipant(
        snapshot,
        placement.participantId,
      );
      const record = this.requireAssignedCharacterRecord(snapshot, participant);

      if (record.character.id !== placement.characterId) {
        throw new CharacterStoreError(
          'internal_server_error',
          `Active-scene placement for participant "${participant.id}" resolved character "${placement.characterId}", but assigned character "${record.character.id}" was loaded from storage.`,
        );
      }

      return {
        characterId: record.character.id,
        participantId: participant.id,
        initiative: deriveCharacterStats(record.character).initiativeModifier,
      };
    });
  }

  private createCharacterId(): CharacterId {
    return `char_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
