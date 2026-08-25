import { randomUUID } from 'node:crypto';
import type {
  ReportLocationEventRequest,
  ReportProtectionEventRequest,
  TimeBankBalance,
} from '@disciplineos/shared';
import type { LocationEventRow, ProtectionEventRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';
const MAX_LOCATION_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_LOCATION_EVENT_AGE_MS = 24 * 60 * 60 * 1000;

export class AuditService {
  constructor(private readonly store: DisciplineStore) {}

  async recordProtectionEvent(userId: string, request: ReportProtectionEventRequest): Promise<{ id: string }> {
    const event: ProtectionEventRow = {
      id: randomUUID(),
      userId,
      deviceId: request.deviceId,
      eventType: request.eventType,
      details: request.details,
      occurredAt: request.occurredAt,
      createdAt: new Date().toISOString(),
    };
    await this.store.recordProtectionEvent(event);
    return { id: event.id };
  }

  async getProtectionEvents(userId: string, limit = 50): Promise<ProtectionEventRow[]> {
    return this.store.getProtectionEvents(userId, limit);
  }

  async recordLocationEvent(
    userId: string,
    request: ReportLocationEventRequest,
  ): Promise<{ id: string; rewardGranted: boolean; balance?: TimeBankBalance }> {
    const occurredAtMs = Date.parse(request.occurredAt);
    if (!Number.isFinite(occurredAtMs)) {
      throw new Error('Location event occurredAt must be a valid timestamp');
    }
    if (process.env.NODE_ENV === 'production') {
      const now = Date.now();
      if (occurredAtMs > now + MAX_LOCATION_CLOCK_SKEW_MS) {
        throw new Error('Location event timestamp is too far in the future');
      }
      if (occurredAtMs < now - MAX_LOCATION_EVENT_AGE_MS) {
        throw new Error('Location event timestamp is too old to reward');
      }
    }
    const event: LocationEventRow = {
      id: randomUUID(),
      userId,
      deviceId: request.deviceId,
      locationType: request.locationType,
      eventType: request.eventType,
      dwellSeconds: request.dwellSeconds,
      movementVerified: request.movementVerified,
      occurredAt: request.occurredAt,
      idempotencyKey: request.idempotencyKey,
      createdAt: new Date().toISOString(),
    };
    const reward =
      request.locationType === 'gym'
        ? {
            source: 'gym' as const,
            rewardSeconds: 3600,
            minimumDurationSeconds: 1800,
            requiresMovement: true,
            descriptionPrefix: 'Verified gym session',
          }
        : request.locationType === 'home'
          ? {
              source: 'outside' as const,
              rewardSeconds: 1800,
              minimumDurationSeconds: 3600,
              requiresMovement: true,
              descriptionPrefix: 'Verified outdoor activity',
            }
          : undefined;
    return this.store.recordLocationEvent(event, reward);
  }
}
