import { Hono } from 'hono';
import { CreateBlockedAppSchema, CreateBlockedSiteSchema } from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createPolicyRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.get('/', async (c) => {
    try {
      return c.json(await services.policy.getPolicy(c.get('userId')), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read policy';
      return c.json({ error: message }, 400);
    }
  });

  routes.get('/pending', async (c) => {
    try {
      return c.json({ pendingChanges: await services.policy.getPendingChanges(c.get('userId')) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read pending changes';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/cancel-pending/:id', async (c) => {
    try {
      const success = await services.policy.cancelPendingChange(c.get('userId'), c.req.param('id'));
      return c.json({ success }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not cancel pending change';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/apps', async (c) => {
    try {
      const validated = CreateBlockedAppSchema.parse(await c.req.json());
      const app = await services.policy.addBlockedApp(c.get('userId'), validated);
      return c.json({ app, status: 'active', message: 'Blocked app added immediately' }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add blocked app';
      return c.json({ error: message }, 400);
    }
  });

  routes.delete('/apps/:id', async (c) => {
    try {
      const pendingChange = await services.policy.requestRemoveBlockedApp(c.get('userId'), c.req.param('id'));
      return c.json({
        status: 'pending',
        pendingChange,
        message: 'Policy weakening requested. 24-hour cooling-off period in effect before app is unblocked.',
      }, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not request app removal';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/sites', async (c) => {
    try {
      const validated = CreateBlockedSiteSchema.parse(await c.req.json());
      const site = await services.policy.addBlockedSite(c.get('userId'), validated);
      return c.json({ site, status: 'active', message: 'Blocked site added immediately' }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add blocked site';
      return c.json({ error: message }, 400);
    }
  });

  routes.delete('/sites/:id', async (c) => {
    try {
      const pendingChange = await services.policy.requestRemoveBlockedSite(c.get('userId'), c.req.param('id'));
      return c.json({
        status: 'pending',
        pendingChange,
        message: 'Policy weakening requested. 24-hour cooling-off period in effect before domain is unblocked.',
      }, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not request site removal';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
