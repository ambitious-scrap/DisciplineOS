import { Hono } from 'hono';
import { CreateBlockedAppSchema, CreateBlockedSiteSchema } from '@disciplineos/shared';
import { policyService } from '../services/policyService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

export const policyRoutes = new Hono<AppEnv>();
policyRoutes.use('*', authMiddleware);

policyRoutes.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const policy = await policyService.getPolicy(userId);
    return c.json(policy, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

policyRoutes.post('/apps', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = CreateBlockedAppSchema.parse(body);
    const app = await policyService.addBlockedApp(userId, validated);
    return c.json({ app }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

policyRoutes.delete('/apps/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const appId = c.req.param('id');
    const success = await policyService.removeBlockedApp(userId, appId);
    return c.json({ success }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

policyRoutes.post('/sites', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = CreateBlockedSiteSchema.parse(body);
    const site = await policyService.addBlockedSite(userId, validated);
    return c.json({ site }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

policyRoutes.delete('/sites/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const siteId = c.req.param('id');
    const success = await policyService.removeBlockedSite(userId, siteId);
    return c.json({ success }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
