import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Location & Physical Movement Verification API', () => {
  let token: string;
  let userToken: string;
  let deviceId: string;
  let tabletToken: string;
  beforeEach(async () => {
    db.clear();
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'location@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    userToken = regData.tokens.accessToken;
    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: 'Pixel Phone', platform: 'android' }),
    });
    const pairData = await pair.json();
    deviceId = pairData.device.id;
    token = pairData.tokens.accessToken;
    const tablet = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: 'Tablet', platform: 'android' }),
    });
    tabletToken = (await tablet.json()).tokens.accessToken;

  });
  it('rejects malformed client timestamps before evidence processing', async () => {
    const response = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        locationType: 'gym',
        eventType: 'enter',
        clientOccurredAt: 'not-a-timestamp',
        idempotencyKey: 'invalid-location-time',
      }),
    });
    expect(response.status).toBe(400);
  });

  it('does not reward an immediate enter/exit even with a fake old client time', async () => {
    const oldTime = '2020-01-01T07:00:00.000Z';
    const enter = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ locationType: 'gym', eventType: 'enter', clientOccurredAt: oldTime, idempotencyKey: 'gym-enter-immediate' }),
    });
    expect(enter.status).toBe(201);

    const exit = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        locationType: 'gym',
        eventType: 'exit',
        clientOccurredAt: oldTime,
        movement: { stepDelta: 10_000, activeSeconds: 1_800, sampleCount: 30 },
        idempotencyKey: 'gym-exit-immediate',
      }),
    });
    expect(exit.status).toBe(201);
    expect((await exit.json()).rewardGranted).toBe(false);
  });

  it('uses server session time and server-evaluated movement for gym reward', async () => {
    await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ locationType: 'gym', eventType: 'enter', idempotencyKey: 'gym-enter-server-time' }),
    });
    const session = [...db.locationSessions.values()][0];
    session.serverStartedAt = new Date(Date.now() - 45 * 60_000).toISOString();

    const exit = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        locationType: 'gym',
        eventType: 'exit',
        movement: { stepDelta: 10_000, activeSeconds: 1_800, sampleCount: 30 },
        idempotencyKey: 'gym-exit-server-time',
      }),
    });
    expect(exit.status).toBe(201);
    const data = await exit.json();
    expect(data.rewardGranted).toBe(true);
    expect(data.balance.balanceSeconds).toBe(2_700);
  });

  it('does not combine phone enter with tablet exit', async () => {
    const enter = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ locationType: 'gym', eventType: 'enter', idempotencyKey: 'phone-enter-tablet-exit-enter' }),
    });
    expect(enter.status).toBe(201);
    const exit = await app.request('/api/events/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tabletToken}` },
      body: JSON.stringify({
        locationType: 'gym',
        eventType: 'exit',
        movement: { stepDelta: 10_000, activeSeconds: 1_800, sampleCount: 30 },
        idempotencyKey: 'phone-enter-tablet-exit-exit',
      }),
    });
    expect(exit.status).toBe(201);
    expect((await exit.json()).rewardGranted).toBe(false);
  });

  it('is idempotent for duplicate location events', async () => {
    const body = JSON.stringify({ locationType: 'gym', eventType: 'enter', idempotencyKey: 'duplicate-location-event' });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const first = await app.request('/api/events/location', { method: 'POST', headers, body });
    const replay = await app.request('/api/events/location', { method: 'POST', headers, body });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect((await first.json()).id).toBe((await replay.json()).id);
  });
});
