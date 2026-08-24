import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/authRoutes.js';
import { ledgerRoutes } from './routes/ledgerRoutes.js';
import { sessionRoutes } from './routes/sessionRoutes.js';
import { policyRoutes } from './routes/policyRoutes.js';
import { taskRoutes } from './routes/taskRoutes.js';
import { reserveRoutes } from './routes/reserveRoutes.js';
import { auditRoutes } from './routes/auditRoutes.js';
import type { AppEnv } from './types.js';

export function createApp() {
  const app = new Hono<AppEnv>();

  // Global Middleware
  app.use('*', cors());
  app.use('*', logger());

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Mount API modules
  app.route('/api/auth', authRoutes);
  app.route('/api/bank', ledgerRoutes);
  app.route('/api/sessions', sessionRoutes);
  app.route('/api/policy', policyRoutes);
  app.route('/api/tasks', taskRoutes);
  app.route('/api/reserves', reserveRoutes);
  app.route('/api/events', auditRoutes);

  // Global 404
  app.notFound((c) => {
    return c.json({ error: 'Endpoint not found' }, 404);
  });

  return app;
}

export const app = createApp();
