import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../src/app.js';
import { db } from '../src/db/memoryStore.js';

describe('Policy Configuration API', () => {
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

  it('should manage blocked apps and blocked domains', async () => {
    // 1. Add blocked app
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

    // 2. Add blocked site
    const siteRes = await app.request('/api/policy/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ domain: 'reddit.com' }),
    });
    expect(siteRes.status).toBe(201);

    // 3. Get combined policy profile
    const polRes = await app.request('/api/policy', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(polRes.status).toBe(200);
    const polData = await polRes.json();
    expect(polData.blockedApps).toHaveLength(1);
    expect(polData.blockedSites).toHaveLength(1);
    expect(polData.blockedSites[0].domain).toBe('reddit.com');

    // 4. Remove blocked app
    const delRes = await app.request(`/api/policy/apps/${appData.app.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status).toBe(200);

    const polRes2 = await app.request('/api/policy', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const polData2 = await polRes2.json();
    expect(polData2.blockedApps).toHaveLength(0);
  });
});
