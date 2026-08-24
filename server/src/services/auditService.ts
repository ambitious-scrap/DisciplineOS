import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import { ledgerService } from './ledgerService.js';
import type {
  ReportProtectionEventRequest,
  ReportLocationEventRequest,
  TimeBankBalance,
} from '@disciplineos/shared';

interface UserLocationSessionState {
  lastGymEnterAt?: string;
  lastHomeExitAt?: string;
}

const userLocationSessions = new Map<string, UserLocationSessionState>();

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

    let state = userLocationSessions.get(userId);
    if (!state) {
      state = {};
      userLocationSessions.set(userId, state);
    }

    let rewardGranted = false;
    let balance: TimeBankBalance | undefined;

    // Gym Session Lifecycle: ENTER -> (Dwell >= 30m with steps) -> EXIT
    if (req.locationType === 'gym') {
      if (req.eventType === 'enter') {
        state.lastGymEnterAt = req.occurredAt;
      } else if (req.eventType === 'exit') {
        const enteredAt = state.lastGymEnterAt ? new Date(state.lastGymEnterAt).getTime() : 0;
        const exitedAt = new Date(req.occurredAt).getTime();
        const computedDwell = enteredAt > 0 ? Math.floor((exitedAt - enteredAt) / 1000) : (req.dwellSeconds ?? 0);

        if (computedDwell >= 1800 && req.movementVerified) {
          const result = await ledgerService.internalCreditPoints(userId, {
            source: 'gym',
            seconds: 3600, // 1 hour reward for gym workout
            description: `Verified gym session (${Math.round(computedDwell / 60)} min)`,
            deviceId: req.deviceId,
            idempotencyKey: req.idempotencyKey,
          });
          rewardGranted = true;
          balance = result.newBalance;
        }
        state.lastGymEnterAt = undefined;
      }
    }

    // Outdoor / Away Session Lifecycle: HOME_EXIT -> (Away >= 60m with movement) -> HOME_ENTER
    if (req.locationType === 'home') {
      if (req.eventType === 'exit') {
        state.lastHomeExitAt = req.occurredAt;
      } else if (req.eventType === 'enter') {
        const leftAt = state.lastHomeExitAt ? new Date(state.lastHomeExitAt).getTime() : 0;
        const returnedAt = new Date(req.occurredAt).getTime();
        const computedAwayDuration = leftAt > 0 ? Math.floor((returnedAt - leftAt) / 1000) : (req.dwellSeconds ?? 0);

        if (computedAwayDuration >= 3600 && req.movementVerified) {
          const result = await ledgerService.internalCreditPoints(userId, {
            source: 'outside',
            seconds: 1800, // 30 min reward for outdoor activity
            description: `Verified outdoor activity (${Math.round(computedAwayDuration / 60)} min away from home)`,
            deviceId: req.deviceId,
            idempotencyKey: req.idempotencyKey,
          });
          rewardGranted = true;
          balance = result.newBalance;
        }
        state.lastHomeExitAt = undefined;
      }
    }

    return { id, rewardGranted, balance };
  }
}

export const auditService = new AuditService();
