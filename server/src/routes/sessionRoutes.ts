import { Hono } from 'hono';
import {
  SpendPointsSchema,
  EmergencyUnlockSchema,
  StartFocusSessionSchema,
  ReleaseSessionSchema,
} from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createSessionRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.get('/active', async (c) => {
    try {
      return c.json({ session: await services.sessions.getActiveSession(c.get('userId')) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read active session';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/unlock', async (c) => {
    try {
      const validated = SpendPointsSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      if (validated.deviceId && validated.deviceId !== deviceId) {
        return c.json({ error: 'Body device ID does not match device credential' }, 403);
      }
      const session = await services.sessions.startUnlockSession(c.get('userId'), { ...validated, deviceId });
      return c.json({ session }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unlock rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/emergency', async (c) => {
    try {
      const validated = EmergencyUnlockSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      if (validated.deviceId && validated.deviceId !== deviceId) {
        return c.json({ error: 'Body device ID does not match device credential' }, 403);
      }
      const session = await services.sessions.startEmergencyUnlock(c.get('userId'), { ...validated, deviceId });
      return c.json({ session }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Emergency unlock rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/focus', async (c) => {
    try {
      const validated = StartFocusSessionSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      if (validated.deviceId !== deviceId) {
        return c.json({ error: 'Body device ID does not match device credential' }, 403);
      }
      const session = await services.sessions.startFocusSession(c.get('userId'), { ...validated, deviceId });
      return c.json({ session }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Focus session rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/release', async (c) => {
    try {
      const validated = ReleaseSessionSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId');
      if (!deviceId) return c.json({ error: 'Device-scoped access token required' }, 401);
      if (validated.deviceId !== deviceId) {
        return c.json({ error: 'Body device ID does not match device credential' }, 403);
      }
      const success = await services.sessions.releaseSession(c.get('userId'), validated.sessionId, deviceId);
      return c.json({ success }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Session release rejected';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
