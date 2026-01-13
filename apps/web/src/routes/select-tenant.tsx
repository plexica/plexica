// File: apps/web/src/routes/select-tenant.tsx

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useAuthStore } from '../stores/auth-store';
import { useAuth } from '../components/AuthProvider';
import type { Tenant } from '../types';

export const Route = createFileRoute('/select-tenant')({
  component: SelectTenantPage,
});

function SelectTenantPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { tenant: currentTenant, setTenant } = useAuthStore();
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // Fetch available tenants
  const { data, isLoading, error } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const response = await apiClient.getTenants({ limit: 100 });
      return response;
    },
    enabled: isAuthenticated && !authLoading,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate({ to: '/login' });
    }
  }, [isAuthenticated, authLoading, navigate]);

  // If user already has a tenant, redirect to home
  useEffect(() => {
    if (currentTenant && !selectedTenant) {
      navigate({ to: '/' });
    }
  }, [currentTenant, selectedTenant, navigate]);

  const handleSelectTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
  };

  const handleConfirm = () => {
    if (selectedTenant) {
      setTenant(selectedTenant);
      navigate({ to: '/' });
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-foreground">Loading tenants...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="max-w-md p-8 bg-card border border-border rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Tenants</h1>
          <p className="text-muted-foreground mb-4">
            {error instanceof Error ? error.message : 'Failed to load tenants'}
          </p>
          <button
            onClick={() => navigate({ to: '/' })}
            className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const tenants = data?.tenants || [];
  const filteredTenants = tenants.filter((t: Tenant) => t.status === 'active');

  if (filteredTenants.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="max-w-md p-8 bg-card border border-border rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">No Tenants Available</h1>
          <p className="text-muted-foreground mb-6">
            You don't have access to any active tenants. Please contact your administrator.
          </p>
          <button
            onClick={() => navigate({ to: '/login' })}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-2xl p-8 bg-card border border-border rounded-lg shadow-lg">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Select Workspace</h1>
          <p className="text-muted-foreground">Choose a workspace to continue</p>
        </div>

        <div className="space-y-3 mb-6">
          {filteredTenants.map((tenant: Tenant) => (
            <button
              key={tenant.id}
              onClick={() => handleSelectTenant(tenant)}
              className={`w-full p-4 text-left border rounded-lg transition-all ${
                selectedTenant?.id === tenant.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-background hover:border-primary/50 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{tenant.name}</h3>
                  <p className="text-sm text-muted-foreground">{tenant.slug}</p>
                </div>
                {selectedTenant?.id === tenant.id && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selectedTenant}
          className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
            selectedTenant
              ? 'bg-primary text-white hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
