// File: apps/core-api/src/modules/i18n/index.ts
/**
 * i18n Module Barrel Export
 *
 * Public API for the internationalization (i18n) module.
 * Only exports services and routes; schemas and internal utilities are encapsulated.
 *
 * @module i18n
 */

export { TranslationService } from './i18n.service.js';
export { TranslationCacheService } from './i18n-cache.service.js';
export { translationRoutes } from './i18n.controller.js';
