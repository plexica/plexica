// sessions.ts
// Session management orchestration for the user-profile module (006-13).
// Split from service.ts (Constitution Rule 4).

import { AppError, NotFoundError, ServiceUnavailableError } from '../../lib/app-error.js';
import { deleteUserSession, listUserSessions } from '../../lib/keycloak-admin-users.js';
import { logger } from '../../lib/logger.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findProfileByKeycloakId } from './repository.js';

import type { KeycloakUserSession } from '../../lib/keycloak-admin-users.js';
import type { TenantPrismaClient } from '../../lib/tenant-database.js';
import type { SessionListDto, UserSessionDto } from './types.js';

/**
 * Maps Keycloak Admin transport failures to 503 SERVICE_UNAVAILABLE (006-13).
 * KeycloakError and other AppErrors pass through untouched — only unexpected
 * failures (connection refused, timeout, malformed payload) become 503.
 */
function toSessionUnavailable(err: unknown): never {
  if (err instanceof AppError) throw err;
  throw new ServiceUnavailableError('Keycloak session service unavailable');
}

function toSessionDto(
  session: KeycloakUserSession,
  currentSessionId: string | undefined
): UserSessionDto {
  const clientIds = Object.values(session.clients ?? {});
  return {
    id: session.id,
    clientId: clientIds[0] ?? 'unknown',
    ipAddress: session.ipAddress ?? null,
    startedAt: new Date(session.start).toISOString(),
    lastSeenAt: new Date(session.lastAccess).toISOString(),
    current: currentSessionId !== undefined && session.id === currentSessionId,
  };
}

/** Lists the caller's active Keycloak SSO sessions. */
export async function listSessions(
  realmName: string,
  keycloakUserId: string,
  currentSessionId?: string | undefined
): Promise<SessionListDto> {
  let raw: KeycloakUserSession[];
  try {
    raw = await listUserSessions(realmName, keycloakUserId);
  } catch (err: unknown) {
    toSessionUnavailable(err);
  }
  return { sessions: raw.map((session) => toSessionDto(session, currentSessionId)) };
}

/**
 * Revokes one of the caller's sessions — ownership check FIRST (F4): the
 * sessionId must belong to the caller, otherwise 404 NOT_FOUND (not found OR
 * not owned — no enumeration, mirrors notification `:id/read`). Only then is
 * the Keycloak Admin delete issued. Self-termination is allowed and forces
 * re-login on the revoked session.
 *
 * TenantPrismaClient (non-transactional): writes the audit log, mirroring the
 * profile/avatar pattern — session revocation is security-relevant.
 */
export async function revokeSession(
  tenantDb: TenantPrismaClient,
  realmName: string,
  keycloakUserId: string,
  sessionId: string
): Promise<{ revoked: boolean }> {
  let owned: KeycloakUserSession[];
  try {
    owned = await listUserSessions(realmName, keycloakUserId);
  } catch (err: unknown) {
    toSessionUnavailable(err);
  }
  if (!owned.some((session) => session.id === sessionId)) {
    throw new NotFoundError('Session not found');
  }

  try {
    await deleteUserSession(realmName, sessionId);
  } catch (err: unknown) {
    toSessionUnavailable(err);
  }

  logger.info({ keycloakUserId }, 'User session revoked');

  // The local profile may not exist yet (revocation can precede the first GET
  // /profile, which auto-provisions it). The revoke already succeeded — never
  // fail it over a missing audit actor.
  const profile = await findProfileByKeycloakId(tenantDb, keycloakUserId);
  if (profile === null) {
    logger.warn({ keycloakUserId }, 'Session revoked without audit entry: no local profile');
    return { revoked: true };
  }

  await writeAuditLog(tenantDb, {
    actorId: profile.userId,
    actionType: 'session.revoke',
    targetType: 'user_session',
    targetId: sessionId,
  });
  return { revoked: true };
}
