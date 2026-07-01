import Fastify from 'fastify';
import cors from '@fastify/cors';

import contactsRoutes from './routes/contacts.js';
import dealsRoutes from './routes/deals.js';
import eventsRoutes from './routes/events.js';
import healthRoutes from './health.js';
import { requireRolePlugin } from './auth.js';

const app = Fastify();

await app.register(cors);
// CRITICAL #12 — enforce X-Plexica-User-Role against declared action roles.
await app.register(requireRolePlugin);
await app.register(contactsRoutes, { prefix: '/contacts' });
await app.register(dealsRoutes, { prefix: '/deals' });
await app.register(eventsRoutes, { prefix: '/_plexica/event' });
await app.register(healthRoutes, { prefix: '/_plexica' });

export default app;
