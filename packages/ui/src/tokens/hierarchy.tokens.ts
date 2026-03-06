// packages/ui/src/tokens/hierarchy.tokens.ts
//
// T011-19: Design tokens for Workspace Hierarchy & Template UI.
// Spec 011 Phase 4 — tokens follow @plexica/ui naming convention.
// All values also exposed as CSS custom properties in globals.css.

/** Workspace tree indentation and connector tokens */
export const hierarchyTokens = {
  // Tree structure
  treeIndent: 'var(--ws-tree-indent)',
  treeConnectorColor: 'var(--ws-tree-connector)',
  treeConnectorWidth: 'var(--ws-tree-connector-width)',

  // Depth-level accent colors (depth 0–3+)
  depthColors: [
    'var(--ws-depth-0)',
    'var(--ws-depth-1)',
    'var(--ws-depth-2)',
    'var(--ws-depth-3)',
  ] as const,

  // Tree node interaction
  treeNodeHover: 'var(--ws-tree-node-hover)',
  treeNodeSelected: 'var(--ws-tree-node-selected)',
  treeNodeSelectedFg: 'var(--ws-tree-node-selected-fg)',

  // Hierarchical reader badge
  hierarchicalReaderBg: 'var(--ws-hierarchical-reader-bg)',
  hierarchicalReaderFg: 'var(--ws-hierarchical-reader-fg)',
} as const;

/** Template card tokens */
export const templateTokens = {
  cardBg: 'var(--template-card-bg)',
  cardBorder: 'var(--template-card-border)',
  cardHover: 'var(--template-card-hover)',
  cardSelected: 'var(--template-card-selected)',
  cardSelectedBorder: 'var(--template-card-selected-border)',
  defaultBadgeBg: 'var(--template-default-badge-bg)',
  defaultBadgeFg: 'var(--template-default-badge-fg)',
} as const;

/** Plugin toggle card tokens */
export const pluginToggleTokens = {
  cardBg: 'var(--plugin-toggle-card-bg)',
  cardBorder: 'var(--plugin-toggle-card-border)',
  enabledIndicator: 'var(--plugin-toggle-enabled)',
  disabledIndicator: 'var(--plugin-toggle-disabled)',
} as const;

export type HierarchyTokenKey = keyof typeof hierarchyTokens;
export type TemplateTokenKey = keyof typeof templateTokens;
export type PluginToggleTokenKey = keyof typeof pluginToggleTokens;
