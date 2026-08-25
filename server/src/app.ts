import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { db } from './db/memoryStore.js';
import type { DisciplineStore } from './db/store.js';
import { createServices } from './services/index.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createFocusRoutes } from './routes/focusRoutes.js';
import { createLedgerRoutes } from './routes/ledgerRoutes.js';
import { createSessionRoutes } from './routes/sessionRoutes.js';
import { createPolicyRoutes } from './routes/policyRoutes.js';
import { createTaskRoutes } from './routes/taskRoutes.js';
import { createReserveRoutes } from './routes/reserveRoutes.js';
import { createAuditRoutes } from './routes/auditRoutes.js';
import { createRewardPolicyRoutes } from './routes/rewardPolicyRoutes.js';
import type { AppEnv } from './types.js';
export type DisciplineApp = Hono<AppEnv>;

export function createApp(store: DisciplineStore = db): DisciplineApp {
  const services = createServices(store);
  const app = new Hono<AppEnv>();

  app.use('*', cors());
  app.use('*', logger());

  app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));
  app.route('/api/auth', createAuthRoutes(services));
  app.route('/api/bank', createLedgerRoutes(services));
  app.route('/api/sessions', createSessionRoutes(services));
  app.route('/api/focus', createFocusRoutes(services));
  app.route('/api/policy', createPolicyRoutes(services));
  app.route('/api/tasks', createTaskRoutes(services));
  app.route('/api/reserves', createReserveRoutes(services));
  app.route('/api/rewards/policies', createRewardPolicyRoutes(services));
  app.route('/api/events', createAuditRoutes(services));

  app.notFound((c) => c.json({ error: 'Endpoint not found' }, 404));
  return app;
}

export const app = createApp(db);
