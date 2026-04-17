import { deriveCharacterStats } from '@dnd/rules';
import type {
  AssignCharacterToParticipantCommand,
  CharacterAssignmentSuccess,
  CharacterResource,
  CreateCharacterCommand,
  CreateSessionCommand,
  GetCharacterCommand,
  JoinSessionCommand,
  ReconnectSessionCommand,
} from '@dnd/protocol';
import type {
  CharacterId,
  Participant,
  ParticipantId,
  RulesProfile,
  SessionSnapshot,
} from '@dnd/shared';

import {
  CharacterStoreError,
  InMemoryCharacterStore,
  type StoredCharacterRecord,
} from './character-store.js';
import {
  DEFAULT_RULES_PROFILE_ID,
  InMemoryRulesProfileStore,
} from './rules-profile-store.js';
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
    readonly characters = new InMemoryCharacterStore(),
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

    this.assertActorCanManageParticipant(actor, ownerParticipant);

    const rulesProfile = this.rulesProfiles.getRulesProfile(
      snapshot.session.rulesProfileId,
    );
    const record = this.characters.createCharacter({
      ownerParticipantId: ownerParticipant.id,
      rulesProfileId: rulesProfile.id,
      character: command.payload.character,
    });

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

    this.assertActorCanManageParticipant(actor, participant);
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

  private assertActorCanManageParticipant(
    actor: Participant,
    participant: Participant,
  ): void {
    if (actor.role === 'dm' || actor.id === participant.id) {
      return;
    }

    throw new CharacterStoreError(
      'invalid_participant_session_association',
      `Participant "${actor.id}" cannot manage character state for "${participant.id}".`,
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
}
