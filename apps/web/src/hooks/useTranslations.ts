// apps/web/src/hooks/useTranslations.ts
import { useEffect } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { useIntl } from '@/contexts/IntlContext';
import { apiClient } from '@/lib/api-client';

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
 * useTranslations: React hook to fetch translations from API and cache in-memory
 *
 * Features:
 * - Fetches translations from GET /api/v1/translations/:locale/:namespace
 * - Supports tenant-specific overrides if user authenticated
 * - Caches loaded translations using TanStack Query
 * - Handles loading, error, and success states
 * - Respects ETag for 304 Not Modified responses (handled by axios)
 * - Automatically updates IntlContext messages when data loads
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

  // Use provided locale or fall back to context locale
  const locale = providedLocale || contextLocale;

  // Fetch translations using TanStack Query
  const query = useQuery({
    queryKey: ['translations', locale, namespace],
    queryFn: async (): Promise<TranslationResponse> => {
      try {
        const data = await apiClient.get<TranslationResponse>(
          `/api/v1/translations/${locale}/${namespace}`
        );

        return data;
      } catch (error: unknown) {
        // Proper type guard for error status code
        const statusCode = (error as any)?.statusCode ?? (error as any)?.response?.status ?? null;

        // Handle 404 gracefully (namespace not found or disabled)
        if (statusCode === 404) {
          if (import.meta.env.DEV) {
            console.warn(
              `Translation namespace '${namespace}' not found for locale '${locale}'. Using empty translations.`
            );
          }
          return {
            locale,
            namespace,
            messages: {},
            hash: '',
          };
        }

        // Re-throw other errors
        throw error;
      }
    },
    enabled: enabled && !!locale && !!namespace,
    staleTime: 1000 * 60 * 60, // 1 hour (translations rarely change)
    gcTime: 1000 * 60 * 60 * 24, // 24 hours (keep in cache)
    retry: 1, // Only retry once on failure
  });

  // Update IntlContext messages when translations load successfully
  useEffect(() => {
    if (query.data?.messages) {
      mergeMessages(query.data.messages);
    }
  }, [query.data, mergeMessages]);

  return {
    ...query,
    translations: query.data?.messages || {},
    hash: query.data?.hash,
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
      queryKey: ['translations', locale, namespace],
      queryFn: async () => {
        try {
          const response = await apiClient.get<Record<string, string>>(
            `/api/v1/translations/${locale}/${namespace}`
          );
          return { namespace, translations: response };
        } catch (error: unknown) {
          const status = (error as any)?.statusCode ?? (error as any)?.response?.status;
          if (status === 404) {
            // Namespace not found - return empty translations
            return { namespace, translations: {} };
          }
          throw error;
        }
      },
      staleTime: 1000 * 60 * 60, // 1 hour
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
