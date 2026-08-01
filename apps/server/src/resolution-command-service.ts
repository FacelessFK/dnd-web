/**
 * Building the two authoritative records behind a check or a save.
 *
 * The runtime resolves *who* is allowed to do this and *which* character is
 * involved; everything after that decision is here, so a request and the dice
 * record that answers it can be built and asserted without a session, a socket,
 * or a database.
 *
 * Nothing in this module reaches for randomness. The d20 arrives through an
 * injected roller exactly as it does in `@dnd/rules`, which is what lets a test
 * pin the dice and what keeps `Math.random` out of the resolution path.
 */
import { randomUUID } from 'node:crypto';

import type {
  DiceResolution,
  RequestResolutionCommand,
  ResolutionRequest,
} from '@dnd/protocol';
import { resolveAbilityResolution, type CheckActor } from '@dnd/rules';
import type {
  CharacterId,
  ParticipantId,
  RulesProfileId,
  SessionId,
} from '@dnd/shared';

export function createResolutionId(): string {
  return `resolution_${randomUUID()}`;
}

/**
 * The GM's request, as the table will remember it.
 *
 * `status` is fixed at `pending` rather than taken from the command: a request
 * that could arrive already resolved would be a client-supplied dice result,
 * which is the one thing this whole path exists to prevent.
 */
export function buildResolutionRequest(params: {
  command: RequestResolutionCommand;
  requestId: string;
  sessionId: SessionId;
  requestedByParticipantId: ParticipantId;
  targetParticipantId: ParticipantId;
  targetCharacterId?: CharacterId;
  createdAt: string;
}): ResolutionRequest {
  const { payload } = params.command;

  return {
    id: params.requestId,
    sessionId: params.sessionId,
    kind: payload.kind,
    status: 'pending',
    requestedByParticipantId: params.requestedByParticipantId,
    targetParticipantId: params.targetParticipantId,
    ...(params.targetCharacterId
      ? { targetCharacterId: params.targetCharacterId }
      : {}),
    ability: payload.ability,
    ...(payload.skill ? { skill: payload.skill } : {}),
    dc: payload.dc,
    stance: payload.stance,
    ...(payload.reason ? { reason: payload.reason } : {}),
    ...(payload.consequence ? { consequence: payload.consequence } : {}),
    createdAt: params.createdAt,
  };
}

/**
 * Roll the request and turn the breakdown into the canonical wire record.
 *
 * `kind` is carried over from the request rather than re-derived, so a saving
 * throw cannot be recorded as an ability check by a caller that guessed. The
 * stance the GM asked for and the stances the actor's conditions impose are
 * both handed to the rules helper, which folds them - a GM asking for advantage
 * on a poisoned character produces a normal roll and says so in
 * `stanceSources`.
 */
export function resolveResolutionRequest(params: {
  request: ResolutionRequest;
  actor: CheckActor;
  actorParticipantId: ParticipantId;
  actorCharacterId?: CharacterId;
  rulesProfileId: RulesProfileId;
  sessionId: SessionId;
  commandId: string;
  resolutionId: string;
  resolvedAt: string;
  roller: () => number;
}): DiceResolution {
  const breakdown = resolveAbilityResolution({
    kind: params.request.kind,
    ability: params.request.ability,
    ...(params.request.skill ? { skill: params.request.skill } : {}),
    dc: params.request.dc,
    actor: params.actor,
    requestedStance: params.request.stance,
    roller: params.roller,
  });

  return {
    id: params.resolutionId,
    kind: breakdown.kind,
    rulesProfileId: params.rulesProfileId,
    sessionId: params.sessionId,
    actorParticipantId: params.actorParticipantId,
    ...(params.actorCharacterId
      ? { actorCharacterId: params.actorCharacterId }
      : {}),
    ability: breakdown.ability,
    ...(breakdown.skill ? { skill: breakdown.skill } : {}),
    stance: breakdown.stance,
    dice: breakdown.dice,
    selectedDie: breakdown.selectedDie,
    ...(breakdown.stanceSources.length
      ? { stanceSources: breakdown.stanceSources }
      : {}),
    modifiers: breakdown.modifiers,
    modifierTotal: breakdown.modifierTotal,
    total: breakdown.total,
    ...(breakdown.dc === undefined ? {} : { dc: breakdown.dc }),
    ...(breakdown.success === undefined ? {} : { success: breakdown.success }),
    critical: breakdown.critical,
    criticalMiss: breakdown.criticalMiss,
    requestId: params.request.id,
    commandId: params.commandId,
    resolvedAt: params.resolvedAt,
  };
}
