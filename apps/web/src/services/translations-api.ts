// services/translations-api.ts
// Tenant translation override API methods (006-10).
// GET lists every override; PUT upserts one (empty `value` reverts → the row
// is deleted server-side). The shell boot-merge fetches GET once per session
// (TanStack Query staleTime 10 min).

import { apiClient } from './api-client.js';

export const TRANSLATION_LOCALES = ['en', 'it'] as const;
export type TranslationLocale = (typeof TRANSLATION_LOCALES)[number];

/** `GET /api/v1/tenant/translations` response:
 *  `{ overrides: { "common.save": { "en": "Save", "it": "Salva" } } }` */
export interface TranslationOverrideList {
  overrides: Record<string, Partial<Record<TranslationLocale, string>>>;
}

/** Row returned by PUT (upsert or revert). */
export interface TranslationOverride {
  key: string;
  locale: TranslationLocale;
  value: string;
  updatedAt: string;
}

export interface UpsertTranslationPayload {
  locale: TranslationLocale;
  value: string;
}

export const translationsApi = {
  list: () => apiClient.get<TranslationOverrideList>('/api/v1/tenant/translations'),

  upsert: (key: string, payload: UpsertTranslationPayload) =>
    apiClient.put<TranslationOverride>(
      `/api/v1/tenant/translations/${encodeURIComponent(key)}`,
      payload
    ),
};