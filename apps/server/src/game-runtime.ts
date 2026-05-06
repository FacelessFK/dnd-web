import { randomUUID } from 'node:crypto';

import {
  applyFixedDamage,
  calculateAttackModifier,
  calculateAttackTotal,
  calculateMovementDistanceFeet,
  deriveCharacterStats,
  doesOccupancyFitWithinGrid,
  isAttackHit,
  isCharacterDowned,
  isWithinBaselineMeleeReach,
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
  CharacterStateUpdate,
  CharacterStateUpdateReason,
  CharacterUpdateInput,
  CombatEvent,
  CreateCharacterCommand,
  CreateSceneCommand,
  CreateSessionCommand,
  DmEndActiveEncounterCommand,
  DmRepositionCharacterInActiveSceneCommand,
  DmSetCharacterActiveConditionsCommand,
  DmSetCharacterCurrentHpCommand,
  DmSetCurrentTurnParticipantCommand,
  DmSetCurrentTurnUsageCommand,
  EncounterStateUpdate,
  EncounterStateUpdateReason,
  FinalizeCharacterCommand,
  GetEncounterStateCommand,
  GetActiveSceneStateCommand,
  GetSceneCommand,
  GetCharacterCommand,
  JoinSessionCommand,
  MoveCharacterInActiveSceneCommand,
  MovementStateUpdate,
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
  UseReactionCommand,
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
  ScenePosition,
  SessionSnapshot,
  SessionId,
} from '@dnd/shared';

import {
  CharacterStoreError,
  InMemoryCharacterStore,
  type StoredCharacterRecord,
} from './character-store.js';
import {
  EncounterRepositoryResult,
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
  endEncounterRecord,
  EncounterRuntimeError,
  markEncounterActionUsed,
  markEncounterBonusActionUsed,
  markEncounterReactionUsed,
  recordEncounterMovementUsage,
  requireCurrentEncounterParticipant,
  setEncounterCurrentTurnParticipant,
  setEncounterTurnUsage,
} from './encounter-runtime.js';
import {
  DEFAULT_RULES_PROFILE_ID,
  InMemoryRulesProfileStore,
} from './rules-profile-store.js';
import {
  InMemorySceneStore,
  SceneRepository,
  type SceneRepositoryResult,
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
  type RuntimeSessionStore,
  type RuntimeSessionStoreResult,
  type SessionCommandResult,
  type SessionSubscriber,
  SessionStoreError,
} from './session-store.js';

export { createConnectionId };

type AttackContext = {
  sessionId: SessionId;
  activeSceneId: SceneId;
  encounter: Encounter;
  attackerParticipant: Participant;
  attackerRecord: StoredCharacterRecord;
  attackerPosition: ScenePosition;
  targetParticipant: Participant;
  targetRecord: StoredCharacterRecord;
  targetPosition: ScenePosition;
};

export type PreparedAttackContext = {
  activeSceneId: SceneId;
  actor: Participant;
  scene: Scene;
  snapshot: SessionSnapshot;
  targetParticipantId: ParticipantId;
};

export type PreparedMovementContext = {
  activeSceneId: SceneId;
  actor: Participant;
  participant: Participant;
  scene: Scene;
  snapshot: SessionSnapshot;
  targetPosition: MoveCharacterInActiveSceneCommand['payload']['position'];
};

export type MoveCharacterInActiveSceneBranch = 'character' | 'combat';

type ResolvedAttack = {
  updatedEncounter: Encounter;
  roll: CombatEvent['roll'];
  hit: boolean;
  damage: number;
  targetArmorClass: number;
  targetHp: CombatEvent['targetHp'];
  nextTargetRecord: StoredCharacterRecord | null;
};

type RuntimeRepositoryResult<T> = T | Promise<T>;

export type RuntimeCharacterRepository = {
  createCharacter(
    record: StoredCharacterRecord,
  ): RuntimeRepositoryResult<StoredCharacterRecord>;
  getCharacter(
    characterId: CharacterId,
  ): RuntimeRepositoryResult<StoredCharacterRecord>;
  saveCharacter(
    record: StoredCharacterRecord,
  ): RuntimeRepositoryResult<StoredCharacterRecord>;
};

type RuntimeSessionMutationResult<
  TSessions extends RuntimeSessionStore,
  TValue,
> = TSessions extends InMemorySessionStore
  ? TValue
  : RuntimeSessionStoreResult<TValue>;

export class InMemoryGameRuntime<
  TCharacters extends RuntimeCharacterRepository = InMemoryCharacterStore,
  TSessions extends RuntimeSessionStore = InMemorySessionStore,
> {
  constructor(
    readonly sessions: TSessions = new InMemorySessionStore() as unknown as TSessions,
    readonly rulesProfiles = new InMemoryRulesProfileStore(),
    readonly characters: TCharacters = new InMemoryCharacterStore() as unknown as TCharacters,
    readonly scenes: SceneRepository = new InMemorySceneStore(),
    readonly encounters: EncounterRepository = new InMemoryEncounterStore(),
    readonly d20Roller: () => number = () => rollD20(),
    private readonly characterStateUpdateSink?: (
      update: CharacterStateUpdate,
    ) => void,
    private readonly encounterStateUpdateSink?: (
      update: EncounterStateUpdate,
    ) => void,
    private readonly movementStateUpdateSink?: (
      update: MovementStateUpdate,
    ) => void,
    private readonly combatEventSink?: (update: CombatEvent) => void,
  ) {}

  createSession(
    command: CreateSessionCommand,
  ): RuntimeSessionMutationResult<TSessions, SessionCommandResult> {
    this.rulesProfiles.getRulesProfile(command.payload.rulesProfileId);

    return this.sessions.createSession(command) as RuntimeSessionMutationResult<
      TSessions,
      SessionCommandResult
    >;
  }

  joinSession(
    command: JoinSessionCommand,
  ): RuntimeSessionMutationResult<TSessions, SessionCommandResult> {
    return this.sessions.joinSession(command) as RuntimeSessionMutationResult<
      TSessions,
      SessionCommandResult
    >;
  }

  reconnectSession(command: ReconnectSessionCommand) {
    return this.sessions.reconnectSession(command);
  }

  getSessionSnapshotForParticipant(sessionId: string, participantId: string) {
    return this.sessions.getSessionSnapshotForParticipant(
      sessionId,
      participantId,
    );
  }

  connectParticipant(
    sessionId: string,
    participantId: string,
    subscriber: SessionSubscriber,
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

  withSessionStore<TNextSessions extends RuntimeSessionStore>(
    sessions: TNextSessions,
  ): InMemoryGameRuntime<TCharacters, TNextSessions> {
    return new InMemoryGameRuntime(
      sessions,
      this.rulesProfiles,
      this.characters,
      this.scenes,
      this.encounters,
      this.d20Roller,
      this.characterStateUpdateSink,
      this.encounterStateUpdateSink,
      this.movementStateUpdateSink,
      this.combatEventSink,
    );
  }

  withCharacterRepository<TNextCharacters extends RuntimeCharacterRepository>(
    characters: TNextCharacters,
    options: {
      characterStateUpdateSink?: (update: CharacterStateUpdate) => void;
      movementStateUpdateSink?: (update: MovementStateUpdate) => void;
    } = {},
  ): InMemoryGameRuntime<TNextCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      characters,
      this.scenes,
      this.encounters,
      this.d20Roller,
      options.characterStateUpdateSink ?? this.characterStateUpdateSink,
      this.encounterStateUpdateSink,
      options.movementStateUpdateSink ?? this.movementStateUpdateSink,
      this.combatEventSink,
    );
  }

  withSceneRepository(
    scenes: SceneRepository,
  ): InMemoryGameRuntime<TCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      this.characters,
      scenes,
      this.encounters,
      this.d20Roller,
      this.characterStateUpdateSink,
      this.encounterStateUpdateSink,
      this.movementStateUpdateSink,
      this.combatEventSink,
    );
  }

  withEncounterRepository(
    encounters: EncounterRepository,
    options: {
      encounterStateUpdateSink?: (update: EncounterStateUpdate) => void;
    } = {},
  ): InMemoryGameRuntime<TCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      this.characters,
      this.scenes,
      encounters,
      this.d20Roller,
      this.characterStateUpdateSink,
      options.encounterStateUpdateSink ?? this.encounterStateUpdateSink,
      this.movementStateUpdateSink,
      this.combatEventSink,
    );
  }

  withCombatRepositories<TNextCharacters extends RuntimeCharacterRepository>(
    characters: TNextCharacters,
    encounters: EncounterRepository,
    options: {
      characterStateUpdateSink?: (update: CharacterStateUpdate) => void;
      combatEventSink?: (update: CombatEvent) => void;
      encounterStateUpdateSink?: (update: EncounterStateUpdate) => void;
      movementStateUpdateSink?: (update: MovementStateUpdate) => void;
    } = {},
  ): InMemoryGameRuntime<TNextCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      characters,
      this.scenes,
      encounters,
      this.d20Roller,
      options.characterStateUpdateSink ?? this.characterStateUpdateSink,
      options.encounterStateUpdateSink ?? this.encounterStateUpdateSink,
      options.movementStateUpdateSink ?? this.movementStateUpdateSink,
      options.combatEventSink ?? this.combatEventSink,
    );
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
    return this.resolveRepositoryResult(
      this.characters.createCharacter(
        this.createDraftCharacterRecord({
          ownerParticipantId: ownerParticipant.id,
          rulesProfileId: rulesProfile.id,
          character: command.payload.character,
        }),
      ),
      (record) => this.buildCharacterResource(record, rulesProfile),
    );
  }

  getCharacter(command: GetCharacterCommand): CharacterResource {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );

    return this.resolveRepositoryResult(
      this.characters.getCharacter(command.payload.characterId),
      (record) => {
        this.assertCharacterBelongsToSession(
          snapshot,
          record.character.id,
          record,
        );

        return this.buildCharacterResource(
          record,
          this.rulesProfiles.getRulesProfile(record.character.rulesProfileId),
        );
      },
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

    return this.resolveRepositoryResult(
      this.characters.getCharacter(command.payload.characterId),
      (record) => {
        const ownerParticipant = this.requireParticipant(
          snapshot,
          record.character.ownerParticipantId,
        );

        this.assertCharacterBelongsToSession(
          snapshot,
          record.character.id,
          record,
        );
        this.assertActorCanEditCharacter(actor, ownerParticipant);

        return this.resolveRepositoryResult(
          this.characters.saveCharacter(
            this.withUpdatedCharacterDetails(record, command.payload.character),
          ),
          (updatedRecord) =>
            this.buildCharacterResource(
              updatedRecord,
              this.rulesProfiles.getRulesProfile(
                updatedRecord.character.rulesProfileId,
              ),
            ),
        );
      },
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

    return this.resolveRepositoryResult(
      this.characters.getCharacter(command.payload.characterId),
      (record) => {
        const ownerParticipant = this.requireParticipant(
          snapshot,
          record.character.ownerParticipantId,
        );

        this.assertCharacterBelongsToSession(
          snapshot,
          record.character.id,
          record,
        );
        this.assertActorCanEditCharacter(actor, ownerParticipant);
        this.assertCharacterCanBeFinalized(record.character);

        return this.resolveRepositoryResult(
          this.characters.saveCharacter({
            character: {
              ...record.character,
              status: 'ready',
              updatedAt: this.now(),
            },
            overlay: record.overlay,
          }),
          (finalizedRecord) =>
            this.buildCharacterResource(
              finalizedRecord,
              this.rulesProfiles.getRulesProfile(
                finalizedRecord.character.rulesProfileId,
              ),
            ),
        );
      },
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

    return this.resolveRepositoryResult(
      this.characters.getCharacter(command.payload.characterId),
      (record) => {
        this.assertActorCanEditCharacter(actor, participant);
        this.assertCharacterBelongsToSession(
          snapshot,
          record.character.id,
          record,
        );

        if (record.character.ownerParticipantId !== participant.id) {
          throw new CharacterStoreError(
            'invalid_participant_session_association',
            `Character "${record.character.id}" belongs to participant "${record.character.ownerParticipantId}" and cannot be assigned to "${participant.id}".`,
          );
        }

        return this.resolveSessionResult(
          this.sessions.assignCharacterToParticipant(
            snapshot.session.id,
            participant.id,
            record.character.id,
          ),
          (state) => ({
            sessionId: snapshot.session.id,
            participantId: participant.id,
            characterId: record.character.id,
            state,
          }),
        );
      },
    );
  }

  dmSetCharacterCurrentHp(
    command: DmSetCharacterCurrentHpCommand,
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

    this.assertActorIsDm(actor, 'set character HP');

    return this.resolveRepositoryResult(
      this.requireAssignedCharacterRecord(snapshot, participant),
      (record) => {
        if (record.character.id !== command.payload.characterId) {
          throw new CharacterStoreError(
            'invalid_participant_session_association',
            `Participant "${participant.id}" is assigned to character "${record.character.id}", not "${command.payload.characterId}".`,
          );
        }

        this.assertCharacterCurrentHpCanBeSet(
          record.character,
          command.payload.currentHp,
        );

        return this.resolveRepositoryResult(
          this.characters.saveCharacter(
            this.withUpdatedCharacterHitPoints(
              record,
              command.payload.currentHp,
            ),
          ),
          (updatedRecord) => {
            this.publishCharacterStateUpdate({
              sessionId: snapshot.session.id,
              participantId: participant.id,
              record: updatedRecord,
              reason: 'dm_hp_changed',
            });

            return this.buildCharacterResource(
              updatedRecord,
              this.rulesProfiles.getRulesProfile(
                updatedRecord.character.rulesProfileId,
              ),
            );
          },
        );
      },
    );
  }

  dmSetCharacterActiveConditions(
    command: DmSetCharacterActiveConditionsCommand,
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

    this.assertActorIsDm(actor, 'set character active conditions');

    return this.resolveRepositoryResult(
      this.requireAssignedCharacterRecord(snapshot, participant),
      (record) => {
        if (record.character.id !== command.payload.characterId) {
          throw new CharacterStoreError(
            'invalid_participant_session_association',
            `Participant "${participant.id}" is assigned to character "${record.character.id}", not "${command.payload.characterId}".`,
          );
        }

        const activeConditions = this.normalizeActiveConditions(
          record.character.id,
          command.payload.activeConditions,
        );

        return this.resolveRepositoryResult(
          this.characters.saveCharacter(
            this.withUpdatedCharacterActiveConditions(record, activeConditions),
          ),
          (updatedRecord) => {
            this.publishCharacterStateUpdate({
              sessionId: snapshot.session.id,
              participantId: participant.id,
              record: updatedRecord,
              reason: 'dm_conditions_changed',
              activeConditions: updatedRecord.overlay.activeConditions,
            });

            return this.buildCharacterResource(
              updatedRecord,
              this.rulesProfiles.getRulesProfile(
                updatedRecord.character.rulesProfileId,
              ),
            );
          },
        );
      },
    );
  }

  dmRepositionCharacterInActiveScene(
    command: DmRepositionCharacterInActiveSceneCommand,
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

    this.assertActorIsDm(actor, 'reposition characters');

    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);

    return this.resolveRepositoryResults(
      [
        this.requireAssignedCharacterRecord(snapshot, participant),
        this.getResolvedSessionCharacterRecords(snapshot),
      ],
      ([record, allCharacterRecords]) => {
        if (record.character.id !== command.payload.characterId) {
          throw new CharacterStoreError(
            'invalid_participant_session_association',
            `Participant "${participant.id}" is assigned to character "${record.character.id}", not "${command.payload.characterId}".`,
          );
        }

        assertSceneBelongsToSession(snapshot, scene);
        assertGridDefinitionIsValid(scene.grid);
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

        return this.resolveRepositoryResult(
          this.characters.saveCharacter(
            withCharacterPlacedInScene({
              record,
              sceneId: activeSceneId,
              position: command.payload.position,
            }),
          ),
          (updatedRecord) => {
            this.publishMovementStateUpdate({
              sessionId: snapshot.session.id,
              activeSceneId,
              participantId: participant.id,
              record: updatedRecord,
              reason: 'dm_character_repositioned',
            });

            return this.buildCharacterResource(
              updatedRecord,
              this.rulesProfiles.getRulesProfile(
                updatedRecord.character.rulesProfileId,
              ),
            );
          },
        );
      },
    );
  }

  dmSetCurrentTurnUsage(command: DmSetCurrentTurnUsageCommand): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'set current turn usage');

    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(snapshot.session.id, actor.id),
      (encounter) =>
        this.saveAndPublishEncounter({
          sessionId: snapshot.session.id,
          encounter: setEncounterTurnUsage(
            encounter,
            command.payload.turnUsage,
          ),
          reason: 'dm_turn_usage_changed',
        }),
    );
  }

  dmSetCurrentTurnParticipant(
    command: DmSetCurrentTurnParticipantCommand,
  ): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'set the current turn participant');

    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(snapshot.session.id, actor.id),
      (encounter) =>
        this.saveAndPublishEncounter({
          sessionId: snapshot.session.id,
          encounter: setEncounterCurrentTurnParticipant({
            encounter,
            participantId: command.payload.participantId,
          }),
          reason: 'dm_current_turn_changed',
        }),
    );
  }

  dmEndActiveEncounter(command: DmEndActiveEncounterCommand): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'end encounters');

    const activeEncounter = this.encounters.getEncounterBySession(
      snapshot.session.id,
    );

    assertEncounterBelongsToSession(activeEncounter, snapshot.session.id);

    return this.resolveRepositoryResult(
      this.encounters.endEncounter(endEncounterRecord(activeEncounter)),
      (endedEncounter) => {
        this.publishEncounterStateUpdate({
          sessionId: snapshot.session.id,
          encounter: endedEncounter,
          reason: 'encounter_ended',
        });

        return endedEncounter;
      },
    );
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

    return this.resolveRepositoryResult(
      this.scenes.createScene(
        createSceneRecord(snapshot.session.id, command.payload.scene),
      ),
      (scene) => scene,
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

    return this.resolveSessionResult(
      this.sessions.activateScene(snapshot.session.id, scene.id),
      (state) => ({
        sessionId: snapshot.session.id,
        sceneId: scene.id,
        state,
      }),
    );
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

    return this.resolveRepositoryResult(
      this.scenes.saveScene({
        ...scene,
        entities: [...scene.entities, entity],
        updatedAt: this.now(),
      }),
      (updatedScene) => updatedScene,
    );
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

    return this.resolveRepositoryResults(
      [
        this.requireAssignedCharacterRecord(snapshot, participant),
        this.getResolvedSessionCharacterRecords(snapshot),
      ],
      ([record, allCharacterRecords]) => {
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

        return this.resolveRepositoryResult(
          this.characters.saveCharacter(
            withCharacterPlacedInScene({
              record,
              sceneId: activeSceneId,
              position: command.payload.position,
            }),
          ),
          (updatedRecord) => {
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
          },
        );
      },
    );
  }

  moveCharacterInActiveScene(
    command: MoveCharacterInActiveSceneCommand,
  ): CharacterResource {
    return this.resolveRepositoryResult(
      this.moveCharacterInActiveScenePrepared(
        this.prepareMoveCharacterInActiveScene(command),
        { transactionalBranchOnly: false },
      ),
      (result) =>
        this.requireMovementResult(result, 'full movement command execution'),
    );
  }

  prepareMoveCharacterInActiveScene(
    command: MoveCharacterInActiveSceneCommand,
  ): PreparedMovementContext {
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

    return {
      activeSceneId,
      actor,
      participant,
      scene,
      snapshot,
      targetPosition: structuredClone(command.payload.position),
    };
  }

  moveCharacterInActiveScenePrepared(
    prepared: PreparedMovementContext,
    options: {
      rejectEncounterSideEffects?: boolean;
      transactionalBranchOnly: boolean;
    } = { transactionalBranchOnly: true },
  ): RuntimeRepositoryResult<CharacterResource | null> {
    return this.resolveRepositoryResults(
      [
        this.requireAssignedCharacterRecord(
          prepared.snapshot,
          prepared.participant,
        ),
        this.getResolvedSessionCharacterRecords(prepared.snapshot),
      ],
      ([record, allCharacterRecords]) => {
        assertSceneBelongsToSession(prepared.snapshot, prepared.scene);
        assertGridDefinitionIsValid(prepared.scene.grid);

        const currentPosition = requireCharacterPlacedInActiveScene(
          record,
          prepared.activeSceneId,
        );
        const movementCostFeet = calculateMovementDistanceFeet(
          {
            x: currentPosition.x,
            y: currentPosition.y,
          },
          prepared.targetPosition,
          prepared.scene.grid.cellSizeFeet,
        );

        assertMovementWithinAllowance({
          origin: {
            x: currentPosition.x,
            y: currentPosition.y,
          },
          target: prepared.targetPosition,
          speedFeet: record.character.speed,
          cellSizeFeet: prepared.scene.grid.cellSizeFeet,
          characterId: record.character.id,
        });

        return this.resolveRepositoryResult(
          this.findActiveEncounterForParticipant(
            prepared.snapshot.session.id,
            prepared.actor.id,
          ),
          (encounter) => {
            if (!encounter && options.transactionalBranchOnly) {
              return null;
            }

            let updatedEncounter: Encounter | null = null;

            if (encounter) {
              if (
                movementCostFeet > 0 &&
                options.rejectEncounterSideEffects === true
              ) {
                return null;
              }

              const currentTurnParticipant = assertEncounterTurnActor(
                encounter,
                prepared.actor.id,
              );

              if (
                currentTurnParticipant.participantId !==
                  prepared.participant.id ||
                currentTurnParticipant.characterId !== record.character.id
              ) {
                throw new EncounterRuntimeError(
                  'invalid_turn_actor',
                  `Participant "${prepared.actor.id}" cannot move character "${record.character.id}" because it is not the current turn owner in encounter "${encounter.id}".`,
                );
              }

              this.assertCurrentTurnActorIsConscious(encounter, record);

              if (movementCostFeet <= 0 && options.transactionalBranchOnly) {
                return null;
              }

              // Zero-cost movement is an encounter no-op: it still republishes
              // the authoritative movement position if requested, but it does
              // not spend movement or emit `encounter_state`.
              if (movementCostFeet > 0) {
                updatedEncounter = recordEncounterMovementUsage({
                  encounter,
                  additionalMovementFeet: movementCostFeet,
                  movementAllowanceFeet: record.character.speed,
                });
              }
            }

            assertCharacterDestinationAvailable({
              scene: prepared.scene,
              footprint: record.overlay.footprint,
              targetPosition: prepared.targetPosition,
              blockingOccupancies: buildMovementBlockingOccupancies({
                scene: prepared.scene,
                characterRecords: allCharacterRecords,
                excludedCharacterId: record.character.id,
              }),
              characterId: record.character.id,
            });

            return this.resolveRepositoryResult(
              this.characters.saveCharacter(
                withCharacterPlacedInScene({
                  record,
                  sceneId: prepared.activeSceneId,
                  position: prepared.targetPosition,
                }),
              ),
              (updatedRecord) => {
                const finalizeMovement = () => {
                  // NOTE:
                  // `movement_state` and `encounter_state` are emitted
                  // independently. Clients must treat them as separate
                  // authoritative updates.
                  this.publishMovementStateUpdate({
                    sessionId: prepared.snapshot.session.id,
                    activeSceneId: prepared.activeSceneId,
                    participantId: prepared.participant.id,
                    record: updatedRecord,
                    reason: 'character_moved',
                  });

                  return this.buildCharacterResource(
                    updatedRecord,
                    this.rulesProfiles.getRulesProfile(
                      updatedRecord.character.rulesProfileId,
                    ),
                  );
                };

                if (!updatedEncounter) {
                  return finalizeMovement();
                }

                return this.resolveRepositoryResult(
                  this.saveAndPublishEncounter({
                    sessionId: prepared.snapshot.session.id,
                    encounter: updatedEncounter,
                    reason: 'movement_used',
                  }),
                  () => finalizeMovement(),
                );
              },
            );
          },
        );
      },
    );
  }

  resolveMoveCharacterInActiveSceneBranchPrepared(
    prepared: PreparedMovementContext,
  ): RuntimeRepositoryResult<MoveCharacterInActiveSceneBranch> {
    return this.resolveRepositoryResult(
      this.requireAssignedCharacterRecord(
        prepared.snapshot,
        prepared.participant,
      ),
      (record) => {
        assertSceneBelongsToSession(prepared.snapshot, prepared.scene);
        assertGridDefinitionIsValid(prepared.scene.grid);

        const currentPosition = requireCharacterPlacedInActiveScene(
          record,
          prepared.activeSceneId,
        );
        const movementCostFeet = calculateMovementDistanceFeet(
          {
            x: currentPosition.x,
            y: currentPosition.y,
          },
          prepared.targetPosition,
          prepared.scene.grid.cellSizeFeet,
        );

        assertMovementWithinAllowance({
          origin: {
            x: currentPosition.x,
            y: currentPosition.y,
          },
          target: prepared.targetPosition,
          speedFeet: record.character.speed,
          cellSizeFeet: prepared.scene.grid.cellSizeFeet,
          characterId: record.character.id,
        });

        return this.resolveRepositoryResult(
          this.findActiveEncounterForParticipant(
            prepared.snapshot.session.id,
            prepared.actor.id,
          ),
          (encounter) =>
            encounter && movementCostFeet > 0 ? 'combat' : 'character',
        );
      },
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

    this.assertActorIsDm(actor, 'start encounters');
    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    return this.resolveRepositoryResult(
      this.getActiveSceneStateForParticipant(snapshot.session.id, actor.id),
      (activeSceneState) =>
        this.resolveRepositoryResult(
          this.buildEncounterParticipantsFromActiveScene(
            snapshot,
            activeSceneState,
          ),
          (participants) =>
            this.saveAndPublishEncounter({
              sessionId: snapshot.session.id,
              encounter: createEncounterRecord({
                sessionId: snapshot.session.id,
                sceneId: activeSceneId,
                participants,
              }),
              reason: 'encounter_started',
            }),
        ),
    );
  }

  getEncounterState(command: GetEncounterStateCommand): Encounter {
    return this.getEncounterStateForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
  }

  useAction(command: UseActionCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter }) =>
        this.saveAndPublishEncounter({
          sessionId: command.payload.sessionId,
          encounter: markEncounterActionUsed(encounter),
          reason: 'action_used',
        }),
    );
  }

  useBonusAction(command: UseBonusActionCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter }) =>
        this.saveAndPublishEncounter({
          sessionId: command.payload.sessionId,
          encounter: markEncounterBonusActionUsed(encounter),
          reason: 'bonus_action_used',
        }),
    );
  }

  useReaction(command: UseReactionCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter }) =>
        this.saveAndPublishEncounter({
          sessionId: command.payload.sessionId,
          encounter: markEncounterReactionUsed(encounter),
          reason: 'reaction_used',
        }),
    );
  }

  recordMovementUsage(command: RecordMovementUsageCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter, currentTurnCharacterRecord }) =>
        this.saveAndPublishEncounter({
          sessionId: command.payload.sessionId,
          encounter: recordEncounterMovementUsage({
            encounter,
            additionalMovementFeet: command.payload.amountFeet,
            movementAllowanceFeet: currentTurnCharacterRecord.character.speed,
          }),
          reason: 'movement_used',
        }),
    );
  }

  attack(command: AttackCommand): Encounter {
    return this.attackPrepared(this.prepareAttack(command));
  }

  prepareAttack(command: AttackCommand): PreparedAttackContext {
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

    return {
      activeSceneId,
      actor,
      scene,
      snapshot,
      targetParticipantId: command.payload.targetParticipantId,
    };
  }

  attackPrepared(prepared: PreparedAttackContext): Encounter {
    return this.resolveRepositoryResult(
      this.resolveAttackContext(prepared),
      (context) => {
        const resolution = this.resolveAttack(context);

        return this.persistResolvedAttack(context, resolution);
      },
    );
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

    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(snapshot.session.id, actor.id),
      (encounter) =>
        this.saveAndPublishEncounter({
          sessionId: snapshot.session.id,
          encounter: advanceEncounterTurn(encounter),
          reason: 'turn_advanced',
        }),
    );
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

    const placedCharacterEntries = snapshot.participants.map((participant) => {
      if (!participant.characterId) {
        return [];
      }

      return this.resolveRepositoryResult(
        this.requireAssignedCharacterRecord(snapshot, participant),
        (record) => {
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
        },
      );
    });

    return this.resolveRepositoryResults(
      placedCharacterEntries,
      (placements) => ({
        sessionId: snapshot.session.id,
        activeSceneId,
        placedCharacters: placements.flat(),
      }),
    );
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

    return this.resolveRepositoryResult(
      this.getActiveSceneStateForParticipant(
        snapshot.session.id,
        participantId,
      ),
      (activeSceneState) => {
        assertEncounterParticipantsArePlaced(
          encounter,
          activeSceneState.placedCharacters.map(
            (placement) => placement.participantId,
          ),
        );
        requireCurrentEncounterParticipant(encounter);

        return encounter;
      },
    );
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

  private resolveRepositoryResult<T, TResult>(
    result:
      | EncounterRepositoryResult<T>
      | RuntimeRepositoryResult<T>
      | SceneRepositoryResult<T>,
    resolve: (value: T) => TResult | Promise<TResult>,
  ): TResult {
    if (this.isPromiseLike(result)) {
      return result.then(resolve) as TResult;
    }

    return resolve(result) as TResult;
  }

  private resolveRepositoryResults<T extends readonly unknown[], TResult>(
    results: { [K in keyof T]: RuntimeRepositoryResult<T[K]> },
    resolve: (values: T) => TResult | Promise<TResult>,
  ): TResult {
    if (results.some((result) => this.isPromiseLike(result))) {
      return Promise.all(results).then((values) =>
        resolve(values as unknown as T),
      ) as TResult;
    }

    return resolve(results as T) as TResult;
  }

  private resolveSessionResult<T, TResult>(
    result: RuntimeSessionStoreResult<T>,
    resolve: (value: T) => TResult | Promise<TResult>,
  ): TResult {
    if (this.isPromiseLike(result)) {
      return result.then(resolve) as TResult;
    }

    return resolve(result) as TResult;
  }

  private requireMovementResult(
    result: CharacterResource | null,
    context: string,
  ): CharacterResource {
    if (result) {
      return result;
    }

    throw new CharacterStoreError(
      'internal_server_error',
      `Transactional movement branch unexpectedly returned no result during ${context}.`,
    );
  }

  private isPromiseLike<T>(
    value:
      | EncounterRepositoryResult<T>
      | RuntimeRepositoryResult<T>
      | RuntimeSessionStoreResult<T>
      | SceneRepositoryResult<T>,
  ): value is Promise<T> {
    return (
      !!value &&
      typeof value === 'object' &&
      'then' in value &&
      typeof value.then === 'function'
    );
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

  private withUpdatedCharacterActiveConditions(
    record: StoredCharacterRecord,
    activeConditions: string[],
  ): StoredCharacterRecord {
    return {
      character: record.character,
      overlay: {
        ...record.overlay,
        activeConditions: structuredClone(activeConditions),
      },
    };
  }

  private resolveAttackContext(prepared: PreparedAttackContext): AttackContext {
    const { activeSceneId, actor, scene, snapshot, targetParticipantId } =
      prepared;

    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(snapshot.session.id, actor.id),
      (encounter) => {
        const attackerEncounterParticipant = assertEncounterTurnActor(
          encounter,
          actor.id,
        );
        const attackerParticipant = this.requireParticipant(
          snapshot,
          attackerEncounterParticipant.participantId,
        );
        const targetParticipant = this.requireParticipant(
          snapshot,
          targetParticipantId,
        );

        if (targetParticipant.id === attackerParticipant.id) {
          throw new EncounterRuntimeError(
            'self_target_not_allowed',
            `Participant "${attackerParticipant.id}" cannot target their own character with an attack.`,
          );
        }

        return this.resolveRepositoryResults(
          [
            this.requireAssignedCharacterRecord(snapshot, attackerParticipant),
            this.requireAssignedCharacterRecord(snapshot, targetParticipant),
          ],
          ([attackerRecord, targetRecord]) => {
            if (
              attackerRecord.character.id !==
              attackerEncounterParticipant.characterId
            ) {
              throw new CharacterStoreError(
                'internal_server_error',
                `Encounter "${encounter.id}" resolved attacker character "${attackerEncounterParticipant.characterId}", but session state loaded assigned character "${attackerRecord.character.id}".`,
              );
            }

            this.assertCurrentTurnActorIsConscious(encounter, attackerRecord);

            const targetEncounterParticipant = encounter.participants.find(
              (participant) =>
                participant.participantId === targetParticipant.id,
            );

            if (
              !targetEncounterParticipant ||
              targetEncounterParticipant.characterId !==
                targetRecord.character.id
            ) {
              throw new EncounterRuntimeError(
                'invalid_attack_target',
                `Participant "${targetParticipant.id}" is not a valid target in encounter "${encounter.id}".`,
              );
            }

            const attackerPosition = this.requireAttackPlacement({
              record: attackerRecord,
              activeSceneId,
              participantId: attackerParticipant.id,
              role: 'attacker',
            });
            const targetPosition = this.requireAttackPlacement({
              record: targetRecord,
              activeSceneId,
              participantId: targetParticipant.id,
              role: 'target',
            });

            if (isCharacterDowned(targetRecord.character)) {
              throw new EncounterRuntimeError(
                'attack_target_downed',
                `Participant "${targetParticipant.id}" cannot be targeted because character "${targetRecord.character.id}" is already at 0 HP.`,
              );
            }

            if (
              !isWithinBaselineMeleeReach({
                attackerPosition,
                targetPosition,
                cellSizeFeet: scene.grid.cellSizeFeet,
              })
            ) {
              throw new EncounterRuntimeError(
                'attack_target_out_of_reach',
                `Participant "${targetParticipant.id}" is outside the current 5-foot melee attack baseline for participant "${attackerParticipant.id}".`,
              );
            }

            return {
              sessionId: snapshot.session.id,
              activeSceneId,
              encounter,
              attackerParticipant,
              attackerRecord,
              attackerPosition,
              targetParticipant,
              targetRecord,
              targetPosition,
            };
          },
        );
      },
    );
  }

  private resolveAttack(context: AttackContext): ResolvedAttack {
    const updatedEncounter = markEncounterActionUsed(context.encounter);
    const d20 = rollD20(this.d20Roller);
    const modifier = calculateAttackModifier(context.attackerRecord.character);
    const total = calculateAttackTotal(d20, modifier);
    const hit = isAttackHit(total, context.targetRecord.character.armorClass);
    const damage = hit ? 1 : 0;
    const previousTargetHp = context.targetRecord.character.hp.current;
    const currentTargetHp = hit
      ? applyFixedDamage(previousTargetHp, damage)
      : previousTargetHp;

    return {
      updatedEncounter,
      roll: {
        d20,
        modifier,
        total,
      },
      hit,
      damage,
      targetArmorClass: context.targetRecord.character.armorClass,
      targetHp: {
        previous: previousTargetHp,
        current: currentTargetHp,
      },
      nextTargetRecord:
        hit && currentTargetHp !== previousTargetHp
          ? this.withUpdatedCharacterHitPoints(
              context.targetRecord,
              currentTargetHp,
            )
          : null,
    };
  }

  private persistResolvedAttack(
    context: AttackContext,
    resolution: ResolvedAttack,
  ): Encounter {
    // The current in-memory slice has no transactional boundary across
    // character and encounter repositories. Keep the multi-write sequence and
    // both emissions centralized here so a later persistence slice can replace
    // this with a real transaction without changing the public attack flow.
    if (!resolution.nextTargetRecord) {
      return this.publishResolvedAttack(context, resolution);
    }

    return this.resolveRepositoryResult(
      this.characters.saveCharacter(resolution.nextTargetRecord),
      () => this.publishResolvedAttack(context, resolution),
    );
  }

  private publishResolvedAttack(
    context: AttackContext,
    resolution: ResolvedAttack,
  ): Encounter {
    const savedEncounter = this.saveAndPublishEncounter({
      sessionId: context.sessionId,
      encounter: resolution.updatedEncounter,
      reason: 'action_used',
    });

    // Emit `encounter_state` first so clients observe the authoritative action
    // consumption before the resolved attack payload. These remain separate
    // authoritative updates and must not be merged client-side.
    this.publishCombatEvent(
      this.buildResolvedAttackCombatEvent(context, resolution, savedEncounter),
    );

    return savedEncounter;
  }

  private buildResolvedAttackCombatEvent(
    context: AttackContext,
    resolution: ResolvedAttack,
    encounter: Encounter,
  ): CombatEvent {
    return {
      type: 'combat_event',
      reason: 'attack_resolved',
      sessionId: context.sessionId,
      encounterId: encounter.id,
      attackerParticipantId: context.attackerParticipant.id,
      attackerCharacterId: context.attackerRecord.character.id,
      targetParticipantId: context.targetParticipant.id,
      targetCharacterId: context.targetRecord.character.id,
      roll: resolution.roll,
      targetArmorClass: resolution.targetArmorClass,
      hit: resolution.hit,
      damage: resolution.damage,
      targetHp: resolution.targetHp,
    };
  }

  private requireAttackPlacement(params: {
    record: StoredCharacterRecord;
    activeSceneId: SceneId;
    participantId: ParticipantId;
    role: 'attacker' | 'target';
  }): ScenePosition {
    const position = params.record.overlay.position;

    if (position && position.sceneId === params.activeSceneId) {
      return {
        x: position.x,
        y: position.y,
      };
    }

    const code =
      params.role === 'attacker'
        ? 'character_not_placed'
        : 'invalid_attack_target';

    throw new EncounterRuntimeError(
      code,
      `Attack ${params.role} participant "${params.participantId}" does not have a valid active-scene placement in scene "${params.activeSceneId}".`,
    );
  }

  private assertCurrentTurnActorIsConscious(
    encounter: Encounter,
    record: StoredCharacterRecord,
  ): void {
    if (!isCharacterDowned(record.character)) {
      return;
    }

    throw new EncounterRuntimeError(
      'turn_actor_downed',
      `Current turn character "${record.character.id}" is at 0 HP and cannot perform turn-bound combat actions in encounter "${encounter.id}".`,
    );
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

    return this.resolveRepositoryResult(
      this.characters.getCharacter(characterId),
      (record) => {
        this.assertCharacterBelongsToSession(snapshot, characterId, record);

        if (record.character.ownerParticipantId !== participant.id) {
          throw new CharacterStoreError(
            'invalid_participant_session_association',
            `Character "${characterId}" belongs to participant "${record.character.ownerParticipantId}" and cannot be controlled by "${participant.id}".`,
          );
        }

        return record;
      },
    );
  }

  private assertCharacterCurrentHpCanBeSet(
    character: Character,
    currentHp: number,
  ): void {
    if (
      !Number.isInteger(currentHp) ||
      currentHp < 0 ||
      currentHp > character.hp.max
    ) {
      throw new CharacterStoreError(
        'invalid_character_hp',
        `Current HP for character "${character.id}" must be an integer from 0 to ${character.hp.max}.`,
      );
    }
  }

  private normalizeActiveConditions(
    characterId: CharacterId,
    activeConditions: string[],
  ): string[] {
    const normalizedConditions: string[] = [];
    const seenConditions = new Set<string>();

    if (activeConditions.length > 50) {
      throw new CharacterStoreError(
        'invalid_condition_list',
        `Character "${characterId}" cannot have more than 50 active condition tags.`,
      );
    }

    for (const condition of activeConditions) {
      const normalizedCondition = condition.trim();

      if (!normalizedCondition) {
        throw new CharacterStoreError(
          'invalid_condition_list',
          `Character "${characterId}" has an empty active condition tag.`,
        );
      }

      if (normalizedCondition.length > 128) {
        throw new CharacterStoreError(
          'invalid_condition_list',
          `Character "${characterId}" has an active condition tag longer than 128 characters.`,
        );
      }

      if (seenConditions.has(normalizedCondition)) {
        throw new CharacterStoreError(
          'invalid_condition_list',
          `Character "${characterId}" has duplicate active condition tag "${normalizedCondition}".`,
        );
      }

      seenConditions.add(normalizedCondition);
      normalizedConditions.push(normalizedCondition);
    }

    return normalizedConditions;
  }

  private publishCharacterStateUpdate(params: {
    sessionId: SessionId;
    participantId: ParticipantId;
    record: StoredCharacterRecord;
    reason: CharacterStateUpdateReason;
    activeConditions?: string[];
  }): void {
    const update: CharacterStateUpdate = {
      type: 'character_state',
      reason: params.reason,
      sessionId: params.sessionId,
      participantId: params.participantId,
      characterId: params.record.character.id,
      hp: params.record.character.hp,
      ...(params.activeConditions
        ? { activeConditions: params.activeConditions }
        : {}),
    };

    if (this.characterStateUpdateSink) {
      this.characterStateUpdateSink(structuredClone(update));
      return;
    }

    this.sessions.publishCharacterStateUpdate(update);
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

    const update: MovementStateUpdate = {
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
      type: 'movement_state',
    };

    if (this.movementStateUpdateSink) {
      this.movementStateUpdateSink(structuredClone(update));
      return;
    }

    this.sessions.publishMovementStateUpdate(update);
  }

  private publishEncounterStateUpdate(params: {
    sessionId: SessionId;
    encounter: Encounter;
    reason: EncounterStateUpdateReason;
  }): void {
    const update: EncounterStateUpdate = {
      type: 'encounter_state',
      reason: params.reason,
      sessionId: params.sessionId,
      encounter: params.encounter,
    };

    if (this.encounterStateUpdateSink) {
      this.encounterStateUpdateSink(structuredClone(update));
      return;
    }

    this.sessions.publishEncounterStateUpdate(update);
  }

  private publishCombatEvent(update: CombatEvent): void {
    if (this.combatEventSink) {
      this.combatEventSink(structuredClone(update));
      return;
    }

    this.sessions.publishCombatEvent(update);
  }

  private saveAndPublishEncounter(params: {
    encounter: Encounter;
    sessionId: SessionId;
    reason: EncounterStateUpdateReason;
  }): Encounter {
    const saveResult =
      params.reason === 'encounter_started'
        ? this.encounters.createEncounter(params.encounter)
        : this.encounters.saveEncounter(params.encounter);

    return this.resolveRepositoryResult(saveResult, (savedEncounter) => {
      this.publishEncounterStateUpdate({
        sessionId: params.sessionId,
        encounter: savedEncounter,
        reason: params.reason,
      });

      return savedEncounter;
    });
  }

  private getResolvedSessionCharacterRecords(
    snapshot: SessionSnapshot,
  ): StoredCharacterRecord[] {
    const recordResults = snapshot.participants.flatMap((participant) => {
      if (!participant.characterId) {
        return [];
      }

      // Session state currently treats assigned character IDs as an
      // authoritative runtime invariant. If one no longer resolves from
      // storage, the runtime is inconsistent and the repository error should
      // surface instead of being silently ignored.
      return [this.characters.getCharacter(participant.characterId)];
    });

    return this.resolveRepositoryResults(recordResults, (records) => records);
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
    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(sessionId, actorParticipantId),
      (encounter) => {
        const currentTurnParticipant = assertEncounterTurnActor(
          encounter,
          actorParticipantId,
        );
        const currentTurnSessionParticipant = this.requireParticipant(
          snapshot,
          currentTurnParticipant.participantId,
        );

        return this.resolveRepositoryResult(
          this.requireAssignedCharacterRecord(
            snapshot,
            currentTurnSessionParticipant,
          ),
          (currentTurnCharacterRecord) => {
            if (
              currentTurnCharacterRecord.character.id !==
              currentTurnParticipant.characterId
            ) {
              throw new CharacterStoreError(
                'internal_server_error',
                `Encounter "${encounter.id}" resolved current turn character "${currentTurnParticipant.characterId}", but session state loaded assigned character "${currentTurnCharacterRecord.character.id}".`,
              );
            }

            this.assertCurrentTurnActorIsConscious(
              encounter,
              currentTurnCharacterRecord,
            );

            return {
              encounter,
              currentTurnCharacterRecord,
            };
          },
        );
      },
    );
  }

  private buildEncounterParticipantsFromActiveScene(
    snapshot: SessionSnapshot,
    activeSceneState: ActiveSceneState,
  ): EncounterParticipant[] {
    return this.resolveRepositoryResults(
      activeSceneState.placedCharacters.map((placement) => {
        const participant = this.requireParticipant(
          snapshot,
          placement.participantId,
        );
        return this.resolveRepositoryResult(
          this.requireAssignedCharacterRecord(snapshot, participant),
          (record) => {
            if (record.character.id !== placement.characterId) {
              throw new CharacterStoreError(
                'internal_server_error',
                `Active-scene placement for participant "${participant.id}" resolved character "${placement.characterId}", but assigned character "${record.character.id}" was loaded from storage.`,
              );
            }

            return {
              characterId: record.character.id,
              participantId: participant.id,
              initiative: deriveCharacterStats(record.character)
                .initiativeModifier,
            };
          },
        );
      }),
      (participants) => participants,
    );
  }

  private createCharacterId(): CharacterId {
    return `char_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
