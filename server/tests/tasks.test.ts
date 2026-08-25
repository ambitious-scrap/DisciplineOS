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

  it('caps evidence-free task rewards at five minutes', async () => {
    const rejected = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Unverified large reward', rewardSeconds: 301, evidenceType: 'none' }),
    });
    const accepted = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Unverified small reward', rewardSeconds: 300, evidenceType: 'none' }),
    });
    expect(rejected.status).toBe(400);
    expect(accepted.status).toBe(201);
  });

  it('should require photo proof for photo tasks and prevent duplicate completions', async () => {
    // 1. Create photo-verified task
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

    // 2. Attempt to complete WITHOUT photo evidence -> Rejected!
    const noProofRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        idempotencyKey: 'task-no-proof',
      }),
    });
    expect(noProofRes.status).toBe(400);

    // 3. Complete with valid photo evidence -> Success
    const compRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        evidenceUrl: 'https://storage.disciplineos.local/photos/proof1.jpg',
        evidenceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        idempotencyKey: 'task-comp-20260825',
      }),
    });

    expect(compRes.status).toBe(200);
    const compData = await compRes.json();
    expect(compData.occurrence.rewardClaimed).toBe(true);
    expect(compData.balance.balanceSeconds).toBe(1200);

    // 4. Duplicate completion for same occurrence date -> Rejected
    const dupRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        evidenceUrl: 'https://storage.disciplineos.local/photos/proof2.jpg',
        idempotencyKey: 'task-comp-20260825-2',
      }),
    });
    expect(dupRes.status).toBe(400);

    // 5. Completing next day with valid proof -> Success
    const nextDayRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-26',
        evidenceUrl: 'https://storage.disciplineos.local/photos/proof3.jpg',
        idempotencyKey: 'task-comp-20260826',
      }),
    });

    expect(nextDayRes.status).toBe(200);
    const nextDayData = await nextDayRes.json();
    expect(nextDayData.balance.balanceSeconds).toBe(2400); // 1200 + 1200
  });
});
