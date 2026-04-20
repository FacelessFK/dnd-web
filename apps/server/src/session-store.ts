import { randomInt, randomUUID } from 'node:crypto';

import type {
  CombatEvent,
  CreateSessionCommand,
  EncounterStateUpdate,
  JoinSessionCommand,
  MovementStateUpdate,
  MovementStateUpdateReason,
  ReconnectSessionCommand,
  SessionErrorCode,
  SessionStreamEvent,
  SessionStateUpdate,
  SessionStateUpdateReason,
} from '@dnd/protocol';
import type {
  CharacterId,
  Participant,
  ParticipantId,
  ParticipantRole,
  SceneEntityFootprint,
  SceneId,
  ScenePosition,
  Session,
  SessionId,
  SessionSnapshot,
} from '@dnd/shared';

type ParticipantCreationCommand = CreateSessionCommand | JoinSessionCommand;

type SessionSubscriber = {
  connectionId: string;
  close: () => void;
  send: (update: SessionStreamEvent) => void;
};

type SessionRoomState = {
  snapshot: SessionSnapshot;
  subscribers: Map<ParticipantId, SessionSubscriber>;
};

type SessionCommandResult = {
  participantId: ParticipantId;
  sessionId: SessionId;
  state: SessionSnapshot;
};

const SESSION_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INITIAL_REVISION = 1;

export class SessionStoreError extends Error {
  constructor(
    readonly code: SessionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SessionStoreError';
  }
}

export class InMemorySessionStore {
  private readonly rooms = new Map<SessionId, SessionRoomState>();

  createSession(command: CreateSessionCommand): SessionCommandResult {
    this.assertRoleAssumption(command.actor.role, 'dm');

    const now = this.now();
    const sessionId = this.generateSessionId();
    const dm = this.createParticipant(command, 'dm', now);
    const session: Session = {
      id: sessionId,
      status: 'lobby',
      dmParticipantId: dm.id,
      playerParticipantIds: [],
      rulesProfileId: command.payload.rulesProfileId,
      activeSceneId: null,
      createdAt: now,
      updatedAt: now,
      revision: INITIAL_REVISION,
    };
    const snapshot: SessionSnapshot = {
      session,
      participants: [dm],
    };

    this.rooms.set(sessionId, {
      snapshot,
      subscribers: new Map(),
    });

    return {
      participantId: dm.id,
      sessionId,
      state: this.clone(snapshot),
    };
  }

  joinSession(command: JoinSessionCommand): SessionCommandResult {
    this.assertRoleAssumption(command.actor.role, 'player');

    const room = this.requireRoom(command.payload.sessionId);

    if (this.findParticipant(room.snapshot, command.actor.participantId)) {
      throw new SessionStoreError(
        'duplicate_join',
        `Participant "${command.actor.participantId}" is already a member of session "${command.payload.sessionId}".`,
      );
    }

    const now = this.now();
    const participant = this.createParticipant(command, 'player', now);

    this.applyMutation(room, 'participant_joined', () => {
      room.snapshot.participants.push(participant);
      room.snapshot.session.playerParticipantIds.push(participant.id);
    });

    return {
      participantId: participant.id,
      sessionId: room.snapshot.session.id,
      state: this.clone(room.snapshot),
    };
  }

  reconnectSession(command: ReconnectSessionCommand): SessionCommandResult {
    const room = this.requireRoom(command.payload.sessionId);
    const participant = this.requireParticipant(
      room.snapshot,
      command.actor.participantId,
    );

    if (command.actor.role && command.actor.role !== participant.role) {
      throw new SessionStoreError(
        'invalid_role_assumption',
        `Participant "${participant.id}" is stored as role "${participant.role}" and cannot reconnect as "${command.actor.role}".`,
      );
    }

    return {
      participantId: participant.id,
      sessionId: room.snapshot.session.id,
      state: this.clone(room.snapshot),
    };
  }

  getSessionSnapshot(sessionId: SessionId): SessionSnapshot {
    return this.clone(this.requireRoom(sessionId).snapshot);
  }

  getSessionSnapshotForParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): SessionSnapshot {
    const room = this.requireRoom(sessionId);
    this.requireParticipant(room.snapshot, participantId);

    return this.clone(room.snapshot);
  }

  connectParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
    subscriber: SessionSubscriber,
  ): void {
    const room = this.requireRoom(sessionId);
    const participant = this.requireParticipant(room.snapshot, participantId);
    const existing = room.subscribers.get(participantId);

    room.subscribers.set(participantId, subscriber);

    if (existing && existing.connectionId !== subscriber.connectionId) {
      existing.close();
    }

    if (participant.connectionStatus !== 'connected') {
      this.applyMutation(room, 'participant_connected', () => {
        participant.connectionStatus = 'connected';
        participant.lastSeenAt = this.now();
      });

      return;
    }

    subscriber.send(this.buildUpdate(room, 'initial_sync'));
  }

  disconnectParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
    connectionId: string,
  ): void {
    const room = this.rooms.get(sessionId);

    if (!room) {
      return;
    }

    const currentSubscriber = room.subscribers.get(participantId);

    if (!currentSubscriber || currentSubscriber.connectionId !== connectionId) {
      return;
    }

    room.subscribers.delete(participantId);

    const participant = this.findParticipant(room.snapshot, participantId);

    if (!participant || participant.connectionStatus === 'disconnected') {
      return;
    }

    this.applyMutation(room, 'participant_disconnected', () => {
      participant.connectionStatus = 'disconnected';
      participant.lastSeenAt = this.now();
    });
  }

  assignCharacterToParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
    characterId: CharacterId,
  ): SessionSnapshot {
    const room = this.requireRoom(sessionId);
    const participant = this.requireParticipant(room.snapshot, participantId);

    if (participant.characterId === characterId) {
      return this.clone(room.snapshot);
    }

    this.applyMutation(room, 'participant_character_assigned', () => {
      participant.characterId = characterId;
    });

    return this.clone(room.snapshot);
  }

  activateScene(sessionId: SessionId, sceneId: SceneId): SessionSnapshot {
    const room = this.requireRoom(sessionId);

    if (room.snapshot.session.activeSceneId === sceneId) {
      return this.clone(room.snapshot);
    }

    this.applyMutation(room, 'active_scene_changed', () => {
      room.snapshot.session.activeSceneId = sceneId;
    });

    return this.clone(room.snapshot);
  }

  publishMovementStateUpdate(params: {
    sessionId: SessionId;
    activeSceneId: SceneId;
    participantId: ParticipantId;
    characterId: CharacterId;
    position: ScenePosition;
    footprint: SceneEntityFootprint;
    reason: MovementStateUpdateReason;
  }): MovementStateUpdate {
    const room = this.requireRoom(params.sessionId);

    if (room.snapshot.session.activeSceneId !== params.activeSceneId) {
      throw new SessionStoreError(
        'internal_server_error',
        `Cannot publish movement for scene "${params.activeSceneId}" because session "${params.sessionId}" is currently active on "${room.snapshot.session.activeSceneId ?? 'none'}".`,
      );
    }

    const update: MovementStateUpdate = {
      type: 'movement_state',
      reason: params.reason,
      sessionId: params.sessionId,
      activeSceneId: params.activeSceneId,
      participantId: params.participantId,
      characterId: params.characterId,
      position: structuredClone(params.position),
      footprint: structuredClone(params.footprint),
    };

    this.broadcast(room, update);

    return this.clone(update);
  }

  publishEncounterStateUpdate(update: EncounterStateUpdate): void {
    const room = this.requireRoom(update.sessionId);

    this.broadcast(room, update);
  }

  publishCombatEvent(update: CombatEvent): void {
    const room = this.requireRoom(update.sessionId);

    this.broadcast(room, update);
  }

  private applyMutation(
    room: SessionRoomState,
    reason: Exclude<SessionStateUpdateReason, 'initial_sync'>,
    mutate: () => void,
  ): void {
    mutate();
    room.snapshot.session.revision += 1;
    room.snapshot.session.updatedAt = this.now();
    this.broadcast(room, this.buildUpdate(room, reason));
  }

  private broadcast(room: SessionRoomState, update: SessionStreamEvent): void {
    for (const subscriber of room.subscribers.values()) {
      subscriber.send(this.clone(update));
    }
  }

  private buildUpdate(
    room: SessionRoomState,
    reason: SessionStateUpdateReason,
  ): SessionStateUpdate {
    const state = this.clone(room.snapshot);

    return {
      type: 'session_state',
      reason,
      sessionId: state.session.id,
      revision: state.session.revision,
      state,
    };
  }

  private createParticipant(
    command: ParticipantCreationCommand,
    role: ParticipantRole,
    now: string,
  ): Participant {
    return {
      id: command.actor.participantId,
      displayName: command.actor.displayName,
      role,
      connectionStatus: 'disconnected',
      joinedAt: now,
      lastSeenAt: now,
      characterId: null,
    };
  }

  private requireRoom(sessionId: SessionId): SessionRoomState {
    const room = this.rooms.get(sessionId);

    if (!room) {
      throw new SessionStoreError(
        'session_not_found',
        `Session "${sessionId}" does not exist.`,
      );
    }

    return room;
  }

  private requireParticipant(
    snapshot: SessionSnapshot,
    participantId: ParticipantId,
  ): Participant {
    const participant = this.findParticipant(snapshot, participantId);

    if (!participant) {
      throw new SessionStoreError(
        'participant_not_found',
        `Participant "${participantId}" is not a member of session "${snapshot.session.id}".`,
      );
    }

    return participant;
  }

  private findParticipant(
    snapshot: SessionSnapshot,
    participantId: ParticipantId,
  ): Participant | undefined {
    return snapshot.participants.find(
      (participant) => participant.id === participantId,
    );
  }

  private assertRoleAssumption(
    assumedRole: ParticipantRole | undefined,
    expectedRole: ParticipantRole,
  ): void {
    if (!assumedRole || assumedRole === expectedRole) {
      return;
    }

    throw new SessionStoreError(
      'invalid_role_assumption',
      `Expected role "${expectedRole}" but received "${assumedRole}".`,
    );
  }

  private generateSessionId(): SessionId {
    let nextId = '';

    do {
      nextId = Array.from(
        { length: 6 },
        () => SESSION_ID_ALPHABET[randomInt(0, SESSION_ID_ALPHABET.length)],
      ).join('');
    } while (this.rooms.has(nextId));

    return nextId;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private clone<T>(value: T): T {
    return structuredClone(value);
  }
}

export function createConnectionId(): string {
  return randomUUID();
}
