export const participantRoles = ['dm', 'player'] as const;
export const connectionStatuses = ['connected', 'disconnected'] as const;
export const sessionStatuses = ['lobby'] as const;

export type SessionId = string;
export type ParticipantId = string;
export type SessionStateRevision = number;
export type ParticipantRole = (typeof participantRoles)[number];
export type ConnectionStatus = (typeof connectionStatuses)[number];
export type SessionStatus = (typeof sessionStatuses)[number];

export interface Participant {
  id: ParticipantId;
  displayName: string;
  role: ParticipantRole;
  connectionStatus: ConnectionStatus;
  joinedAt: string;
  lastSeenAt: string;
  characterId: string | null;
}

export interface Session {
  id: SessionId;
  status: SessionStatus;
  dmParticipantId: ParticipantId;
  playerParticipantIds: ParticipantId[];
  rulesProfileId: string | null;
  activeSceneId: string | null;
  createdAt: string;
  updatedAt: string;
  revision: SessionStateRevision;
}

export interface SessionSnapshot {
  session: Session;
  participants: Participant[];
}
