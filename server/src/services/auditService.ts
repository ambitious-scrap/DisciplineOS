import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import { ledgerService } from './ledgerService.js';
import type {
  ReportProtectionEventRequest,
  ReportLocationEventRequest,
  TimeBankBalance,
} from '@disciplineos/shared';

export class AuditService {
  async recordProtectionEvent(userId: string, req: ReportProtectionEventRequest): Promise<{ id: string }> {
    const id = randomUUID();
    const row = {
      id,
      userId,
      deviceId: req.deviceId,
      eventType: req.eventType,
      details: req.details,
      occurredAt: req.occurredAt,
      createdAt: new Date().toISOString(),
    };
    db.protectionEvents.push(row);
    return { id };
  }

  async getProtectionEvents(userId: string, limit = 50) {
    return db.protectionEvents
      .filter((e) => e.userId === userId)
      .slice(-limit)
      .reverse();
  }

  async recordLocationEvent(
    userId: string,
    req: ReportLocationEventRequest
  ): Promise<{ id: string; rewardGranted: boolean; balance?: TimeBankBalance }> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const row = {
      id,
      userId,
      deviceId: req.deviceId,
      locationType: req.locationType,
      eventType: req.eventType,
      dwellSeconds: req.dwellSeconds,
      movementVerified: req.movementVerified,
      occurredAt: req.occurredAt,
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
    };
    db.locationEvents.push(row);

    // Evaluate physical movement reward criteria
    // Gym visit: dwell >= 1800s (30m) + movement verified
    // Outside visit: dwell >= 3600s (60m) + movement verified
    let rewardGranted = false;
    let balance: TimeBankBalance | undefined;

    if (req.eventType === 'exit' && req.movementVerified) {
      if (req.locationType === 'gym' && (req.dwellSeconds ?? 0) >= 1800) {
        const result = await ledgerService.earnPoints(userId, {
          source: 'gym',
          seconds: 3600, // 1 hour reward for gym workout
          description: `Verified gym session (${Math.round((req.dwellSeconds ?? 0) / 60)} min)`,
          deviceId: req.deviceId,
          idempotencyKey: req.idempotencyKey,
        });
        rewardGranted = true;
        balance = result.newBalance;
      } else if (req.locationType === 'home' && (req.dwellSeconds ?? 0) >= 3600) {
        const result = await ledgerService.earnPoints(userId, {
          source: 'outside',
          seconds: 1800, // 30 min reward for outdoor walk
          description: `Verified outdoor activity (${Math.round((req.dwellSeconds ?? 0) / 60)} min)`,
          deviceId: req.deviceId,
          idempotencyKey: req.idempotencyKey,
        });
        rewardGranted = true;
        balance = result.newBalance;
      }
    }

    return { id, rewardGranted, balance };
  }
}

export const auditService = new AuditService();
