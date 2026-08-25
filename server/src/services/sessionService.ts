import { createHmac, randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type {
  ActiveUnlockSession,
  EmergencyUnlockRequest,
  SpendPointsRequest,
  StartFocusSessionRequest,
} from '@disciplineos/shared';
import type { ActiveUnlockRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';

export class SessionService {
  constructor(private readonly store: DisciplineStore) {}

  private signLease(sessionId: string, userId: string, deviceId: string, expiresAt: string): string {
    return createHmac('sha256', config.jwtSecret)
      .update(`${sessionId}:${userId}:${deviceId}:${expiresAt}`)
      .digest('hex');
  }

  private toSession(session: ActiveUnlockRow): ActiveUnlockSession {
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
    };
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
    const session = await this.store.createUnlockSession({
      id: sessionId,
      userId,
      deviceId: request.deviceId,
      unlockType: request.targetType,
      identifier: request.targetIdentifier,
      durationSeconds: request.seconds,
      startedAt,
      expiresAt,
      isEmergency: false,
      leaseSignature: this.signLease(sessionId, userId, request.deviceId, expiresAt),
      idempotencyKey: request.idempotencyKey,
      costSeconds: request.seconds,
      ledgerSource: 'usage',
      ledgerDescription: `Unlock ${request.targetType}:${request.targetIdentifier}`,
    });
    return this.toSession(session);
  }

  async startEmergencyUnlock(
    userId: string,
    request: EmergencyUnlockRequest & { deviceId: string },
  ): Promise<ActiveUnlockSession> {
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + request.seconds * 1000).toISOString();
    const costSeconds = Math.round(request.seconds * config.defaultEmergencyMultiplier);
    const session = await this.store.createUnlockSession({
      id: sessionId,
      userId,
      deviceId: request.deviceId,
      unlockType: request.targetType,
      identifier: request.targetIdentifier,
      durationSeconds: request.seconds,
      startedAt,
      expiresAt,
      isEmergency: true,
      leaseSignature: this.signLease(sessionId, userId, request.deviceId, expiresAt),
      idempotencyKey: request.idempotencyKey,
      costSeconds,
      ledgerSource: 'emergency',
      ledgerDescription: `Emergency unlock ${request.targetType}:${request.targetIdentifier} (${request.seconds}s with ${config.defaultEmergencyMultiplier}x penalty)`,
    });
    return this.toSession(session);
  }

  async startFocusSession(userId: string, request: StartFocusSessionRequest): Promise<ActiveUnlockSession> {
    const sessionId = randomUUID();
    const startedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + request.durationSeconds * 1000).toISOString();
    const session = await this.store.createUnlockSession({
      id: sessionId,
      userId,
      deviceId: request.deviceId,
      unlockType: 'focus',
      identifier: 'all',
      durationSeconds: request.durationSeconds,
      startedAt,
      expiresAt,
      isEmergency: false,
      leaseSignature: this.signLease(sessionId, userId, request.deviceId, expiresAt),
      idempotencyKey: request.idempotencyKey,
      costSeconds: 0,
    });
    return this.toSession(session);
  }

  async releaseSession(userId: string, sessionId: string, deviceId: string): Promise<boolean> {
    return this.store.releaseUnlock(userId, sessionId, deviceId);
  }
}
