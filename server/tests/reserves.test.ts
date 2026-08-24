import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Offline Device Reserves & Reconciliation API', () => {
  let token: string;
  let deviceId: string;

  beforeEach(async () => {
    db.clear();

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reserves@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    token = regData.tokens.accessToken;

    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Pixel 8', platform: 'android' }),
    });
    const pairData = await pair.json();
    deviceId = pairData.device.id;

    // Credit 3600s balance
    await app.request('/api/bank/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ source: 'manual', seconds: 3600, idempotencyKey: 'fund-reserves' }),
    });
  });

  it('should allocate offline reserve, decrease available balance, and reconcile spend outbox without double deduction', async () => {
    // 1. Allocate reserve of 1800s (30m)
    const allocRes = await app.request('/api/reserves/allocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        requestedSeconds: 1800,
        ttlSeconds: 43200,
        idempotencyKey: 'alloc-reserve-1',
      }),
    });

    expect(allocRes.status).toBe(201);
    const { reserve } = await allocRes.json();
    expect(reserve.reservedSeconds).toBe(1800);

    // 2. Check balance: total is 3600, reserved is 1800, available is 1800
    const balRes = await app.request('/api/bank/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const balData = await balRes.json();
    expect(balData.balanceSeconds).toBe(3600);
    expect(balData.reservedSeconds).toBe(1800);
    expect(balData.availableSeconds).toBe(1800);

    // 3. Reconcile offline events: Device spent 600s while offline
    const reconRes = await app.request('/api/reserves/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        reserveId: reserve.id,
        events: [
          {
            eventId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
            deviceId,
            targetType: 'app',
            targetIdentifier: 'com.instagram.android',
            secondsSpent: 600,
            localTimestamp: '2026-08-25T01:00:00Z',
            isEmergency: false,
          },
        ],
      }),
    });

    expect(reconRes.status).toBe(200);
    const reconData = await reconRes.json();
    expect(reconData.reconciledCount).toBe(1);
    expect(reconData.acceptedSeconds).toBe(600);
    expect(reconData.releasedUnusedSeconds).toBe(1200); // 1800 - 600 returned
    expect(reconData.newBalanceSeconds).toBe(3000); // 3600 - 600

    // 4. Verify ledger and available balance
    const postBalRes = await app.request('/api/bank/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const postBal = await postBalRes.json();
    expect(postBal.balanceSeconds).toBe(3000);
    expect(postBal.reservedSeconds).toBe(0);
    expect(postBal.availableSeconds).toBe(3000);
  });
});
