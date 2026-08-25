import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

const PHOTO_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('Tasks & Occurrence Completion API', () => {
  let token: string;
  let deviceToken: string;

  beforeEach(async () => {
    db.clear();
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'tasks@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    token = regData.tokens.accessToken;
    const pair = await app.request('/api/auth/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Task Android', platform: 'android' }),
    });
    deviceToken = (await pair.json()).tokens.accessToken;
  });

  it('rejects client reward amounts and applies the server manual policy', async () => {
    const rejected = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Unverified large reward', rewardSeconds: 3_600, evidenceType: 'none' }),
    });
    expect(rejected.status).toBe(400);

    const accepted = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Unverified small reward', evidenceType: 'none' }),
    });
    expect(accepted.status).toBe(201);
    expect((await accepted.json()).task.rewardSeconds).toBe(300);
  });

  it('requires server-registered one-time photo evidence', async () => {
    const createRes = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Read 20 pages of Book', evidenceType: 'photo', isRecurring: true }),
    });
    expect(createRes.status).toBe(201);
    const { task } = await createRes.json();
    expect(task.rewardSeconds).toBe(900);

    const noProofRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', idempotencyKey: 'task-no-proof' }),
    });
    expect(noProofRes.status).toBe(400);

    const evidenceRes = await app.request(`/api/tasks/${task.id}/evidence/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({
        occurrenceDate: '2026-08-25',
        sha256: PHOTO_HASH,
        sourceUri: 'https://storage.disciplineos.local/photos/proof1.jpg',
        idempotencyKey: 'photo-evidence-20260825',
      }),
    });
    expect(evidenceRes.status).toBe(201);
    const evidenceId = (await evidenceRes.json()).evidence.id;

    const compRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', photoEvidenceId: evidenceId, idempotencyKey: 'task-comp-20260825' }),
    });
    expect(compRes.status).toBe(200);
    const compData = await compRes.json();
    expect(compData.occurrence.rewardClaimed).toBe(true);
    expect(compData.balance.balanceSeconds).toBe(900);

    const duplicate = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-25', photoEvidenceId: evidenceId, idempotencyKey: 'task-comp-20260825-2' }),
    });
    expect(duplicate.status).toBe(400);

    const nextEvidence = await app.request(`/api/tasks/${task.id}/evidence/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-26', sha256: PHOTO_HASH, idempotencyKey: 'photo-evidence-20260826' }),
    });
    const nextEvidenceId = (await nextEvidence.json()).evidence.id;
    const nextDayRes = await app.request(`/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({ occurrenceDate: '2026-08-26', photoEvidenceId: nextEvidenceId, idempotencyKey: 'task-comp-20260826' }),
    });
    expect(nextDayRes.status).toBe(200);
    expect((await nextDayRes.json()).balance.balanceSeconds).toBe(1_800);
  });
});
