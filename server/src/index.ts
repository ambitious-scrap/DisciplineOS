import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';

console.log(`🚀 DisciplineOS Server starting on port ${config.port}...`);

serve({
  fetch: app.fetch,
  port: config.port,
});
