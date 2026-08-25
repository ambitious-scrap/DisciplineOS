import { randomUUID } from 'node:crypto';
import type {
  AllocateReserveRequest,
  DeviceReserve,
  ReconcileReservesRequest,
  ReconcileReservesResponse,
} from '@disciplineos/shared';
import type { DeviceReserveRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';

export class ReserveService {
  constructor(private readonly store: DisciplineStore) {}

  private toReserve(reserve: DeviceReserveRow): DeviceReserve {
    return {
      id: reserve.id,
      userId: reserve.userId,
      deviceId: reserve.deviceId,
      reservedSeconds: reserve.reservedSeconds,
      remainingSeconds: reserve.remainingSeconds,
      expiresAt: reserve.expiresAt,
      createdAt: reserve.createdAt,
    };
  }

  async allocateReserve(userId: string, request: AllocateReserveRequest): Promise<DeviceReserve> {
    const reserve: DeviceReserveRow = {
      id: randomUUID(),
      userId,
      deviceId: request.deviceId,
      reservedSeconds: request.requestedSeconds,
      remainingSeconds: request.requestedSeconds,
      expiresAt: new Date(Date.now() + request.ttlSeconds * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      idempotencyKey: request.idempotencyKey,
    };
    return this.toReserve(await this.store.allocateReserve(reserve));
  }

  async reconcileReserve(
    userId: string,
    request: ReconcileReservesRequest,
  ): Promise<ReconcileReservesResponse> {
    return this.store.reconcileReserve(userId, request);
  }

  async getActiveReserves(userId: string): Promise<DeviceReserve[]> {
    const reserves = await this.store.getActiveReserves(userId);
    return reserves.map((reserve) => this.toReserve(reserve));
  }
}
