import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

async function registerAndPair(email: string) {
  const register = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  const registerData = await register.json();
  const pair = await app.request('/api/auth/pair', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${registerData.tokens.accessToken}`,
    },
    body: JSON.stringify({ name: 'Phone', platform: 'android' }),
  });
  const pairData = await pair.json();
  return {
    token: pairData.tokens.accessToken as string,
    userToken: registerData.tokens.accessToken as string,
    refreshToken: registerData.tokens.refreshToken as string,
    deviceRefreshToken: pairData.tokens.refreshToken as string,
    deviceId: pairData.device.id as string,
  };
}

async function creditBalance(token: string, rewardSeconds = 3600) {
  const task = await app.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: 'Authority test task', rewardSeconds, evidenceType: 'focus_timer' }),
  });
  const taskData = await task.json();
  return app.request(`/api/tasks/${taskData.task.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      occurrenceDate: '2026-08-25',
      evidenceMeta: { sessionDurationSeconds: rewardSeconds },
      idempotencyKey: `credit-${Date.now()}-${Math.random()}`,
    }),
  });
}

describe('Backend authority invariants', () => {
  beforeEach(() => {
    db.clear();
  });

  it('rejects refresh tokens at protected access endpoints', async () => {
    const { refreshToken } = await registerAndPair('refresh-rejected@disciplineos.local');
    const response = await app.request('/api/bank/balance', {
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
    expect(response.status).toBe(401);
  });

  it('returns fresh device-scoped credentials from a refresh token', async () => {
    const { deviceRefreshToken, deviceId } = await registerAndPair('device-refresh@disciplineos.local');
    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: deviceRefreshToken }),
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.tokens.accessToken).toBeDefined();
    expect(data.tokens.refreshToken).toBeDefined();

    const deviceOperation = await app.request('/api/bank/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.tokens.accessToken}` },
      body: JSON.stringify({
        seconds: 1,
        targetType: 'app',
        targetIdentifier: 'com.example.app',
        deviceId,
        idempotencyKey: 'device-refresh-scope',
      }),
    });
    expect(deviceOperation.status).toBe(400);
  });

  it('rejects an access token at the refresh endpoint', async () => {
    const { userToken } = await registerAndPair('access-at-refresh@disciplineos.local');
    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: userToken }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects refresh after the device is removed', async () => {
    const { deviceRefreshToken, deviceId } = await registerAndPair('revoked-device-refresh@disciplineos.local');
    db.devices.delete(deviceId);
    const response = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: deviceRefreshToken }),
    });
    expect(response.status).toBe(401);
  });
  it('rejects device operations without a device-scoped access token', async () => {
    const { userToken, deviceId } = await registerAndPair('device-scope-required@disciplineos.local');
    const response = await app.request('/api/bank/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        seconds: 60,
        targetType: 'app',
        targetIdentifier: 'com.example.app',
        deviceId,
        idempotencyKey: 'device-scope-required-1',
      }),
    });
    expect(response.status).toBe(401);
  });

  it('does not double-credit a repeated task idempotency key', async () => {
    const { token } = await registerAndPair('credit-idempotency@disciplineos.local');
    const task = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Idempotent task', rewardSeconds: 1200, evidenceType: 'focus_timer' }),
    });
    const { task: createdTask } = await task.json();
    const body = JSON.stringify({
      occurrenceDate: '2026-08-25',
      evidenceMeta: { sessionDurationSeconds: 1200 },
      idempotencyKey: 'credit-idempotency-1',
    });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const first = await app.request(`/api/tasks/${createdTask.id}/complete`, { method: 'POST', headers, body });
    const replay = await app.request(`/api/tasks/${createdTask.id}/complete`, { method: 'POST', headers, body });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    const balance = await app.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    expect((await balance.json()).balanceSeconds).toBe(1200);
  });

  it('does not double-spend a repeated transaction idempotency key', async () => {
    const { token, deviceId } = await registerAndPair('spend-idempotency@disciplineos.local');
    await creditBalance(token, 1800);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const body = JSON.stringify({
      seconds: 1200,
      targetType: 'app',
      targetIdentifier: 'com.example.app',
      deviceId,
      idempotencyKey: 'spend-idempotency-1',
    });
    const first = await app.request('/api/bank/spend', { method: 'POST', headers, body });
    const replay = await app.request('/api/bank/spend', { method: 'POST', headers, body });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    const balance = await app.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    expect((await balance.json()).balanceSeconds).toBe(600);
  });

  it('serializes concurrent spends and never makes the balance negative', async () => {
    const { token, deviceId } = await registerAndPair('concurrent-spend@disciplineos.local');
    await creditBalance(token, 1800);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const request = (idempotencyKey: string) => app.request('/api/bank/spend', {
      method: 'POST',
      headers,
      body: JSON.stringify({ seconds: 1200, targetType: 'app', targetIdentifier: 'com.example.app', deviceId, idempotencyKey }),
    });
    const responses = await Promise.all([request('concurrent-spend-1'), request('concurrent-spend-2')]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
    const balance = await app.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    expect((await balance.json()).balanceSeconds).toBe(600);
  });

  it('allows only one concurrent active unlock session', async () => {
    const { token, deviceId } = await registerAndPair('concurrent-session@disciplineos.local');
    await creditBalance(token, 1800);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const request = (idempotencyKey: string, targetIdentifier: string) => app.request('/api/sessions/unlock', {
      method: 'POST',
      headers,
      body: JSON.stringify({ seconds: 600, targetType: 'app', targetIdentifier, deviceId, idempotencyKey }),
    });
    const responses = await Promise.all([
      request('concurrent-session-1', 'com.example.one'),
      request('concurrent-session-2', 'com.example.two'),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
    const active = await app.request('/api/sessions/active', { headers: { Authorization: `Bearer ${token}` } });
    expect((await active.json()).session).not.toBeNull();
  });
});
