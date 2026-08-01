/**
 * Which authenticated account owns which seat at a table.
 *
 * M0 shipped server-issued participant credentials, which stopped a caller from
 * *forging* an identity. It deliberately left a hole one level up: participant
 * IDs are public - the session snapshot broadcasts every one of them, including
 * the GM's - and `reconnect_session` only checked that the participant existed
 * and that the claimed role matched. So any authenticated account holding the
 * six-character session code could reconnect as `player-001` and be issued a
 * perfectly valid credential for a seat someone else was sitting in.
 *
 * Binding the seat to an account closes that. The credential stays short-lived
 * and per-process; the *binding* is the durable fact. That split is deliberate:
 * a restart should force a re-issue of the credential without forcing the player
 * to surrender their seat, which is exactly what M1 needs for DB-mode recovery.
 *
 * This module is pure bookkeeping so it can be unit-tested without a session,
 * a socket, or a database. Storage is injected; the in-memory map below is the
 * default, and a DB-backed implementation can satisfy the same interface.
 */
import type { ParticipantId, SessionId } from '@dnd/shared';

export type SeatOwnerUserId = string;

export type SeatOwnershipRecord = {
  sessionId: SessionId;
  participantId: ParticipantId;
  userId: SeatOwnerUserId;
  boundAt: string;
};

export type SeatOwnershipStorageResult<T> = T | Promise<T>;

/**
 * Reads are synchronous and writes are not.
 *
 * That asymmetry is deliberate. `assertAvailableTo` runs on the hot path of
 * every session command and answers from a hydrated view, while a claim has to
 * be durable *before* a participant credential is minted against it - otherwise
 * a crash between the two leaves a client holding a token for a seat the
 * database never recorded as theirs.
 */
export type SeatOwnershipStorage = {
  get(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): SeatOwnershipRecord | undefined;
  set(record: SeatOwnershipRecord): SeatOwnershipStorageResult<void>;
  deleteSession(sessionId: SessionId): SeatOwnershipStorageResult<void>;
};

export class SeatOwnershipError extends Error {
  readonly code: 'seat_owned_by_another_account';

  constructor(message: string) {
    super(message);
    this.name = 'SeatOwnershipError';
    this.code = 'seat_owned_by_another_account';
  }
}

export class InMemorySeatOwnershipStorage implements SeatOwnershipStorage {
  private readonly records = new Map<string, SeatOwnershipRecord>();

  private key(sessionId: SessionId, participantId: ParticipantId): string {
    return `${sessionId}::${participantId}`;
  }

  get(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): SeatOwnershipRecord | undefined {
    return this.records.get(this.key(sessionId, participantId));
  }

  set(record: SeatOwnershipRecord): void {
    this.records.set(
      this.key(record.sessionId, record.participantId),
      structuredClone(record),
    );
  }

  deleteSession(sessionId: SessionId): void {
    for (const [key, record] of this.records) {
      if (record.sessionId === sessionId) {
        this.records.delete(key);
      }
    }
  }
}

export class SessionSeatOwnership {
  constructor(
    private readonly storage: SeatOwnershipStorage = new InMemorySeatOwnershipStorage(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  getOwner(
    sessionId: SessionId,
    participantId: ParticipantId,
  ): SeatOwnerUserId | undefined {
    return this.storage.get(sessionId, participantId)?.userId;
  }

  /**
   * Whether this account may occupy the seat.
   *
   * An unbound seat is open to anyone authenticated - that is how a player takes
   * a seat in the first place. An anonymous caller can never take a seat that is
   * already bound, because "no account" can never equal the owning account.
   */
  isAvailableTo(
    sessionId: SessionId,
    participantId: ParticipantId,
    userId: SeatOwnerUserId | undefined,
  ): boolean {
    const owner = this.getOwner(sessionId, participantId);

    if (owner === undefined) {
      return true;
    }

    return owner === userId;
  }

  /**
   * Bind the seat, or confirm an existing binding.
   *
   * Idempotent for the owner so a reconnect after a restart re-affirms the same
   * seat rather than failing, and a re-join by the same account is not a
   * conflict. Rebinding to a different account is refused: that is the attack.
   */
  async claim(params: {
    sessionId: SessionId;
    participantId: ParticipantId;
    userId: SeatOwnerUserId;
  }): Promise<SeatOwnershipRecord> {
    const existing = this.storage.get(params.sessionId, params.participantId);

    if (existing && existing.userId !== params.userId) {
      throw new SeatOwnershipError(
        `Seat "${params.participantId}" in session "${params.sessionId}" belongs to another account.`,
      );
    }

    if (existing) {
      return existing;
    }

    const record: SeatOwnershipRecord = {
      boundAt: this.now(),
      participantId: params.participantId,
      sessionId: params.sessionId,
      userId: params.userId,
    };

    // Awaited, not fired and forgotten. The caller mints a credential against
    // this binding on the next line.
    await this.storage.set(record);

    return record;
  }

  /**
   * Whether this account is the recorded owner of the seat.
   *
   * Stricter than `isAvailableTo`, and the two must not be confused. An
   * *unbound* seat is available to anyone authenticated, which is how a player
   * sits down; it is emphatically not proof of anything, and using availability
   * to authorize a credential-less reconnect would let any account with the
   * session code take over an anonymous table's GM seat after a restart.
   */
  isOwnedBy(
    sessionId: SessionId,
    participantId: ParticipantId,
    userId: SeatOwnerUserId | undefined,
  ): boolean {
    if (!userId) {
      return false;
    }

    return this.getOwner(sessionId, participantId) === userId;
  }

  /** Throws unless the account may occupy the seat. */
  assertAvailableTo(
    sessionId: SessionId,
    participantId: ParticipantId,
    userId: SeatOwnerUserId | undefined,
  ): void {
    if (this.isAvailableTo(sessionId, participantId, userId)) {
      return;
    }

    throw new SeatOwnershipError(
      `Seat "${participantId}" in session "${sessionId}" belongs to another account.`,
    );
  }

  async forgetSession(sessionId: SessionId): Promise<void> {
    await this.storage.deleteSession(sessionId);
  }
}
