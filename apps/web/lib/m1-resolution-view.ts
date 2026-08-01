/**
 * Turning the server's M1 records into something a panel can render.
 *
 * Everything here is a pure mapping from an authoritative record to localizable
 * descriptors. Two rules govern the whole module.
 *
 * It never computes an outcome. `success`, `selectedDie`, `total` and every
 * modifier come from the server's `diceResolution`; this file decides only how
 * to *say* them. If the browser ever needed to work out whether a roll beat a
 * DC, the audit record would have failed at its job.
 *
 * And it never emits English. Descriptors carry i18n keys plus canonical
 * values, so a component cannot accidentally hardcode a string and a test can
 * assert the mapping without rendering anything. The one exception is prose the
 * *user* wrote - an intent, a GM reason - which is passed through untouched and
 * never translated.
 */
import type {
  DiceResolution,
  ModifierSource,
  PlayerIntent,
  PlayerIntentStatus,
  ResolutionRequest,
  RollStance,
  RuntimeErrorCode,
  StanceSource,
} from '@dnd/protocol';

import type { MessageKey } from './i18n';
// `@dnd/shared` is not a direct dependency of the web app; the protocol package
// re-exports the primitives the browser needs.
type ParticipantId = string;
type ParticipantRole = 'dm' | 'player';

export type ResolutionViewerRole = ParticipantRole;

/**
 * `key` is a real message key, not a free string.
 *
 * Several are assembled from a canonical ID - `runtime.m1.kind.${kind}` - which
 * TypeScript cannot narrow on its own, so those construction sites assert the
 * type. The assertion is not taken on trust: `m1-resolution-view.test.ts`
 * asserts that every key a descriptor can emit resolves in both locales, which
 * is the check the cast would otherwise have removed.
 */
export type LocalizedDescriptor = {
  key: MessageKey;
  values?: Record<string, string>;
};

export type DiceFaceView = {
  face: number;
  /** The face the stance kept. The others are shown struck through. */
  selected: boolean;
};

export type ModifierView = LocalizedDescriptor & {
  /** Pre-formatted with an explicit sign: a bare `3` reads as a total. */
  signedValue: string;
};

export type DiceResolutionView = {
  id: string;
  kindKey: MessageKey;
  abilityKey: MessageKey;
  skillKey: MessageKey | null;
  stanceKey: MessageKey;
  dice: DiceFaceView[];
  selectedDie: number;
  stanceSources: LocalizedDescriptor[];
  modifiers: ModifierView[];
  modifierTotalSigned: string;
  total: number;
  /** `null` when the record has no pass/fail semantics. */
  outcomeKey: MessageKey | null;
  thresholdKey: MessageKey | null;
  thresholdValue: number | null;
  proficiency: ModifierView | null;
  resolvedAt: string;
};

export type ResolutionRequestView = {
  id: string;
  kindKey: MessageKey;
  abilityKey: MessageKey;
  skillKey: MessageKey | null;
  statusKey: MessageKey;
  stanceKey: MessageKey;
  dc: number;
  /** GM-authored prose. Rendered as text, never translated. */
  reason: string | null;
  consequence: string | null;
  addressedToViewer: boolean;
  canSubmit: boolean;
  canCancel: boolean;
};

const ABILITY_KEY_PREFIX = 'runtime.m1.ability.';
const SKILL_KEY_PREFIX = 'runtime.m1.skill.';
const STANCE_KEY_PREFIX = 'runtime.m1.stance.';
const CONDITION_KEY_PREFIX = 'runtime.m1.condition.';

export function abilityLabelKey(ability: string): MessageKey {
  return `${ABILITY_KEY_PREFIX}${ability}` as MessageKey;
}

export function skillLabelKey(skill: string): MessageKey {
  return `${SKILL_KEY_PREFIX}${skill}` as MessageKey;
}

export function stanceLabelKey(stance: RollStance): MessageKey {
  return `${STANCE_KEY_PREFIX}${stance}` as MessageKey;
}

export function conditionLabelKey(condition: string): MessageKey {
  return `${CONDITION_KEY_PREFIX}${condition}` as MessageKey;
}

/**
 * Signs are explicit, including for zero.
 *
 * `+0` looks pedantic in isolation and is right in a column of contributions:
 * it says "this source was consulted and added nothing", which is different
 * from the source being absent.
 */
export function formatSignedModifier(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

export function describeModifier(modifier: ModifierSource): ModifierView {
  const signedValue = formatSignedModifier(modifier.value);

  if (modifier.kind === 'ability') {
    return {
      key: 'runtime.m1.modifier.ability',
      signedValue,
      values: { abilityKey: abilityLabelKey(modifier.detail ?? '') },
    };
  }

  if (modifier.kind === 'proficiency') {
    // A skill proficiency names the skill; a saving-throw proficiency has no
    // detail to name, so it stays the generic label rather than inventing one.
    return modifier.detail
      ? {
          key: 'runtime.m1.modifier.proficiencySkill',
          signedValue,
          values: { skillKey: skillLabelKey(modifier.detail) },
        }
      : { key: 'runtime.m1.modifier.proficiency', signedValue };
  }

  if (modifier.kind === 'condition') {
    return {
      key: 'runtime.m1.modifier.condition',
      signedValue,
      values: { conditionKey: conditionLabelKey(modifier.detail ?? '') },
    };
  }

  return { key: 'runtime.m1.modifier.gmAdjustment', signedValue };
}

export function describeStanceSource(
  source: StanceSource,
): LocalizedDescriptor {
  if (source.kind === 'condition') {
    return {
      key: 'runtime.m1.stanceSource.condition',
      values: {
        conditionKey: conditionLabelKey(source.detail ?? ''),
        stanceKey: stanceLabelKey(source.stance),
      },
    };
  }

  return {
    key: 'runtime.m1.stanceSource.gmRequest',
    values: { stanceKey: stanceLabelKey(source.stance) },
  };
}

/**
 * The whole roll, as the panel shows it.
 *
 * `outcomeKey` distinguishes a check or save - which succeeds or fails against
 * a DC - from an attack, which hits or misses an AC. Collapsing the two would
 * make a missed attack read as a failed saving throw.
 */
export function describeDiceResolution(
  resolution: DiceResolution,
): DiceResolutionView {
  const proficiencyModifier = resolution.modifiers.find(
    (modifier) => modifier.kind === 'proficiency',
  );

  return {
    abilityKey: abilityLabelKey(resolution.ability),
    dice: describeDiceFaces(resolution),
    id: resolution.id,
    kindKey: `runtime.m1.kind.${resolution.kind}` as MessageKey,
    modifiers: resolution.modifiers.map((modifier) =>
      describeModifier(modifier),
    ),
    modifierTotalSigned: formatSignedModifier(resolution.modifierTotal),
    outcomeKey: describeOutcomeKey(resolution),
    proficiency: proficiencyModifier
      ? describeModifier(proficiencyModifier)
      : null,
    resolvedAt: resolution.resolvedAt,
    selectedDie: resolution.selectedDie,
    skillKey: resolution.skill ? skillLabelKey(resolution.skill) : null,
    stanceKey: stanceLabelKey(resolution.stance),
    stanceSources: (resolution.stanceSources ?? []).map((source) =>
      describeStanceSource(source),
    ),
    thresholdKey:
      resolution.dc !== undefined
        ? 'runtime.m1.threshold.dc'
        : resolution.targetArmorClass !== undefined
          ? 'runtime.m1.threshold.ac'
          : null,
    thresholdValue: resolution.dc ?? resolution.targetArmorClass ?? null,
    total: resolution.total,
  };
}

/**
 * Marks exactly one face as the kept one.
 *
 * Under a stance both faces can show the same number, and marking every match
 * would claim two dice counted. The first occurrence wins, which matches how
 * the server's `Math.min`/`Math.max` picked it.
 */
function describeDiceFaces(resolution: DiceResolution): DiceFaceView[] {
  let selectedTaken = false;

  return resolution.dice.map((face) => {
    const selected = !selectedTaken && face === resolution.selectedDie;

    if (selected) {
      selectedTaken = true;
    }

    return { face, selected };
  });
}

function describeOutcomeKey(resolution: DiceResolution): MessageKey | null {
  if (resolution.success === undefined) {
    return null;
  }

  if (resolution.kind === 'attack_roll') {
    return resolution.success
      ? 'runtime.m1.outcome.hit'
      : 'runtime.m1.outcome.miss';
  }

  return resolution.success
    ? 'runtime.m1.outcome.success'
    : 'runtime.m1.outcome.failure';
}

/**
 * A request as one viewer sees it.
 *
 * `canSubmit` and `canCancel` decide which controls to *render*, never whether
 * the action is allowed - the server refuses a player cancelling and a
 * bystander rolling regardless of what the UI drew. Hiding a control the server
 * would reject is courtesy; relying on it would be client-side authorization.
 */
export function describeResolutionRequest(params: {
  request: ResolutionRequest;
  viewerParticipantId: ParticipantId;
  viewerRole: ResolutionViewerRole;
}): ResolutionRequestView {
  const addressedToViewer =
    params.request.targetParticipantId === params.viewerParticipantId;
  const pending = params.request.status === 'pending';

  return {
    abilityKey: abilityLabelKey(params.request.ability),
    addressedToViewer,
    canCancel: pending && params.viewerRole === 'dm',
    canSubmit: pending && addressedToViewer && params.viewerRole === 'player',
    consequence: params.request.consequence ?? null,
    dc: params.request.dc,
    id: params.request.id,
    kindKey: `runtime.m1.kind.${params.request.kind}` as MessageKey,
    reason: params.request.reason ?? null,
    skillKey: params.request.skill ? skillLabelKey(params.request.skill) : null,
    stanceKey: stanceLabelKey(params.request.stance),
    statusKey:
      `runtime.m1.requestStatus.${params.request.status}` as MessageKey,
  };
}

export type PlayerIntentView = {
  id: string;
  /** Author-written prose. Never translated, never interpreted. */
  text: string;
  gmNote: string | null;
  statusKey: MessageKey;
  authoredByViewer: boolean;
  isTerminal: boolean;
  availableTransitions: Exclude<PlayerIntentStatus, 'pending'>[];
  updatedAt: string;
};

const TERMINAL_INTENT_STATUSES: readonly PlayerIntentStatus[] = [
  'resolved',
  'dismissed',
];

export function describePlayerIntent(params: {
  intent: PlayerIntent;
  viewerParticipantId: ParticipantId;
  viewerRole: ResolutionViewerRole;
}): PlayerIntentView {
  const isTerminal = TERMINAL_INTENT_STATUSES.includes(params.intent.status);

  return {
    authoredByViewer:
      params.intent.authorParticipantId === params.viewerParticipantId,
    // A terminal intent offers nothing, which is what stops a GM from
    // reopening a decision the table already saw. The server refuses it too.
    availableTransitions:
      params.viewerRole === 'dm' && !isTerminal
        ? params.intent.status === 'pending'
          ? ['acknowledged', 'resolved', 'dismissed']
          : ['resolved', 'dismissed']
        : [],
    gmNote: params.intent.gmNote ?? null,
    id: params.intent.id,
    isTerminal,
    statusKey: `runtime.m1.intentStatus.${params.intent.status}` as MessageKey,
    text: params.intent.text,
    updatedAt: params.intent.updatedAt,
  };
}

/**
 * A stable error code becomes a bilingual sentence.
 *
 * Everything M1 can be told "no" for is named here. Anything unrecognized falls
 * back to one generic key rather than leaking a raw code or a stack trace to a
 * player surface.
 */
export function describeM1ErrorCode(
  code: RuntimeErrorCode | undefined,
): LocalizedDescriptor {
  switch (code) {
    case 'resolution_request_not_found':
      return { key: 'runtime.m1.error.requestNotFound' };
    case 'resolution_request_already_resolved':
      return { key: 'runtime.m1.error.requestAlreadyResolved' };
    case 'invalid_resolution_target':
      return { key: 'runtime.m1.error.notYourRequest' };
    case 'player_intent_not_found':
      return { key: 'runtime.m1.error.intentNotFound' };
    case 'invalid_intent_status_transition':
      return { key: 'runtime.m1.error.intentAlreadyDecided' };
    case 'command_id_conflict':
      return { key: 'runtime.m1.error.commandConflict' };
    case 'invalid_role_assumption':
      return { key: 'runtime.m1.error.notAllowed' };
    case 'seat_owned_by_another_account':
      return { key: 'runtime.m1.error.seatOwned' };
    case 'unauthenticated':
      return { key: 'runtime.m1.error.credentialExpired' };
    case 'no_assigned_character':
      return { key: 'runtime.m1.error.noAssignedCharacter' };
    case 'no_active_scene':
      return { key: 'runtime.m1.error.noActiveScene' };
    case 'no_active_encounter':
      return { key: 'runtime.m1.error.noActiveEncounter' };
    case 'scene_not_found':
      return { key: 'runtime.m1.error.combatantNotFound' };
    default:
      return { key: 'runtime.m1.error.generic' };
  }
}

/**
 * What a mechanical condition does, for the player carrying it.
 *
 * Deliberately explicit that saving throws are untouched. A player who reads
 * only "disadvantage" reasonably assumes it applies to everything, and then
 * cannot tell a correct save from a bug.
 */
export function describeMechanicalCondition(
  condition: string,
): LocalizedDescriptor | null {
  if (condition !== 'poisoned') {
    return null;
  }

  return { key: 'runtime.m1.condition.poisonedEffect' };
}

/**
 * Whether the GM concealment control should be drawn at all.
 *
 * Player surfaces never render it. The server rejects the command from a player
 * regardless; this only keeps a control out of a UI where it would be a lie.
 */
export function canControlCombatantVisibility(
  viewerRole: ResolutionViewerRole,
): boolean {
  return viewerRole === 'dm';
}
