import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete process.env.CI_RUNTIME_CONTRACT;
  delete process.env.E2E_CORE_API_PROXY_TARGET;
  vi.resetModules();
});

describe('admin CI Vite proxy', () => {
  it('uses the private Core target for server and preview', async () => {
    process.env.CI_RUNTIME_CONTRACT = '1';
    process.env.E2E_CORE_API_PROXY_TARGET = 'http://core-api-e2e:3001';
    const config = (await import('./vite.config.js')).default as {
      server: {
        host?: string;
        proxy: Record<string, { target: string; changeOrigin: boolean; rewrite?: unknown }>;
      };
      preview: {
        host?: string;
        proxy: Record<string, { target: string; changeOrigin: boolean; rewrite?: unknown }>;
      };
    };
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.preview.host).toBe('0.0.0.0');
    expect(config.server.proxy['/api']).toEqual({
      target: 'http://core-api-e2e:3001',
      changeOrigin: false,
    });
    expect(config.preview.proxy['/api']).toEqual({
      target: 'http://core-api-e2e:3001',
      changeOrigin: false,
    });
    expect(config.server.proxy['/api'].rewrite).toBeUndefined();
  });
  it('keeps local proxy behavior without exposing a CI host binding', async () => {
    const config = (await import('./vite.config.js')).default as {
      server: { host?: string; proxy: Record<string, { target: string }> };
      preview: { host?: string; proxy: Record<string, { target: string }> };
    };
    expect(config.server.host).toBeUndefined();
    expect(config.preview.host).toBeUndefined();
    expect(config.server.proxy).toEqual({
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    });
    expect(config.preview.proxy).toEqual(config.server.proxy);
  });
  it.each([undefined, 'http://127.0.0.1:3001', 'http://core-api-e2e:3002'])(
    'fails closed for unsafe CI proxy target %s',
    async (target) => {
      process.env.CI_RUNTIME_CONTRACT = '1';
      if (target) process.env.E2E_CORE_API_PROXY_TARGET = target;
      await expect(import('./vite.config.js')).rejects.toThrow('exact DNS-only');
    }
  );
});
