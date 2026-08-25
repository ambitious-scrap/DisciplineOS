import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  DevicePlatform,
  FocusSessionStatus,
  LeasePayload,
  LocationEventType,
  PolicyChangeAction,
  ReconcileReservesRequest,
  ReconcileReservesResponse,
  RewardActivityType,
  TimeBankBalance,
  TransactionSource,
  TransactionType,
  UpdateRewardPolicyRequest,
} from '@disciplineos/shared';
import type {
  ActiveUnlockRow,
  BlockedAppRow,
  BlockedSiteRow,
  DailyRewardTotalRow,
  DeviceReserveRow,
  DeviceRow,
  FocusSessionRow,
  LocationEventRow,
  LocationSessionRow,
  PendingPolicyChangeRow,
  PendingRewardPolicyChangeRow,
  PhotoEvidenceRow,
  ProtectionEventRow,
  RewardPolicyRow,
  TaskEvidenceConsumptionRow,
  TaskOccurrenceRow,
  TaskRow,
  TimeBankRow,
  TransactionRow,
  UserRow,
} from './interfaces.js';
import type {
  CompleteTaskEvidenceInput,
  DisciplineStore,
  FocusAbandonInput,
  FocusCompletionInput,
  FocusCompletionResult,
  FocusHeartbeatInput,
  FocusSessionStartInput,
  LocationEvidenceResult,
  PhotoEvidenceSubmissionInput,
  RewardPolicyUpdateResult,
  SpendPointsInput,
  TaskCompletionResult,
  UnlockSessionInput,
} from './store.js';
import { DEFAULT_REWARD_POLICIES } from './defaultRewardPolicies.js';

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

function dateOnly(value: unknown): string {
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function leasePayloadValue(row: DbRow): LeasePayload | null {
  const value = row.lease_payload;
  return value && typeof value === 'object' ? value as LeasePayload : null;
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
      occurrenceDate: dateOnly(row.occurrence_date),
      completedAt: nullableIso(row.completed_at),
      evidenceUrl: optionalText(row, 'evidence_url'),
      evidenceSha256: optionalText(row, 'evidence_sha256'),
      evidenceSessionId: optionalText(row, 'evidence_session_id'),
      photoEvidenceId: optionalText(row, 'photo_evidence_id'),
      rewardSeconds: row.reward_seconds === null || row.reward_seconds === undefined ? 0 : numberValue(row, 'reward_seconds'),
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
      leasePayload: leasePayloadValue(row),
      leaseAlgorithm: optionalText(row, 'lease_algorithm') as 'Ed25519' | null,
      leaseKeyId: optionalText(row, 'lease_key_id'),
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
      locationSessionId: optionalText(row, 'location_session_id'),
      locationType: text(row, 'location_type') as LocationEventRow['locationType'],
      placeIdentifier: optionalText(row, 'place_identifier') ?? 'default',
      eventType: text(row, 'event_type') as LocationEventType,
      stepDelta: row.step_delta === null || row.step_delta === undefined ? 0 : numberValue(row, 'step_delta'),
      activeSeconds: row.active_seconds === null || row.active_seconds === undefined ? 0 : numberValue(row, 'active_seconds'),
      sampleCount: row.sample_count === null || row.sample_count === undefined ? 0 : numberValue(row, 'sample_count'),
      clientOccurredAt: nullableIso(row.client_occurred_at),
      clientMonotonicMs: row.client_monotonic_ms === null || row.client_monotonic_ms === undefined ? null : numberValue(row, 'client_monotonic_ms'),
      dwellSeconds: row.dwell_seconds === null || row.dwell_seconds === undefined
        ? undefined
        : numberValue(row, 'dwell_seconds'),
      movementVerified: booleanValue(row, 'movement_verified'),
      occurredAt: iso(row.occurred_at),
      idempotencyKey: text(row, 'idempotency_key'),
      createdAt: iso(row.created_at),
    };
  }

  private mapFocusSession(row: DbRow): FocusSessionRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'),
      associatedTaskId: optionalText(row, 'associated_task_id'),
      plannedDurationSeconds: numberValue(row, 'planned_duration_seconds'),
      serverStartedAt: iso(row.server_started_at),
      serverCompletedAt: nullableIso(row.server_completed_at),
      lastHeartbeatAt: nullableIso(row.last_heartbeat_at),
      clientStartedMonotonicMs: row.client_started_monotonic_ms === null || row.client_started_monotonic_ms === undefined
        ? null
        : numberValue(row, 'client_started_monotonic_ms'),
      status: text(row, 'status') as FocusSessionStatus,
      observedDurationSeconds: numberValue(row, 'observed_duration_seconds'),
      rewardSeconds: numberValue(row, 'reward_seconds'),
      rewardClaimed: booleanValue(row, 'reward_claimed'),
      startIdempotencyKey: text(row, 'start_idempotency_key'),
      completionIdempotencyKey: optionalText(row, 'completion_idempotency_key'),
      createdAt: iso(row.created_at),
    };
  }

  private mapRewardPolicy(row: DbRow): RewardPolicyRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      activityType: text(row, 'activity_type') as RewardActivityType,
      maxRewardSeconds: numberValue(row, 'max_reward_seconds'),
      dailyCapSeconds: numberValue(row, 'daily_cap_seconds'),
      minimumVerifiedSeconds: numberValue(row, 'minimum_verified_seconds'),
      rewardRatioBasisPoints: numberValue(row, 'reward_ratio_basis_points'),
      requiresMovement: booleanValue(row, 'requires_movement'),
      updatedAt: iso(row.updated_at),
    };
  }

  private mapPendingRewardPolicy(row: DbRow): PendingRewardPolicyChangeRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      rewardPolicyId: text(row, 'reward_policy_id'),
      activityType: text(row, 'activity_type') as RewardActivityType,
      proposedPolicy: {
        maxRewardSeconds: numberValue(row, 'proposed_max_reward_seconds'),
        dailyCapSeconds: numberValue(row, 'proposed_daily_cap_seconds'),
        minimumVerifiedSeconds: numberValue(row, 'proposed_minimum_verified_seconds'),
        rewardRatioBasisPoints: numberValue(row, 'proposed_reward_ratio_basis_points'),
        requiresMovement: booleanValue(row, 'proposed_requires_movement'),
      },
      requestedAt: iso(row.requested_at),
      effectiveAt: iso(row.effective_at),
      isCancelled: booleanValue(row, 'is_cancelled'),
      isExecuted: booleanValue(row, 'is_executed'),
    };
  }

  private mapPhotoEvidence(row: DbRow): PhotoEvidenceRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'),
      taskId: text(row, 'task_id'),
      occurrenceDate: dateOnly(row.occurrence_date),
      sha256: text(row, 'sha256'),
      sourceUri: optionalText(row, 'source_uri'),
      idempotencyKey: text(row, 'idempotency_key'),
      createdAt: iso(row.created_at),
    };
  }

  private mapLocationSession(row: DbRow): LocationSessionRow {
    return {
      id: text(row, 'id'),
      userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'),
      locationType: text(row, 'location_type') as LocationSessionRow['locationType'],
      placeIdentifier: text(row, 'place_identifier'),
      status: text(row, 'status') as LocationSessionRow['status'],
      serverStartedAt: iso(row.server_started_at),
      serverLastSeenAt: iso(row.server_last_seen_at),
      serverEndedAt: nullableIso(row.server_ended_at),
      clientEnteredAt: nullableIso(row.client_entered_at),
      clientExitedAt: nullableIso(row.client_exited_at),
      stepDelta: numberValue(row, 'step_delta'),
      activeSeconds: numberValue(row, 'active_seconds'),
      sampleCount: numberValue(row, 'sample_count'),
      rewardSeconds: numberValue(row, 'reward_seconds'),
      rewardClaimed: booleanValue(row, 'reward_claimed'),
      createdAt: iso(row.created_at),
    };
  }

  private async ensureRewardPoliciesOn(client: Queryable, userId: string): Promise<void> {
    for (const [activityType, defaults] of Object.entries(DEFAULT_REWARD_POLICIES)) {
      await client.query(
        `INSERT INTO reward_policies
           (id, user_id, activity_type, max_reward_seconds, daily_cap_seconds,
            minimum_verified_seconds, reward_ratio_basis_points, requires_movement, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (user_id, activity_type) DO NOTHING`,
        [
          randomUUID(),
          userId,
          activityType,
          defaults.maxRewardSeconds,
          defaults.dailyCapSeconds,
          defaults.minimumVerifiedSeconds,
          defaults.rewardRatioBasisPoints,
          defaults.requiresMovement,
        ],
      );
    }
  }

  private async getRewardPolicyOn(
    client: Queryable,
    userId: string,
    activityType: RewardActivityType,
  ): Promise<RewardPolicyRow> {
    await this.ensureRewardPoliciesOn(client, userId);
    await this.applyPendingRewardPoliciesOn(client, userId);
    const rows = await this.queryOn(
      client,
      `SELECT id, user_id, activity_type, max_reward_seconds, daily_cap_seconds,
              minimum_verified_seconds, reward_ratio_basis_points, requires_movement, updated_at
         FROM reward_policies WHERE user_id = $1 AND activity_type = $2`,
      [userId, activityType],
    );
    if (rows.length === 0) throw new Error('Reward policy not found');
    return this.mapRewardPolicy(rows[0]);
  }

  private rewardTransactionSource(activityType: RewardActivityType): TransactionSource {
    return activityType === 'photo' ? 'task' : activityType;
  }

  private async creditCappedOn(
    client: Queryable,
    userId: string,
    activityType: RewardActivityType,
    requestedSeconds: number,
    idempotencyKey: string,
    description: string,
    deviceId?: string | null,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }> {
    const existingRows = await this.queryOn(
      client,
      `SELECT id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at
         FROM ledger_transactions WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    if (existingRows.length > 0) {
      return { transaction: this.mapTransaction(existingRows[0]), balance: await this.balanceOn(client, userId) };
    }
    const policy = await this.getRewardPolicyOn(client, userId, activityType);
    const rewardRows = await this.queryOn(
      client,
      `INSERT INTO daily_reward_totals (user_id, activity_type, reward_date, awarded_seconds, updated_at)
       VALUES ($1, $2, (NOW() AT TIME ZONE 'UTC')::DATE, 0, NOW())
       ON CONFLICT (user_id, activity_type, reward_date) DO NOTHING
       RETURNING user_id, activity_type, reward_date, awarded_seconds, updated_at`,
      [userId, activityType],
    );
    const dailyRows = rewardRows.length > 0
      ? rewardRows
      : await this.queryOn(
          client,
          `SELECT user_id, activity_type, reward_date, awarded_seconds, updated_at
             FROM daily_reward_totals
            WHERE user_id = $1 AND activity_type = $2 AND reward_date = (NOW() AT TIME ZONE 'UTC')::DATE
            FOR UPDATE`,
          [userId, activityType],
        );
    const awarded = numberValue(dailyRows[0], 'awarded_seconds');
    const bankRows = await this.queryOn(
      client,
      `SELECT user_id, balance_seconds, max_seconds, last_decay_at, updated_at
         FROM time_banks WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    if (bankRows.length === 0) throw new Error('Time bank not found for user');
    const bankBalance = numberValue(bankRows[0], 'balance_seconds');
    const maxBalance = numberValue(bankRows[0], 'max_seconds');
    const requested = Math.min(requestedSeconds, policy.maxRewardSeconds);
    const allowed = Math.min(
      requested,
      Math.max(0, policy.dailyCapSeconds - awarded),
      Math.max(0, maxBalance - bankBalance),
    );
    const now = new Date().toISOString();
    await client.query(
      `UPDATE daily_reward_totals
          SET awarded_seconds = awarded_seconds + $4, updated_at = $3
        WHERE user_id = $1 AND activity_type = $2 AND reward_date = (NOW() AT TIME ZONE 'UTC')::DATE`,
      [userId, activityType, now, allowed],
    );
    await client.query(
      `UPDATE time_banks SET balance_seconds = balance_seconds + $2, updated_at = $3 WHERE user_id = $1`,
      [userId, allowed, now],
    );
    const transactionRows = await this.queryOn(
      client,
      `INSERT INTO ledger_transactions
         (id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at)
       VALUES ($1, $2, 'earn', $3, $4, $5, $6, $7, $8)
       RETURNING id, user_id, type, source, seconds, description, device_id, idempotency_key, created_at`,
      [randomUUID(), userId, this.rewardTransactionSource(activityType), allowed, description, deviceId ?? null, idempotencyKey, now],
    );
    return { transaction: this.mapTransaction(transactionRows[0]), balance: await this.balanceOn(client, userId) };
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

  private async bumpPolicyRevision(client: Queryable, userId: string): Promise<number> {
    const rows = await this.queryOn(
      client,
      `INSERT INTO policy_revisions (user_id, revision, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET revision = policy_revisions.revision + 1, updated_at = NOW()
       RETURNING revision`,
      [userId],
    );
    return numberValue(rows[0], 'revision');
  }

  private async ensurePolicyRevision(userId: string): Promise<number> {
    await this.query(
      `INSERT INTO policy_revisions (user_id, revision)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const rows = await this.query(
      `SELECT revision FROM policy_revisions WHERE user_id = $1`,
      [userId],
    );
    return numberValue(rows[0], 'revision');
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
      await client.query(
        `INSERT INTO policy_revisions (user_id, revision) VALUES ($1, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
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
  async getDevice(userId: string, deviceId: string): Promise<DeviceRow | null> {
    const rows = await this.query(
      `SELECT id, user_id, name, platform, push_token, last_seen_at, is_enforced, created_at
         FROM devices WHERE id = $1 AND user_id = $2`,
      [deviceId, userId],
    );
    return rows.length === 0 ? null : this.mapDevice(rows[0]);
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
                is_emergency, lease_signature, lease_payload, lease_algorithm, lease_key_id, status, idempotency_key
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
        `INSERT INTO policy_revisions (user_id, revision)
         VALUES ($1, 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [input.userId],
      );
      const revisionRows = await this.queryOn(
        client,
        `SELECT revision FROM policy_revisions WHERE user_id = $1 FOR UPDATE`,
        [input.userId],
      );
      const currentPolicyRevision = numberValue(revisionRows[0], 'revision');
      if (currentPolicyRevision !== input.leasePayload.policyVersion) {
        throw new Error(
          `Policy revision changed before unlock commit: expected ${input.leasePayload.policyVersion}, current ${currentPolicyRevision}`,
        );
      }
      await client.query(
        `UPDATE active_unlocks SET status = 'expired'
          WHERE user_id = $1 AND status = 'active' AND expires_at <= NOW()`,
        [input.userId],
      );
      const activeRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
                is_emergency, lease_signature, lease_payload, lease_algorithm, lease_key_id, status, idempotency_key
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
            is_emergency, lease_signature, lease_payload, lease_algorithm, lease_key_id, status, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', $14)
         RETURNING id, user_id, device_id, unlock_type, identifier, duration_seconds, started_at, expires_at,
                   is_emergency, lease_signature, lease_payload, lease_algorithm, lease_key_id, status, idempotency_key`,
        [input.id, input.userId, input.deviceId, input.unlockType, input.identifier, input.durationSeconds, input.startedAt, input.expiresAt, input.isEmergency, input.leaseSignature, JSON.stringify(input.leasePayload), input.leaseAlgorithm, input.leaseKeyId, input.idempotencyKey],
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
                is_emergency, lease_signature, lease_payload, lease_algorithm, lease_key_id, status, idempotency_key
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
                is_emergency, lease_signature, lease_payload, lease_algorithm, lease_key_id, status, idempotency_key
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

  async startFocusSession(input: FocusSessionStartInput): Promise<FocusSessionRow> {
    return this.transaction(async (client) => {
      const replayRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, associated_task_id, planned_duration_seconds,
                server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
                status, observed_duration_seconds, reward_seconds, reward_claimed,
                start_idempotency_key, completion_idempotency_key, created_at
           FROM focus_sessions
          WHERE user_id = $1 AND start_idempotency_key = $2`,
        [input.userId, input.idempotencyKey],
      );
      if (replayRows.length > 0) return this.mapFocusSession(replayRows[0]);
      const deviceRows = await this.queryOn(
        client,
        `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
        [input.deviceId, input.userId],
      );
      if (deviceRows.length === 0) throw new Error('Device does not belong to this user');
      const activeRows = await this.queryOn(
        client,
        `SELECT id FROM focus_sessions WHERE user_id = $1 AND status = 'active' FOR UPDATE`,
        [input.userId],
      );
      if (activeRows.length > 0) throw new Error('Another focus session is already active');
      const now = new Date().toISOString();
      const rows = await this.queryOn(
        client,
        `INSERT INTO focus_sessions
           (id, user_id, device_id, associated_task_id, planned_duration_seconds, server_started_at,
            client_started_monotonic_ms, status, observed_duration_seconds, reward_seconds, reward_claimed,
            start_idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 0, 0, FALSE, $8, $6)
         RETURNING id, user_id, device_id, associated_task_id, planned_duration_seconds,
                   server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
                   status, observed_duration_seconds, reward_seconds, reward_claimed,
                   start_idempotency_key, completion_idempotency_key, created_at`,
        [input.id, input.userId, input.deviceId, input.associatedTaskId ?? null, input.plannedDurationSeconds, now, input.clientStartedMonotonicMs ?? null, input.idempotencyKey],
      );
      return this.mapFocusSession(rows[0]);
    });
  }

  async heartbeatFocusSession(input: FocusHeartbeatInput): Promise<FocusSessionRow> {
    return this.transaction(async (client) => {
      const rows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, associated_task_id, planned_duration_seconds,
                server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
                status, observed_duration_seconds, reward_seconds, reward_claimed,
                start_idempotency_key, completion_idempotency_key, created_at
           FROM focus_sessions WHERE id = $1 FOR UPDATE`,
        [input.sessionId],
      );
      if (rows.length === 0 || text(rows[0], 'user_id') !== input.userId || text(rows[0], 'device_id') !== input.deviceId) {
        throw new Error('Focus session does not belong to this device');
      }
      const session = this.mapFocusSession(rows[0]);
      if (session.status !== 'active') throw new Error('Focus session is no longer active');
      const now = new Date().toISOString();
      const observed = Math.min(
        session.plannedDurationSeconds,
        Math.max(0, Math.floor((Date.parse(now) - Date.parse(session.serverStartedAt)) / 1000)),
      );
      const updated = await this.queryOn(
        client,
        `UPDATE focus_sessions
            SET last_heartbeat_at = $2, observed_duration_seconds = $3
          WHERE id = $1
          RETURNING id, user_id, device_id, associated_task_id, planned_duration_seconds,
                    server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
                    status, observed_duration_seconds, reward_seconds, reward_claimed,
                    start_idempotency_key, completion_idempotency_key, created_at`,
        [input.sessionId, now, observed],
      );
      return this.mapFocusSession(updated[0]);
    });
  }

  async completeFocusSession(input: FocusCompletionInput): Promise<FocusCompletionResult> {
    return this.transaction(async (client) => {
      const rows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, associated_task_id, planned_duration_seconds,
                server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
                status, observed_duration_seconds, reward_seconds, reward_claimed,
                start_idempotency_key, completion_idempotency_key, created_at
           FROM focus_sessions WHERE id = $1 FOR UPDATE`,
        [input.sessionId],
      );
      if (rows.length === 0 || text(rows[0], 'user_id') !== input.userId || text(rows[0], 'device_id') !== input.deviceId) {
        throw new Error('Focus session does not belong to this device');
      }
      const existing = this.mapFocusSession(rows[0]);
      if (existing.status === 'completed') {
        if (existing.completionIdempotencyKey !== input.idempotencyKey) throw new Error('Focus session already completed');
        return { session: existing, balance: existing.rewardClaimed ? await this.balanceOn(client, input.userId) : undefined };
      }
      if (existing.status !== 'active') throw new Error('Focus session cannot be completed');
      const now = new Date().toISOString();
      const observed = Math.min(
        existing.plannedDurationSeconds,
        Math.max(0, Math.floor((Date.parse(now) - Date.parse(existing.serverStartedAt)) / 1000)),
      );
      const policy = await this.getRewardPolicyOn(client, input.userId, 'focus');
      const rewardSeconds = observed >= policy.minimumVerifiedSeconds
        ? Math.min(policy.maxRewardSeconds, Math.floor((observed * policy.rewardRatioBasisPoints) / 10_000))
        : 0;
      const updatedRows = await this.queryOn(
        client,
        `UPDATE focus_sessions
            SET server_completed_at = $2, observed_duration_seconds = $3, reward_seconds = $4,
                status = 'completed', completion_idempotency_key = $5,
                reward_claimed = CASE WHEN associated_task_id IS NULL THEN TRUE ELSE FALSE END
          WHERE id = $1
          RETURNING id, user_id, device_id, associated_task_id, planned_duration_seconds,
                    server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
                    status, observed_duration_seconds, reward_seconds, reward_claimed,
                    start_idempotency_key, completion_idempotency_key, created_at`,
        [input.sessionId, now, observed, rewardSeconds, input.idempotencyKey],
      );
      const session = this.mapFocusSession(updatedRows[0]);
      if (session.associatedTaskId) return { session };
      const credited = await this.creditCappedOn(
        client,
        input.userId,
        'focus',
        rewardSeconds,
        `focus-session-${session.id}`,
        `Verified focus session (${observed}s)`,
        input.deviceId,
      );
      return { session, balance: credited.balance };
    });
  }

  async abandonFocusSession(input: FocusAbandonInput): Promise<FocusSessionRow> {
    return this.transaction(async (client) => {
      const rows = await this.queryOn(
        client,
        `SELECT * FROM focus_sessions WHERE id = $1 FOR UPDATE`,
        [input.sessionId],
      );
      if (rows.length === 0 || text(rows[0], 'user_id') !== input.userId || text(rows[0], 'device_id') !== input.deviceId) {
        throw new Error('Focus session does not belong to this device');
      }
      const session = this.mapFocusSession(rows[0]);
      if (session.status === 'abandoned') {
        if (session.completionIdempotencyKey !== input.idempotencyKey) throw new Error('Focus session already abandoned');
        return session;
      }
      if (session.status !== 'active') throw new Error('Focus session cannot be abandoned');
      const updated = await this.queryOn(
        client,
        `UPDATE focus_sessions
            SET status = 'abandoned', server_completed_at = NOW(), reward_seconds = 0,
                reward_claimed = TRUE, completion_idempotency_key = $2
          WHERE id = $1
          RETURNING *`,
        [input.sessionId, input.idempotencyKey],
      );
      return this.mapFocusSession(updated[0]);
    });
  }

  async getFocusSession(userId: string, sessionId: string): Promise<FocusSessionRow | null> {
    const rows = await this.query(
      `SELECT id, user_id, device_id, associated_task_id, planned_duration_seconds,
              server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
              status, observed_duration_seconds, reward_seconds, reward_claimed,
              start_idempotency_key, completion_idempotency_key, created_at
         FROM focus_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    return rows.length === 0 ? null : this.mapFocusSession(rows[0]);
  }
  private async applyPendingRewardPoliciesOn(client: Queryable, userId: string): Promise<void> {
    const rows = await this.queryOn(
      client,
      `SELECT id, user_id, reward_policy_id, activity_type,
              proposed_max_reward_seconds, proposed_daily_cap_seconds,
              proposed_minimum_verified_seconds, proposed_reward_ratio_basis_points,
              proposed_requires_movement, requested_at, effective_at, is_cancelled, is_executed
         FROM pending_reward_policy_changes
        WHERE user_id = $1 AND is_cancelled = FALSE AND is_executed = FALSE AND effective_at <= NOW()
        FOR UPDATE`,
      [userId],
    );
    for (const row of rows) {
      const change = this.mapPendingRewardPolicy(row);
      await client.query(
        `UPDATE reward_policies
            SET max_reward_seconds = $2,
                daily_cap_seconds = $3,
                minimum_verified_seconds = $4,
                reward_ratio_basis_points = $5,
                requires_movement = $6,
                updated_at = NOW()
          WHERE id = $1 AND user_id = $7`,
        [
          change.rewardPolicyId,
          change.proposedPolicy.maxRewardSeconds,
          change.proposedPolicy.dailyCapSeconds,
          change.proposedPolicy.minimumVerifiedSeconds,
          change.proposedPolicy.rewardRatioBasisPoints,
          change.proposedPolicy.requiresMovement,
          userId,
        ],
      );
      await client.query(
        `UPDATE pending_reward_policy_changes SET is_executed = TRUE WHERE id = $1`,
        [change.id],
      );
    }
  }

  async getRewardPolicies(userId: string): Promise<RewardPolicyRow[]> {
    return this.transaction(async (client) => {
      await this.ensureRewardPoliciesOn(client, userId);
      await this.applyPendingRewardPoliciesOn(client, userId);
      const rows = await this.queryOn(
        client,
        `SELECT id, user_id, activity_type, max_reward_seconds, daily_cap_seconds,
                minimum_verified_seconds, reward_ratio_basis_points, requires_movement, updated_at
           FROM reward_policies WHERE user_id = $1 ORDER BY activity_type`,
        [userId],
      );
      return rows.map((row) => this.mapRewardPolicy(row));
    });
  }

  async getRewardPolicy(userId: string, activityType: RewardActivityType): Promise<RewardPolicyRow> {
    return this.transaction((client) => this.getRewardPolicyOn(client, userId, activityType));
  }

  async updateRewardPolicy(
    userId: string,
    activityType: RewardActivityType,
    request: UpdateRewardPolicyRequest,
  ): Promise<RewardPolicyUpdateResult> {
    return this.transaction(async (client) => {
      const current = await this.getRewardPolicyOn(client, userId, activityType);
      const isWeakening =
        request.maxRewardSeconds > current.maxRewardSeconds ||
        request.dailyCapSeconds > current.dailyCapSeconds ||
        request.minimumVerifiedSeconds < current.minimumVerifiedSeconds ||
        request.rewardRatioBasisPoints > current.rewardRatioBasisPoints ||
        (current.requiresMovement && !request.requiresMovement);
      if (!isWeakening) {
        await client.query(
          `UPDATE pending_reward_policy_changes
              SET is_cancelled = TRUE
            WHERE user_id = $1 AND activity_type = $2 AND is_cancelled = FALSE AND is_executed = FALSE`,
          [userId, activityType],
        );
        const rows = await this.queryOn(
          client,
          `UPDATE reward_policies
              SET max_reward_seconds = $2,
                  daily_cap_seconds = $3,
                  minimum_verified_seconds = $4,
                  reward_ratio_basis_points = $5,
                  requires_movement = $6,
                  updated_at = NOW()
            WHERE id = $1 AND user_id = $7
            RETURNING id, user_id, activity_type, max_reward_seconds, daily_cap_seconds,
                      minimum_verified_seconds, reward_ratio_basis_points, requires_movement, updated_at`,
          [current.id, request.maxRewardSeconds, request.dailyCapSeconds, request.minimumVerifiedSeconds, request.rewardRatioBasisPoints, request.requiresMovement, userId],
        );
        return { policy: this.mapRewardPolicy(rows[0]), pendingChange: null };
      }
      const existingRows = await this.queryOn(
        client,
        `SELECT id, user_id, reward_policy_id, activity_type,
                proposed_max_reward_seconds, proposed_daily_cap_seconds,
                proposed_minimum_verified_seconds, proposed_reward_ratio_basis_points,
                proposed_requires_movement, requested_at, effective_at, is_cancelled, is_executed
           FROM pending_reward_policy_changes
          WHERE user_id = $1 AND activity_type = $2 AND is_cancelled = FALSE AND is_executed = FALSE`,
        [userId, activityType],
      );
      if (existingRows.length > 0) {
        return { policy: current, pendingChange: this.mapPendingRewardPolicy(existingRows[0]) };
      }
      const id = randomUUID();
      const rows = await this.queryOn(
        client,
        `INSERT INTO pending_reward_policy_changes
           (id, user_id, reward_policy_id, activity_type,
            proposed_max_reward_seconds, proposed_daily_cap_seconds,
            proposed_minimum_verified_seconds, proposed_reward_ratio_basis_points,
            proposed_requires_movement, requested_at, effective_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW() + INTERVAL '24 hours')
         RETURNING id, user_id, reward_policy_id, activity_type,
                   proposed_max_reward_seconds, proposed_daily_cap_seconds,
                   proposed_minimum_verified_seconds, proposed_reward_ratio_basis_points,
                   proposed_requires_movement, requested_at, effective_at, is_cancelled, is_executed`,
        [id, userId, current.id, activityType, request.maxRewardSeconds, request.dailyCapSeconds, request.minimumVerifiedSeconds, request.rewardRatioBasisPoints, request.requiresMovement],
      );
      return { policy: current, pendingChange: this.mapPendingRewardPolicy(rows[0]) };
    });
  }

  async getPendingRewardPolicyChanges(userId: string): Promise<PendingRewardPolicyChangeRow[]> {
    return this.transaction(async (client) => {
      await this.applyPendingRewardPoliciesOn(client, userId);
      const rows = await this.queryOn(
        client,
        `SELECT id, user_id, reward_policy_id, activity_type,
                proposed_max_reward_seconds, proposed_daily_cap_seconds,
                proposed_minimum_verified_seconds, proposed_reward_ratio_basis_points,
                proposed_requires_movement, requested_at, effective_at, is_cancelled, is_executed
           FROM pending_reward_policy_changes
          WHERE user_id = $1 AND is_cancelled = FALSE AND is_executed = FALSE
          ORDER BY effective_at`,
        [userId],
      );
      return rows.map((row) => this.mapPendingRewardPolicy(row));
    });
  }

  async cancelPendingRewardPolicyChange(userId: string, changeId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE pending_reward_policy_changes
          SET is_cancelled = TRUE
        WHERE id = $1 AND user_id = $2 AND is_cancelled = FALSE AND is_executed = FALSE`,
      [changeId, userId],
    );
    return result.rowCount === 1;
  }

  async submitPhotoEvidence(input: PhotoEvidenceSubmissionInput): Promise<PhotoEvidenceRow> {
    return this.transaction(async (client) => {
      const replayRows = await this.queryOn(
        client,
        `SELECT id, user_id, device_id, task_id, occurrence_date, sha256, source_uri, idempotency_key, created_at
           FROM photo_evidence WHERE user_id = $1 AND idempotency_key = $2`,
        [input.userId, input.idempotencyKey],
      );
      if (replayRows.length > 0) return this.mapPhotoEvidence(replayRows[0]);
      const taskRows = await this.queryOn(
        client,
        `SELECT id, user_id, evidence_type FROM tasks WHERE id = $1 AND user_id = $2 AND is_active = TRUE`,
        [input.taskId, input.userId],
      );
      if (taskRows.length === 0 || text(taskRows[0], 'evidence_type') !== 'photo') {
        throw new Error('Photo evidence task is invalid');
      }
      const deviceRows = await this.queryOn(
        client,
        `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
        [input.deviceId, input.userId],
      );
      if (deviceRows.length === 0) throw new Error('Device does not belong to this user');
      const rows = await this.queryOn(
        client,
        `INSERT INTO photo_evidence
           (id, user_id, device_id, task_id, occurrence_date, sha256, source_uri, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id, user_id, device_id, task_id, occurrence_date, sha256, source_uri, idempotency_key, created_at`,
        [input.id, input.userId, input.deviceId, input.taskId, input.occurrenceDate, input.sha256, input.sourceUri ?? null, input.idempotencyKey],
      );
      return this.mapPhotoEvidence(rows[0]);
    });
  }

  async completeTaskWithEvidence(input: CompleteTaskEvidenceInput): Promise<TaskCompletionResult> {
    return this.transaction(async (client) => {
      const taskRows = await this.queryOn(
        client,
        `SELECT id, user_id, title, description, reward_seconds, evidence_type, is_recurring,
                recurrence_cron, is_active, created_at
           FROM tasks WHERE id = $1 AND user_id = $2 AND is_active = TRUE FOR UPDATE`,
        [input.taskId, input.userId],
      );
      if (taskRows.length === 0) throw new Error('Task not found');
      const task = this.mapTask(taskRows[0]);
      const existingRows = await this.queryOn(
        client,
        `SELECT id, task_id, user_id, occurrence_date, completed_at, evidence_url, evidence_sha256,
                evidence_session_id, photo_evidence_id, reward_seconds, reward_claimed, created_at, idempotency_key
           FROM task_occurrences WHERE task_id = $1 AND occurrence_date = $2`,
        [input.taskId, input.occurrenceDate],
      );
      if (existingRows.length > 0) {
        const existing = this.mapOccurrence(existingRows[0]);
        if (existing.idempotencyKey === input.idempotencyKey) {
          return { occurrence: existing, balance: await this.balanceOn(client, input.userId) };
        }
        throw new Error('Reward has already been claimed for this task occurrence date');
      }
      let activityType: RewardActivityType = task.evidenceType === 'none' ? 'manual' : task.evidenceType === 'photo' ? 'photo' : 'focus';
      let rewardSeconds = task.rewardSeconds;
      if (task.evidenceType === 'focus_timer') {
        if (!input.focusSessionId) throw new Error('Completed verified focus session is required');
        const focusRows = await this.queryOn(
          client,
          `SELECT id, user_id, device_id, associated_task_id, planned_duration_seconds,
                  server_started_at, server_completed_at, last_heartbeat_at, client_started_monotonic_ms,
                  status, observed_duration_seconds, reward_seconds, reward_claimed,
                  start_idempotency_key, completion_idempotency_key, created_at
             FROM focus_sessions WHERE id = $1 FOR UPDATE`,
          [input.focusSessionId],
        );
        if (focusRows.length === 0) throw new Error('Focus evidence session not found');
        const focus = this.mapFocusSession(focusRows[0]);
        if (
          focus.userId !== input.userId ||
          focus.status !== 'completed' ||
          focus.associatedTaskId !== task.id ||
          (input.deviceId !== null && input.deviceId !== focus.deviceId)
        ) {
          throw new Error('Focus evidence session is invalid for this task');
        }
        const consumedRows = await this.queryOn(
          client,
          `SELECT id FROM task_evidence_consumptions WHERE focus_session_id = $1`,
          [focus.id],
        );
        if (consumedRows.length > 0) throw new Error('Focus evidence session was already consumed');
        rewardSeconds = focus.rewardSeconds;
      } else if (task.evidenceType === 'photo') {
        if (!input.photoEvidenceId) throw new Error('Photo evidence is required');
        const photoRows = await this.queryOn(
          client,
          `SELECT id, user_id, device_id, task_id, occurrence_date, sha256, source_uri, idempotency_key, created_at
             FROM photo_evidence WHERE id = $1 FOR UPDATE`,
          [input.photoEvidenceId],
        );
        if (photoRows.length === 0) throw new Error('Photo evidence not found');
        const photo = this.mapPhotoEvidence(photoRows[0]);
        if (
          photo.userId !== input.userId ||
          photo.taskId !== task.id ||
          photo.occurrenceDate !== input.occurrenceDate ||
          (input.deviceId !== null && photo.deviceId !== input.deviceId)
        ) {
          throw new Error('Photo evidence is invalid for this task occurrence');
        }
        const consumedRows = await this.queryOn(
          client,
          `SELECT id FROM task_evidence_consumptions WHERE photo_evidence_id = $1`,
          [photo.id],
        );
        if (consumedRows.length > 0) throw new Error('Photo evidence was already consumed');
      }
      const now = new Date().toISOString();
      const credited = await this.creditCappedOn(
        client,
        input.userId,
        activityType,
        rewardSeconds,
        input.idempotencyKey,
        `Completed task: ${task.title} (${input.occurrenceDate})`,
        input.deviceId,
      );
      const occurrenceRows = await this.queryOn(
        client,
        `INSERT INTO task_occurrences
           (id, task_id, user_id, occurrence_date, completed_at, evidence_session_id, photo_evidence_id,
            reward_seconds, reward_claimed, created_at, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10)
         RETURNING id, task_id, user_id, occurrence_date, completed_at, evidence_url, evidence_sha256,
                   evidence_session_id, photo_evidence_id, reward_seconds, reward_claimed, created_at, idempotency_key`,
        [input.id, input.taskId, input.userId, input.occurrenceDate, now, input.focusSessionId ?? null, input.photoEvidenceId ?? null, credited.transaction.seconds, now, input.idempotencyKey],
      );
      if (input.focusSessionId) {
        await client.query(`UPDATE focus_sessions SET reward_claimed = TRUE WHERE id = $1`, [input.focusSessionId]);
      }
      if (input.focusSessionId || input.photoEvidenceId) {
        await client.query(
          `INSERT INTO task_evidence_consumptions
             (id, task_occurrence_id, focus_session_id, photo_evidence_id, consumed_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), input.id, input.focusSessionId ?? null, input.photoEvidenceId ?? null, now],
        );
      }
      return { occurrence: this.mapOccurrence(occurrenceRows[0]), balance: credited.balance };
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
      if (rows.length > 0) await this.bumpPolicyRevision(client, userId);
    });
  }
  async getPolicy(userId: string) {
    await this.applyPendingChanges(userId);
    const [appRows, siteRows, revision] = await Promise.all([
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
      this.ensurePolicyRevision(userId),
    ]);
    const blockedApps = appRows.map((row) => this.mapBlockedApp(row));
    const blockedSites = siteRows.map((row) => this.mapBlockedSite(row));
    return {
      version: revision,
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
      await this.bumpPolicyRevision(client, app.userId);
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
      await this.bumpPolicyRevision(client, site.userId);
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

  async recordLocationEvidence(event: LocationEventRow): Promise<LocationEvidenceResult> {
    return this.transaction(async (client) => {
      const duplicateRows = await this.queryOn(
        client,
        `SELECT * FROM location_events WHERE user_id = $1 AND idempotency_key = $2`,
        [event.userId, event.idempotencyKey],
      );
      if (duplicateRows.length > 0) {
        return { event: this.mapLocationEvent(duplicateRows[0]), rewardGranted: false };
      }
      const deviceRows = await this.queryOn(
        client,
        `SELECT id FROM devices WHERE id = $1 AND user_id = $2`,
        [event.deviceId, event.userId],
      );
      if (deviceRows.length === 0) throw new Error('Device does not belong to this user');
      let sessionRows = await this.queryOn(
        client,
        `SELECT * FROM location_sessions
          WHERE user_id = $1 AND device_id = $2 AND location_type = $3
            AND place_identifier = $4 AND status = 'active'
          FOR UPDATE`,
        [event.userId, event.deviceId, event.locationType, event.placeIdentifier],
      );
      if (event.eventType === 'enter' && sessionRows.length === 0) {
        const sessionId = randomUUID();
        const now = new Date().toISOString();
        sessionRows = await this.queryOn(
          client,
          `INSERT INTO location_sessions
             (id, user_id, device_id, location_type, place_identifier, status,
              server_started_at, server_last_seen_at, client_entered_at,
              step_delta, active_seconds, sample_count, reward_seconds, reward_claimed, created_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, $6, $7, 0, 0, 0, 0, FALSE, $6)
           RETURNING *`,
          [sessionId, event.userId, event.deviceId, event.locationType, event.placeIdentifier, now, event.clientOccurredAt ?? null],
        );
      }
      const session = sessionRows.length > 0 ? this.mapLocationSession(sessionRows[0]) : null;
      const serverNow = new Date().toISOString();
      const insertEvent = async (sessionId: string | null) => {
        const rows = await this.queryOn(
          client,
          `INSERT INTO location_events
             (id, user_id, device_id, location_session_id, location_type, place_identifier, event_type,
              step_delta, active_seconds, sample_count, client_occurred_at, client_monotonic_ms,
              dwell_seconds, movement_verified, occurred_at, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, FALSE, $13, $14, $13)
           RETURNING *`,
          [event.id, event.userId, event.deviceId, sessionId, event.locationType, event.placeIdentifier, event.eventType, event.stepDelta, event.activeSeconds, event.sampleCount, event.clientOccurredAt ?? null, event.clientMonotonicMs ?? null, serverNow, event.idempotencyKey],
        );
        return this.mapLocationEvent(rows[0]);
      };
      if (!session) return { event: await insertEvent(null), rewardGranted: false };
      await client.query(
        `UPDATE location_sessions
            SET server_last_seen_at = $2,
                step_delta = step_delta + $3,
                active_seconds = active_seconds + $4,
                sample_count = sample_count + $5,
                client_exited_at = CASE WHEN $6 = 'exit' THEN $7 ELSE client_exited_at END
          WHERE id = $1`,
        [session.id, serverNow, event.stepDelta, event.activeSeconds, event.sampleCount, event.eventType, event.clientOccurredAt ?? null],
      );
      const insertedEvent = await insertEvent(session.id);
      if (event.eventType !== 'exit') {
        const updatedRows = await this.queryOn(client, `SELECT * FROM location_sessions WHERE id = $1`, [session.id]);
        return { event: insertedEvent, session: this.mapLocationSession(updatedRows[0]), rewardGranted: false };
      }
      const durationSeconds = Math.max(
        0,
        Math.floor((Date.parse(serverNow) - Date.parse(session.serverStartedAt)) / 1000),
      );
      const activityType: RewardActivityType =
        event.locationType === 'gym' ? 'gym' : event.locationType === 'home' ? 'outside' : 'manual';
      const policy = await this.getRewardPolicyOn(client, event.userId, activityType);
      const currentSessionRows = await this.queryOn(client, `SELECT * FROM location_sessions WHERE id = $1 FOR UPDATE`, [session.id]);
      const currentSession = this.mapLocationSession(currentSessionRows[0]);
      const movementQualifies =
        !policy.requiresMovement ||
        (currentSession.stepDelta > 0 &&
          currentSession.activeSeconds > 0 &&
          currentSession.sampleCount > 0 &&
          currentSession.stepDelta >= Math.max(1, Math.floor(durationSeconds / 60)));
      const rewardSeconds = durationSeconds >= policy.minimumVerifiedSeconds && movementQualifies
        ? Math.min(policy.maxRewardSeconds, Math.floor((durationSeconds * policy.rewardRatioBasisPoints) / 10_000))
        : 0;
      await client.query(
        `UPDATE location_sessions
            SET status = 'completed', server_ended_at = $2, reward_seconds = $3, reward_claimed = TRUE
          WHERE id = $1`,
        [session.id, serverNow, rewardSeconds],
      );
      let rewardGranted = false;
      let balance: TimeBankBalance | undefined;
      if (rewardSeconds > 0) {
        const credited = await this.creditCappedOn(
          client,
          event.userId,
          activityType,
          rewardSeconds,
          event.idempotencyKey,
          `Verified ${activityType} session (${durationSeconds}s)`,
          event.deviceId,
        );
        rewardGranted = credited.transaction.seconds > 0;
        balance = credited.balance;
      }
      const updatedRows = await this.queryOn(client, `SELECT * FROM location_sessions WHERE id = $1`, [session.id]);
      return { event: insertedEvent, session: this.mapLocationSession(updatedRows[0]), rewardGranted, balance };
    });
  }

}
