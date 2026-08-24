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

policyRoutes.get('/pending', async (c) => {
  try {
    const userId = c.get('userId');
    const pendingChanges = await policyService.getPendingChanges(userId);
    return c.json({ pendingChanges }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

policyRoutes.post('/cancel-pending/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const changeId = c.req.param('id');
    const success = await policyService.cancelPendingChange(userId, changeId);
    return c.json({ success }, 200);
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
    return c.json({ app, status: 'active', message: 'Blocked app added immediately' }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Weaker rule deletion: Triggers 24-hour cooling-off period
policyRoutes.delete('/apps/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const appId = c.req.param('id');
    const pendingChange = await policyService.requestRemoveBlockedApp(userId, appId);
    return c.json(
      {
        status: 'pending',
        pendingChange,
        message: 'Policy weakening requested. 24-hour cooling-off period in effect before app is unblocked.',
      },
      202
    );
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
    return c.json({ site, status: 'active', message: 'Blocked site added immediately' }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

// Weaker rule deletion: Triggers 24-hour cooling-off period
policyRoutes.delete('/sites/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const siteId = c.req.param('id');
    const pendingChange = await policyService.requestRemoveBlockedSite(userId, siteId);
    return c.json(
      {
        status: 'pending',
        pendingChange,
        message: 'Policy weakening requested. 24-hour cooling-off period in effect before domain is unblocked.',
      },
      202
    );
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
