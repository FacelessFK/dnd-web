/**
 * Who an event was about, in words the reader is entitled to.
 *
 * The event feed is the one runtime surface that names an actor without the map
 * or the roster beside it, and it used to name them by interpolating whatever
 * identifier the frame happened to carry. That put `player-001` on a player's
 * screen - the same class of defect as an encounter ID reaching the board, and
 * caught the same way, by acceptance rather than review.
 *
 * The identifiers themselves are not the bug. A `movement_state` frame has to
 * carry `participantId`, because that is how the browser keys the placement it
 * paints; the defect was rendering it. So nothing here removes a field from a
 * payload and nothing here filters a projection. This module answers one
 * question - what may this reader be told about this actor - and it answers it
 * from role-projected data only.
 *
 * Three rules make it safe to reason about:
 *
 *  1. **No identifier is ever a fallback.** Every branch that fails to find a
 *     name returns a localizable generic label. There is no path from an ID to
 *     rendered text.
 *  2. **Only current projections are consulted.** The roster and the scene are
 *     whatever the server last sent this role. Nothing accumulates across
 *     frames, so a creature that has since been concealed is absent from the
 *     directory rather than remembered in it, and the generic label is what a
 *     stale lookup produces.
 *  3. **Names, not sentinels, are the exception.** The sentinels below are
 *     stable tokens, not English - this module has no translator, exactly as
 *     `runtime-cockpit-helpers` has none - and `runtime-localization` is what
 *     turns them into copy.
 */
import type { CharacterResource } from '@dnd/protocol';

import type { RuntimeScene } from './runtime-scene-view';

/** The reader's own seat. Rendered second person where the sentence allows it. */
export const EVENT_ACTOR_YOU = '__event_actor_you__';

/**
 * A seated character the reader cannot currently name.
 *
 * Not "unknown": the frame says a participant moved, so the reader knows a
 * player is there. Only the identity is withheld.
 */
export const EVENT_ACTOR_OTHER_ADVENTURER = '__event_actor_other_adventurer__';

/** Neither a seat nor a visible creature resolved. The weakest claim available. */
export const EVENT_ACTOR_UNKNOWN = '__event_actor_unknown__';

/**
 * A creature the reader may not identify.
 *
 * Its own sentinel rather than the turn banner's `CONCEALED_COMBATANT_LABEL`,
 * which lives in `runtime-cockpit-helpers` - importing it here would close a
 * cycle, since that module is what consumes this one. The two resolve to
 * different sentences anyway: the banner names a slot in the initiative order,
 * this narrates something that just happened out of sight.
 */
export const EVENT_ACTOR_UNSEEN_CREATURE = '__event_actor_unseen_creature__';

/** Whether a label is one of the generic stand-ins rather than a real name. */
export function isGenericEventActorLabel(label: string): boolean {
  return (
    label === EVENT_ACTOR_YOU ||
    label === EVENT_ACTOR_OTHER_ADVENTURER ||
    label === EVENT_ACTOR_UNKNOWN ||
    label === EVENT_ACTOR_UNSEEN_CREATURE
  );
}

/**
 * Every name this role is currently allowed to put on an actor.
 *
 * Deliberately three flat maps rather than a lookup closure: the whole point is
 * that the contents are inspectable, so "a player's directory does not contain
 * the hidden goblin" is a test that reads one object instead of exercising a
 * function.
 */
export type RuntimeEventLabels = {
  /** Scene-entity ID to name, for entities in the *current* projection only. */
  combatantNames: Readonly<Record<string, string>>;
  /** Runtime character ID to name, for characters held for a seated player. */
  characterNames: Readonly<Record<string, string>>;
  ownCharacterId: string | null;
  ownParticipantId: string | null;
  /** Participant ID to name, for seats in the *current* roster only. */
  participantNames: Readonly<Record<string, string>>;
};

/**
 * The directory before any projection has arrived.
 *
 * Every lookup against it misses, which is the correct behaviour: a client that
 * has been told nothing may name nobody.
 */
export const EMPTY_RUNTIME_EVENT_LABELS: RuntimeEventLabels = {
  characterNames: {},
  combatantNames: {},
  ownCharacterId: null,
  ownParticipantId: null,
  participantNames: {},
};

type RosterSeat = {
  displayName: string;
  id: string;
};

export function buildRuntimeEventLabels(params: {
  charactersByParticipant: Record<string, CharacterResource | undefined>;
  ownParticipantId: string | null;
  participants: readonly RosterSeat[];
  scene: RuntimeScene | null;
}): RuntimeEventLabels {
  const { charactersByParticipant, ownParticipantId, participants, scene } =
    params;

  const participantNames: Record<string, string> = {};
  const characterNames: Record<string, string> = {};
  let ownCharacterId: string | null = null;

  for (const seat of participants) {
    // The held character's name is the in-game one and matches the token on the
    // board; the seat's display name is the account behind it. Preferring the
    // first keeps the feed and the map calling the same figure the same thing.
    const resource = charactersByParticipant[seat.id];
    const name = resource?.character.name?.trim() || seat.displayName.trim();

    if (name) {
      participantNames[seat.id] = name;
    }

    // Characters are indexed only for seats the current roster still holds.
    // `charactersByParticipant` is a cache that outlives the frames that filled
    // it, and reading it directly would let a name survive the projection that
    // justified it.
    if (resource) {
      const characterName = resource.character.name?.trim();

      if (characterName) {
        characterNames[resource.character.id] = characterName;
      }

      if (ownParticipantId && seat.id === ownParticipantId) {
        ownCharacterId = resource.character.id;
      }
    }
  }

  const combatantNames: Record<string, string> = {};

  // Straight off the scene this role was sent. A player's projection omits a
  // concealed creature entirely, so it is absent here for the same reason it is
  // absent from the board - not filtered, never delivered.
  for (const entity of scene?.entities ?? []) {
    const name = entity.name?.trim();

    if (entity.combatant && name) {
      combatantNames[entity.id] = name;
    }
  }

  return {
    characterNames,
    combatantNames,
    ownCharacterId,
    ownParticipantId,
    participantNames,
  };
}

export function isOwnEventParticipant(
  labels: RuntimeEventLabels,
  participantId: string | undefined,
): boolean {
  return Boolean(
    participantId &&
    labels.ownParticipantId &&
    participantId === labels.ownParticipantId,
  );
}

export function isOwnEventCharacter(
  labels: RuntimeEventLabels,
  characterId: string | undefined,
): boolean {
  return Boolean(
    characterId &&
    labels.ownCharacterId &&
    characterId === labels.ownCharacterId,
  );
}

/**
 * Which grammatical person the surrounding sentence is written in.
 *
 * `second_person` sentences exist per reason, so "You were repositioned by the
 * DM" is one catalogue entry rather than a subject glued to a third-person
 * fragment. Sentences that narrate two actors at once - the combat line names
 * an attacker and a target in the same clause - stay `third_person` and call
 * the reader by name, because a second-person subject there would need a
 * separate sentence for each of the four attacker/target combinations in each
 * locale, and Persian verb agreement would not survive the shortcut.
 */
export type RuntimeEventVoice = 'second_person' | 'third_person';

export function resolveEventParticipantLabel(
  labels: RuntimeEventLabels,
  participantId: string | undefined,
  voice: RuntimeEventVoice,
): string {
  if (
    voice === 'second_person' &&
    isOwnEventParticipant(labels, participantId)
  ) {
    return EVENT_ACTOR_YOU;
  }

  if (!participantId) {
    return EVENT_ACTOR_OTHER_ADVENTURER;
  }

  return labels.participantNames[participantId] ?? EVENT_ACTOR_OTHER_ADVENTURER;
}

export function resolveEventCharacterLabel(
  labels: RuntimeEventLabels,
  characterId: string | undefined,
): string {
  if (!characterId) {
    return EVENT_ACTOR_OTHER_ADVENTURER;
  }

  return labels.characterNames[characterId] ?? EVENT_ACTOR_OTHER_ADVENTURER;
}

/**
 * A creature on the map, by name or not at all.
 *
 * A miss is `unseen creature` rather than `unknown`: the only way an ID reaches
 * here without a matching entity is that the viewer's projection does not
 * contain it, and "you cannot see it" is exactly what that means.
 */
export function resolveEventCombatantLabel(
  labels: RuntimeEventLabels,
  combatantId: string | undefined,
): string {
  if (!combatantId) {
    return EVENT_ACTOR_UNSEEN_CREATURE;
  }

  return labels.combatantNames[combatantId] ?? EVENT_ACTOR_UNSEEN_CREATURE;
}

/**
 * One side of a combat event, whichever kind of thing it turned out to be.
 *
 * `concealed` is the server saying it withheld the identifier, and it wins over
 * every lookup below - including a name that happens to still be in the
 * directory. A frame that says "you may not know who this was" is not
 * negotiable from the browser.
 */
export function resolveEventCombatSideLabel(
  labels: RuntimeEventLabels,
  side: {
    characterId: string | undefined;
    combatantId: string | undefined;
    concealed: boolean | undefined;
    kind: 'character' | 'combatant' | undefined;
    participantId: string | undefined;
  },
): string {
  if (side.concealed) {
    return EVENT_ACTOR_UNSEEN_CREATURE;
  }

  if (side.combatantId || side.kind === 'combatant') {
    return resolveEventCombatantLabel(labels, side.combatantId);
  }

  if (side.characterId && labels.characterNames[side.characterId]) {
    return labels.characterNames[side.characterId]!;
  }

  if (side.participantId) {
    return resolveEventParticipantLabel(
      labels,
      side.participantId,
      'third_person',
    );
  }

  return EVENT_ACTOR_UNKNOWN;
}
