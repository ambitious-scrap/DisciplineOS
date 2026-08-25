import { Hono } from 'hono';
import {
  AbandonFocusSessionSchema,
  CompleteFocusSessionSchema,
  FocusHeartbeatSchema,
  StartFocusSessionSchema,
} from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createFocusRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.post('/start', async (c) => {
    try {
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      const request = StartFocusSessionSchema.parse(await c.req.json());
      const session = await services.focus.start(c.get('userId'), deviceId, request);
      return c.json({ session }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Focus session start rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/:id/heartbeat', async (c) => {
    try {
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      const request = FocusHeartbeatSchema.parse(await c.req.json());
      const session = await services.focus.heartbeat(c.get('userId'), deviceId, c.req.param('id'), request);
      return c.json({ session }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Focus heartbeat rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/:id/complete', async (c) => {
    try {
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      const request = CompleteFocusSessionSchema.parse(await c.req.json());
      const result = await services.focus.complete(c.get('userId'), deviceId, c.req.param('id'), request);
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Focus completion rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/:id/abandon', async (c) => {
    try {
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      const request = AbandonFocusSessionSchema.parse(await c.req.json());
      const session = await services.focus.abandon(c.get('userId'), deviceId, c.req.param('id'), request);
      return c.json({ session }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Focus abandonment rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.get('/:id', async (c) => {
    try {
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      const session = await services.focus.get(c.get('userId'), deviceId, c.req.param('id'));
      return session ? c.json({ session }, 200) : c.json({ error: 'Focus session not found' }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read focus session';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
