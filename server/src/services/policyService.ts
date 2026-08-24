import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import type {
  BlockedApp,
  BlockedSite,
  PolicyProfile,
  CreateBlockedAppRequest,
  CreateBlockedSiteRequest,
} from '@disciplineos/shared';

export class PolicyService {
  async getPolicy(userId: string): Promise<PolicyProfile> {
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

  async addBlockedApp(userId: string, req: CreateBlockedAppRequest): Promise<BlockedApp> {
    // Check if already exists
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

  async removeBlockedApp(userId: string, appId: string): Promise<boolean> {
    const app = db.blockedApps.get(appId);
    if (!app || app.userId !== userId) {
      return false;
    }
    return db.blockedApps.delete(appId);
  }

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

  async removeBlockedSite(userId: string, siteId: string): Promise<boolean> {
    const site = db.blockedSites.get(siteId);
    if (!site || site.userId !== userId) {
      return false;
    }
    return db.blockedSites.delete(siteId);
  }
}

export const policyService = new PolicyService();
