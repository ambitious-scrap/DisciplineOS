import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import type { DisciplineApp } from '../src/app.js';
import { initPostgresDatabase } from '../src/db/postgres.js';
import { PostgresStore } from '../src/db/postgresStore.js';

const describePostgres = process.env.DATABASE_URL ? describe : describe.skip;

describePostgres('PostgreSQL authority integration', () => {
  let pool: Pool;
  let pgApp: DisciplineApp;

  beforeAll(async () => {
    const initialized = await initPostgresDatabase({ environment: 'test' });
    if (!initialized) throw new Error('DATABASE_URL was set but PostgreSQL did not initialize');
    pool = initialized;
    pgApp = createApp(new PostgresStore(pool));
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE users CASCADE');
  });

  async function registerAndPair(email: string) {
    const register = await pgApp.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    });
    const registerData = await register.json();
    const pair = await pgApp.request('/api/auth/pair', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${registerData.tokens.accessToken}`,
      },
      body: JSON.stringify({ name: 'Postgres phone', platform: 'android' }),
    });
    const pairData = await pair.json();
    return {
      token: registerData.tokens.accessToken as string,
      deviceId: pairData.device.id as string,
    };
  }

  async function credit(token: string, occurrenceDate: string, rewardSeconds = 3600) {
    const task = await pgApp.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Persistent funding task', rewardSeconds, evidenceType: 'none' }),
    });
    const { task: createdTask } = await task.json();
    return pgApp.request(`/api/tasks/${createdTask.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate, idempotencyKey: `persist-credit-${occurrenceDate}` }),
    });
  }

  it('persists balances, transactions, and policies across app recreation', async () => {
    const { token, deviceId } = await registerAndPair('postgres-persistence@disciplineos.local');
    await credit(token, '2026-08-25', 3600);
    const spend = await pgApp.request('/api/bank/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 600,
        targetType: 'app',
        targetIdentifier: 'com.instagram.android',
        deviceId,
        idempotencyKey: 'persist-spend-1',
      }),
    });
    expect(spend.status).toBe(200);

    const addPolicy = await pgApp.request('/api/policy/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform: 'android', identifier: 'com.instagram.android', displayName: 'Instagram' }),
    });
    expect(addPolicy.status).toBe(201);
    const { app: blockedApp } = await addPolicy.json();
    const removePolicy = await pgApp.request(`/api/policy/apps/${blockedApp.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(removePolicy.status).toBe(202);

    const recreatedApp = createApp(new PostgresStore(pool));
    const balance = await recreatedApp.request('/api/bank/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await balance.json()).balanceSeconds).toBe(3000);
    const pending = await recreatedApp.request('/api/policy/pending', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await pending.json()).pendingChanges).toHaveLength(1);
    const transactions = await recreatedApp.request('/api/bank/transactions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await transactions.json()).transactions).toHaveLength(2);
  });

  it('serializes concurrent unlocks and keeps one active session at database level', async () => {
    const { token, deviceId } = await registerAndPair('postgres-session-race@disciplineos.local');
    await credit(token, '2026-08-26', 1800);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const unlock = (idempotencyKey: string, targetIdentifier: string) => pgApp.request('/api/sessions/unlock', {
      method: 'POST',
      headers,
      body: JSON.stringify({ seconds: 600, targetType: 'site', targetIdentifier, deviceId, idempotencyKey }),
    });
    const responses = await Promise.all([
      unlock('postgres-race-1', 'example-one.com'),
      unlock('postgres-race-2', 'example-two.com'),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
    const activeRows = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM active_unlocks WHERE status = 'active'`,
    );
    expect(Number(activeRows.rows[0].count)).toBe(1);
    const bankRows = await pool.query<{ balance_seconds: number }>(
      `SELECT balance_seconds FROM time_banks`,
    );
    expect(Number(bankRows.rows[0].balance_seconds)).toBe(1200);
    const recreatedApp = createApp(new PostgresStore(pool));
    const active = await recreatedApp.request('/api/sessions/active', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await active.json()).session).not.toBeNull();
  });

  it('uses database uniqueness for reserve and task idempotency', async () => {
    const { token, deviceId } = await registerAndPair('postgres-idempotency@disciplineos.local');
    await credit(token, '2026-08-27', 3600);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const allocationBody = JSON.stringify({ deviceId, requestedSeconds: 1800, ttlSeconds: 43200, idempotencyKey: 'postgres-reserve-1' });
    const allocation = await pgApp.request('/api/reserves/allocate', { method: 'POST', headers, body: allocationBody });
    const allocationReplay = await pgApp.request('/api/reserves/allocate', { method: 'POST', headers, body: allocationBody });
    expect(allocation.status).toBe(201);
    expect(allocationReplay.status).toBe(201);
    const oversubscribed = await pgApp.request('/api/reserves/allocate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId, requestedSeconds: 2000, ttlSeconds: 43200, idempotencyKey: 'postgres-reserve-oversubscribe' }),
    });
    expect(oversubscribed.status).toBe(400);
    const { reserve } = await allocation.json();
    const events = [{
      eventId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      deviceId,
      targetType: 'app',
      targetIdentifier: 'com.instagram.android',
      secondsSpent: 600,
      localTimestamp: '2026-08-27T01:00:00Z',
      isEmergency: false,
    }];
    const reconcileBody = JSON.stringify({ deviceId, reserveId: reserve.id, events });
    const reconcile = await pgApp.request('/api/reserves/reconcile', { method: 'POST', headers, body: reconcileBody });
    const reconcileReplay = await pgApp.request('/api/reserves/reconcile', { method: 'POST', headers, body: reconcileBody });
    expect(reconcile.status).toBe(200);
    expect((await reconcile.json()).acceptedSeconds).toBe(600);
    expect(reconcileReplay.status).toBe(200);
    expect((await reconcileReplay.json()).acceptedSeconds).toBe(0);
    const balance = await pgApp.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    expect((await balance.json()).balanceSeconds).toBe(3000);
  });
});
