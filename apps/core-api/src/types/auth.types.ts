// File: apps/core-api/src/types/auth.types.ts
// Auth type definitions for Spec 002 - Authentication System

import { z } from 'zod';

/**
 * Authentication error codes (per Spec 002 §8 and Constitution Art. 6.2)
 * All auth endpoints return errors in this format:
 * { error: { code: AuthErrorCode, message: string, details?: object } }
 */
export enum AuthErrorCode {
  // 400 errors
  AUTH_INVALID_REQUEST = 'AUTH_INVALID_REQUEST',

  // 401 errors
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_MISSING_TOKEN = 'AUTH_MISSING_TOKEN',
  AUTH_CODE_EXPIRED = 'AUTH_CODE_EXPIRED',
  AUTH_REFRESH_TOKEN_REUSED = 'AUTH_REFRESH_TOKEN_REUSED',

  // 403 errors
  AUTH_CROSS_TENANT = 'AUTH_CROSS_TENANT',
  AUTH_TENANT_SUSPENDED = 'AUTH_TENANT_SUSPENDED',

  // 404 errors
  AUTH_TENANT_NOT_FOUND = 'AUTH_TENANT_NOT_FOUND',
  AUTH_USER_NOT_FOUND = 'AUTH_USER_NOT_FOUND',

  // 429 errors
  AUTH_RATE_LIMITED = 'AUTH_RATE_LIMITED',

  // 500 errors
  AUTH_KEYCLOAK_ERROR = 'AUTH_KEYCLOAK_ERROR',
}

/**
 * Token response structure (OAuth 2.0 Authorization Code flow)
 * Returned by /auth/callback and /auth/refresh endpoints
 */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

/**
 * User profile data included in auth responses
 */
export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  realm: string;
  roles: string[];
  teams: string[];
}

/**
 * Extended token response with user profile
 * Returned by /auth/callback endpoint after successful OAuth flow
 */
export interface TokenResponseWithUser extends TokenResponse {
  user: UserProfile;
}

/**
 * User status enum (matches database UserStatus enum)
 * Database: core.UserStatus { ACTIVE, SUSPENDED, DELETED }
 */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

/**
 * User data transfer object for creating users
 * Used by UserRepository.create() and UserSyncConsumer
 */
export interface CreateUserDto {
  keycloakId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string;
  preferences?: Record<string, any>;
  status?: UserStatus;
}

/**
 * User data transfer object for updating users
 * Used by UserRepository.update() and UserSyncConsumer
 */
export interface UpdateUserDto {
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string;
  preferences?: Record<string, any>;
  status?: UserStatus;
}

/**
 * Zod schema for GET /auth/login query parameters
 * Validates OAuth redirect initiation
 */
export const LoginQuerySchema = z.object({
  tenant: z.string().min(1, 'Tenant slug is required'),
  redirect_uri: z.string().url('redirect_uri must be a valid URL'),
  state: z.string().optional(),
});

export type LoginQuery = z.infer<typeof LoginQuerySchema>;

/**
 * Zod schema for GET /auth/callback query parameters
 * Validates OAuth callback from Keycloak
 */
export const CallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

export type CallbackQuery = z.infer<typeof CallbackQuerySchema>;

/**
 * Zod schema for POST /auth/refresh request body
 * Validates token refresh request
 */
export const RefreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

export type RefreshToken = z.infer<typeof RefreshTokenSchema>;

/**
 * Zod schema for POST /auth/logout request body
 * Optional refresh_token for full session revocation
 */
export const LogoutSchema = z.object({
  refresh_token: z.string().optional(),
});

export type Logout = z.infer<typeof LogoutSchema>;

/**
 * Zod schema for GET /auth/jwks query parameters
 * Validates JWKS proxy request
 */
export const JwksQuerySchema = z.object({
  tenant: z.string().min(1, 'Tenant slug is required'),
});

export type JwksQuery = z.infer<typeof JwksQuerySchema>;
