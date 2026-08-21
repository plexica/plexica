import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { delete process.env.CI_RUNTIME_CONTRACT; delete process.env.E2E_CORE_API_PROXY_TARGET; vi.resetModules(); });

describe('web CI Vite proxy', () => {
  it('binds all interfaces and proxies only /api to Compose Core in CI', async () => {
    process.env.CI_RUNTIME_CONTRACT = '1'; process.env.E2E_CORE_API_PROXY_TARGET = 'http://core-api-e2e:3001';
    const config = (await import('./vite.config.js')).default as { server: { host?: string; proxy: Record<string, { target: string; changeOrigin: boolean }> }; preview: { host?: string } };
    expect(config.server.host).toBe('0.0.0.0'); expect(config.preview.host).toBe('0.0.0.0');
    expect(config.server.proxy['/api']).toEqual({ target: 'http://core-api-e2e:3001', changeOrigin: false });
  });
});
