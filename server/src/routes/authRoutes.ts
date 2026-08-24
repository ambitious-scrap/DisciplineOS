import { Hono } from 'hono';
import { RegisterUserSchema, LoginUserSchema, PairDeviceSchema } from '@disciplineos/shared';
import { authService } from '../services/authService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const validated = RegisterUserSchema.parse(body);
    const result = await authService.register(validated.email, validated.password);
    return c.json(result, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const validated = LoginUserSchema.parse(body);
    const result = await authService.login(validated.email, validated.password);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
});

authRoutes.post('/pair', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = PairDeviceSchema.parse(body);
    const device = await authService.pairDevice(userId, validated);
    const tokens = await authService.generateTokens(userId, device.id);
    return c.json({ device, tokens }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

authRoutes.get('/devices', authMiddleware, async (c) => {
  try {
    const userId = c.get('userId');
    const devices = await authService.getDevices(userId);
    return c.json({ devices }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
