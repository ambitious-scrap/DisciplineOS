import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { initPostgresDatabase } from './db/postgres.js';

console.log(`🚀 DisciplineOS Server starting on port ${config.port}...`);

await initPostgresDatabase();

serve({
  fetch: app.fetch,
  port: config.port,
});
