import { config } from '../config.js';
import type {
  EmergencyUnlockRequest,
  LedgerTransaction,
  SpendPointsRequest,
  TimeBankBalance,
} from '@disciplineos/shared';
import type { DisciplineStore } from '../db/store.js';


export class LedgerService {
  constructor(private readonly store: DisciplineStore) {}

  async getBalance(userId: string): Promise<TimeBankBalance> {
    return this.store.getBalance(userId);
  }


  async spendPoints(
    userId: string,
    request: SpendPointsRequest & { deviceId: string },
  ): Promise<{ transaction: LedgerTransaction; newBalance: TimeBankBalance }> {
    const result = await this.store.spendPoints(userId, {
      seconds: request.seconds,
      targetType: request.targetType,
      targetIdentifier: request.targetIdentifier,
      deviceId: request.deviceId,
      idempotencyKey: request.idempotencyKey,
      source: 'usage',
    });
    return { transaction: result.transaction, newBalance: result.balance };
  }

  async emergencyUnlock(
    userId: string,
    request: EmergencyUnlockRequest & { deviceId: string },
  ): Promise<{ transaction: LedgerTransaction; newBalance: TimeBankBalance }> {
    const multiplier = config.defaultEmergencyMultiplier;
    const totalCost = Math.round(request.seconds * multiplier);
    const result = await this.store.spendPoints(userId, {
      seconds: totalCost,
      targetType: request.targetType,
      targetIdentifier: request.targetIdentifier,
      deviceId: request.deviceId,
      idempotencyKey: request.idempotencyKey,
      source: 'emergency',
      description: `Emergency unlock ${request.targetType}:${request.targetIdentifier} (${request.seconds}s with ${multiplier}x penalty)`,
    });
    return { transaction: result.transaction, newBalance: result.balance };
  }

  async getTransactions(userId: string, limit = 50): Promise<LedgerTransaction[]> {
    return this.store.getTransactions(userId, limit);
  }
}
