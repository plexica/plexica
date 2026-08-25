import { isCiRuntimeContract, requiredRunValue } from '../../../../e2e/playwright-base.js';

const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;
const TENANT_DOMAIN = process.env['PLAYWRIGHT_TENANT_DOMAIN'] ?? 'localhost';

/**
 * Per-call overrides for the endpoint env keys. Web callers use the defaults;
 * admin callers pass the admin-specific keys because the admin Playwright
 * invocation resolves different manifest endpoints (see spec 010).
 */
export interface EndpointKeyOptions {
  baseKey?: EndpointKey | undefined;
  apiKey?: EndpointKey | undefined;
}

export type EndpointKey =
  | 'PLAYWRIGHT_BASE_URL'
  | 'PLAYWRIGHT_API_URL'
  | 'PLAYWRIGHT_ADMIN_BASE_URL'
  | 'PLAYWRIGHT_CORE_API_URL';

const ENDPOINT_FALLBACKS: Record<EndpointKey, string> = {
  PLAYWRIGHT_BASE_URL: 'http://e2e.localhost:3000',
  PLAYWRIGHT_API_URL: 'http://e2e.localhost:3001',
  PLAYWRIGHT_ADMIN_BASE_URL: 'http://localhost:3002',
  PLAYWRIGHT_CORE_API_URL: 'http://localhost:3001',
};

function tenantUrl(base: string, slug: string, path = '/'): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Invalid E2E tenant slug: ${slug}`);
  const url = new URL(path, base);
  url.hostname = `${slug}.${TENANT_DOMAIN}`;
  return url.toString();
}

function endpoint(key: EndpointKey): string {
  return isCiRuntimeContract()
    ? requiredRunValue(key, `CI runtime requires ${key} from the runtime manifest.`)
    : process.env[key] ?? ENDPOINT_FALLBACKS[key];
}

export function e2eWebBase(opts: EndpointKeyOptions = {}): string {
  return endpoint(opts.baseKey ?? 'PLAYWRIGHT_BASE_URL');
}

export function tenantWebUrl(slug: string, path = '/', opts: EndpointKeyOptions = {}): string {
  return tenantUrl(e2eWebBase(opts), slug, path);
}

export function tenantApiUrl(slug: string, path = '/', opts: EndpointKeyOptions = {}): string {
  return tenantUrl(endpoint(opts.apiKey ?? 'PLAYWRIGHT_API_URL'), slug, path);
}

/**
 * Contract-mode base derived from a manifest loopback URL. The dynamic
 * manifest port is kept, but the host regains the canonical
 * `<slug>.<TENANT_DOMAIN>` shape: production builds resolve the tenant from
 * the hostname only (the `?tenant=` override is dev-only), Core resolves the
 * tenant from the Host header's first label, and the canonical global-setup
 * seeds the Keycloak client origin from this same shape. Serving the suite
 * against the raw `127.0.0.1:<port>` manifest entry would make every relative
 * navigation land on the org-error page (no-subdomain) and every direct API
 * call fail with INVALID_TENANT_CONTEXT.
 */
export function ciRuntimeTenantBase(manifestBase: string): string {
  const slug = process.env['PLAYWRIGHT_TENANT_SLUG'] ?? 'e2e';
  // No trailing slash: callers concatenate `${base}/path…`, and URL.toString()
  // would otherwise inject a second slash (404 Route not found).
  return tenantUrl(manifestBase, slug).replace(/\/+$/, '');
}
