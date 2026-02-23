// apps/web/src/components/shell/UserProfileMenu.tsx
//
// User profile menu in the header shell (Spec 002 Phase 7a, T7-9).
// Replaces the inline user menu in Header.tsx.
//
// Features:
//  - Avatar with initials fallback
//  - Role badge (tenant_admin gets "Admin" label)
//  - "Manage Tenant" link visible to tenant_admin only
//  - Sign Out uses new auth.store.ts (token revocation via POST /auth/logout)
//  - WCAG 2.1 AA: aria-haspopup, aria-expanded, focus management

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

// ---------------------------------------------------------------------------
// Role helpers
// ---------------------------------------------------------------------------

function isTenantAdmin(roles: string[] | undefined): boolean {
  return (roles ?? []).some((r) => r === 'tenant_admin' || r === 'admin');
}

function getRoleBadgeLabel(roles: string[] | undefined): string | null {
  if (!roles) return null;
  if (roles.includes('tenant_admin')) return 'Admin';
  if (roles.includes('admin')) return 'Admin';
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const UserProfileMenu: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // User initials for avatar (handle empty strings)
  const userInitials =
    user?.displayName?.trim()?.[0]?.toUpperCase() || user?.email?.trim()?.[0]?.toUpperCase() || 'U';

  const roleBadge = getRoleBadgeLabel(user?.roles);
  const canManageTenant = isTenantAdmin(user?.roles);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleToggle = useCallback(() => setOpen((prev) => !prev), []);

  const handleSettings = useCallback(() => {
    setOpen(false);
    navigate({ to: '/settings' });
  }, [navigate]);

  const handleManageTenant = useCallback(() => {
    setOpen(false);
    navigate({ to: '/workspace-settings' });
  }, [navigate]);

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    await logout();
    // logout() redirects to /login internally
  }, [logout]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`User menu for ${user?.displayName ?? user?.email ?? 'User'}`}
        className="flex items-center gap-3 px-3 py-2 hover:bg-muted rounded-lg transition-colors"
      >
        {/* Avatar */}
        <div
          aria-hidden="true"
          className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-medium text-sm"
        >
          {userInitials}
        </div>

        {/* User Info (hidden on mobile) */}
        <div className="hidden lg:block text-left">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-foreground leading-none">
              {user?.displayName || user?.name || 'User'}
            </p>
            {roleBadge && (
              <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                <Shield className="w-2.5 h-2.5" aria-hidden="true" />
                {roleBadge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-none mt-0.5">{user?.email}</p>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          aria-label="User options"
          className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg z-50"
        >
          {/* User Info */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {user?.displayName || user?.name}
              </p>
              {roleBadge && (
                <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wide">
                  <Shield className="w-2.5 h-2.5" aria-hidden="true" />
                  {roleBadge}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
          </div>

          {/* Menu Items */}
          <div className="py-1" role="none">
            {/* Workspace Settings */}
            <button
              role="menuitem"
              onClick={handleSettings}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Workspace Settings
            </button>

            {/* Manage Tenant — tenant_admin only */}
            {canManageTenant && (
              <button
                role="menuitem"
                onClick={handleManageTenant}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <Shield className="w-4 h-4" aria-hidden="true" />
                Manage Tenant
              </button>
            )}
          </div>

          <hr className="border-t border-border" role="separator" />

          {/* Sign Out */}
          <div className="py-1" role="none">
            <button
              role="menuitem"
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
