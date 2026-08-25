import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

const PHOTO_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('Immutable Ledger & Time Bank API', () => {
  let token: string;
  let userId: string;
  let deviceId: string;

  beforeEach(async () => {
    db.clear();
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ledger@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    userId = regData.user.id;
    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${regData.tokens.accessToken}` },
      body: JSON.stringify({ name: 'Phone', platform: 'android' }),
    });
    const pairData = await pair.json();
    deviceId = pairData.device.id;
    token = pairData.tokens.accessToken;
  });

  function seedBalance(seconds: number) {
    const bank = db.timeBanks.get(userId)!;
    bank.balanceSeconds = seconds;
  }

  it('rejects direct reward minting via deleted /api/bank/earn endpoint', async () => {
    const res = await app.request('/api/bank/earn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ source: 'gym', seconds: 3600, description: 'Trying to fake points', idempotencyKey: 'idem-fake-12345' }),
    });
    expect(res.status).toBe(404);
  });

  it('earns server-calculated photo reward and spends atomically', async () => {
    const taskRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Photo task', evidenceType: 'photo' }),
    });
    const task = (await taskRes.json()).task;
    const evidenceRes = await app.request(`/api/tasks/${task.id}/evidence/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', sha256: PHOTO_HASH, idempotencyKey: 'photo-ledger-1' }),
    });
    const evidenceId = (await evidenceRes.json()).evidence.id;
    const compRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', photoEvidenceId: evidenceId, idempotencyKey: 'comp-idem-1' }),
    });
    expect(compRes.status).toBe(200);
    expect((await compRes.json()).balance.balanceSeconds).toBe(900);

    const successSpend = await app.request('/api/bank/spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seconds: 600, targetType: 'app', targetIdentifier: 'com.instagram.android', deviceId, idempotencyKey: 'spend-success-1' }),
    });
    expect(successSpend.status).toBe(200);
    const spendData = await successSpend.json();
    expect(spendData.newBalance.balanceSeconds).toBe(300);
    expect(spendData.transaction.type).toBe('spend');
  });

  it('charges 3.0x emergency penalty server-side', async () => {
    seedBalance(1800);
    const emRes = await app.request('/api/bank/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seconds: 300, targetType: 'site', targetIdentifier: 'youtube.com', deviceId, multiplier: 1, idempotencyKey: 'emergency-1' }),
    });
    expect(emRes.status).toBe(200);
    const emData = await emRes.json();
    expect(emData.transaction.seconds).toBe(900);
    expect(emData.newBalance.balanceSeconds).toBe(900);
    expect(emData.transaction.source).toBe('emergency');
  });
});
