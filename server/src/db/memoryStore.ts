import { randomUUID } from 'node:crypto';
import type {
  ActiveUnlockRow,
  BlockedAppRow,
  BlockedSiteRow,
  DeviceReserveRow,
  DeviceRow,
  LocationEventRow,
  OfflineEventRow,
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
import type { ReconcileReservesRequest, ReconcileReservesResponse, TimeBankBalance } from '@disciplineos/shared';

interface LocationState {
  lastGymEnterAt?: string;
  lastHomeExitAt?: string;
}

export class MemoryStore implements DisciplineStore {
  users = new Map<string, UserRow>();
  devices = new Map<string, DeviceRow>();
  timeBanks = new Map<string, TimeBankRow>();
  transactions: TransactionRow[] = [];
  tasks = new Map<string, TaskRow>();
  taskOccurrences = new Map<string, TaskOccurrenceRow>();
  blockedApps = new Map<string, BlockedAppRow>();
  blockedSites = new Map<string, BlockedSiteRow>();
  pendingPolicyChanges = new Map<string, PendingPolicyChangeRow>();
  activeUnlocks = new Map<string, ActiveUnlockRow>();
  deviceReserves = new Map<string, DeviceReserveRow>();
  offlineEvents = new Map<string, OfflineEventRow>();
  protectionEvents: ProtectionEventRow[] = [];
  locationEvents: LocationEventRow[] = [];

  private locationStates = new Map<string, LocationState>();
  private operationTail = Promise.resolve();

  clear(): void {
    this.users.clear();
    this.devices.clear();
    this.timeBanks.clear();
    this.transactions = [];
    this.tasks.clear();
    this.taskOccurrences.clear();
    this.blockedApps.clear();
    this.blockedSites.clear();
    this.pendingPolicyChanges.clear();
    this.activeUnlocks.clear();
    this.deviceReserves.clear();
    this.offlineEvents.clear();
    this.protectionEvents = [];
    this.locationEvents = [];
    this.locationStates.clear();
  }

  private async exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private bankOrThrow(userId: string): TimeBankRow {
    const bank = this.timeBanks.get(userId);
    if (!bank) {
      throw new Error('Time bank not found for user');
    }
    return bank;
  }

  private findTransaction(userId: string, idempotencyKey?: string): TransactionRow | undefined {
    if (!idempotencyKey) {
      return undefined;
    }
    return this.transactions.find(
      (transaction) => transaction.userId === userId && transaction.idempotencyKey === idempotencyKey,
    );
  }

  private availableSeconds(userId: string, now = new Date().toISOString()): number {
    const bank = this.bankOrThrow(userId);
    let reservedSeconds = 0;
    for (const reserve of this.deviceReserves.values()) {
      if (reserve.userId === userId && reserve.remainingSeconds > 0 && reserve.expiresAt > now) {
        reservedSeconds += reserve.remainingSeconds;
      }
    }
    return Math.max(0, bank.balanceSeconds - reservedSeconds);
  }

  private balance(userId: string): TimeBankBalance {
    const bank = this.bankOrThrow(userId);
    const now = new Date().toISOString();
    let reservedSeconds = 0;
    for (const reserve of this.deviceReserves.values()) {
      if (reserve.userId === userId && reserve.remainingSeconds > 0 && reserve.expiresAt > now) {
        reservedSeconds += reserve.remainingSeconds;
      }
    }
    return {
      userId,
      balanceSeconds: bank.balanceSeconds,
      maxSeconds: bank.maxSeconds,
      reservedSeconds,
      availableSeconds: Math.max(0, bank.balanceSeconds - reservedSeconds),
      lastDecayAt: bank.lastDecayAt,
      updatedAt: bank.updatedAt,
    };
  }

  private expireSessions(now = new Date().toISOString()): void {
    for (const session of this.activeUnlocks.values()) {
      if (session.status === 'active' && session.expiresAt <= now) {
        session.status = 'expired';
      }
    }
  }

  private insertTransaction(transaction: TransactionRow): void {
    if (
      transaction.idempotencyKey &&
      this.findTransaction(transaction.userId, transaction.idempotencyKey)
    ) {
      throw new Error('Duplicate transaction idempotency key');
    }
    this.transactions.push(transaction);
  }

  async registerUser(user: UserRow, timeBank: TimeBankRow): Promise<void> {
    await this.exclusive(() => {
      if ([...this.users.values()].some((candidate) => candidate.email === user.email)) {
        throw new Error('User already exists with this email');
      }
      this.users.set(user.id, user);
      this.timeBanks.set(timeBank.userId, timeBank);
    });
  }

  async getUserByEmail(email: string): Promise<UserRow | null> {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async getUserById(userId: string): Promise<UserRow | null> {
    return this.users.get(userId) ?? null;
  }
  async getDevice(userId: string, deviceId: string): Promise<DeviceRow | null> {
    const device = this.devices.get(deviceId);
    return device && device.userId === userId ? device : null;
  }

  async createDevice(device: DeviceRow): Promise<void> {
    await this.exclusive(() => {
      if (!this.users.has(device.userId)) {
        throw new Error('User not found');
      }
      this.devices.set(device.id, device);
    });
  }

  async getDevices(userId: string): Promise<DeviceRow[]> {
    return [...this.devices.values()].filter((device) => device.userId === userId);
  }

  async getBalance(userId: string): Promise<TimeBankBalance> {
    return this.balance(userId);
  }

  async creditPoints(
    userId: string,
    input: CreditPointsInput,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }> {
    return this.exclusive(() => {
      const existing = this.findTransaction(userId, input.idempotencyKey);
      if (existing) {
        return { transaction: existing, balance: this.balance(userId) };
      }

      const bank = this.bankOrThrow(userId);
      const now = new Date().toISOString();
      const actualCredit = Math.min(input.seconds, Math.max(0, bank.maxSeconds - bank.balanceSeconds));
      bank.balanceSeconds += actualCredit;
      bank.updatedAt = now;

      const transaction: TransactionRow = {
        id: randomUUID(),
        userId,
        type: 'earn',
        source: input.source,
        seconds: actualCredit,
        description: input.description ?? `Earned via ${input.source}`,
        deviceId: input.deviceId ?? null,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      };
      this.insertTransaction(transaction);
      return { transaction, balance: this.balance(userId) };
    });
  }

  async spendPoints(
    userId: string,
    input: SpendPointsInput,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }> {
    return this.exclusive(() => {
      const existing = this.findTransaction(userId, input.idempotencyKey);
      if (existing) {
        return { transaction: existing, balance: this.balance(userId) };
      }

      const device = this.devices.get(input.deviceId);
      if (!device || device.userId !== userId) {
        throw new Error('Device does not belong to this user');
      }
      const available = this.availableSeconds(userId);
      if (available < input.seconds) {
        throw new Error(
          `Insufficient available balance. Requested: ${input.seconds}s, Available: ${available}s`,
        );
      }

      const bank = this.bankOrThrow(userId);
      const now = new Date().toISOString();
      bank.balanceSeconds -= input.seconds;
      bank.updatedAt = now;
      const transaction: TransactionRow = {
        id: randomUUID(),
        userId,
        type: 'spend',
        source: input.source ?? 'usage',
        seconds: input.seconds,
        description: input.description ?? `Unlock ${input.targetType}:${input.targetIdentifier}`,
        deviceId: input.deviceId,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      };
      this.insertTransaction(transaction);
      return { transaction, balance: this.balance(userId) };
    });
  }

  async getTransactions(userId: string, limit: number): Promise<TransactionRow[]> {
    return this.transactions
      .filter((transaction) => transaction.userId === userId)
      .slice(-limit)
      .reverse();
  }

  async createUnlockSession(input: UnlockSessionInput): Promise<ActiveUnlockRow> {
    return this.exclusive(() => {
      this.expireSessions();
      const replay = [...this.activeUnlocks.values()].find(
        (session) => session.userId === input.userId && session.idempotencyKey === input.idempotencyKey,
      );
      if (replay) {
        return replay;
      }

      const device = this.devices.get(input.deviceId);
      if (!device || device.userId !== input.userId) {
        throw new Error('Device does not belong to this user');
      }
      const active = [...this.activeUnlocks.values()].find(
        (session) => session.userId === input.userId && session.status === 'active',
      );
      if (active) {
        throw new Error(
          `Another session is currently active on device ${active.deviceId} (expires at ${active.expiresAt})`,
        );
      }

      const bank = this.bankOrThrow(input.userId);
      const now = new Date().toISOString();
      if (input.costSeconds > 0) {
        const existingTransaction = this.findTransaction(input.userId, input.idempotencyKey);
        if (existingTransaction) {
          throw new Error('Idempotency key is already used by another transaction');
        }
        const available = this.availableSeconds(input.userId, now);
        if (available < input.costSeconds) {
          throw new Error(
            `Insufficient available balance. Requested: ${input.costSeconds}s, Available: ${available}s`,
          );
        }
        bank.balanceSeconds -= input.costSeconds;
        bank.updatedAt = now;
        this.insertTransaction({
          id: randomUUID(),
          userId: input.userId,
          type: 'spend',
          source: input.ledgerSource ?? 'usage',
          seconds: input.costSeconds,
          description: input.ledgerDescription,
          deviceId: input.deviceId,
          idempotencyKey: input.idempotencyKey,
          createdAt: now,
        });
      }

      const session: ActiveUnlockRow = {
        id: input.id,
        userId: input.userId,
        deviceId: input.deviceId,
        unlockType: input.unlockType,
        identifier: input.identifier,
        durationSeconds: input.durationSeconds,
        startedAt: input.startedAt,
        expiresAt: input.expiresAt,
        isEmergency: input.isEmergency,
        leaseSignature: input.leaseSignature,
        status: 'active',
        idempotencyKey: input.idempotencyKey,
      };
      this.activeUnlocks.set(session.id, session);
      return session;
    });
  }

  async getActiveUnlock(userId: string): Promise<ActiveUnlockRow | null> {
    this.expireSessions();
    return (
      [...this.activeUnlocks.values()].find(
        (session) => session.userId === userId && session.status === 'active',
      ) ?? null
    );
  }

  async releaseUnlock(userId: string, sessionId: string, deviceId: string): Promise<boolean> {
    return this.exclusive(() => {
      this.expireSessions();
      const session = this.activeUnlocks.get(sessionId);
      if (!session || session.userId !== userId || session.status !== 'active') {
        return false;
      }
      if (session.deviceId !== deviceId) {
        throw new Error('Session can only be released by the owning device');
      }
      session.status = 'released';
      return true;
    });
  }

  async getTasks(userId: string): Promise<TaskRow[]> {
    return [...this.tasks.values()].filter((task) => task.userId === userId && task.isActive);
  }

  async getTask(userId: string, taskId: string): Promise<TaskRow | null> {
    const task = this.tasks.get(taskId);
    return task && task.userId === userId ? task : null;
  }

  async createTask(task: TaskRow): Promise<void> {
    await this.exclusive(() => {
      if (!this.users.has(task.userId)) {
        throw new Error('User not found');
      }
      this.tasks.set(task.id, task);
    });
  }

  async completeTaskOccurrence(
    userId: string,
    taskId: string,
    occurrence: TaskOccurrenceRow,
    credit: CreditPointsInput,
  ): Promise<{ occurrence: TaskOccurrenceRow; balance: TimeBankBalance }> {
    return this.exclusive(() => {
      const task = this.tasks.get(taskId);
      if (!task || task.userId !== userId) {
        throw new Error('Task not found');
      }
      const existingOccurrence = [...this.taskOccurrences.values()].find(
        (candidate) =>
          candidate.taskId === taskId && candidate.occurrenceDate === occurrence.occurrenceDate,
      );
      if (existingOccurrence) {
        if (existingOccurrence.idempotencyKey === occurrence.idempotencyKey) {
          return { occurrence: existingOccurrence, balance: this.balance(userId) };
        }
        throw new Error('Reward has already been claimed for this task occurrence date');
      }
      if (this.findTransaction(userId, credit.idempotencyKey)) {
        throw new Error('Idempotency key is already used by another transaction');
      }

      const bank = this.bankOrThrow(userId);
      const now = new Date().toISOString();
      const actualCredit = Math.min(credit.seconds, Math.max(0, bank.maxSeconds - bank.balanceSeconds));
      bank.balanceSeconds += actualCredit;
      bank.updatedAt = now;
      this.taskOccurrences.set(occurrence.id, occurrence);
      this.insertTransaction({
        id: randomUUID(),
        userId,
        type: 'earn',
        source: credit.source,
        seconds: actualCredit,
        description: credit.description,
        deviceId: credit.deviceId ?? null,
        idempotencyKey: credit.idempotencyKey,
        createdAt: now,
      });
      return { occurrence, balance: this.balance(userId) };
    });
  }

  async getPolicy(userId: string) {
    await this.applyPendingChanges(userId);
    const blockedApps = [...this.blockedApps.values()].filter(
      (app) => app.userId === userId && app.isActive,
    );
    const blockedSites = [...this.blockedSites.values()].filter(
      (site) => site.userId === userId && site.isActive,
    );
    return {
      version: blockedApps.length + blockedSites.length + 1,
      updatedAt: new Date().toISOString(),
      blockedApps,
      blockedSites,
    };
  }

  private async applyPendingChanges(userId: string): Promise<void> {
    await this.exclusive(() => {
      const now = new Date().toISOString();
      for (const change of this.pendingPolicyChanges.values()) {
        if (
          change.userId !== userId ||
          change.isCancelled ||
          change.isExecuted ||
          change.effectiveAt > now
        ) {
          continue;
        }
        if (change.action === 'unblock_app') {
          const app = this.blockedApps.get(change.targetId);
          if (app) app.isActive = false;
        }
        if (change.action === 'unblock_site') {
          const site = this.blockedSites.get(change.targetId);
          if (site) site.isActive = false;
        }
        change.isExecuted = true;
      }
    });
  }

  async addBlockedApp(app: BlockedAppRow): Promise<BlockedAppRow> {
    return this.exclusive(() => {
      const existing = [...this.blockedApps.values()].find(
        (candidate) =>
          candidate.userId === app.userId &&
          candidate.platform === app.platform &&
          candidate.identifier === app.identifier,
      );
      if (existing) {
        existing.isActive = true;
        existing.displayName = app.displayName;
        for (const change of this.pendingPolicyChanges.values()) {
          if (change.userId === app.userId && change.targetId === existing.id && !change.isExecuted) {
            change.isCancelled = true;
          }
        }
        return existing;
      }
      this.blockedApps.set(app.id, app);
      return app;
    });
  }

  async addBlockedSite(site: BlockedSiteRow): Promise<BlockedSiteRow> {
    return this.exclusive(() => {
      const existing = [...this.blockedSites.values()].find(
        (candidate) => candidate.userId === site.userId && candidate.domain === site.domain,
      );
      if (existing) {
        existing.isActive = true;
        for (const change of this.pendingPolicyChanges.values()) {
          if (change.userId === site.userId && change.targetId === existing.id && !change.isExecuted) {
            change.isCancelled = true;
          }
        }
        return existing;
      }
      this.blockedSites.set(site.id, site);
      return site;
    });
  }

  async requestPolicyRemoval(input: {
    userId: string;
    action: 'unblock_app' | 'unblock_site' | 'delete_policy';
    targetId: string;
    targetDescription: string;
    effectiveAt: string;
  }): Promise<PendingPolicyChangeRow> {
    return this.exclusive(() => {
      const target =
        input.action === 'unblock_app'
          ? this.blockedApps.get(input.targetId)
          : this.blockedSites.get(input.targetId);
      if (!target || target.userId !== input.userId) {
        throw new Error(
          input.action === 'unblock_app' ? 'Blocked app not found' : 'Blocked site not found',
        );
      }
      const existing = [...this.pendingPolicyChanges.values()].find(
        (change) =>
          change.userId === input.userId &&
          change.targetId === input.targetId &&
          !change.isCancelled &&
          !change.isExecuted,
      );
      if (existing) return existing;
      const now = new Date().toISOString();
      const change: PendingPolicyChangeRow = {
        id: randomUUID(),
        userId: input.userId,
        action: input.action,
        targetId: input.targetId,
        targetDescription: input.targetDescription,
        requestedAt: now,
        effectiveAt: input.effectiveAt,
        isCancelled: false,
        isExecuted: false,
      };
      this.pendingPolicyChanges.set(change.id, change);
      return change;
    });
  }

  async getPendingPolicyChanges(userId: string): Promise<PendingPolicyChangeRow[]> {
    await this.applyPendingChanges(userId);
    return [...this.pendingPolicyChanges.values()].filter(
      (change) =>
        change.userId === userId && !change.isCancelled && !change.isExecuted,
    );
  }

  async cancelPendingPolicyChange(userId: string, changeId: string): Promise<boolean> {
    return this.exclusive(() => {
      const change = this.pendingPolicyChanges.get(changeId);
      if (!change || change.userId !== userId) return false;
      change.isCancelled = true;
      return true;
    });
  }

  async allocateReserve(reserve: DeviceReserveRow): Promise<DeviceReserveRow> {
    return this.exclusive(() => {
      const existing = [...this.deviceReserves.values()].find(
        (candidate) =>
          candidate.userId === reserve.userId &&
          candidate.idempotencyKey === reserve.idempotencyKey,
      );
      if (existing) return existing;
      const device = this.devices.get(reserve.deviceId);
      if (!device || device.userId !== reserve.userId) {
        throw new Error('Device reserve not found or does not belong to this user');
      }
      const available = this.availableSeconds(reserve.userId);
      if (available < reserve.reservedSeconds) {
        throw new Error(
          `Insufficient available balance for reserve. Requested: ${reserve.reservedSeconds}s, Available: ${available}s`,
        );
      }
      this.deviceReserves.set(reserve.id, reserve);
      return reserve;
    });
  }

  async reconcileReserve(
    userId: string,
    input: import('@disciplineos/shared').ReconcileReservesRequest,
  ): Promise<ReconcileReservesResponse> {
    return this.exclusive(() => {
      const reserve = this.deviceReserves.get(input.reserveId);
      if (!reserve || reserve.userId !== userId || reserve.deviceId !== input.deviceId) {
        throw new Error('Device reserve not found or does not belong to this authenticated device');
      }
      const uniqueEvents = [...new Map(input.events.map((event) => [event.eventId, event])).values()];
      const newEvents = uniqueEvents.filter((event) => !this.offlineEvents.has(event.eventId));
      const totalNewSeconds = newEvents.reduce((total, event) => total + event.secondsSpent, 0);
      if (totalNewSeconds > reserve.remainingSeconds) {
        throw new Error(
          `Offline spend invariant violated: Total claimed seconds (${totalNewSeconds}s) exceeds available reserve (${reserve.remainingSeconds}s)`,
        );
      }
      const bank = this.bankOrThrow(userId);
      if (totalNewSeconds > bank.balanceSeconds) {
        throw new Error('Offline spend would make the time bank negative');
      }
      let acceptedSeconds = 0;
      for (const event of newEvents) {
        this.offlineEvents.set(event.eventId, {
          id: event.eventId,
          userId,
          deviceId: input.deviceId,
          reserveId: input.reserveId,
          targetType: event.targetType,
          targetIdentifier: event.targetIdentifier,
          secondsSpent: event.secondsSpent,
          localTimestamp: event.localTimestamp,
          isEmergency: event.isEmergency,
          reconciledAt: new Date().toISOString(),
        });
        const now = new Date().toISOString();
        this.insertTransaction({
          id: randomUUID(),
          userId,
          type: 'spend',
          source: 'reserve_reconciliation',
          seconds: event.secondsSpent,
          description: `Offline spend: ${event.targetType}:${event.targetIdentifier} (${event.secondsSpent}s)`,
          deviceId: input.deviceId,
          idempotencyKey: event.eventId,
          createdAt: now,
        });
        bank.balanceSeconds -= event.secondsSpent;
        bank.updatedAt = now;
        acceptedSeconds += event.secondsSpent;
      }
      const releasedUnusedSeconds = Math.max(0, reserve.remainingSeconds - acceptedSeconds);
      reserve.remainingSeconds = 0;
      return {
        reconciledCount: newEvents.length,
        acceptedSeconds,
        releasedUnusedSeconds,
        newBalanceSeconds: bank.balanceSeconds,
      };
    });
  }

  async getActiveReserves(userId: string): Promise<DeviceReserveRow[]> {
    const now = new Date().toISOString();
    return [...this.deviceReserves.values()].filter(
      (reserve) =>
        reserve.userId === userId && reserve.remainingSeconds > 0 && reserve.expiresAt > now,
    );
  }

  async recordProtectionEvent(event: ProtectionEventRow): Promise<void> {
    await this.exclusive(() => {
      const device = this.devices.get(event.deviceId);
      if (!device || device.userId !== event.userId) {
        throw new Error('Device does not belong to this user');
      }
      this.protectionEvents.push(event);
    });
  }

  async getProtectionEvents(userId: string, limit: number): Promise<ProtectionEventRow[]> {
    return this.protectionEvents
      .filter((event) => event.userId === userId)
      .slice(-limit)
      .reverse();
  }

  async recordLocationEvent(
    event: LocationEventRow,
    reward: LocationRewardRule | undefined,
  ): Promise<LocationEventResult> {
    return this.exclusive(() => {
      const device = this.devices.get(event.deviceId);
      if (!device || device.userId !== event.userId) {
        throw new Error('Device does not belong to this user');
      }
      const duplicate = this.locationEvents.find(
        (candidate) =>
          candidate.userId === event.userId && candidate.idempotencyKey === event.idempotencyKey,
      );
      if (duplicate) {
        const transaction = this.findTransaction(event.userId, event.idempotencyKey);
        return {
          id: duplicate.id,
          rewardGranted: Boolean(transaction),
          balance: transaction ? this.balance(event.userId) : undefined,
        };
      }

      this.locationEvents.push(event);
      const state = this.locationStates.get(event.userId) ?? {};
      let durationSeconds = 0;
      if (event.locationType === 'gym') {
        if (event.eventType === 'enter') {
          state.lastGymEnterAt = event.occurredAt;
        } else if (event.eventType === 'exit') {
          durationSeconds = this.durationSince(state.lastGymEnterAt, event.occurredAt, event.dwellSeconds);
          state.lastGymEnterAt = undefined;
        }
      } else if (event.locationType === 'home') {
        if (event.eventType === 'exit') {
          state.lastHomeExitAt = event.occurredAt;
        } else if (event.eventType === 'enter') {
          durationSeconds = this.durationSince(state.lastHomeExitAt, event.occurredAt, event.dwellSeconds);
          state.lastHomeExitAt = undefined;
        }
      }
      this.locationStates.set(event.userId, state);

      if (
        reward &&
        durationSeconds >= reward.minimumDurationSeconds &&
        (!reward.requiresMovement || event.movementVerified)
      ) {
        const result = this.creditPointsUnsafe(event.userId, {
          source: reward.source,
          seconds: reward.rewardSeconds,
          description: `${reward.descriptionPrefix} (${Math.round(durationSeconds / 60)} min)`,
          deviceId: event.deviceId,
          idempotencyKey: event.idempotencyKey,
        });
        return { id: event.id, rewardGranted: true, balance: result.balance };
      }
      return { id: event.id, rewardGranted: false };
    });
  }

  private durationSince(startedAt: string | undefined, endedAt: string, fallback?: number): number {
    if (!startedAt) return fallback ?? 0;
    return Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  }

  private creditPointsUnsafe(
    userId: string,
    input: CreditPointsInput,
  ): { transaction: TransactionRow; balance: TimeBankBalance } {
    const existing = this.findTransaction(userId, input.idempotencyKey);
    if (existing) return { transaction: existing, balance: this.balance(userId) };
    const bank = this.bankOrThrow(userId);
    const now = new Date().toISOString();
    const actualCredit = Math.min(input.seconds, Math.max(0, bank.maxSeconds - bank.balanceSeconds));
    bank.balanceSeconds += actualCredit;
    bank.updatedAt = now;
    const transaction: TransactionRow = {
      id: randomUUID(),
      userId,
      type: 'earn',
      source: input.source,
      seconds: actualCredit,
      description: input.description,
      deviceId: input.deviceId ?? null,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
    };
    this.insertTransaction(transaction);
    return { transaction, balance: this.balance(userId) };
  }
}

export const db = new MemoryStore();
