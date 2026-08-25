import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createApp } from '../src/app.js';
import type { DisciplineApp } from '../src/app.js';
import { initPostgresDatabase } from '../src/db/postgres.js';
import { PostgresStore } from '../src/db/postgresStore.js';

const describePostgres = process.env.DATABASE_URL ? describe : describe.skip;
const PHOTO_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registerData.tokens.accessToken}` },
      body: JSON.stringify({ name: 'Postgres phone', platform: 'android' }),
    });
    const pairData = await pair.json();
    return {
      userId: registerData.user.id as string,
      token: pairData.tokens.accessToken as string,
      deviceId: pairData.device.id as string,
    };
  }

  async function seedBalance(userId: string, seconds: number) {
    await pool.query('UPDATE time_banks SET balance_seconds = $2, updated_at = NOW() WHERE user_id = $1', [userId, seconds]);
  }

  it('persists balances, transactions, policies, and reward rules across app recreation', async () => {
    const { userId, token, deviceId } = await registerAndPair('postgres-persistence@disciplineos.local');
    await seedBalance(userId, 3_600);
    const spend = await pgApp.request('/api/bank/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seconds: 600, targetType: 'app', targetIdentifier: 'com.instagram.android', deviceId, idempotencyKey: 'persist-spend-1' }),
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
    const balance = await recreatedApp.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    expect((await balance.json()).balanceSeconds).toBe(3_000);
    const pending = await recreatedApp.request('/api/policy/pending', { headers: { Authorization: `Bearer ${token}` } });
    expect((await pending.json()).pendingChanges).toHaveLength(1);
    const rewardPolicies = await recreatedApp.request('/api/rewards/policies', { headers: { Authorization: `Bearer ${token}` } });
    expect((await rewardPolicies.json()).policies).toHaveLength(5);
    const transactions = await recreatedApp.request('/api/bank/transactions', { headers: { Authorization: `Bearer ${token}` } });
    expect((await transactions.json()).transactions).toHaveLength(1);
  });

  it('serializes concurrent unlocks and keeps one active session at database level', async () => {
    const { userId, token, deviceId } = await registerAndPair('postgres-session-race@disciplineos.local');
    await seedBalance(userId, 1_800);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const unlock = (idempotencyKey: string, targetIdentifier: string) => pgApp.request('/api/sessions/unlock', {
      method: 'POST',
      headers,
      body: JSON.stringify({ seconds: 600, targetType: 'site', targetIdentifier, deviceId, idempotencyKey }),
    });
    const responses = await Promise.all([unlock('postgres-race-1', 'example-one.com'), unlock('postgres-race-2', 'example-two.com')]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
    const activeRows = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM active_unlocks WHERE status = 'active'`);
    expect(Number(activeRows.rows[0].count)).toBe(1);
    const bankRows = await pool.query<{ balance_seconds: number }>('SELECT balance_seconds FROM time_banks');
    expect(Number(bankRows.rows[0].balance_seconds)).toBe(1_200);
    const recreatedApp = createApp(new PostgresStore(pool));
    const active = await recreatedApp.request('/api/sessions/active', { headers: { Authorization: `Bearer ${token}` } });
    expect((await active.json()).session).not.toBeNull();
  });

  it('persists one-time photo evidence and consumes it atomically', async () => {
    const { userId, token } = await registerAndPair('postgres-photo@disciplineos.local');
    const task = await pgApp.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Photo task', evidenceType: 'photo' }),
    });
    const taskData = await task.json();
    const evidence = await pgApp.request(`/api/tasks/${taskData.task.id}/evidence/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', sha256: PHOTO_HASH, idempotencyKey: 'pg-photo-1' }),
    });
    const evidenceId = (await evidence.json()).evidence.id;
    const complete = await pgApp.request(`/api/tasks/${taskData.task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', photoEvidenceId: evidenceId, idempotencyKey: 'pg-photo-complete-1' }),
    });
    expect(complete.status).toBe(200);
    const replay = await pgApp.request(`/api/tasks/${taskData.task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', photoEvidenceId: evidenceId, idempotencyKey: 'pg-photo-complete-2' }),
    });
    expect(replay.status).toBe(400);
    const counts = await pool.query<{ evidence: string; consumptions: string }>(
      `SELECT (SELECT COUNT(*) FROM photo_evidence WHERE user_id = $1)::text AS evidence,
              (SELECT COUNT(*) FROM task_evidence_consumptions WHERE task_occurrence_id IN (SELECT id FROM task_occurrences WHERE user_id = $1))::text AS consumptions`,
      [userId],
    );
    expect(Number(counts.rows[0].evidence)).toBe(1);
    expect(Number(counts.rows[0].consumptions)).toBe(1);
  });

  it('persists a server-timed focus session and computes reward without client duration', async () => {
    const { token, deviceId } = await registerAndPair('postgres-focus@disciplineos.local');
    const start = await pgApp.request('/api/focus/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ plannedDurationSeconds: 1_800, idempotencyKey: 'pg-focus-start-1' }),
    });
    expect(start.status).toBe(201);
    const sessionId = (await start.json()).session.id;
    await pool.query(`UPDATE focus_sessions SET server_started_at = NOW() - INTERVAL '30 minutes' WHERE id = $1`, [sessionId]);
    const complete = await pgApp.request(`/api/focus/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ idempotencyKey: 'pg-focus-complete-1' }),
    });
    expect(complete.status).toBe(200);
    const data = await complete.json();
    expect(data.session.observedDurationSeconds).toBeGreaterThanOrEqual(1_800);
    expect(data.session.rewardSeconds).toBe(540);
    expect(data.balance.balanceSeconds).toBe(540);
    expect(deviceId).toBe(data.session.deviceId);
  });

  it('uses database uniqueness for reserve idempotency', async () => {
    const { userId, token, deviceId } = await registerAndPair('postgres-idempotency@disciplineos.local');
    await seedBalance(userId, 3_600);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const allocationBody = JSON.stringify({ deviceId, requestedSeconds: 1_800, ttlSeconds: 43_200, idempotencyKey: 'postgres-reserve-1' });
    const allocation = await pgApp.request('/api/reserves/allocate', { method: 'POST', headers, body: allocationBody });
    const allocationReplay = await pgApp.request('/api/reserves/allocate', { method: 'POST', headers, body: allocationBody });
    expect(allocation.status).toBe(201);
    expect(allocationReplay.status).toBe(201);
    const oversubscribed = await pgApp.request('/api/reserves/allocate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId, requestedSeconds: 2_000, ttlSeconds: 43_200, idempotencyKey: 'postgres-reserve-oversubscribe' }),
    });
    expect(oversubscribed.status).toBe(400);
  });
});
