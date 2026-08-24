import { Hono } from 'hono';
import {
  SpendPointsSchema,
  EmergencyUnlockSchema,
  StartFocusSessionSchema,
  ReleaseSessionSchema,
} from '@disciplineos/shared';
import { sessionService } from '../services/sessionService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

export const sessionRoutes = new Hono<AppEnv>();
sessionRoutes.use('*', authMiddleware);

sessionRoutes.get('/active', async (c) => {
  try {
    const userId = c.get('userId');
    const session = await sessionService.getActiveSession(userId);
    return c.json({ session }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

sessionRoutes.post('/unlock', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = SpendPointsSchema.parse(body);
    const session = await sessionService.startUnlockSession(userId, validated);
    return c.json({ session }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

sessionRoutes.post('/emergency', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = EmergencyUnlockSchema.parse(body);
    const session = await sessionService.startEmergencyUnlock(userId, validated);
    return c.json({ session }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

sessionRoutes.post('/focus', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = StartFocusSessionSchema.parse(body);
    const session = await sessionService.startFocusSession(userId, validated);
    return c.json({ session }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

sessionRoutes.post('/release', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = ReleaseSessionSchema.parse(body);
    const success = await sessionService.releaseSession(userId, validated.sessionId, validated.deviceId);
    return c.json({ success }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
