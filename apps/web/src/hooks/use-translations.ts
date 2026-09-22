// hooks/use-translations.ts
// TanStack Query hooks for tenant translation overrides (006-10).
// Shell boot-merge uses `useTranslationOverrides` (staleTime 10 min); the admin
// settings page adds edit (upsert) + revert via the same mutation.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { translationsApi } from '../services/translations-api.js';

import type { TranslationLocale, UpsertTranslationPayload } from '../services/translations-api.js';

export const TRANSLATION_OVERRIDES_KEY = ['tenant', 'translations'] as const;

export interface UpsertTranslationInput {
  key: string;
  payload: UpsertTranslationPayload;
}

export function useTranslationOverrides() {
  return useQuery({
    queryKey: TRANSLATION_OVERRIDES_KEY,
    queryFn: () => translationsApi.list(),
    // Shell boot fetch — cached for 10 minutes (plan §5.5).
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Upsert (or revert, when `value === ''`) a single override and refetch the
 * list — the merge pipeline re-derives the active messages from the cached
 * list, so an invalidation is enough for the whole UI to pick it up.
 */
export function useUpsertTranslation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, payload }: UpsertTranslationInput) =>
      translationsApi.upsert(key, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TRANSLATION_OVERRIDES_KEY });
    },
  });
}

export type { TranslationLocale };