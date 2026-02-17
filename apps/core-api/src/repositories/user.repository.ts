// File: apps/core-api/src/repositories/user.repository.ts
import { Prisma } from '@plexica/database';
import type { Logger } from 'pino';
import { db } from '../lib/db.js';
import { logger as defaultLogger } from '../lib/logger.js';
import { getTenantContext, type TenantContext } from '../middleware/tenant-context.js';
import type { CreateUserDto, UpdateUserDto } from '../types/auth.types.js';

/**
 * UserRepository - Data access layer for tenant-scoped user records
 *
 * This repository enforces tenant schema isolation via AsyncLocalStorage context
 * and uses parameterized Prisma queries only (Constitution Art. 3.3, Art. 5.3).
 *
 * All methods require a tenant context to be set via tenantContextMiddleware.
 *
 * @see FR-008 (User Profile Management)
 * @see Plan §4.4 (UserRepository)
 */
export class UserRepository {
  private logger: Logger;

  constructor(customLogger?: Logger) {
    this.logger = customLogger || defaultLogger;
  }
  /**
   * Get current tenant context and validate it exists
   * @throws Error if no tenant context is available
   */
  private getTenantSchemaOrThrow(tenantCtx?: TenantContext): string {
    const context = tenantCtx || getTenantContext();
    if (!context) {
      this.logger.error('No tenant context available for UserRepository operation');
      throw new Error('No tenant context available. UserRepository requires tenant context.');
    }

    const schemaName = context.schemaName;

    // SECURITY: Validate schema name to prevent SQL injection (Art. 5.3)
    // Only allow lowercase alphanumeric characters and underscores
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      this.logger.error(
        { schemaName },
        'Invalid schema name detected - potential SQL injection attempt'
      );
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return schemaName;
  }

  /**
   * Find user by Keycloak UUID
   *
   * @param keycloakId - Keycloak user UUID
   * @param tenantCtx - Optional tenant context override (for testing)
   * @returns User or null if not found
   */
  async findByKeycloakId(keycloakId: string, tenantCtx?: TenantContext): Promise<any | null> {
    const schemaName = this.getTenantSchemaOrThrow(tenantCtx);

    try {
      // Use parameterized query via Prisma (Constitution Art. 3.3, Art. 5.3)
      const result = await db.$queryRaw<any[]>`
        SELECT * FROM ${Prisma.raw(`"${schemaName}"."users"`)}
        WHERE keycloak_id = ${keycloakId}
        LIMIT 1
      `;

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      this.logger.error(
        { keycloakId, schemaName, error: error instanceof Error ? error.message : String(error) },
        'Failed to find user by Keycloak ID'
      );
      throw error;
    }
  }

  /**
   * Find user by email address
   *
   * @param email - User email address
   * @param tenantCtx - Optional tenant context override (for testing)
   * @returns User or null if not found
   */
  async findByEmail(email: string, tenantCtx?: TenantContext): Promise<any | null> {
    const schemaName = this.getTenantSchemaOrThrow(tenantCtx);

    const result = await db.$queryRaw<any[]>`
      SELECT * FROM ${Prisma.raw(`"${schemaName}"."users"`)}
      WHERE email = ${email}
      LIMIT 1
    `;

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Find user by internal UUID
   *
   * @param id - User internal UUID
   * @param tenantCtx - Optional tenant context override (for testing)
   * @returns User or null if not found
   */
  async findById(id: string, tenantCtx?: TenantContext): Promise<any | null> {
    const schemaName = this.getTenantSchemaOrThrow(tenantCtx);

    const result = await db.$queryRaw<any[]>`
      SELECT * FROM ${Prisma.raw(`"${schemaName}"."users"`)}
      WHERE id = ${id}
      LIMIT 1
    `;

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Create new user record in tenant schema
   *
   * @param data - User creation data
   * @param tenantCtx - Optional tenant context override (for testing)
   * @returns Created user record
   */
  async create(data: CreateUserDto, tenantCtx?: TenantContext): Promise<any> {
    const schemaName = this.getTenantSchemaOrThrow(tenantCtx);

    try {
      // Prepare optional fields with safe defaults
      const firstName = data.firstName || null;
      const lastName = data.lastName || null;
      const displayName = data.displayName || null;
      const avatarUrl = data.avatarUrl || null;
      const locale = data.locale || 'en';
      const preferences = data.preferences || {};
      const status = data.status || 'ACTIVE';

      // Use parameterized INSERT query
      const result = await db.$queryRaw<any[]>`
        INSERT INTO ${Prisma.raw(`"${schemaName}"."users"`)} (
          id, keycloak_id, email, first_name, last_name, display_name, 
          avatar_url, locale, preferences, status, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(),
          ${data.keycloakId},
          ${data.email},
          ${firstName},
          ${lastName},
          ${displayName},
          ${avatarUrl},
          ${locale},
          ${JSON.stringify(preferences)}::jsonb,
          ${status}::"core"."UserStatus",
          NOW(),
          NOW()
        )
        RETURNING *
      `;

      if (result.length === 0) {
        throw new Error('Failed to create user: no row returned');
      }

      this.logger.info(
        { keycloakId: data.keycloakId, email: data.email, schemaName },
        'User created successfully'
      );

      return result[0];
    } catch (error) {
      this.logger.error(
        {
          keycloakId: data.keycloakId,
          email: data.email,
          schemaName,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to create user'
      );
      throw error;
    }
  }

  /**
   * Update existing user record by Keycloak ID
   *
   * @param keycloakId - Keycloak user UUID
   * @param data - User update data (partial)
   * @param tenantCtx - Optional tenant context override (for testing)
   * @returns Updated user record
   * @throws Error if user not found
   */
  async update(keycloakId: string, data: UpdateUserDto, tenantCtx?: TenantContext): Promise<any> {
    const schemaName = this.getTenantSchemaOrThrow(tenantCtx);

    try {
      // Build dynamic SET clause based on provided fields
      const updates: string[] = [];
      const values: any[] = [];

      if (data.email !== undefined) {
        updates.push(`email = $${values.length + 1}`);
        values.push(data.email);
      }
      if (data.firstName !== undefined) {
        updates.push(`first_name = $${values.length + 1}`);
        values.push(data.firstName);
      }
      if (data.lastName !== undefined) {
        updates.push(`last_name = $${values.length + 1}`);
        values.push(data.lastName);
      }
      if (data.displayName !== undefined) {
        updates.push(`display_name = $${values.length + 1}`);
        values.push(data.displayName);
      }
      if (data.avatarUrl !== undefined) {
        updates.push(`avatar_url = $${values.length + 1}`);
        values.push(data.avatarUrl);
      }
      if (data.locale !== undefined) {
        updates.push(`locale = $${values.length + 1}`);
        values.push(data.locale);
      }
      if (data.preferences !== undefined) {
        updates.push(`preferences = $${values.length + 1}::jsonb`);
        values.push(JSON.stringify(data.preferences));
      }
      if (data.status !== undefined) {
        updates.push(`status = $${values.length + 1}::"core"."UserStatus"`);
        values.push(data.status);
      }

      // Always update updated_at
      updates.push(`updated_at = NOW()`);

      if (updates.length === 1) {
        // Only updated_at, nothing else to update
        throw new Error('No fields provided for update');
      }

      // Add keycloakId as final parameter
      values.push(keycloakId);

      // Build parameterized UPDATE query
      const query = `
        UPDATE "${schemaName}"."users"
        SET ${updates.join(', ')}
        WHERE keycloak_id = $${values.length}
        RETURNING *
      `;

      const result = await db.$queryRawUnsafe<any[]>(query, ...values);

      if (result.length === 0) {
        throw new Error(`User with keycloakId '${keycloakId}' not found in tenant schema`);
      }

      this.logger.info(
        { keycloakId, schemaName, fieldsUpdated: Object.keys(data) },
        'User updated successfully'
      );

      return result[0];
    } catch (error) {
      this.logger.error(
        { keycloakId, schemaName, error: error instanceof Error ? error.message : String(error) },
        'Failed to update user'
      );
      throw error;
    }
  }

  /**
   * Soft delete user by setting status to DELETED
   *
   * @param keycloakId - Keycloak user UUID
   * @param tenantCtx - Optional tenant context override (for testing)
   * @returns Updated user record with status='DELETED'
   * @throws Error if user not found
   */
  async softDelete(keycloakId: string, tenantCtx?: TenantContext): Promise<any> {
    const schemaName = this.getTenantSchemaOrThrow(tenantCtx);

    const result = await db.$queryRaw<any[]>`
      UPDATE ${Prisma.raw(`"${schemaName}"."users"`)}
      SET status = 'DELETED'::"core"."UserStatus",
          updated_at = NOW()
      WHERE keycloak_id = ${keycloakId}
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error(`User with keycloakId '${keycloakId}' not found in tenant schema`);
    }

    return result[0];
  }

  /**
   * Upsert user (insert or update on conflict)
   * Used for event-driven user sync from Keycloak
   *
   * @param data - User data from Keycloak event
   * @param tenantCtx - Optional tenant context override (for testing)
   * @returns Upserted user record
   */
  async upsert(data: CreateUserDto, tenantCtx?: TenantContext): Promise<any> {
    const schemaName = this.getTenantSchemaOrThrow(tenantCtx);

    // Prepare optional fields with safe defaults
    const firstName = data.firstName || null;
    const lastName = data.lastName || null;
    const displayName = data.displayName || null;
    const avatarUrl = data.avatarUrl || null;
    const locale = data.locale || 'en';
    const preferences = data.preferences || {};
    const status = data.status || 'ACTIVE';

    // UPSERT query (INSERT ... ON CONFLICT DO UPDATE)
    const result = await db.$queryRaw<any[]>`
      INSERT INTO ${Prisma.raw(`"${schemaName}"."users"`)} (
        id, keycloak_id, email, first_name, last_name, display_name, 
        avatar_url, locale, preferences, status, created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${data.keycloakId},
        ${data.email},
        ${firstName},
        ${lastName},
        ${displayName},
        ${avatarUrl},
        ${locale},
        ${JSON.stringify(preferences)}::jsonb,
        ${status}::"core"."UserStatus",
        NOW(),
        NOW()
      )
      ON CONFLICT (keycloak_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        locale = EXCLUDED.locale,
        preferences = EXCLUDED.preferences,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *
    `;

    if (result.length === 0) {
      throw new Error('Failed to upsert user: no row returned');
    }

    return result[0];
  }
}

// Export singleton instance
export const userRepository = new UserRepository();
