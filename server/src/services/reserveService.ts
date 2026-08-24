import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import { ledgerService } from './ledgerService.js';
import type {
  DeviceReserve,
  AllocateReserveRequest,
  ReconcileReservesRequest,
  ReconcileReservesResponse,
  TimeBankBalance,
  LedgerTransaction,
} from '@disciplineos/shared';

export class ReserveService {
  /**
   * Allocate an offline reserve carved out of the user's available balance.
   */
  async allocateReserve(userId: string, req: AllocateReserveRequest): Promise<DeviceReserve> {
    const balance = await ledgerService.getBalance(userId);
    if (balance.availableSeconds < req.requestedSeconds) {
      throw new Error(`Insufficient available balance for reserve. Requested: ${req.requestedSeconds}s, Available: ${balance.availableSeconds}s`);
    }

    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + req.ttlSeconds * 1000).toISOString();

    const reserve: DeviceReserve = {
      id,
      userId,
      deviceId: req.deviceId,
      reservedSeconds: req.requestedSeconds,
      remainingSeconds: req.requestedSeconds,
      expiresAt,
      createdAt: now.toISOString(),
    };

    db.deviceReserves.set(id, reserve);
    return reserve;
  }

  /**
   * Reconcile offline spend outbox events from a reconnected device.
   */
  async reconcileReserve(userId: string, req: ReconcileReservesRequest): Promise<ReconcileReservesResponse> {
    const reserve = db.deviceReserves.get(req.reserveId);
    if (!reserve || reserve.userId !== userId || reserve.deviceId !== req.deviceId) {
      throw new Error('Device reserve not found or does not belong to this device');
    }

    let reconciledCount = 0;
    let acceptedSeconds = 0;

    for (const event of req.events) {
      // Deduplicate: check if eventId already processed
      if (db.offlineEvents.has(event.eventId)) {
        continue;
      }

      // Record offline event
      db.offlineEvents.set(event.eventId, {
        id: event.eventId,
        userId,
        deviceId: req.deviceId,
        reserveId: req.reserveId,
        targetType: event.targetType,
        targetIdentifier: event.targetIdentifier,
        secondsSpent: event.secondsSpent,
        localTimestamp: event.localTimestamp,
        isEmergency: event.isEmergency,
        reconciledAt: new Date().toISOString(),
      });

      // Record ledger entry
      const tx: LedgerTransaction = {
        id: randomUUID(),
        userId,
        type: 'spend',
        source: 'reserve_reconciliation',
        seconds: event.secondsSpent,
        description: `Offline spend: ${event.targetType}:${event.targetIdentifier} (${event.secondsSpent}s)`,
        deviceId: req.deviceId,
        idempotencyKey: event.eventId,
        createdAt: new Date().toISOString(),
      };
      db.transactions.push(tx);

      // Deduct from actual balance
      const bank = db.timeBanks.get(userId)!;
      bank.balanceSeconds = Math.max(0, bank.balanceSeconds - event.secondsSpent);
      bank.updatedAt = new Date().toISOString();

      reconciledCount++;
      acceptedSeconds += event.secondsSpent;
    }

    // Release remaining unused reserve back to global balance pool
    const releasedUnusedSeconds = Math.max(0, reserve.remainingSeconds - acceptedSeconds);
    reserve.remainingSeconds = 0; // mark reserve fully consumed/closed

    const updatedBalance = await ledgerService.getBalance(userId);

    return {
      reconciledCount,
      acceptedSeconds,
      releasedUnusedSeconds,
      newBalanceSeconds: updatedBalance.balanceSeconds,
    };
  }

  async getActiveReserves(userId: string): Promise<DeviceReserve[]> {
    const reserves: DeviceReserve[] = [];
    const now = new Date().toISOString();
    for (const reserve of db.deviceReserves.values()) {
      if (reserve.userId === userId && reserve.remainingSeconds > 0 && reserve.expiresAt > now) {
        reserves.push({ ...reserve });
      }
    }
    return reserves;
  }
}

export const reserveService = new ReserveService();
