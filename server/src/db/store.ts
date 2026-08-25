import type {
  PolicyChangeAction,
  PolicyProfile,
  ReconcileReservesRequest,
  ReconcileReservesResponse,
  TimeBankBalance,
  TransactionSource,
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

export interface CreditPointsInput {
  source: TransactionSource;
  seconds: number;
  description?: string;
  deviceId?: string | null;
  idempotencyKey?: string;
}

export interface SpendPointsInput {
  seconds: number;
  targetType: 'app' | 'site';
  targetIdentifier: string;
  deviceId: string;
  idempotencyKey: string;
  source?: 'usage' | 'emergency';
  description?: string;
}

export interface UnlockSessionInput {
  id: string;
  userId: string;
  deviceId: string;
  unlockType: 'app' | 'site' | 'focus';
  identifier: string;
  durationSeconds: number;
  startedAt: string;
  expiresAt: string;
  isEmergency: boolean;
  leaseSignature: string;
  idempotencyKey: string;
  costSeconds: number;
  ledgerSource?: 'usage' | 'emergency';
  ledgerDescription?: string;
}

export interface LocationRewardRule {
  source: 'gym' | 'outside';
  rewardSeconds: number;
  minimumDurationSeconds: number;
  requiresMovement: boolean;
  descriptionPrefix: string;
}

export interface LocationEventResult {
  id: string;
  rewardGranted: boolean;
  balance?: TimeBankBalance;
}

export interface DisciplineStore {
  registerUser(user: UserRow, timeBank: TimeBankRow): Promise<void>;
  getUserByEmail(email: string): Promise<UserRow | null>;
  getUserById(userId: string): Promise<UserRow | null>;
  createDevice(device: DeviceRow): Promise<void>;
  getDevices(userId: string): Promise<DeviceRow[]>;

  getBalance(userId: string): Promise<TimeBankBalance>;
  creditPoints(
    userId: string,
    input: CreditPointsInput,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }>;
  spendPoints(
    userId: string,
    input: SpendPointsInput,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }>;
  getDevice(userId: string, deviceId: string): Promise<DeviceRow | null>;
  getTransactions(userId: string, limit: number): Promise<TransactionRow[]>;

  createUnlockSession(input: UnlockSessionInput): Promise<ActiveUnlockRow>;
  getActiveUnlock(userId: string): Promise<ActiveUnlockRow | null>;
  releaseUnlock(userId: string, sessionId: string, deviceId: string): Promise<boolean>;

  getTasks(userId: string): Promise<TaskRow[]>;
  getTask(userId: string, taskId: string): Promise<TaskRow | null>;
  createTask(task: TaskRow): Promise<void>;
  completeTaskOccurrence(
    userId: string,
    taskId: string,
    occurrence: TaskOccurrenceRow,
    credit: CreditPointsInput,
  ): Promise<{ occurrence: TaskOccurrenceRow; balance: TimeBankBalance }>;

  getPolicy(userId: string): Promise<PolicyProfile>;
  addBlockedApp(app: BlockedAppRow): Promise<BlockedAppRow>;
  addBlockedSite(site: BlockedSiteRow): Promise<BlockedSiteRow>;
  requestPolicyRemoval(input: {
    userId: string;
    action: PolicyChangeAction;
    targetId: string;
    targetDescription: string;
    effectiveAt: string;
  }): Promise<PendingPolicyChangeRow>;
  getPendingPolicyChanges(userId: string): Promise<PendingPolicyChangeRow[]>;
  cancelPendingPolicyChange(userId: string, changeId: string): Promise<boolean>;

  allocateReserve(reserve: DeviceReserveRow): Promise<DeviceReserveRow>;
  reconcileReserve(userId: string, input: ReconcileReservesRequest): Promise<ReconcileReservesResponse>;
  getActiveReserves(userId: string): Promise<DeviceReserveRow[]>;

  recordProtectionEvent(event: ProtectionEventRow): Promise<void>;
  getProtectionEvents(userId: string, limit: number): Promise<ProtectionEventRow[]>;
  recordLocationEvent(
    event: LocationEventRow,
    reward: LocationRewardRule | undefined,
  ): Promise<LocationEventResult>;
}
