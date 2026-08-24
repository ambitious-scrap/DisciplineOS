import { Hono } from 'hono';
import { CreateTaskSchema, CompleteTaskSchema } from '@disciplineos/shared';
import { taskService } from '../services/taskService.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';

export const taskRoutes = new Hono<AppEnv>();
taskRoutes.use('*', authMiddleware);

taskRoutes.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const tasks = await taskService.getTasks(userId);
    return c.json({ tasks }, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

taskRoutes.post('/', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const validated = CreateTaskSchema.parse(body);
    const task = await taskService.createTask(userId, validated);
    return c.json({ task }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

taskRoutes.post('/:id/complete', async (c) => {
  try {
    const userId = c.get('userId');
    const taskId = c.req.param('id');
    const body = await c.req.json();
    const validated = CompleteTaskSchema.parse(body);
    const result = await taskService.completeTaskOccurrence(userId, taskId, validated);
    return c.json(result, 200);
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});
