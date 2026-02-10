// File: packages/types/src/auth.ts

import type { User } from './user.js';
import type { Tenant } from './tenant.js';

/**
 * Authentication state used by frontend apps.
 */
export interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
