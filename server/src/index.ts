import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { initPostgresDatabase } from './db/postgres.js';
import { PostgresStore } from './db/postgresStore.js';
import { MemoryStore } from './db/memoryStore.js';

const pool = await initPostgresDatabase();
const store = pool ? new PostgresStore(pool) : new MemoryStore();
const app = createApp(store);

console.log(`DisciplineOS Server listening on port ${config.port}`);
serve({
  fetch: app.fetch,
  port: config.port,
});
