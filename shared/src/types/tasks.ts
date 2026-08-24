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

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  rewardSeconds: z.number().int().positive().default(900), // default 15m
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
  rewardClaimed: boolean;
  createdAt: string;
}

export const CompleteTaskSchema = z.object({
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required'),
  evidenceUrl: z.string().url().optional(),
  evidenceMeta: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type CompleteTaskRequest = z.infer<typeof CompleteTaskSchema>;
