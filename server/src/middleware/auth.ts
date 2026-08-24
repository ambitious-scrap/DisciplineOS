import type { MiddlewareHandler } from 'hono';
import { authService } from '../services/authService.js';
import type { AppEnv } from '../types.js';

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid Authorization header' }, 401);
  }

  const token = authHeader.slice(7).trim();
  try {
    const { userId, deviceId } = await authService.verifyToken(token);
    c.set('userId', userId);
    if (deviceId) {
      c.set('deviceId', deviceId);
    }
    await next();
  } catch (err: any) {
    return c.json({ error: err.message || 'Unauthorized' }, 401);
  }
};
