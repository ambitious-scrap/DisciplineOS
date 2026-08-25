import type { RewardActivityType } from '@disciplineos/shared';

export interface DefaultRewardPolicyConfig {
  maxRewardSeconds: number;
  dailyCapSeconds: number;
  minimumVerifiedSeconds: number;
  rewardRatioBasisPoints: number;
  requiresMovement: boolean;
}

export const DEFAULT_REWARD_POLICIES: Record<RewardActivityType, DefaultRewardPolicyConfig> = {
  manual: {
    maxRewardSeconds: 300,
    dailyCapSeconds: 1_800,
    minimumVerifiedSeconds: 0,
    rewardRatioBasisPoints: 10_000,
    requiresMovement: false,
  },
  photo: {
    maxRewardSeconds: 900,
    dailyCapSeconds: 1_800,
    minimumVerifiedSeconds: 0,
    rewardRatioBasisPoints: 10_000,
    requiresMovement: false,
  },
  focus: {
    maxRewardSeconds: 3_600,
    dailyCapSeconds: 3_600,
    minimumVerifiedSeconds: 1_500,
    rewardRatioBasisPoints: 3_000,
    requiresMovement: false,
  },
  gym: {
    maxRewardSeconds: 3_600,
    dailyCapSeconds: 3_600,
    minimumVerifiedSeconds: 1_800,
    rewardRatioBasisPoints: 10_000,
    requiresMovement: true,
  },
  outside: {
    maxRewardSeconds: 1_800,
    dailyCapSeconds: 1_800,
    minimumVerifiedSeconds: 3_600,
    rewardRatioBasisPoints: 10_000,
    requiresMovement: true,
  },
};
