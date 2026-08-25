import { z } from 'zod';

export const EvidenceTypeSchema = z.enum(['none', 'photo', 'focus_timer']);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  /** Server-derived maximum reward for this task's evidence class; never client input. */
  rewardSeconds: number;
  evidenceType: EvidenceType;
  isRecurring: boolean;
  recurrenceCron?: string | null;
  isActive: boolean;
  createdAt: string;
}

// Evidence-free tasks remain available for small manual wins; larger rewards require proof.
export const MAX_NO_EVIDENCE_REWARD_SECONDS = 300;

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  evidenceType: EvidenceTypeSchema.default('none'),
  isRecurring: z.boolean().default(false),
  recurrenceCron: z.string().optional(),
}).strict();
export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;

export interface TaskOccurrence {
  id: string;
  taskId: string;
  userId: string;
  occurrenceDate: string; // YYYY-MM-DD, interpreted by the server in UTC.
  completedAt?: string | null;
  evidenceUrl?: string | null;
  evidenceSha256?: string | null;
  evidenceSessionId?: string | null;
  photoEvidenceId?: string | null;
  rewardSeconds: number;
  rewardClaimed: boolean;
  createdAt: string;
}

export interface PhotoEvidence {
  id: string;
  userId: string;
  deviceId: string;
  taskId: string;
  occurrenceDate: string;
  sha256: string;
  sourceUri?: string | null;
  createdAt: string;
}

export const SubmitPhotoEvidenceSchema = z.object({
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required'),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/, 'SHA-256 hex digest required'),
  sourceUri: z.string().url().optional(),
  idempotencyKey: z.string().min(8).max(128),
}).strict();
export type SubmitPhotoEvidenceRequest = z.infer<typeof SubmitPhotoEvidenceSchema>;

export const CompleteTaskSchema = z.object({
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format required'),
  evidenceSessionId: z.string().uuid().optional(),
  photoEvidenceId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(128),
}).strict().superRefine((request, context) => {
  if (request.evidenceSessionId && request.photoEvidenceId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['evidenceSessionId'],
      message: 'Exactly one evidence reference may be supplied',
    });
  }
});
export type CompleteTaskRequest = z.infer<typeof CompleteTaskSchema>;
