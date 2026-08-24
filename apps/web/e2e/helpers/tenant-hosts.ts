import { isCiRuntimeContract, requiredRunValue } from '../../../../e2e/playwright-base.js';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;
const TENANT_DOMAIN = process.env['PLAYWRIGHT_TENANT_DOMAIN'] ?? 'localhost';

function tenantUrl(base: string, slug: string, path = '/'): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Invalid E2E tenant slug: ${slug}`);
  const url = new URL(path, base);
  url.hostname = `${slug}.${TENANT_DOMAIN}`;
  return url.toString();
}

function endpoint(key: 'PLAYWRIGHT_BASE_URL' | 'PLAYWRIGHT_API_URL', fallback: string): string {
  return isCiRuntimeContract()
    ? requiredRunValue(key, `CI runtime requires ${key} from the runtime manifest.`)
    : process.env[key] ?? fallback;
}

export function e2eWebBase(): string {
  return endpoint('PLAYWRIGHT_BASE_URL', 'http://e2e.localhost:3000');
}

export function tenantWebUrl(slug: string, path = '/'): string {
  return tenantUrl(e2eWebBase(), slug, path);
}

export function tenantApiUrl(slug: string, path = '/'): string {
  return tenantUrl(endpoint('PLAYWRIGHT_API_URL', 'http://e2e.localhost:3001'), slug, path);
}
