import { randomUUID, createHmac } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import { config } from '../config.js';
import { ledgerService } from './ledgerService.js';
import type {
  ActiveUnlockSession,
  SpendPointsRequest,
  EmergencyUnlockRequest,
  StartFocusSessionRequest,
} from '@disciplineos/shared';

export class SessionService {
  /**
   * Helper to sign unlock lease
   */
  private signLease(sessionId: string, userId: string, deviceId: string, expiresAt: string): string {
    return createHmac('sha256', config.jwtSecret)
      .update(`${sessionId}:${userId}:${deviceId}:${expiresAt}`)
      .digest('hex');
  }

  /**
   * Clean expired sessions
   */
  private purgeExpired() {
    const now = new Date().toISOString();
    for (const [id, session] of db.activeUnlocks.entries()) {
      if (session.expiresAt <= now) {
        db.activeUnlocks.delete(id);
      }
    }
  }

  /**
   * Get current active session for the user across all devices
   */
  async getActiveSession(userId: string): Promise<ActiveUnlockSession | null> {
    this.purgeExpired();
    for (const session of db.activeUnlocks.values()) {
      if (session.userId === userId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Start a normal unlock session (spends points, locks globally)
   */
  async startUnlockSession(userId: string, req: SpendPointsRequest): Promise<ActiveUnlockSession> {
    this.purgeExpired();

    const existing = await this.getActiveSession(userId);
    if (existing) {
      throw new Error(`Another session is currently active on device ${existing.deviceId} (expires at ${existing.expiresAt})`);
    }

    const deviceId = req.deviceId || 'device-primary';

    // Spend the points from the ledger
    await ledgerService.spendPoints(userId, { ...req, deviceId });

    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + req.seconds * 1000).toISOString();
    const startedAt = now.toISOString();

    const signature = this.signLease(sessionId, userId, deviceId, expiresAt);

    const session: ActiveUnlockSession = {
      id: sessionId,
      userId,
      deviceId,
      unlockType: req.targetType,
      identifier: req.targetIdentifier,
      durationSeconds: req.seconds,
      startedAt,
      expiresAt,
      isEmergency: false,
      leaseSignature: signature,
    };

    db.activeUnlocks.set(sessionId, session);
    return session;
  }

  /**
   * Start an emergency unlock session (3x penalty cost)
   */
  async startEmergencyUnlock(userId: string, req: EmergencyUnlockRequest): Promise<ActiveUnlockSession> {
    this.purgeExpired();

    const existing = await this.getActiveSession(userId);
    if (existing) {
      throw new Error(`Another session is currently active on device ${existing.deviceId}`);
    }

    const deviceId = req.deviceId || 'device-primary';

    await ledgerService.emergencyUnlock(userId, { ...req, deviceId });

    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + req.seconds * 1000).toISOString();
    const startedAt = now.toISOString();

    const signature = this.signLease(sessionId, userId, deviceId, expiresAt);

    const session: ActiveUnlockSession = {
      id: sessionId,
      userId,
      deviceId,
      unlockType: req.targetType,
      identifier: req.targetIdentifier,
      durationSeconds: req.seconds,
      startedAt,
      expiresAt,
      isEmergency: true,
      leaseSignature: signature,
    };

    db.activeUnlocks.set(sessionId, session);
    return session;
  }

  /**
   * Start a focus session spanning all devices
   */
  async startFocusSession(userId: string, req: StartFocusSessionRequest): Promise<ActiveUnlockSession> {
    this.purgeExpired();

    const existing = await this.getActiveSession(userId);
    if (existing) {
      throw new Error(`Cannot start focus session: another session is currently active`);
    }

    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + req.durationSeconds * 1000).toISOString();
    const startedAt = now.toISOString();

    const signature = this.signLease(sessionId, userId, req.deviceId, expiresAt);

    const session: ActiveUnlockSession = {
      id: sessionId,
      userId,
      deviceId: req.deviceId,
      unlockType: 'focus',
      identifier: 'all',
      durationSeconds: req.durationSeconds,
      startedAt,
      expiresAt,
      isEmergency: false,
      leaseSignature: signature,
    };

    db.activeUnlocks.set(sessionId, session);
    return session;
  }

  /**
   * Release active session manually or on completion
   */
  async releaseSession(userId: string, sessionId: string, deviceId: string): Promise<boolean> {
    const session = db.activeUnlocks.get(sessionId);
    if (!session || session.userId !== userId) {
      return false;
    }

    if (session.deviceId !== deviceId) {
      throw new Error('Session can only be released by the owning device');
    }

    db.activeUnlocks.delete(sessionId);
    return true;
  }
}

export const sessionService = new SessionService();
