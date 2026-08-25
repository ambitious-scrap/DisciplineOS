import { Hono } from 'hono';
import { SpendPointsSchema, EmergencyUnlockSchema } from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createLedgerRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.get('/balance', async (c) => {
    try {
      return c.json(await services.ledger.getBalance(c.get('userId')), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read balance';
      return c.json({ error: message }, 400);
    }
  });

  routes.get('/transactions', async (c) => {
    try {
      const limit = Number(c.req.query('limit')) || 50;
      return c.json({ transactions: await services.ledger.getTransactions(c.get('userId'), limit) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read transactions';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/spend', async (c) => {
    try {
      const validated = SpendPointsSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId') || validated.deviceId;
      if (!deviceId) return c.json({ error: 'Device ID required via device token or body' }, 400);
      return c.json(await services.ledger.spendPoints(c.get('userId'), { ...validated, deviceId }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Spend rejected';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/emergency', async (c) => {
    try {
      const validated = EmergencyUnlockSchema.parse(await c.req.json());
      const deviceId = c.get('deviceId') || validated.deviceId;
      if (!deviceId) return c.json({ error: 'Device ID required via device token or body' }, 400);
      return c.json(await services.ledger.emergencyUnlock(c.get('userId'), { ...validated, deviceId }), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Emergency unlock rejected';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
