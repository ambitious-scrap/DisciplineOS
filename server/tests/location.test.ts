import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Location & Physical Movement Verification API', () => {
  let token: string;
  let deviceId: string;

  beforeEach(async () => {
    db.clear();

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'location@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    token = regData.tokens.accessToken;

    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Pixel Phone', platform: 'android' }),
    });
    const pairData = await pair.json();
    deviceId = pairData.device.id;
  });

  it('should award 60 min points for verified gym session of at least 30 mins', async () => {
    const res = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'gym',
        eventType: 'exit',
        dwellSeconds: 2400, // 40 mins
        movementVerified: true,
        occurredAt: new Date().toISOString(),
        idempotencyKey: 'gym-visit-20260825',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.rewardGranted).toBe(true);
    expect(data.balance.balanceSeconds).toBe(3600); // 1 hour reward
  });

  it('should not award gym points if dwell time is under threshold or movement unverified', async () => {
    const res = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'gym',
        eventType: 'exit',
        dwellSeconds: 600, // only 10 mins
        movementVerified: true,
        occurredAt: new Date().toISOString(),
        idempotencyKey: 'gym-short-visit',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.rewardGranted).toBe(false);

    const balRes = await app.request('/api/bank/balance', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const balData = await balRes.json();
    expect(balData.balanceSeconds).toBe(0);
  });

  it('should record protection degradation events (e.g. VPN disconnected)', async () => {
    const res = await app.request('/api/events/protection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        eventType: 'vpn_disconnected',
        details: { reason: 'user_toggled_in_settings' },
        occurredAt: new Date().toISOString(),
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();

    const getRes = await app.request('/api/events/protection', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getData = await getRes.json();
    expect(getData.events).toHaveLength(1);
    expect(getData.events[0].eventType).toBe('vpn_disconnected');
  });
});
