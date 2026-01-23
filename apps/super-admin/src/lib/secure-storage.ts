// File: apps/super-admin/src/lib/secure-storage.ts

/**
 * Secure Token Storage
 * Uses sessionStorage for token persistence (more secure than localStorage)
 * Tokens are cleared when browser/tab is closed
 */

const TOKEN_KEY = 'super_admin_kc_token';

export const secureStorage = {
  /**
   * Store token securely in sessionStorage
   */
  setToken(token: string): void {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('[SecureStorage] Failed to store token:', error);
    }
  },

  /**
   * Retrieve token from sessionStorage
   */
  getToken(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.error('[SecureStorage] Failed to retrieve token:', error);
      return null;
    }
  },

  /**
   * Remove token from storage
   */
  removeToken(): void {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      console.error('[SecureStorage] Failed to remove token:', error);
    }
  },

  /**
   * Clear all storage
   */
  clear(): void {
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('[SecureStorage] Failed to clear storage:', error);
    }
  },
};
