import { z } from 'zod';

export const EvidenceTypeSchema = z.enum(['none', 'photo', 'focus_timer']);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export interface Task {
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

// Reward is strictly bounded between 1 min (60s) and 1 hour (3600s) to prevent unbounded minting
export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  rewardSeconds: z.number().int().min(60).max(3600).default(900), // 1m to 60m, default 15m
  evidenceType: EvidenceTypeSchema.default('none'),
  isRecurring: z.boolean().default(false),
  recurrenceCron: z.string().optional(),
});
export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;

export interface TaskOccurrence {
  id: string;
  taskId: string;
  userId: string;
  occurrenceDate: string; // YYYY-MM-DD
  completedAt?: string | null;
  evidenceUrl?: string | null;
  evidenceSha256?: string | null;
  rewardClaimed: boolean;
  createdAt: string;
}

export const CompleteTaskSchema = z.object({
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required'),
  evidenceUrl: z.string().url().optional(),
  evidenceSha256: z.string().min(64).max(64).optional(), // SHA-256 hash for photo proof
  evidenceMeta: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type CompleteTaskRequest = z.infer<typeof CompleteTaskSchema>;
