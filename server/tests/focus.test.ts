import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Server-owned focus evidence API', () => {
  let token: string;
  let userId: string;

  beforeEach(async () => {
    db.clear();
    const register = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'focus-authority@disciplineos.local', password: 'password123' }),
    });
    const registerData = await register.json();
    userId = registerData.user.id;
    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registerData.tokens.accessToken}` },
      body: JSON.stringify({ name: 'Focus phone', platform: 'android' }),
    });
    token = (await pair.json()).tokens.accessToken;
  });

  it('rejects client duration claims and rewards only server-observed time', async () => {
    const rejected = await app.request('/api/focus/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plannedDurationSeconds: 1_800, durationSeconds: 3_600, idempotencyKey: 'focus-unknown-field' }),
    });
    expect(rejected.status).toBe(400);

    const start = await app.request('/api/focus/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plannedDurationSeconds: 1_800, clientStartedMonotonicMs: 9_999_999, idempotencyKey: 'focus-start-1' }),
    });
    expect(start.status).toBe(201);
    const sessionId = (await start.json()).session.id;
    const row = db.focusSessions.get(sessionId)!;
    row.serverStartedAt = new Date(Date.now() - 30 * 60_000).toISOString();

    const fakeComplete = await app.request(`/api/focus/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionDurationSeconds: 3_600, idempotencyKey: 'focus-fake-duration' }),
    });
    expect(fakeComplete.status).toBe(400);

    const complete = await app.request(`/api/focus/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ idempotencyKey: 'focus-complete-1' }),
    });
    expect(complete.status).toBe(200);
    const data = await complete.json();
    expect(data.session.observedDurationSeconds).toBe(1_800);
    expect(data.session.rewardSeconds).toBe(540);
    expect(data.balance.balanceSeconds).toBe(540);
  });

  it('does not double-credit an idempotent focus completion', async () => {
    const start = await app.request('/api/focus/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plannedDurationSeconds: 1_800, idempotencyKey: 'focus-start-replay' }),
    });
    const sessionId = (await start.json()).session.id;
    db.focusSessions.get(sessionId)!.serverStartedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const body = JSON.stringify({ idempotencyKey: 'focus-complete-replay' });
    const first = await app.request(`/api/focus/${sessionId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body,
    });
    const replay = await app.request(`/api/focus/${sessionId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body,
    });
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect((await replay.json()).balance.balanceSeconds).toBe(540);
  });

  it('requires a completed focus session bound to a focus task', async () => {
    const task = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Coding sprint', evidenceType: 'focus_timer' }),
    });
    const taskData = await task.json();
    const start = await app.request('/api/focus/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plannedDurationSeconds: 1_800, associatedTaskId: taskData.task.id, idempotencyKey: 'focus-task-start' }),
    });
    const sessionId = (await start.json()).session.id;
    db.focusSessions.get(sessionId)!.serverStartedAt = new Date(Date.now() - 30 * 60_000).toISOString();
    const complete = await app.request(`/api/focus/${sessionId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ idempotencyKey: 'focus-task-complete' }),
    });
    expect(complete.status).toBe(200);
    expect((await complete.json()).balance).toBeUndefined();

    const taskComplete = await app.request(`/api/tasks/${taskData.task.id}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', evidenceSessionId: sessionId, idempotencyKey: 'focus-task-claim' }),
    });
    expect(taskComplete.status).toBe(200);
    expect((await taskComplete.json()).balance.balanceSeconds).toBe(540);
    expect(userId).toBeDefined();
  });
});
