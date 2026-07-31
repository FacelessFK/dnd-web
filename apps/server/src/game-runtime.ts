import { randomUUID } from 'node:crypto';

import {
  applyFixedDamage,
  applySceneTerrainCells,
  buildBlockingTerrainOccupancies,
  calculateAttackModifier,
  calculateDamageModifier,
  calculateInitiativeModifier,
  calculateMovementDistanceFeet,
  deriveCharacterStats,
  doesDestinationOverlapBlockingOccupancy,
  doesOccupancyFitWithinGrid,
  doesSceneTerrainTileBlockMovement,
  isCharacterDowned,
  isCombatantDefeated,
  isOccupancyWithinBaselineMeleeReach,
  isWithinBaselineMeleeReach,
  collectConcealedCombatantIds,
  projectEncounterForRole,
  projectSceneForRole,
  resolveAttackRoll,
  rollAttackDamage,
  rollD20,
  rollD20WithStance,
  rollInitiative,
} from '@dnd/rules';
import type {
  ActiveSceneState,
  AttackCommand,
  AdvanceTurnCommand,
  CancelResolutionRequestCommand,
  AssignCharacterToParticipantCommand,
  ActivateSceneForSessionCommand,
  CharacterAssignmentSuccess,
  CharacterInput,
  CharacterLibraryEntry,
  CharacterResource,
  CharacterStateUpdate,
  CharacterStateUpdateReason,
  CharacterUpdateInput,
  CombatEvent,
  CreateCharacterCommand,
  CreateSceneTransitionCommand,
  CreateSceneCommand,
  DeleteSceneEntityCommand,
  DeleteSceneTransitionCommand,
  CreateSessionCommand,
  DmEndActiveEncounterCommand,
  DmCombatantAttackCommand,
  DmCombatantInput,
  DmCreateCombatantInActiveSceneCommand,
  DmRepositionCharacterInActiveSceneCommand,
  DmRepositionCombatantInActiveSceneCommand,
  DmSetCharacterActiveConditionsCommand,
  DmSetCharacterCurrentHpCommand,
  DmSetCombatantCurrentHpCommand,
  DmSetCombatantHiddenCommand,
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
  PaintSceneTerrainCommand,
  PlaceEntityInSceneCommand,
  PlaceCharacterInActiveSceneCommand,
  PlayerIntentCommandSuccess,
  PlayerIntentStateUpdate,
  PlayerIntentStateUpdateReason,
  RecordMovementUsageCommand,
  ReconnectSessionCommand,
  RepositionSceneEntityCommand,
  RequestResolutionCommand,
  ResolutionCommandSuccess,
  ResolutionStateUpdate,
  ResolutionStateUpdateReason,
  SubmitPlayerIntentCommand,
  SubmitResolutionCommand,
  UpdatePlayerIntentStatusCommand,
  ActivateSceneTransitionCommand,
  UpdateSceneTransitionCommand,
  SceneActivationSuccess,
  StartEncounterCommand,
  SubmitCharacterForAssignmentCommand,
  SubmitCharacterLibraryEntryForAssignmentCommand,
  UpdateCharacterCommand,
  UpdateSceneEntityCommand,
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
  SceneCombatant,
  SceneEntity,
  SceneEntityId,
  SceneId,
  ScenePosition,
  SceneTerrain,
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
  isCharacterEncounterParticipant,
  isCombatantEncounterParticipant,
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
  createCombatantSceneEntity,
  createSceneEntity,
  createSceneRecord,
  createSceneTransitionEntity,
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
import { normalizeCharacterProficiencies } from './character-proficiencies.js';
import { withCombatantHidden } from './combatant-concealment.js';
import {
  buildPlayerIntent,
  createPlayerIntentId,
} from './player-intent-command-service.js';
import {
  buildResolutionRequest,
  createResolutionId,
  resolveResolutionRequest,
} from './resolution-command-service.js';
import { deriveRuntimeStance } from './runtime-condition-stance.js';
import {
  addPlayerIntent,
  addResolutionRequest,
  cancelResolutionRequest,
  InMemorySessionTableStateStore,
  projectTableStateForRole,
  recordResolution,
  requirePendingRequestFor,
  updatePlayerIntentStatus,
  type SessionTableState,
  type SessionTableStateRepository,
} from './session-table-state.js';
import type {
  PlayerIntentStateFanout,
  ResolutionStateFanout,
} from './session-event-fanout.js';

export { createConnectionId };

type CharacterTargetAttackContext = {
  kind: 'character';
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

type CombatantTargetAttackContext = {
  kind: 'combatant';
  sessionId: SessionId;
  activeSceneId: SceneId;
  encounter: Encounter;
  attackerParticipant: Participant;
  attackerRecord: StoredCharacterRecord;
  attackerPosition: ScenePosition;
  targetCombatant: SceneEntity & { combatant: SceneCombatant };
  targetParticipantId: ParticipantId;
  targetPosition: ScenePosition;
};

type AttackContext =
  | CharacterTargetAttackContext
  | CombatantTargetAttackContext;

type CombatantAttackContext = {
  sessionId: SessionId;
  activeSceneId: SceneId;
  encounter: Encounter;
  attackerCombatant: SceneEntity;
  attackerParticipantId: ParticipantId;
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
  target:
    | {
        kind: 'participant';
        participantId: ParticipantId;
      }
    | {
        combatantId: SceneEntityId;
        kind: 'combatant';
      };
};

export type PreparedCombatantAttackContext = {
  activeSceneId: SceneId;
  actor: Participant;
  combatantId: SceneEntityId;
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
  damageRoll: CombatEvent['damageRoll'] | null;
  targetArmorClass: number;
  targetHp: CombatEvent['targetHp'];
  nextTargetRecord: StoredCharacterRecord | null;
  nextTargetScene: Scene | null;
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
    // Damage dice roller, separate from d20Roller so tests can fix attack rolls
    // and damage rolls independently. Kept last so existing positional call
    // sites stay valid.
    readonly dieRoller: (sides: number) => number = (sides) =>
      Math.floor(Math.random() * sides) + 1,
    // Initiative is rolled at encounter start, on its own roller. Keeping it
    // separate from d20Roller means tests can still assert that an illegal
    // attack consumed no attack RNG.
    readonly initiativeRoller: () => number = () => rollD20(),
    // Resolution requests, the dice audit, and player intents for every table
    // this runtime serves. Held per runtime rather than per session store
    // because the transitions are the runtime's, not the transport's.
    readonly tableStates: SessionTableStateRepository = new InMemorySessionTableStateStore(),
    // Set only in DB mode, by the transaction boundary, so an M1 event becomes
    // an outbox row inside the same transaction as the state it describes.
    private readonly tableStateUpdateSink?: (
      update: ResolutionStateUpdate | PlayerIntentStateUpdate,
    ) => void,
  ) {}

  /**
   * A runtime whose M1 writes and M1 events both land inside one transaction.
   *
   * Mirrors `withSceneRepository` and `withEncounterRepository`: the boundary
   * forks the store onto the transaction's database handle, runs the command
   * against this runtime, and discards everything if the commit fails.
   */
  withTableStateRepository(
    tableStates: SessionTableStateRepository,
    options: {
      tableStateUpdateSink?: (
        update: ResolutionStateUpdate | PlayerIntentStateUpdate,
      ) => void;
    } = {},
  ): InMemoryGameRuntime<TCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      this.characters,
      this.scenes,
      this.encounters,
      this.d20Roller,
      this.characterStateUpdateSink,
      this.encounterStateUpdateSink,
      this.movementStateUpdateSink,
      this.combatEventSink,
      this.dieRoller,
      this.initiativeRoller,
      tableStates,
      options.tableStateUpdateSink ?? this.tableStateUpdateSink,
    );
  }

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
      this.dieRoller,
      this.initiativeRoller,
      this.tableStates,
      this.tableStateUpdateSink,
    );
  }

  // Combat and initiative randomness is injectable so tests and harnesses can
  // pin rolls without reaching into runtime internals.
  withRollers(
    rollers: {
      d20Roller?: () => number;
      dieRoller?: (sides: number) => number;
      initiativeRoller?: () => number;
    } = {},
  ): InMemoryGameRuntime<TCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      this.characters,
      this.scenes,
      this.encounters,
      rollers.d20Roller ?? this.d20Roller,
      this.characterStateUpdateSink,
      this.encounterStateUpdateSink,
      this.movementStateUpdateSink,
      this.combatEventSink,
      rollers.dieRoller ?? this.dieRoller,
      rollers.initiativeRoller ?? this.initiativeRoller,
      this.tableStates,
      this.tableStateUpdateSink,
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
      this.dieRoller,
      this.initiativeRoller,
      this.tableStates,
      this.tableStateUpdateSink,
    );
  }

  withSceneRepository(
    scenes: SceneRepository,
    options: {
      encounterStateUpdateSink?: (update: EncounterStateUpdate) => void;
    } = {},
  ): InMemoryGameRuntime<TCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      this.characters,
      scenes,
      this.encounters,
      this.d20Roller,
      this.characterStateUpdateSink,
      options.encounterStateUpdateSink ?? this.encounterStateUpdateSink,
      this.movementStateUpdateSink,
      this.combatEventSink,
      this.dieRoller,
      this.initiativeRoller,
      this.tableStates,
      this.tableStateUpdateSink,
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
      this.dieRoller,
      this.initiativeRoller,
      this.tableStates,
      this.tableStateUpdateSink,
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
      scenes?: SceneRepository;
    } = {},
  ): InMemoryGameRuntime<TNextCharacters, TSessions> {
    return new InMemoryGameRuntime(
      this.sessions,
      this.rulesProfiles,
      characters,
      options.scenes ?? this.scenes,
      encounters,
      this.d20Roller,
      options.characterStateUpdateSink ?? this.characterStateUpdateSink,
      options.encounterStateUpdateSink ?? this.encounterStateUpdateSink,
      options.movementStateUpdateSink ?? this.movementStateUpdateSink,
      options.combatEventSink ?? this.combatEventSink,
      this.dieRoller,
      this.initiativeRoller,
      this.tableStates,
      this.tableStateUpdateSink,
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

  submitCharacterForAssignment(
    command: SubmitCharacterForAssignmentCommand,
  ): CharacterAssignmentSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    if (actor.role !== 'player') {
      throw new CharacterStoreError(
        'invalid_role_assumption',
        `Participant "${actor.id}" must be a player to submit a character for assignment.`,
      );
    }

    return this.resolveRepositoryResult(
      this.characters.getCharacter(command.payload.characterId),
      (record) => {
        this.assertCharacterBelongsToSession(
          snapshot,
          record.character.id,
          record,
        );

        if (record.character.ownerParticipantId !== actor.id) {
          throw new CharacterStoreError(
            'invalid_participant_session_association',
            `Character "${record.character.id}" belongs to participant "${record.character.ownerParticipantId}" and cannot be submitted by "${actor.id}".`,
          );
        }

        if (record.character.status !== 'ready') {
          throw new CharacterStoreError(
            'invalid_character_state',
            `Character "${record.character.id}" must be finalized before it can be submitted for assignment.`,
          );
        }

        return this.resolveSessionResult(
          this.sessions.submitCharacterForAssignment(
            snapshot.session.id,
            actor.id,
            record.character.id,
          ),
          (state) => ({
            sessionId: snapshot.session.id,
            participantId: actor.id,
            characterId: record.character.id,
            state,
          }),
        );
      },
    );
  }

  submitCharacterLibraryEntryForAssignment(
    command: SubmitCharacterLibraryEntryForAssignmentCommand,
    entry: CharacterLibraryEntry,
  ): CharacterAssignmentSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    if (actor.role !== 'player') {
      throw new CharacterStoreError(
        'invalid_role_assumption',
        `Participant "${actor.id}" must be a player to submit a character library entry for assignment.`,
      );
    }

    this.assertLibraryEntryCanEnterRuntime(command, entry, snapshot);

    return this.resolveRepositoryResult(
      this.characters.createCharacter(
        this.createReadyCharacterRecordFromLibraryEntry({
          entry,
          ownerParticipantId: actor.id,
        }),
      ),
      (record) =>
        this.resolveSessionResult(
          this.sessions.submitCharacterForAssignment(
            snapshot.session.id,
            actor.id,
            record.character.id,
          ),
          (state) => ({
            sessionId: snapshot.session.id,
            participantId: actor.id,
            characterId: record.character.id,
            state,
          }),
        ),
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

  dmCreateCombatantInActiveScene(
    command: DmCreateCombatantInActiveSceneCommand,
  ): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'create combatants');

    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);
    const combatant = this.createSceneCombatant(command.payload.combatant);
    const entity = createCombatantSceneEntity({
      name: command.payload.combatant.name,
      position: command.payload.combatant.position,
      footprint: command.payload.combatant.footprint,
      hidden: command.payload.combatant.hidden ?? false,
      combatant,
    });

    return this.resolveRepositoryResult(
      this.getResolvedSessionCharacterRecords(snapshot),
      (allCharacterRecords) => {
        assertSceneBelongsToSession(snapshot, scene);
        assertGridDefinitionIsValid(scene.grid);
        assertSceneEntityPlacement(scene, entity);
        this.assertSceneEntityDoesNotOverlapCharacters({
          scene,
          entity,
          characterRecords: allCharacterRecords,
        });

        return this.resolveRepositoryResult(
          this.scenes.saveScene({
            ...scene,
            entities: [...scene.entities, entity],
            updatedAt: this.now(),
          }),
          (updatedScene) => updatedScene,
        );
      },
    );
  }

  dmRepositionCombatantInActiveScene(
    command: DmRepositionCombatantInActiveSceneCommand,
  ): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'reposition combatants');

    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);

    return this.resolveRepositoryResult(
      this.getResolvedSessionCharacterRecords(snapshot),
      (allCharacterRecords) => {
        assertSceneBelongsToSession(snapshot, scene);
        assertGridDefinitionIsValid(scene.grid);

        const existingCombatant = this.requireSceneCombatant(
          scene,
          command.payload.combatantId,
        );
        const movedCombatant: SceneEntity = {
          ...existingCombatant,
          position: structuredClone(command.payload.position),
        };
        const sceneWithoutCombatant = {
          ...scene,
          entities: scene.entities.filter(
            (entity) => entity.id !== command.payload.combatantId,
          ),
        };

        assertSceneEntityPlacement(sceneWithoutCombatant, movedCombatant);
        this.assertSceneEntityDoesNotOverlapCharacters({
          scene,
          entity: movedCombatant,
          characterRecords: allCharacterRecords,
        });

        return this.resolveRepositoryResult(
          this.scenes.saveScene({
            ...scene,
            entities: scene.entities.map((entity) =>
              entity.id === movedCombatant.id ? movedCombatant : entity,
            ),
            updatedAt: this.now(),
          }),
          (updatedScene) => updatedScene,
        );
      },
    );
  }

  dmSetCombatantCurrentHp(command: DmSetCombatantCurrentHpCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'set combatant HP');

    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);
    assertSceneBelongsToSession(snapshot, scene);

    const combatantEntity = this.requireSceneCombatant(
      scene,
      command.payload.combatantId,
    );
    const combatant = combatantEntity.combatant;

    if (!combatant) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${combatantEntity.id}" is not a combatant.`,
      );
    }

    this.assertCombatantCurrentHpCanBeSet(
      combatantEntity.id,
      combatant,
      command.payload.currentHp,
    );

    return this.resolveRepositoryResult(
      this.scenes.saveScene({
        ...scene,
        entities: scene.entities.map((entity) =>
          entity.id === command.payload.combatantId
            ? {
                ...entity,
                combatant: {
                  ...combatant,
                  hp: {
                    ...combatant.hp,
                    current: command.payload.currentHp,
                  },
                },
              }
            : entity,
        ),
        updatedAt: this.now(),
      }),
      (updatedScene) => updatedScene,
    );
  }

  /**
   * Conceal or reveal a combatant that is already on the map.
   *
   * The write is one boolean. What makes this a real command is everything that
   * reads it: `projectSceneForRole` drops the entity from a player's scene, and
   * `collectConcealedCombatantIds` strips its identity out of every encounter
   * and combat event on the way out. Nothing is copied onto the encounter, so
   * the slot count and `currentTurnIndex` are untouched and a reveal is
   * immediate.
   *
   * Setting the value it already has is a no-op: no scene write, no event. That
   * makes a double-click harmless without needing the idempotency layer to
   * cover it.
   */
  dmSetCombatantHidden(command: DmSetCombatantHiddenCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'conceal or reveal combatants');

    const activeSceneId = requireActiveSceneId(snapshot);
    const scene = this.scenes.getScene(activeSceneId);

    assertSceneBelongsToSession(snapshot, scene);
    this.requireSceneCombatant(scene, command.payload.combatantId);

    const change = withCombatantHidden(
      scene,
      command.payload.combatantId,
      command.payload.hidden,
    );

    if (!change.changed) {
      return scene;
    }

    return this.resolveRepositoryResult(
      this.scenes.saveScene({ ...change.scene, updatedAt: this.now() }),
      (updatedScene) => {
        this.republishEncounterForVisibilityChange(snapshot.session.id);

        return updatedScene;
      },
    );
  }

  /**
   * Re-send the encounter after concealment changed.
   *
   * The encounter itself did not change - what changed is what each role is
   * allowed to see of it, and that is decided at publish time from the scene.
   * Without this a player would keep the pre-reveal turn rail until the next
   * turn happened to be taken.
   */
  private republishEncounterForVisibilityChange(sessionId: SessionId): void {
    const encounter = this.encounters.findEncounterBySession(sessionId);

    if (!encounter || encounter.status !== 'active') {
      return;
    }

    this.publishEncounterStateUpdate({
      sessionId,
      encounter,
      reason: 'dm_combatant_visibility_changed',
    });
  }

  /**
   * A GM asking one seat for a check or a save.
   *
   * The addressed seat is validated here rather than trusted from the payload:
   * a request pointed at a participant with no runtime character would produce
   * a pending row nobody could ever answer, and the GM would be left waiting on
   * a dice roll that cannot happen.
   */
  requestResolution(
    command: RequestResolutionCommand,
  ): ResolutionCommandSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'request a check or a saving throw');

    const target = this.requireParticipant(
      snapshot,
      command.payload.targetParticipantId,
    );

    return this.resolveRepositoryResult(
      this.requireAssignedCharacterRecord(snapshot, target),
      (targetRecord) => {
        const request = buildResolutionRequest({
          command,
          requestId: createResolutionId(),
          sessionId: snapshot.session.id,
          requestedByParticipantId: actor.id,
          targetParticipantId: target.id,
          targetCharacterId: targetRecord.character.id,
          createdAt: this.now(),
        });

        return this.commitTableState({
          sessionId: snapshot.session.id,
          state: addResolutionRequest(
            this.tableStates.get(snapshot.session.id),
            request,
          ),
          reason: 'resolution_requested',
          actor,
        });
      },
    );
  }

  /**
   * The addressed player answering their own request.
   *
   * `requirePendingRequestFor` is the whole security surface: it refuses a
   * request addressed to another seat - including the GM's - and refuses one
   * already answered or cancelled. Both checks run before a die is rolled, so a
   * rejected attempt consumes no randomness and leaves the request pending for
   * the seat that actually owns it.
   */
  submitResolution(
    command: SubmitResolutionCommand,
  ): ResolutionCommandSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const tableState = this.tableStates.get(snapshot.session.id);
    const request = requirePendingRequestFor(
      tableState,
      command.payload.requestId,
      actor.id,
    );

    return this.resolveRepositoryResult(
      this.requireAssignedCharacterRecord(snapshot, actor),
      (record) => {
        if (
          request.targetCharacterId &&
          request.targetCharacterId !== record.character.id
        ) {
          throw new CharacterStoreError(
            'invalid_participant_session_association',
            `Resolution request "${request.id}" was addressed to character "${request.targetCharacterId}", but participant "${actor.id}" is now assigned to "${record.character.id}".`,
          );
        }

        const resolvedAt = this.now();
        const resolution = resolveResolutionRequest({
          request,
          actor: {
            abilities: record.character.abilities,
            level: record.character.level,
            activeConditions: record.overlay.activeConditions,
            proficientAbilities: record.character.proficiencies.savingThrows,
            proficientSkills: record.character.proficiencies.skills,
          },
          actorParticipantId: actor.id,
          actorCharacterId: record.character.id,
          rulesProfileId: snapshot.session.rulesProfileId,
          sessionId: snapshot.session.id,
          commandId: command.commandId,
          resolutionId: createResolutionId(),
          resolvedAt,
          roller: () => rollD20(this.d20Roller),
        });

        return this.commitTableState({
          sessionId: snapshot.session.id,
          state: recordResolution(tableState, {
            request,
            resolution,
            resolvedAt,
          }),
          reason: 'resolution_submitted',
          actor,
        });
      },
    );
  }

  /**
   * The GM withdrawing a request nobody has answered yet.
   *
   * The request is marked `cancelled` rather than removed. A row that vanished
   * would leave the addressed player's client showing a prompt with nothing on
   * the server to explain it, and it would erase the fact that the GM asked at
   * all - which is part of what the audit is for.
   */
  cancelResolutionRequest(
    command: CancelResolutionRequestCommand,
  ): ResolutionCommandSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'cancel a resolution request');

    return this.commitTableState({
      sessionId: snapshot.session.id,
      state: cancelResolutionRequest(
        this.tableStates.get(snapshot.session.id),
        command.payload.requestId,
      ),
      reason: 'resolution_request_cancelled',
      actor,
    });
  }

  /** Store the actor's sentence. Nothing reads it but a human. */
  submitPlayerIntent(
    command: SubmitPlayerIntentCommand,
  ): PlayerIntentCommandSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const intent = buildPlayerIntent({
      command,
      intentId: createPlayerIntentId(),
      sessionId: snapshot.session.id,
      authorParticipantId: actor.id,
      ...(actor.characterId ? { authorCharacterId: actor.characterId } : {}),
      createdAt: this.now(),
    });

    return this.commitIntentState({
      sessionId: snapshot.session.id,
      state: addPlayerIntent(this.tableStates.get(snapshot.session.id), intent),
      reason: 'intent_submitted',
      actor,
    });
  }

  updatePlayerIntentStatus(
    command: UpdatePlayerIntentStatusCommand,
  ): PlayerIntentCommandSuccess['data'] {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );

    this.assertActorIsDm(actor, 'change a player intent status');

    return this.commitIntentState({
      sessionId: snapshot.session.id,
      state: updatePlayerIntentStatus(
        this.tableStates.get(snapshot.session.id),
        {
          intentId: command.payload.intentId,
          status: command.payload.status,
          ...(command.payload.gmNote === undefined
            ? {}
            : { gmNote: command.payload.gmNote }),
          updatedAt: this.now(),
        },
      ),
      reason: 'intent_status_changed',
      actor,
    });
  }

  /**
   * Commit new table state, fan it out, and answer the caller with their own
   * projection.
   *
   * The order matters. Authoritative state is stored first, then published -
   * every subscriber and the HTTP responder read the same committed value, so a
   * client cannot receive an event describing state the server has not adopted.
   * The response is projected for the actor, not returned raw: it is cached by
   * the idempotency layer and replayed verbatim, and a raw table state cached
   * against a player's command ID would hand them the GM's view forever.
   */
  private commitTableState(params: {
    sessionId: SessionId;
    state: SessionTableState;
    reason: ResolutionStateUpdateReason;
    actor: Participant;
  }): ResolutionCommandSuccess['data'] {
    this.tableStates.set(params.sessionId, params.state);
    this.publishResolutionStateUpdate({
      sessionId: params.sessionId,
      reason: params.reason,
      requests: params.state.requests,
      resolutions: params.state.resolutions,
    });

    const projected = projectTableStateForRole(
      params.state,
      params.actor.role,
      params.actor.id,
    );

    return {
      sessionId: params.sessionId,
      state: {
        requests: projected.requests,
        resolutions: projected.resolutions,
      },
    };
  }

  private commitIntentState(params: {
    sessionId: SessionId;
    state: SessionTableState;
    reason: PlayerIntentStateUpdateReason;
    actor: Participant;
  }): PlayerIntentCommandSuccess['data'] {
    this.tableStates.set(params.sessionId, params.state);
    this.publishPlayerIntentStateUpdate({
      sessionId: params.sessionId,
      reason: params.reason,
      intents: params.state.intents,
    });

    return {
      sessionId: params.sessionId,
      state: {
        intents: projectTableStateForRole(
          params.state,
          params.actor.role,
          params.actor.id,
        ).intents,
      },
    };
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
            combatantId: command.payload.combatantId,
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

  // `get_scene` is the only scene read a player can issue - every other command
  // that returns a Scene is DM-gated - so it is also the only place concealment
  // has to be enforced on the way out.
  getScene(command: GetSceneCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    assertSceneBelongsToSession(snapshot, scene);

    return projectSceneForRole(scene, actor.role);
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

  updateSceneEntity(command: UpdateSceneEntityCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'update scene entities');
    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    const existingEntity = this.requirePassiveSceneEntity(
      scene,
      command.payload.entityId,
    );
    const updatedEntity: SceneEntity = {
      ...existingEntity,
      ...('type' in command.payload.entity
        ? {
            type: command.payload.entity.type ?? existingEntity.type,
          }
        : {}),
      ...('name' in command.payload.entity
        ? {
            name: command.payload.entity.name ?? existingEntity.name,
          }
        : {}),
      ...('footprint' in command.payload.entity
        ? {
            footprint: structuredClone(
              command.payload.entity.footprint ?? existingEntity.footprint,
            ),
          }
        : {}),
      ...('blocksMovement' in command.payload.entity
        ? {
            blocksMovement:
              command.payload.entity.blocksMovement ??
              existingEntity.blocksMovement,
          }
        : {}),
      ...('blocksVision' in command.payload.entity
        ? {
            blocksVision:
              command.payload.entity.blocksVision ??
              existingEntity.blocksVision,
          }
        : {}),
      ...('hidden' in command.payload.entity
        ? {
            hidden: command.payload.entity.hidden ?? existingEntity.hidden,
          }
        : {}),
      ...('meta' in command.payload.entity
        ? {
            meta: structuredClone(
              command.payload.entity.meta ?? existingEntity.meta,
            ),
          }
        : {}),
      combatant: null,
      position: structuredClone(existingEntity.position),
    };
    const sceneWithoutEntity = this.withoutSceneEntity(
      scene,
      existingEntity.id,
    );

    assertSceneEntityPlacement(sceneWithoutEntity, updatedEntity);

    const footprintChanged =
      updatedEntity.footprint.width !== existingEntity.footprint.width ||
      updatedEntity.footprint.height !== existingEntity.footprint.height;
    const blocksMovementChangedToTrue =
      updatedEntity.blocksMovement && !existingEntity.blocksMovement;

    return this.resolveRepositoryResult(
      footprintChanged || blocksMovementChangedToTrue
        ? this.getResolvedSessionCharacterRecords(snapshot)
        : [],
      (allCharacterRecords) => {
        if (
          updatedEntity.blocksMovement &&
          (footprintChanged || blocksMovementChangedToTrue)
        ) {
          this.assertSceneEntityDoesNotOverlapCharacters({
            scene,
            entity: updatedEntity,
            characterRecords: allCharacterRecords,
          });
        }

        return this.resolveRepositoryResult(
          this.scenes.saveScene({
            ...scene,
            entities: scene.entities.map((entity) =>
              entity.id === updatedEntity.id ? updatedEntity : entity,
            ),
            updatedAt: this.now(),
          }),
          (updatedScene) => updatedScene,
        );
      },
    );
  }

  repositionSceneEntity(command: RepositionSceneEntityCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'reposition scene entities');
    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    const existingEntity = this.requirePassiveSceneEntity(
      scene,
      command.payload.entityId,
    );
    const movedEntity: SceneEntity = {
      ...existingEntity,
      position: structuredClone(command.payload.position),
    };
    const sceneWithoutEntity = this.withoutSceneEntity(
      scene,
      existingEntity.id,
    );

    assertSceneEntityPlacement(sceneWithoutEntity, movedEntity);

    return this.resolveRepositoryResult(
      movedEntity.blocksMovement
        ? this.getResolvedSessionCharacterRecords(snapshot)
        : [],
      (allCharacterRecords) => {
        if (movedEntity.blocksMovement) {
          this.assertSceneEntityDoesNotOverlapCharacters({
            scene,
            entity: movedEntity,
            characterRecords: allCharacterRecords,
          });
        }

        return this.resolveRepositoryResult(
          this.scenes.saveScene({
            ...scene,
            entities: scene.entities.map((entity) =>
              entity.id === movedEntity.id ? movedEntity : entity,
            ),
            updatedAt: this.now(),
          }),
          (updatedScene) => updatedScene,
        );
      },
    );
  }

  deleteSceneEntity(command: DeleteSceneEntityCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'delete scene entities');
    assertSceneBelongsToSession(snapshot, scene);
    this.requirePassiveSceneEntity(scene, command.payload.entityId);

    return this.resolveRepositoryResult(
      this.scenes.saveScene({
        ...scene,
        entities: scene.entities.filter(
          (entity) => entity.id !== command.payload.entityId,
        ),
        updatedAt: this.now(),
      }),
      (updatedScene) => updatedScene,
    );
  }

  paintSceneTerrain(command: PaintSceneTerrainCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'paint scene terrain');
    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    for (const cell of command.payload.cells) {
      if (
        cell.position.x >= scene.grid.width ||
        cell.position.y >= scene.grid.height
      ) {
        throw new SceneStoreError(
          'scene_terrain_out_of_bounds',
          `Terrain cell ${cell.position.x},${cell.position.y} is outside scene "${scene.id}".`,
        );
      }
    }

    const terrain = applySceneTerrainCells(
      scene.grid,
      scene.terrain,
      command.payload.cells,
    );
    // Only newly blocking cells can invalidate existing placement, so the
    // occupancy check runs against the painted result rather than every
    // blocking tile that was already on the map.
    const paintsBlockingTile = command.payload.cells.some((cell) =>
      doesSceneTerrainTileBlockMovement(cell.tile),
    );

    return this.resolveRepositoryResult(
      paintsBlockingTile
        ? this.getResolvedSessionCharacterRecords(snapshot)
        : [],
      (allCharacterRecords) => {
        if (paintsBlockingTile) {
          this.assertSceneTerrainDoesNotTrapOccupants({
            characterRecords: allCharacterRecords,
            scene,
            terrain,
          });
        }

        return this.resolveRepositoryResult(
          this.scenes.saveScene({
            ...scene,
            terrain,
            updatedAt: this.now(),
          }),
          (updatedScene) => updatedScene,
        );
      },
    );
  }

  createSceneTransition(command: CreateSceneTransitionCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);
    const targetScene = this.scenes.getScene(
      command.payload.transition.targetSceneId,
    );

    this.assertActorIsDm(actor, 'create scene transitions');
    assertSceneBelongsToSession(snapshot, scene);
    assertSceneBelongsToSession(snapshot, targetScene);
    assertGridDefinitionIsValid(scene.grid);

    const entity = createSceneTransitionEntity(command.payload.transition);

    assertSceneEntityPlacement(scene, entity);

    return this.resolveRepositoryResult(
      entity.blocksMovement
        ? this.getResolvedSessionCharacterRecords(snapshot)
        : [],
      (allCharacterRecords) => {
        if (entity.blocksMovement) {
          this.assertSceneEntityDoesNotOverlapCharacters({
            scene,
            entity,
            characterRecords: allCharacterRecords,
          });
        }

        return this.resolveRepositoryResult(
          this.scenes.saveScene({
            ...scene,
            entities: [...scene.entities, entity],
            updatedAt: this.now(),
          }),
          (updatedScene) => updatedScene,
        );
      },
    );
  }

  updateSceneTransition(command: UpdateSceneTransitionCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'update scene transitions');
    assertSceneBelongsToSession(snapshot, scene);
    assertGridDefinitionIsValid(scene.grid);

    const existingEntity = this.requireSceneTransitionEntity(
      scene,
      command.payload.transitionId,
    );
    const existingTransition = existingEntity.transition;
    const targetSceneId =
      command.payload.transition.targetSceneId ??
      existingTransition.targetSceneId;
    const targetScene = this.scenes.getScene(targetSceneId);

    assertSceneBelongsToSession(snapshot, targetScene);

    const updatedEntity: SceneEntity = {
      ...existingEntity,
      ...('name' in command.payload.transition
        ? {
            name: command.payload.transition.name ?? existingEntity.name,
          }
        : {}),
      ...('footprint' in command.payload.transition
        ? {
            footprint: structuredClone(
              command.payload.transition.footprint ?? existingEntity.footprint,
            ),
          }
        : {}),
      ...('blocksMovement' in command.payload.transition
        ? {
            blocksMovement:
              command.payload.transition.blocksMovement ??
              existingEntity.blocksMovement,
          }
        : {}),
      ...('blocksVision' in command.payload.transition
        ? {
            blocksVision:
              command.payload.transition.blocksVision ??
              existingEntity.blocksVision,
          }
        : {}),
      ...('hidden' in command.payload.transition
        ? {
            hidden: command.payload.transition.hidden ?? existingEntity.hidden,
          }
        : {}),
      combatant: null,
      position: structuredClone(existingEntity.position),
      transition: {
        kind: command.payload.transition.kind ?? existingTransition.kind,
        targetSceneId,
        targetLabel:
          'targetLabel' in command.payload.transition
            ? (command.payload.transition.targetLabel ?? null)
            : existingTransition.targetLabel,
        notes:
          'notes' in command.payload.transition
            ? (command.payload.transition.notes ?? null)
            : existingTransition.notes,
      },
    };
    const sceneWithoutEntity = this.withoutSceneEntity(
      scene,
      existingEntity.id,
    );

    assertSceneEntityPlacement(sceneWithoutEntity, updatedEntity);

    const footprintChanged =
      updatedEntity.footprint.width !== existingEntity.footprint.width ||
      updatedEntity.footprint.height !== existingEntity.footprint.height;
    const blocksMovementChangedToTrue =
      updatedEntity.blocksMovement && !existingEntity.blocksMovement;

    return this.resolveRepositoryResult(
      footprintChanged || blocksMovementChangedToTrue
        ? this.getResolvedSessionCharacterRecords(snapshot)
        : [],
      (allCharacterRecords) => {
        if (
          updatedEntity.blocksMovement &&
          (footprintChanged || blocksMovementChangedToTrue)
        ) {
          this.assertSceneEntityDoesNotOverlapCharacters({
            scene,
            entity: updatedEntity,
            characterRecords: allCharacterRecords,
          });
        }

        return this.resolveRepositoryResult(
          this.scenes.saveScene({
            ...scene,
            entities: scene.entities.map((entity) =>
              entity.id === updatedEntity.id ? updatedEntity : entity,
            ),
            updatedAt: this.now(),
          }),
          (updatedScene) => updatedScene,
        );
      },
    );
  }

  deleteSceneTransition(command: DeleteSceneTransitionCommand): Scene {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      command.payload.sessionId,
      command.actor.participantId,
    );
    const actor = this.requireParticipant(
      snapshot,
      command.actor.participantId,
    );
    const scene = this.scenes.getScene(command.payload.sceneId);

    this.assertActorIsDm(actor, 'delete scene transitions');
    assertSceneBelongsToSession(snapshot, scene);
    this.requireSceneTransitionEntity(scene, command.payload.transitionId);

    return this.resolveRepositoryResult(
      this.scenes.saveScene({
        ...scene,
        entities: scene.entities.filter(
          (entity) => entity.id !== command.payload.transitionId,
        ),
        updatedAt: this.now(),
      }),
      (updatedScene) => updatedScene,
    );
  }

  activateSceneTransition(
    command: ActivateSceneTransitionCommand,
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

    this.assertActorIsDm(actor, 'activate scene transitions');
    assertSceneBelongsToSession(snapshot, scene);

    const transitionEntity = this.requireSceneTransitionEntity(
      scene,
      command.payload.transitionId,
    );
    const targetScene = this.scenes.getScene(
      transitionEntity.transition.targetSceneId,
    );

    assertSceneBelongsToSession(snapshot, targetScene);

    return this.resolveSessionResult(
      this.sessions.activateScene(snapshot.session.id, targetScene.id),
      (state) => ({
        sessionId: snapshot.session.id,
        sceneId: targetScene.id,
        state,
      }),
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
                !isCharacterEncounterParticipant(currentTurnParticipant) ||
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
            scene,
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

  // The read a player can issue directly, so concealment is applied on the way
  // out. Note this projects the *response* only: every mutation path reads
  // `getEncounterStateForParticipant` and keeps the authoritative encounter, so
  // turn resolution and attack validation never see a projected view.
  getEncounterState(command: GetEncounterStateCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      (encounter) =>
        this.projectEncounterForParticipant(
          encounter,
          command.payload.sessionId,
          command.actor.participantId,
        ),
    );
  }

  /**
   * Applies concealment to an encounter about to be returned to one client.
   *
   * Kept separate from `getEncounterStateForParticipant` on purpose: that
   * method is the authoritative read used by every mutation, and projecting
   * inside it would let a redacted encounter be written back as real state.
   */
  private projectEncounterForParticipant(
    encounter: Encounter,
    sessionId: SessionId,
    participantId: ParticipantId,
  ): Encounter {
    const snapshot = this.sessions.getSessionSnapshotForParticipant(
      sessionId,
      participantId,
    );
    const actor = this.requireParticipant(snapshot, participantId);

    return projectEncounterForRole(
      encounter,
      actor.role,
      this.resolveConcealedCombatantIds(encounter),
    );
  }

  useAction(command: UseActionCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter }) =>
        this.projectEncounterForParticipant(
          this.saveAndPublishEncounter({
            sessionId: command.payload.sessionId,
            encounter: markEncounterActionUsed(encounter),
            reason: 'action_used',
          }),
          command.payload.sessionId,
          command.actor.participantId,
        ),
    );
  }

  useBonusAction(command: UseBonusActionCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter }) =>
        this.projectEncounterForParticipant(
          this.saveAndPublishEncounter({
            sessionId: command.payload.sessionId,
            encounter: markEncounterBonusActionUsed(encounter),
            reason: 'bonus_action_used',
          }),
          command.payload.sessionId,
          command.actor.participantId,
        ),
    );
  }

  useReaction(command: UseReactionCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter }) =>
        this.projectEncounterForParticipant(
          this.saveAndPublishEncounter({
            sessionId: command.payload.sessionId,
            encounter: markEncounterReactionUsed(encounter),
            reason: 'reaction_used',
          }),
          command.payload.sessionId,
          command.actor.participantId,
        ),
    );
  }

  recordMovementUsage(command: RecordMovementUsageCommand): Encounter {
    return this.resolveRepositoryResult(
      this.getCurrentTurnMutationContext(
        command.payload.sessionId,
        command.actor.participantId,
      ),
      ({ encounter, movementAllowanceFeet }) =>
        this.projectEncounterForParticipant(
          this.saveAndPublishEncounter({
            sessionId: command.payload.sessionId,
            encounter: recordEncounterMovementUsage({
              encounter,
              additionalMovementFeet: command.payload.amountFeet,
              movementAllowanceFeet,
            }),
            reason: 'movement_used',
          }),
          command.payload.sessionId,
          command.actor.participantId,
        ),
    );
  }

  attack(command: AttackCommand): Encounter {
    return this.attackPrepared(this.prepareAttack(command));
  }

  dmCombatantAttack(command: DmCombatantAttackCommand): Encounter {
    return this.dmCombatantAttackPrepared(
      this.prepareDmCombatantAttack(command),
    );
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
    const target = command.payload.targetParticipantId
      ? {
          kind: 'participant' as const,
          participantId: command.payload.targetParticipantId,
        }
      : command.payload.targetCombatantId
        ? {
            combatantId: command.payload.targetCombatantId,
            kind: 'combatant' as const,
          }
        : null;

    if (!target) {
      throw new EncounterRuntimeError(
        'invalid_attack_target',
        'Attack command must include a target participant or combatant.',
      );
    }

    return {
      activeSceneId,
      actor,
      scene,
      snapshot,
      target,
    };
  }

  attackPrepared(prepared: PreparedAttackContext): Encounter {
    return this.resolveRepositoryResult(
      this.resolveAttackContext(prepared),
      (context) => {
        const resolution = this.resolveAttack(context);

        // Uses the scene and actor already resolved during preparation rather
        // than re-reading them. Besides being cheaper, this path also runs
        // inside a transaction boundary whose stores are scoped to the
        // transaction, so a fresh lookup here is not guaranteed to resolve.
        //
        // Persistence has to be unwrapped before projection. In DB mode the
        // save is a promise, and projecting one reads `participants` off a
        // Promise - which is `undefined`. The DM path hid it, because the
        // projection returns early for the DM and handed the promise straight
        // back; a player attacking while any combatant was concealed crashed.
        return this.resolveRepositoryResult(
          this.persistResolvedAttack(context, resolution),
          (savedEncounter) =>
            projectEncounterForRole(
              savedEncounter,
              prepared.actor.role,
              collectConcealedCombatantIds(prepared.scene),
            ),
        );
      },
    );
  }

  prepareDmCombatantAttack(
    command: DmCombatantAttackCommand,
  ): PreparedCombatantAttackContext {
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

    this.assertActorIsDm(actor, 'command combatants');

    return {
      activeSceneId,
      actor,
      combatantId: command.payload.combatantId,
      scene,
      snapshot,
      targetParticipantId: command.payload.targetParticipantId,
    };
  }

  dmCombatantAttackPrepared(
    prepared: PreparedCombatantAttackContext,
  ): Encounter {
    return this.resolveRepositoryResult(
      this.resolveCombatantAttackContext(prepared),
      (context) => {
        const resolution = this.resolveCombatantAttack(context);

        return this.persistResolvedCombatantAttack(context, resolution);
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
          scene.entities
            .filter((entity) => entity.combatant)
            .map((entity) => entity.id),
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
      proficiencies: normalizeCharacterProficiencies(
        params.character.proficiencies,
      ),
      createdAt: now,
      updatedAt: now,
    };

    return {
      character,
      overlay: this.createEncounterOverlay(characterId),
    };
  }

  private createReadyCharacterRecordFromLibraryEntry(params: {
    entry: CharacterLibraryEntry;
    ownerParticipantId: ParticipantId;
  }): StoredCharacterRecord {
    const now = this.now();
    const characterId = this.createCharacterId();
    const character: Character = {
      abilities: structuredClone(params.entry.abilities),
      armorClass: params.entry.armorClass,
      background: params.entry.background,
      className: params.entry.className,
      createdAt: now,
      hp: structuredClone(params.entry.hp),
      id: characterId,
      level: params.entry.level,
      meta: {
        ...structuredClone(params.entry.meta ?? {}),
        sourceCharacterLibraryEntryId: params.entry.id,
      },
      name: params.entry.name,
      notes: params.entry.notes ?? null,
      ownerParticipantId: params.ownerParticipantId,
      // Copied, not referenced. The runtime character is a separate record from
      // here on; nothing it does may reach back into the library row.
      proficiencies: normalizeCharacterProficiencies(
        params.entry.proficiencies,
      ),
      rulesProfileId: params.entry.rulesProfileId,
      speciesOrRace: params.entry.speciesOrRace,
      speed: params.entry.speed,
      status: 'ready',
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
        // Not part of the update input, so editing a draft never silently
        // discards what the character is trained in.
        proficiencies: structuredClone(record.character.proficiencies),
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

  private withUpdatedCombatantHitPoints(
    sceneId: SceneId,
    combatantId: SceneEntityId,
    currentHp: number,
  ): Scene {
    const scene = this.scenes.getScene(sceneId);
    const combatantEntity = this.requireSceneCombatant(scene, combatantId);
    const combatant = combatantEntity.combatant;

    if (!combatant) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${combatantId}" is not a combatant.`,
      );
    }

    return {
      ...scene,
      entities: scene.entities.map((entity) =>
        entity.id === combatantId
          ? {
              ...entity,
              combatant: {
                ...combatant,
                hp: {
                  ...combatant.hp,
                  current: currentHp,
                },
              },
            }
          : entity,
      ),
      updatedAt: this.now(),
    };
  }

  private resolveAttackContext(prepared: PreparedAttackContext): AttackContext {
    const { activeSceneId, actor, scene, snapshot, target } = prepared;

    assertSceneBelongsToSession(snapshot, scene);

    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(snapshot.session.id, actor.id),
      (encounter) => {
        const attackerEncounterParticipant = assertEncounterTurnActor(
          encounter,
          actor.id,
        );

        if (!isCharacterEncounterParticipant(attackerEncounterParticipant)) {
          // The authoritative encounter never holds a concealed participant -
          // that variant is produced only when projecting a view for a player -
          // so this narrows to a real combatant in practice.
          const attackerCombatantId = isCombatantEncounterParticipant(
            attackerEncounterParticipant,
          )
            ? attackerEncounterParticipant.combatantId
            : 'unknown';

          throw new EncounterRuntimeError(
            'invalid_turn_actor',
            `Participant "${actor.id}" cannot use the player attack command for combatant "${attackerCombatantId}".`,
          );
        }

        const attackerParticipant = this.requireParticipant(
          snapshot,
          attackerEncounterParticipant.participantId,
        );

        return this.resolveRepositoryResult(
          this.requireAssignedCharacterRecord(snapshot, attackerParticipant),
          (attackerRecord) => {
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

            const attackerPosition = this.requireAttackPlacement({
              record: attackerRecord,
              activeSceneId,
              participantId: attackerParticipant.id,
              role: 'attacker',
            });

            if (target.kind === 'combatant') {
              const targetCombatant = this.requireSceneCombatant(
                scene,
                target.combatantId,
              ) as SceneEntity & { combatant: SceneCombatant };
              const targetEncounterParticipant = encounter.participants.find(
                (participant) =>
                  isCombatantEncounterParticipant(participant) &&
                  participant.combatantId === targetCombatant.id,
              );

              if (!targetEncounterParticipant) {
                throw new EncounterRuntimeError(
                  'invalid_attack_target',
                  `Combatant "${targetCombatant.id}" is not a valid target in encounter "${encounter.id}".`,
                );
              }

              if (isCombatantDefeated(targetCombatant.combatant)) {
                throw new EncounterRuntimeError(
                  'attack_target_downed',
                  `Combatant "${targetCombatant.id}" cannot be targeted because it is already at 0 HP.`,
                );
              }

              if (
                !isOccupancyWithinBaselineMeleeReach({
                  attacker: {
                    position: attackerPosition,
                    footprint: attackerRecord.overlay.footprint,
                  },
                  target: {
                    position: targetCombatant.position,
                    footprint: targetCombatant.footprint,
                  },
                  cellSizeFeet: scene.grid.cellSizeFeet,
                })
              ) {
                throw new EncounterRuntimeError(
                  'attack_target_out_of_reach',
                  `Combatant "${targetCombatant.id}" is outside the current 5-foot melee attack baseline for participant "${attackerParticipant.id}".`,
                );
              }

              return {
                kind: 'combatant',
                sessionId: snapshot.session.id,
                activeSceneId,
                encounter,
                attackerParticipant,
                attackerRecord,
                attackerPosition,
                targetCombatant,
                targetParticipantId: targetEncounterParticipant.participantId,
                targetPosition: targetCombatant.position,
              };
            }

            const targetParticipant = this.requireParticipant(
              snapshot,
              target.participantId,
            );

            if (targetParticipant.id === attackerParticipant.id) {
              throw new EncounterRuntimeError(
                'self_target_not_allowed',
                `Participant "${attackerParticipant.id}" cannot target their own character with an attack.`,
              );
            }

            return this.resolveRepositoryResult(
              this.requireAssignedCharacterRecord(snapshot, targetParticipant),
              (targetRecord) => {
                const targetEncounterParticipant = encounter.participants.find(
                  (participant) =>
                    participant.participantId === targetParticipant.id,
                );

                if (
                  !targetEncounterParticipant ||
                  !isCharacterEncounterParticipant(
                    targetEncounterParticipant,
                  ) ||
                  targetEncounterParticipant.characterId !==
                    targetRecord.character.id
                ) {
                  throw new EncounterRuntimeError(
                    'invalid_attack_target',
                    `Participant "${targetParticipant.id}" is not a valid target in encounter "${encounter.id}".`,
                  );
                }

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
                  kind: 'character',
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
      },
    );
  }

  private resolveCombatantAttackContext(
    prepared: PreparedCombatantAttackContext,
  ): CombatantAttackContext {
    const { activeSceneId, actor, combatantId, scene, snapshot } = prepared;

    assertSceneBelongsToSession(snapshot, scene);

    const attackerCombatant = this.requireSceneCombatant(scene, combatantId);
    const attackerPosition = attackerCombatant.position;

    return this.resolveRepositoryResult(
      this.getEncounterStateForParticipant(snapshot.session.id, actor.id),
      (encounter) => {
        const currentTurnParticipant = assertEncounterTurnActor(
          encounter,
          actor.id,
        );

        if (
          !isCombatantEncounterParticipant(currentTurnParticipant) ||
          currentTurnParticipant.combatantId !== combatantId
        ) {
          throw new EncounterRuntimeError(
            'invalid_turn_actor',
            `Combatant "${combatantId}" is not the current turn actor in encounter "${encounter.id}".`,
          );
        }

        this.assertCombatantCanAct(attackerCombatant);

        const targetParticipant = this.requireParticipant(
          snapshot,
          prepared.targetParticipantId,
        );

        if (targetParticipant.role !== 'player') {
          throw new EncounterRuntimeError(
            'invalid_attack_target',
            `Combatant "${combatantId}" can only target player characters in the current MVP attack baseline.`,
          );
        }

        return this.resolveRepositoryResult(
          this.requireAssignedCharacterRecord(snapshot, targetParticipant),
          (targetRecord) => {
            const targetEncounterParticipant = encounter.participants.find(
              (participant) =>
                isCharacterEncounterParticipant(participant) &&
                participant.participantId === targetParticipant.id &&
                participant.characterId === targetRecord.character.id,
            );

            if (!targetEncounterParticipant) {
              throw new EncounterRuntimeError(
                'invalid_attack_target',
                `Participant "${targetParticipant.id}" is not a valid target in encounter "${encounter.id}".`,
              );
            }

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
              !isOccupancyWithinBaselineMeleeReach({
                attacker: {
                  position: attackerPosition,
                  footprint: attackerCombatant.footprint,
                },
                target: {
                  position: targetPosition,
                  footprint: targetRecord.overlay.footprint,
                },
                cellSizeFeet: scene.grid.cellSizeFeet,
              })
            ) {
              throw new EncounterRuntimeError(
                'attack_target_out_of_reach',
                `Participant "${targetParticipant.id}" is outside the current 5-foot melee attack baseline for combatant "${combatantId}".`,
              );
            }

            return {
              sessionId: snapshot.session.id,
              activeSceneId,
              encounter,
              attackerCombatant,
              attackerParticipantId: currentTurnParticipant.participantId,
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
    // The attacker's live conditions decide how many dice are rolled and which
    // one counts. This is the only place a `poisoned` tag becomes a mechanic
    // rather than a label, and it happens before the roll - the browser never
    // sees a die it could have influenced.
    const derivedStance = deriveRuntimeStance({
      kind: 'attack_roll',
      activeConditions: context.attackerRecord.overlay.activeConditions,
    });
    const d20Outcome = rollD20WithStance({
      stance: derivedStance.stance,
      roller: () => rollD20(this.d20Roller),
    });
    const d20 = d20Outcome.selectedDie;
    const modifier = calculateAttackModifier(context.attackerRecord.character);
    const targetArmorClass =
      context.kind === 'character'
        ? context.targetRecord.character.armorClass
        : context.targetCombatant.combatant.armorClass;
    const outcome = resolveAttackRoll({ d20, modifier, targetArmorClass });
    const hit = outcome.hit;
    const damageRoll = hit
      ? rollAttackDamage({
          critical: outcome.critical,
          modifier: calculateDamageModifier(context.attackerRecord.character),
          roller: this.dieRoller,
        })
      : null;
    const damage = damageRoll?.total ?? 0;
    const previousTargetHp =
      context.kind === 'character'
        ? context.targetRecord.character.hp.current
        : context.targetCombatant.combatant.hp.current;
    const currentTargetHp = hit
      ? applyFixedDamage(previousTargetHp, damage)
      : previousTargetHp;

    return {
      updatedEncounter,
      roll: {
        d20,
        modifier,
        total: outcome.total,
        critical: outcome.critical,
        criticalMiss: outcome.criticalMiss,
        stance: d20Outcome.stance,
        dice: d20Outcome.dice,
        ...(derivedStance.sources.length
          ? { stanceSources: derivedStance.sources }
          : {}),
      },
      hit,
      damage,
      damageRoll,
      targetArmorClass,
      targetHp: {
        previous: previousTargetHp,
        current: currentTargetHp,
      },
      nextTargetRecord:
        context.kind === 'character' &&
        hit &&
        currentTargetHp !== previousTargetHp
          ? this.withUpdatedCharacterHitPoints(
              context.targetRecord,
              currentTargetHp,
            )
          : null,
      nextTargetScene:
        context.kind === 'combatant' &&
        hit &&
        currentTargetHp !== previousTargetHp
          ? this.withUpdatedCombatantHitPoints(
              context.activeSceneId,
              context.targetCombatant.id,
              currentTargetHp,
            )
          : null,
    };
  }

  private resolveCombatantAttack(
    context: CombatantAttackContext,
  ): ResolvedAttack {
    const combatant = context.attackerCombatant.combatant;

    if (!combatant) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${context.attackerCombatant.id}" is not a combatant.`,
      );
    }

    const updatedEncounter = markEncounterActionUsed(context.encounter);
    // A `SceneCombatant` carries no conditions today, so this always folds to a
    // normal roll. It goes through the same seam anyway: when combatants gain
    // conditions there is one place to feed them in, and the reported roll
    // already has the shape that explains itself.
    const derivedStance = deriveRuntimeStance({
      kind: 'attack_roll',
      activeConditions: [],
    });
    const d20Outcome = rollD20WithStance({
      stance: derivedStance.stance,
      roller: () => rollD20(this.d20Roller),
    });
    const d20 = d20Outcome.selectedDie;
    const modifier = calculateAttackModifier({
      abilities: combatant.abilities,
      level: 1,
    });
    const targetArmorClass = context.targetRecord.character.armorClass;
    const outcome = resolveAttackRoll({ d20, modifier, targetArmorClass });
    const hit = outcome.hit;
    const damageRoll = hit
      ? rollAttackDamage({
          critical: outcome.critical,
          modifier: calculateDamageModifier({ abilities: combatant.abilities }),
          roller: this.dieRoller,
        })
      : null;
    const damage = damageRoll?.total ?? 0;
    const previousTargetHp = context.targetRecord.character.hp.current;
    const currentTargetHp = hit
      ? applyFixedDamage(previousTargetHp, damage)
      : previousTargetHp;

    return {
      updatedEncounter,
      roll: {
        d20,
        modifier,
        total: outcome.total,
        critical: outcome.critical,
        criticalMiss: outcome.criticalMiss,
        stance: d20Outcome.stance,
        dice: d20Outcome.dice,
        ...(derivedStance.sources.length
          ? { stanceSources: derivedStance.sources }
          : {}),
      },
      hit,
      damage,
      damageRoll,
      targetArmorClass,
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
      nextTargetScene: null,
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
    if (resolution.nextTargetScene) {
      return this.resolveRepositoryResult(
        this.scenes.saveScene(resolution.nextTargetScene),
        () => this.publishResolvedAttack(context, resolution),
      );
    }

    if (!resolution.nextTargetRecord) {
      return this.publishResolvedAttack(context, resolution);
    }

    return this.resolveRepositoryResult(
      this.characters.saveCharacter(resolution.nextTargetRecord),
      () => this.publishResolvedAttack(context, resolution),
    );
  }

  private persistResolvedCombatantAttack(
    context: CombatantAttackContext,
    resolution: ResolvedAttack,
  ): Encounter {
    if (!resolution.nextTargetRecord) {
      return this.publishResolvedCombatantAttack(context, resolution);
    }

    return this.resolveRepositoryResult(
      this.characters.saveCharacter(resolution.nextTargetRecord),
      () => this.publishResolvedCombatantAttack(context, resolution),
    );
  }

  private publishResolvedAttack(
    context: AttackContext,
    resolution: ResolvedAttack,
  ): Encounter {
    // The save is awaited before the event is built. In DB mode it is a
    // promise, and reading `id` off one yields `undefined` - which produced a
    // combat event with no `encounterId`, accepted silently into the outbox and
    // only rejected later when the row was replayed onto a stream.
    return this.resolveRepositoryResult(
      this.saveAndPublishEncounter({
        sessionId: context.sessionId,
        encounter: resolution.updatedEncounter,
        reason: 'action_used',
      }),
      (savedEncounter) => {
        // Emit `encounter_state` first so clients observe the authoritative
        // action consumption before the resolved attack payload. These remain
        // separate authoritative updates and must not be merged client-side.
        this.publishCombatEvent(
          this.buildResolvedAttackCombatEvent(
            context,
            resolution,
            savedEncounter,
          ),
        );

        return savedEncounter;
      },
    );
  }

  private buildResolvedAttackCombatEvent(
    context: AttackContext,
    resolution: ResolvedAttack,
    encounter: Encounter,
  ): CombatEvent {
    if (context.kind === 'combatant') {
      return {
        type: 'combat_event',
        reason: 'attack_resolved',
        sessionId: context.sessionId,
        encounterId: encounter.id,
        attackerKind: 'character',
        attackerParticipantId: context.attackerParticipant.id,
        attackerCharacterId: context.attackerRecord.character.id,
        targetKind: 'combatant',
        targetParticipantId: context.targetParticipantId,
        targetCombatantId: context.targetCombatant.id,
        roll: resolution.roll,
        targetArmorClass: resolution.targetArmorClass,
        hit: resolution.hit,
        damage: resolution.damage,
        ...(resolution.damageRoll ? { damageRoll: resolution.damageRoll } : {}),
        targetHp: resolution.targetHp,
      };
    }

    return {
      type: 'combat_event',
      reason: 'attack_resolved',
      sessionId: context.sessionId,
      encounterId: encounter.id,
      attackerKind: 'character',
      attackerParticipantId: context.attackerParticipant.id,
      attackerCharacterId: context.attackerRecord.character.id,
      targetKind: 'character',
      targetParticipantId: context.targetParticipant.id,
      targetCharacterId: context.targetRecord.character.id,
      roll: resolution.roll,
      targetArmorClass: resolution.targetArmorClass,
      hit: resolution.hit,
      damage: resolution.damage,
      ...(resolution.damageRoll ? { damageRoll: resolution.damageRoll } : {}),
      targetHp: resolution.targetHp,
    };
  }

  private publishResolvedCombatantAttack(
    context: CombatantAttackContext,
    resolution: ResolvedAttack,
  ): Encounter {
    return this.resolveRepositoryResult(
      this.saveAndPublishEncounter({
        sessionId: context.sessionId,
        encounter: resolution.updatedEncounter,
        reason: 'action_used',
      }),
      (savedEncounter) => {
        this.publishCombatEvent(
          this.buildResolvedCombatantAttackCombatEvent(
            context,
            resolution,
            savedEncounter,
          ),
        );

        return savedEncounter;
      },
    );
  }

  private buildResolvedCombatantAttackCombatEvent(
    context: CombatantAttackContext,
    resolution: ResolvedAttack,
    encounter: Encounter,
  ): CombatEvent {
    return {
      type: 'combat_event',
      reason: 'attack_resolved',
      sessionId: context.sessionId,
      encounterId: encounter.id,
      attackerKind: 'combatant',
      attackerParticipantId: context.attackerParticipantId,
      attackerCombatantId: context.attackerCombatant.id,
      targetKind: 'character',
      targetParticipantId: context.targetParticipant.id,
      targetCharacterId: context.targetRecord.character.id,
      roll: resolution.roll,
      targetArmorClass: resolution.targetArmorClass,
      hit: resolution.hit,
      damage: resolution.damage,
      ...(resolution.damageRoll ? { damageRoll: resolution.damageRoll } : {}),
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

  private createSceneCombatant(input: DmCombatantInput): SceneCombatant {
    return {
      kind: input.kind,
      hp: structuredClone(input.hp),
      armorClass: input.armorClass,
      speed: input.speed,
      abilities: structuredClone(input.abilities),
    };
  }

  private requirePassiveSceneEntity(
    scene: Scene,
    entityId: SceneEntityId,
  ): SceneEntity {
    const entity = scene.entities.find(
      (candidate) => candidate.id === entityId,
    );

    if (!entity) {
      throw new SceneStoreError(
        'scene_not_found',
        `Scene entity "${entityId}" does not exist in scene "${scene.id}".`,
      );
    }

    if (entity.combatant) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${entityId}" is a combatant and must use combatant-specific commands.`,
      );
    }

    if (entity.transition) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${entityId}" is a transition and must use transition-specific commands.`,
      );
    }

    return {
      ...entity,
      transition: entity.transition,
    };
  }

  private requireSceneTransitionEntity(
    scene: Scene,
    entityId: SceneEntityId,
  ): SceneEntity & { transition: NonNullable<SceneEntity['transition']> } {
    const entity = scene.entities.find(
      (candidate) => candidate.id === entityId,
    );

    if (!entity) {
      throw new SceneStoreError(
        'scene_not_found',
        `Scene transition "${entityId}" does not exist in scene "${scene.id}".`,
      );
    }

    if (entity.combatant) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${entityId}" is a combatant and cannot be used as a scene transition.`,
      );
    }

    if (!entity.transition) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${entityId}" is not a transition node.`,
      );
    }

    return {
      ...entity,
      transition: entity.transition,
    };
  }

  private withoutSceneEntity(scene: Scene, entityId: SceneEntityId): Scene {
    return {
      ...scene,
      entities: scene.entities.filter((entity) => entity.id !== entityId),
    };
  }

  private requireSceneCombatant(
    scene: Scene,
    combatantId: SceneEntityId,
  ): SceneEntity {
    const entity = scene.entities.find(
      (candidate) => candidate.id === combatantId,
    );

    if (!entity) {
      throw new SceneStoreError(
        'scene_not_found',
        `Combatant "${combatantId}" does not exist in scene "${scene.id}".`,
      );
    }

    if (!entity.combatant) {
      throw new SceneStoreError(
        'invalid_character_state',
        `Scene entity "${combatantId}" is not an active combatant.`,
      );
    }

    return entity;
  }

  private assertSceneEntityDoesNotOverlapCharacters(params: {
    scene: Scene;
    entity: SceneEntity;
    characterRecords: StoredCharacterRecord[];
  }): void {
    const characterBlockers = params.characterRecords.flatMap((record) => {
      if (
        !record.overlay.position ||
        record.overlay.position.sceneId !== params.scene.id
      ) {
        return [];
      }

      return [
        {
          position: {
            x: record.overlay.position.x,
            y: record.overlay.position.y,
          },
          footprint: record.overlay.footprint,
        },
      ];
    });

    if (
      doesDestinationOverlapBlockingOccupancy(
        {
          position: params.entity.position,
          footprint: params.entity.footprint,
        },
        characterBlockers,
      )
    ) {
      throw new SceneStoreError(
        'scene_entity_overlap',
        `Scene entity "${params.entity.id}" overlaps with a character token in scene "${params.scene.id}".`,
      );
    }
  }

  // Painting a movement-blocking tile under a token or a blocking entity would
  // strand it in impassable terrain, so the paint is rejected rather than
  // silently creating a position the movement rules can never undo.
  private assertSceneTerrainDoesNotTrapOccupants(params: {
    characterRecords: StoredCharacterRecord[];
    scene: Scene;
    terrain: SceneTerrain;
  }): void {
    const blockedCells = buildBlockingTerrainOccupancies(
      params.scene.grid,
      params.terrain,
    );

    for (const record of params.characterRecords) {
      if (
        !record.overlay.position ||
        record.overlay.position.sceneId !== params.scene.id
      ) {
        continue;
      }

      const occupancy = {
        footprint: record.overlay.footprint,
        position: {
          x: record.overlay.position.x,
          y: record.overlay.position.y,
        },
      };

      if (doesDestinationOverlapBlockingOccupancy(occupancy, blockedCells)) {
        throw new SceneStoreError(
          'scene_terrain_blocks_occupant',
          `Terrain paint would block a character token in scene "${params.scene.id}".`,
        );
      }
    }

    for (const entity of params.scene.entities) {
      if (!entity.combatant) {
        continue;
      }

      if (
        doesDestinationOverlapBlockingOccupancy(
          { footprint: entity.footprint, position: entity.position },
          blockedCells,
        )
      ) {
        throw new SceneStoreError(
          'scene_terrain_blocks_occupant',
          `Terrain paint would block combatant "${entity.id}" in scene "${params.scene.id}".`,
        );
      }
    }
  }

  private assertCombatantCurrentHpCanBeSet(
    combatantId: SceneEntityId,
    combatant: SceneCombatant,
    currentHp: number,
  ): void {
    if (
      !Number.isInteger(currentHp) ||
      currentHp < 0 ||
      currentHp > combatant.hp.max
    ) {
      throw new SceneStoreError(
        'invalid_character_hp',
        `Current HP for combatant "${combatantId}" must be an integer from 0 to ${combatant.hp.max}.`,
      );
    }
  }

  private assertCombatantCanAct(entity: SceneEntity): void {
    if (entity.combatant && entity.combatant.hp.current > 0) {
      return;
    }

    throw new EncounterRuntimeError(
      'turn_actor_downed',
      `Current turn combatant "${entity.id}" is at 0 HP and cannot perform turn-bound combat actions.`,
    );
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

  private assertLibraryEntryCanEnterRuntime(
    command: SubmitCharacterLibraryEntryForAssignmentCommand,
    entry: CharacterLibraryEntry,
    snapshot: SessionSnapshot,
  ): void {
    if (entry.id !== command.payload.entryId) {
      throw new CharacterStoreError(
        'invalid_character_library_entry',
        `Character library entry "${entry.id}" does not match requested entry "${command.payload.entryId}".`,
      );
    }

    if (entry.status !== 'finalized') {
      throw new CharacterStoreError(
        'invalid_character_library_entry',
        `Character library entry "${entry.id}" must be finalized before it can be submitted for assignment.`,
      );
    }

    if (
      entry.ownerParticipantId &&
      entry.ownerParticipantId !== command.payload.ownerParticipantId
    ) {
      throw new CharacterStoreError(
        'invalid_participant_session_association',
        `Character library entry "${entry.id}" does not belong to owner "${command.payload.ownerParticipantId}".`,
      );
    }

    if (entry.rulesProfileId !== snapshot.session.rulesProfileId) {
      throw new CharacterStoreError(
        'invalid_participant_session_association',
        `Character library entry "${entry.id}" uses rules profile "${entry.rulesProfileId}" and cannot be used in session "${snapshot.session.id}".`,
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

    this.sessions.publishEncounterStateUpdate(
      update,
      this.resolveConcealedCombatantIds(params.encounter),
    );
  }

  /**
   * In DB mode the sink diverts these into the command's transaction, so the
   * outbox row and the state change commit together and the event is delivered
   * only after the commit succeeds. With no sink configured - in-memory mode -
   * they go straight to the room, which is the whole delivery guarantee that
   * mode offers.
   */
  private publishResolutionStateUpdate(params: ResolutionStateFanout): void {
    if (this.tableStateUpdateSink) {
      this.tableStateUpdateSink({
        type: 'resolution_state',
        reason: params.reason,
        sessionId: params.sessionId,
        state: {
          requests: structuredClone(params.requests),
          resolutions: structuredClone(params.resolutions),
        },
      });
      return;
    }

    this.sessions.publishResolutionStateUpdate(params);
  }

  private publishPlayerIntentStateUpdate(
    params: PlayerIntentStateFanout,
  ): void {
    if (this.tableStateUpdateSink) {
      this.tableStateUpdateSink({
        type: 'player_intent_state',
        reason: params.reason,
        sessionId: params.sessionId,
        state: { intents: structuredClone(params.intents) },
      });
      return;
    }

    this.sessions.publishPlayerIntentStateUpdate(params);
  }

  private publishCombatEvent(update: CombatEvent): void {
    if (this.combatEventSink) {
      this.combatEventSink(structuredClone(update));
      return;
    }

    this.sessions.publishCombatEvent(
      update,
      this.resolveConcealedCombatantIdsForSession(update.sessionId),
    );
  }

  /**
   * Scene entity IDs of combatants the DM has concealed in this encounter's
   * scene.
   *
   * Resolved from the scene on every publish rather than cached on the
   * encounter, so revealing or hiding a creature mid-combat takes effect on the
   * next event with no invalidation step.
   */
  private resolveConcealedCombatantIds(
    encounter: Encounter,
  ): ReadonlySet<SceneEntityId> {
    return collectConcealedCombatantIds(
      this.scenes.getScene(encounter.sceneId),
    );
  }

  /**
   * Public so the outbox dispatcher can project events it replays from
   * persisted rows. Those rows hold the authoritative payload and the
   * dispatcher has no scene access of its own, so without this the DB-mode
   * delivery path would broadcast unprojected encounter and combat events.
   */
  resolveConcealedCombatantIdsForSession(
    sessionId: SessionId,
  ): ReadonlySet<SceneEntityId> {
    const encounter = this.encounters.findEncounterBySession(sessionId);

    return encounter
      ? this.resolveConcealedCombatantIds(encounter)
      : new Set<SceneEntityId>();
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
    movementAllowanceFeet: number;
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

        if (isCombatantEncounterParticipant(currentTurnParticipant)) {
          const activeSceneId = requireActiveSceneId(snapshot);
          const scene = this.scenes.getScene(activeSceneId);
          assertSceneBelongsToSession(snapshot, scene);
          const combatant = this.requireSceneCombatant(
            scene,
            currentTurnParticipant.combatantId,
          );

          this.assertCombatantCanAct(combatant);

          return {
            encounter,
            movementAllowanceFeet: combatant.combatant?.speed ?? 0,
          };
        }

        // Concealment is applied when projecting a view for a client, never to
        // the stored encounter this mutation path reads. Reaching here with a
        // concealed participant would mean a projected view was written back as
        // authoritative state, which is a bug worth failing loudly on.
        if (!isCharacterEncounterParticipant(currentTurnParticipant)) {
          throw new EncounterRuntimeError(
            'internal_server_error',
            `Encounter "${encounter.id}" holds a concealed participant in authoritative state.`,
          );
        }

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
              movementAllowanceFeet: currentTurnCharacterRecord.character.speed,
            };
          },
        );
      },
    );
  }

  private buildEncounterParticipantsFromActiveScene(
    snapshot: SessionSnapshot,
    activeSceneState: ActiveSceneState,
    scene: Scene,
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
              // Initiative is rolled server-side once, at encounter start.
              initiative: rollInitiative({
                d20: rollD20(this.initiativeRoller),
                initiativeModifier: deriveCharacterStats(record.character)
                  .initiativeModifier,
              }),
            };
          },
        );
      }),
      (participants) => [
        ...participants,
        ...scene.entities.flatMap((entity): EncounterParticipant[] => {
          if (!entity.combatant || entity.combatant.hp.current === 0) {
            return [];
          }

          return [
            {
              kind: 'combatant',
              combatantId: entity.id,
              participantId: snapshot.session.dmParticipantId,
              initiative: rollInitiative({
                d20: rollD20(this.initiativeRoller),
                initiativeModifier: calculateInitiativeModifier(
                  entity.combatant.abilities,
                ),
              }),
            },
          ];
        }),
      ],
    );
  }

  private createCharacterId(): CharacterId {
    return `char_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
