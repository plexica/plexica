// service.ts
// Business logic for tenant settings and auth configuration.
// Branding logic lives in service-branding.ts.
// Implements: Spec 003, Phase 9

import { logger } from '../../lib/logger.js';
import { getRealmConfig, updateRealmConfig } from '../../lib/keycloak-admin-realm.js';
import { KeycloakError } from '../../lib/app-error.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findTenantSettings, updateTenantDisplayName } from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type {
  AuthConfigDto,
  TenantSettingsDto,
  UpdateAuthConfigInput,
  UpdateSettingsInput,
} from './types.js';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(tenantContext: TenantContext): Promise<TenantSettingsDto> {
  return findTenantSettings(tenantContext.tenantId);
}

export async function updateSettings(
  tenantDb: unknown,
  actorId: string,
  tenantContext: TenantContext,
  input: UpdateSettingsInput
): Promise<TenantSettingsDto> {
  const result = await updateTenantDisplayName(tenantContext.tenantId, input.displayName);

  writeAuditLog(tenantDb, {
    actorId,
    actionType: 'settings.name_change',
    targetType: 'tenant',
    targetId: tenantContext.tenantId,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Auth config
// ---------------------------------------------------------------------------

export async function getAuthConfig(tenantContext: TenantContext): Promise<AuthConfigDto> {
  try {
    return await getRealmConfig(tenantContext.realmName);
  } catch (err) {
    logger.warn(
      { err: String(err), realm: tenantContext.realmName },
      'Failed to get Keycloak realm config'
    );
    throw new KeycloakError('Failed to retrieve auth configuration from Keycloak');
  }
}

export async function updateAuthConfig(
  tenantDb: unknown,
  actorId: string,
  tenantContext: TenantContext,
  input: UpdateAuthConfigInput
): Promise<AuthConfigDto> {
  const patch: Partial<import('../../lib/keycloak-admin-realm.js').RealmAuthConfig> = {};
  if (input.loginTheme !== undefined) patch.loginTheme = input.loginTheme;
  if (input.ssoSessionMaxLifespan !== undefined)
    patch.ssoSessionMaxLifespan = input.ssoSessionMaxLifespan;
  if (input.bruteForceProtected !== undefined)
    patch.bruteForceProtected = input.bruteForceProtected;
  if (input.failureFactor !== undefined) patch.failureFactor = input.failureFactor;

  try {
    await updateRealmConfig(tenantContext.realmName, patch);
  } catch (err) {
    logger.warn(
      { err: String(err), realm: tenantContext.realmName },
      'Failed to update Keycloak realm config'
    );
    throw new KeycloakError('Failed to update auth configuration in Keycloak');
  }

  writeAuditLog(tenantDb, {
    actorId,
    actionType: 'settings.auth_config_change',
    targetType: 'tenant',
    targetId: tenantContext.tenantId,
  });

  return getAuthConfig(tenantContext);
}
