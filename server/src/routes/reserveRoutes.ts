import { Hono } from 'hono';
import { AllocateReserveSchema, ReconcileReservesSchema } from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createReserveRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.get('/', async (c) => {
    try {
      return c.json({ reserves: await services.reserves.getActiveReserves(c.get('userId')) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not list reserves';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/allocate', async (c) => {
    try {
      const validated = AllocateReserveSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId') || validated.deviceId;
      const reserve = await services.reserves.allocateReserve(c.get('userId'), { ...validated, deviceId });
      return c.json({ reserve }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reserve allocation rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/reconcile', async (c) => {
    try {
      const validated = ReconcileReservesSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId') || validated.deviceId;
      const result = await services.reserves.reconcileReserve(c.get('userId'), { ...validated, deviceId });
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reserve reconciliation rejected';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
