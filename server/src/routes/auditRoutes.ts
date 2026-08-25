import { Hono } from 'hono';
import { ReportProtectionEventSchema, ReportLocationEventSchema } from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createAuditRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.post('/protection', async (c) => {
    try {
      const validated = ReportProtectionEventSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      if (validated.deviceId !== deviceId) {
        return c.json({ error: 'Body device ID does not match device credential' }, 403);
      }
      return c.json(await services.audit.recordProtectionEvent(c.get('userId'), { ...validated, deviceId }), 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not record protection event';
      return c.json({ error: message }, 400);
    }
  });

  routes.get('/protection', async (c) => {
    try {
      return c.json({ events: await services.audit.getProtectionEvents(c.get('userId')) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read protection events';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/location', async (c) => {
    try {
      const validated = ReportLocationEventSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      return c.json(await services.audit.recordLocationEvent(c.get('userId'), deviceId, validated), 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not record location event';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
