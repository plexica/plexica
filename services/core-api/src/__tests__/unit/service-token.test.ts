// service-token.test.ts — unit tests for plugin service-account tokens (A5).
// Covers generation, verification, tamper-detection, wrong-length mac, and
// constant-time comparison safety.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { generateServiceToken, verifyServiceToken } from '../../modules/plugin/services/service-token.js';

const ORIGINAL_SECRET = process.env['PLUGIN_SERVICE_TOKEN_SECRET'];
const INSTALL_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_SLUG = 'acme-corp';

describe('plugin service-token', () => {
  beforeAll(() => {
    process.env['PLUGIN_SERVICE_TOKEN_SECRET'] = 'test-secret-key-for-unit-tests';
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env['PLUGIN_SERVICE_TOKEN_SECRET'];
    } else {
      process.env['PLUGIN_SERVICE_TOKEN_SECRET'] = ORIGINAL_SECRET;
    }
  });

  it('generates a token with installId.tenantSlug.mac structure', () => {
    const token = generateServiceToken(INSTALL_ID, TENANT_SLUG);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(INSTALL_ID);
    expect(parts[1]).toBe(TENANT_SLUG);
    expect((parts[2] ?? '').length).toBe(64); // sha256 hex
  });

  it('verifies a valid token and returns the payload', () => {
    const token = generateServiceToken(INSTALL_ID, TENANT_SLUG);
    expect(verifyServiceToken(token)).toEqual({ installId: INSTALL_ID, tenantSlug: TENANT_SLUG });
  });

  it('rejects a tampered installId (HMAC mismatch)', () => {
    const token = generateServiceToken(INSTALL_ID, TENANT_SLUG);
    const parts = token.split('.');
    const tampered = `99999999-9999-9999-9999-999999999999.${parts[1]}.${parts[2]}`;
    expect(verifyServiceToken(tampered)).toBeNull();
  });

  it('rejects a tampered tenantSlug (HMAC mismatch)', () => {
    const token = generateServiceToken(INSTALL_ID, TENANT_SLUG);
    const parts = token.split('.');
    const tampered = `${parts[0]}.evil-tenant.${parts[2]}`;
    expect(verifyServiceToken(tampered)).toBeNull();
  });

  it('rejects a tampered MAC suffix', () => {
    const token = generateServiceToken(INSTALL_ID, TENANT_SLUG);
    const parts = token.split('.');
    const mac = parts[2] ?? '';
    const flipped = mac.replace(/^./, mac[0] === '0' ? 'f' : '0');
    expect(verifyServiceToken(`${parts[0]}.${parts[1]}.${flipped}`)).toBeNull();
  });

  it('rejects malformed tokens (wrong part count, empty segments)', () => {
    expect(verifyServiceToken('')).toBeNull();
    expect(verifyServiceToken('no-dots-here')).toBeNull();
    expect(verifyServiceToken('only.two')).toBeNull();
    expect(verifyServiceToken('.tenant.mac')).toBeNull();
    expect(verifyServiceToken('id..mac')).toBeNull();
    expect(verifyServiceToken('id.tenant.')).toBeNull();
  });

  it('rejects wrong-length MAC without throwing (no 500 RangeError)', () => {
    const shortMac = `${INSTALL_ID}.${TENANT_SLUG}.deadbeef`;
    expect(verifyServiceToken(shortMac)).toBeNull();
    const longMac = `${INSTALL_ID}.${TENANT_SLUG}.${'a'.repeat(128)}`;
    expect(verifyServiceToken(longMac)).toBeNull();
  });

  it('produces different MACs for different tenant slugs', () => {
    const t1 = generateServiceToken(INSTALL_ID, 'acme-corp');
    const t2 = generateServiceToken(INSTALL_ID, 'globex-inc');
    expect(t1.split('.')[2]).not.toBe(t2.split('.')[2]);
  });
});
