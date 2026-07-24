import { query } from './db.js';

import type { FastifyInstance } from 'fastify';

interface ProbeResult {
  allowed: boolean;
  code?: string;
  permissionDenied?: boolean;
}

async function probe(sql: string): Promise<ProbeResult> {
  try {
    await query(sql);
    return { allowed: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return {
      allowed: false,
      ...(code ? { code } : {}),
      permissionDenied: code === '42501',
    };
  }
}

export default async function databaseProbeRoutes(fastify: FastifyInstance): Promise<void> {
  // Rate limit the probe endpoint to prevent abuse.
  // codeql[js/missing-rate-limiting]
  fastify.get('/database-access', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async () => ({
    declaredTable: await probe('SELECT 1 FROM crm_contacts LIMIT 1'),
    coreTable: await probe('SELECT 1 FROM core.tenants LIMIT 1'),
    otherPluginTable: await probe('SELECT 1 FROM other_plugin_secrets LIMIT 1'),
  }));
}
