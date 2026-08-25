import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  DevicePlatform,
  LocationEventType,
  PolicyChangeAction,
  ReconcileReservesRequest,
  ReconcileReservesResponse,
  TimeBankBalance,
  TransactionSource,
  TransactionType,
} from '@disciplineos/shared';
import type {
  ActiveUnlockRow,
  BlockedAppRow,
  BlockedSiteRow,
  DeviceReserveRow,
  DeviceRow,
  LocationEventRow,
  PendingPolicyChangeRow,
  ProtectionEventRow,
  TaskOccurrenceRow,
  TaskRow,
  TimeBankRow,
  TransactionRow,
  UserRow,
} from './interfaces.js';
import type {
  CreditPointsInput,
  DisciplineStore,
  LocationEventResult,
  LocationRewardRule,
  SpendPointsInput,
  UnlockSessionInput,
} from './store.js';

type DbRow = Record<string, unknown>;
type Queryable = Pool | PoolClient;

function text(row: DbRow, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new Error(`Database column ${key} was not text`);
  }
  return value;
}

function optionalText(row: DbRow, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
}

function numberValue(row: DbRow, key: string): number {
  const value = row[key];
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Database column ${key} was not numeric`);
  }
  return number;
}

function booleanValue(row: DbRow, key: string): boolean {
  return row[key] === true;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

export class PostgresStore implements DisciplineStore {
  constructor(private readonly pool: Pool) {}

  private async query(sql: string, values: readonly unknown[] = []): Promise<DbRow[]> {
    const result = await this.pool.query<DbRow>({ text: sql, values: [...values] });
    return result.rows;
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async queryOn(client: Queryable, sql: string, values: readonly unknown[] = []): Promise<DbRow[]> {
    const result = await client.query<DbRow>({ text: sql, values: [...values] });
    return result.rows;
  }

  private mapUser(row: DbRow): UserRow {
    return {
      id: text(row, 'id'),
      email: text(row, 'email'),
      passwordHash: text(row, 'password_hash'),
      createdAt: iso(row.created_at),
    };
  }

  private mapDevice(row: DbRow): DeviceRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      name: text(row, 'name'),
      platform: text(row, 'platform') as DevicePlatform,
      pushToken: optionalText(row, 'push_token'),
      lastSeenAt: iso(row.last_seen_at),
      isEnforced: booleanValue(row, 'is_enforced'),
      createdAt: iso(row.created_at),
    };
  }

  private mapBank(row: DbRow, reservedSeconds = 0): TimeBankBalance {
    const balanceSeconds = numberValue(row, 'balance_seconds');
    return {
      userId: text(row, 'user_id'),
      balanceSeconds,
      maxSeconds: numberValue(row, 'max_seconds'),
      reservedSeconds,
      availableSeconds: Math.max(0, balanceSeconds - reservedSeconds),
      lastDecayAt: iso(row.last_decay_at),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapTransaction(row: DbRow): TransactionRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      type: text(row, 'type') as TransactionType,
      source: text(row, 'source') as TransactionSource,
      seconds: numberValue(row, 'seconds'),
      description: optionalText(row, 'description'),
      deviceId: optionalText(row, 'device_id'),
      idempotencyKey: optionalText(row, 'idempotency_key'),
      createdAt: iso(row.created_at),
    };
  }

  private mapTask(row: DbRow): TaskRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      title: text(row, 'title'),
      description: optionalText(row, 'description'),
      rewardSeconds: numberValue(row, 'reward_seconds'),
      evidenceType: text(row, 'evidence_type') as TaskRow['evidenceType'],
      isRecurring: booleanValue(row, 'is_recurring'),
      recurrenceCron: optionalText(row, 'recurrence_cron'),
      isActive: booleanValue(row, 'is_active'),
      createdAt: iso(row.created_at),
    };
  }

  private mapOccurrence(row: DbRow): TaskOccurrenceRow {
    return {
      id: text(row, 'id'),
      taskId: text(row, 'task_id'),
      userId: text(row, 'user_id'),
      occurrenceDate: String(row.occurrence_date),
      completedAt: nullableIso(row.completed_at),
      evidenceUrl: optionalText(row, 'evidence_url'),
      evidenceSha256: optionalText(row, 'evidence_sha256'),
      rewardClaimed: booleanValue(row, 'reward_claimed'),
      createdAt: iso(row.created_at),
      idempotencyKey: text(row, 'idempotency_key'),
    };
  }

  private mapBlockedApp(row: DbRow): BlockedAppRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      platform: text(row, 'platform') as DevicePlatform,
      identifier: text(row, 'identifier'),
      displayName: text(row, 'display_name'),
      isActive: booleanValue(row, 'is_active'),
      createdAt: iso(row.created_at),
    };
  }

  private mapBlockedSite(row: DbRow): BlockedSiteRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      domain: text(row, 'domain'),
      isActive: booleanValue(row, 'is_active'),
      createdAt: iso(row.created_at),
    };
  }

  private mapPendingChange(row: DbRow): PendingPolicyChangeRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      action: text(row, 'action') as PolicyChangeAction,
      targetId: text(row, 'target_id'),
      targetDescription: text(row, 'target_description'),
      requestedAt: iso(row.requested_at),
      effectiveAt: iso(row.effective_at),
      isCancelled: booleanValue(row, 'is_cancelled'),
      isExecuted: booleanValue(row, 'is_executed'),
    };
  }

  private mapUnlock(row: DbRow): ActiveUnlockRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'),
      unlockType: text(row, 'unlock_type') as ActiveUnlockRow['unlockType'],
      identifier: text(row, 'identifier'),
      durationSeconds: numberValue(row, 'duration_seconds'),
      startedAt: iso(row.started_at),
      expiresAt: iso(row.expires_at),
      isEmergency: booleanValue(row, 'is_emergency'),
      leaseSignature: text(row, 'lease_signature'),
      status: text(row, 'status') as ActiveUnlockRow['status'],
      idempotencyKey: text(row, 'idempotency_key'),
    };
  }

  private mapReserve(row: DbRow): DeviceReserveRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'),
      reservedSeconds: numberValue(row, 'reserved_seconds'),
      remainingSeconds: numberValue(row, 'remaining_seconds'),
      expiresAt: iso(row.expires_at),
      createdAt: iso(row.created_at),
      idempotencyKey: text(row, 'idempotency_key'),
    };
  }

  private mapProtectionEvent(row: DbRow): ProtectionEventRow {
    const details = row.details;
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'),
      eventType: text(row, 'event_type') as ProtectionEventRow['eventType'],
      details: details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined,
      occurredAt: iso(row.occurred_at),
      createdAt: iso(row.created_at),
    };
  }

  private mapLocationEvent(row: DbRow): LocationEventRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'),
      locationType: text(row, 'location_type') as LocationEventRow['locationType'],
      eventType: text(row, 'event_type') as LocationEventType,
      dwellSeconds: row.dwell_seconds === null || row.dwell_seconds === undefined
        ? undefined
        : numberValue(row, 'dwell_seconds'),
      movementVerified: booleanValue(row, 'movement_verified'),
      occurredAt: iso(row.occurred_at),
      idempotencyKey: text(row, 'idempotency_key'),
      createdAt: iso(row.created_at),
    };
  }

  private async balanceOn(client: Queryable, userId: string): Promise<TimeBankBalance> {
    const rows = await this.queryOn(
      client,
      `SELECT tb.user_id, tb.balance_seconds, tb.max_seconds, tb.last_decay_at, tb.updated_at,
              COALESCE(SUM(CASE WHEN dr.remaining_seconds > 0 AND dr.expires_at > NOW()
                                THEN dr.remaining_seconds ELSE 0 END), 0) AS reserved_seconds
         FROM time_banks tb
         LEFT JOIN device_reserves dr ON dr.user_id = tb.user_id
        WHERE tb.user_id = $1
        GROUP BY tb.user_id, tb.balance_seconds, tb.max_seconds, tb.last_decay_at, tb.updated_at`,
      [userId],
    );
    if (rows.length === 0) throw new Error('Time bank not found for user');
    return this.mapBank(rows[0], numberValue(rows[0], 'reserved_seconds'));
  }

  private async availableOn(client: Queryable, userId: string, bankBalance: number): Promise<number> {
    const rows = await this.queryOn(
      client,
      `SELECT COALESCE(SUM(remaining_seconds), 0) AS reserved_seconds
         FROM device_reserves
        WHERE user_id = $1 AND remaining_seconds > 0 AND expires_at > NOW()`,
      [userId],
    );
    return Math.max(0, bankBalance - numberValue(rows[0], 'reserved_seconds'));
  }

  async registerUser(user: UserRow, timeBank: TimeBankRow): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `INSERT INTO users (id, email, password_hash, created_at)
         VALUES ($1, $2, $3, $4)`,
        [user.id, user.email, user.passwordHash, user.createdAt],
      );
      await client.query(
        `INSERT INTO time_banks (user_id, balance_seconds, max_seconds, last_decay_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [timeBank.userId, timeBank.balanceSeconds, timeBank.maxSeconds, timeBank.lastDecayAt, timeBank.updatedAt],
      );
    });
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    const rows = await this.query(
      `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`,
      [email],
    );
    return rows.length === 0 ? null : this.mapUser(rows[0]);
  }

  async getUserById(userId: string): Promise<UserRow | null> {
    const rows = await this.query(
      `SELECT id, email, password_hash, created_at FROM users WHERE id = $1`,
      [userId],
    );
    return rows.length === 0 ? null : this.mapUser(rows[0]);
  }

  async createDevice(device: DeviceRow): Promise<void> {
    await this.query(
      `INSERT INTO devices (id, user_id, name, platform, push_token, last_seen_at, is_enforced, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [device.id, device.userId, device.name, device.platform, device.pushToken, device.lastSeenAt, device.isEnforced, device.createdAt],
    );
  }

  async getDevices(userId: string): Promise<DeviceRow[]> {
    const rows = await this.query(
      `SELECT id, user_id, name, platform, push_token, last_seen_at, is_enforced, created_at
         FROM devices WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
    return rows.map((row) => this.mapDevice(row));
  }

  async getBalance(userId: string): Promise<TimeBankBalance> {
    return this.balanceOn(this.pool, userId);
  }

  async creditPoints(
    userId: string,
    input: CreditPointsInput,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }> {
    return this.transaction(async (client) => {
      const bankRows = await this.queryOn(
        client,
        `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
           FROM time_banks WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (bankRows.length === 0) throw new Error('Time bank not found for user');
      if (input.idempotencyKey) {
        const existingRows = await this.queryOn(
          client,
          `SELECT id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at
             FROM ledger_transactions WHERE user_id = $1 AND idempotency_key = $2`,
          [userId, input.idempotencyKey],
        );
        if (existingRows.length > 0) {
          return { transaction: this.mapTransaction(existingRows[0]), balance: await this.balanceOn(client, userId) };
        }
      }
      const bank = bankRows[0];
      const currentBalance = numberValue(bank, 'balance_seconds');
      const maxBalance = numberValue(bank, 'max_seconds');
      const actualCredit = Math.min(input.seconds, Math.max(0, maxBalance - currentBalance));
      const now = new Date().toISOString();
      await client.query(
        `UPDATE time_banks SET balance_seconds = balance_seconds + $2, updated_at = $3 WHERE user_id = $1`,
        [userId, actualCredit, now],
      );
      const rows = await this.queryOn(
        client,
        `INSERT INTO ledger_transactions
           (id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at)
         VALUES ($1, $2, 'earn', $3, $4, $5, $6, $7, $8)
         RETURNING id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at`,
        [randomUUID(), userId, input.source, actualCredit, input.description ?? `Earned via ${input.source}`, input.deviceId ?? null, input.idempotencyKey ?? null, now],
      );
      return { transaction: this.mapTransaction(rows[0]), balance: await this.balanceOn(client, userId) };
    });
  }

  async spendPoints(
    userId: string,
    input: SpendPointsInput,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }> {
    return this.transaction(async (client) => {
      const bankRows = await this.queryOn(
        client,
        `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
           FROM time_banks WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const deviceRows = await this.queryOn(
        client,
        `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
        [input.deviceId, userId],
      );
      if (deviceRows.length === 0) throw new Error('Device does not belong to this user');
      const existingRows = await this.queryOn(
        client,
        `SELECT id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at
           FROM ledger_transactions WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, input.idempotencyKey],
      );
      if (existingRows.length > 0) {
        return { transaction: this.mapTransaction(existingRows[0]), balance: await this.balanceOn(client, userId) };
      }
      const bankBalance = numberValue(bankRows[0], 'balance_seconds');
      const available = await this.availableOn(client, userId, bankBalance);
      if (available < input.seconds) {
        throw new Error(`Insufficient available balance. Requested: ${input.seconds}s, Available: ${available}s`);
      }
      const now = new Date().toISOString();
      const updated = await client.query(
        `UPDATE time_banks
            SET balance_seconds = balance_seconds - $2, updated_at = $3
          WHERE user_id = $1 AND balance_seconds >= $2`,
        [userId, input.seconds, now],
      );
      if (updated.rowCount !== 1) throw new Error('Time bank balance changed; spend was rejected');
      const rows = await this.queryOn(
        client,
        `INSERT INTO ledger_transactions
           (id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at)
         VALUES ($1, $2, 'spend', $3, $4, $5, $6, $7, $8)
         RETURNING id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at`,
        [randomUUID(), userId, input.source ?? 'usage', input.seconds, input.description ?? `Unlock ${input.targetType}:${input.targetIdentifier}`, input.deviceId, input.idempotencyKey, now],
      );
      return { transaction: this.mapTransaction(rows[0]), balance: await this.balanceOn(client, userId) };
    });
  }

  async getTransactions(userId: string, limit: number): Promise<TransactionRow[]> {
    const rows = await this.query(
      `SELECT id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at
         FROM ledger_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => this.mapTransaction(row));
  }

  async createUnlockSession(input: UnlockSessionInput): Promise<ActiveUnlockRow> {
    return this.transaction(async (client) => {
      const replayRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
                is_emergency, lease_signature, status, idempotency_key
           FROM active_unlocks WHERE user_id = $1 AND idempotency_key = $2`,
        [input.userId, input.idempotencyKey],
      );
      if (replayRows.length > 0) return this.mapUnlock(replayRows[0]);

      const bankRows = await this.queryOn(
        client,
        `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
           FROM time_banks WHERE user_id = $1 FOR UPDATE`,
        [input.userId],
      );
      if (bankRows.length === 0) throw new Error('Time bank not found for user');
      const deviceRows = await this.queryOn(
        client,
        `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
        [input.deviceId, input.userId],
      );
      if (deviceRows.length === 0) throw new Error('Device does not belong to this user');
      await client.query(
        `UPDATE active_unlocks SET status = 'expired'
          WHERE user_id = $1 AND status = 'active' AND expires_at <= NOW()`,
        [input.userId],
      );
      const activeRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
                is_emergency, lease_signature, status, idempotency_key
           FROM active_unlocks WHERE user_id = $1 AND status = 'active'`,
        [input.userId],
      );
      if (activeRows.length > 0) {
        const active = this.mapUnlock(activeRows[0]);
        throw new Error(
          `Another session is currently active on device ${active.deviceId} (expires at ${active.expiresAt})`,
        );
      }

      if (input.costSeconds > 0) {
        const existingTransaction = await this.queryOn(
          client,
          `SELECT id FROM ledger_transactions WHERE user_id = $1 AND idempotency_key = $2`,
          [input.userId, input.idempotencyKey],
        );
        if (existingTransaction.length > 0) {
          throw new Error('Idempotency key is already used by another transaction');
        }
        const bankBalance = numberValue(bankRows[0], 'balance_seconds');
        const available = await this.availableOn(client, input.userId, bankBalance);
        if (available < input.costSeconds) {
          throw new Error(`Insufficient available balance. Requested: ${input.costSeconds}s, Available: ${available}s`);
        }
        const now = new Date().toISOString();
        await client.query(
          `UPDATE time_banks SET balance_seconds = balance_seconds - $2, updated_at = $3
            WHERE user_id = $1 AND balance_seconds >= $2`,
          [input.userId, input.costSeconds, now],
        );
        await client.query(
          `INSERT INTO ledger_transactions
             (id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at)
           VALUES ($1, $2, 'spend', $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), input.userId, input.ledgerSource ?? 'usage', input.costSeconds, input.ledgerDescription, input.deviceId, input.idempotencyKey, now],
        );
      }

      const rows = await this.queryOn(
        client,
        `INSERT INTO active_unlocks
           (id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
            is_emergency, lease_signature, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11)
         RETURNING id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
                   is_emergency, lease_signature, status, idempotency_key`,
        [input.id, input.userId, input.deviceId, input.unlockType, input.identifier, input.durationSeconds, input.startedAt, input.expiresAt, input.isEmergency, input.leaseSignature, input.idempotencyKey],
      );
      return this.mapUnlock(rows[0]);
    });
  }

  async getActiveUnlock(userId: string): Promise<ActiveUnlockRow | null> {
    return this.transaction(async (client) => {
      await client.query(
        `UPDATE active_unlocks SET status = 'expired'
          WHERE user_id = $1 AND status = 'active' AND expires_at <= NOW()`,
        [userId],
      );
      const rows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
                is_emergency, lease_signature, status, idempotency_key
           FROM active_unlocks WHERE user_id = $1 AND status = 'active'`,
        [userId],
      );
      return rows.length === 0 ? null : this.mapUnlock(rows[0]);
    });
  }

  async releaseUnlock(userId: string, sessionId: string, deviceId: string): Promise<boolean> {
    return this.transaction(async (client) => {
      const rows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
                is_emergency, lease_signature, status, idempotency_key
           FROM active_unlocks WHERE id = $1 FOR UPDATE`,
        [sessionId],
      );
      if (rows.length === 0 || text(rows[0], 'user_id') !== userId) return false;
      const session = this.mapUnlock(rows[0]);
      if (session.status !== 'active' || new Date(session.expiresAt).getTime() <= Date.now()) {
        if (session.status === 'active') {
          await client.query(`UPDATE active_unlocks SET status = 'expired' WHERE id = $1`, [sessionId]);
        }
        return false;
      }
      if (session.deviceId !== deviceId) {
        throw new Error('Session can only be released by the owning device');
      }
      const result = await client.query(
        `UPDATE active_unlocks SET status = 'released'
          WHERE id = $1 AND user_id = $2 AND device_id = $3 AND status = 'active'`,
        [sessionId, userId, deviceId],
      );
      return result.rowCount === 1;
    });
  }

  async getTasks(userId: string): Promise<TaskRow[]> {
    const rows = await this.query(
      `SELECT id, user_id, title, description, reward_seconds, evidence_type, is_recurring,
              recurrence_cron, is_active, created_at
         FROM tasks WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at ASC`,
      [userId],
    );
    return rows.map((row) => this.mapTask(row));
  }

  async getTask(userId: string, taskId: string): Promise<TaskRow | null> {
    const rows = await this.query(
      `SELECT id, user_id, title, description, reward_seconds, evidence_type, is_recurring,
              recurrence_cron, is_active, created_at
         FROM tasks WHERE id = $1 AND user_id = $2`,
      [taskId, userId],
    );
    return rows.length === 0 ? null : this.mapTask(rows[0]);
  }

  async createTask(task: TaskRow): Promise<void> {
    await this.query(
      `INSERT INTO tasks
         (id, user_id, title, description, reward_seconds, evidence_type, is_recurring, recurrence_cron, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [task.id, task.userId, task.title, task.description, task.rewardSeconds, task.evidenceType, task.isRecurring, task.recurrenceCron, task.isActive, task.createdAt],
    );
  }

  async completeTaskOccurrence(
    userId: string,
    taskId: string,
    occurrence: TaskOccurrenceRow,
    credit: CreditPointsInput,
  ): Promise<{ occurrence: TaskOccurrenceRow; balance: TimeBankBalance }> {
    return this.transaction(async (client) => {
      const taskRows = await this.queryOn(
        client,
        `SELECT id FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [taskId, userId],
      );
      if (taskRows.length === 0) throw new Error('Task not found');
      const existingRows = await this.queryOn(
        client,
        `SELECT id, task_id, user_id, occurrence_date, completed_at, evidence_url, evidence_sha256,
                reward_claimed, created_at, idempotency_key
           FROM task_occurrences WHERE task_id = $1 AND occurrence_date = $2`,
        [taskId, occurrence.occurrenceDate],
      );
      if (existingRows.length > 0) {
        const existing = this.mapOccurrence(existingRows[0]);
        if (existing.idempotencyKey === occurrence.idempotencyKey) {
          return { occurrence: existing, balance: await this.balanceOn(client, userId) };
        }
        throw new Error('Reward has already been claimed for this task occurrence date');
      }
      const existingTransaction = await this.queryOn(
        client,
        `SELECT id FROM ledger_transactions WHERE user_id = $1 AND idempotency_key = $2`,
        [userId, credit.idempotencyKey],
      );
      if (existingTransaction.length > 0) throw new Error('Idempotency key is already used by another transaction');
      const bankRows = await this.queryOn(
        client,
        `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
           FROM time_banks WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (bankRows.length === 0) throw new Error('Time bank not found for user');
      const bankBalance = numberValue(bankRows[0], 'balance_seconds');
      const maxBalance = numberValue(bankRows[0], 'max_seconds');
      const actualCredit = Math.min(credit.seconds, Math.max(0, maxBalance - bankBalance));
      const now = new Date().toISOString();
      const occurrenceRows = await this.queryOn(
        client,
        `INSERT INTO task_occurrences
           (id, task_id, user_id, occurrence_date, completed_at, evidence_url, evidence_sha256,
            reward_claimed, created_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, task_id, user_id, occurrence_date, completed_at, evidence_url, evidence_sha256,
                   reward_claimed, created_at, idempotency_key`,
        [occurrence.id, taskId, userId, occurrence.occurrenceDate, occurrence.completedAt, occurrence.evidenceUrl, occurrence.evidenceSha256, occurrence.rewardClaimed, occurrence.createdAt, occurrence.idempotencyKey],
      );
      await client.query(
        `UPDATE time_banks SET balance_seconds = balance_seconds + $2, updated_at = $3 WHERE user_id = $1`,
        [userId, actualCredit, now],
      );
      await client.query(
        `INSERT INTO ledger_transactions
           (id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at)
         VALUES ($1, $2, 'earn', $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), userId, credit.source, actualCredit, credit.description, credit.deviceId ?? null, credit.idempotencyKey, now],
      );
      return { occurrence: this.mapOccurrence(occurrenceRows[0]), balance: await this.balanceOn(client, userId) };
    });
  }

  private async applyPendingChanges(userId: string): Promise<void> {
    await this.transaction(async (client) => {
      const rows = await this.queryOn(
        client,
        `SELECT id, user_id, action, target_id, target_description, requested_at, effective_at,
                is_cancelled, is_executed
           FROM pending_policy_changes
          WHERE user_id = $1 AND is_cancelled = FALSE AND is_executed = FALSE AND effective_at <= NOW()
          FOR UPDATE`,
        [userId],
      );
      for (const row of rows) {
        const change = this.mapPendingChange(row);
        if (change.action === 'unblock_app') {
          await client.query(`UPDATE blocked_apps SET is_active = FALSE WHERE id = $1 AND user_id = $2`, [change.targetId, userId]);
        } else if (change.action === 'unblock_site') {
          await client.query(`UPDATE blocked_sites SET is_active = FALSE WHERE id = $1 AND user_id = $2`, [change.targetId, userId]);
        }
        await client.query(`UPDATE pending_policy_changes SET is_executed = TRUE WHERE id = $1`, [change.id]);
      }
    });
  }

  async getPolicy(userId: string) {
    await this.applyPendingChanges(userId);
    const [appRows, siteRows] = await Promise.all([
      this.query(
        `SELECT id, user_id, platform, identifier, display_name, is_active, created_at
           FROM blocked_apps WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at ASC`,
        [userId],
      ),
      this.query(
        `SELECT id, user_id, domain, is_active, created_at
           FROM blocked_sites WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at ASC`,
        [userId],
      ),
    ]);
    const blockedApps = appRows.map((row) => this.mapBlockedApp(row));
    const blockedSites = siteRows.map((row) => this.mapBlockedSite(row));
    return {
      version: blockedApps.length + blockedSites.length + 1,
      updatedAt: new Date().toISOString(),
      blockedApps,
      blockedSites,
    };
  }

  async addBlockedApp(app: BlockedAppRow): Promise<BlockedAppRow> {
    return this.transaction(async (client) => {
      const rows = await this.queryOn(
        client,
        `INSERT INTO blocked_apps (id, user_id, platform, identifier, display_name, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6)
         ON CONFLICT (user_id, platform, identifier)
         DO UPDATE SET display_name = EXCLUDED.display_name, is_active = TRUE
         RETURNING id, user_id, platform, identifier, display_name, is_active, created_at`,
        [app.id, app.userId, app.platform, app.identifier, app.displayName, app.createdAt],
      );
      await client.query(
        `UPDATE pending_policy_changes SET is_cancelled = TRUE
          WHERE user_id = $1 AND target_id = $2 AND is_cancelled = FALSE AND is_executed = FALSE`,
        [app.userId, text(rows[0], 'id')],
      );
      return this.mapBlockedApp(rows[0]);
    });
  }

  async addBlockedSite(site: BlockedSiteRow): Promise<BlockedSiteRow> {
    return this.transaction(async (client) => {
      const rows = await this.queryOn(
        client,
        `INSERT INTO blocked_sites (id, user_id, domain, is_active, created_at)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (user_id, domain)
         DO UPDATE SET is_active = TRUE
         RETURNING id, user_id, domain, is_active, created_at`,
        [site.id, site.userId, site.domain, site.createdAt],
      );
      await client.query(
        `UPDATE pending_policy_changes SET is_cancelled = TRUE
          WHERE user_id = $1 AND target_id = $2 AND is_cancelled = FALSE AND is_executed = FALSE`,
        [site.userId, text(rows[0], 'id')],
      );
      return this.mapBlockedSite(rows[0]);
    });
  }

  async requestPolicyRemoval(input: {
    userId: string;
    action: PolicyChangeAction;
    targetId: string;
    targetDescription: string;
    effectiveAt: string;
  }): Promise<PendingPolicyChangeRow> {
    return this.transaction(async (client) => {
      const targetTable = input.action === 'unblock_app' ? 'blocked_apps' : 'blocked_sites';
      const targetRows = await this.queryOn(
        client,
        `SELECT id, user_id FROM ${targetTable} WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [input.targetId, input.userId],
      );
      if (targetRows.length === 0) {
        throw new Error(input.action === 'unblock_app' ? 'Blocked app not found' : 'Blocked site not found');
      }
      const existingRows = await this.queryOn(
        client,
        `SELECT id, user_id, action, target_id, target_description, requested_at, effective_at,
                is_cancelled, is_executed
           FROM pending_policy_changes
          WHERE user_id = $1 AND target_id = $2 AND is_cancelled = FALSE AND is_executed = FALSE`,
        [input.userId, input.targetId],
      );
      if (existingRows.length > 0) return this.mapPendingChange(existingRows[0]);
      const rows = await this.queryOn(
        client,
        `INSERT INTO pending_policy_changes
           (id, user_id, action, target_id, target_description, requested_at, effective_at, is_cancelled, is_executed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, FALSE)
         RETURNING id, user_id, action, target_id, target_description, requested_at, effective_at,
                   is_cancelled, is_executed`,
        [randomUUID(), input.userId, input.action, input.targetId, input.targetDescription, new Date().toISOString(), input.effectiveAt],
      );
      return this.mapPendingChange(rows[0]);
    });
  }

  async getPendingPolicyChanges(userId: string): Promise<PendingPolicyChangeRow[]> {
    await this.applyPendingChanges(userId);
    const rows = await this.query(
      `SELECT id, user_id, action, target_id, target_description, requested_at, effective_at,
              is_cancelled, is_executed
         FROM pending_policy_changes
        WHERE user_id = $1 AND is_cancelled = FALSE AND is_executed = FALSE
        ORDER BY effective_at ASC`,
      [userId],
    );
    return rows.map((row) => this.mapPendingChange(row));
  }

  async cancelPendingPolicyChange(userId: string, changeId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE pending_policy_changes SET is_cancelled = TRUE
        WHERE id = $1 AND user_id = $2 AND is_cancelled = FALSE AND is_executed = FALSE`,
      [changeId, userId],
    );
    return result.rowCount === 1;
  }

  async allocateReserve(reserve: DeviceReserveRow): Promise<DeviceReserveRow> {
    return this.transaction(async (client) => {
      const bankRows = await this.queryOn(
        client,
        `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
           FROM time_banks WHERE user_id = $1 FOR UPDATE`,
        [reserve.userId],
      );
      if (bankRows.length === 0) throw new Error('Time bank not found for user');
      const replayRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, reserved_seconds, remaining_seconds, expires_at, created_at, idempotency_key
           FROM device_reserves WHERE user_id = $1 AND idempotency_key = $2`,
        [reserve.userId, reserve.idempotencyKey],
      );
      if (replayRows.length > 0) return this.mapReserve(replayRows[0]);
      const deviceRows = await this.queryOn(
        client,
        `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
        [reserve.deviceId, reserve.userId],
      );
      if (deviceRows.length === 0) throw new Error('Device reserve not found or does not belong to this user');
      const available = await this.availableOn(client, reserve.userId, numberValue(bankRows[0], 'balance_seconds'));
      if (available < reserve.reservedSeconds) {
        throw new Error(`Insufficient available balance for reserve. Requested: ${reserve.reservedSeconds}s, Available: ${available}s`);
      }
      const rows = await this.queryOn(
        client,
        `INSERT INTO device_reserves
           (id, user_id, device_id, reserved_seconds, remaining_seconds, expires_at, created_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, user_id, device_id, reserved_seconds, remaining_seconds, expires_at, created_at, idempotency_key`,
        [reserve.id, reserve.userId, reserve.deviceId, reserve.reservedSeconds, reserve.remainingSeconds, reserve.expiresAt, reserve.createdAt, reserve.idempotencyKey],
      );
      return this.mapReserve(rows[0]);
    });
  }

  async reconcileReserve(
    userId: string,
    input: ReconcileReservesRequest,
  ): Promise<ReconcileReservesResponse> {
    return this.transaction(async (client) => {
      const reserveRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, reserved_seconds, remaining_seconds, expires_at, created_at, idempotency_key
           FROM device_reserves WHERE id = $1 AND user_id = $2 AND device_id = $3 FOR UPDATE`,
        [input.reserveId, userId, input.deviceId],
      );
      if (reserveRows.length === 0) throw new Error('Device reserve not found or does not belong to this authenticated device');
      const reserve = this.mapReserve(reserveRows[0]);
      const bankRows = await this.queryOn(
        client,
        `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
           FROM time_banks WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (bankRows.length === 0) throw new Error('Time bank not found for user');

      const uniqueEvents = [...new Map(input.events.map((event) => [event.eventId, event])).values()];
      const eventIds = uniqueEvents.map((event) => event.eventId);
      const existingRows = eventIds.length === 0
        ? []
        : await this.queryOn(client, `SELECT id FROM offline_events WHERE id = ANY($1::uuid[])`, [eventIds]);
      const existingIds = new Set(existingRows.map((row) => text(row, 'id')));
      const newEvents = uniqueEvents.filter((event) => !existingIds.has(event.eventId));
      for (const event of newEvents) {
        if (event.deviceId !== input.deviceId) throw new Error('Offline event device mismatch');
      }
      const totalNewSeconds = newEvents.reduce((total, event) => total + event.secondsSpent, 0);
      if (totalNewSeconds > reserve.remainingSeconds) {
        throw new Error(`Offline spend invariant violated: Total claimed seconds (${totalNewSeconds}s) exceeds available reserve (${reserve.remainingSeconds}s)`);
      }
      const bankBalance = numberValue(bankRows[0], 'balance_seconds');
      if (totalNewSeconds > bankBalance) throw new Error('Offline spend would make the time bank negative');
      let acceptedSeconds = 0;
      for (const event of newEvents) {
        const now = new Date().toISOString();
        await client.query(
          `INSERT INTO offline_events
             (id, user_id, device_id, reserve_id, target_type, target_identifier, seconds_spent,
              local_timestamp, is_emergency, reconciled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [event.eventId, userId, input.deviceId, input.reserveId, event.targetType, event.targetIdentifier, event.secondsSpent, event.localTimestamp, event.isEmergency, now],
        );
        await client.query(
          `INSERT INTO ledger_transactions
             (id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at)
           VALUES ($1, $2, 'spend', 'reserve_reconciliation', $3, $4, $5, $6, $7)`,
          [randomUUID(), userId, event.secondsSpent, `Offline spend: ${event.targetType}:${event.targetIdentifier} (${event.secondsSpent}s)`, input.deviceId, event.eventId, now],
        );
        acceptedSeconds += event.secondsSpent;
      }
      const releasedUnusedSeconds = Math.max(0, reserve.remainingSeconds - acceptedSeconds);
      await client.query(`UPDATE time_banks SET balance_seconds = balance_seconds - $2, updated_at = $3 WHERE user_id = $1`, [userId, acceptedSeconds, new Date().toISOString()]);
      await client.query(`UPDATE device_reserves SET remaining_seconds = 0 WHERE id = $1`, [reserve.id]);
      return {
        reconciledCount: newEvents.length,
        acceptedSeconds,
        releasedUnusedSeconds,
        newBalanceSeconds: bankBalance - acceptedSeconds,
      };
    });
  }

  async getActiveReserves(userId: string): Promise<DeviceReserveRow[]> {
    const rows = await this.query(
      `SELECT id, user_id, device_id, reserved_seconds, remaining_seconds, expires_at, created_at, idempotency_key
         FROM device_reserves
        WHERE user_id = $1 AND remaining_seconds > 0 AND expires_at > NOW()
        ORDER BY expires_at ASC`,
      [userId],
    );
    return rows.map((row) => this.mapReserve(row));
  }

  async recordProtectionEvent(event: ProtectionEventRow): Promise<void> {
    const deviceRows = await this.query(
      `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
      [event.deviceId, event.userId],
    );
    if (deviceRows.length === 0) throw new Error('Device does not belong to this user');
    await this.query(
      `INSERT INTO protection_events
         (id, user_id, device_id, event_type, details, occurred_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, event.userId, event.deviceId, event.eventType, event.details ?? null, event.occurredAt, event.createdAt],
    );
  }

  async getProtectionEvents(userId: string, limit: number): Promise<ProtectionEventRow[]> {
    const rows = await this.query(
      `SELECT id, user_id, device_id, event_type, details, occurred_at, created_at
         FROM protection_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => this.mapProtectionEvent(row));
  }

  async recordLocationEvent(
    event: LocationEventRow,
    reward: LocationRewardRule | undefined,
  ): Promise<LocationEventResult> {
    return this.transaction(async (client) => {
      const duplicateRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, location_type, event_type, dwell_seconds, movement_verified,
                occurred_at, idempotency_key, created_at
           FROM location_events WHERE user_id = $1 AND idempotency_key = $2`,
        [event.userId, event.idempotencyKey],
      );
      if (duplicateRows.length > 0) {
        const rewardRows = await this.queryOn(
          client,
          `SELECT id FROM ledger_transactions WHERE user_id = $1 AND idempotency_key = $2`,
          [event.userId, event.idempotencyKey],
        );
        return {
          id: text(duplicateRows[0], 'id'),
          rewardGranted: rewardRows.length > 0,
          balance: rewardRows.length > 0 ? await this.balanceOn(client, event.userId) : undefined,
        };
      }
      const deviceRows = await this.queryOn(
        client,
        `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
        [event.deviceId, event.userId],
      );
      if (deviceRows.length === 0) throw new Error('Device does not belong to this user');

      await client.query(
        `INSERT INTO location_states (user_id, updated_at) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [event.userId, event.createdAt],
      );
      const stateRows = await this.queryOn(
        client,
        `SELECT user_id, last_gym_enter_at, last_home_exit_at, updated_at
           FROM location_states WHERE user_id = $1 FOR UPDATE`,
        [event.userId],
      );
      const state = stateRows[0];
      let durationSeconds = 0;
      let lastGymEnterAt = nullableIso(state.last_gym_enter_at);
      let lastHomeExitAt = nullableIso(state.last_home_exit_at);
      if (event.locationType === 'gym') {
        if (event.eventType === 'enter') {
          lastGymEnterAt = event.occurredAt;
        } else if (event.eventType === 'exit') {
          durationSeconds = this.durationSince(lastGymEnterAt, event.occurredAt, event.dwellSeconds);
          lastGymEnterAt = null;
        }
      } else if (event.locationType === 'home') {
        if (event.eventType === 'exit') {
          lastHomeExitAt = event.occurredAt;
        } else if (event.eventType === 'enter') {
          durationSeconds = this.durationSince(lastHomeExitAt, event.occurredAt, event.dwellSeconds);
          lastHomeExitAt = null;
        }
      }
      await client.query(
        `UPDATE location_states
            SET last_gym_enter_at = $2, last_home_exit_at = $3, updated_at = $4
          WHERE user_id = $1`,
        [event.userId, lastGymEnterAt, lastHomeExitAt, event.createdAt],
      );
      await client.query(
        `INSERT INTO location_events
           (id, user_id, device_id, location_type, event_type, dwell_seconds, movement_verified,
            occurred_at, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [event.id, event.userId, event.deviceId, event.locationType, event.eventType, event.dwellSeconds ?? null, event.movementVerified, event.occurredAt, event.idempotencyKey, event.createdAt],
      );

      const eligible = Boolean(
        reward &&
        durationSeconds >= reward.minimumDurationSeconds &&
        (!reward.requiresMovement || event.movementVerified),
      );
      if (!eligible || !reward) return { id: event.id, rewardGranted: false };

      const bankRows = await this.queryOn(
        client,
        `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
           FROM time_banks WHERE user_id = $1 FOR UPDATE`,
        [event.userId],
      );
      if (bankRows.length === 0) throw new Error('Time bank not found for user');
      const currentBalance = numberValue(bankRows[0], 'balance_seconds');
      const maxBalance = numberValue(bankRows[0], 'max_seconds');
      const actualCredit = Math.min(reward.rewardSeconds, Math.max(0, maxBalance - currentBalance));
      const now = new Date().toISOString();
      await client.query(
        `UPDATE time_banks SET balance_seconds = balance_seconds + $2, updated_at = $3 WHERE user_id = $1`,
        [event.userId, actualCredit, now],
      );
      await client.query(
        `INSERT INTO ledger_transactions
           (id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at)
         VALUES ($1, $2, 'earn', $3, $4, $5, $6, $7, $8)`,
        [randomUUID(), event.userId, reward.source, actualCredit, `${reward.descriptionPrefix} (${Math.round(durationSeconds / 60)} min)`, event.deviceId, event.idempotencyKey, now],
      );
      return { id: event.id, rewardGranted: true, balance: await this.balanceOn(client, event.userId) };
    });
  }

  private durationSince(startedAt: string | null, endedAt: string, fallback?: number): number {
    if (!startedAt) return fallback ?? 0;
    return Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  }
}
