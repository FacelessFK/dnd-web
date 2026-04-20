export const participantRoles = ['dm', 'player'] as const;
export const connectionStatuses = ['connected', 'disconnected'] as const;
export const sessionStatuses = ['lobby'] as const;
export const baseRulesets = ['dnd5e-2014', 'dnd5e-2024'] as const;
export const rulesStrictnessLevels = [
  'strict_raw',
  'assistive_raw',
  'dm_led',
] as const;
export const characterStatuses = ['draft', 'ready'] as const;
export const encounterStatuses = ['active'] as const;
export const visibilityStates = ['visible', 'hidden', 'obscured'] as const;
export const sceneEntityTypes = [
  'player_spawn',
  'monster',
  'object',
  'terrain',
] as const;

export type SessionId = string;
export type ParticipantId = string;
export type CharacterId = string;
export type RulesProfileId = string;
export type SceneId = string;
export type SceneEntityId = string;
export type EncounterId = string;
export type SessionStateRevision = number;
export type ParticipantRole = (typeof participantRoles)[number];
export type ConnectionStatus = (typeof connectionStatuses)[number];
export type SessionStatus = (typeof sessionStatuses)[number];
export type BaseRuleset = (typeof baseRulesets)[number];
export type RulesStrictnessLevel = (typeof rulesStrictnessLevels)[number];
export type CharacterStatus = (typeof characterStatuses)[number];
export type EncounterStatus = (typeof encounterStatuses)[number];
export type VisibilityState = (typeof visibilityStates)[number];
export type SceneEntityType = (typeof sceneEntityTypes)[number];
export type RulesConfigValue = string | number | boolean | null;
export type CharacterMeta = Record<string, RulesConfigValue>;
export type SceneEntityMeta = Record<string, RulesConfigValue>;

export interface RulesProfile {
  id: RulesProfileId;
  baseRuleset: BaseRuleset;
  strictness: RulesStrictnessLevel;
  optionalRules: string[];
  houseRules: Record<string, RulesConfigValue>;
  allowedSources: string[];
}

export interface Participant {
  id: ParticipantId;
  displayName: string;
  role: ParticipantRole;
  connectionStatus: ConnectionStatus;
  joinedAt: string;
  lastSeenAt: string;
  characterId: CharacterId | null;
}

export interface Session {
  id: SessionId;
  status: SessionStatus;
  dmParticipantId: ParticipantId;
  playerParticipantIds: ParticipantId[];
  rulesProfileId: RulesProfileId;
  activeSceneId: SceneId | null;
  createdAt: string;
  updatedAt: string;
  revision: SessionStateRevision;
}

export interface SessionSnapshot {
  session: Session;
  participants: Participant[];
}

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface CharacterHitPoints {
  max: number;
  current: number;
  temp: number;
}

export interface Character {
  id: CharacterId;
  ownerParticipantId: ParticipantId;
  status: CharacterStatus;
  name: string;
  rulesProfileId: RulesProfileId;
  level: number;
  className: string;
  // Temporary cross-ruleset placeholder until ancestry terminology is split by ruleset.
  speciesOrRace: string;
  background: string;
  abilities: AbilityScores;
  hp: CharacterHitPoints;
  armorClass: number;
  speed: number;
  notes: string | null;
  meta: CharacterMeta;
  createdAt: string;
  updatedAt: string;
}

export interface EncounterPosition {
  sceneId: SceneId | null;
  x: number;
  y: number;
}

export interface TurnUsage {
  actionUsed: boolean;
  bonusActionUsed: boolean;
  reactionUsed: boolean;
  movementUsed: number;
}

export interface EncounterParticipant {
  characterId: CharacterId;
  participantId: ParticipantId;
  initiative: number;
}

export interface Encounter {
  id: EncounterId;
  sessionId: SessionId;
  sceneId: SceneId;
  status: EncounterStatus;
  participants: EncounterParticipant[];
  currentTurnIndex: number;
  roundNumber: number;
  currentTurnUsage: TurnUsage;
  createdAt: string;
  updatedAt: string;
}

export interface ConcentrationState {
  effectName: string;
}

export interface EncounterOverlay {
  characterId: CharacterId;
  footprint: SceneEntityFootprint;
  position: EncounterPosition | null;
  activeConditions: string[];
  concentration: ConcentrationState | null;
  currentVisibility: VisibilityState;
}

export interface AbilityModifiers {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface DerivedCharacterStats {
  abilityModifiers: AbilityModifiers;
  proficiencyBonus: number;
  initiativeModifier: number;
  passivePerception: number;
  spellSaveDc: number | null;
}

export interface GridDefinition {
  cellSizeFeet: number;
  width: number;
  height: number;
}

export interface ScenePosition {
  x: number;
  y: number;
}

export interface SceneEntityFootprint {
  width: number;
  height: number;
}

export interface SceneEntity {
  id: SceneEntityId;
  type: SceneEntityType;
  name: string;
  position: ScenePosition;
  footprint: SceneEntityFootprint;
  blocksMovement: boolean;
  blocksVision: boolean;
  hidden: boolean;
  meta: SceneEntityMeta;
}

export interface Scene {
  id: SceneId;
  sessionId: SessionId;
  name: string;
  grid: GridDefinition;
  entities: SceneEntity[];
  createdAt: string;
  updatedAt: string;
}
