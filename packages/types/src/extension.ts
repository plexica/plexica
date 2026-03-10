// File: packages/types/src/extension.ts

/**
 * @plexica/types — Extension Points type definitions
 *
 * Shared type contract for the extension system (Spec 013).
 * Consumed by core-api, SDK, and all frontend components.
 * All new fields are optional for backward compatibility.
 *
 * Spec reference: Plan §4.16, FR-027, FR-030
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * The type of extension slot a plugin declares.
 * Drives rendering mode in <ExtensionSlot> and type-check validation.
 */
export const EXTENSION_SLOT_TYPES = ['action', 'panel', 'form', 'toolbar'] as const;
export type ExtensionSlotType = (typeof EXTENSION_SLOT_TYPES)[number];

/**
 * Validation status of a contribution after the registry has checked whether
 * the target slot exists and the type is compatible.
 */
export const CONTRIBUTION_VALIDATION_STATUSES = [
  'pending',
  'valid',
  'target_not_found',
  'type_mismatch',
  'schema_changed',
] as const;
export type ContributionValidationStatus = (typeof CONTRIBUTION_VALIDATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Manifest declaration types (used in PluginManifest)
// ---------------------------------------------------------------------------

/**
 * An extension slot declared by a plugin in its manifest.
 * A slot is a named insertion point that other plugins can contribute to.
 */
export interface ExtensionSlotDeclaration {
  /** Unique slot identifier within the plugin (e.g. "contact-actions") */
  slotId: string;
  /** Human-readable label */
  label: string;
  /** Slot rendering type */
  type: ExtensionSlotType;
  /** Maximum number of contributions that can be rendered (0 = unlimited) */
  maxContributions?: number;
  /** JSON Schema for context data passed to contributions */
  contextSchema?: Record<string, unknown>;
  /** Description shown in admin UI */
  description?: string;
  /**
   * Permission key that a contributing plugin must declare to contribute to this slot.
   * Empty string means no permission restriction (FR-006).
   */
  requiredPermission?: string;
}

/**
 * A contribution declaration — plugin B registers this to contribute UI
 * to a slot declared by plugin A.
 */
export interface ContributionDeclaration {
  /** Target plugin that owns the slot */
  targetPluginId: string;
  /** Target slot ID within that plugin */
  targetSlotId: string;
  /** Name of the Module Federation component to load */
  componentName: string;
  /** Render priority (0 = highest, 999 = lowest). Lower renders first. */
  priority?: number;
  /** JSON Schema the contribution's output must match */
  outputSchema?: Record<string, unknown>;
  /** URL for preview thumbnail shown in admin UI (FR-033) */
  previewUrl?: string;
  /** Description shown in admin UI */
  description?: string;
}

/**
 * An entity type that a plugin declares as extensible via sidecar data.
 */
export interface ExtensibleEntityDeclaration {
  /** Entity type key (e.g. "contact", "deal") */
  entityType: string;
  /** Human-readable label */
  label: string;
  /** JSON Schema describing sidecar data fields */
  fieldSchema: Record<string, unknown>;
  /** Description shown in admin UI */
  description?: string;
}

/**
 * A data extension a plugin registers to contribute sidecar data
 * to another plugin's extensible entity.
 */
export interface DataExtensionDeclaration {
  /** Target plugin that owns the entity */
  targetPluginId: string;
  /** Target entity type */
  targetEntityType: string;
  /** URL endpoint for fetching sidecar data (must be within plugin's declared base URL) */
  sidecarUrl: string;
  /** JSON Schema for the sidecar fields this extension provides */
  fieldSchema: Record<string, unknown>;
  /** Description shown in admin UI */
  description?: string;
}

// ---------------------------------------------------------------------------
// Runtime / resolved types (returned by the registry service)
// ---------------------------------------------------------------------------

/**
 * A resolved contribution returned by the registry for rendering in <ExtensionSlot>.
 * Combines contribution metadata with workspace visibility state.
 */
export interface ResolvedContribution {
  /** Database ID of the contribution record */
  id: string;
  /** The contributing plugin */
  contributingPluginId: string;
  contributingPluginName: string;
  /** The target slot */
  targetPluginId: string;
  targetSlotId: string;
  /** Module Federation component name to load */
  componentName: string;
  /** Render priority (ascending = first) */
  priority: number;
  /** Validation status */
  validationStatus: ContributionValidationStatus;
  /** Preview thumbnail URL (FR-033) */
  previewUrl?: string;
  /** Whether this contribution is visible in the current workspace */
  isVisible: boolean;
  /** Whether the contributing plugin is currently active */
  isActive: boolean;
}

/**
 * Aggregated sidecar data from multiple contributing plugins for a single entity.
 * Returned by the data extension resolution endpoint.
 */
export interface AggregatedExtensionData {
  /** Target entity info */
  pluginId: string;
  entityType: string;
  entityId: string;
  /** Merged field data from all responding contributors */
  fields: Record<string, unknown>;
  /** Plugins that responded successfully */
  contributors: string[];
  /** Plugins that timed out, errored, or caused field collisions */
  warnings: Array<{
    pluginId: string;
    reason: 'timeout' | 'error' | 'schema_mismatch' | 'field_collision';
    message?: string;
  }>;
}

/**
 * Result of the "slot dependents" query — which plugins contribute to a given slot.
 */
export interface DependentsResult {
  /** Slot owner plugin ID */
  pluginId: string;
  /** Slot ID */
  slotId: string;
  /** Total number of contributing plugins */
  dependentCount: number;
  /** List of contributing plugins */
  dependents: Array<{
    pluginId: string;
    pluginName: string;
    componentName: string;
    validationStatus: ContributionValidationStatus;
    isActive: boolean;
  }>;
}

// ---------------------------------------------------------------------------
// Registry query filter types
// ---------------------------------------------------------------------------

/**
 * Filters for listing extension slots.
 */
export interface ExtensionSlotFilters {
  pluginId?: string;
  type?: ExtensionSlotType;
}

/**
 * Filters for listing contributions.
 */
export interface ExtensionContributionFilters {
  /** Bare slot ID — admin/legacy use only. Prefer targetPluginId + targetSlotId. */
  slotId?: string;
  /** Target plugin ID owning the slot (use with targetSlotId for the primary read path). */
  targetPluginId?: string;
  /** Target slot ID scoped to targetPluginId. */
  targetSlotId?: string;
  workspaceId?: string;
  pluginId?: string;
  type?: ExtensionSlotType;
}
