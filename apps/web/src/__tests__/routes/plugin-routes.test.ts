// apps/web/src/__tests__/routes/plugin-routes.test.ts
//
// Unit tests for T005-03: reserved route enforcement in plugin-routes.tsx

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RESERVED_ROUTES,
  isReservedRoute,
  hasConflict,
  registerPlugin,
} from '../../lib/plugin-routes';

describe('plugin-routes: reserved route enforcement', () => {
  describe('isReservedRoute', () => {
    it('returns true for every route in RESERVED_ROUTES', () => {
      for (const route of RESERVED_ROUTES) {
        expect(isReservedRoute(route)).toBe(true);
      }
    });

    it('returns true for /settings (exact)', () => {
      expect(isReservedRoute('/settings')).toBe(true);
    });

    it('returns true for /settings/ (trailing slash normalised)', () => {
      expect(isReservedRoute('/settings/')).toBe(true);
    });

    it('returns false for /crm', () => {
      expect(isReservedRoute('/crm')).toBe(false);
    });

    it('returns false for /my-plugin', () => {
      expect(isReservedRoute('/my-plugin')).toBe(false);
    });

    it('returns true for /admin', () => {
      expect(isReservedRoute('/admin')).toBe(true);
    });
  });

  describe('hasConflict', () => {
    it('returns true when prefix matches an already-registered route', () => {
      const existing = new Map([['plugin-a:/crm', { path: '/crm', pluginId: 'plugin-a' }]]);
      expect(hasConflict('/crm', existing)).toBe(true);
    });

    it('returns false when prefix is not yet registered', () => {
      const existing = new Map([['plugin-a:/crm', { path: '/crm', pluginId: 'plugin-a' }]]);
      expect(hasConflict('/hr', existing)).toBe(false);
    });

    it('returns false for an empty registry', () => {
      expect(hasConflict('/crm', new Map())).toBe(false);
    });
  });

  describe('registerPlugin', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('returns true when prefix is valid and no conflict exists', () => {
      const result = registerPlugin('my-plugin', '/crm', new Map());
      expect(result).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('returns false and warns when prefix is a reserved route', () => {
      const result = registerPlugin('my-plugin', '/admin', new Map());
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain('reserved route');
      expect(warnSpy.mock.calls[0][0]).toContain('/admin');
    });

    it('returns false and warns when prefix conflicts with an already-registered plugin', () => {
      const existing = new Map([['plugin-a:/crm', { path: '/crm', pluginId: 'plugin-a' }]]);
      const result = registerPlugin('plugin-b', '/crm', existing);
      expect(result).toBe(false);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain('conflicts');
      expect(warnSpy.mock.calls[0][0]).toContain('/crm');
    });
  });
});
