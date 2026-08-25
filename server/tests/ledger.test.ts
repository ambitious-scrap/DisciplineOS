import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Immutable Ledger & Time Bank API', () => {
  let token: string;
  let deviceId: string;

  beforeEach(async () => {
    db.clear();

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ledger@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    token = regData.tokens.accessToken;

    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Phone', platform: 'android' }),
    });
    const pairData = await pair.json();
    deviceId = pairData.device.id;
    token = pairData.tokens.accessToken;
  });

  it('should reject direct reward minting via deleted /api/bank/earn endpoint', async () => {
    const res = await app.request('/api/bank/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: 'gym',
        seconds: 3600,
        description: 'Trying to fake points',
        idempotencyKey: 'idem-fake-12345',
      }),
    });

    // Endpoint is removed — 404
    expect(res.status).toBe(404);
  });

  it('should earn points through task completion and spend atomically', async () => {
    // 1. Create a task with 1800s reward
    const taskRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Deep Focus Sprint',
        rewardSeconds: 1800,
        evidenceType: 'focus_timer',
      }),
    });
    const taskData = await taskRes.json();
    const taskId = taskData.task.id;

    // 2. Complete task -> credits 1800s
    const compRes = await app.request(`/api/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        evidenceMeta: { sessionDurationSeconds: 1800 },
        idempotencyKey: 'comp-idem-1',
      }),
    });
    expect(compRes.status).toBe(200);
    const compData = await compRes.json();
    expect(compData.balance.balanceSeconds).toBe(1800);

    // 3. Spend 600s -> balance becomes 1200s
    const successSpend = await app.request('/api/bank/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 600,
        targetType: 'app',
        targetIdentifier: 'com.instagram.android',
        deviceId,
        idempotencyKey: 'spend-success-1',
      }),
    });
    expect(successSpend.status).toBe(200);
    const spendData = await successSpend.json();
    expect(spendData.newBalance.balanceSeconds).toBe(1200);
    expect(spendData.transaction.type).toBe('spend');
  });

  it('should charge 3.0x penalty for emergency unlock strictly server-side', async () => {
    // 1. Create & complete a task for 1800s
    const taskRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: 'Workout Session',
        rewardSeconds: 1800,
        evidenceType: 'focus_timer',
      }),
    });
    const { task } = await taskRes.json();

    await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        evidenceMeta: { sessionDurationSeconds: 1800 },
        idempotencyKey: 'comp-idem-2',
      }),
    });

    // 2. Emergency unlock for 300s (5 min) -> Server strictly applies 3.0x = 900s penalty
    const emRes = await app.request('/api/bank/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 300,
        targetType: 'site',
        targetIdentifier: 'youtube.com',
        deviceId,
        multiplier: 1,
        idempotencyKey: 'emergency-1',
      }),
    });

    expect(emRes.status).toBe(200);
    const emData = await emRes.json();
    expect(emData.transaction.seconds).toBe(900); // 300 * 3.0
    expect(emData.newBalance.balanceSeconds).toBe(900); // 1800 - 900
    expect(emData.transaction.source).toBe('emergency');
  });
});
