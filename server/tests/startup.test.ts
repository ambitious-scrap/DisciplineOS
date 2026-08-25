import { describe, expect, it } from 'vitest';
import { initPostgresDatabase } from '../src/db/postgres.js';

describe('Production database startup policy', () => {
  it('refuses production startup when DATABASE_URL is absent', async () => {
    await expect(
      initPostgresDatabase({ connectionString: null, environment: 'production' }),
    ).rejects.toThrow('DATABASE_URL is strictly required in production');
  });

  it('fails production startup when a configured database is unavailable', async () => {
    await expect(
      initPostgresDatabase({
        connectionString: 'postgresql://postgres:postgres@127.0.0.1:1/disciplineos_test',
        environment: 'production',
        connectionTimeoutMillis: 50,
      }),
    ).rejects.toThrow('PostgreSQL initialization failed');
  });
});
