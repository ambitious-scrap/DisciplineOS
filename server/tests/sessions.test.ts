import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Active Sessions & Global Distraction Lock API', () => {
  let token: string;
  let phoneDeviceId: string;
  let tabletDeviceId: string;

  beforeEach(async () => {
    db.clear();

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sessions@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    token = regData.tokens.accessToken;

    const pPair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Phone', platform: 'android' }),
    });
    const pData = await pPair.json();
    phoneDeviceId = pData.device.id;

    const tPair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Tablet', platform: 'android' }),
    });
    const tData = await tPair.json();
    tabletDeviceId = tData.device.id;

    // Credit 3600s balance via task completion
    const taskRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Fund Task', rewardSeconds: 3600, evidenceType: 'none' }),
    });
    const { task } = await taskRes.json();

    await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', idempotencyKey: 'fund-sessions-task' }),
    });
  });

  it('should start an unlock session with HMAC lease signature and enforce global lock', async () => {
    // 1. Phone starts an unlock session
    const unlockRes = await app.request('/api/sessions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 600,
        targetType: 'app',
        targetIdentifier: 'com.instagram.android',
        deviceId: phoneDeviceId,
        idempotencyKey: 'session-unlock-1',
      }),
    });

    expect(unlockRes.status).toBe(201);
    const unlockData = await unlockRes.json();
    expect(unlockData.session.leaseSignature).toBeDefined();
    expect(unlockData.session.deviceId).toBe(phoneDeviceId);

    // 2. Tablet attempts to start concurrent unlock -> Must fail due to single global session lock
    const concurrentRes = await app.request('/api/sessions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 300,
        targetType: 'site',
        targetIdentifier: 'reddit.com',
        deviceId: tabletDeviceId,
        idempotencyKey: 'session-unlock-2',
      }),
    });

    expect(concurrentRes.status).toBe(400);

    // 3. Release session from Phone -> Tablet can now unlock
    const relRes = await app.request('/api/sessions/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sessionId: unlockData.session.id,
        deviceId: phoneDeviceId,
      }),
    });
    expect(relRes.status).toBe(200);

    // Now tablet can unlock
    const tabletUnlock = await app.request('/api/sessions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 300,
        targetType: 'site',
        targetIdentifier: 'reddit.com',
        deviceId: tabletDeviceId,
        idempotencyKey: 'session-unlock-3',
      }),
    });
    expect(tabletUnlock.status).toBe(201);
  });
});
