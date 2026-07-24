const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;
const TENANT_DOMAIN = process.env['PLAYWRIGHT_TENANT_DOMAIN'] ?? 'localhost';

function tenantUrl(base: string, slug: string, path = '/'): string {
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Invalid E2E tenant slug: ${slug}`);
  const url = new URL(path, base);
  url.hostname = `${slug}.${TENANT_DOMAIN}`;
  return url.toString();
}

export function tenantWebUrl(slug: string, path = '/'): string {
  const base = process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://e2e.localhost:3000';
  return tenantUrl(base, slug, path);
}

export function tenantApiUrl(slug: string, path = '/'): string {
  const base = process.env['PLAYWRIGHT_API_URL'] ?? 'http://e2e.localhost:3001';
  return tenantUrl(base, slug, path);
}
