import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import path from 'node:path';

import { config } from '../../../lib/config.js';
import { logger } from '../../../lib/logger.js';
import { PluginInstallError } from '../errors.js';

export interface PluginDbTransportPolicy {
  nodeEnv: 'development' | 'test' | 'production';
  sslMode: 'disable' | 'verify-full';
  rootCertPath?: string;
}

export const PLUGIN_CONTAINER_CA_PATH = '/tmp/plexica-postgres-ca.crt';

function encryptionKey(): Buffer {
  if (config.PLUGIN_DB_ENCRYPTION_KEY) {
    return Buffer.from(config.PLUGIN_DB_ENCRYPTION_KEY, 'hex');
  }
  if (config.NODE_ENV === 'production') {
    throw new PluginInstallError('Plugin database credential encryption is unavailable');
  }
  logger.warn('Using a process-local development key for plugin database credential encryption');
  return createHash('sha256').update(config.DATABASE_URL).digest();
}

export function encryptPluginDatabaseUrl(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

export function configuredPluginDbTransport(): PluginDbTransportPolicy {
  return {
    nodeEnv: config.NODE_ENV,
    sslMode: config.PLUGIN_DB_SSL_MODE,
    ...(config.PLUGIN_DB_SSL_ROOT_CERT_PATH
      ? { rootCertPath: PLUGIN_CONTAINER_CA_PATH }
      : {}),
  };
}

export function buildPluginDatabaseUrl(
  sourceUrl: string,
  roleName: string,
  password: string,
  schemaName: string,
  policy: PluginDbTransportPolicy
): string {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new PluginInstallError('Platform database configuration is invalid');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  ) {
    throw new PluginInstallError('Platform database configuration is invalid');
  }
  if (!/^[a-z0-9_]+$/.test(schemaName)) {
    throw new PluginInstallError('Plugin database schema is invalid');
  }
  if (policy.nodeEnv === 'production') {
    if (
      policy.sslMode !== 'verify-full' ||
      !policy.rootCertPath ||
      !path.isAbsolute(policy.rootCertPath)
    )
      throw new PluginInstallError('Verified plugin database TLS is required');
  } else if (policy.sslMode !== 'disable') {
    throw new PluginInstallError('Non-production plugin database TLS must be explicitly disabled');
  }

  url.username = roleName;
  url.password = password;
  if (config.PLUGIN_DB_HOST) url.hostname = config.PLUGIN_DB_HOST;
  if (config.PLUGIN_DB_PORT) url.port = String(config.PLUGIN_DB_PORT);
  url.hash = '';
  url.search = '';
  url.searchParams.set('options', `-c search_path=${schemaName}`);
  url.searchParams.set('sslmode', policy.sslMode);
  if (policy.sslMode === 'verify-full') {
    const rootCertPath = policy.rootCertPath;
    if (!rootCertPath) throw new PluginInstallError('Verified plugin database TLS is required');
    url.searchParams.set('sslrootcert', rootCertPath);
  }
  return url.toString();
}
