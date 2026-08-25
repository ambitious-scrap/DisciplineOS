import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Offline Device Reserves & Reconciliation API', () => {
  let token: string;
  let userId: string;
  let deviceId: string;

  beforeEach(async () => {
    db.clear();
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reserves@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    userId = regData.user.id;
    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.tokens.accessToken}` },
      body: JSON.stringify({ name: 'Pixel 8', platform: 'android' }),
    });
    const pairData = await pair.json();
    deviceId = pairData.device.id;
    token = pairData.tokens.accessToken;
    db.timeBanks.get(userId)!.balanceSeconds = 3_600;
  });

  it('allocates a reserve, reconciles its outbox, and never double-deducts', async () => {
    const allocRes = await app.request('/api/reserves/allocate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ deviceId, requestedSeconds: 1_800, ttlSeconds: 43_200, idempotencyKey: 'alloc-reserve-1' }),
    });
    expect(allocRes.status).toBe(201);
    const { reserve } = await allocRes.json();
    expect(reserve.reservedSeconds).toBe(1_800);

    const balRes = await app.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    const balData = await balRes.json();
    expect(balData.balanceSeconds).toBe(3_600);
    expect(balData.reservedSeconds).toBe(1_800);
    expect(balData.availableSeconds).toBe(1_800);

    const reconRes = await app.request('/api/reserves/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        reserveId: reserve.id,
        events: [{
          eventId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
          deviceId,
          targetType: 'app',
          targetIdentifier: 'com.instagram.android',
          secondsSpent: 600,
          localTimestamp: '2026-08-25T01:00:00Z',
          isEmergency: false,
        }],
      }),
    });
    expect(reconRes.status).toBe(200);
    const reconData = await reconRes.json();
    expect(reconData.reconciledCount).toBe(1);
    expect(reconData.acceptedSeconds).toBe(600);
    expect(reconData.releasedUnusedSeconds).toBe(1_200);
    expect(reconData.newBalanceSeconds).toBe(3_000);

    const postBalRes = await app.request('/api/bank/balance', { headers: { Authorization: `Bearer ${token}` } });
    expect((await postBalRes.json()).balanceSeconds).toBe(3_000);
  });
});
