import { z } from 'zod';

export const TransactionTypeSchema = z.enum(['earn', 'spend']);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const TransactionSourceSchema = z.enum([
  'task',
  'focus',
  'gym',
  'outside',
  'manual',
  'usage',
  'emergency',
  'decay',
  'reserve_allocation',
  'reserve_reconciliation',
  'compensation',
]);
export type TransactionSource = z.infer<typeof TransactionSourceSchema>;

export interface TimeBankBalance {
  userId: string;
  balanceSeconds: number;
  maxSeconds: number;
  reservedSeconds: number;
  availableSeconds: number;
  lastDecayAt: string;
  updatedAt: string;
}

export interface LedgerTransaction {
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

export const SpendPointsSchema = z.object({
  seconds: z.number().int().positive(),
  targetType: z.enum(['app', 'site']),
  targetIdentifier: z.string().min(1),
  deviceId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type SpendPointsRequest = z.infer<typeof SpendPointsSchema>;

// Emergency Unlock: Server authoritatively calculates cost with non-negotiable 3.0x multiplier.
// Client MUST NOT specify multiplier.
export const EmergencyUnlockSchema = z.object({
  seconds: z.number().int().positive().default(300), // default 5 min
  targetType: z.enum(['app', 'site']),
  targetIdentifier: z.string().min(1),
  deviceId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type EmergencyUnlockRequest = z.infer<typeof EmergencyUnlockSchema>;
