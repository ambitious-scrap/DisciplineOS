import { randomUUID } from 'node:crypto';
import type {
  AbandonFocusSessionRequest,
  CompleteFocusSessionRequest,
  FocusHeartbeatRequest,
  FocusSession,
  StartFocusSessionRequest,
} from '@disciplineos/shared';
import type { FocusSessionRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';
export class FocusService {
  constructor(private readonly store: DisciplineStore) {}

  private toSession(row: FocusSessionRow): FocusSession {
    return {
      id: row.id,
      userId: row.userId,
      deviceId: row.deviceId,
      associatedTaskId: row.associatedTaskId,
      plannedDurationSeconds: row.plannedDurationSeconds,
      serverStartedAt: row.serverStartedAt,
      serverCompletedAt: row.serverCompletedAt,
      lastHeartbeatAt: row.lastHeartbeatAt,
      clientStartedMonotonicMs: row.clientStartedMonotonicMs,
      status: row.status,
      observedDurationSeconds: row.observedDurationSeconds,
      rewardSeconds: row.rewardSeconds,
      rewardClaimed: row.rewardClaimed,
      createdAt: row.createdAt,
    };
  }

  async start(
    userId: string,
    deviceId: string,
    request: StartFocusSessionRequest,
  ): Promise<FocusSession> {
    if (request.associatedTaskId) {
      const task = await this.store.getTask(userId, request.associatedTaskId);
      if (!task || task.evidenceType !== 'focus_timer') {
        throw new Error('Focus session task must be an active focus_timer task owned by this user');
      }
    }
    const row = await this.store.startFocusSession({
      id: randomUUID(),
      userId,
      deviceId,
      associatedTaskId: request.associatedTaskId ?? null,
      plannedDurationSeconds: request.plannedDurationSeconds,
      clientStartedMonotonicMs: request.clientStartedMonotonicMs ?? null,
      idempotencyKey: request.idempotencyKey,
    });
    return this.toSession(row);
  }

  async heartbeat(
    userId: string,
    deviceId: string,
    sessionId: string,
    request: FocusHeartbeatRequest,
  ): Promise<FocusSession> {
    const row = await this.store.heartbeatFocusSession({ userId, deviceId, sessionId });
    return this.toSession(row);
  }

  async complete(
    userId: string,
    deviceId: string,
    sessionId: string,
    request: CompleteFocusSessionRequest,
  ): Promise<{ session: FocusSession; balance?: Awaited<ReturnType<DisciplineStore['getBalance']>> }> {
    const result = await this.store.completeFocusSession({
      userId,
      deviceId,
      sessionId,
      idempotencyKey: request.idempotencyKey,
    });
    return {
      session: this.toSession(result.session),
      balance: result.balance,
    };
  }

  async abandon(
    userId: string,
    deviceId: string,
    sessionId: string,
    request: AbandonFocusSessionRequest,
  ): Promise<FocusSession> {
    const row = await this.store.abandonFocusSession({
      userId,
      deviceId,
      sessionId,
      idempotencyKey: request.idempotencyKey,
    });
    return this.toSession(row);
  }

  async get(userId: string, deviceId: string, sessionId: string): Promise<FocusSession | null> {
    const row = await this.store.getFocusSession(userId, sessionId);
    if (!row || row.deviceId !== deviceId) return null;
    return this.toSession(row);
  }
}
