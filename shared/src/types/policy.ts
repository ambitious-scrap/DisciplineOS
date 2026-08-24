import { z } from 'zod';
import { DevicePlatformSchema } from './auth.js';

export interface BlockedApp {
  id: string;
  userId: string;
  platform: 'android' | 'macos';
  identifier: string; // package name e.g. 'com.instagram.android'
  displayName: string;
  isActive: boolean;
  createdAt: string;
}

export const CreateBlockedAppSchema = z.object({
  platform: DevicePlatformSchema,
  identifier: z.string().min(1),
  displayName: z.string().min(1),
});
export type CreateBlockedAppRequest = z.infer<typeof CreateBlockedAppSchema>;

export interface BlockedSite {
  id: string;
  userId: string;
  domain: string; // e.g. 'reddit.com'
  isActive: boolean;
  createdAt: string;
}

export const CreateBlockedSiteSchema = z.object({
  domain: z.string().min(3).regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid domain format'),
});
export type CreateBlockedSiteRequest = z.infer<typeof CreateBlockedSiteSchema>;

export interface PolicyProfile {
  version: number;
  updatedAt: string;
  blockedApps: BlockedApp[];
  blockedSites: BlockedSite[];
}
