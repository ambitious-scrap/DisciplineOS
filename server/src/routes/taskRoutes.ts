import { Hono } from 'hono';
import { CreateTaskSchema, CompleteTaskSchema } from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createTaskRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.get('/', async (c) => {
    try {
      return c.json({ tasks: await services.tasks.getTasks(c.get('userId')) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not list tasks';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/', async (c) => {
    try {
      const validated = CreateTaskSchema.parse(await c.req.json());
      const task = await services.tasks.createTask(c.get('userId'), validated);
      return c.json({ task }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create task';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/:id/complete', async (c) => {
    try {
      const validated = CompleteTaskSchema.parse(await c.req.json());
      const result = await services.tasks.completeTaskOccurrence(c.get('userId'), c.req.param('id'), validated);
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete task';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
