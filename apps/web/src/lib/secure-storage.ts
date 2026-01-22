// apps/web/src/lib/secure-storage.ts

/**
 * Secure storage service for sensitive data
 *
 * Storage strategy:
 * - Token: sessionStorage (cleared on tab close) + memory-only fallback
 * - User data: Memory only (not persisted)
 * - Tenant: sessionStorage (non-sensitive public data)
 *
 * This prevents tokens from being exposed to XSS attacks that can read localStorage
 */

const TOKEN_KEY = 'plexica-token';
const TENANT_KEY = 'plexica-tenant';

// In-memory token storage (fallback and cache)
let tokenCache: string | null = null;

/**
 * Check if the browser supports sessionStorage
 */
function isStorageSupported(): boolean {
  try {
    const test = '__test__';
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch {
    console.warn('[SecureStorage] sessionStorage not supported, using memory-only');
    return false;
  }
}

/**
 * Save token securely
 * Tokens are stored in sessionStorage (cleared on tab close)
 * NOT in localStorage to prevent exposure to XSS attacks
 */
export function saveToken(token: string): void {
  if (!token) {
    clearToken();
    return;
  }

  try {
    // Store in sessionStorage if available
    if (isStorageSupported()) {
      sessionStorage.setItem(TOKEN_KEY, token);
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to save token to sessionStorage:', error);
  }

  // Always keep token in memory
  tokenCache = token;
}

/**
 * Get token from secure storage
 * Tries sessionStorage first, then falls back to memory cache
 */
export function getToken(): string | null {
  // Check memory cache first (fastest)
  if (tokenCache) {
    return tokenCache;
  }

  // Try to restore from sessionStorage
  try {
    if (isStorageSupported()) {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) {
        tokenCache = token; // Update memory cache
        return token;
      }
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to read token from sessionStorage:', error);
  }

  return null;
}

/**
 * Clear token from all storage
 */
export function clearToken(): void {
  tokenCache = null;

  try {
    if (isStorageSupported()) {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to clear token from sessionStorage:', error);
  }
}

/**
 * Save tenant (non-sensitive, OK in sessionStorage)
 */
export function saveTenant(tenant: any): void {
  try {
    if (isStorageSupported()) {
      sessionStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to save tenant to sessionStorage:', error);
  }
}

/**
 * Get tenant from storage
 */
export function getTenant(): any | null {
  try {
    if (isStorageSupported()) {
      const tenant = sessionStorage.getItem(TENANT_KEY);
      return tenant ? JSON.parse(tenant) : null;
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to read tenant from sessionStorage:', error);
  }
  return null;
}

/**
 * Clear tenant from storage
 */
export function clearTenant(): void {
  try {
    if (isStorageSupported()) {
      sessionStorage.removeItem(TENANT_KEY);
    }
  } catch (error) {
    console.error('[SecureStorage] Failed to clear tenant from sessionStorage:', error);
  }
}

/**
 * Clear all auth data from storage
 */
export function clearAllAuth(): void {
  clearToken();
  clearTenant();
}

/**
 * Listen for storage changes (useful for syncing across tabs)
 * Note: sessionStorage changes don't fire storage events across tabs,
 * so we'll use custom events for tab synchronization
 */
export function onStorageChange(callback: (event: StorageEvent) => void): () => void {
  const handler = (event: StorageEvent) => {
    // Only respond to auth-related keys
    if (event.key === TOKEN_KEY || event.key === TENANT_KEY) {
      callback(event);
    }
  };

  window.addEventListener('storage', handler);

  // Return unsubscribe function
  return () => {
    window.removeEventListener('storage', handler);
  };
}

/**
 * Broadcast token clear event to all tabs
 * This helps synchronize logout across tabs/windows
 */
export function broadcastTokenClear(): void {
  if (isStorageSupported()) {
    try {
      // Using a dummy storage change to trigger other tabs' storage events
      const now = Date.now().toString();
      sessionStorage.setItem('plexica-logout-signal', now);
      sessionStorage.removeItem('plexica-logout-signal');
    } catch (error) {
      console.error('[SecureStorage] Failed to broadcast token clear:', error);
    }
  }

  // Emit custom event for same-tab listeners
  window.dispatchEvent(new CustomEvent('plexica:logout'));
}

/**
 * Check if we're running in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}
