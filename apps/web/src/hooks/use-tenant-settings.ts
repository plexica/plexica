// use-tenant-settings.ts
// TanStack Query hooks for tenant settings, branding, and auth config.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { settingsApi } from '../services/settings-api.js';

import type { UpdateTenantSettingsPayload, UpdateAuthConfigPayload } from '../types/settings.js';

export function useTenantSettings() {
  return useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => settingsApi.getSettings(),
  });
}

export function useUpdateTenantSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateTenantSettingsPayload) => settingsApi.updateSettings(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
    },
  });
}

export function useBranding() {
  return useQuery({
    queryKey: ['tenant-branding'],
    queryFn: () => settingsApi.getBranding(),
  });
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { primaryColor?: string; darkMode?: boolean }) =>
      settingsApi.updateBranding(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-branding'] });
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-branding'] });
    },
  });
}

export function useAuthConfig() {
  return useQuery({
    queryKey: ['tenant-auth-config'],
    queryFn: () => settingsApi.getAuthConfig(),
  });
}

export function useUpdateAuthConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAuthConfigPayload) => settingsApi.updateAuthConfig(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tenant-auth-config'] });
    },
  });
}
