import { z } from 'zod';

export const FocusSessionStatusSchema = z.enum(['active', 'completed', 'abandoned', 'expired']);
export type FocusSessionStatus = z.infer<typeof FocusSessionStatusSchema>;

export interface FocusSession {
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
  createdAt: string;
}

export const StartFocusSessionSchema = z.object({
  plannedDurationSeconds: z.number().int().min(300).max(14_400),
  associatedTaskId: z.string().uuid().optional(),
  clientStartedMonotonicMs: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(128),
}).strict();
export type StartFocusSessionRequest = z.infer<typeof StartFocusSessionSchema>;

export const FocusHeartbeatSchema = z.object({
  clientMonotonicMs: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(128),
}).strict();
export type FocusHeartbeatRequest = z.infer<typeof FocusHeartbeatSchema>;

export const CompleteFocusSessionSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
}).strict();
export type CompleteFocusSessionRequest = z.infer<typeof CompleteFocusSessionSchema>;

export const AbandonFocusSessionSchema = z.object({
  idempotencyKey: z.string().min(8).max(128),
}).strict();
export type AbandonFocusSessionRequest = z.infer<typeof AbandonFocusSessionSchema>;
