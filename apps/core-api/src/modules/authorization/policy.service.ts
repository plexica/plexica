// apps/core-api/src/modules/authorization/policy.service.ts
//
// ABAC policy management service.
// Spec 003 Task 4.4 — FR-007–FR-009, FR-014–FR-015, Edge Case #3, plan §4.5
//
// Design notes:
//   - ABAC is deny-only (spec §5, NFR-001): policies can only restrict, never expand RBAC.
//   - Feature flag: tenants.settings::jsonb->'features'->>'abac_enabled'
//     Write operations (create/update/delete) throw FeatureNotAvailableError when flag is off.
//     listPolicies returns empty page with featureEnabled=false when flag is off.
//   - Source immutability: 'core' and 'plugin' policies cannot be modified/deleted by users.
//
// Constitution Compliance:
//   - Art. 1.2: Tenant isolation — all queries scoped to tenantId
//   - Art. 3.3: validateSchemaName + parameterized queries (no string interpolation)
//   - Art. 5.2: No PII in logs
//   - Art. 6.1: Domain-specific error codes

import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import {
  conditionValidatorService,
  CONDITION_TREE_LIMIT_EXCEEDED,
} from './condition-validator.service.js';
import type { Policy, PolicyPage, PolicyFilters } from './types/index.js';
import type { CreatePolicyDto } from './dto/create-policy.dto.js';
import type { UpdatePolicyDto } from './dto/update-policy.dto.js';

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class PolicyNotFoundError extends Error {
  readonly code = 'POLICY_NOT_FOUND';
  constructor(policyId: string) {
    super(`Policy "${policyId}" not found`);
    this.name = 'PolicyNotFoundError';
  }
}

export class PolicyNameConflictError extends Error {
  readonly code = 'POLICY_NAME_CONFLICT';
  constructor(name: string) {
    super(`A policy with the name "${name}" already exists in this tenant`);
    this.name = 'PolicyNameConflictError';
  }
}

export class PolicySourceImmutableError extends Error {
  readonly code = 'POLICY_SOURCE_IMMUTABLE';
  constructor() {
    super('Policies created by the core system or plugins cannot be modified or deleted');
    this.name = 'PolicySourceImmutableError';
  }
}

export class FeatureNotAvailableError extends Error {
  readonly code = 'FEATURE_NOT_AVAILABLE';
  constructor(feature: string) {
    super(`Feature "${feature}" is not enabled for this tenant`);
    this.name = 'FeatureNotAvailableError';
  }
}

export class ConditionTreeInvalidError extends Error {
  readonly code = CONDITION_TREE_LIMIT_EXCEEDED;
  readonly details: string[];
  constructor(errors: string[]) {
    super(errors.join('; '));
    this.name = 'ConditionTreeInvalidError';
    this.details = errors;
  }
}

// ---------------------------------------------------------------------------
// Schema name validation
// ---------------------------------------------------------------------------

function validateSchemaName(schemaName: string): void {
  const schemaPattern = /^tenant_[a-z0-9_]{1,63}$/;
  if (!schemaPattern.test(schemaName)) {
    throw new Error(
      `Invalid schema name: "${schemaName}". Must match pattern tenant_[a-z0-9_]{1,63}`
    );
  }
}

// ---------------------------------------------------------------------------
// Raw DB row type
// ---------------------------------------------------------------------------

interface PolicyRow {
  id: string;
  tenant_id: string;
  name: string;
  resource: string;
  effect: 'DENY' | 'FILTER';
  conditions: unknown;
  priority: number;
  source: 'core' | 'plugin' | 'super_admin' | 'tenant_admin';
  plugin_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapPolicy(row: PolicyRow): Policy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    resource: row.resource,
    effect: row.effect,
    // conditions stored as JSONB — Prisma returns it as a plain object
    conditions: row.conditions as Policy['conditions'],
    priority: row.priority,
    source: row.source,
    pluginId: row.plugin_id,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// PolicyService
// ---------------------------------------------------------------------------

export class PolicyService {
  // -------------------------------------------------------------------------
  // Feature flag helper
  // -------------------------------------------------------------------------

  /**
   * Reads the abac_enabled feature flag from the public tenants table.
   * Returns false (safe default) if the tenant does not exist or the flag
   * is missing/null.
   */
  private async isAbacEnabled(tenantId: string): Promise<boolean> {
    try {
      const rows = await db.$queryRawUnsafe<Array<{ abac_enabled: string | null }>>(
        `SELECT settings->'features'->>'abac_enabled' AS abac_enabled
         FROM "core"."tenants"
         WHERE id = $1
         LIMIT 1`,
        tenantId
      );
      return rows[0]?.abac_enabled === 'true';
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Policy CRUD
  // -------------------------------------------------------------------------

  /**
   * Returns a paginated list of policies for a tenant.
   * When ABAC is disabled, returns an empty page with featureEnabled=false.
   */
  async listPolicies(
    tenantId: string,
    schemaName: string,
    filters: PolicyFilters = {}
  ): Promise<PolicyPage & { meta: { featureEnabled: boolean } }> {
    validateSchemaName(schemaName);

    const featureEnabled = await this.isAbacEnabled(tenantId);
    if (!featureEnabled) {
      return {
        data: [],
        meta: { total: 0, page: 1, limit: filters.limit ?? 50, featureEnabled: false },
      };
    }

    const { resource, effect, isActive, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let whereClauses = `WHERE tenant_id = $1`;
    const params: unknown[] = [tenantId];
    let pidx = 2;

    if (resource) {
      whereClauses += ` AND resource ILIKE $${pidx++}`;
      params.push(`%${resource}%`);
    }
    if (effect) {
      whereClauses += ` AND effect = $${pidx++}`;
      params.push(effect);
    }
    if (typeof isActive === 'boolean') {
      whereClauses += ` AND is_active = $${pidx++}`;
      params.push(isActive);
    }

    const countRows = await db.$queryRawUnsafe<Array<{ total: string }>>(
      `SELECT COUNT(*) AS total FROM "${schemaName}".policies ${whereClauses}`,
      ...params
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    const rows = await db.$queryRawUnsafe<PolicyRow[]>(
      `SELECT id, tenant_id, name, resource, effect, conditions, priority,
              source, plugin_id, is_active, created_at, updated_at
       FROM "${schemaName}".policies
       ${whereClauses}
       ORDER BY priority DESC, created_at ASC
       LIMIT $${pidx} OFFSET $${pidx + 1}`,
      ...params,
      limit,
      offset
    );

    return {
      data: rows.map(mapPolicy),
      meta: { total, page, limit, featureEnabled: true },
    };
  }

  /**
   * Returns a single policy.
   * Throws PolicyNotFoundError if not found.
   */
  async getPolicy(tenantId: string, schemaName: string, policyId: string): Promise<Policy> {
    validateSchemaName(schemaName);

    const rows = await db.$queryRawUnsafe<PolicyRow[]>(
      `SELECT id, tenant_id, name, resource, effect, conditions, priority,
              source, plugin_id, is_active, created_at, updated_at
       FROM "${schemaName}".policies
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      policyId,
      tenantId
    );

    if (rows.length === 0) throw new PolicyNotFoundError(policyId);
    return mapPolicy(rows[0]);
  }

  /**
   * Creates a new policy.
   *
   * Guards:
   *   - ABAC feature flag (404 FEATURE_NOT_AVAILABLE)
   *   - Condition tree validation (422 CONDITION_TREE_LIMIT_EXCEEDED)
   *   - Name uniqueness within tenant (409 POLICY_NAME_CONFLICT)
   *
   * Note: `source` defaults to 'tenant_admin' for user-created policies.
   */
  async createPolicy(tenantId: string, schemaName: string, dto: CreatePolicyDto): Promise<Policy> {
    validateSchemaName(schemaName);

    if (!(await this.isAbacEnabled(tenantId))) {
      throw new FeatureNotAvailableError('abac');
    }

    // Validate condition tree limits
    const validation = conditionValidatorService.validate(dto.conditions);
    if (!validation.valid) {
      throw new ConditionTreeInvalidError(validation.errors);
    }

    // Name uniqueness
    const nameCheck = await db.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "${schemaName}".policies
       WHERE tenant_id = $1 AND name = $2
       LIMIT 1`,
      tenantId,
      dto.name
    );
    if (nameCheck.length > 0) throw new PolicyNameConflictError(dto.name);

    const inserted = await db.$queryRawUnsafe<PolicyRow[]>(
      `INSERT INTO "${schemaName}".policies
         (id, tenant_id, name, resource, effect, conditions, priority, source, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6, 'tenant_admin', NOW(), NOW())
       RETURNING id, tenant_id, name, resource, effect, conditions, priority,
                 source, plugin_id, is_active, created_at, updated_at`,
      tenantId,
      dto.name,
      dto.resource,
      dto.effect,
      JSON.stringify(dto.conditions),
      dto.priority ?? 0
    );

    const policy = inserted[0];
    if (!policy) throw new Error('Policy insert failed unexpectedly');

    logger.info({ tenantId, policyId: policy.id, policyName: policy.name }, 'ABAC policy created');

    return mapPolicy(policy);
  }

  /**
   * Updates an existing policy.
   *
   * Guards:
   *   - ABAC feature flag
   *   - Source immutability: 'core' and 'plugin' sources are read-only (FR-009)
   *   - Condition tree validation if conditions are being updated
   *   - Name uniqueness if name is being changed
   */
  async updatePolicy(
    tenantId: string,
    schemaName: string,
    policyId: string,
    dto: UpdatePolicyDto
  ): Promise<Policy> {
    validateSchemaName(schemaName);

    if (!(await this.isAbacEnabled(tenantId))) {
      throw new FeatureNotAvailableError('abac');
    }

    const existing = await this.getPolicy(tenantId, schemaName, policyId);

    // Source immutability guard (FR-009)
    if (existing.source === 'core' || existing.source === 'plugin') {
      throw new PolicySourceImmutableError();
    }

    // Name conflict check
    if (dto.name && dto.name !== existing.name) {
      const nameCheck = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM "${schemaName}".policies
         WHERE tenant_id = $1 AND name = $2 AND id != $3
         LIMIT 1`,
        tenantId,
        dto.name,
        policyId
      );
      if (nameCheck.length > 0) throw new PolicyNameConflictError(dto.name);
    }

    // Validate conditions if provided
    if (dto.conditions !== undefined) {
      const validation = conditionValidatorService.validate(dto.conditions);
      if (!validation.valid) {
        throw new ConditionTreeInvalidError(validation.errors);
      }
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let pidx = 1;

    if (dto.name !== undefined) {
      setClauses.push(`name = $${pidx++}`);
      params.push(dto.name);
    }
    if (dto.resource !== undefined) {
      setClauses.push(`resource = $${pidx++}`);
      params.push(dto.resource);
    }
    if (dto.effect !== undefined) {
      setClauses.push(`effect = $${pidx++}`);
      params.push(dto.effect);
    }
    if (dto.conditions !== undefined) {
      setClauses.push(`conditions = $${pidx++}::jsonb`);
      params.push(JSON.stringify(dto.conditions));
    }
    if (dto.priority !== undefined) {
      setClauses.push(`priority = $${pidx++}`);
      params.push(dto.priority);
    }

    params.push(policyId, tenantId);

    await db.$executeRawUnsafe(
      `UPDATE "${schemaName}".policies
       SET ${setClauses.join(', ')}
       WHERE id = $${pidx++} AND tenant_id = $${pidx}`,
      ...params
    );

    logger.info({ tenantId, policyId }, 'ABAC policy updated');

    return this.getPolicy(tenantId, schemaName, policyId);
  }

  /**
   * Deletes a policy.
   *
   * Guards:
   *   - ABAC feature flag
   *   - Source immutability (FR-009)
   */
  async deletePolicy(tenantId: string, schemaName: string, policyId: string): Promise<void> {
    validateSchemaName(schemaName);

    if (!(await this.isAbacEnabled(tenantId))) {
      throw new FeatureNotAvailableError('abac');
    }

    const existing = await this.getPolicy(tenantId, schemaName, policyId);

    if (existing.source === 'core' || existing.source === 'plugin') {
      throw new PolicySourceImmutableError();
    }

    await db.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".policies WHERE id = $1 AND tenant_id = $2`,
      policyId,
      tenantId
    );

    logger.info({ tenantId, policyId }, 'ABAC policy deleted');
  }

  // -------------------------------------------------------------------------
  // Plugin lifecycle integration (FR-014)
  // -------------------------------------------------------------------------

  /**
   * Registers policies contributed by a plugin during installation.
   * All inserted rows get source = 'plugin' and are therefore immutable
   * by tenant admins (FR-009). Idempotent via ON CONFLICT DO NOTHING.
   *
   * @param tenantId   - Target tenant
   * @param schemaName - Validated schema name
   * @param pluginId   - Source plugin identifier
   * @param policies   - Array of policy definitions from the plugin manifest
   */
  async registerPluginPolicies(
    tenantId: string,
    schemaName: string,
    pluginId: string,
    policies: Array<{
      name: string;
      resource: string;
      effect: 'DENY' | 'FILTER';
      conditions: unknown;
      priority?: number;
    }>
  ): Promise<void> {
    validateSchemaName(schemaName);

    if (policies.length === 0) return;

    for (const policy of policies) {
      // Validate conditions even for plugin-provided policies
      const validation = conditionValidatorService.validate(policy.conditions);
      if (!validation.valid) {
        throw new ConditionTreeInvalidError(validation.errors);
      }

      await db.$executeRawUnsafe(
        `INSERT INTO "${schemaName}".policies
           (id, tenant_id, name, resource, effect, conditions, priority, source, plugin_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6, 'plugin', $7, NOW(), NOW())
         ON CONFLICT (tenant_id, name) DO NOTHING`,
        tenantId,
        policy.name,
        policy.resource,
        policy.effect,
        JSON.stringify(policy.conditions),
        policy.priority ?? 0,
        pluginId
      );
    }

    logger.info({ tenantId, pluginId, count: policies.length }, 'Plugin ABAC policies registered');
  }

  /**
   * Removes all policies contributed by a specific plugin.
   * Called during plugin uninstallation (FR-015).
   */
  async removePluginPolicies(
    tenantId: string,
    schemaName: string,
    pluginId: string
  ): Promise<void> {
    validateSchemaName(schemaName);

    await db.$executeRawUnsafe(
      `DELETE FROM "${schemaName}".policies
       WHERE tenant_id = $1 AND plugin_id = $2 AND source = 'plugin'`,
      tenantId,
      pluginId
    );

    logger.info({ tenantId, pluginId }, 'Plugin ABAC policies removed');
  }
}

/** Singleton instance */
export const policyService = new PolicyService();
