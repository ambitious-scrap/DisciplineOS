import { randomUUID } from 'node:crypto';
import type {
  ReportLocationEventRequest,
  ReportProtectionEventRequest,
  TimeBankBalance,
} from '@disciplineos/shared';
import type { LocationEventRow, ProtectionEventRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';

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
