import Fastify from 'fastify';
import cors from '@fastify/cors';

import contactsRoutes from './routes/contacts.js';
import contextRoutes from './routes/context.js';
import dealsRoutes from './routes/deals.js';
import eventsRoutes from './routes/events.js';
import healthRoutes from './health.js';
import { requireRole } from './auth.js';
import databaseProbeRoutes from './database-probe.js';
import { initSdk, destroySdk } from './sdk.js';

const app = Fastify();

await app.register(cors);
// CRITICAL #12 — enforce X-Plexica-User-Role against declared action roles.
app.addHook('preHandler', requireRole);
await app.register(contactsRoutes, { prefix: '/contacts' });
await app.register(contextRoutes, { prefix: '/context' });
await app.register(dealsRoutes, { prefix: '/deals' });
await app.register(eventsRoutes, { prefix: '/_plexica/event' });
await app.register(healthRoutes, { prefix: '/_plexica' });
if (process.env['E2E_DATABASE_PROBE'] === 'true') {
  await app.register(databaseProbeRoutes, { prefix: '/_plexica' });
}

// Initialize the PluginSDK — must happen after route registration so that
// event handlers registered via sdk.onEvent() in route modules are in place
// before any event could be dispatched.
await initSdk();

// Ensure SDK cleanup on shutdown.
app.addHook('onClose', async () => {
  await destroySdk();
});

export default app;
