import { Hono } from 'hono';
import { EarnPointsSchema, SpendPointsSchema, EmergencyUnlockSchema } from '@disciplineos/shared';
import { ledgerService } from '../services/ledgerService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

export const ledgerRoutes = new Hono<AppEnv>();
ledgerRoutes.use('*', authMiddleware);

ledgerRoutes.get('/balance', async (c) => {
  try {
    const userId = c.get('userId');
    const balance = await ledgerService.getBalance(userId);
    return c.json(balance, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

ledgerRoutes.get('/transactions', async (c) => {
  try {
    const userId = c.get('userId');
    const limit = Number(c.req.query('limit')) || 50;
    const transactions = await ledgerService.getTransactions(userId, limit);
    return c.json({ transactions }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

ledgerRoutes.post('/earn', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = EarnPointsSchema.parse(body);
    const result = await ledgerService.earnPoints(userId, validated);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

ledgerRoutes.post('/spend', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = SpendPointsSchema.parse(body);
    const result = await ledgerService.spendPoints(userId, validated);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

ledgerRoutes.post('/emergency', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = EmergencyUnlockSchema.parse(body);
    const result = await ledgerService.emergencyUnlock(userId, validated);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
