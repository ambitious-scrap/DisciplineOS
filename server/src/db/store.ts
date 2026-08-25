import type {
  LeasePayload,
  PolicyChangeAction,
  PolicyProfile,
  ReconcileReservesRequest,
  ReconcileReservesResponse,
  RewardActivityType,
  TimeBankBalance,
  TransactionSource,
  UpdateRewardPolicyRequest,
} from '@disciplineos/shared';
import type {
  ActiveUnlockRow,
  BlockedAppRow,
  BlockedSiteRow,
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
  leasePayload: LeasePayload;
  leaseAlgorithm: 'Ed25519';
  leaseKeyId: string;
  idempotencyKey: string;
  costSeconds: number;
  ledgerSource?: 'usage' | 'emergency';
  ledgerDescription?: string;
}

export interface FocusSessionStartInput {
  id: string;
  userId: string;
  deviceId: string;
  associatedTaskId?: string | null;
  plannedDurationSeconds: number;
  clientStartedMonotonicMs?: number | null;
  idempotencyKey: string;
}

export interface FocusHeartbeatInput {
  userId: string;
  deviceId: string;
  sessionId: string;
}

export interface FocusCompletionInput {
  userId: string;
  deviceId: string;
  sessionId: string;
  idempotencyKey: string;
}

export interface FocusCompletionResult {
  session: FocusSessionRow;
  balance?: TimeBankBalance;
}

export interface PhotoEvidenceSubmissionInput {
  id: string;
  userId: string;
  deviceId: string;
  taskId: string;
  occurrenceDate: string;
  sha256: string;
  sourceUri?: string | null;
  idempotencyKey: string;
}

export interface FocusAbandonInput {
  userId: string;
  deviceId: string;
  sessionId: string;
  idempotencyKey: string;
}

export interface CompleteTaskEvidenceInput {
  id: string;
  userId: string;
  deviceId?: string | null;
  taskId: string;
  occurrenceDate: string;
  focusSessionId?: string | null;
  photoEvidenceId?: string | null;
  idempotencyKey: string;
}

export interface TaskCompletionResult {
  occurrence: TaskOccurrenceRow;
  balance: TimeBankBalance;
}

export interface LocationEvidenceResult {
  event: LocationEventRow;
  session?: LocationSessionRow | null;
  rewardGranted: boolean;
  balance?: TimeBankBalance;
}

export interface RewardPolicyUpdateResult {
  policy: RewardPolicyRow;
  pendingChange?: PendingRewardPolicyChangeRow | null;
}

export interface DisciplineStore {
  registerUser(user: UserRow, timeBank: TimeBankRow): Promise<void>;
  getUserByEmail(email: string): Promise<UserRow | null>;
  getUserById(userId: string): Promise<UserRow | null>;
  createDevice(device: DeviceRow): Promise<void>;
  getDevices(userId: string): Promise<DeviceRow[]>;

  getBalance(userId: string): Promise<TimeBankBalance>;
  spendPoints(
    userId: string,
    input: SpendPointsInput,
  ): Promise<{ transaction: TransactionRow; balance: TimeBankBalance }>;
  getDevice(userId: string, deviceId: string): Promise<DeviceRow | null>;
  getTransactions(userId: string, limit: number): Promise<TransactionRow[]>;

  createUnlockSession(input: UnlockSessionInput): Promise<ActiveUnlockRow>;
  getActiveUnlock(userId: string): Promise<ActiveUnlockRow | null>;
  releaseUnlock(userId: string, sessionId: string, deviceId: string): Promise<boolean>;

  startFocusSession(input: FocusSessionStartInput): Promise<FocusSessionRow>;
  heartbeatFocusSession(input: FocusHeartbeatInput): Promise<FocusSessionRow>;
  completeFocusSession(input: FocusCompletionInput): Promise<FocusCompletionResult>;
  abandonFocusSession(input: FocusAbandonInput): Promise<FocusSessionRow>;
  getFocusSession(userId: string, sessionId: string): Promise<FocusSessionRow | null>;

  getTasks(userId: string): Promise<TaskRow[]>;
  getTask(userId: string, taskId: string): Promise<TaskRow | null>;
  createTask(task: TaskRow): Promise<void>;


  submitPhotoEvidence(input: PhotoEvidenceSubmissionInput): Promise<PhotoEvidenceRow>;
  completeTaskWithEvidence(input: CompleteTaskEvidenceInput): Promise<TaskCompletionResult>;
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

  getRewardPolicies(userId: string): Promise<RewardPolicyRow[]>;
  getRewardPolicy(userId: string, activityType: RewardActivityType): Promise<RewardPolicyRow>;
  updateRewardPolicy(
    userId: string,
    activityType: RewardActivityType,
    request: UpdateRewardPolicyRequest,
  ): Promise<RewardPolicyUpdateResult>;
  getPendingRewardPolicyChanges(userId: string): Promise<PendingRewardPolicyChangeRow[]>;
  cancelPendingRewardPolicyChange(userId: string, changeId: string): Promise<boolean>;

  allocateReserve(reserve: DeviceReserveRow): Promise<DeviceReserveRow>;
  reconcileReserve(userId: string, input: ReconcileReservesRequest): Promise<ReconcileReservesResponse>;
  getActiveReserves(userId: string): Promise<DeviceReserveRow[]>;

  recordProtectionEvent(event: ProtectionEventRow): Promise<void>;
  getProtectionEvents(userId: string, limit: number): Promise<ProtectionEventRow[]>;
  recordLocationEvidence(event: LocationEventRow): Promise<LocationEvidenceResult>;
}
