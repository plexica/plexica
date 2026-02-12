// File: packages/sdk/src/ui.ts

/**
 * @plexica/sdk — UI Re-exports
 *
 * Convenience re-export of @plexica/ui so plugins can import UI components
 * directly from the SDK: `import { Button } from '@plexica/sdk/ui'`
 *
 * Note: @plexica/ui is an optional peer dependency. This module will fail
 * at runtime if @plexica/ui is not installed (backend-only plugins won't use it).
 */

// Re-export everything from the UI library
export * from '@plexica/ui';
