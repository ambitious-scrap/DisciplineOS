import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type {
  ActiveUnlockSession,
  EmergencyUnlockRequest,
  LeasePayload,
  SignedLease,
  SpendPointsRequest,
  StartFocusSessionRequest,
} from '@disciplineos/shared';
import type { ActiveUnlockRow } from '../db/interfaces.js';
import type { DisciplineStore, UnlockSessionInput } from '../db/store.js';
import { leaseSigner } from '../security/leaseSigner.js';

export class SessionService {
  constructor(private readonly store: DisciplineStore) {}

  private async createLease(input: {
    leaseId: string;
    userId: string;
    deviceId: string;
    targetType: LeasePayload['targetType'];
    targetIdentifier: string;
    issuedAt: string;
    expiresAt: string;
    durationSeconds: number;
    isEmergency: boolean;
  }): Promise<SignedLease> {
    const policy = await this.store.getPolicy(input.userId);
    return leaseSigner.sign({
      version: 1,
      leaseId: input.leaseId,
      userId: input.userId,
      deviceId: input.deviceId,
      targetType: input.targetType,
      targetIdentifier: input.targetIdentifier,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      durationSeconds: input.durationSeconds,
      isEmergency: input.isEmergency,
      policyVersion: policy.version,
      nonce: randomUUID(),
    });
  }

  private toSession(session: ActiveUnlockRow): ActiveUnlockSession {
    const lease = session.leasePayload?.version === 1 && session.leaseAlgorithm && session.leaseKeyId
      ? {
          payload: session.leasePayload,
          canonicalPayload: this.canonicalPayload(session.leasePayload),
          signature: session.leaseSignature,
          algorithm: session.leaseAlgorithm,
          keyId: session.leaseKeyId,
        }
      : null;
    return {
      id: session.id,
      userId: session.userId,
      deviceId: session.deviceId,
      unlockType: session.unlockType,
      identifier: session.identifier,
      durationSeconds: session.durationSeconds,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      isEmergency: session.isEmergency,
      leaseSignature: session.leaseSignature,
      lease,
    };
  }

  private canonicalPayload(payload: LeasePayload): string {
    return JSON.stringify(Object.fromEntries(
      Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)),
    ));
  }

  private async persistSession(input: Omit<UnlockSessionInput, 'leaseSignature' | 'leasePayload' | 'leaseAlgorithm' | 'leaseKeyId'> & {
    lease: SignedLease;
  }): Promise<ActiveUnlockSession> {
    const session = await this.store.createUnlockSession({
      ...input,
      leaseSignature: input.lease.signature,
      leasePayload: input.lease.payload,
      leaseAlgorithm: input.lease.algorithm,
      leaseKeyId: input.lease.keyId,
    });
    return this.toSession(session);
  }

  async getActiveSession(userId: string): Promise<ActiveUnlockSession | null> {
    const session = await this.store.getActiveUnlock(userId);
    return session ? this.toSession(session) : null;
  }

  async startUnlockSession(
    userId: string,
    request: SpendPointsRequest & { deviceId: string },
  ): Promise<ActiveUnlockSession> {
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + request.seconds * 1000).toISOString();
    const lease = await this.createLease({
      leaseId: sessionId,
      userId,
      deviceId: request.deviceId,
      targetType: request.targetType,
      targetIdentifier: request.targetIdentifier,
      issuedAt: startedAt,
      expiresAt,
      durationSeconds: request.seconds,
      isEmergency: false,
    });
    return this.persistSession({
      id: sessionId,
      userId,
      deviceId: request.deviceId,
      unlockType: request.targetType,
      identifier: request.targetIdentifier,
      durationSeconds: request.seconds,
      startedAt,
      expiresAt,
      isEmergency: false,
      idempotencyKey: request.idempotencyKey,
      costSeconds: request.seconds,
      ledgerSource: 'usage',
      ledgerDescription: `Unlock ${request.targetType}:${request.targetIdentifier}`,
      lease,
    });
  }

  async startEmergencyUnlock(
    userId: string,
    request: EmergencyUnlockRequest & { deviceId: string },
  ): Promise<ActiveUnlockSession> {
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + request.seconds * 1000).toISOString();
    const costSeconds = Math.round(request.seconds * config.defaultEmergencyMultiplier);
    const lease = await this.createLease({
      leaseId: sessionId,
      userId,
      deviceId: request.deviceId,
      targetType: request.targetType,
      targetIdentifier: request.targetIdentifier,
      issuedAt: startedAt,
      expiresAt,
      durationSeconds: request.seconds,
      isEmergency: true,
    });
    return this.persistSession({
      id: sessionId,
      userId,
      deviceId: request.deviceId,
      unlockType: request.targetType,
      identifier: request.targetIdentifier,
      durationSeconds: request.seconds,
      startedAt,
      expiresAt,
      isEmergency: true,
      idempotencyKey: request.idempotencyKey,
      costSeconds,
      ledgerSource: 'emergency',
      ledgerDescription: `Emergency unlock ${request.targetType}:${request.targetIdentifier} (${request.seconds}s with ${config.defaultEmergencyMultiplier}x penalty)`,
      lease,
    });
  }

  async startFocusSession(userId: string, request: StartFocusSessionRequest): Promise<ActiveUnlockSession> {
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + request.durationSeconds * 1000).toISOString();
    const lease = await this.createLease({
      leaseId: sessionId,
      userId,
      deviceId: request.deviceId,
      targetType: 'focus',
      targetIdentifier: 'all',
      issuedAt: startedAt,
      expiresAt,
      durationSeconds: request.durationSeconds,
      isEmergency: false,
    });
    return this.persistSession({
      id: sessionId,
      userId,
      deviceId: request.deviceId,
      unlockType: 'focus',
      identifier: 'all',
      durationSeconds: request.durationSeconds,
      startedAt,
      expiresAt,
      isEmergency: false,
      idempotencyKey: request.idempotencyKey,
      costSeconds: 0,
      lease,
    });
  }

  async releaseSession(userId: string, sessionId: string, deviceId: string): Promise<boolean> {
    return this.store.releaseUnlock(userId, sessionId, deviceId);
  }
}
