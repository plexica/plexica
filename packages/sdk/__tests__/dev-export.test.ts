// Tests for the @plexica/sdk/dev subpath export.
// Imports through the package self-reference so the exports map is actually
// exercised (types/development/import conditions), not a relative path.
// Regression: exports["./dev"] used to point types/development at the
// non-existent ./src/dev/index.ts, breaking tsx (development condition).

import { describe, expect, it, vi } from 'vitest';

// Self-reference: resolves via package.json "exports" → "./dev".
const dev = await import('@plexica/sdk/dev');

const TENANT_SLUG = 'acme';

describe('@plexica/sdk/dev export', () => {
  it('exposes registerBackend and unregisterBackend', () => {
    expect(typeof dev.registerBackend).toBe('function');
    expect(typeof dev.unregisterBackend).toBe('function');
  });

  it('registerBackend posts to the dev register endpoint with tenant header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await dev.registerBackend('http://localhost:3001/', {
        slug: 'my-plugin',
        tenantSlug: TENANT_SLUG,
        backendUrl: 'http://localhost:3000',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/dev/plugins/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-Tenant-Slug': TENANT_SLUG }),
        })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('unregisterBackend posts to the dev unregister endpoint with tenant header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await dev.unregisterBackend('http://localhost:3001/', {
        slug: 'my-plugin',
        tenantSlug: TENANT_SLUG,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/dev/plugins/unregister',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-Tenant-Slug': TENANT_SLUG }),
        })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('trims a trailing slash from the core API URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await dev.registerBackend('http://localhost:3001', {
        slug: 'my-plugin',
        tenantSlug: TENANT_SLUG,
        backendUrl: 'http://localhost:3000',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/dev/plugins/register',
        expect.anything()
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not leak tenantSlug into the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await dev.registerBackend('http://localhost:3001', {
        slug: 'my-plugin',
        tenantSlug: TENANT_SLUG,
        backendUrl: 'http://localhost:3000',
      });
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(String(init.body));
      expect(body.tenantSlug).toBeUndefined();
      expect(body.slug).toBe('my-plugin');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});