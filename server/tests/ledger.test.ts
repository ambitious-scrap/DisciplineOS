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
  });

  it('should earn points atomically and record immutable transaction', async () => {
    const res = await app.request('/api/bank/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: 'gym',
        seconds: 3600,
        description: 'Morning workout',
        idempotencyKey: 'idem-earn-12345',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transaction.seconds).toBe(3600);
    expect(data.newBalance.balanceSeconds).toBe(3600);
    expect(data.newBalance.availableSeconds).toBe(3600);

    // Duplicate earn with same idempotency key must not double-credit
    const dupRes = await app.request('/api/bank/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: 'gym',
        seconds: 3600,
        description: 'Morning workout',
        idempotencyKey: 'idem-earn-12345',
      }),
    });
    const dupData = await dupRes.json();
    expect(dupData.newBalance.balanceSeconds).toBe(3600); // remains 3600
  });

  it('should spend points and reject when balance is insufficient', async () => {
    // 1. Try to spend with 0 balance -> reject
    const failSpend = await app.request('/api/bank/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 600,
        targetType: 'app',
        targetIdentifier: 'com.instagram.android',
        deviceId,
        idempotencyKey: 'spend-fail-1',
      }),
    });
    expect(failSpend.status).toBe(400);

    // 2. Earn 1800s
    await app.request('/api/bank/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: 'task',
        seconds: 1800,
        idempotencyKey: 'earn-for-spend',
      }),
    });

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

  it('should charge 3x penalty for emergency unlock', async () => {
    // Earn 1800s
    await app.request('/api/bank/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        source: 'manual',
        seconds: 1800,
        idempotencyKey: 'earn-for-emergency',
      }),
    });

    // Emergency unlock for 300s (5 min) -> 3x = 900s deducted
    const emRes = await app.request('/api/bank/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        seconds: 300,
        targetType: 'site',
        targetIdentifier: 'youtube.com',
        deviceId,
        multiplier: 3,
        idempotencyKey: 'emergency-1',
      }),
    });

    expect(emRes.status).toBe(200);
    const emData = await emRes.json();
    expect(emData.transaction.seconds).toBe(900); // 300 * 3
    expect(emData.newBalance.balanceSeconds).toBe(900); // 1800 - 900
    expect(emData.transaction.source).toBe('emergency');
  });
});
