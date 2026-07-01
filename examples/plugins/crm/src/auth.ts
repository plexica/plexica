// auth.ts
// CRITICAL #12 — CRM backend enforces the X-Plexica-User-Role header against
// the action roles declared in the plugin manifest. The platform proxy sets
// X-Plexica-User-Role from the caller's workspace role; the plugin must not
// trust the client directly.
//
// Role hierarchy matches the platform: admin > member > viewer.
// Default minimum role by HTTP method (mirrors manifest defaultRoles):
//   GET    → viewer
//   POST   → member  (create)
//   PUT    → member  (update)
//   PATCH  → member  (update)
//   DELETE → admin   (delete)
//
// Per-action enforcement will switch to the manifest's `apiMappings` once the
// platform resolves the precise 3-part action key and forwards it; until then
// method-based defaults are a safe, conservative enforcement layer.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const ROLE_LEVEL: Record<string, number> = { admin: 3, member: 2, viewer: 1 };

const METHOD_MIN_ROLE: Record<string, string> = {
  GET: 'viewer',
  POST: 'member',
  PUT: 'member',
  PATCH: 'member',
  DELETE: 'admin',
};

function roleFromHeader(request: FastifyRequest): string {
  const raw = request.headers['x-plexica-user-role'];
  const role = typeof raw === 'string' ? raw.toLowerCase() : '';
  return ROLE_LEVEL[role] !== undefined ? role : '';
}

export async function requireRolePlugin(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Health/event ingest endpoints are platform-internal, skip enforcement.
    const url = request.url;
    if (url.startsWith('/_plexica')) return;

    const required = METHOD_MIN_ROLE[request.method] ?? 'admin';
    const role = roleFromHeader(request);

    if (role === '') {
      reply.status(403).send({ error: 'Missing or invalid X-Plexica-User-Role' });
      return;
    }
    const userLevel = ROLE_LEVEL[role] ?? 0;
    const requiredLevel = ROLE_LEVEL[required] ?? 99;
    if (userLevel < requiredLevel) {
      reply.status(403).send({ error: `Role "${role}" is not permitted to ${request.method} this resource` });
      return;
    }
  });
}
