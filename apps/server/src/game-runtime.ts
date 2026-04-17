import { randomUUID } from 'node:crypto';

import { deriveCharacterStats } from '@dnd/rules';
import type {
  AssignCharacterToParticipantCommand,
  ActivateSceneForSessionCommand,
  CharacterAssignmentSuccess,
  CharacterInput,
  CharacterResource,
  CharacterUpdateInput,
  CreateCharacterCommand,
  CreateSceneCommand,
  CreateSessionCommand,
  FinalizeCharacterCommand,
  GetSceneCommand,
  GetCharacterCommand,
  JoinSessionCommand,
  PlaceEntityInSceneCommand,
  ReconnectSessionCommand,
  SceneActivationSuccess,
  UpdateCharacterCommand,
} from '@dnd/protocol';
import type {
  Character,
  CharacterId,
  CharacterMeta,
  EncounterOverlay,
  Participant,
  ParticipantId,
  RulesProfile,
  Scene,
  SessionSnapshot,
} from '@dnd/shared';

import {
  CharacterRepository,
  CharacterStoreError,
  InMemoryCharacterStore,
  type StoredCharacterRecord,
} from './character-store.js';
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

  private createEncounterOverlay(characterId: CharacterId): EncounterOverlay {
    return {
      characterId,
      position: null,
      activeConditions: [],
      concentration: null,
      turnUsage: null,
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

  private createCharacterId(): CharacterId {
    return `char_${randomUUID()}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
