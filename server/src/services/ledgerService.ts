import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import { config } from '../config.js';
import type {
  TimeBankBalance,
  LedgerTransaction,
  EarnPointsRequest,
  SpendPointsRequest,
  EmergencyUnlockRequest,
} from '@disciplineos/shared';

export class LedgerService {
  /**
   * Get the current time-bank balance for a user, accounting for reserved points.
   */
  async getBalance(userId: string): Promise<TimeBankBalance> {
    const bank = db.timeBanks.get(userId);
    if (!bank) {
      throw new Error('Time bank not found for user');
    }

    const now = new Date().toISOString();
    let reservedSeconds = 0;

    // Sum unexpired active device reserves
    for (const reserve of db.deviceReserves.values()) {
      if (reserve.userId === userId && reserve.remainingSeconds > 0 && reserve.expiresAt > now) {
        reservedSeconds += reserve.remainingSeconds;
      }
    }

    const availableSeconds = Math.max(0, bank.balanceSeconds - reservedSeconds);

    return {
      userId,
      balanceSeconds: bank.balanceSeconds,
      maxSeconds: bank.maxSeconds,
      reservedSeconds,
      availableSeconds,
      lastDecayAt: bank.lastDecayAt,
      updatedAt: bank.updatedAt,
    };
  }

  /**
   * Atomically credit points to the user's ledger with idempotency support.
   */
  async earnPoints(userId: string, req: EarnPointsRequest): Promise<{ transaction: LedgerTransaction; newBalance: TimeBankBalance }> {
    // Check idempotency key
    if (req.idempotencyKey) {
      const existing = db.transactions.find(
        (t) => t.userId === userId && t.idempotencyKey === req.idempotencyKey
      );
      if (existing) {
        const balance = await this.getBalance(userId);
        return { transaction: existing, newBalance: balance };
      }
    }

    const bank = db.timeBanks.get(userId);
    if (!bank) {
      throw new Error('Time bank not found for user');
    }

    const now = new Date().toISOString();
    const targetBalance = bank.balanceSeconds + req.seconds;
    const actualCredit = Math.min(req.seconds, Math.max(0, bank.maxSeconds - bank.balanceSeconds));

    bank.balanceSeconds = Math.min(bank.maxSeconds, targetBalance);
    bank.updatedAt = now;

    const tx: LedgerTransaction = {
      id: randomUUID(),
      userId,
      type: 'earn',
      source: req.source,
      seconds: actualCredit,
      description: req.description ?? `Earned via ${req.source}`,
      deviceId: req.deviceId ?? null,
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
    };

    db.transactions.push(tx);

    const balance = await this.getBalance(userId);
    return { transaction: tx, newBalance: balance };
  }

  /**
   * Atomically spend points from the available balance.
   */
  async spendPoints(userId: string, req: SpendPointsRequest): Promise<{ transaction: LedgerTransaction; newBalance: TimeBankBalance }> {
    // Check idempotency key
    if (req.idempotencyKey) {
      const existing = db.transactions.find(
        (t) => t.userId === userId && t.idempotencyKey === req.idempotencyKey
      );
      if (existing) {
        const balance = await this.getBalance(userId);
        return { transaction: existing, newBalance: balance };
      }
    }

    const balance = await this.getBalance(userId);
    if (balance.availableSeconds < req.seconds) {
      throw new Error(`Insufficient available balance. Requested: ${req.seconds}s, Available: ${balance.availableSeconds}s`);
    }

    const bank = db.timeBanks.get(userId)!;
    const now = new Date().toISOString();

    bank.balanceSeconds -= req.seconds;
    bank.updatedAt = now;

    const tx: LedgerTransaction = {
      id: randomUUID(),
      userId,
      type: 'spend',
      source: 'usage',
      seconds: req.seconds,
      description: `Unlock ${req.targetType}:${req.targetIdentifier}`,
      deviceId: req.deviceId,
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
    };

    db.transactions.push(tx);

    const updatedBalance = await this.getBalance(userId);
    return { transaction: tx, newBalance: updatedBalance };
  }

  /**
   * Emergency unlock with 3x multiplier cost.
   */
  async emergencyUnlock(userId: string, req: EmergencyUnlockRequest): Promise<{ transaction: LedgerTransaction; newBalance: TimeBankBalance }> {
    if (req.idempotencyKey) {
      const existing = db.transactions.find(
        (t) => t.userId === userId && t.idempotencyKey === req.idempotencyKey
      );
      if (existing) {
        const balance = await this.getBalance(userId);
        return { transaction: existing, newBalance: balance };
      }
    }

    const multiplier = req.multiplier || config.defaultEmergencyMultiplier;
    const totalCost = Math.round(req.seconds * multiplier);

    const balance = await this.getBalance(userId);
    if (balance.availableSeconds < totalCost) {
      throw new Error(`Insufficient balance for emergency unlock. Required: ${totalCost}s (3x penalty for ${req.seconds}s access), Available: ${balance.availableSeconds}s`);
    }

    const bank = db.timeBanks.get(userId)!;
    const now = new Date().toISOString();

    bank.balanceSeconds -= totalCost;
    bank.updatedAt = now;

    const tx: LedgerTransaction = {
      id: randomUUID(),
      userId,
      type: 'spend',
      source: 'emergency',
      seconds: totalCost,
      description: `Emergency unlock ${req.targetType}:${req.targetIdentifier} (${req.seconds}s with ${multiplier}x penalty)`,
      deviceId: req.deviceId,
      idempotencyKey: req.idempotencyKey,
      createdAt: now,
    };

    db.transactions.push(tx);

    const updatedBalance = await this.getBalance(userId);
    return { transaction: tx, newBalance: updatedBalance };
  }

  async getTransactions(userId: string, limit = 50): Promise<LedgerTransaction[]> {
    return db.transactions
      .filter((t) => t.userId === userId)
      .slice(-limit)
      .reverse();
  }
}

export const ledgerService = new LedgerService();
