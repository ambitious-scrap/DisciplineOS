import { Hono } from 'hono';
import { RegisterUserSchema, LoginUserSchema, PairDeviceSchema } from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createAuthRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);

  routes.post('/register', async (c) => {
    try {
      const validated = RegisterUserSchema.parse(await c.req.json());
      const result = await services.auth.register(validated.email, validated.password);
      return c.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/login', async (c) => {
    try {
      const validated = LoginUserSchema.parse(await c.req.json());
      const result = await services.auth.login(validated.email, validated.password);
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid email or password';
      return c.json({ error: message }, 401);
    }
  });

  routes.post('/pair', authMiddleware, async (c) => {
    try {
      const validated = PairDeviceSchema.parse(await c.req.json());
      const { tokens, ...device } = await services.auth.pairDevice(c.get('userId'), validated);
      return c.json({ device, tokens }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Device pairing failed';
      return c.json({ error: message }, 400);
    }
  });

  routes.get('/devices', authMiddleware, async (c) => {
    try {
      const devices = await services.auth.getDevices(c.get('userId'));
      return c.json({ devices }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not list devices';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
