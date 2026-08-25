import { randomUUID } from 'node:crypto';
import type {
  ReportLocationEventRequest,
  ReportProtectionEventRequest,
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
    deviceId: string,
    request: ReportLocationEventRequest,
  ) {
    const serverReceivedAt = new Date().toISOString();
    const event: LocationEventRow = {
      id: randomUUID(),
      userId,
      deviceId,
      locationSessionId: null,
      locationType: request.locationType,
      placeIdentifier: request.placeIdentifier,
      eventType: request.eventType,
      stepDelta: request.movement?.stepDelta ?? 0,
      activeSeconds: request.movement?.activeSeconds ?? 0,
      sampleCount: request.movement?.sampleCount ?? 0,
      clientOccurredAt: request.clientOccurredAt ?? null,
      clientMonotonicMs: request.clientMonotonicMs ?? null,
      dwellSeconds: undefined,
      movementVerified: false,
      occurredAt: serverReceivedAt,
      idempotencyKey: request.idempotencyKey,
      createdAt: serverReceivedAt,
    };
    return this.store.recordLocationEvidence(event);
  }
}
