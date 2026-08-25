import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Reward policy authority', () => {
  let token: string;

  beforeEach(async () => {
    db.clear();
    const register = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reward-policy@disciplineos.local', password: 'password123' }),
    });
    token = (await register.json()).tokens.accessToken;
  });

  it('delays generosity increases and applies tightening immediately', async () => {
    const weakening = await app.request('/api/rewards/policies/focus', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        maxRewardSeconds: 7_200,
        dailyCapSeconds: 7_200,
        minimumVerifiedSeconds: 600,
        rewardRatioBasisPoints: 4_000,
        requiresMovement: false,
      }),
    });
    expect(weakening.status).toBe(202);
    expect((await weakening.json()).pendingChange.effectiveAt).toBeDefined();

    const tightening = await app.request('/api/rewards/policies/focus', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        maxRewardSeconds: 1_800,
        dailyCapSeconds: 1_800,
        minimumVerifiedSeconds: 2_400,
        rewardRatioBasisPoints: 2_000,
        requiresMovement: true,
      }),
    });
    expect(tightening.status).toBe(200);
    expect((await tightening.json()).policy.maxRewardSeconds).toBe(1_800);
  });

  it('enforces the manual daily cap under concurrent claims', async () => {
    const tasks = await Promise.all(
      Array.from({ length: 8 }, (_, index) => app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: `Manual task ${index}`, evidenceType: 'none' }),
      })),
    );
    const taskRows = await Promise.all(tasks.map((response) => response.json()));
    const completions = await Promise.all(taskRows.map((row, index) => app.request(`/api/tasks/${row.task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: `2026-08-${String(index + 1).padStart(2, '0')}`, idempotencyKey: `manual-cap-${index}` }),
    })));
    expect(completions.every((response) => response.status === 200)).toBe(true);
    const balance = await app.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    expect((await balance.json()).balanceSeconds).toBe(1_800);
  });
});
