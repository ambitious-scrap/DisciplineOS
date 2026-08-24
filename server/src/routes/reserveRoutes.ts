import { Hono } from 'hono';
import { AllocateReserveSchema, ReconcileReservesSchema } from '@disciplineos/shared';
import { reserveService } from '../services/reserveService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

export const reserveRoutes = new Hono<AppEnv>();
reserveRoutes.use('*', authMiddleware);

reserveRoutes.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const reserves = await reserveService.getActiveReserves(userId);
    return c.json({ reserves }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

reserveRoutes.post('/allocate', async (c) => {
  try {
    const userId = c.get('userId');
    const tokenDeviceId = c.get('deviceId');
    const body = await c.req.json();
    const validated = AllocateReserveSchema.parse(body);

    const deviceId = tokenDeviceId || validated.deviceId;
    const reserve = await reserveService.allocateReserve(userId, { ...validated, deviceId });
    return c.json({ reserve }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

reserveRoutes.post('/reconcile', async (c) => {
  try {
    const userId = c.get('userId');
    const tokenDeviceId = c.get('deviceId');
    const body = await c.req.json();
    const validated = ReconcileReservesSchema.parse(body);

    const deviceId = tokenDeviceId || validated.deviceId;
    const result = await reserveService.reconcileReserve(userId, { ...validated, deviceId });
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
