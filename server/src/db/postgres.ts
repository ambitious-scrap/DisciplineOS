import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null;

export async function initPostgresDatabase() {
  if (!pool) {
    console.log('[DB] DATABASE_URL not set — utilizing in-memory authoritative storage engine.');
    return;
  }

  try {
    const client = await pool.connect();
    try {
      console.log('[DB] Connecting to PostgreSQL database...');
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('[DB] PostgreSQL schema initialized successfully.');
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] Failed to initialize PostgreSQL schema:', err);
  }
}
