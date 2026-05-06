import type {
  CommandIdempotencyClaimRecordDatabase,
  CommandIdempotencyRecordDatabase,
} from '@dnd/db';

import {
  CommandIdempotencyError,
  getCommandSessionId,
  type CommandIdempotencyCategory,
  type IdempotentCommand,
} from './command-idempotency-store.js';

type TransactionalClaimParams = {
  category: CommandIdempotencyCategory;
  claims: CommandIdempotencyClaimRecordDatabase;
  command: IdempotentCommand;
  completed: CommandIdempotencyRecordDatabase;
  fingerprint: string;
  idempotencyKey: string;
};

export type TransactionalIdempotencyClaimResult<TResponse> =
  | {
      kind: 'cached';
      response: TResponse;
    }
  | {
      kind: 'execute';
    };

export async function acquireTransactionalIdempotencyClaim<TResponse>(
  params: TransactionalClaimParams,
): Promise<TransactionalIdempotencyClaimResult<TResponse>> {
  const existing = await params.completed.getCompletedCommandIdempotencyRecord(
    params.idempotencyKey,
  );

  if (existing) {
    assertSameFingerprint(
      params.idempotencyKey,
      existing.fingerprint,
      params.fingerprint,
    );

    return {
      kind: 'cached',
      response: structuredClone(existing.response) as TResponse,
    };
  }

  const inserted = await params.claims.insertCommandIdempotencyClaimRecord({
    actorParticipantId: params.command.actor.participantId,
    category: params.category,
    commandId: params.command.commandId,
    commandType: params.command.type,
    fingerprint: params.fingerprint,
    idempotencyKey: params.idempotencyKey,
    sessionId: getCommandSessionId(params.command),
  });

  if (inserted) {
    return {
      kind: 'execute',
    };
  }

  const claim = await params.claims.getCommandIdempotencyClaimRecord(
    params.idempotencyKey,
  );

  if (!claim) {
    throw new Error(
      `Command idempotency claim "${params.idempotencyKey}" was not inserted and could not be reloaded.`,
    );
  }

  assertSameFingerprint(
    params.idempotencyKey,
    claim.fingerprint,
    params.fingerprint,
  );

  const completed = await params.completed.getCompletedCommandIdempotencyRecord(
    params.idempotencyKey,
  );

  if (!completed) {
    throw new Error(
      `Command idempotency claim "${params.idempotencyKey}" exists without a completed command record.`,
    );
  }

  assertSameFingerprint(
    params.idempotencyKey,
    completed.fingerprint,
    params.fingerprint,
  );

  return {
    kind: 'cached',
    response: structuredClone(completed.response) as TResponse,
  };
}

function assertSameFingerprint(
  key: string,
  existingFingerprint: string,
  nextFingerprint: string,
): void {
  if (existingFingerprint === nextFingerprint) {
    return;
  }

  throw new CommandIdempotencyError(
    `Command ID conflict for idempotency key "${key}".`,
  );
}
