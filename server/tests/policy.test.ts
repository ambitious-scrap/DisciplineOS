import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Asymmetric Cooling-Off Policy API', () => {
  let token: string;

  beforeEach(async () => {
    db.clear();

    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'policy@disciplineos.local', password: 'password123' }),
    });
    const regData = await reg.json();
    token = regData.tokens.accessToken;
  });

  it('should enforce immediate stricter rules and delayed cooling-off for unblocking', async () => {
    // 1. Stricter rule: Add blocked app -> Immediate
    const appRes = await app.request('/api/policy/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        platform: 'android',
        identifier: 'com.instagram.android',
        displayName: 'Instagram',
      }),
    });
    expect(appRes.status).toBe(201);
    const appData = await appRes.json();
    expect(appData.app.identifier).toBe('com.instagram.android');

    // 2. Add blocked site -> Immediate
    const siteRes = await app.request('/api/policy/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ domain: 'reddit.com' }),
    });
    expect(siteRes.status).toBe(201);

    // 3. Verify both are actively blocked
    const polRes = await app.request('/api/policy', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(polRes.status).toBe(200);
    const polData = await polRes.json();
    expect(polData.blockedApps).toHaveLength(1);
    expect(polData.blockedSites).toHaveLength(1);

    // 4. Weaker rule: Request removal of blocked app -> 24-hour cooling-off period!
    const delRes = await app.request(`/api/policy/apps/${appData.app.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status).toBe(202);
    const delData = await delRes.json();
    expect(delData.status).toBe('pending');
    expect(delData.pendingChange.action).toBe('unblock_app');

    // 5. Verification: The app MUST STILL BE BLOCKED during the cooling-off period
    const polRes2 = await app.request('/api/policy', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const polData2 = await polRes2.json();
    expect(polData2.blockedApps).toHaveLength(1); // Still blocked!

    // 6. Check pending changes endpoint
    const pendingRes = await app.request('/api/policy/pending', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pendingRes.status).toBe(200);
    const pendingData = await pendingRes.json();
    expect(pendingData.pendingChanges).toHaveLength(1);

    // 7. Cancel pending change
    const cancelRes = await app.request(`/api/policy/cancel-pending/${delData.pendingChange.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(cancelRes.status).toBe(200);
  });
});
