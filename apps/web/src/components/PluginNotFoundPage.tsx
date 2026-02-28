// apps/web/src/components/PluginNotFoundPage.tsx
//
// T005-04: Dedicated 404 page shown when a user navigates to a
// disabled or non-existent plugin route (design-spec Screen 4).

import React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SearchX } from 'lucide-react';

interface PluginNotFoundPageProps {
  /** Optional override for the explanatory paragraph. */
  message?: string;
}

const DEFAULT_MESSAGE =
  'This feature is not available for your organization. If you believe this is a mistake, contact your administrator.';

export const PluginNotFoundPage: React.FC<PluginNotFoundPageProps> = ({
  message = DEFAULT_MESSAGE,
}) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <SearchX className="w-16 h-16 text-muted-foreground mb-6" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-foreground mb-3">Page Not Found</h1>
      <p className="text-muted-foreground max-w-md mb-8">{message}</p>
      <button
        onClick={() => void navigate({ to: '/' })}
        className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label="Return to dashboard"
      >
        Go to Dashboard
      </button>
    </div>
  );
};
