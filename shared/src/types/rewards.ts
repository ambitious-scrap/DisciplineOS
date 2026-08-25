import { z } from 'zod';

export const RewardActivityTypeSchema = z.enum(['manual', 'photo', 'focus', 'gym', 'outside']);
export type RewardActivityType = z.infer<typeof RewardActivityTypeSchema>;

export interface RewardPolicy {
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

export const UpdateRewardPolicySchema = z.object({
  maxRewardSeconds: z.number().int().min(0).max(14_400),
  dailyCapSeconds: z.number().int().min(0).max(28_800),
  minimumVerifiedSeconds: z.number().int().min(0).max(14_400),
  rewardRatioBasisPoints: z.number().int().min(0).max(10_000),
  requiresMovement: z.boolean(),
});
export type UpdateRewardPolicyRequest = z.infer<typeof UpdateRewardPolicySchema>;

export interface PendingRewardPolicyChange {
  id: string;
  userId: string;
  rewardPolicyId: string;
  activityType: RewardActivityType;
  requestedAt: string;
  effectiveAt: string;
  isCancelled: boolean;
  isExecuted: boolean;
  proposedPolicy: Omit<RewardPolicy, 'id' | 'userId' | 'activityType' | 'updatedAt'>;
}
