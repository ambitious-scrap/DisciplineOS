import { Hono } from 'hono';
import { RewardActivityTypeSchema, UpdateRewardPolicySchema } from '@disciplineos/shared';
import { createAuthMiddleware } from '../middleware/auth.js';
import type { AppEnv } from '../types.js';
import type { Services } from '../services/index.js';

export function createRewardPolicyRoutes(services: Services) {
  const routes = new Hono<AppEnv>();
  const authMiddleware = createAuthMiddleware(services.auth);
  routes.use('*', authMiddleware);

  routes.get('/', async (c) => {
    try {
      return c.json({ policies: await services.rewardPolicies.getPolicies(c.get('userId')) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read reward policies';
      return c.json({ error: message }, 400);
    }
  });

  routes.put('/:activityType', async (c) => {
    try {
      const activityType = RewardActivityTypeSchema.parse(c.req.param('activityType'));
      const request = UpdateRewardPolicySchema.parse(await c.req.json());
      const result = await services.rewardPolicies.updatePolicy(c.get('userId'), activityType, request);
      return c.json(result, result.pendingChange ? 202 : 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update reward policy';
      return c.json({ error: message }, 400);
    }
  });

  routes.get('/pending', async (c) => {
    try {
      return c.json({ pendingChanges: await services.rewardPolicies.getPendingChanges(c.get('userId')) }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read pending reward policy changes';
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/pending/:id/cancel', async (c) => {
    try {
      const success = await services.rewardPolicies.cancelPendingChange(c.get('userId'), c.req.param('id'));
      return c.json({ success }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not cancel reward policy change';
      return c.json({ error: message }, 400);
    }
  });

  return routes;
}
