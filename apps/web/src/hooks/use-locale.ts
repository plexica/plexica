// hooks/use-locale.ts
// Language switch hook (006-07, D-7).
//
// The Zustand auth store holds the ACTIVE locale (one store — Rule 3); the
// profile endpoint (`user_profile.language`) is the SOURCE OF TRUTH and is
// synced via PATCH /api/v1/profile. The store is updated optimistically so the
// full UI re-renders in place (< 500ms, no page reload) and is reverted if the
// profile patch fails.

import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { profileApi } from '../services/profile-api.js';
import { useAuthStore } from '../stores/auth-store.js';
import { resolveLocale, type LocaleCode } from '../i18n/locales.js';

import { useProfile } from './use-profile.js';

const PROFILE_KEY = ['profile'];

/**
 * Reads the active locale + a `setLocale` action bound to the PATCH /profile
 * sync. The optimistic store update happens synchronously; the mutation is
 * fire-and-forget for the UI but reverts on failure.
 */
export function useLocale(): {
  locale: LocaleCode;
  setLocale: (next: LocaleCode) => void;
  isPending: boolean;
  error: unknown;
} {
  const locale = useAuthStore((state) => state.locale);
  const setStoreLocale = useAuthStore((state) => state.setLocale);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (next: LocaleCode) => profileApi.update({ language: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });

  function setLocale(next: LocaleCode): void {
    if (next === locale) return;
    const previous = locale;
    setStoreLocale(next);
    mutation.mutate(next, {
      // Profile language is the source of truth: a failed patch reverts the
      // store so the UI cannot silently disagree with the server.
      onError: () => {
        setStoreLocale(previous);
      },
    });
  }

  return { locale, setLocale, isPending: mutation.isPending, error: mutation.error };
}

/**
 * Boot-time sync: when an authenticated session is established (login/refresh,
 * keyed on the auth-store user id), the persisted profile `language` wins over
 * the cached store locale — it is the source of truth. Keying on the user id —
 * NOT on the store locale — keeps an in-flight manual switch from being
 * reverted by a stale profile.
 *
 * IMPORTANT — bootstrap-once guard: the profile also refetches when OTHER
 * invalidators touch the profile query (e.g. an unrelated profile patch or a
 * refresh). Without a guard, a refetch that resolves while a manual EN→IT
 * `PATCH /profile` is still in flight would apply the OLD profile language and
 * momentarily revert the optimistic switch (language flicker, session-006
 * review Major 5). Only the FIRST profile load for a given user may sync.
 */
export function useBootstrapLocaleSync(): void {
  const userId = useAuthStore((state) => state.userProfile?.id ?? null);
  const setStoreLocale = useAuthStore((state) => state.setLocale);
  const { data: profile } = useProfile();
  const bootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    if (userId === null) return;
    if (profile?.language === undefined) return;
    if (bootstrappedFor.current === userId) return; // already synced this session
    setStoreLocale(resolveLocale(profile.language));
    bootstrappedFor.current = userId;
  }, [userId, profile?.language, setStoreLocale]);
}
