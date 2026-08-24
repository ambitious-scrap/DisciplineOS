import { Hono } from 'hono';
import { ReportProtectionEventSchema, ReportLocationEventSchema } from '@disciplineos/shared';
import { auditService } from '../services/auditService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

export const auditRoutes = new Hono<AppEnv>();
auditRoutes.use('*', authMiddleware);

auditRoutes.post('/protection', async (c) => {
  try {
    const userId = c.get('userId');
    const tokenDeviceId = c.get('deviceId');
    const body = await c.req.json();
    const validated = ReportProtectionEventSchema.parse(body);

    const deviceId = tokenDeviceId || validated.deviceId;
    const result = await auditService.recordProtectionEvent(userId, { ...validated, deviceId });
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

auditRoutes.get('/protection', async (c) => {
  try {
    const userId = c.get('userId');
    const events = await auditService.getProtectionEvents(userId);
    return c.json({ events }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

auditRoutes.post('/location', async (c) => {
  try {
    const userId = c.get('userId');
    const tokenDeviceId = c.get('deviceId');
    const body = await c.req.json();
    const validated = ReportLocationEventSchema.parse(body);

    const deviceId = tokenDeviceId || validated.deviceId;
    const result = await auditService.recordLocationEvent(userId, { ...validated, deviceId });
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
