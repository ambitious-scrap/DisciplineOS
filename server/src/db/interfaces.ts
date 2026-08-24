import type {
  DevicePlatform,
  TransactionType,
  TransactionSource,
  EvidenceType,
  UnlockType,
  ProtectionDegradedType,
  LocationEventType,
  PolicyChangeAction,
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
  rewardClaimed: boolean;
  createdAt: string;
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
}

export interface DeviceReserveRow {
  id: string;
  userId: string;
  deviceId: string;
  reservedSeconds: number;
  remainingSeconds: number;
  expiresAt: string;
  createdAt: string;
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
  locationType: 'home' | 'gym' | 'custom';
  eventType: LocationEventType;
  dwellSeconds?: number;
  movementVerified: boolean;
  occurredAt: string;
  idempotencyKey: string;
  createdAt: string;
}
