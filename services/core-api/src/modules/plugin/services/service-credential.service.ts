import { config } from '../../../lib/config.js';
import { prisma } from '../../../lib/database.js';
import { ServiceUnavailableError } from '../../../lib/app-error.js';
import { withTenantDb } from '../../../lib/tenant-database.js';
import { toRealmName, toSchemaName } from '../../../lib/tenant-schema-helpers.js';

import {
  compareServiceCredentialDigest,
  digestServiceCredential,
  generateServiceCredential,
  parseServiceCredential,
} from './service-credential-token.js';

const CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SCOPE = 'events:emit' as const;

export interface CredentialBinding {
  tenantId: string;
  tenantSlug: string;
  installId: string;
  pluginId: string;
  pluginSlug: string;
}

export interface IssuedServiceCredential {
  credentialId: string;
  token: string;
  expiresAt: Date;
  version: number;
}

export interface PluginServiceIdentity extends CredentialBinding {
  kind: 'plugin-service';
  credentialId: string;
  scope: typeof SCOPE;
  schemaName: string;
  realmName: string;
}

function pepper(): string {
  if (!config.PLUGIN_CREDENTIAL_PEPPER) {
    throw new ServiceUnavailableError('Plugin service authentication unavailable');
  }
  return config.PLUGIN_CREDENTIAL_PEPPER;
}

export async function issueServiceCredential(
  binding: CredentialBinding,
  now = new Date()
): Promise<IssuedServiceCredential> {
  const [tenant, plugin] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: binding.tenantId }, select: { slug: true } }),
    prisma.plugin.findUnique({ where: { id: binding.pluginId }, select: { slug: true } }),
  ]);
  if (tenant?.slug !== binding.tenantSlug || plugin?.slug !== binding.pluginSlug) {
    throw new Error('Credential binding is invalid');
  }
  const generated = generateServiceCredential(pepper());
  const latest = await prisma.pluginServiceCredential.aggregate({
    where: { installId: binding.installId },
    _max: { version: true },
  });
  const version = (latest._max.version ?? 0) + 1;
  const expiresAt = new Date(now.getTime() + CREDENTIAL_TTL_MS);
  await prisma.pluginServiceCredential.create({
    data: {
      id: generated.credentialId,
      tenantId: binding.tenantId,
      installId: binding.installId,
      pluginId: binding.pluginId,
      pluginSlug: binding.pluginSlug,
      scope: SCOPE,
      secretDigest: Uint8Array.from(generated.digest),
      version,
      status: 'pending',
      expiresAt,
    },
  });
  return { credentialId: generated.credentialId, token: generated.token, expiresAt, version };
}

export async function completeCredentialRotation(
  installId: string,
  credentialId: string,
  succeeded: boolean,
  now = new Date()
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (!succeeded) {
      await tx.pluginServiceCredential.updateMany({
        where: { id: credentialId, installId, status: 'pending' },
        data: { status: 'revoked', revokedAt: now },
      });
      return;
    }
    const activated = await tx.pluginServiceCredential.updateMany({
      where: { id: credentialId, installId, status: 'pending', expiresAt: { gt: now } },
      data: { status: 'active', activatedAt: now },
    });
    if (activated.count !== 1) throw new Error('Credential activation failed');
    await tx.pluginServiceCredential.updateMany({
      where: { installId, id: { not: credentialId }, status: { in: ['pending', 'active'] } },
      data: { status: 'revoked', revokedAt: now },
    });
  });
}

export async function revokeInstallationCredentials(
  installId: string,
  now = new Date()
): Promise<void> {
  await prisma.pluginServiceCredential.updateMany({
    where: { installId, status: { in: ['pending', 'active'] } },
    data: { status: 'revoked', revokedAt: now },
  });
}

export async function revokeServiceCredential(
  credentialId: string,
  now = new Date()
): Promise<void> {
  await prisma.pluginServiceCredential.updateMany({
    where: { id: credentialId, status: { in: ['pending', 'active'] } },
    data: { status: 'revoked', revokedAt: now },
  });
}

export async function hasUsableInstallationCredential(
  installId: string,
  now = new Date()
): Promise<boolean> {
  return (
    (await prisma.pluginServiceCredential.count({
      where: { installId, status: 'active', expiresAt: { gt: now } },
    })) > 0
  );
}

export async function authenticateServiceCredential(
  token: string,
  now = new Date()
): Promise<PluginServiceIdentity | null> {
  const parsed = parseServiceCredential(token);
  if (!parsed) return null;
  const credential = await prisma.pluginServiceCredential.findUnique({
    where: { id: parsed.credentialId },
    include: { tenant: { include: { config: true } } },
  });
  if (!credential) return null;
  const actual = digestServiceCredential(parsed.credentialId, parsed.secret, pepper());
  if (!compareServiceCredentialDigest(credential.secretDigest, actual)) return null;
  if (credential.status !== 'active' || credential.scope !== SCOPE) return null;
  if (credential.expiresAt <= now) {
    await prisma.pluginServiceCredential.updateMany({
      where: { id: credential.id, status: 'active' },
      data: { status: 'expired' },
    });
    return null;
  }
  if (credential.tenant.status !== 'active') return null;
  const context = {
    tenantId: credential.tenantId,
    slug: credential.tenant.slug,
    schemaName: toSchemaName(credential.tenant.slug),
    realmName: credential.tenant.config?.keycloakRealm ?? toRealmName(credential.tenant.slug),
  };
  const installation = await withTenantDb(
    (db) => db.pluginInstallation.findUnique({ where: { id: credential.installId } }),
    context
  );
  if (
    !installation ||
    installation.pluginId !== credential.pluginId ||
    installation.tenantSlug !== credential.tenant.slug ||
    !['active', 'degraded'].includes(installation.status)
  )
    return null;
  return {
    kind: 'plugin-service',
    credentialId: credential.id,
    tenantId: credential.tenantId,
    tenantSlug: credential.tenant.slug,
    installId: credential.installId,
    pluginId: credential.pluginId,
    pluginSlug: credential.pluginSlug,
    scope: SCOPE,
    schemaName: context.schemaName,
    realmName: context.realmName,
  };
}
