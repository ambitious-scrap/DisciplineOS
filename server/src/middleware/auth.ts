import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import type { AuthService } from '../services/authService.js';

export function createAuthMiddleware(authService: AuthService): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized: Missing or invalid Authorization header' }, 401);
    }
    const token = authHeader.slice(7).trim();
    try {
      const { userId, deviceId } = await authService.verifyToken(token);
      c.set('userId', userId);
      if (deviceId) c.set('deviceId', deviceId);
      await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      return c.json({ error: message }, 401);
    }
  };
}
