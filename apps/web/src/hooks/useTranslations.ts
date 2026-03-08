// apps/web/src/hooks/useTranslations.ts
import { useEffect } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useIntl } from '@/contexts/IntlContext';
import { apiClient } from '@/lib/api-client';
import { useAuthStore, getAccessToken } from '@/stores/auth.store';
import { getTenantFromUrl } from '@/lib/tenant';

interface UseTranslationsOptions {
  namespace: string;
  locale?: string; // If not provided, uses locale from IntlContext
  enabled?: boolean; // Whether to fetch translations automatically
}

interface TranslationResponse {
  locale: string;
  namespace: string;
  messages: Record<string, string>;
  hash: string;
}

/**
 * Fetch wrapper that also captures the X-Translation-Hash response header.
 *
 * The standard apiClient strips headers before returning the body, so we use
 * a lower-level fetch here specifically to read the hash for the two-step
 * content-addressed caching pattern (NFR-005 / TD-013).
 *
 * @param url - The URL to fetch
 * @param signal - Optional AbortSignal for request cancellation (W9 / Edge Case #6)
 */
async function fetchWithHash(
  url: string,
  signal?: AbortSignal
): Promise<{ data: TranslationResponse; hash: string | null }> {
  const headers: Record<string, string> = {};
  const accessToken = getAccessToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { credentials: 'include', headers, signal });
  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`);
    // Attach status so callers can handle 404 gracefully
    (err as unknown as { statusCode: number }).statusCode = response.status;
    throw err;
  }
  const data = (await response.json()) as TranslationResponse;
  const hash = response.headers.get('x-translation-hash');
  return { data, hash };
}

/**
 * useTranslations: React hook to fetch translations from API and cache in-memory
 *
 * Implements a two-step content-addressed caching strategy (NFR-005 / TD-013):
 *
 * Step 1 — Stable URL fetch (`staleTime: 60s`):
 *   Hits `GET /api/v1/translations/:locale/:namespace`.  The server responds
 *   with `max-age=60, stale-while-revalidate=3600` and an `X-Translation-Hash`
 *   header containing the current 8-character content hash.
 *
 * Step 2 — Content-addressed fetch (`staleTime: Infinity`):
 *   Once the hash is known, fetches
 *   `GET /api/v1/translations/:locale/:namespace/:hash`.  If the hash matches
 *   the live bundle the server returns `200 immutable; max-age=31536000`, so
 *   this response is cached permanently by the browser and CDN.
 *   If the hash is stale the server returns `302` to the new hash URL,
 *   which TanStack Query follows automatically.
 *
 * Result: zero server revalidation requests for unchanged content once the
 * content-addressed URL is in the browser cache — satisfying NFR-005.
 *
 * @param options - Configuration options
 * @returns Query result with translations data and loading states
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isLoading, error } = useTranslations({ namespace: 'core' });
 *
 *   if (isLoading) return <div>Loading translations...</div>;
 *   if (error) return <div>Error loading translations</div>;
 *
 *   return <FormattedMessage id="welcome.message" />;
 * }
 * ```
 */
export function useTranslations(options: UseTranslationsOptions) {
  const { namespace, locale: providedLocale, enabled = true } = options;
  const { locale: contextLocale, mergeMessages } = useIntl();

  // C2: The ?tenant= query param expects a slug, not a UUID. AuthUser only carries
  // tenantId (a UUID). The canonical slug source is the subdomain URL (same approach
  // used by auth-client.ts, auth.store.ts). When the user is not authenticated,
  // no tenant param is sent and global translations are returned.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tenantSlug = isAuthenticated ? getTenantFromUrl() : null;

  // Use provided locale or fall back to context locale
  const locale = providedLocale || contextLocale;

  // ── Step 1: Stable URL fetch ─────────────────────────────────────────────
  // Fetches the bundle from the stable (mutable) URL and extracts the
  // X-Translation-Hash header so Step 2 can build the immutable URL.
  // staleTime: 60s mirrors the server's max-age=60 directive.
  const stableQuery = useQuery({
    queryKey: ['translations-stable', locale, namespace, tenantSlug],
    queryFn: async ({ signal }): Promise<{ bundle: TranslationResponse; hash: string | null }> => {
      try {
        const url = tenantSlug
          ? `/api/v1/translations/${locale}/${namespace}?tenant=${encodeURIComponent(tenantSlug)}`
          : `/api/v1/translations/${locale}/${namespace}`;

        const { data, hash } = await fetchWithHash(url, signal);
        return { bundle: data, hash };
      } catch (error: unknown) {
        const typedError = error as { statusCode?: number; response?: { status?: number } };
        const statusCode = typedError.statusCode ?? typedError.response?.status ?? null;

        // Handle 404 gracefully (namespace not found or disabled)
        if (statusCode === 404) {
          if (import.meta.env.DEV) {
            console.warn(
              `Translation namespace '${namespace}' not found for locale '${locale}'. Using empty translations.`
            );
          }
          return {
            bundle: { locale, namespace, messages: {}, hash: '' },
            hash: null,
          };
        }

        throw error;
      }
    },
    enabled: enabled && !!locale && !!namespace,
    staleTime: 1000 * 60, // 60 seconds — matches server max-age=60
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    retry: 1,
  });

  // ── Step 2: Content-addressed (immutable) fetch ──────────────────────────
  // Only runs once Step 1 has resolved a non-empty hash.
  // staleTime: Infinity — the URL itself encodes freshness; this response
  // never needs to be re-fetched as long as the hash is the same.
  const contentHash = stableQuery.data?.hash ?? null;
  const hashedQuery = useQuery({
    queryKey: ['translations-hashed', locale, namespace, tenantSlug, contentHash],
    queryFn: async ({ signal }): Promise<TranslationResponse> => {
      const url = tenantSlug
        ? `/api/v1/translations/${locale}/${namespace}/${contentHash}?tenant=${encodeURIComponent(tenantSlug)}`
        : `/api/v1/translations/${locale}/${namespace}/${contentHash}`;

      // The server will 302-redirect stale hashes; fetch follows redirects by default.
      const hashHeaders: Record<string, string> = {};
      const accessTokenForHash = getAccessToken();
      if (accessTokenForHash) {
        hashHeaders['Authorization'] = `Bearer ${accessTokenForHash}`;
      }
      const response = await fetch(url, {
        credentials: 'include',
        redirect: 'follow',
        headers: hashHeaders,
        signal,
      });
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}`);
        (err as unknown as { statusCode: number }).statusCode = response.status;
        throw err;
      }
      return (await response.json()) as TranslationResponse;
    },
    // Only fetch when Step 1 has a valid hash (non-empty 8-char hex)
    enabled:
      enabled && !!locale && !!namespace && !!contentHash && /^[a-f0-9]{8}$/.test(contentHash),
    staleTime: Infinity, // Content-addressed URL — never stale
    // LOW-10: Short gcTime prevents orphaned hash entries accumulating in the
    // TanStack Query cache after each translation update (each update produces
    // a new hash, leaving the old entry unreachable until gc).
    gcTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Prefer the immutably-cached bundle from Step 2; fall back to Step 1 while
  // Step 2 is loading or on the first render.
  const resolvedData = hashedQuery.data ?? stableQuery.data?.bundle ?? null;

  // M-004: Only merge messages when the returned locale matches the current
  // context locale (or is the English fallback per FR-003) to prevent stale
  // in-flight responses corrupting the store.
  // W1: When the requested locale has no translations the backend falls back to
  // 'en' (FR-003). Without the `|| resolvedData.locale === 'en'` guard the
  // fallback response is silently discarded, breaking FR-003 in the frontend.
  useEffect(() => {
    if (
      resolvedData?.messages &&
      (resolvedData.locale === locale || resolvedData.locale === 'en')
    ) {
      mergeMessages(resolvedData.messages);
    }
  }, [resolvedData, locale, mergeMessages]);

  // MEDIUM-5: Only show loading when we have no data yet.
  // Without this guard, re-fetching Step 2 while Step 1 data is already
  // available would cause a loading-spinner flash on every locale switch.
  const isLoading =
    !resolvedData && (stableQuery.isLoading || (!!contentHash && hashedQuery.isLoading));
  const error = stableQuery.error ?? hashedQuery.error;

  return {
    isLoading,
    isError: !!error,
    error,
    data: resolvedData,
    translations: resolvedData?.messages ?? {},
    hash: resolvedData?.hash,
  };
}

/**
 * useNamespaces: Hook to load multiple namespaces at once
 *
 * @param namespaces - Array of namespace names to load
 * @returns Combined loading state and any errors
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isLoading, errors } = useNamespaces(['core', 'auth', 'workspace']);
 *
 *   if (isLoading) return <div>Loading...</div>;
 *
 *   return <Router />;
 * }
 * ```
 */
export function useNamespaces(namespaces: string[]) {
  const { locale, mergeMessages } = useIntl();

  // Use useQueries to avoid Rules of Hooks violation (hooks in loops)
  const queries = useQueries({
    queries: namespaces.map((namespace) => ({
      // MEDIUM-6: Align query key prefix with useTranslations ('translations-stable')
      // so both hooks share the same cache entry for the same locale/namespace.
      // Using a different prefix ('translations') caused double network requests and
      // stale-data inconsistency between the two hooks.
      queryKey: ['translations-stable', locale, namespace],
      queryFn: async () => {
        try {
          // C1: API returns TranslationResponse { locale, namespace, messages, hash },
          // not Record<string, string> directly. Use the correct type and extract .messages.
          const response = await apiClient.get<TranslationResponse>(
            `/api/v1/translations/${locale}/${namespace}`
          );
          return { namespace, translations: response.messages };
        } catch (error: unknown) {
          const typedErr = error as { statusCode?: number; response?: { status?: number } };
          const status = typedErr.statusCode ?? typedErr.response?.status;
          if (status === 404) {
            // Namespace not found - return empty translations
            return { namespace, translations: {} };
          }
          throw error;
        }
      },
      // MEDIUM-6: staleTime aligned to 60s (matches server max-age=60 and useTranslations)
      staleTime: 1000 * 60, // 60 seconds
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    })),
  });

  // Merge all successful translations into IntlContext.
  // We derive a stable `dataSignature` from `dataUpdatedAt` timestamps (O(1) per query)
  // rather than JSON.stringify(data) (O(n) over translation payload size) to avoid
  // expensive serialization on every render while still detecting actual data changes.
  const dataSignature = queries.map((q) => q.dataUpdatedAt).join(',');
  useEffect(() => {
    queries.forEach((query) => {
      if (query.data?.translations) {
        mergeMessages(query.data.translations);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature, mergeMessages]);

  const isLoading = queries.some((q) => q.isLoading);
  const errors = queries
    .filter((q) => q.error)
    .map((q, index) => ({ namespace: namespaces[index], error: q.error }));

  return {
    isLoading,
    errors,
    queries,
  };
}
