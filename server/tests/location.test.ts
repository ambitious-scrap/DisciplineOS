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

  it('should award 60 min points for reconstructed gym session of at least 30 mins', async () => {
    const enterTime = new Date('2026-08-25T07:00:00Z').toISOString();
    const exitTime = new Date('2026-08-25T07:45:00Z').toISOString(); // 45 mins later

    // 1. Enter gym
    await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'gym',
        eventType: 'enter',
        occurredAt: enterTime,
        idempotencyKey: 'gym-enter-1',
      }),
    });

    // 2. Exit gym with movement verified
    const res = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'gym',
        eventType: 'exit',
        movementVerified: true,
        occurredAt: exitTime,
        idempotencyKey: 'gym-exit-1',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.rewardGranted).toBe(true);
    expect(data.balance.balanceSeconds).toBe(3600); // 1 hour reward
  });

  it('should award 30 min points for outdoor activity (leaving home -> returning >= 60m later)', async () => {
    const leaveHomeTime = new Date('2026-08-25T14:00:00Z').toISOString();
    const returnHomeTime = new Date('2026-08-25T15:15:00Z').toISOString(); // 75 mins later

    // 1. Exit home
    await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'home',
        eventType: 'exit',
        occurredAt: leaveHomeTime,
        idempotencyKey: 'outdoor-leave-home',
      }),
    });

    // 2. Return home with movement verified
    const res = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'home',
        eventType: 'enter',
        movementVerified: true,
        occurredAt: returnHomeTime,
        idempotencyKey: 'outdoor-return-home',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.rewardGranted).toBe(true);
    expect(data.balance.balanceSeconds).toBe(1800); // 30 min outdoor reward
  });

  it('should not award gym points if dwell time is under threshold or movement unverified', async () => {
    const enterTime = new Date('2026-08-25T07:00:00Z').toISOString();
    const exitTime = new Date('2026-08-25T07:10:00Z').toISOString(); // only 10 mins

    await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'gym',
        eventType: 'enter',
        occurredAt: enterTime,
        idempotencyKey: 'gym-short-enter',
      }),
    });

    const res = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId,
        locationType: 'gym',
        eventType: 'exit',
        movementVerified: true,
        occurredAt: exitTime,
        idempotencyKey: 'gym-short-exit',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.rewardGranted).toBe(false);
  });
});
