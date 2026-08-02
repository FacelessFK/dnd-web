/**
 * Turning the pure helpers' machine vocabulary into words a person reads.
 *
 * `runtime-cockpit-helpers` has no translator by design - it decides *what* is
 * true about the table and says so in stable, untranslated tokens, so its tests
 * assert on state rather than on a phrase book. This module is the other half:
 * it maps those tokens onto localized copy and nothing else.
 *
 * Keeping the split means a locale change can never alter a decision, and a
 * rule change can never silently depend on English.
 */
import type { MessageKey, useI18n } from './i18n';
import {
  CONCEALED_COMBATANT_LABEL,
  type getPlayerNextStep,
  type getRuntimeDisabledReasons,
  type OutboxStatusView,
  type RuntimeEventDescriptor,
  type RuntimeEventSummary,
} from './runtime-cockpit-helpers';
import { localizeConditionList } from './runtime-condition-labels';
import {
  EVENT_ACTOR_OTHER_ADVENTURER,
  EVENT_ACTOR_UNKNOWN,
  EVENT_ACTOR_UNSEEN_CREATURE,
  EVENT_ACTOR_YOU,
} from './runtime-event-labels';

/** The `t` function every localizer takes, named once. */
export type RuntimeTranslator = ReturnType<typeof useI18n>['t'];

/**
 * Swaps the pure helpers' actor sentinels for localized copy.
 *
 * The helper modules have no translator by design, so they mark an actor the
 * reader may not be told about and the label is resolved here, at render time.
 *
 * Anything that is not a sentinel is a display name and passes through
 * untouched: names are authored by a player or a GM and are never translated.
 */
export function localizeActorLabel(
  label: string | null,
  t: RuntimeTranslator,
): string | null {
  switch (label) {
    case CONCEALED_COMBATANT_LABEL:
      return t('runtime.turn.concealedCombatant');
    case EVENT_ACTOR_YOU:
      return t('runtime.events.actor.you');
    case EVENT_ACTOR_OTHER_ADVENTURER:
      return t('runtime.events.actor.otherAdventurer');
    case EVENT_ACTOR_UNSEEN_CREATURE:
      return t('runtime.events.actor.unseenCreature');
    case EVENT_ACTOR_UNKNOWN:
      return t('runtime.events.actor.unknown');
    default:
      return label;
  }
}

/**
 * Turns a stream event descriptor into the finished, localized summary the feed
 * renders.
 *
 * Nested keys - `resultKey` and `reasonKey` - are translated first and passed in
 * as values, so a detail string stays one catalogue entry per locale instead of
 * being assembled from fragments in an order Persian would not use.
 */
export function localizeRuntimeEventDescriptor(
  descriptor: RuntimeEventDescriptor,
  t: RuntimeTranslator,
): RuntimeEventSummary {
  const { resultKey, reasonKey, ...values } = descriptor.detailValues;
  const resolved: Record<string, string> = { ...values };

  // Every slot that can hold an actor, resolved through one function. Listing
  // them is what stops a new event type quietly rendering a sentinel: a slot
  // that is missing from here shows `__event_actor_you__` on screen, which the
  // tests catch, rather than an identifier, which they would not.
  for (const slot of ['attacker', 'character', 'participant', 'target']) {
    if (values[slot] !== undefined) {
      resolved[slot] = localizeActorLabel(values[slot] ?? null, t) ?? '';
    }
  }

  if (resultKey) {
    resolved.result = t(resultKey as MessageKey, values);
  }

  if (reasonKey) {
    resolved.reason = t(reasonKey as MessageKey);
  }

  // Conditions arrive as canonical values and are turned into words here, for
  // the same reason actor labels are: the describing module has no translator,
  // and `.join(', ')` on protocol vocabulary is how `poisoned` reached a
  // Persian screen.
  if (descriptor.conditions) {
    resolved.conditions = localizeConditionList(descriptor.conditions, t);
  }

  return {
    detail: t(descriptor.detailKey, resolved),
    title: t(descriptor.titleKey),
    tone: descriptor.tone,
  };
}

export function localizeRuntimeDisabledReason(
  reason: string | null,
  t: RuntimeTranslator,
): string | null {
  if (!reason) {
    return null;
  }

  if (reason.startsWith('Waiting on ') && reason.endsWith('.')) {
    return t('runtime.disabled.busy', {
      label: reason.slice('Waiting on '.length, -1),
    });
  }

  const labels: Record<string, string> = {
    'Choose a different target participant.': t(
      'runtime.disabled.invalidTargetDifferent',
    ),
    'Choose a joined player participant as the acting character.': t(
      'runtime.disabled.invalidActor',
    ),
    'Choose a joined player participant or active monster/NPC target.': t(
      'runtime.disabled.invalidTarget',
    ),
    'Create or recover an active scene first.': t(
      'runtime.disabled.createOrRecoverActiveScene',
    ),
    'Create, activate, or recover a scene first.': t(
      'runtime.disabled.createActivateRecoverScene',
    ),
    'Create or select a monster/NPC combatant first.': t(
      'runtime.disabled.selectCombatant',
    ),
    'Create, paste, or recover a session first.': t(
      'runtime.disabled.missingSession',
    ),
    'Choose a player character target.': t('runtime.disabled.playerTarget'),
    'Create/recover an active scene before moving or starting combat.': t(
      'runtime.disabled.missingActiveScene',
    ),
    'Enter a player participant ID and display name.': t(
      'runtime.disabled.missingPlayerIdentity',
    ),
    'Load or assign this character first.': t(
      'runtime.disabled.loadOrAssignCharacter',
    ),
    'Place at least one character in the active scene first.': t(
      'runtime.disabled.placeCharacter',
    ),
    'Start or recover an encounter first.': t(
      'runtime.disabled.missingEncounter',
    ),
    'Switch to DM mode for this control.': t('runtime.disabled.dmOnlyControl'),
    'Switch to DM mode for monster/NPC controls.': t(
      'runtime.disabled.dmOnlyCombatant',
    ),
    'Switch to Player mode to join as the configured player.': t(
      'runtime.disabled.playerJoinMode',
    ),
    'The selected combatant must be the current turn actor.': t(
      'runtime.disabled.combatantTurn',
    ),
    'The selected monster/NPC is defeated and cannot act.': t(
      'runtime.disabled.combatantDefeated',
    ),
  };

  return labels[reason] ?? reason;
}

export function localizeRuntimeDisabledReasons(
  reasons: ReturnType<typeof getRuntimeDisabledReasons>,
  t: RuntimeTranslator,
): ReturnType<typeof getRuntimeDisabledReasons> {
  return Object.fromEntries(
    Object.entries(reasons).map(([key, reason]) => [
      key,
      localizeRuntimeDisabledReason(reason, t),
    ]),
  ) as ReturnType<typeof getRuntimeDisabledReasons>;
}

export function localizeCombatantDraftError(
  error: string,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'Armor Class': 'AC',
    'Current HP': t('runtime.combatants.hpCurrent'),
    'Footprint height': t('runtime.combatants.sizeHeight'),
    'Footprint width': t('runtime.combatants.sizeWidth'),
    'Max HP': t('runtime.combatants.hpMax'),
    Speed: t('runtime.combatants.speed'),
    'Temp HP': t('runtime.combatants.hpTemp'),
  };
  const wholeNumberMatch = error.match(/^(.+) must be a whole number\.$/);
  const rangeMatch = error.match(/^(.+) must be between (\d+) and (\d+)\.$/);

  if (wholeNumberMatch) {
    return t('runtime.combatants.validation.wholeNumber', {
      field: labels[wholeNumberMatch[1]!] ?? wholeNumberMatch[1]!,
    });
  }

  if (rangeMatch) {
    return t('runtime.combatants.validation.range', {
      field: labels[rangeMatch[1]!] ?? rangeMatch[1]!,
      max: rangeMatch[3]!,
      min: rangeMatch[2]!,
    });
  }

  const messages: Record<string, string> = {
    'Choose monster or npc.': t('runtime.combatants.validation.kind'),
    'Combatant footprint must fit within the scene grid.': t(
      'runtime.combatants.validation.footprint',
    ),
    'Combatant name is required.': t('runtime.combatants.validation.name'),
    'Current HP cannot exceed max HP.': t(
      'runtime.combatants.validation.currentHp',
    ),
  };

  return messages[error] ?? error;
}

export function localizeTransitionDraftError(
  error: string,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'Footprint height': t('runtime.sceneBuilder.field.footprintHeight'),
    'Footprint width': t('runtime.sceneBuilder.field.footprintWidth'),
  };
  const wholeNumberMatch = error.match(/^(.+) must be a whole number\.$/);
  const rangeMatch = error.match(/^(.+) must be between (\d+) and (\d+)\.$/);

  if (wholeNumberMatch) {
    return t('runtime.sceneBuilder.transitions.validation.wholeNumber', {
      field: labels[wholeNumberMatch[1]!] ?? wholeNumberMatch[1]!,
    });
  }

  if (rangeMatch) {
    return t('runtime.sceneBuilder.transitions.validation.range', {
      field: labels[rangeMatch[1]!] ?? rangeMatch[1]!,
      max: rangeMatch[3]!,
      min: rangeMatch[2]!,
    });
  }

  const messages: Record<string, string> = {
    'Choose a valid transition kind.': t(
      'runtime.sceneBuilder.transitions.validation.kind',
    ),
    'Select a non-negative target cell.': t(
      'runtime.sceneBuilder.transitions.validation.targetCell',
    ),
    'Target scene ID is required.': t(
      'runtime.sceneBuilder.transitions.validation.targetSceneId',
    ),
    'Transition footprint must fit within the scene grid.': t(
      'runtime.sceneBuilder.transitions.validation.footprint',
    ),
    'Transition name is required.': t(
      'runtime.sceneBuilder.transitions.validation.name',
    ),
  };

  return messages[error] ?? error;
}

export function localizeRuntimeCharacterStatus(
  status: string,
  t: RuntimeTranslator,
): string {
  switch (status) {
    case 'active':
      return t('runtime.combatants.status.active');
    case 'defeated':
      return t('runtime.combatants.status.defeated');
    case 'draft':
      return t('runtime.characterSummary.status.draft');
    case 'ready':
      return t('common.ready');
    default:
      return status;
  }
}

export function getLocalizedPlayerNextStepTitle(
  nextStep: ReturnType<typeof getPlayerNextStep>,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'Choose a session': t('runtime.playerNextStep.chooseSession.title'),
    'Create your character': t('runtime.playerNextStep.createCharacter.title'),
    'Exploration mode': t('runtime.playerNextStep.exploration.title'),
    'Finalize your character': t('runtime.playerNextStep.finalize.title'),
    'Join the table': t('runtime.playerNextStep.join.title'),
    'No active scene': t('runtime.playerNextStep.noScene.title'),
    'Submit for assignment': t('runtime.playerNextStep.submit.title'),
    'Token not placed': t('runtime.playerNextStep.placement.title'),
    'Waiting for DM assignment': t('runtime.playerNextStep.waitingDm.title'),
    'Waiting for your turn': t('runtime.playerNextStep.waitingTurn.title'),
    'Your turn': t('runtime.playerNextStep.yourTurn.title'),
  };

  return labels[nextStep.title] ?? nextStep.title;
}

export function getLocalizedPlayerNextStepDetail(
  nextStep: ReturnType<typeof getPlayerNextStep>,
  t: RuntimeTranslator,
): string {
  const labels: Record<string, string> = {
    'A submitted runtime copy is waiting in session state for the DM to assign it.':
      t('runtime.playerNextStep.waitingDm.detail'),
    'Create a draft here or submit a saved Character Library entry, then wait for DM assignment.':
      t('runtime.playerNextStep.createCharacter.detail'),
    'Finish editing and finalize your character before sending it to the DM.':
      t('runtime.playerNextStep.finalize.detail'),
    'Join the session as this participant before reading table state.': t(
      'runtime.playerNextStep.join.detail',
    ),
    'Move, attack, or spend your action economy. The server validates legality.':
      t('runtime.playerNextStep.yourTurn.detail'),
    'Paste a session ID from the DM, then join or recover.': t(
      'runtime.playerNextStep.chooseSession.detail',
    ),
    'Submit your finalized character for DM assignment so the table can see it.':
      t('runtime.playerNextStep.submit.detail'),
    'The DM has not activated a scene yet, or you need to recover.': t(
      'runtime.playerNextStep.noScene.detail',
    ),
    'Watch the current actor and prepare your target or movement.': t(
      'runtime.playerNextStep.waitingTurn.detail',
    ),
    'You can move outside combat; turn resources unlock after encounter start.':
      t('runtime.playerNextStep.exploration.detail'),
    'Your character has no token placement in the active scene.': t(
      'runtime.playerNextStep.placement.detail',
    ),
  };

  return labels[nextStep.detail] ?? nextStep.detail;
}

export function formatOutboxStatusLabel(
  view: OutboxStatusView,
  t: RuntimeTranslator,
): string {
  switch (view.kind) {
    case 'backlog':
      return t('runtime.outbox.status.backlog', {
        count: String(view.count ?? 0),
      });
    case 'clear':
      return t('runtime.outbox.status.clear');
    case 'error':
      return t('runtime.outbox.status.error');
    case 'loading':
      return t('runtime.outbox.status.loading');
    case 'not_configured':
      return t('runtime.outbox.status.off');
    case 'unknown':
      return t('runtime.outbox.status.unknown');
  }
}

/**
 * A recovery miss, in the reader's language.
 *
 * Recovery notes are shown to whoever recovered - players included - so they
 * carry a stable error code rather than a formatted protocol failure. Anything
 * unrecognised falls back to a generic sentence instead of leaking the token:
 * a code that reaches here unmapped is still a wire detail.
 */
export function localizeRecoveryNote(
  code: string,
  t: RuntimeTranslator,
): string {
  switch (code) {
    case 'character_not_found':
    case 'invalid_character_id':
      return t('runtime.recoveryNote.character');
    case 'invalid_scene_id':
    case 'invalid_scene_session_association':
    case 'scene_not_found':
      return t('runtime.recoveryNote.scene');
    case 'no_active_encounter':
      return t('runtime.recoveryNote.encounter');
    case 'no_active_scene':
      return t('runtime.recoveryNote.activeScene');
    default:
      return t('runtime.recoveryNote.generic');
  }
}
