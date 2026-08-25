import type {
  PendingRewardPolicyChange,
  RewardActivityType,
  RewardPolicy,
  UpdateRewardPolicyRequest,
} from '@disciplineos/shared';
import type { PendingRewardPolicyChangeRow, RewardPolicyRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';

export class RewardPolicyService {
  constructor(private readonly store: DisciplineStore) {}

  private toPolicy(row: RewardPolicyRow): RewardPolicy {
    return row;
  }

  private toPending(row: PendingRewardPolicyChangeRow): PendingRewardPolicyChange {
    return row;
  }

  async getPolicies(userId: string): Promise<RewardPolicy[]> {
    return (await this.store.getRewardPolicies(userId)).map((policy) => this.toPolicy(policy));
  }

  async updatePolicy(
    userId: string,
    activityType: RewardActivityType,
    request: UpdateRewardPolicyRequest,
  ): Promise<{ policy: RewardPolicy; pendingChange?: PendingRewardPolicyChange }> {
    const result = await this.store.updateRewardPolicy(userId, activityType, request);
    return {
      policy: this.toPolicy(result.policy),
      pendingChange: result.pendingChange ? this.toPending(result.pendingChange) : undefined,
    };
  }

  async getPendingChanges(userId: string): Promise<PendingRewardPolicyChange[]> {
    return (await this.store.getPendingRewardPolicyChanges(userId)).map((change) => this.toPending(change));
  }

  async cancelPendingChange(userId: string, changeId: string): Promise<boolean> {
    return this.store.cancelPendingRewardPolicyChange(userId, changeId);
  }
}
