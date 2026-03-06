// apps/web/src/components/ErrorBoundary/index.ts
//
// Public barrel — re-exports all ErrorBoundary components.
// Spec 010 FR-016 / FR-017 / FR-018

export { PluginErrorBoundary } from './PluginErrorBoundary';
export type { PluginErrorBoundaryProps } from './PluginErrorBoundary';

export { PluginErrorFallback } from './PluginErrorFallback';

export { RootErrorBoundary } from './RootErrorBoundary';
export type { RootErrorBoundaryProps } from './RootErrorBoundary';

export { RootErrorFallback } from './RootErrorFallback';
export type { RootErrorFallbackProps } from './RootErrorFallback';
