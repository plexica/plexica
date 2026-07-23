import {
  ForbiddenError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../lib/app-error.js';
import { enterWithTenant } from '../lib/tenant-context-store.js';
import { authenticateServiceCredential } from '../modules/plugin/services/service-credential.service.js';

import { authMiddleware } from './auth-middleware.js';
import { tenantContextMiddleware } from './tenant-context.js';

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PluginServiceIdentity } from '../modules/plugin/services/service-credential.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    pluginServiceIdentity?: PluginServiceIdentity;
  }
}

export async function pluginEventAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const serviceToken = request.headers['x-plugin-service-token'];
  const authHeader = request.headers.authorization;

  if (typeof serviceToken === 'string' && serviceToken.length > 0) {
    const identity = await authenticateServiceCredential(serviceToken).catch(() => {
      throw new ServiceUnavailableError('Plugin service authentication unavailable');
    });
    if (!identity) throw new ForbiddenError('Plugin service request denied');
    const context = {
      tenantId: identity.tenantId,
      slug: identity.tenantSlug,
      schemaName: identity.schemaName,
      realmName: identity.realmName,
    };
    request.pluginServiceIdentity = identity;
    request.tenantContext = context;
    enterWithTenant(context);
    return;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing valid Authorization header or X-Plugin-Service-Token');
  }
  await authMiddleware(request, reply);
  await tenantContextMiddleware(request, reply);
}
