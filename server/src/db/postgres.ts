import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export interface PostgresInitOptions {
  connectionString?: string | null;
  environment?: string;
  pool?: pg.Pool;
  schemaPath?: string;
  connectionTimeoutMillis?: number;
}

function schemaFilePath(explicitPath?: string): string {
  const candidates = [
    explicitPath,
    path.join(moduleDirectory, 'schema.sql'),
    path.join(process.cwd(), 'server', 'src', 'db', 'schema.sql'),
    path.join(process.cwd(), 'src', 'db', 'schema.sql'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('FATAL: PostgreSQL schema.sql could not be located');
  }
  return found;
}

function createPool(connectionString: string, connectionTimeoutMillis: number): pg.Pool {
  const isLocal = /(?:localhost|127\.0\.0\.1)/.test(connectionString);
  return new Pool({
    connectionString,
    connectionTimeoutMillis,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

export async function initPostgresDatabase(
  options: PostgresInitOptions = {},
): Promise<pg.Pool | null> {
  const connectionString = Object.prototype.hasOwnProperty.call(options, 'connectionString')
    ? options.connectionString ?? null
    : process.env.DATABASE_URL ?? null;
  const environment = options.environment ?? process.env.NODE_ENV ?? 'development';

  if (!connectionString) {
    if (environment === 'production') {
      throw new Error('FATAL: DATABASE_URL is strictly required in production');
    }
    console.log('[DB] DATABASE_URL not set; development will use the explicit memory adapter.');
    return null;
  }

  const databasePool = options.pool ?? createPool(connectionString, options.connectionTimeoutMillis ?? 5_000);
  try {
    const client = await databasePool.connect();
    try {
      await client.query(fs.readFileSync(schemaFilePath(options.schemaPath), 'utf8'));
    } finally {
      client.release();
    }
    console.log('[DB] PostgreSQL schema initialized successfully.');
    return databasePool;
  } catch (error) {
    if (!options.pool) {
      await databasePool.end().catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FATAL: PostgreSQL initialization failed: ${message}`, { cause: error });
  }
}
