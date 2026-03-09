// File: apps/core-api/src/modules/extension-registry/index.ts
//
// Spec 013 — Extension Points (T013-08)
// Module barrel — re-exports public surface of the extension-registry module.

export { extensionRegistryRoutes } from './extension-registry.controller.js';
export {
  extensionRegistryService,
  ExtensionRegistryService,
} from './extension-registry.service.js';
export { ExtensionRegistryRepository } from './extension-registry.repository.js';
export { isExtensionPointsEnabled } from './extension-registry.schema.js';
