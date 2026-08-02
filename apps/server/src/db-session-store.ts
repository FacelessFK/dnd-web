import { randomInt } from 'node:crypto';

import type {
  CharacterStateUpdate,
  CombatEvent,
  CreateSessionCommand,
  EncounterStateUpdate,
  JoinSessionCommand,
  MovementStateUpdate,
  MovementStateUpdateReason,
  ReconnectSessionCommand,
  AuthoritativeSceneStateUpdate,
  SessionStateUpdate,
  SessionStateUpdateReason,
  SessionStreamEvent,
} from '@dnd/protocol';
import type {
  CharacterId,
  Participant,
  ParticipantId,
  ParticipantRole,
  SceneEntityFootprint,
  SceneEntityId,
  SceneId,
  ScenePosition,
  Session,
  SessionId,
  SessionSnapshot,
} from '@dnd/shared';
import type {
  PersistedSessionSnapshotDocument,
  SessionSnapshotDatabase,
} from '@dnd/db';

import {
  publishCombatEventToRoom,
  publishEncounterStateUpdateToRoom,
  publishPlayerIntentStateUpdateToRoom,
  publishResolutionStateUpdateToRoom,
  publishSceneStateUpdateToRoom,
  roomHasProjectedSubscribers,
  type SceneVisibilityContext,
  type PlayerIntentStateFanout,
  type ResolutionStateFanout,
} from './session-event-fanout.js';

import {
  SessionStoreError,
  type RuntimeSessionStore,
  type SessionCommandResult,
  type SessionSubscriber,
} from './session-store.js';

type ParticipantCreationCommand = CreateSessionCommand | JoinSessionCommand;

type SessionRoomState = {
  snapshot: SessionSnapshot;
  subscribers: Map<ParticipantId, SessionSubscriber>;
};

const SESSION_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INITIAL_REVISION = 1;

export class DbBackedSessionStore implements RuntimeSessionStore {
  private readonly rooms: Map<SessionId, SessionRoomState>;

  private constructor(
    private readonly database: SessionSnapshotDatabase,
    rooms: Map<SessionId, SessionRoomState>,
  ) {
    this.rooms = rooms;
  }

  static async fromDatabase(
    database: SessionSnapshotDatabase,
  ): Promise<DbBackedSessionStore> {
    const rooms = new Map<SessionId, SessionRoomState>();
    const rows = await database.listSessionSnapshots();

    for (const row of rows) {
      rooms.set(row.sessionId, {
        snapshot: DbBackedSessionStore.hydrateSnapshot(row.snapshot),
        subscribers: new Map(),
      });
    }

    return new DbBackedSessionStore(database, rooms);
  }

  forkForTransaction(database: SessionSnapshotDatabase): DbBackedSessionStore {
    const rooms = new Map<SessionId, SessionRoomState>();

    for (const [sessionId, room] of this.rooms.entries()) {
      rooms.set(sessionId, {
        snapshot: this.clone(room.snapshot),
        subscribers: new Map(),
      });
    }

    return new DbBackedSessionStore(database, rooms);
  }

  async createSession(
    command: CreateSessionCommand,
  ): Promise<SessionCommandResult> {
    this.assertRoleAssumption(command.actor.role, 'dm');

    const now = this.now();
    const sessionId = await this.generateSessionId();
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

    await this.persistSnapshot(snapshot);

    const room: SessionRoomState = {
      snapshot,
      subscribers: new Map(),
    };

    this.rooms.set(sessionId, room);

    return {
      participantId: dm.id,
      sessionId,
      state: this.clone(snapshot),
    };
  }

  async joinSession(
    command: JoinSessionCommand,
  ): Promise<SessionCommandResult> {
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

    const snapshot = await this.applyDurableMutation(
      room,
      'participant_joined',
      (nextSnapshot) => {
        nextSnapshot.participants.push(participant);
        nextSnapshot.session.playerParticipantIds.push(participant.id);
      },
    );

    return {
      participantId: participant.id,
      sessionId: snapshot.session.id,
      state: snapshot,
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
      this.applyEphemeralMutation(room, 'participant_connected', () => {
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

    this.applyEphemeralMutation(room, 'participant_disconnected', () => {
      participant.connectionStatus = 'disconnected';
      participant.lastSeenAt = this.now();
    });
  }

  async assignCharacterToParticipant(
    sessionId: SessionId,
    participantId: ParticipantId,
    characterId: CharacterId,
  ): Promise<SessionSnapshot> {
    const room = this.requireRoom(sessionId);
    const participant = this.requireParticipant(room.snapshot, participantId);

    if (
      participant.characterId === characterId &&
      !participant.pendingCharacterId
    ) {
      return this.clone(room.snapshot);
    }

    return this.applyDurableMutation(
      room,
      'participant_character_assigned',
      (nextSnapshot) => {
        const nextParticipant = this.requireParticipant(
          nextSnapshot,
          participantId,
        );

        nextParticipant.characterId = characterId;
        nextParticipant.pendingCharacterId = null;
      },
    );
  }

  async submitCharacterForAssignment(
    sessionId: SessionId,
    participantId: ParticipantId,
    characterId: CharacterId,
  ): Promise<SessionSnapshot> {
    const room = this.requireRoom(sessionId);
    const participant = this.requireParticipant(room.snapshot, participantId);

    if (
      participant.pendingCharacterId === characterId &&
      participant.characterId !== characterId
    ) {
      return this.clone(room.snapshot);
    }

    if (
      participant.characterId === characterId &&
      !participant.pendingCharacterId
    ) {
      return this.clone(room.snapshot);
    }

    return this.applyDurableMutation(
      room,
      'participant_character_submitted',
      (nextSnapshot) => {
        const nextParticipant = this.requireParticipant(
          nextSnapshot,
          participantId,
        );

        nextParticipant.pendingCharacterId =
          nextParticipant.characterId === characterId ? null : characterId;
      },
    );
  }

  async activateScene(
    sessionId: SessionId,
    sceneId: SceneId,
  ): Promise<SessionSnapshot> {
    const room = this.requireRoom(sessionId);

    if (room.snapshot.session.activeSceneId === sceneId) {
      return this.clone(room.snapshot);
    }

    return this.applyDurableMutation(
      room,
      'active_scene_changed',
      (nextSnapshot) => {
        nextSnapshot.session.activeSceneId = sceneId;
      },
    );
  }

  replaceSessionSnapshot(snapshot: SessionSnapshot): void {
    const existing = this.rooms.get(snapshot.session.id);

    if (existing) {
      existing.snapshot = this.clone(snapshot);
      return;
    }

    this.rooms.set(snapshot.session.id, {
      snapshot: this.clone(snapshot),
      subscribers: new Map(),
    });
  }

  publishSessionStateUpdate(update: SessionStateUpdate): void {
    const room = this.requireRoom(update.sessionId);

    this.broadcast(room, update);
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

  publishEncounterStateUpdate(
    update: EncounterStateUpdate,
    concealedCombatantIds?: ReadonlySet<SceneEntityId>,
  ): void {
    publishEncounterStateUpdateToRoom(
      this.requireRoom(update.sessionId),
      update,
      concealedCombatantIds,
    );
  }

  publishCombatEvent(
    update: CombatEvent,
    concealedCombatantIds?: ReadonlySet<SceneEntityId>,
  ): void {
    publishCombatEventToRoom(
      this.requireRoom(update.sessionId),
      update,
      concealedCombatantIds,
    );
  }

  hasProjectedSubscribers(sessionId: SessionId): boolean {
    const room = this.rooms.get(sessionId);

    return room ? roomHasProjectedSubscribers(room) : false;
  }

  publishSceneStateUpdate(
    update: AuthoritativeSceneStateUpdate,
    visibility?: SceneVisibilityContext,
  ): void {
    publishSceneStateUpdateToRoom(
      this.requireRoom(update.sessionId),
      update,
      visibility,
    );
  }

  publishResolutionStateUpdate(params: ResolutionStateFanout): void {
    publishResolutionStateUpdateToRoom(
      this.requireRoom(params.sessionId),
      params,
    );
  }

  publishPlayerIntentStateUpdate(params: PlayerIntentStateFanout): void {
    publishPlayerIntentStateUpdateToRoom(
      this.requireRoom(params.sessionId),
      params,
    );
  }

  publishCharacterStateUpdate(update: CharacterStateUpdate): void {
    const room = this.requireRoom(update.sessionId);
    const participant = this.requireParticipant(
      room.snapshot,
      update.participantId,
    );

    if (participant.characterId !== update.characterId) {
      throw new SessionStoreError(
        'internal_server_error',
        `Cannot publish character state for character "${update.characterId}" because participant "${participant.id}" is assigned to "${participant.characterId ?? 'none'}".`,
      );
    }

    this.broadcast(room, update);
  }

  private async applyDurableMutation(
    room: SessionRoomState,
    reason: Exclude<SessionStateUpdateReason, 'initial_sync'>,
    mutate: (nextSnapshot: SessionSnapshot) => void,
  ): Promise<SessionSnapshot> {
    const nextSnapshot = this.clone(room.snapshot);

    mutate(nextSnapshot);
    nextSnapshot.session.revision += 1;
    nextSnapshot.session.updatedAt = this.now();

    await this.persistSnapshot(nextSnapshot);

    room.snapshot = nextSnapshot;
    this.broadcast(room, this.buildUpdate(room, reason));

    return this.clone(room.snapshot);
  }

  private applyEphemeralMutation(
    room: SessionRoomState,
    reason: Exclude<SessionStateUpdateReason, 'initial_sync'>,
    mutate: () => void,
  ): void {
    mutate();
    room.snapshot.session.revision += 1;
    room.snapshot.session.updatedAt = this.now();
    this.broadcast(room, this.buildUpdate(room, reason));
  }

  private async persistSnapshot(snapshot: SessionSnapshot): Promise<void> {
    await this.database.upsertSessionSnapshot({
      sessionId: snapshot.session.id,
      snapshot: this.toPersistedSnapshot(snapshot),
    });
  }

  private toPersistedSnapshot(
    snapshot: SessionSnapshot,
  ): PersistedSessionSnapshotDocument {
    return {
      session: this.clone(snapshot.session),
      participants: snapshot.participants.map((participant) => ({
        characterId: participant.characterId,
        displayName: participant.displayName,
        id: participant.id,
        joinedAt: participant.joinedAt,
        pendingCharacterId: participant.pendingCharacterId,
        role: participant.role,
      })),
    };
  }

  private static hydrateSnapshot(
    snapshot: PersistedSessionSnapshotDocument,
  ): SessionSnapshot {
    return {
      session: structuredClone(snapshot.session),
      participants: snapshot.participants.map((participant) => ({
        ...structuredClone(participant),
        connectionStatus: 'disconnected',
        lastSeenAt: participant.joinedAt,
        pendingCharacterId: participant.pendingCharacterId ?? null,
      })),
    };
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
      pendingCharacterId: null,
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

  private async generateSessionId(): Promise<SessionId> {
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
