// apps/web/src/components/auth/SessionExpiredModal.tsx
//
// Non-dismissible modal shown when the user's session has expired.
// Screen 3 per design-spec.
//
// Spec requirements:
//  - role="dialog" aria-modal="true"
//  - Focus trap: Tab cycles to Sign In button only
//  - Esc: no effect — user must re-authenticate
//  - Saves current URL to sessionStorage before redirect (deep-link)

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { getTenantFromUrl } from '@/lib/tenant';
import { Button } from '@plexica/ui';
import { Clock } from 'lucide-react';

interface SessionExpiredModalProps {
  isOpen: boolean;
}

export function SessionExpiredModal({ isOpen }: SessionExpiredModalProps) {
  const signInRef = useRef<HTMLButtonElement>(null);
  const { saveDeepLink } = useAuthStore();

  // Focus the Sign In button when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the DOM to settle
      const timer = setTimeout(() => {
        signInRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Trap focus inside the modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Non-dismissible — prevent default and keep focus
        e.preventDefault();
        signInRef.current?.focus();
        return;
      }
      if (e.key === 'Tab') {
        // Only one focusable element — always cycle back to it
        e.preventDefault();
        signInRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSignIn = () => {
    saveDeepLink();
    const tenantSlug = getTenantFromUrl();
    window.location.href = `/${tenantSlug}/login`;
  };

  if (!isOpen) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      aria-hidden="false"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-desc"
        className="w-full max-w-sm mx-4 rounded-lg bg-background border border-border shadow-xl p-6 space-y-4"
      >
        {/* Icon + Heading */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900">
            <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <h2 id="session-expired-title" className="text-lg font-semibold text-foreground">
            Session expired
          </h2>
          <p id="session-expired-desc" className="text-sm text-muted-foreground">
            Your session has expired. Please sign in again to continue.
          </p>
        </div>

        {/* Sign In button — the only focusable element */}
        <Button ref={signInRef} onClick={handleSignIn} className="w-full" size="lg">
          Sign in again
        </Button>
      </div>
    </div>
  );
}
