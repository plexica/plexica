import Fastify from 'fastify';
import cors from '@fastify/cors';
import contactsRoutes from './routes/contacts.js';
import dealsRoutes from './routes/deals.js';
import eventsRoutes from './routes/events.js';
import healthRoutes from './health.js';

const app = Fastify();

await app.register(cors);
await app.register(contactsRoutes, { prefix: '/contacts' });
await app.register(dealsRoutes, { prefix: '/deals' });
await app.register(eventsRoutes, { prefix: '/_plexica/event' });
await app.register(healthRoutes, { prefix: '/_plexica' });

export default app;
