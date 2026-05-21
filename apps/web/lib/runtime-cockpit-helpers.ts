import type {
  CharacterInput,
  CharacterLibraryEntry,
  CharacterResource,
  CharacterUpdateInput,
  DmCombatantInput,
  Encounter,
  GridDefinition,
  OutboxStatusSuccess,
  RuntimeErrorCode,
  Scene,
  SceneEntity,
  SceneEntityInput,
  SceneEntityUpdateInput,
  SceneInput,
  SceneTransitionInput,
  SceneTransitionUpdateInput,
  SessionStreamEvent,
  SessionCommandSuccess,
} from '@dnd/protocol';
import {
  sceneEntityTypeSchema,
  sceneTransitionKindSchema,
} from '@dnd/protocol';

import type { RuntimeApiFailure } from './runtime-api';

export type SessionSnapshot = SessionCommandSuccess['data']['state'];

export type Cell = {
  x: number;
  y: number;
};

export type TacticalBoardViewport = {
  panX: number;
  panY: number;
  zoom: number;
};

export type TacticalBoardCellBadgeKind =
  | 'move'
  | 'selected'
  | 'target'
  | 'turn';

export type TacticalBoardCellAffordance = {
  badges: TacticalBoardCellBadgeKind[];
  isAttackTarget: boolean;
  isCurrentTurnActor: boolean;
  isMovementTarget: boolean;
  isSelectedCell: boolean;
  isSelectedToken: boolean;
};

export type TacticalBoardZoomDirection = 'in' | 'out';
export type TacticalBoardPanDirection = 'down' | 'left' | 'right' | 'up';

export type RuntimeMode = 'dm' | 'player';

export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export type AbilityKey = (typeof abilityKeys)[number];

export type CharacterDraftForm = {
  abilities: Record<AbilityKey, string>;
  armorClass: string;
  background: string;
  className: string;
  hp: {
    current: string;
    max: string;
    temp: string;
  };
  level: string;
  name: string;
  notes: string;
  speciesOrRace: string;
  speed: string;
};

export type SceneDraftForm = {
  cellSizeFeet: string;
  height: string;
  name: string;
  width: string;
};

export type SceneEntityDraftForm = {
  blocksMovement: boolean;
  blocksVision: boolean;
  footprintHeight: string;
  footprintWidth: string;
  hidden: boolean;
  name: string;
  type: SceneEntityInput['type'];
};

export type SceneTransitionDraftForm = {
  blocksMovement: boolean;
  blocksVision: boolean;
  footprintHeight: string;
  footprintWidth: string;
  hidden: boolean;
  kind: SceneTransitionInput['kind'];
  name: string;
  notes: string;
  targetLabel: string;
  targetSceneId: string;
};

export type CombatantDraftForm = {
  abilities: Record<AbilityKey, string>;
  armorClass: string;
  footprintHeight: string;
  footprintWidth: string;
  hidden: boolean;
  hp: {
    current: string;
    max: string;
    temp: string;
  };
  kind: DmCombatantInput['kind'];
  name: string;
  speed: string;
};

export type SceneEntityDisplayCell = {
  entity: SceneEntity;
  isOrigin: boolean;
  label: string;
  x: number;
  y: number;
};

export type CombatantDisplayCell = SceneEntityDisplayCell & {
  entity: SceneEntity & { combatant: NonNullable<SceneEntity['combatant']> };
};

export type StoredCockpitState = {
  charactersByParticipant?: Record<string, string>;
  dmDisplayName?: string;
  dmParticipantId?: string;
  mode?: RuntimeMode;
  playerDisplayName?: string;
  playerParticipantId?: string;
  sceneId?: string;
  sessionId?: string;
};

export const cockpitStorageKey = 'dnd-runtime-cockpit';

export const defaultDm = {
  displayName: 'Dungeon Master',
  participantId: 'dm-001',
} as const;

export const samplePlayers = [
  {
    displayName: 'Player One',
    participantId: 'player-001',
  },
  {
    displayName: 'Player Two',
    participantId: 'player-002',
  },
] as const;

export const defaultPlayer = samplePlayers[0];

export const defaultTacticalBoardViewport: TacticalBoardViewport = {
  panX: 0,
  panY: 0,
  zoom: 1,
};

export const tacticalBoardZoomLevels = [0.75, 1, 1.25, 1.5, 2] as const;

const tacticalBoardBaseCellSizePixels = 52;
const tacticalBoardPanStepCells = 2;

export const sampleCharacters: Record<string, CharacterInput> = {
  'player-001': {
    abilities: {
      cha: 10,
      con: 13,
      dex: 14,
      int: 16,
      str: 8,
      wis: 12,
    },
    armorClass: 13,
    background: 'Sage',
    className: 'Wizard',
    hp: {
      current: 26,
      max: 26,
      temp: 0,
    },
    level: 5,
    name: 'Aria',
    speed: 30,
    speciesOrRace: 'Elf',
  },
  'player-002': {
    abilities: {
      cha: 8,
      con: 14,
      dex: 12,
      int: 10,
      str: 16,
      wis: 10,
    },
    armorClass: 0,
    background: 'Guard',
    className: 'Fighter',
    hp: {
      current: 1,
      max: 1,
      temp: 0,
    },
    level: 5,
    name: 'Borin',
    speed: 30,
    speciesOrRace: 'Dwarf',
  },
};

export const sceneEntityTypeOptions = sceneEntityTypeSchema.options;
export const sceneTransitionKindOptions = sceneTransitionKindSchema.options;

export function createDefaultCharacterDraftForm(
  displayName = 'New Adventurer',
): CharacterDraftForm {
  return {
    abilities: {
      cha: '10',
      con: '14',
      dex: '14',
      int: '10',
      str: '10',
      wis: '12',
    },
    armorClass: '13',
    background: 'Wanderer',
    className: 'Fighter',
    hp: {
      current: '12',
      max: '12',
      temp: '0',
    },
    level: '1',
    name: displayName ? `${displayName}'s Hero` : 'New Adventurer',
    notes: '',
    speciesOrRace: 'Human',
    speed: '30',
  };
}

export function getTacticalBoardCellSizePixels(zoom: number): number {
  return Math.round(tacticalBoardBaseCellSizePixels * zoom);
}

export function getTacticalBoardViewportAfterZoom(
  viewport: TacticalBoardViewport,
  direction: TacticalBoardZoomDirection,
): TacticalBoardViewport {
  const currentZoom = viewport.zoom;
  const nextZoom =
    direction === 'in'
      ? (tacticalBoardZoomLevels.find((zoom) => zoom > currentZoom) ??
        tacticalBoardZoomLevels.at(-1) ??
        currentZoom)
      : ([...tacticalBoardZoomLevels]
          .reverse()
          .find((zoom) => zoom < currentZoom) ??
        tacticalBoardZoomLevels[0] ??
        currentZoom);

  return {
    ...viewport,
    zoom: nextZoom,
  };
}

export function getTacticalBoardViewportAfterPan({
  direction,
  grid,
  viewport,
}: {
  direction: TacticalBoardPanDirection;
  grid: Pick<GridDefinition, 'height' | 'width'>;
  viewport: TacticalBoardViewport;
}): TacticalBoardViewport {
  const next = {
    ...viewport,
  };

  switch (direction) {
    case 'down':
      next.panY -= tacticalBoardPanStepCells;
      break;
    case 'left':
      next.panX += tacticalBoardPanStepCells;
      break;
    case 'right':
      next.panX -= tacticalBoardPanStepCells;
      break;
    case 'up':
      next.panY += tacticalBoardPanStepCells;
      break;
  }

  return clampTacticalBoardViewportPan(next, grid);
}

export function getTacticalBoardCellAffordance({
  actingParticipantId,
  cell,
  combatantId,
  currentTurnCombatantId,
  currentTurnParticipantId,
  moveDisabledReason,
  participantId,
  selectedCell,
  selectedCombatantId,
  selectedTargetCombatantId,
  selectedTargetParticipantId,
}: {
  actingParticipantId: string;
  cell: Cell;
  combatantId: string | null;
  currentTurnCombatantId: string | null;
  currentTurnParticipantId: string | null;
  moveDisabledReason: string | null;
  participantId: string | null;
  selectedCell: Cell;
  selectedCombatantId: string;
  selectedTargetCombatantId: string;
  selectedTargetParticipantId: string;
}): TacticalBoardCellAffordance {
  const isSelectedCell = selectedCell.x === cell.x && selectedCell.y === cell.y;
  const isSelectedToken = Boolean(
    (participantId && participantId === actingParticipantId) ||
    (combatantId && combatantId === selectedCombatantId),
  );
  const isCurrentTurnActor = Boolean(
    (participantId && participantId === currentTurnParticipantId) ||
    (combatantId && combatantId === currentTurnCombatantId),
  );
  const isAttackTarget = Boolean(
    (participantId && participantId === selectedTargetParticipantId) ||
    (combatantId && combatantId === selectedTargetCombatantId),
  );
  const isMovementTarget = isSelectedCell && !moveDisabledReason;
  const badges: TacticalBoardCellBadgeKind[] = [];

  if (isMovementTarget) {
    badges.push('move');
  }

  if (isSelectedToken) {
    badges.push('selected');
  }

  if (isCurrentTurnActor) {
    badges.push('turn');
  }

  if (isAttackTarget) {
    badges.push('target');
  }

  return {
    badges,
    isAttackTarget,
    isCurrentTurnActor,
    isMovementTarget,
    isSelectedCell,
    isSelectedToken,
  };
}

function clampTacticalBoardViewportPan(
  viewport: TacticalBoardViewport,
  grid: Pick<GridDefinition, 'height' | 'width'>,
): TacticalBoardViewport {
  const panLimitX = Math.max(0, grid.width - 1);
  const panLimitY = Math.max(0, grid.height - 1);

  return {
    ...viewport,
    panX: Math.min(panLimitX, Math.max(-panLimitX, viewport.panX)),
    panY: Math.min(panLimitY, Math.max(-panLimitY, viewport.panY)),
  };
}

export function createDefaultSceneDraftForm(): SceneDraftForm {
  return {
    cellSizeFeet: '5',
    height: '8',
    name: 'Torchlit Hall',
    width: '8',
  };
}

export function createSceneDraftFormFromScene(scene: Scene): SceneDraftForm {
  return {
    cellSizeFeet: String(scene.grid.cellSizeFeet),
    height: String(scene.grid.height),
    name: scene.name,
    width: String(scene.grid.width),
  };
}

export function validateSceneDraftForm(form: SceneDraftForm): string[] {
  const errors: string[] = [];

  if (!form.name.trim()) {
    errors.push('Scene name is required.');
  }

  validateIntegerRange(errors, 'Grid width', form.width, 1, 500);
  validateIntegerRange(errors, 'Grid height', form.height, 1, 500);
  validateIntegerRange(errors, 'Cell size', form.cellSizeFeet, 1, 20);

  return errors;
}

export function sceneInputFromDraft(form: SceneDraftForm): SceneInput {
  return {
    grid: {
      cellSizeFeet: parseIntegerOrZero(form.cellSizeFeet),
      height: parseIntegerOrZero(form.height),
      width: parseIntegerOrZero(form.width),
    },
    name: form.name.trim(),
  };
}

export function createDefaultSceneEntityDraftForm(): SceneEntityDraftForm {
  return {
    blocksMovement: true,
    blocksVision: true,
    footprintHeight: '1',
    footprintWidth: '1',
    hidden: false,
    name: 'Stone Pillar',
    type: 'object',
  };
}

export function createDefaultSceneTransitionDraftForm(): SceneTransitionDraftForm {
  return {
    blocksMovement: false,
    blocksVision: false,
    footprintHeight: '1',
    footprintWidth: '1',
    hidden: false,
    kind: 'door',
    name: 'Rune Door',
    notes: '',
    targetLabel: '',
    targetSceneId: '',
  };
}

export function createSceneEntityDraftFormFromEntity(
  entity: SceneEntity,
): SceneEntityDraftForm {
  return {
    blocksMovement: entity.blocksMovement,
    blocksVision: entity.blocksVision,
    footprintHeight: String(entity.footprint.height),
    footprintWidth: String(entity.footprint.width),
    hidden: entity.hidden,
    name: entity.name,
    type: entity.type,
  };
}

export function createSceneTransitionDraftFormFromEntity(
  entity: SceneEntity,
): SceneTransitionDraftForm {
  return {
    blocksMovement: entity.blocksMovement,
    blocksVision: entity.blocksVision,
    footprintHeight: String(entity.footprint.height),
    footprintWidth: String(entity.footprint.width),
    hidden: entity.hidden,
    kind: entity.transition?.kind ?? 'door',
    name: entity.name,
    notes: entity.transition?.notes ?? '',
    targetLabel: entity.transition?.targetLabel ?? '',
    targetSceneId: entity.transition?.targetSceneId ?? '',
  };
}

export function createDefaultCombatantDraftForm(): CombatantDraftForm {
  return {
    abilities: {
      cha: '8',
      con: '12',
      dex: '12',
      int: '8',
      str: '14',
      wis: '10',
    },
    armorClass: '12',
    footprintHeight: '1',
    footprintWidth: '1',
    hidden: false,
    hp: {
      current: '8',
      max: '8',
      temp: '0',
    },
    kind: 'monster',
    name: 'Ash Goblin',
    speed: '30',
  };
}

export function validateCombatantDraftForm({
  form,
  grid,
  position,
}: {
  form: CombatantDraftForm;
  grid?: GridDefinition;
  position: Cell;
}): string[] {
  const errors: string[] = [];

  if (!form.name.trim()) {
    errors.push('Combatant name is required.');
  }

  if (form.kind !== 'monster' && form.kind !== 'npc') {
    errors.push('Choose monster or npc.');
  }

  validateIntegerRange(errors, 'Armor Class', form.armorClass, 0, 99);
  validateIntegerRange(errors, 'Speed', form.speed, 0, 200);
  validateIntegerRange(errors, 'Max HP', form.hp.max, 1, 999);
  validateIntegerRange(errors, 'Current HP', form.hp.current, 0, 999);
  validateIntegerRange(errors, 'Temp HP', form.hp.temp, 0, 999);
  validateIntegerRange(errors, 'Footprint width', form.footprintWidth, 1, 20);
  validateIntegerRange(errors, 'Footprint height', form.footprintHeight, 1, 20);

  for (const abilityKey of abilityKeys) {
    validateIntegerRange(
      errors,
      abilityKey.toUpperCase(),
      form.abilities[abilityKey],
      1,
      30,
    );
  }

  const currentHp = parseInteger(form.hp.current);
  const maxHp = parseInteger(form.hp.max);

  if (
    typeof currentHp === 'number' &&
    typeof maxHp === 'number' &&
    currentHp > maxHp
  ) {
    errors.push('Current HP cannot exceed max HP.');
  }

  const footprintWidth = parseInteger(form.footprintWidth);
  const footprintHeight = parseInteger(form.footprintHeight);

  if (
    grid &&
    typeof footprintWidth === 'number' &&
    typeof footprintHeight === 'number' &&
    (position.x + footprintWidth > grid.width ||
      position.y + footprintHeight > grid.height)
  ) {
    errors.push('Combatant footprint must fit within the scene grid.');
  }

  return errors;
}

export function combatantInputFromDraft(
  form: CombatantDraftForm,
  position: Cell,
): DmCombatantInput {
  return {
    abilities: characterAbilitiesFromDraft({
      ...createDefaultCharacterDraftForm(),
      abilities: form.abilities,
    }),
    armorClass: parseIntegerOrZero(form.armorClass),
    footprint: {
      height: parseIntegerOrZero(form.footprintHeight),
      width: parseIntegerOrZero(form.footprintWidth),
    },
    hidden: form.hidden,
    hp: {
      current: parseIntegerOrZero(form.hp.current),
      max: parseIntegerOrZero(form.hp.max),
      temp: parseIntegerOrZero(form.hp.temp),
    },
    kind: form.kind,
    name: form.name.trim(),
    position,
    speed: parseIntegerOrZero(form.speed),
  };
}

export function validateSceneEntityDraftForm({
  form,
  grid,
  position,
}: {
  form: SceneEntityDraftForm;
  grid?: GridDefinition;
  position: Cell;
}): string[] {
  const errors: string[] = [];

  if (!form.name.trim()) {
    errors.push('Entity name is required.');
  }

  if (!sceneEntityTypeOptions.includes(form.type)) {
    errors.push('Choose a valid entity type.');
  }

  validateIntegerRange(errors, 'Footprint width', form.footprintWidth, 1, 20);
  validateIntegerRange(errors, 'Footprint height', form.footprintHeight, 1, 20);

  if (position.x < 0 || position.y < 0) {
    errors.push('Select a non-negative target cell.');
  }

  const footprintWidth = parseInteger(form.footprintWidth);
  const footprintHeight = parseInteger(form.footprintHeight);

  if (
    grid &&
    typeof footprintWidth === 'number' &&
    typeof footprintHeight === 'number' &&
    (position.x + footprintWidth > grid.width ||
      position.y + footprintHeight > grid.height)
  ) {
    errors.push('Entity footprint must fit within the scene grid.');
  }

  return errors;
}

export function validateSceneTransitionDraftForm({
  form,
  grid,
  position,
  requireTarget = true,
}: {
  form: SceneTransitionDraftForm;
  grid?: GridDefinition;
  position: Cell;
  requireTarget?: boolean;
}): string[] {
  const errors: string[] = [];

  if (!form.name.trim()) {
    errors.push('Transition name is required.');
  }

  if (!sceneTransitionKindOptions.includes(form.kind)) {
    errors.push('Choose a valid transition kind.');
  }

  if (requireTarget && !form.targetSceneId.trim()) {
    errors.push('Target scene ID is required.');
  }

  validateIntegerRange(errors, 'Footprint width', form.footprintWidth, 1, 20);
  validateIntegerRange(errors, 'Footprint height', form.footprintHeight, 1, 20);

  if (position.x < 0 || position.y < 0) {
    errors.push('Select a non-negative target cell.');
  }

  const footprintWidth = parseInteger(form.footprintWidth);
  const footprintHeight = parseInteger(form.footprintHeight);

  if (
    grid &&
    typeof footprintWidth === 'number' &&
    typeof footprintHeight === 'number' &&
    (position.x + footprintWidth > grid.width ||
      position.y + footprintHeight > grid.height)
  ) {
    errors.push('Transition footprint must fit within the scene grid.');
  }

  return errors;
}

export function sceneEntityInputFromDraft(
  form: SceneEntityDraftForm,
  position: Cell,
): SceneEntityInput {
  return {
    blocksMovement: form.blocksMovement,
    blocksVision: form.blocksVision,
    footprint: {
      height: parseIntegerOrZero(form.footprintHeight),
      width: parseIntegerOrZero(form.footprintWidth),
    },
    hidden: form.hidden,
    meta: {
      source: 'runtime-cockpit',
    },
    name: form.name.trim(),
    position,
    type: form.type,
  };
}

export function sceneEntityUpdateInputFromDraft(
  form: SceneEntityDraftForm,
): SceneEntityUpdateInput {
  return {
    blocksMovement: form.blocksMovement,
    blocksVision: form.blocksVision,
    footprint: {
      height: parseIntegerOrZero(form.footprintHeight),
      width: parseIntegerOrZero(form.footprintWidth),
    },
    hidden: form.hidden,
    meta: {
      source: 'runtime-cockpit',
    },
    name: form.name.trim(),
    type: form.type,
  };
}

export function sceneTransitionInputFromDraft(
  form: SceneTransitionDraftForm,
  position: Cell,
): SceneTransitionInput {
  const targetLabel = form.targetLabel.trim();
  const notes = form.notes.trim();

  return {
    blocksMovement: form.blocksMovement,
    blocksVision: form.blocksVision,
    footprint: {
      height: parseIntegerOrZero(form.footprintHeight),
      width: parseIntegerOrZero(form.footprintWidth),
    },
    hidden: form.hidden,
    kind: form.kind,
    name: form.name.trim(),
    notes: notes ? notes : null,
    position,
    targetLabel: targetLabel ? targetLabel : null,
    targetSceneId: form.targetSceneId.trim(),
  };
}

export function sceneTransitionUpdateInputFromDraft(
  form: SceneTransitionDraftForm,
): SceneTransitionUpdateInput {
  const targetLabel = form.targetLabel.trim();
  const notes = form.notes.trim();

  return {
    blocksMovement: form.blocksMovement,
    blocksVision: form.blocksVision,
    footprint: {
      height: parseIntegerOrZero(form.footprintHeight),
      width: parseIntegerOrZero(form.footprintWidth),
    },
    hidden: form.hidden,
    kind: form.kind,
    name: form.name.trim(),
    notes: notes ? notes : null,
    targetLabel: targetLabel ? targetLabel : null,
    targetSceneId: form.targetSceneId.trim(),
  };
}

export function getActiveSceneGuidance({
  activeSceneId,
  mode,
  scene,
}: {
  activeSceneId: string | null;
  mode: RuntimeMode;
  scene: Scene | null;
}): PlayerNextStep {
  if (scene) {
    return {
      detail: `${scene.name} is loaded with a ${scene.grid.width}x${scene.grid.height} grid and ${scene.entities.length} scene entities.`,
      title: 'Scene loaded',
      tone: 'success',
    };
  }

  if (activeSceneId) {
    return {
      detail:
        'The session has an active scene ID, but the full scene document has not been recovered yet.',
      title: 'Scene ID known',
      tone: 'warning',
    };
  }

  return mode === 'dm'
    ? {
        detail:
          'Create or activate a scene before placing tokens, entities, or starting an encounter.',
        title: 'Build a scene',
        tone: 'warning',
      }
    : {
        detail:
          'The DM has not activated a scene yet, or this browser needs to recover read models.',
        title: 'No active scene',
        tone: 'warning',
      };
}

export function getSceneEntityDisplayCells(
  scene: Scene | null,
): SceneEntityDisplayCell[] {
  if (!scene) {
    return [];
  }

  return scene.entities.flatMap((entity) => {
    const cells: SceneEntityDisplayCell[] = [];

    for (let y = 0; y < entity.footprint.height; y += 1) {
      for (let x = 0; x < entity.footprint.width; x += 1) {
        cells.push({
          entity,
          isOrigin: x === 0 && y === 0,
          label: getSceneEntityLabel(entity),
          x: entity.position.x + x,
          y: entity.position.y + y,
        });
      }
    }

    return cells;
  });
}

export function getCombatantEntities(
  scene: Scene | null,
): Array<SceneEntity & { combatant: NonNullable<SceneEntity['combatant']> }> {
  return (scene?.entities ?? []).filter(
    (
      entity,
    ): entity is SceneEntity & {
      combatant: NonNullable<SceneEntity['combatant']>;
    } => Boolean(entity.combatant),
  );
}

export function getPassiveSceneEntities(scene: Scene | null): SceneEntity[] {
  return (scene?.entities ?? []).filter(
    (entity) => !entity.combatant && !entity.transition,
  );
}

export function isPassiveSceneEntity(entity: SceneEntity): boolean {
  return !entity.combatant && !entity.transition;
}

export function getTransitionSceneEntities(scene: Scene | null): SceneEntity[] {
  return (scene?.entities ?? []).filter(
    (entity) => !entity.combatant && Boolean(entity.transition),
  );
}

export function getVisibleTransitionSceneEntities({
  mode,
  scene,
}: {
  mode: RuntimeMode;
  scene: Scene | null;
}): SceneEntity[] {
  const transitions = getTransitionSceneEntities(scene);

  return mode === 'player'
    ? transitions.filter((entity) => !entity.hidden)
    : transitions;
}

export function isTransitionSceneEntity(entity: SceneEntity): boolean {
  return !entity.combatant && Boolean(entity.transition);
}

export function getKnownSceneOptions(
  scenesById: Record<string, Scene>,
): Array<{ label: string; value: string }> {
  return Object.values(scenesById)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((scene) => ({
      label: `${scene.name} (${scene.id})`,
      value: scene.id,
    }));
}

export function isCombatantEntityDefeated(
  entity: SceneEntity & { combatant: NonNullable<SceneEntity['combatant']> },
): boolean {
  return entity.combatant.hp.current === 0;
}

export function getAttackableCombatantEntities(
  scene: Scene | null,
): Array<SceneEntity & { combatant: NonNullable<SceneEntity['combatant']> }> {
  return getCombatantEntities(scene).filter(
    (entity) => !isCombatantEntityDefeated(entity),
  );
}

export function getCombatantDisplayCells(
  scene: Scene | null,
): CombatantDisplayCell[] {
  return getSceneEntityDisplayCells({
    ...(scene ?? {
      createdAt: '',
      entities: [],
      grid: {
        cellSizeFeet: 5,
        height: 1,
        width: 1,
      },
      id: '',
      name: '',
      sessionId: '',
      updatedAt: '',
    }),
    entities: getCombatantEntities(scene),
  }).map((cell) => cell as CombatantDisplayCell);
}

export function getSceneEntityLabel(entity: SceneEntity): string {
  const flags = [
    entity.combatant ? `${entity.combatant.kind} combatant` : null,
    entity.transition
      ? `${entity.transition.kind} transition to ${entity.transition.targetLabel ?? entity.transition.targetSceneId}`
      : null,
    entity.blocksMovement ? 'blocks movement' : null,
    entity.blocksVision ? 'blocks vision' : null,
    entity.hidden ? 'hidden' : null,
  ].filter(Boolean);

  return `${entity.name} (${entity.type}${flags.length ? `, ${flags.join(', ')}` : ''})`;
}

export function getCurrentTurnLabel({
  encounter,
  participants,
  scene,
}: {
  encounter: Encounter | null;
  participants: SessionSnapshot['participants'];
  scene: Scene | null;
}): string {
  const current = encounter?.participants[encounter.currentTurnIndex];

  if (!current) {
    return 'No active turn';
  }

  if ('combatantId' in current) {
    const combatant = getCombatantEntities(scene).find(
      (entity) => entity.id === current.combatantId,
    );

    return `${combatant?.name ?? current.combatantId} (${current.combatantId})`;
  }

  return getParticipantName(participants, current.participantId);
}

export function getCurrentTurnParticipantId(
  encounter: Encounter | null,
): string | null {
  return (
    encounter?.participants[encounter.currentTurnIndex]?.participantId ?? null
  );
}

export function getCurrentTurnCombatantId(
  encounter: Encounter | null,
): string | null {
  const current = encounter?.participants[encounter.currentTurnIndex];

  return current && 'combatantId' in current ? current.combatantId : null;
}

export function getDmCombatantActionDisabledReason({
  busyLabel,
  currentTurnCombatantId,
  mode,
  scene,
  selectedCombatantId,
  sessionId,
  targetParticipantId,
}: {
  busyLabel: string | null;
  currentTurnCombatantId: string | null;
  mode: RuntimeMode;
  scene: Scene | null;
  selectedCombatantId: string;
  sessionId: string;
  targetParticipantId: string;
}): string | null {
  const busyReason = busyLabel ? `Waiting on ${busyLabel}.` : null;

  if (busyReason) {
    return busyReason;
  }

  if (!sessionId) {
    return 'Create, paste, or recover a session first.';
  }

  if (mode !== 'dm') {
    return 'Switch to DM mode for monster/NPC controls.';
  }

  if (!scene) {
    return 'Create, activate, or recover a scene first.';
  }

  if (!selectedCombatantId) {
    return 'Create or select a monster/NPC combatant first.';
  }

  if (!targetParticipantId) {
    return 'Choose a player character target.';
  }

  const selectedCombatant = getCombatantEntities(scene).find(
    (combatant) => combatant.id === selectedCombatantId,
  );

  if (selectedCombatant && isCombatantEntityDefeated(selectedCombatant)) {
    return 'The selected monster/NPC is defeated and cannot act.';
  }

  if (currentTurnCombatantId !== selectedCombatantId) {
    return 'The selected combatant must be the current turn actor.';
  }

  return null;
}

export function createCharacterDraftFormFromResource(
  resource: CharacterResource,
): CharacterDraftForm {
  return {
    abilities: Object.fromEntries(
      abilityKeys.map((abilityKey) => [
        abilityKey,
        String(resource.character.abilities[abilityKey]),
      ]),
    ) as Record<AbilityKey, string>,
    armorClass: String(resource.character.armorClass),
    background: resource.character.background,
    className: resource.character.className,
    hp: {
      current: String(resource.character.hp.current),
      max: String(resource.character.hp.max),
      temp: String(resource.character.hp.temp),
    },
    level: String(resource.character.level),
    name: resource.character.name,
    notes: resource.character.notes ?? '',
    speciesOrRace: resource.character.speciesOrRace,
    speed: String(resource.character.speed),
  };
}

export function validateCharacterDraftForm(form: CharacterDraftForm): string[] {
  const errors: string[] = [];
  const trimmedName = form.name.trim();

  if (!trimmedName) {
    errors.push('Name is required.');
  }

  validateIntegerRange(errors, 'Level', form.level, 1, 20);
  validateIntegerRange(errors, 'Armor Class', form.armorClass, 0, 99);
  validateIntegerRange(errors, 'Speed', form.speed, 0, 200);
  validateIntegerRange(errors, 'Max HP', form.hp.max, 1, 999);
  validateIntegerRange(errors, 'Current HP', form.hp.current, 0, 999);
  validateIntegerRange(errors, 'Temp HP', form.hp.temp, 0, 999);

  for (const abilityKey of abilityKeys) {
    validateIntegerRange(
      errors,
      abilityKey.toUpperCase(),
      form.abilities[abilityKey],
      1,
      30,
    );
  }

  const currentHp = parseInteger(form.hp.current);
  const maxHp = parseInteger(form.hp.max);

  if (
    typeof currentHp === 'number' &&
    typeof maxHp === 'number' &&
    currentHp > maxHp
  ) {
    errors.push('Current HP cannot exceed max HP.');
  }

  if (!form.className.trim()) {
    errors.push('Class is required.');
  }

  if (!form.speciesOrRace.trim()) {
    errors.push('Species/Race is required.');
  }

  if (!form.background.trim()) {
    errors.push('Background is required.');
  }

  if (form.notes.trim().length > 4000) {
    errors.push('Notes cannot exceed 4000 characters.');
  }

  return errors;
}

export function characterInputFromDraft(
  form: CharacterDraftForm,
): CharacterInput {
  return {
    abilities: characterAbilitiesFromDraft(form),
    armorClass: parseIntegerOrZero(form.armorClass),
    background: form.background.trim(),
    className: form.className.trim(),
    hp: {
      current: parseIntegerOrZero(form.hp.current),
      max: parseIntegerOrZero(form.hp.max),
      temp: parseIntegerOrZero(form.hp.temp),
    },
    level: parseIntegerOrZero(form.level),
    name: form.name.trim(),
    notes: normalizeOptionalNotes(form.notes),
    speed: parseIntegerOrZero(form.speed),
    speciesOrRace: form.speciesOrRace.trim(),
  };
}

export function characterUpdateInputFromDraft(
  form: CharacterDraftForm,
): CharacterUpdateInput {
  const input = characterInputFromDraft(form);

  return {
    abilities: input.abilities,
    armorClass: input.armorClass,
    background: input.background,
    className: input.className,
    hp: input.hp,
    name: input.name,
    notes: input.notes,
    speed: input.speed,
    speciesOrRace: input.speciesOrRace,
  };
}

export function formatRuntimeFailure(
  label: string,
  failure: RuntimeApiFailure,
): string {
  const status = failure.status ? `HTTP ${failure.status}: ` : '';
  const code = failure.code ? `${failure.code}: ` : '';

  return `${label} failed. ${status}${code}${failure.message}`;
}

export function getOutboxStatusView({
  data,
  error,
  loading,
}: {
  data: OutboxStatusSuccess['data'] | null;
  error: string | null;
  loading: boolean;
}): OutboxStatusView {
  if (loading) {
    return {
      count: data?.unpublishedCount ?? null,
      kind: 'loading',
      tone: 'info',
    };
  }

  if (error) {
    return {
      count: null,
      kind: 'error',
      tone: 'danger',
    };
  }

  if (!data) {
    return {
      count: null,
      kind: 'unknown',
      tone: 'info',
    };
  }

  if (!data.configured) {
    return {
      count: 0,
      kind: 'not_configured',
      tone: 'info',
    };
  }

  if (data.unpublishedCount === 0) {
    return {
      count: 0,
      kind: 'clear',
      tone: 'success',
    };
  }

  return {
    count: data.unpublishedCount,
    kind: 'backlog',
    tone: 'warning',
  };
}

export function getKnownCharacterIds(
  sessionState: SessionSnapshot | null,
  charactersByParticipant: Record<string, CharacterResource | undefined>,
  rememberedCharacterIds: Record<string, string> = {},
): Record<string, string> {
  const ids: Record<string, string> = { ...rememberedCharacterIds };

  for (const [participantId, resource] of Object.entries(
    charactersByParticipant,
  )) {
    if (resource) {
      ids[participantId] = resource.character.id;
    }
  }

  for (const participant of sessionState?.participants ?? []) {
    if (participant.pendingCharacterId) {
      ids[participant.id] = participant.pendingCharacterId;
    }

    if (participant.characterId) {
      ids[participant.id] = participant.characterId;
    }
  }

  return ids;
}

export type CharacterReadRef = {
  characterId: string;
  participantId: string;
};

export function getAssignedCharacterRefs(
  sessionState: SessionSnapshot,
): CharacterReadRef[] {
  return sessionState.participants.flatMap((participant) =>
    participant.characterId
      ? [
          {
            characterId: participant.characterId,
            participantId: participant.id,
          },
        ]
      : [],
  );
}

export function getPendingCharacterRefs(
  sessionState: SessionSnapshot,
): CharacterReadRef[] {
  return sessionState.participants.flatMap((participant) =>
    participant.pendingCharacterId
      ? [
          {
            characterId: participant.pendingCharacterId,
            participantId: participant.id,
          },
        ]
      : [],
  );
}

export type AssignmentRequest = {
  assignedCharacterId: string | null;
  character?: CharacterResource;
  displayName: string;
  participantId: string;
  pendingCharacterId: string;
};

export type AssignmentRequestCharacterPreview = {
  armorClass: string;
  build: string;
  hitPoints: string;
  name: string;
  sourceLibraryEntryId: string | null;
  speed: string;
  status: CharacterResource['character']['status'];
};

export type CharacterLibrarySourceProvenance = {
  runtimeCharacterId: string;
  sourceLibraryEntryId: string;
};

export type RuntimeLibraryEntrySummary = Pick<
  CharacterLibraryEntry,
  'className' | 'id' | 'level' | 'name' | 'status'
>;

export type LibraryEntrySubmissionBlocker =
  | 'already_assigned'
  | 'already_submitted'
  | 'busy'
  | 'missing_auth'
  | 'missing_selection'
  | 'missing_session'
  | 'no_finalized_entries'
  | 'not_joined';

export function getFinalizedLibraryEntriesForRuntime<
  TEntry extends RuntimeLibraryEntrySummary,
>(entries: TEntry[]): TEntry[] {
  return [...entries]
    .filter((entry) => entry.status === 'finalized')
    .sort((left, right) => {
      const nameOrder = left.name.localeCompare(right.name);

      return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
    });
}

export function getLibraryEntrySubmissionBlocker({
  busyLabel,
  finalizedEntryCount,
  hasAuthUser,
  isPlayerCharacterAssigned,
  isPlayerCharacterSubmitted,
  isPlayerJoined,
  selectedEntryId,
  sessionId,
}: {
  busyLabel: string | null;
  finalizedEntryCount: number;
  hasAuthUser: boolean;
  isPlayerCharacterAssigned: boolean;
  isPlayerCharacterSubmitted: boolean;
  isPlayerJoined: boolean;
  selectedEntryId: string;
  sessionId: string;
}): LibraryEntrySubmissionBlocker | null {
  if (busyLabel) {
    return 'busy';
  }

  if (!hasAuthUser) {
    return 'missing_auth';
  }

  if (!sessionId) {
    return 'missing_session';
  }

  if (!isPlayerJoined) {
    return 'not_joined';
  }

  if (isPlayerCharacterAssigned) {
    return 'already_assigned';
  }

  if (isPlayerCharacterSubmitted) {
    return 'already_submitted';
  }

  if (finalizedEntryCount === 0) {
    return 'no_finalized_entries';
  }

  if (!selectedEntryId) {
    return 'missing_selection';
  }

  return null;
}

export function getPendingAssignmentRequests({
  charactersByParticipant,
  sessionState,
}: {
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  sessionState: SessionSnapshot | null;
}): AssignmentRequest[] {
  return (sessionState?.participants ?? [])
    .filter(
      (participant) =>
        participant.role === 'player' &&
        Boolean(participant.pendingCharacterId),
    )
    .map((participant) => ({
      assignedCharacterId: participant.characterId,
      character: charactersByParticipant[participant.id],
      displayName: participant.displayName,
      participantId: participant.id,
      pendingCharacterId: participant.pendingCharacterId as string,
    }));
}

export function getAssignmentRequestCharacterPreview(
  character?: CharacterResource,
): AssignmentRequestCharacterPreview | null {
  if (!character) {
    return null;
  }

  const sourceLibraryEntryId =
    typeof character.character.meta.sourceCharacterLibraryEntryId ===
      'string' && character.character.meta.sourceCharacterLibraryEntryId
      ? character.character.meta.sourceCharacterLibraryEntryId
      : null;
  const tempHp =
    character.character.hp.temp > 0
      ? ` +${character.character.hp.temp} temp`
      : '';

  return {
    armorClass: String(character.character.armorClass),
    build: `${character.character.speciesOrRace} ${character.character.className} level ${character.character.level}`,
    hitPoints: `${character.character.hp.current}/${character.character.hp.max}${tempHp}`,
    name: character.character.name,
    sourceLibraryEntryId,
    speed: `${character.character.speed} ft`,
    status: character.character.status,
  };
}

export function getCharacterLibrarySourceProvenance(
  character?: CharacterResource,
): CharacterLibrarySourceProvenance | null {
  if (!character) {
    return null;
  }

  const sourceLibraryEntryId =
    typeof character.character.meta.sourceCharacterLibraryEntryId ===
      'string' && character.character.meta.sourceCharacterLibraryEntryId
      ? character.character.meta.sourceCharacterLibraryEntryId
      : null;

  if (!sourceLibraryEntryId) {
    return null;
  }

  return {
    runtimeCharacterId: character.character.id,
    sourceLibraryEntryId,
  };
}

export function getParticipantName(
  participants: SessionSnapshot['participants'],
  participantId: string,
): string {
  return (
    participants.find((participant) => participant.id === participantId)
      ?.displayName ?? participantId
  );
}

export function getPlayerParticipantIds(
  sessionState: SessionSnapshot | null,
): string[] {
  const participants =
    sessionState?.participants ??
    samplePlayers.map((player) => ({
      id: player.participantId,
      pendingCharacterId: null,
      role: 'player' as const,
    }));

  return participants
    .filter((participant) => participant.role === 'player')
    .map((participant) => participant.id);
}

export function getActingParticipantId({
  mode,
  playerParticipantId,
  selectedActor,
}: {
  mode: RuntimeMode;
  playerParticipantId: string;
  selectedActor: string;
}): string {
  return mode === 'player' ? playerParticipantId : selectedActor;
}

export type RuntimeDisabledReasons = {
  actorTurnAction: string | null;
  attack: string | null;
  dmCharacter: string | null;
  dmEncounter: string | null;
  joinPlayer: string | null;
  move: string | null;
  placeTokens: string | null;
  recover: string | null;
  startEncounter: string | null;
};

export type RuntimeNoticeTone = 'danger' | 'info' | 'success' | 'warning';

export type OutboxStatusViewKind =
  | 'backlog'
  | 'clear'
  | 'error'
  | 'loading'
  | 'not_configured'
  | 'unknown';

export type OutboxStatusView = {
  count: number | null;
  kind: OutboxStatusViewKind;
  tone: RuntimeNoticeTone;
};

export type RuntimeEventSummary = {
  detail: string;
  title: string;
  tone: RuntimeNoticeTone;
};

export type PlayerNextStep = {
  detail: string;
  title: string;
  tone: RuntimeNoticeTone;
};

export function getRuntimeDisabledReasons({
  actingParticipantId,
  activeSceneKnown,
  activeSceneLoaded,
  activeScenePlacementCount,
  busyLabel,
  encounterLoaded,
  mode,
  playerDisplayName,
  playerParticipantId,
  playerParticipantIds,
  selectedActorHasCharacter,
  sessionId,
  hasValidAttackTarget,
  targetParticipantId,
}: {
  actingParticipantId: string;
  activeSceneKnown: boolean;
  activeSceneLoaded: boolean;
  activeScenePlacementCount: number;
  busyLabel: string | null;
  encounterLoaded: boolean;
  mode: RuntimeMode;
  playerDisplayName: string;
  playerParticipantId: string;
  playerParticipantIds: string[];
  selectedActorHasCharacter: boolean;
  sessionId: string;
  hasValidAttackTarget?: boolean;
  targetParticipantId: string;
}): RuntimeDisabledReasons {
  const busyReason = busyLabel ? `Waiting on ${busyLabel}.` : null;
  const missingSessionReason = sessionId
    ? null
    : 'Create, paste, or recover a session first.';
  const missingActiveSceneReason = activeSceneLoaded
    ? null
    : 'Create/recover an active scene before moving or starting combat.';
  const missingEncounterReason = encounterLoaded
    ? null
    : 'Start or recover an encounter first.';
  const invalidActorReason = playerParticipantIds.includes(actingParticipantId)
    ? null
    : 'Choose a joined player participant as the acting character.';
  const invalidTargetReason =
    hasValidAttackTarget === true
      ? null
      : playerParticipantIds.includes(targetParticipantId)
        ? actingParticipantId === targetParticipantId
          ? 'Choose a different target participant.'
          : null
        : 'Choose a joined player participant or active monster/NPC target.';
  const dmOnlyReason =
    mode === 'dm' ? null : 'Switch to DM mode for this control.';
  const playerJoinReason =
    mode === 'player'
      ? null
      : 'Switch to Player mode to join as the configured player.';
  const missingPlayerIdentityReason =
    playerParticipantId && playerDisplayName
      ? null
      : 'Enter a player participant ID and display name.';

  return {
    actorTurnAction:
      busyReason ??
      missingSessionReason ??
      missingEncounterReason ??
      invalidActorReason,
    attack:
      busyReason ??
      missingSessionReason ??
      missingEncounterReason ??
      invalidActorReason ??
      invalidTargetReason,
    dmCharacter:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      invalidActorReason ??
      (selectedActorHasCharacter
        ? null
        : 'Load or assign this character first.'),
    dmEncounter:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      missingEncounterReason,
    joinPlayer:
      busyReason ??
      missingSessionReason ??
      playerJoinReason ??
      missingPlayerIdentityReason,
    move:
      busyReason ??
      missingSessionReason ??
      missingActiveSceneReason ??
      invalidActorReason,
    placeTokens:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      (activeSceneKnown ? null : 'Create or recover an active scene first.'),
    recover: busyReason ?? missingSessionReason,
    startEncounter:
      busyReason ??
      missingSessionReason ??
      dmOnlyReason ??
      missingActiveSceneReason ??
      (activeScenePlacementCount
        ? null
        : 'Place at least one character in the active scene first.'),
  };
}

export function getPlayerNextStep({
  hasActiveScene,
  hasCharacter,
  hasEncounter,
  isCharacterReady,
  isCharacterAssigned,
  isCharacterSubmitted,
  isCurrentTurn,
  isJoined,
  isPlaced,
  sessionId,
}: {
  hasActiveScene: boolean;
  hasCharacter: boolean;
  hasEncounter: boolean;
  isCharacterReady: boolean;
  isCharacterAssigned: boolean;
  isCharacterSubmitted: boolean;
  isCurrentTurn: boolean;
  isJoined: boolean;
  isPlaced: boolean;
  sessionId: string;
}): PlayerNextStep {
  if (!sessionId) {
    return {
      detail: 'Paste a session ID from the DM, then join or recover.',
      title: 'Choose a session',
      tone: 'info',
    };
  }

  if (!isJoined) {
    return {
      detail:
        'Join the session as this participant before reading table state.',
      title: 'Join the table',
      tone: 'warning',
    };
  }

  if (!hasCharacter) {
    return {
      detail:
        'Create a draft character here, finalize it, then ask the DM to assign it.',
      title: 'Create your character',
      tone: 'warning',
    };
  }

  if (!isCharacterAssigned) {
    if (!isCharacterReady) {
      return {
        detail:
          'Finish editing and finalize your character before sending it to the DM.',
        title: 'Finalize your character',
        tone: 'warning',
      };
    }

    if (!isCharacterSubmitted) {
      return {
        detail:
          'Submit your finalized character for DM assignment so the table can see it.',
        title: 'Submit for assignment',
        tone: 'warning',
      };
    }

    return {
      detail:
        'Your finalized character is submitted in session state. Waiting for the DM to assign it.',
      title: 'Waiting for DM assignment',
      tone: 'warning',
    };
  }

  if (!hasActiveScene) {
    return {
      detail: 'The DM has not activated a scene yet, or you need to recover.',
      title: 'No active scene',
      tone: 'warning',
    };
  }

  if (!isPlaced) {
    return {
      detail: 'Your character has no token placement in the active scene.',
      title: 'Token not placed',
      tone: 'warning',
    };
  }

  if (!hasEncounter) {
    return {
      detail:
        'You can move outside combat; turn resources unlock after encounter start.',
      title: 'Exploration mode',
      tone: 'info',
    };
  }

  if (!isCurrentTurn) {
    return {
      detail: 'Watch the current actor and prepare your target or movement.',
      title: 'Waiting for your turn',
      tone: 'info',
    };
  }

  return {
    detail:
      'Move, attack, or spend your action economy. The server validates legality.',
    title: 'Your turn',
    tone: 'success',
  };
}

export function isSessionStreamEvent(
  input: unknown,
): input is SessionStreamEvent {
  if (!input || typeof input !== 'object' || !('type' in input)) {
    return false;
  }

  return (
    input.type === 'session_state' ||
    input.type === 'movement_state' ||
    input.type === 'encounter_state' ||
    input.type === 'combat_event' ||
    input.type === 'character_state'
  );
}

export function describeSessionStreamEvent(
  event: SessionStreamEvent,
): RuntimeEventSummary {
  switch (event.type) {
    case 'combat_event': {
      const targetLabel =
        event.targetKind === 'combatant' && event.targetCombatantId
          ? event.targetCombatantId
          : event.targetParticipantId;

      return {
        detail: `${event.attackerCombatantId ?? event.attackerParticipantId} rolled ${event.roll.total} vs AC ${event.targetArmorClass}; ${event.hit ? `hit for ${event.damage}` : 'missed'} (${targetLabel} HP ${event.targetHp.previous} -> ${event.targetHp.current}).`,
        title: 'Attack resolved',
        tone: event.hit ? 'danger' : 'warning',
      };
    }
    case 'encounter_state':
      return {
        detail: `${event.reason.replaceAll('_', ' ')}. Round ${event.encounter.roundNumber}, turn ${event.encounter.currentTurnIndex + 1}.`,
        title: 'Encounter state',
        tone: 'info',
      };
    case 'movement_state':
      return {
        detail: `${event.participantId} ${event.reason.replaceAll('_', ' ')} to ${event.position.x},${event.position.y}.`,
        title: 'Token movement',
        tone: 'success',
      };
    case 'character_state':
      return {
        detail: `${event.characterId} HP is now ${event.hp.current}/${event.hp.max}${event.activeConditions?.length ? ` with ${event.activeConditions.join(', ')}` : ''}.`,
        title: 'Character state',
        tone: 'warning',
      };
    case 'session_state':
      return {
        detail: `${event.reason.replaceAll('_', ' ')}. Revision ${event.revision}.`,
        title: 'Session state',
        tone: 'info',
      };
  }
}

export function isExpectedRecoveryMiss(
  code: RuntimeErrorCode | undefined,
): boolean {
  return (
    code === 'no_active_scene' ||
    code === 'no_active_encounter' ||
    code === 'scene_not_found' ||
    code === 'invalid_scene_id' ||
    code === 'invalid_scene_session_association' ||
    code === 'character_not_found' ||
    code === 'invalid_character_id'
  );
}

export function sanitizeSessionIdInput(value: string): string {
  return value.trim().toUpperCase();
}

export function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

export function flag(value: boolean): string {
  return value ? 'yes' : 'no';
}

function characterAbilitiesFromDraft(
  form: CharacterDraftForm,
): CharacterInput['abilities'] {
  return Object.fromEntries(
    abilityKeys.map((abilityKey) => [
      abilityKey,
      parseIntegerOrZero(form.abilities[abilityKey]),
    ]),
  ) as CharacterInput['abilities'];
}

function normalizeOptionalNotes(value: string): string | null {
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function parseIntegerOrZero(value: string): number {
  return parseInteger(value) ?? 0;
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();

  if (!/^-?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validateIntegerRange(
  errors: string[],
  label: string,
  value: string,
  min: number,
  max: number,
): void {
  const parsed = parseInteger(value);

  if (typeof parsed !== 'number') {
    errors.push(`${label} must be a whole number.`);
    return;
  }

  if (parsed < min || parsed > max) {
    errors.push(`${label} must be between ${min} and ${max}.`);
  }
}
