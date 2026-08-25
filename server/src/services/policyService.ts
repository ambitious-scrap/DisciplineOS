import { randomUUID } from 'node:crypto';
import type {
  BlockedApp,
  BlockedSite,
  CreateBlockedAppRequest,
  CreateBlockedSiteRequest,
  PendingPolicyChange,
  PolicyProfile,
} from '@disciplineos/shared';
import type { BlockedAppRow, BlockedSiteRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';

const COOLING_OFF_MS = 24 * 60 * 60 * 1000;

export class PolicyService {
  constructor(private readonly store: DisciplineStore) {}

  async getPolicy(userId: string): Promise<PolicyProfile> {
    return this.store.getPolicy(userId);
  }

  async addBlockedApp(userId: string, request: CreateBlockedAppRequest): Promise<BlockedApp> {
    const row: BlockedAppRow = {
      id: randomUUID(),
      userId,
      platform: request.platform,
      identifier: request.identifier,
      displayName: request.displayName,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    return this.store.addBlockedApp(row);
  }

  async requestRemoveBlockedApp(userId: string, appId: string): Promise<PendingPolicyChange> {
    const policy = await this.store.getPolicy(userId);
    const app = policy.blockedApps.find((candidate) => candidate.id === appId);
    if (!app) throw new Error('Blocked app not found');
    return this.store.requestPolicyRemoval({
      userId,
      action: 'unblock_app',
      targetId: appId,
      targetDescription: `${app.displayName} (${app.identifier})`,
      effectiveAt: new Date(Date.now() + COOLING_OFF_MS).toISOString(),
    });
  }

  async addBlockedSite(userId: string, request: CreateBlockedSiteRequest): Promise<BlockedSite> {
    const row: BlockedSiteRow = {
      id: randomUUID(),
      userId,
      domain: request.domain.toLowerCase().trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    return this.store.addBlockedSite(row);
  }

  async requestRemoveBlockedSite(userId: string, siteId: string): Promise<PendingPolicyChange> {
    const policy = await this.store.getPolicy(userId);
    const site = policy.blockedSites.find((candidate) => candidate.id === siteId);
    if (!site) throw new Error('Blocked site not found');
    return this.store.requestPolicyRemoval({
      userId,
      action: 'unblock_site',
      targetId: siteId,
      targetDescription: site.domain,
      effectiveAt: new Date(Date.now() + COOLING_OFF_MS).toISOString(),
    });
  }

  async getPendingChanges(userId: string): Promise<PendingPolicyChange[]> {
    return this.store.getPendingPolicyChanges(userId);
  }

  async cancelPendingChange(userId: string, changeId: string): Promise<boolean> {
    return this.store.cancelPendingPolicyChange(userId, changeId);
  }
}
