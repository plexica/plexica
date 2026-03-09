// File: packages/sdk/src/data-extension-client.ts

/**
 * @plexica/sdk — DataExtensionClient
 *
 * SDK client for contributing plugins to serve sidecar data for extensible
 * entities. Plugins register handlers that are called when a host entity
 * needs enrichment data.
 *
 * Spec reference: Plan §4.15, T013-10, FR-029, NFR-006
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A sidecar data handler receives an entity ID and the validated tenant ID,
 * and returns a flat record of additional field values.
 *
 * The return type must match the `fieldSchema` declared in the manifest's
 * `dataExtensions[].fieldSchema`.
 */
export type DataExtensionHandler = (
  entityId: string,
  tenantId: string
) => Promise<Record<string, unknown>>;

/**
 * Incoming sidecar data request (parsed from the HTTP request).
 */
export interface DataExtensionRequest {
  /** Entity type (e.g. "contacts") */
  entityType: string;
  /** Entity ID to fetch sidecar data for */
  entityId: string;
  /** Tenant context from the request headers / body */
  tenantId: string;
}

/**
 * Outgoing sidecar data response.
 */
export interface DataExtensionResponse {
  /** Entity type echo */
  entityType: string;
  /** Entity ID echo */
  entityId: string;
  /** Tenant ID echo */
  tenantId: string;
  /** Sidecar field values returned by the handler */
  fields: Record<string, unknown>;
}

/**
 * Error response when the handler fails or validation rejects the data.
 */
export interface DataExtensionError {
  error: {
    code: 'HANDLER_NOT_FOUND' | 'TENANT_MISMATCH' | 'SCHEMA_VALIDATION_FAILED' | 'HANDLER_ERROR';
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// DataExtensionClient
// ---------------------------------------------------------------------------

/**
 * Client for contributing plugins to serve sidecar data to extensible entities.
 *
 * Usage:
 * ```typescript
 * class MyCrmPlugin extends PlexicaPlugin {
 *   async onActivate(context: PluginContext) {
 *     this.dataExtensions.registerHandler('contacts', async (entityId, tenantId) => {
 *       const notes = await this.db.notes.findMany({ contactId: entityId, tenantId });
 *       return { noteCount: notes.length, lastNoteAt: notes[0]?.createdAt ?? null };
 *     });
 *   }
 * }
 * ```
 *
 * Spec reference: Plan §4.15, T013-10, FR-029, NFR-006
 */
export class DataExtensionClient {
  /**
   * Map of entity type → registered handler.
   * Only one handler per entity type is supported per plugin.
   */
  private readonly handlers = new Map<string, DataExtensionHandler>();

  /**
   * JSON Schema map for field validation, keyed by entity type.
   * Set via `registerHandler` optional fieldSchema parameter.
   */
  private readonly fieldSchemas = new Map<string, Record<string, unknown>>();

  /**
   * The plugin ID that owns this client instance (for logging).
   */
  private readonly pluginId: string;

  constructor(pluginId: string) {
    this.pluginId = pluginId;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register a sidecar data handler for a given entity type.
   *
   * Only one handler per entity type per plugin. Registering a second handler
   * for the same entity type replaces the first.
   *
   * @param entityType  The entity type key declared in the manifest
   *                    (e.g. "contacts", "deals").
   * @param handler     Async function receiving (entityId, tenantId) and
   *                    returning a flat record of sidecar fields.
   * @param fieldSchema Optional JSON Schema to validate the returned fields
   *                    before sending to the caller. When provided, responses
   *                    that don't conform are rejected with SCHEMA_VALIDATION_FAILED.
   */
  registerHandler(
    entityType: string,
    handler: DataExtensionHandler,
    fieldSchema?: Record<string, unknown>
  ): void {
    if (!entityType || typeof entityType !== 'string') {
      throw new Error(
        `DataExtensionClient(${this.pluginId}): entityType must be a non-empty string`
      );
    }
    this.handlers.set(entityType, handler);
    if (fieldSchema) {
      this.fieldSchemas.set(entityType, fieldSchema);
    }
  }

  /**
   * Remove the handler for an entity type.
   * Called automatically on plugin deactivation if using `PlexicaPlugin`.
   */
  unregisterHandler(entityType: string): void {
    this.handlers.delete(entityType);
    this.fieldSchemas.delete(entityType);
  }

  /**
   * Remove all registered handlers.
   * Called on plugin stop to ensure no stale handlers remain.
   */
  unregisterAll(): void {
    this.handlers.clear();
    this.fieldSchemas.clear();
  }

  /**
   * Whether a handler is registered for the given entity type.
   */
  hasHandler(entityType: string): boolean {
    return this.handlers.has(entityType);
  }

  /**
   * List all registered entity types.
   */
  registeredEntityTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Execute the registered handler for an incoming sidecar data request.
   *
   * This is the core method called by a plugin's HTTP server to serve
   * sidecar data at its `resolver_endpoint`.
   *
   * Responsibilities:
   * 1. Validate that tenantId in the request matches the active plugin context
   *    (NFR-006: tenant context validation)
   * 2. Look up the registered handler for the entity type
   * 3. Call the handler with (entityId, tenantId)
   * 4. Validate the response shape against the registered fieldSchema
   * 5. Return a typed DataExtensionResponse or DataExtensionError
   *
   * @param request    Parsed sidecar data request
   * @param contextTenantId  The tenantId from the active plugin context
   *                         (set during `PlexicaPlugin.start()`). Used to
   *                         validate that the request comes from the same
   *                         tenant the plugin is running for.
   */
  async serve(
    request: DataExtensionRequest,
    contextTenantId: string
  ): Promise<DataExtensionResponse | DataExtensionError> {
    const { entityType, entityId, tenantId } = request;

    // NFR-006: Tenant context validation — reject cross-tenant requests
    if (!tenantId || tenantId !== contextTenantId) {
      return {
        error: {
          code: 'TENANT_MISMATCH',
          message: `Sidecar data request tenant "${tenantId}" does not match plugin context tenant "${contextTenantId}"`,
          details: { requestedTenantId: tenantId, contextTenantId },
        },
      };
    }

    // Look up the handler
    const handler = this.handlers.get(entityType);
    if (!handler) {
      return {
        error: {
          code: 'HANDLER_NOT_FOUND',
          message: `No sidecar data handler registered for entity type "${entityType}" in plugin "${this.pluginId}"`,
          details: {
            entityType,
            registeredTypes: this.registeredEntityTypes(),
          },
        },
      };
    }

    // Execute the handler
    let fields: Record<string, unknown>;
    try {
      fields = await handler(entityId, tenantId);
    } catch (handlerError) {
      const message =
        handlerError instanceof Error ? handlerError.message : 'Unknown handler error';
      return {
        error: {
          code: 'HANDLER_ERROR',
          message: `Sidecar data handler for "${entityType}" in plugin "${this.pluginId}" threw an error: ${message}`,
          details: { entityType, entityId },
        },
      };
    }

    // Optional field schema validation
    const schema = this.fieldSchemas.get(entityType);
    if (schema) {
      const validationError = this.validateFields(fields, schema, entityType);
      if (validationError) {
        return validationError;
      }
    }

    return {
      entityType,
      entityId,
      tenantId,
      fields,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Lightweight structural validation of returned fields against a JSON Schema.
   *
   * Validates:
   * - `type: "object"` — fields must be a plain object
   * - `required` — all required property keys must be present
   * - `properties` — each declared property with `type` is type-checked
   *
   * Full JSON Schema validation (e.g. via ajv) is intentionally not included
   * to avoid adding a new dependency (Art. 2.2 / Constitution). Plugins that
   * need strict validation should implement their own handler-level checks.
   *
   * @returns DataExtensionError if validation fails, undefined if valid
   */
  private validateFields(
    fields: Record<string, unknown>,
    schema: Record<string, unknown>,
    entityType: string
  ): DataExtensionError | undefined {
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
      return {
        error: {
          code: 'SCHEMA_VALIDATION_FAILED',
          message: `Handler for "${entityType}" must return a plain object, got ${Array.isArray(fields) ? 'array' : typeof fields}`,
          details: { entityType },
        },
      };
    }

    // Check required fields if declared in schema
    const required = schema['required'];
    if (Array.isArray(required)) {
      const missing = (required as string[]).filter((key) => !(key in fields));
      if (missing.length > 0) {
        return {
          error: {
            code: 'SCHEMA_VALIDATION_FAILED',
            message: `Handler for "${entityType}" is missing required fields: ${missing.join(', ')}`,
            details: { entityType, missingFields: missing },
          },
        };
      }
    }

    // Type-check declared properties
    const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (!(key in fields)) continue; // Optional properties are allowed to be absent
        const expectedType = propSchema['type'] as string | undefined;
        if (!expectedType) continue;
        const actualValue = fields[key];
        if (!this.checkJsonType(actualValue, expectedType)) {
          return {
            error: {
              code: 'SCHEMA_VALIDATION_FAILED',
              message: `Handler for "${entityType}" returned wrong type for field "${key}": expected ${expectedType}, got ${typeof actualValue}`,
              details: { entityType, field: key, expectedType, actualType: typeof actualValue },
            },
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Check whether a value matches a JSON Schema primitive type string.
   */
  private checkJsonType(value: unknown, jsonType: string): boolean {
    switch (jsonType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true; // Unknown type — don't reject
    }
  }
}
