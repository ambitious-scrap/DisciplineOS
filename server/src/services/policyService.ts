import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import type {
  BlockedApp,
  BlockedSite,
  PolicyProfile,
  CreateBlockedAppRequest,
  CreateBlockedSiteRequest,
  PendingPolicyChange,
} from '@disciplineos/shared';

// Cooling-off delay for policy weakenings (24 hours default)
const COOLING_OFF_MS = 24 * 60 * 60 * 1000;

export class PolicyService {
  /**
   * Automatically apply matured cooling-off policy changes.
   */
  async applyPendingChanges(userId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const change of db.pendingPolicyChanges.values()) {
      if (change.userId === userId && !change.isCancelled && !change.isExecuted && change.effectiveAt <= now) {
        if (change.action === 'unblock_app') {
          db.blockedApps.delete(change.targetId);
        } else if (change.action === 'unblock_site') {
          db.blockedSites.delete(change.targetId);
        }
        change.isExecuted = true;
      }
    }
  }

  async getPolicy(userId: string): Promise<PolicyProfile> {
    await this.applyPendingChanges(userId);

    const blockedApps: BlockedApp[] = [];
    for (const app of db.blockedApps.values()) {
      if (app.userId === userId && app.isActive) {
        blockedApps.push({
          id: app.id,
          userId: app.userId,
          platform: app.platform,
          identifier: app.identifier,
          displayName: app.displayName,
          isActive: app.isActive,
          createdAt: app.createdAt,
        });
      }
    }

    const blockedSites: BlockedSite[] = [];
    for (const site of db.blockedSites.values()) {
      if (site.userId === userId && site.isActive) {
        blockedSites.push({
          id: site.id,
          userId: site.userId,
          domain: site.domain,
          isActive: site.isActive,
          createdAt: site.createdAt,
        });
      }
    }

    return {
      version: blockedApps.length + blockedSites.length + 1,
      updatedAt: new Date().toISOString(),
      blockedApps,
      blockedSites,
    };
  }

  /**
   * Stricter rule: Immediately add blocked application.
   */
  async addBlockedApp(userId: string, req: CreateBlockedAppRequest): Promise<BlockedApp> {
    for (const existing of db.blockedApps.values()) {
      if (existing.userId === userId && existing.platform === req.platform && existing.identifier === req.identifier) {
        existing.isActive = true;
        existing.displayName = req.displayName;
        return existing;
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const app: BlockedApp = {
      id,
      userId,
      platform: req.platform,
      identifier: req.identifier,
      displayName: req.displayName,
      isActive: true,
      createdAt: now,
    };

    db.blockedApps.set(id, app);
    return app;
  }

  /**
   * Weaker rule: Request removal of blocked app. Enforces 24h cooling-off delay.
   */
  async requestRemoveBlockedApp(userId: string, appId: string): Promise<PendingPolicyChange> {
    const app = db.blockedApps.get(appId);
    if (!app || app.userId !== userId) {
      throw new Error('Blocked app not found');
    }

    // Check if pending change already exists
    for (const change of db.pendingPolicyChanges.values()) {
      if (change.userId === userId && change.targetId === appId && !change.isCancelled && !change.isExecuted) {
        return change;
      }
    }

    const id = randomUUID();
    const now = new Date();
    const effectiveAt = new Date(now.getTime() + COOLING_OFF_MS).toISOString();

    const pendingChange: PendingPolicyChange = {
      id,
      userId,
      action: 'unblock_app',
      targetId: appId,
      targetDescription: `${app.displayName} (${app.identifier})`,
      requestedAt: now.toISOString(),
      effectiveAt,
      isCancelled: false,
      isExecuted: false,
    };

    db.pendingPolicyChanges.set(id, pendingChange);
    return pendingChange;
  }

  /**
   * Stricter rule: Immediately add blocked website.
   */
  async addBlockedSite(userId: string, req: CreateBlockedSiteRequest): Promise<BlockedSite> {
    const normalizedDomain = req.domain.toLowerCase().trim();

    for (const existing of db.blockedSites.values()) {
      if (existing.userId === userId && existing.domain === normalizedDomain) {
        existing.isActive = true;
        return existing;
      }
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const site: BlockedSite = {
      id,
      userId,
      domain: normalizedDomain,
      isActive: true,
      createdAt: now,
    };

    db.blockedSites.set(id, site);
    return site;
  }

  /**
   * Weaker rule: Request removal of blocked website. Enforces 24h cooling-off delay.
   */
  async requestRemoveBlockedSite(userId: string, siteId: string): Promise<PendingPolicyChange> {
    const site = db.blockedSites.get(siteId);
    if (!site || site.userId !== userId) {
      throw new Error('Blocked site not found');
    }

    for (const change of db.pendingPolicyChanges.values()) {
      if (change.userId === userId && change.targetId === siteId && !change.isCancelled && !change.isExecuted) {
        return change;
      }
    }

    const id = randomUUID();
    const now = new Date();
    const effectiveAt = new Date(now.getTime() + COOLING_OFF_MS).toISOString();

    const pendingChange: PendingPolicyChange = {
      id,
      userId,
      action: 'unblock_site',
      targetId: siteId,
      targetDescription: site.domain,
      requestedAt: now.toISOString(),
      effectiveAt,
      isCancelled: false,
      isExecuted: false,
    };

    db.pendingPolicyChanges.set(id, pendingChange);
    return pendingChange;
  }

  async getPendingChanges(userId: string): Promise<PendingPolicyChange[]> {
    await this.applyPendingChanges(userId);
    const changes: PendingPolicyChange[] = [];
    for (const change of db.pendingPolicyChanges.values()) {
      if (change.userId === userId && !change.isCancelled && !change.isExecuted) {
        changes.push({ ...change });
      }
    }
    return changes;
  }

  async cancelPendingChange(userId: string, changeId: string): Promise<boolean> {
    const change = db.pendingPolicyChanges.get(changeId);
    if (!change || change.userId !== userId) {
      return false;
    }
    change.isCancelled = true;
    return true;
  }
}

export const policyService = new PolicyService();
