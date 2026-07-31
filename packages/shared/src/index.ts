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
export const encounterStatuses = ['active', 'ended'] as const;
export const visibilityStates = ['visible', 'hidden', 'obscured'] as const;
export const sceneEntityTypes = [
  'player_spawn',
  'monster',
  'object',
  'terrain',
] as const;
export const sceneCombatantKinds = ['monster', 'npc'] as const;

export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/**
 * The eighteen 5e skills, as canonical untranslated IDs.
 *
 * These exist because a proficiency has to be recorded as something stable. The
 * character builder keys its own tables on English display names - `'Animal
 * Handling'` - which is fine for a phrase book and unusable as an identifier:
 * the moment the Persian UI is the source of a selection, a label-keyed
 * proficiency either breaks or silently stops matching. Requests, audit records
 * and stored proficiencies all use the IDs below; the UI maps them to copy.
 */
export const skillIds = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const;

/**
 * Advantage and disadvantage describe the dice, not the total: they change how
 * many d20s are rolled and which one counts. They are kept out of the modifier
 * list so a second source of the same stance cannot be counted twice.
 */
export const rollStances = ['normal', 'advantage', 'disadvantage'] as const;

export const resolutionKinds = [
  'ability_check',
  'saving_throw',
  'attack_roll',
] as const;

/** Canonical, untranslated. The UI maps these to localized copy. */
export const modifierSourceKinds = [
  'ability',
  'proficiency',
  'condition',
  'gm_adjustment',
] as const;

/**
 * Conditions the rules engine actually applies, as opposed to the free-form
 * tags a GM can attach for their own notes. A condition listed here changes
 * resolution; anything else is display only.
 */
export const mechanicalConditions = ['poisoned'] as const;
export const sceneTransitionKinds = [
  'door',
  'stairs',
  'portal',
  'gate',
  'other',
] as const;

// Paintable per-cell map surface. This is the map-builder tile palette and the
// visual base layer under scene entities; it is deliberately separate from
// `sceneEntityTypes`, which stays an entity/object list.
export const sceneTerrainTiles = [
  'void',
  'stone',
  'flagstone',
  'wood',
  'dirt',
  'grass',
  'sand',
  'water',
  'deep_water',
  'ice',
  'rubble',
  'lava',
  'chasm',
  'wall',
  'wall_brick',
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
export type AbilityKey = (typeof abilityKeys)[number];
export type SkillId = (typeof skillIds)[number];
export type RollStance = (typeof rollStances)[number];
export type ResolutionKind = (typeof resolutionKinds)[number];
export type ModifierSourceKind = (typeof modifierSourceKinds)[number];
export type MechanicalCondition = (typeof mechanicalConditions)[number];
export type ConnectionStatus = (typeof connectionStatuses)[number];
export type SessionStatus = (typeof sessionStatuses)[number];
export type BaseRuleset = (typeof baseRulesets)[number];
export type RulesStrictnessLevel = (typeof rulesStrictnessLevels)[number];
export type CharacterStatus = (typeof characterStatuses)[number];
export type EncounterStatus = (typeof encounterStatuses)[number];
export type VisibilityState = (typeof visibilityStates)[number];
export type SceneEntityType = (typeof sceneEntityTypes)[number];
export type SceneCombatantKind = (typeof sceneCombatantKinds)[number];
export type SceneTransitionKind = (typeof sceneTransitionKinds)[number];
export type SceneTerrainTile = (typeof sceneTerrainTiles)[number];
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
  pendingCharacterId: CharacterId | null;
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

export interface CharacterProficiencies {
  savingThrows: AbilityKey[];
  skills: SkillId[];
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
  proficiencies: CharacterProficiencies;
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

export interface CharacterEncounterParticipant {
  kind?: 'character';
  characterId: CharacterId;
  participantId: ParticipantId;
  initiative: number;
}

export interface CombatantEncounterParticipant {
  kind: 'combatant';
  combatantId: SceneEntityId;
  participantId: ParticipantId;
  initiative: number;
}

/**
 * A combatant the viewer may not identify.
 *
 * Only ever produced by role projection on the way out to a client. The
 * authoritative encounter never holds one, so turn resolution, attack
 * validation, and persistence keep working with fully identified participants.
 */
export interface ConcealedCombatantEncounterParticipant {
  kind: 'concealed_combatant';
  participantId: ParticipantId;
  initiative: number;
}

export type EncounterParticipant =
  | CharacterEncounterParticipant
  | CombatantEncounterParticipant
  | ConcealedCombatantEncounterParticipant;

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

export interface SceneCombatant {
  kind: SceneCombatantKind;
  hp: CharacterHitPoints;
  armorClass: number;
  speed: number;
  abilities: AbilityScores;
}

export interface SceneTransition {
  kind: SceneTransitionKind;
  targetSceneId: SceneId;
  targetLabel: string | null;
  notes: string | null;
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
  combatant: SceneCombatant | null;
  transition?: SceneTransition | null;
  meta: SceneEntityMeta;
}

// Row-major run-length encoding of the terrain layer. A 60x40 map is 2400
// cells; storing one entry per cell would bloat every scene read model and SSE
// payload, while painted maps compress to a handful of runs.
export interface SceneTerrainRun {
  tile: SceneTerrainTile;
  length: number;
}

export interface SceneTerrain {
  runs: SceneTerrainRun[];
}

export interface Scene {
  id: SceneId;
  sessionId: SessionId;
  name: string;
  grid: GridDefinition;
  // Nullable so scenes persisted before the terrain layer stay readable; the
  // terrain helpers treat null as an unpainted map of the default base tile.
  terrain: SceneTerrain | null;
  entities: SceneEntity[];
  createdAt: string;
  updatedAt: string;
}
