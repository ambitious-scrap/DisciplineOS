import type {
  DevicePlatform,
  EvidenceType,
  FocusSessionStatus,
  LeasePayload,
  LocationEventType,
  PolicyChangeAction,
  ProtectionDegradedType,
  RewardActivityType,
  TransactionSource,
  TransactionType,
  UnlockType,
} from '@disciplineos/shared';
export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface DeviceRow {
  id: string;
  userId: string;
  name: string;
  platform: DevicePlatform;
  pushToken?: string | null;
  lastSeenAt: string;
  isEnforced: boolean;
  createdAt: string;
}

export interface TimeBankRow {
  userId: string;
  balanceSeconds: number;
  maxSeconds: number;
  lastDecayAt: string;
  updatedAt: string;
}

export interface TransactionRow {
  id: string;
  userId: string;
  type: TransactionType;
  source: TransactionSource;
  seconds: number;
  description?: string | null;
  deviceId?: string | null;
  idempotencyKey?: string | null;
  createdAt: string;
}

export interface TaskRow {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  rewardSeconds: number;
  evidenceType: EvidenceType;
  isRecurring: boolean;
  recurrenceCron?: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface TaskOccurrenceRow {
  id: string;
  taskId: string;
  userId: string;
  occurrenceDate: string;
  completedAt?: string | null;
  evidenceUrl?: string | null;
  evidenceSha256?: string | null;
  evidenceSessionId?: string | null;
  photoEvidenceId?: string | null;
  rewardSeconds?: number;
  rewardClaimed: boolean;
  createdAt: string;
  idempotencyKey: string;
}

export interface BlockedAppRow {
  id: string;
  userId: string;
  platform: DevicePlatform;
  identifier: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
}

export interface BlockedSiteRow {
  id: string;
  userId: string;
  domain: string;
  isActive: boolean;
  createdAt: string;
}

export interface PendingPolicyChangeRow {
  id: string;
  userId: string;
  action: PolicyChangeAction;
  targetId: string;
  targetDescription: string;
  requestedAt: string;
  effectiveAt: string;
  isCancelled: boolean;
  isExecuted: boolean;
}

export interface ActiveUnlockRow {
  id: string;
  userId: string;
  deviceId: string;
  unlockType: UnlockType;
  identifier: string;
  durationSeconds: number;
  startedAt: string;
  expiresAt: string;
  isEmergency: boolean;
  leaseSignature: string;
  leasePayload?: LeasePayload | null;
  leaseAlgorithm?: 'Ed25519' | null;
  leaseKeyId?: string | null;
  status: 'active' | 'expired' | 'released' | 'cancelled';
  idempotencyKey: string;
}

export interface DeviceReserveRow {
  id: string;
  userId: string;
  deviceId: string;
  reservedSeconds: number;
  remainingSeconds: number;
  expiresAt: string;
  createdAt: string;
  idempotencyKey: string;
}

export interface OfflineEventRow {
  id: string;
  userId: string;
  deviceId: string;
  reserveId: string;
  targetType: 'app' | 'site';
  targetIdentifier: string;
  secondsSpent: number;
  localTimestamp: string;
  isEmergency: boolean;
  reconciledAt: string;
}

export interface ProtectionEventRow {
  id: string;
  userId: string;
  deviceId: string;
  eventType: ProtectionDegradedType;
  details?: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface LocationEventRow {
  id: string;
  userId: string;
  deviceId: string;
  locationSessionId?: string | null;
  locationType: 'home' | 'gym' | 'custom';
  placeIdentifier: string;
  eventType: LocationEventType;
  stepDelta: number;
  activeSeconds: number;
  sampleCount: number;
  clientOccurredAt?: string | null;
  clientMonotonicMs?: number | null;
  // Legacy diagnostic fields retained for adapters; never used as reward authority.
  dwellSeconds?: number;
  movementVerified: boolean;
  occurredAt: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface RewardPolicyRow {
  id: string;
  userId: string;
  activityType: RewardActivityType;
  maxRewardSeconds: number;
  dailyCapSeconds: number;
  minimumVerifiedSeconds: number;
  rewardRatioBasisPoints: number;
  requiresMovement: boolean;
  updatedAt: string;
}

export interface PendingRewardPolicyChangeRow {
  id: string;
  userId: string;
  rewardPolicyId: string;
  activityType: RewardActivityType;
  proposedPolicy: Pick<
    RewardPolicyRow,
    'maxRewardSeconds' | 'dailyCapSeconds' | 'minimumVerifiedSeconds' | 'rewardRatioBasisPoints' | 'requiresMovement'
  >;
  requestedAt: string;
  effectiveAt: string;
  isCancelled: boolean;
  isExecuted: boolean;
}

export interface DailyRewardTotalRow {
  userId: string;
  activityType: RewardActivityType;
  rewardDate: string;
  awardedSeconds: number;
  updatedAt: string;
}

export interface FocusSessionRow {
  id: string;
  userId: string;
  deviceId: string;
  associatedTaskId?: string | null;
  plannedDurationSeconds: number;
  serverStartedAt: string;
  serverCompletedAt?: string | null;
  lastHeartbeatAt?: string | null;
  clientStartedMonotonicMs?: number | null;
  status: FocusSessionStatus;
  observedDurationSeconds: number;
  rewardSeconds: number;
  rewardClaimed: boolean;
  startIdempotencyKey: string;
  completionIdempotencyKey?: string | null;
  createdAt: string;
}

export interface PhotoEvidenceRow {
  id: string;
  userId: string;
  deviceId: string;
  taskId: string;
  occurrenceDate: string;
  sha256: string;
  sourceUri?: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface TaskEvidenceConsumptionRow {
  id: string;
  taskOccurrenceId: string;
  focusSessionId?: string | null;
  photoEvidenceId?: string | null;
  consumedAt: string;
}

export interface LocationSessionRow {
  id: string;
  userId: string;
  deviceId: string;
  locationType: 'home' | 'gym' | 'custom';
  placeIdentifier: string;
  status: 'active' | 'completed' | 'abandoned' | 'expired';
  serverStartedAt: string;
  serverLastSeenAt: string;
  serverEndedAt?: string | null;
  clientEnteredAt?: string | null;
  clientExitedAt?: string | null;
  stepDelta: number;
  activeSeconds: number;
  sampleCount: number;
  rewardSeconds: number;
  rewardClaimed: boolean;
  createdAt: string;
}
