import { beforeEach, describe, expect, it } from 'vitest';
import { createPublicKey, verify } from 'node:crypto';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

const leasePublicKey = createPublicKey({
  key: Buffer.from('MCowBQYDK2VwAyEAJP7DAT1FP0pr7PBUoet0W27gTWvqqZm4BjxFfjhOG8M=', 'base64'),
  format: 'der',
  type: 'spki',
});

describe('Active Sessions & Global Distraction Lock API', () => {
  let token: string;
  let userId: string;
  let phoneToken: string;
  let tabletToken: string;
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
    userId = regData.user.id;
    token = regData.tokens.accessToken;

    const pPair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Phone', platform: 'android' }),
    });
    const pData = await pPair.json();
    phoneDeviceId = pData.device.id;
    phoneToken = pData.tokens.accessToken;

    const tPair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Tablet', platform: 'android' }),
    });
    const tData = await tPair.json();
    tabletDeviceId = tData.device.id;
    tabletToken = tData.tokens.accessToken;

    db.timeBanks.get(userId)!.balanceSeconds = 1_800;
  });

  it('starts an Ed25519-signed lease and enforces global lock', async () => {
    const unlockRes = await app.request('/api/sessions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${phoneToken}` },
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
    const lease = unlockData.session.lease;
    expect(lease.algorithm).toBe('Ed25519');
    expect(lease.keyId).toBe('server-lease-v1');
    expect(lease.payload.deviceId).toBe(phoneDeviceId);
    expect(lease.payload.targetIdentifier).toBe('com.instagram.android');
    expect(lease.payload.durationSeconds).toBe(600);
    expect(
      verify(
        null,
        Buffer.from(lease.canonicalPayload),
        leasePublicKey,
        Buffer.from(lease.signature, 'base64url'),
      ),
    ).toBe(true);
    expect(
      verify(
        null,
        Buffer.from(lease.canonicalPayload.replace(phoneDeviceId, tabletDeviceId)),
        leasePublicKey,
        Buffer.from(lease.signature, 'base64url'),
      ),
    ).toBe(false);

    const concurrentRes = await app.request('/api/sessions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tabletToken}` },
      body: JSON.stringify({
        seconds: 300,
        targetType: 'site',
        targetIdentifier: 'reddit.com',
        deviceId: tabletDeviceId,
        idempotencyKey: 'session-unlock-2',
      }),
    });
    expect(concurrentRes.status).toBe(400);

    const relRes = await app.request('/api/sessions/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${phoneToken}` },
      body: JSON.stringify({ sessionId: unlockData.session.id, deviceId: phoneDeviceId }),
    });
    expect(relRes.status).toBe(200);

    const tabletUnlock = await app.request('/api/sessions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tabletToken}` },
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
