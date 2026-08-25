import { randomUUID } from 'node:crypto';
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
  OfflineEventRow,
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
  CreditPointsInput,
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
import type { ReconcileReservesRequest, ReconcileReservesResponse, RewardActivityType, TimeBankBalance, UpdateRewardPolicyRequest } from '@disciplineos/shared';


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
  policyRevisions = new Map<string, number>();
  rewardPolicies = new Map<string, RewardPolicyRow>();
  pendingRewardPolicyChanges = new Map<string, PendingRewardPolicyChangeRow>();
  dailyRewardTotals = new Map<string, DailyRewardTotalRow>();
  activeUnlocks = new Map<string, ActiveUnlockRow>();
  focusSessions = new Map<string, FocusSessionRow>();
  photoEvidence = new Map<string, PhotoEvidenceRow>();
  taskEvidenceConsumptions = new Map<string, TaskEvidenceConsumptionRow>();
  locationSessions = new Map<string, LocationSessionRow>();
  deviceReserves = new Map<string, DeviceReserveRow>();
  offlineEvents = new Map<string, OfflineEventRow>();
  protectionEvents: ProtectionEventRow[] = [];
  locationEvents: LocationEventRow[] = [];

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
    this.policyRevisions.clear();
    this.rewardPolicies.clear();
    this.pendingRewardPolicyChanges.clear();
    this.dailyRewardTotals.clear();
    this.activeUnlocks.clear();
    this.focusSessions.clear();
    this.photoEvidence.clear();
    this.taskEvidenceConsumptions.clear();
    this.locationSessions.clear();
    this.deviceReserves.clear();
    this.offlineEvents.clear();
    this.protectionEvents = [];
    this.locationEvents = [];
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

  private bumpPolicyRevision(userId: string): number {
    const revision = (this.policyRevisions.get(userId) ?? 0) + 1;
    this.policyRevisions.set(userId, revision);
    return revision;
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
      this.policyRevisions.set(user.id, 0);
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
      const currentPolicyRevision = this.policyRevisions.get(input.userId) ?? 0;
      if (currentPolicyRevision !== input.leasePayload.policyVersion) {
        throw new Error(
          `Policy revision changed before unlock commit: expected ${input.leasePayload.policyVersion}, current ${currentPolicyRevision}`,
        );
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
        leasePayload: input.leasePayload,
        leaseAlgorithm: input.leaseAlgorithm,
        leaseKeyId: input.leaseKeyId,
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


  async getPolicy(userId: string) {
    await this.applyPendingChanges(userId);
    const blockedApps = [...this.blockedApps.values()].filter(
      (app) => app.userId === userId && app.isActive,
    );
    const blockedSites = [...this.blockedSites.values()].filter(
      (site) => site.userId === userId && site.isActive,
    );
    return {
      version: this.policyRevisions.get(userId) ?? 0,
      updatedAt: new Date().toISOString(),
      blockedApps,
      blockedSites,
    };
  }

  private async applyPendingChanges(userId: string): Promise<void> {
    await this.exclusive(() => {
      const now = new Date().toISOString();
      let changed = false;
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
        changed = true;
      }
      if (changed) this.bumpPolicyRevision(userId);
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
        this.bumpPolicyRevision(app.userId);
        return existing;
      }
      this.blockedApps.set(app.id, app);
      this.bumpPolicyRevision(app.userId);
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
        this.bumpPolicyRevision(site.userId);
        return existing;
      }
      this.blockedSites.set(site.id, site);
      this.bumpPolicyRevision(site.userId);
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
  private rewardPolicyKey(userId: string, activityType: RewardActivityType): string {
    return `${userId}:${activityType}`;
  }

  private ensureRewardPolicies(userId: string): void {
    const now = new Date().toISOString();
    for (const [activityType, defaults] of Object.entries(DEFAULT_REWARD_POLICIES) as [
      RewardActivityType,
      (typeof DEFAULT_REWARD_POLICIES)[RewardActivityType],
    ][]) {
      const key = this.rewardPolicyKey(userId, activityType);
      if (!this.rewardPolicies.has(key)) {
        this.rewardPolicies.set(key, {
          id: randomUUID(),
          userId,
          activityType,
          ...defaults,
          updatedAt: now,
        });
      }
    }
  }

  private applyPendingRewardPolicyChanges(userId: string): void {
    const now = new Date().toISOString();
    for (const change of this.pendingRewardPolicyChanges.values()) {
      if (
        change.userId !== userId ||
        change.isCancelled ||
        change.isExecuted ||
        change.effectiveAt > now
      ) {
        continue;
      }
      const policy = this.rewardPolicies.get(this.rewardPolicyKey(userId, change.activityType));
      if (!policy) continue;
      Object.assign(policy, change.proposedPolicy, { updatedAt: now });
      change.isExecuted = true;
    }
  }

  async getRewardPolicies(userId: string): Promise<RewardPolicyRow[]> {
    return this.exclusive(() => {
      this.ensureRewardPolicies(userId);
      this.applyPendingRewardPolicyChanges(userId);
      return [...this.rewardPolicies.values()].filter((policy) => policy.userId === userId);
    });
  }

  async getRewardPolicy(userId: string, activityType: RewardActivityType): Promise<RewardPolicyRow> {
    return this.exclusive(() => {
      this.ensureRewardPolicies(userId);
      this.applyPendingRewardPolicyChanges(userId);
      const policy = this.rewardPolicies.get(this.rewardPolicyKey(userId, activityType));
      if (!policy) throw new Error('Reward policy not found');
      return policy;
    });
  }

  async updateRewardPolicy(
    userId: string,
    activityType: RewardActivityType,
    request: UpdateRewardPolicyRequest,
  ): Promise<RewardPolicyUpdateResult> {
    return this.exclusive(() => {
      this.ensureRewardPolicies(userId);
      this.applyPendingRewardPolicyChanges(userId);
      const policy = this.rewardPolicies.get(this.rewardPolicyKey(userId, activityType));
      if (!policy) throw new Error('Reward policy not found');
      const isWeakening =
        request.maxRewardSeconds > policy.maxRewardSeconds ||
        request.dailyCapSeconds > policy.dailyCapSeconds ||
        request.minimumVerifiedSeconds < policy.minimumVerifiedSeconds ||
        request.rewardRatioBasisPoints > policy.rewardRatioBasisPoints ||
        (policy.requiresMovement && !request.requiresMovement);
      if (!isWeakening) {
        for (const pending of this.pendingRewardPolicyChanges.values()) {
          if (pending.userId === userId && pending.activityType === activityType && !pending.isCancelled && !pending.isExecuted) {
            pending.isCancelled = true;
          }
        }
        Object.assign(policy, request, { updatedAt: new Date().toISOString() });
        return { policy, pendingChange: null };
      }
      const existing = [...this.pendingRewardPolicyChanges.values()].find(
        (change) =>
          change.userId === userId &&
          change.activityType === activityType &&
          !change.isCancelled &&
          !change.isExecuted,
      );
      if (existing) return { policy, pendingChange: existing };
      const pending: PendingRewardPolicyChangeRow = {
        id: randomUUID(),
        userId,
        rewardPolicyId: policy.id,
        activityType,
        proposedPolicy: request,
        requestedAt: new Date().toISOString(),
        effectiveAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        isCancelled: false,
        isExecuted: false,
      };
      this.pendingRewardPolicyChanges.set(pending.id, pending);
      return { policy, pendingChange: pending };
    });
  }

  async getPendingRewardPolicyChanges(userId: string): Promise<PendingRewardPolicyChangeRow[]> {
    return this.exclusive(() => {
      this.applyPendingRewardPolicyChanges(userId);
      return [...this.pendingRewardPolicyChanges.values()].filter(
        (change) => change.userId === userId && !change.isCancelled && !change.isExecuted,
      );
    });
  }

  async cancelPendingRewardPolicyChange(userId: string, changeId: string): Promise<boolean> {
    return this.exclusive(() => {
      const change = this.pendingRewardPolicyChanges.get(changeId);
      if (!change || change.userId !== userId || change.isCancelled || change.isExecuted) return false;
      change.isCancelled = true;
      return true;
    });
  }

  private dailyRewardKey(userId: string, activityType: RewardActivityType, date: string): string {
    return `${userId}:${activityType}:${date}`;
  }

  private creditCappedUnsafe(
    userId: string,
    activityType: RewardActivityType,
    requestedSeconds: number,
    idempotencyKey: string,
    description: string,
    deviceId?: string | null,
  ): { transaction: TransactionRow; balance: TimeBankBalance } {
    const existing = this.findTransaction(userId, idempotencyKey);
    if (existing) return { transaction: existing, balance: this.balance(userId) };
    this.ensureRewardPolicies(userId);
    const policy = this.rewardPolicies.get(this.rewardPolicyKey(userId, activityType));
    if (!policy) throw new Error('Reward policy not found');
    const rewardDate = new Date().toISOString().slice(0, 10);
    const key = this.dailyRewardKey(userId, activityType, rewardDate);
    const total = this.dailyRewardTotals.get(key) ?? {
      userId,
      activityType,
      rewardDate,
      awardedSeconds: 0,
      updatedAt: new Date().toISOString(),
    };
    const capRemaining = Math.max(0, policy.dailyCapSeconds - total.awardedSeconds);
    const requested = Math.min(requestedSeconds, policy.maxRewardSeconds);
    const allowed = Math.min(requested, capRemaining);
    total.awardedSeconds += allowed;
    total.updatedAt = new Date().toISOString();
    this.dailyRewardTotals.set(key, total);
    return this.creditPointsUnsafe(userId, {
      source: activityType === 'focus' ? 'focus' : activityType === 'photo' ? 'task' : activityType === 'manual' ? 'manual' : activityType,
      seconds: allowed,
      description,
      deviceId,
      idempotencyKey,
    });
  }

  async startFocusSession(input: FocusSessionStartInput): Promise<FocusSessionRow> {
    return this.exclusive(() => {
      const replay = [...this.focusSessions.values()].find(
        (session) => session.userId === input.userId && session.startIdempotencyKey === input.idempotencyKey,
      );
      if (replay) return replay;
      const device = this.devices.get(input.deviceId);
      if (!device || device.userId !== input.userId) throw new Error('Device does not belong to this user');
      if ([...this.focusSessions.values()].some((session) => session.userId === input.userId && session.status === 'active')) {
        throw new Error('Another focus session is already active');
      }
      const now = new Date().toISOString();
      const session: FocusSessionRow = {
        id: input.id,
        userId: input.userId,
        deviceId: input.deviceId,
        associatedTaskId: input.associatedTaskId ?? null,
        plannedDurationSeconds: input.plannedDurationSeconds,
        serverStartedAt: now,
        serverCompletedAt: null,
        lastHeartbeatAt: null,
        clientStartedMonotonicMs: input.clientStartedMonotonicMs ?? null,
        status: 'active',
        observedDurationSeconds: 0,
        rewardSeconds: 0,
        rewardClaimed: false,
        startIdempotencyKey: input.idempotencyKey,
        completionIdempotencyKey: null,
        createdAt: now,
      };
      this.focusSessions.set(session.id, session);
      return session;
    });
  }

  async heartbeatFocusSession(input: FocusHeartbeatInput): Promise<FocusSessionRow> {
    return this.exclusive(() => {
      const session = this.focusSessions.get(input.sessionId);
      if (!session || session.userId !== input.userId || session.deviceId !== input.deviceId) {
        throw new Error('Focus session does not belong to this device');
      }
      if (session.status !== 'active') throw new Error('Focus session is no longer active');
      const now = new Date();
      const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(session.serverStartedAt).getTime()) / 1000));
      session.observedDurationSeconds = Math.min(session.plannedDurationSeconds, elapsed);
      session.lastHeartbeatAt = now.toISOString();
      return session;
    });
  }

  async completeFocusSession(input: FocusCompletionInput): Promise<FocusCompletionResult> {
    return this.exclusive(() => {
      const session = this.focusSessions.get(input.sessionId);
      if (!session || session.userId !== input.userId || session.deviceId !== input.deviceId) {
        throw new Error('Focus session does not belong to this device');
      }
      if (session.status === 'completed') {
        if (session.completionIdempotencyKey !== input.idempotencyKey) throw new Error('Focus session already completed');
        return { session, balance: session.rewardClaimed ? this.balance(input.userId) : undefined };
      }
      if (session.status !== 'active') throw new Error('Focus session cannot be completed');
      const now = new Date();
      const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(session.serverStartedAt).getTime()) / 1000));
      session.observedDurationSeconds = Math.min(session.plannedDurationSeconds, elapsed);
      const policy = this.rewardPolicies.get(this.rewardPolicyKey(input.userId, 'focus'));
      if (!policy) {
        this.ensureRewardPolicies(input.userId);
      }
      const focusPolicy = this.rewardPolicies.get(this.rewardPolicyKey(input.userId, 'focus'))!;
      session.rewardSeconds =
        session.observedDurationSeconds >= focusPolicy.minimumVerifiedSeconds
          ? Math.min(
              focusPolicy.maxRewardSeconds,
              Math.floor((session.observedDurationSeconds * focusPolicy.rewardRatioBasisPoints) / 10_000),
            )
          : 0;
      session.status = 'completed';
      session.serverCompletedAt = now.toISOString();
      session.completionIdempotencyKey = input.idempotencyKey;
      if (session.associatedTaskId) return { session };
      const credited = this.creditCappedUnsafe(
        input.userId,
        'focus',
        session.rewardSeconds,
        `focus-session-${session.id}`,
        `Verified focus session (${session.observedDurationSeconds}s)`,
        input.deviceId,
      );
      session.rewardClaimed = true;
      return { session, balance: credited.balance };
    });
  }

  async abandonFocusSession(input: FocusAbandonInput): Promise<FocusSessionRow> {
    return this.exclusive(() => {
      const session = this.focusSessions.get(input.sessionId);
      if (!session || session.userId !== input.userId || session.deviceId !== input.deviceId) {
        throw new Error('Focus session does not belong to this device');
      }
      if (session.status === 'abandoned') {
        if (session.completionIdempotencyKey !== input.idempotencyKey) throw new Error('Focus session already abandoned');
        return session;
      }
      if (session.status !== 'active') throw new Error('Focus session cannot be abandoned');
      session.status = 'abandoned';
      session.serverCompletedAt = new Date().toISOString();
      session.completionIdempotencyKey = input.idempotencyKey;
      session.rewardSeconds = 0;
      session.rewardClaimed = true;
      return session;
    });
  }

  async getFocusSession(userId: string, sessionId: string): Promise<FocusSessionRow | null> {
    const session = this.focusSessions.get(sessionId);
    return session && session.userId === userId ? session : null;
  }

  async submitPhotoEvidence(input: PhotoEvidenceSubmissionInput): Promise<PhotoEvidenceRow> {
    return this.exclusive(() => {
      const replay = [...this.photoEvidence.values()].find(
        (evidence) => evidence.userId === input.userId && evidence.idempotencyKey === input.idempotencyKey,
      );
      if (replay) return replay;
      const task = this.tasks.get(input.taskId);
      const device = this.devices.get(input.deviceId);
      if (!task || task.userId !== input.userId || task.evidenceType !== 'photo') {
        throw new Error('Photo evidence task is invalid');
      }
      if (!device || device.userId !== input.userId) throw new Error('Device does not belong to this user');
      if ([...this.photoEvidence.values()].some(
        (evidence) => evidence.userId === input.userId && evidence.taskId === input.taskId && evidence.occurrenceDate === input.occurrenceDate,
      )) {
        throw new Error('Photo evidence already submitted for this occurrence');
      }
      const evidence: PhotoEvidenceRow = {
        ...input,
        sourceUri: input.sourceUri ?? null,
        createdAt: new Date().toISOString(),
      };
      this.photoEvidence.set(evidence.id, evidence);
      return evidence;
    });
  }

  async completeTaskWithEvidence(input: CompleteTaskEvidenceInput): Promise<TaskCompletionResult> {
    return this.exclusive(() => {
      const task = this.tasks.get(input.taskId);
      if (!task || task.userId !== input.userId || !task.isActive) throw new Error('Task not found');
      const existing = [...this.taskOccurrences.values()].find(
        (occurrence) => occurrence.taskId === input.taskId && occurrence.occurrenceDate === input.occurrenceDate,
      );
      if (existing) {
        if (existing.idempotencyKey === input.idempotencyKey) return { occurrence: existing, balance: this.balance(input.userId) };
        throw new Error('Reward has already been claimed for this task occurrence date');
      }
      let rewardSeconds = task.rewardSeconds;
      let activityType: RewardActivityType = task.evidenceType === 'none' ? 'manual' : task.evidenceType === 'photo' ? 'photo' : 'focus';
      if (task.evidenceType === 'focus_timer') {
        if (!input.focusSessionId) throw new Error('Completed verified focus session is required');
        const session = this.focusSessions.get(input.focusSessionId);
        if (!session || session.userId !== input.userId || session.associatedTaskId !== task.id || session.status !== 'completed') {
          throw new Error('Focus evidence session is invalid for this task');
        }
        if (input.deviceId && session.deviceId !== input.deviceId) throw new Error('Focus evidence belongs to another device');
        if (this.taskEvidenceConsumptions.has(`focus:${session.id}`)) throw new Error('Focus evidence session was already consumed');
        rewardSeconds = session.rewardSeconds;
      } else if (task.evidenceType === 'photo') {
        if (!input.photoEvidenceId) throw new Error('Photo evidence is required');
        const evidence = this.photoEvidence.get(input.photoEvidenceId);
        if (!evidence || evidence.userId !== input.userId || evidence.taskId !== task.id || evidence.occurrenceDate !== input.occurrenceDate) {
          throw new Error('Photo evidence is invalid for this task occurrence');
        }
        if (input.deviceId && evidence.deviceId !== input.deviceId) throw new Error('Photo evidence belongs to another device');
        if ([...this.taskEvidenceConsumptions.values()].some((consumption) => consumption.photoEvidenceId === evidence.id)) {
          throw new Error('Photo evidence was already consumed');
        }
      }
      const now = new Date().toISOString();
      const occurrence: TaskOccurrenceRow = {
        id: input.id,
        taskId: input.taskId,
        userId: input.userId,
        occurrenceDate: input.occurrenceDate,
        completedAt: now,
        evidenceUrl: null,
        evidenceSha256: null,
        evidenceSessionId: input.focusSessionId ?? null,
        photoEvidenceId: input.photoEvidenceId ?? null,
        rewardSeconds,
        rewardClaimed: true,
        createdAt: now,
        idempotencyKey: input.idempotencyKey,
      };
      const credited = this.creditCappedUnsafe(
        input.userId,
        activityType,
        rewardSeconds,
        input.idempotencyKey,
        `Completed task: ${task.title} (${input.occurrenceDate})`,
        input.deviceId,
      );
      occurrence.rewardSeconds = credited.transaction.seconds;
      this.taskOccurrences.set(occurrence.id, occurrence);
      if (input.focusSessionId) {
        const session = this.focusSessions.get(input.focusSessionId);
        if (session) {
          session.rewardClaimed = true;
          this.taskEvidenceConsumptions.set(`focus:${session.id}`, {
            id: randomUUID(),
            taskOccurrenceId: occurrence.id,
            focusSessionId: session.id,
            photoEvidenceId: null,
            consumedAt: now,
          });
        }
      }
      if (input.photoEvidenceId) {
        this.taskEvidenceConsumptions.set(`photo:${input.photoEvidenceId}`, {
          id: randomUUID(),
          taskOccurrenceId: occurrence.id,
          focusSessionId: null,
          photoEvidenceId: input.photoEvidenceId,
          consumedAt: now,
        });
      }
      return { occurrence, balance: credited.balance };
    });
  }

  async recordLocationEvidence(event: LocationEventRow): Promise<LocationEvidenceResult> {
    return this.exclusive(() => {
      if (this.locationEvents.some((candidate) => candidate.userId === event.userId && candidate.idempotencyKey === event.idempotencyKey)) {
        const existing = this.locationEvents.find((candidate) => candidate.userId === event.userId && candidate.idempotencyKey === event.idempotencyKey)!;
        return { event: existing, rewardGranted: false };
      }
      const device = this.devices.get(event.deviceId);
      if (!device || device.userId !== event.userId) throw new Error('Device does not belong to this user');
      const now = new Date().toISOString();
      let session = [...this.locationSessions.values()].find(
        (candidate) =>
          candidate.userId === event.userId &&
          candidate.deviceId === event.deviceId &&
          candidate.locationType === event.locationType &&
          candidate.placeIdentifier === event.placeIdentifier &&
          candidate.status === 'active',
      );
      let rewardGranted = false;
      let balance: TimeBankBalance | undefined;
      if (event.eventType === 'enter' && !session) {
        session = {
          id: randomUUID(),
          userId: event.userId,
          deviceId: event.deviceId,
          locationType: event.locationType,
          placeIdentifier: event.placeIdentifier,
          status: 'active',
          serverStartedAt: now,
          serverLastSeenAt: now,
          serverEndedAt: null,
          clientEnteredAt: event.clientOccurredAt ?? null,
          clientExitedAt: null,
          stepDelta: 0,
          activeSeconds: 0,
          sampleCount: 0,
          rewardSeconds: 0,
          rewardClaimed: false,
          createdAt: now,
        };
        this.locationSessions.set(session.id, session);
      }
      if (!session) {
        const orphan = { ...event, locationSessionId: null };
        this.locationEvents.push(orphan);
        return { event: orphan, rewardGranted: false };
      }
      session.serverLastSeenAt = now;
      session.stepDelta += event.stepDelta;
      session.activeSeconds += event.activeSeconds;
      session.sampleCount += event.sampleCount;
      const eventWithSession = { ...event, locationSessionId: session.id };
      this.locationEvents.push(eventWithSession);
      if (event.eventType !== 'exit') return { event: eventWithSession, session, rewardGranted: false };
      session.status = 'completed';
      session.serverEndedAt = now;
      session.clientExitedAt = event.clientOccurredAt ?? null;
      const durationSeconds = Math.max(
        0,
        Math.floor((new Date(now).getTime() - new Date(session.serverStartedAt).getTime()) / 1000),
      );
      const activityType: RewardActivityType = event.locationType === 'gym' ? 'gym' : event.locationType === 'home' ? 'outside' : 'manual';
      const policy = this.rewardPolicies.get(this.rewardPolicyKey(event.userId, activityType)) ?? (() => {
        this.ensureRewardPolicies(event.userId);
        return this.rewardPolicies.get(this.rewardPolicyKey(event.userId, activityType))!;
      })();
      const movementQualifies =
        !policy.requiresMovement ||
        (session.stepDelta > 0 && session.activeSeconds > 0 && session.sampleCount > 0 && session.stepDelta >= Math.max(1, Math.floor(durationSeconds / 60)));
      if (durationSeconds >= policy.minimumVerifiedSeconds && movementQualifies) {
        session.rewardSeconds = Math.min(
          policy.maxRewardSeconds,
          Math.floor((durationSeconds * policy.rewardRatioBasisPoints) / 10_000),
        );
        const credited = this.creditCappedUnsafe(
          event.userId,
          activityType,
          session.rewardSeconds,
          event.idempotencyKey,
          `Verified ${activityType} session (${durationSeconds}s)`,
          event.deviceId,
        );
        session.rewardClaimed = true;
        rewardGranted = credited.transaction.seconds > 0;
        balance = credited.balance;
      } else {
        session.rewardClaimed = true;
      }
      return { event: eventWithSession, session, rewardGranted, balance };
    });
  }
}

export const db = new MemoryStore();
