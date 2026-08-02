/**
 * What each role's shell is allowed to render, derived once.
 *
 * The two shells ask different questions of the same state, and both used to
 * ask them inline in a 9,000-line component - which is how the player surface
 * ended up displaying participant IDs, scene entity IDs and protocol reason
 * strings. Those are not cosmetic defects. A raw ID on a player's screen is a
 * correlation handle for exactly the identifiers the server works to withhold.
 *
 * So the player view model is built to a rule: **it exposes no identifier the
 * player could not have invented themselves.** Names and counts, never IDs;
 * localized labels, never protocol enum values. Anything the player genuinely
 * has to address - their own seat, the token they are moving - is referenced by
 * a value the caller already holds, not re-published here.
 *
 * The GM view model has no such restriction, because the GM is the authority
 * and their tools are built out of IDs. That asymmetry is the whole point of
 * having two.
 */
import type { Encounter, Scene } from '@dnd/protocol';

import type { MessageKey } from './i18n';
import type { RuntimeSessionState } from './runtime-session-state';

/** A connection state a shell can render without knowing the protocol. */
export type ConnectionPresentation = {
  labelKey: MessageKey;
  tone: 'success' | 'warning' | 'danger' | 'info';
  /** True when the user has to act - retrying will not fix it. */
  needsUserAction: boolean;
};

export type PlayerTurnPresentation = {
  /** Whether it is this player's turn right now. */
  isOwnTurn: boolean;
  /** 1-based position in the order, for display. Null outside an encounter. */
  turnNumber: number | null;
  roundNumber: number | null;
  /** How many combatants are in the order, concealed ones included. */
  combatantCount: number;
};

export type PlayerCharacterPresentation = {
  name: string;
  currentHp: number;
  maxHp: number;
  temporaryHp: number;
  armorClass: number;
  /** Condition names, already lowercased and de-duplicated by the server. */
  conditions: string[];
};

export type PlayerShellView = {
  connection: ConnectionPresentation;
  /** The map to draw, already projected by the server. */
  scene: Scene | null;
  sceneName: string | null;
  /** Visible entities the player may interact with. Never includes hidden ones. */
  visibleTokenCount: number;
  character: PlayerCharacterPresentation | null;
  turn: PlayerTurnPresentation;
  /** A single presentation-safe complaint, or null. Never raw error JSON. */
  notice: string | null;
  busy: boolean;
};

export type GameMasterShellView = {
  connection: ConnectionPresentation;
  scene: Scene | null;
  sceneName: string | null;
  sceneId: string | null;
  /** Everything on the map, hidden included: this is the authority's view. */
  entityCount: number;
  hiddenEntityCount: number;
  encounter: Encounter | null;
  /** Seats at the table and how many are currently connected. */
  seatCount: number;
  connectedSeatCount: number;
  notice: string | null;
  busy: boolean;
  diagnosticsOpen: boolean;
};

const connectionPresentations: Record<
  RuntimeSessionState['connection'],
  ConnectionPresentation
> = {
  idle: {
    labelKey: 'runtime.connection.idle',
    tone: 'info',
    needsUserAction: false,
  },
  connecting: {
    labelKey: 'runtime.connection.connecting',
    tone: 'info',
    needsUserAction: false,
  },
  connected: {
    labelKey: 'runtime.connection.connected',
    tone: 'success',
    needsUserAction: false,
  },
  reconnecting: {
    labelKey: 'runtime.connection.reconnecting',
    tone: 'warning',
    needsUserAction: false,
  },
  credential_invalid: {
    labelKey: 'runtime.connection.credentialInvalid',
    tone: 'danger',
    needsUserAction: true,
  },
  seat_unavailable: {
    labelKey: 'runtime.connection.seatUnavailable',
    tone: 'danger',
    needsUserAction: true,
  },
};

export function selectConnectionPresentation(
  state: RuntimeSessionState,
): ConnectionPresentation {
  return connectionPresentations[state.connection];
}

/**
 * The one thing worth telling the player about right now.
 *
 * Command errors win over recovery notes because a command error is something
 * the player just did, and stacking both produces a wall neither gets read.
 * Every string reaching here is already localized and presentation-safe.
 */
function selectNotice(state: RuntimeSessionState): string | null {
  return state.commandError ?? state.recoveryNotes[0] ?? null;
}

export function selectPlayerShellView(
  state: RuntimeSessionState,
): PlayerShellView {
  const scene = state.scene;
  const character = state.charactersByParticipant[state.identity.participantId];

  return {
    connection: selectConnectionPresentation(state),
    scene,
    sceneName: scene?.name ?? null,
    // The scene is already projected, so every entity in it is one the player
    // is allowed to see. Counting here does not need - and must not apply - a
    // second visibility rule.
    visibleTokenCount: scene?.entities.length ?? 0,
    character: character
      ? {
          name: character.character.name,
          currentHp: character.character.hp.current,
          maxHp: character.character.hp.max,
          temporaryHp: character.character.hp.temp,
          armorClass: character.character.armorClass,
          conditions: character.overlay.activeConditions ?? [],
        }
      : null,
    turn: selectPlayerTurn(state),
    notice: selectNotice(state),
    busy: state.pendingCommand !== null,
  };
}

/**
 * Where the player sits in the order.
 *
 * `currentTurnIndex` is positional and stays valid for every viewer because
 * concealed combatants keep their slot, so this can be read straight off the
 * projected encounter. What it must not do is name the actor: a concealed
 * combatant's turn is reported as a turn, not as that creature's turn.
 */
function selectPlayerTurn(state: RuntimeSessionState): PlayerTurnPresentation {
  const encounter = state.encounter;

  if (!encounter || encounter.status !== 'active') {
    return {
      isOwnTurn: false,
      turnNumber: null,
      roundNumber: null,
      combatantCount: 0,
    };
  }

  const current = encounter.participants[encounter.currentTurnIndex];

  return {
    isOwnTurn: current?.participantId === state.identity.participantId,
    turnNumber: encounter.currentTurnIndex + 1,
    roundNumber: encounter.roundNumber,
    combatantCount: encounter.participants.length,
  };
}

export function selectGameMasterShellView(
  state: RuntimeSessionState,
): GameMasterShellView {
  const scene = state.scene;
  const participants = state.session?.participants ?? [];

  return {
    connection: selectConnectionPresentation(state),
    scene,
    sceneName: scene?.name ?? null,
    sceneId: scene?.id ?? null,
    entityCount: scene?.entities.length ?? 0,
    hiddenEntityCount:
      scene?.entities.filter((entity) => entity.hidden).length ?? 0,
    encounter: state.encounter,
    seatCount: participants.length,
    connectedSeatCount: participants.filter(
      (participant) => participant.connectionStatus === 'connected',
    ).length,
    notice: selectNotice(state),
    busy: state.pendingCommand !== null,
    diagnosticsOpen: state.diagnosticsOpen,
  };
}

/**
 * Whether a string would expose an internal identifier if rendered to a player.
 *
 * Used by the player-surface tests rather than at runtime: the real defence is
 * that the view model never carries an ID in the first place, and a filter
 * applied at render time would be the same "fix it in the browser" mistake the
 * server-side projection exists to avoid. This is how the tests state the rule.
 */
export function containsInternalIdentifier(value: string): boolean {
  return (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(
      value,
    ) ||
    /\bscene_entity_/.test(value) ||
    /\bscene_[0-9a-f]/.test(value) ||
    /\bencounter_[0-9a-f]/.test(value) ||
    /\bcharacter_[0-9a-f]/.test(value)
  );
}
