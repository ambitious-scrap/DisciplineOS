import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Tasks & Occurrence Completion API', () => {
  let token: string;

  beforeEach(async () => {
    db.clear();

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tasks@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    token = regData.tokens.accessToken;
  });

  it('should create task and claim reward only once per occurrence date', async () => {
    // 1. Create task
    const createRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Read 20 pages of Book',
        rewardSeconds: 1200,
        evidenceType: 'photo',
        isRecurring: true,
      }),
    });

    expect(createRes.status).toBe(201);
    const { task } = await createRes.json();
    expect(task.rewardSeconds).toBe(1200);

    // 2. Complete task for 2026-08-25
    const compRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        evidenceUrl: 'https://storage.disciplineos.local/photos/proof1.jpg',
        idempotencyKey: 'task-comp-20260825',
      }),
    });

    expect(compRes.status).toBe(200);
    const compData = await compRes.json();
    expect(compData.occurrence.rewardClaimed).toBe(true);
    expect(compData.balance.balanceSeconds).toBe(1200);

    // 3. Attempting to complete the same occurrence again must be rejected
    const dupRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        idempotencyKey: 'task-comp-20260825-2',
      }),
    });

    expect(dupRes.status).toBe(400);

    // 4. Completing next day's occurrence works cleanly
    const nextDayRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-26',
        idempotencyKey: 'task-comp-20260826',
      }),
    });

    expect(nextDayRes.status).toBe(200);
    const nextDayData = await nextDayRes.json();
    expect(nextDayData.balance.balanceSeconds).toBe(2400); // 1200 + 1200
  });
});
