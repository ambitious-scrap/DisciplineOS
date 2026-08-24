import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Auth & Device API', () => {
  beforeEach(() => {
    db.clear();
  });

  it('should register a new user and initialize time bank to 0 balance', async () => {
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'user@disciplineos.local',
        password: 'securepassword123',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.email).toBe('user@disciplineos.local');
    expect(data.tokens.accessToken).toBeDefined();
    expect(data.tokens.refreshToken).toBeDefined();

    // Verify Time Bank initialized
    const bankRes = await app.request('/api/bank/balance', {
      headers: { Authorization: `Bearer ${data.tokens.accessToken}` },
    });
    expect(bankRes.status).toBe(200);
    const bank = await bankRes.json();
    expect(bank.balanceSeconds).toBe(0);
    expect(bank.maxSeconds).toBe(14400); // 4 hours
  });

  it('should reject duplicate email registration', async () => {
    await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'duplicate@disciplineos.local',
        password: 'securepassword123',
      }),
    });

    const res = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'duplicate@disciplineos.local',
        password: 'anotherpassword',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('should pair a new Android device and return device scoped tokens', async () => {
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'deviceuser@disciplineos.local',
        password: 'securepassword123',
      }),
    });
    const { tokens } = await regRes.json();

    const pairRes = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: 'Pixel 8 Pro',
        platform: 'android',
      }),
    });

    expect(pairRes.status).toBe(201);
    const pairData = await pairRes.json();
    expect(pairData.device.name).toBe('Pixel 8 Pro');
    expect(pairData.device.platform).toBe('android');
    expect(pairData.tokens.accessToken).toBeDefined();

    const devicesRes = await app.request('/api/auth/devices', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const devicesData = await devicesRes.json();
    expect(devicesData.devices).toHaveLength(1);
    expect(devicesData.devices[0].name).toBe('Pixel 8 Pro');
  });
});
