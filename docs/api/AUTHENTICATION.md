# Authentication API Documentation

**Version**: 2.0 (OAuth 2.0 Authorization Code Flow)  
**Last Updated**: February 17, 2026  
**Status**: Production-ready

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication Flow](#authentication-flow)
3. [API Endpoints](#api-endpoints)
4. [Error Codes](#error-codes)
5. [Security Considerations](#security-considerations)
6. [Code Examples](#code-examples)
7. [Migration Guide](#migration-guide)

---

## Overview

Plexica uses **OAuth 2.0 Authorization Code Flow** for secure authentication. This flow ensures that user credentials are never handled by the core-api; instead, authentication is delegated to Keycloak.

### Why OAuth 2.0 Authorization Code Flow?

- **Security**: User credentials never leave Keycloak
- **Standards-compliant**: Industry-standard OAuth 2.0 protocol
- **Token rotation**: Refresh tokens are rotated on each use to prevent reuse attacks
- **Multi-tenant**: Each tenant has an isolated Keycloak realm

### Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Client    │      │  Core API   │      │  Keycloak   │
│  (Browser)  │      │  (Plexica)  │      │   (AuthN)   │
└─────────────┘      └─────────────┘      └─────────────┘
      │                     │                     │
      │ 1. GET /auth/login  │                     │
      │────────────────────>│                     │
      │                     │                     │
      │ 2. { authUrl }      │                     │
      │<────────────────────│                     │
      │                     │                     │
      │ 3. Redirect to authUrl                    │
      │──────────────────────────────────────────>│
      │                     │                     │
      │ 4. User authenticates (username/password) │
      │<──────────────────────────────────────────│
      │                     │                     │
      │ 5. Redirect to callback URL with code     │
      │<──────────────────────────────────────────│
      │                     │                     │
      │ 6. GET /auth/callback?code=...            │
      │────────────────────>│                     │
      │                     │ 7. Exchange code    │
      │                     │────────────────────>│
      │                     │                     │
      │                     │ 8. { tokens }       │
      │                     │<────────────────────│
      │                     │                     │
      │ 9. { access_token, refresh_token }        │
      │<────────────────────│                     │
      │                     │                     │
      │ 10. API requests with Bearer token        │
      │────────────────────>│                     │
      │                     │ 11. Validate JWT    │
      │                     │────────────────────>│
      │                     │                     │
      │                     │ 12. { valid: true } │
      │                     │<────────────────────│
      │                     │                     │
      │ 13. { response }    │                     │
      │<────────────────────│                     │
```

---

## Authentication Flow

### Step 1: Build Authorization URL

The client requests an authorization URL from the core-api.

**Request**:

```http
GET /api/auth/login?tenantSlug=acme&redirectUri=https://app.plexica.com/callback&state=random-csrf-token
```

**Response**:

```json
{
  "authUrl": "https://keycloak.plexica.com/realms/acme/protocol/openid-connect/auth?client_id=plexica-web&redirect_uri=https://app.plexica.com/callback&response_type=code&state=random-csrf-token&scope=openid"
}
```

### Step 2: Redirect to Keycloak

The client redirects the user to the `authUrl`. The user authenticates with their credentials directly on Keycloak.

### Step 3: Handle Callback

After successful authentication, Keycloak redirects the user back to the `redirectUri` with an authorization code:

```
https://app.plexica.com/callback?code=AUTH_CODE&state=random-csrf-token
```

The client extracts the `code` and `state` parameters.

### Step 4: Exchange Code for Tokens

The client calls the core-api to exchange the authorization code for access and refresh tokens.

**Request**:

```http
GET /api/auth/callback?code=AUTH_CODE&tenantSlug=acme&state=random-csrf-token
```

**Response**:

```json
{
  "success": true,
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
  "expires_in": 300,
  "refresh_expires_in": 1800
}
```

### Step 5: Use Access Token

The client includes the `access_token` in the `Authorization` header for all API requests:

```http
GET /api/workspaces
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI...
```

### Step 6: Refresh Token

When the access token expires (after 5 minutes), the client refreshes it using the refresh token.

**Request**:

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "tenantSlug": "acme",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI..."
}
```

**Response**:

```json
{
  "success": true,
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI...",
  "refresh_token": "NEW_REFRESH_TOKEN...",
  "expires_in": 300,
  "refresh_expires_in": 1800
}
```

**⚠️ Important**: The old refresh token is **invalidated** after use (token rotation). Store the new `refresh_token` for future refreshes.

### Step 7: Logout

To logout, the client revokes the refresh token.

**Request**:

```http
POST /api/auth/logout
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI...

{
  "tenantSlug": "acme",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI..."
}
```

**Response**:

```json
{
  "success": true
}
```

---

## API Endpoints

### 1. GET /api/auth/login

Build OAuth 2.0 authorization URL for tenant login.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenantSlug` | string | Yes | Tenant identifier (1-50 chars, alphanumeric + hyphens) |
| `redirectUri` | string | Yes | OAuth callback URL (must be valid URL) |
| `state` | string | No | CSRF protection token (recommended) |

**Response**: `200 OK`

```json
{
  "authUrl": "string"
}
```

**Error Responses**:

- `400 VALIDATION_ERROR`: Invalid query parameters
- `403 AUTH_TENANT_NOT_FOUND`: Tenant doesn't exist
- `403 AUTH_TENANT_SUSPENDED`: Tenant is suspended
- `429 AUTH_RATE_LIMITED`: Too many requests (10 per minute per IP)
- `500 INTERNAL_ERROR`: Unexpected server error

**Rate Limit**: 10 requests per minute per IP

**Example**:

```bash
curl -X GET "https://api.plexica.com/api/auth/login?tenantSlug=acme&redirectUri=https://app.plexica.com/callback&state=abc123"
```

---

### 2. GET /api/auth/callback

OAuth 2.0 callback endpoint - exchange authorization code for tokens.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | Authorization code from Keycloak |
| `tenantSlug` | string | Yes | Tenant identifier |
| `state` | string | No | CSRF token (should match login request) |

**Response**: `200 OK`

```json
{
  "success": true,
  "access_token": "string",
  "refresh_token": "string",
  "expires_in": 300,
  "refresh_expires_in": 1800
}
```

**Error Responses**:

- `400 VALIDATION_ERROR`: Invalid query parameters
- `401 AUTH_CODE_EXCHANGE_FAILED`: Authorization code expired or invalid
- `403 AUTH_TENANT_NOT_FOUND`: Tenant doesn't exist
- `403 AUTH_TENANT_SUSPENDED`: Tenant is suspended
- `429 AUTH_RATE_LIMITED`: Too many requests (10 per minute per IP)
- `500 INTERNAL_ERROR`: Unexpected server error

**Rate Limit**: 10 requests per minute per IP

**Token Lifetimes**:

- **Access Token**: 5 minutes (300 seconds)
- **Refresh Token**: 30 minutes (1800 seconds)

**Example**:

```bash
curl -X GET "https://api.plexica.com/api/auth/callback?code=AUTH_CODE&tenantSlug=acme&state=abc123"
```

---

### 3. POST /api/auth/refresh

Refresh access token using refresh token (with token rotation).

**Request Body**:

```json
{
  "tenantSlug": "string",
  "refreshToken": "string"
}
```

**Response**: `200 OK`

```json
{
  "success": true,
  "access_token": "string",
  "refresh_token": "string",
  "expires_in": 300,
  "refresh_expires_in": 1800
}
```

**Error Responses**:

- `400 VALIDATION_ERROR`: Invalid request body
- `401 AUTH_TOKEN_REFRESH_FAILED`: Refresh token expired or invalid
- `403 AUTH_TENANT_NOT_FOUND`: Tenant doesn't exist
- `403 AUTH_TENANT_SUSPENDED`: Tenant is suspended
- `500 INTERNAL_ERROR`: Unexpected server error

**⚠️ Token Rotation**: The old `refresh_token` is **invalidated** after successful refresh. Always store the new `refresh_token` returned in the response.

**Example**:

```bash
curl -X POST "https://api.plexica.com/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"tenantSlug":"acme","refreshToken":"eyJhbGciOi..."}'
```

---

### 4. POST /api/auth/logout

Revoke refresh token and logout user.

**Authentication**: Required (Bearer token)

**Request Body**:

```json
{
  "tenantSlug": "string",
  "refreshToken": "string"
}
```

**Response**: `200 OK`

```json
{
  "success": true
}
```

**Error Responses**:

- `400 VALIDATION_ERROR`: Invalid request body
- `401 AUTH_REQUIRED`: Not authenticated (missing or invalid Bearer token)
- `500 INTERNAL_ERROR`: Unexpected server error

**Best-Effort Revocation**: Token revocation is best-effort. Even if revocation fails on Keycloak, the endpoint returns `200 OK`. This prevents logout failures due to transient Keycloak issues.

**Example**:

```bash
curl -X POST "https://api.plexica.com/api/auth/logout" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -d '{"tenantSlug":"acme","refreshToken":"eyJhbGciOi..."}'
```

---

### 5. GET /api/auth/me

Get current authenticated user information.

**Authentication**: Required (Bearer token)

**Response**: `200 OK`

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "given_name": "John",
  "family_name": "Doe",
  "preferred_username": "john.doe",
  "realm": "acme",
  "roles": ["user", "admin"],
  "tenantSlug": "acme"
}
```

**Error Responses**:

- `401 AUTH_REQUIRED`: Not authenticated (missing or invalid Bearer token)
- `401 AUTH_TOKEN_EXPIRED`: Token has expired
- `401 AUTH_TOKEN_INVALID`: Token is malformed or invalid

**Example**:

```bash
curl -X GET "https://api.plexica.com/api/auth/me" \
  -H "Authorization: Bearer eyJhbGciOi..."
```

---

### 6. GET /api/auth/jwks/:tenantSlug

Get JSON Web Key Set (JWKS) for JWT signature verification (public endpoint).

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tenantSlug` | string | Yes | Tenant identifier |

**Response**: `200 OK`

```json
{
  "keys": [
    {
      "kid": "key-id",
      "kty": "RSA",
      "alg": "RS256",
      "use": "sig",
      "n": "modulus...",
      "e": "AQAB"
    }
  ]
}
```

**Error Responses**:

- `400 VALIDATION_ERROR`: Invalid tenant slug format
- `404 TENANT_NOT_FOUND`: Tenant doesn't exist in Keycloak
- `500 JWKS_FETCH_FAILED`: Failed to fetch JWKS from Keycloak
- `500 INTERNAL_ERROR`: Unexpected server error

**Caching**: JWKS responses are cached in Redis for **10 minutes** to reduce load on Keycloak.

**Example**:

```bash
curl -X GET "https://api.plexica.com/api/auth/jwks/acme"
```

---

## Error Codes

All authentication errors follow the Constitution-compliant format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Optional context object
    }
  }
}
```

### Error Code Reference

| Code                        | HTTP Status | Description                                                   | Retryable |
| --------------------------- | ----------- | ------------------------------------------------------------- | --------- |
| `VALIDATION_ERROR`          | 400         | Invalid request parameters (Zod validation failed)            | No        |
| `AUTH_TOKEN_MISSING`        | 401         | No Bearer token provided in Authorization header              | No        |
| `AUTH_TOKEN_EXPIRED`        | 401         | Access token has expired (refresh required)                   | Yes       |
| `AUTH_TOKEN_INVALID`        | 401         | Token is malformed, tampered, or invalid                      | No        |
| `AUTH_REQUIRED`             | 401         | Authentication required (no token or invalid token)           | No        |
| `AUTH_CODE_EXCHANGE_FAILED` | 401         | Authorization code expired or invalid                         | No        |
| `AUTH_TOKEN_REFRESH_FAILED` | 401         | Refresh token expired, invalid, or already used               | No        |
| `AUTH_TENANT_NOT_FOUND`     | 403         | Tenant doesn't exist or user doesn't have access              | No        |
| `AUTH_TENANT_SUSPENDED`     | 403         | Tenant is suspended (authentication disabled)                 | No        |
| `AUTH_CROSS_TENANT`         | 403         | Token not valid for this tenant (cross-tenant access attempt) | No        |
| `AUTH_RATE_LIMITED`         | 429         | Too many authentication attempts (10 per minute per IP)       | Yes       |
| `TENANT_NOT_FOUND`          | 404         | Tenant doesn't exist in Keycloak (JWKS endpoint)              | No        |
| `JWKS_FETCH_FAILED`         | 500         | Failed to fetch JWKS from Keycloak                            | Yes       |
| `INTERNAL_ERROR`            | 500         | Unexpected server error (logged for investigation)            | Yes       |

### Error Handling Best Practices

1. **401 AUTH_TOKEN_EXPIRED**: Automatically refresh the token using `/auth/refresh`
2. **401 AUTH_TOKEN_REFRESH_FAILED**: Redirect user to login (refresh token expired)
3. **403 AUTH_TENANT_SUSPENDED**: Show user-friendly message ("Account temporarily suspended")
4. **429 AUTH_RATE_LIMITED**: Implement exponential backoff (wait 60 seconds, then retry)
5. **500 INTERNAL_ERROR**: Log error and show generic message ("Something went wrong")

---

## Security Considerations

### 1. CSRF Protection

Always include a `state` parameter in the login request. This prevents CSRF attacks during the OAuth callback.

**Example**:

```javascript
// Generate random CSRF token
const state = crypto.randomBytes(16).toString('hex');

// Store in session storage
sessionStorage.setItem('oauth_state', state);

// Include in login request
const loginUrl = `/api/auth/login?tenantSlug=acme&redirectUri=${callbackUrl}&state=${state}`;

// Verify in callback
const params = new URLSearchParams(window.location.search);
const returnedState = params.get('state');
const storedState = sessionStorage.getItem('oauth_state');

if (returnedState !== storedState) {
  throw new Error('CSRF token mismatch');
}
```

### 2. Token Storage

**Best Practices**:

- **Access Token**: Store in memory (React state, Zustand, etc.) - **DO NOT** store in localStorage
- **Refresh Token**: Store in secure, httpOnly cookie (set by your backend) or memory

**Why not localStorage?**

- Vulnerable to XSS attacks (any script can read localStorage)
- Tokens persist across sessions (security risk)

### 3. Token Rotation

Refresh tokens are **automatically rotated** on every refresh. This prevents token reuse attacks:

- Old refresh token is invalidated after successful refresh
- New refresh token must be stored for future refreshes
- Attempting to reuse an old refresh token will fail

### 4. Rate Limiting

**Login and Callback endpoints** are rate-limited to **10 requests per minute per IP** to prevent:

- Brute force attacks
- Credential stuffing
- DoS attacks

If rate-limited, wait 60 seconds before retrying.

### 5. Tenant Isolation

Each tenant has an **isolated Keycloak realm**. Tokens issued for one tenant **cannot** be used to access another tenant's resources.

Cross-tenant access attempts will return `403 AUTH_CROSS_TENANT`.

### 6. Suspended Tenants

When a tenant is suspended:

- Existing tokens are **immediately invalidated**
- Login attempts return `403 AUTH_TENANT_SUSPENDED`
- Token refresh attempts return `403 AUTH_TENANT_SUSPENDED`

Users must wait until the tenant is re-activated.

### 7. HTTPS Only

**ALL** authentication requests **MUST** use HTTPS in production. HTTP is only allowed in development.

### 8. Token Expiry

- **Access Token**: 5 minutes (short-lived to minimize impact of token theft)
- **Refresh Token**: 30 minutes (longer-lived for user convenience)

Implement automatic token refresh 30 seconds before expiry.

---

## Code Examples

### React + Axios Example

```typescript
// auth.service.ts
import axios from 'axios';

const API_BASE = 'https://api.plexica.com/api';

interface TokenResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  /**
   * Step 1: Get authorization URL
   */
  async getLoginUrl(tenantSlug: string, redirectUri: string): Promise<string> {
    const state = this.generateCSRFToken();
    sessionStorage.setItem('oauth_state', state);

    const response = await axios.get<{ authUrl: string }>(`${API_BASE}/auth/login`, {
      params: { tenantSlug, redirectUri, state },
    });

    return response.data.authUrl;
  }

  /**
   * Step 2: Handle OAuth callback
   */
  async handleCallback(code: string, tenantSlug: string, state: string): Promise<void> {
    // Verify CSRF token
    const storedState = sessionStorage.getItem('oauth_state');
    if (state !== storedState) {
      throw new Error('CSRF token mismatch');
    }

    // Exchange code for tokens
    const response = await axios.get<TokenResponse>(`${API_BASE}/auth/callback`, {
      params: { code, tenantSlug, state },
    });

    const { access_token, refresh_token, expires_in } = response.data;

    // Store tokens
    this.accessToken = access_token;
    this.refreshToken = refresh_token;

    // Schedule automatic refresh 30 seconds before expiry
    this.scheduleTokenRefresh(expires_in - 30);

    // Clean up CSRF token
    sessionStorage.removeItem('oauth_state');
  }

  /**
   * Step 3: Refresh access token
   */
  async refreshAccessToken(tenantSlug: string): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post<TokenResponse>(`${API_BASE}/auth/refresh`, {
        tenantSlug,
        refreshToken: this.refreshToken,
      });

      const { access_token, refresh_token, expires_in } = response.data;

      // Update tokens (note: refresh token is rotated)
      this.accessToken = access_token;
      this.refreshToken = refresh_token;

      // Schedule next refresh
      this.scheduleTokenRefresh(expires_in - 30);
    } catch (error) {
      // Refresh token expired - redirect to login
      this.logout();
      window.location.href = '/login';
    }
  }

  /**
   * Step 4: Logout
   */
  async logout(tenantSlug?: string): Promise<void> {
    if (this.refreshToken && tenantSlug && this.accessToken) {
      try {
        await axios.post(
          `${API_BASE}/auth/logout`,
          {
            tenantSlug,
            refreshToken: this.refreshToken,
          },
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
            },
          }
        );
      } catch (error) {
        // Best-effort - continue with local logout even if API call fails
        console.error('Logout failed:', error);
      }
    }

    // Clear tokens
    this.accessToken = null;
    this.refreshToken = null;

    // Cancel refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  // Helper methods

  private generateCSRFToken(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private scheduleTokenRefresh(delaySeconds: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      const tenantSlug = this.getTenantSlugFromToken();
      if (tenantSlug) {
        this.refreshAccessToken(tenantSlug).catch(console.error);
      }
    }, delaySeconds * 1000);
  }

  private getTenantSlugFromToken(): string | null {
    if (!this.accessToken) return null;

    try {
      // Decode JWT payload (without verification)
      const payload = JSON.parse(atob(this.accessToken.split('.')[1]));
      return payload.realm || null;
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
```

### Axios Interceptor for Automatic Token Refresh

```typescript
// api.ts
import axios from 'axios';
import { authService } from './auth.service';

const api = axios.create({
  baseURL: 'https://api.plexica.com/api',
});

// Request interceptor: Add access token to all requests
api.interceptors.request.use(
  (config) => {
    const token = authService.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Handle 401 errors with automatic refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const errorCode = error.response?.data?.error?.code;

      if (errorCode === 'AUTH_TOKEN_EXPIRED') {
        try {
          // Refresh token
          const tenantSlug = 'acme'; // Get from app context
          await authService.refreshAccessToken(tenantSlug);

          // Retry original request with new token
          const token = authService.getAccessToken();
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed - redirect to login
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }

    return Promise.reject(error);
  }
);

export { api };
```

### React Login Component

```typescript
// LoginPage.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from './auth.service';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if this is an OAuth callback
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (code && state) {
      handleCallback(code, state);
    }
  }, [searchParams]);

  const handleCallback = async (code: string, state: string) => {
    try {
      const tenantSlug = 'acme'; // Get from app context or subdomain
      await authService.handleCallback(code, tenantSlug, state);

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Login failed');
    }
  };

  const handleLogin = async () => {
    try {
      const tenantSlug = 'acme'; // Get from app context or subdomain
      const redirectUri = `${window.location.origin}/login`; // This page handles callback

      const authUrl = await authService.getLoginUrl(tenantSlug, redirectUri);

      // Redirect to Keycloak
      window.location.href = authUrl;
    } catch (error: any) {
      setError(error.response?.data?.error?.message || 'Failed to initiate login');
    }
  };

  return (
    <div>
      <h1>Login to Plexica</h1>
      {error && <div className="error">{error}</div>}
      <button onClick={handleLogin}>Login with Keycloak</button>
    </div>
  );
};
```

---

## Migration Guide

### Migrating from ROPC (Resource Owner Password Credentials) Flow

If you're migrating from the old ROPC flow (`POST /api/auth/login` with username/password), follow these steps:

#### Old Flow (ROPC - Deprecated)

```typescript
// ❌ OLD - No longer supported
const response = await axios.post('/api/auth/login', {
  tenantSlug: 'acme',
  username: 'user@example.com',
  password: 'password123',
});

const { access_token, refresh_token } = response.data;
```

#### New Flow (OAuth 2.0 Authorization Code)

```typescript
// ✅ NEW - OAuth 2.0 Authorization Code Flow

// Step 1: Get authorization URL
const authUrl = await authService.getLoginUrl('acme', window.location.origin + '/callback');

// Step 2: Redirect to Keycloak (user enters credentials there)
window.location.href = authUrl;

// Step 3: Handle callback (after Keycloak redirects back)
const code = new URLSearchParams(window.location.search).get('code');
const state = new URLSearchParams(window.location.search).get('state');

await authService.handleCallback(code, 'acme', state);
```

#### Key Differences

| Aspect              | ROPC (Old)        | OAuth 2.0 (New)            |
| ------------------- | ----------------- | -------------------------- |
| **Credentials**     | Sent to core-api  | Never leave Keycloak       |
| **Security**        | Medium            | High                       |
| **User Experience** | Single-page login | Redirect to Keycloak       |
| **Token Rotation**  | Optional          | Mandatory                  |
| **Rate Limiting**   | Per-tenant        | Per-IP                     |
| **CSRF Protection** | Not required      | Required (state parameter) |

#### Breaking Changes

1. **Endpoint Removed**: `POST /api/auth/login` (username/password) no longer exists
2. **New Endpoints**: `GET /api/auth/login` and `GET /api/auth/callback` added
3. **Token Format**: Unchanged (JWT with same claims)
4. **Refresh Flow**: Unchanged (`POST /api/auth/refresh`)
5. **Logout Flow**: Unchanged (`POST /api/auth/logout`)

#### Migration Checklist

- [ ] Update login UI to use OAuth redirect flow
- [ ] Implement CSRF protection with `state` parameter
- [ ] Handle OAuth callback in your application
- [ ] Update token storage (avoid localStorage)
- [ ] Implement automatic token refresh
- [ ] Test with Keycloak in development
- [ ] Update API client libraries
- [ ] Remove password fields from login forms
- [ ] Update documentation and user guides

---

## Additional Resources

- **Swagger UI**: Available at `https://api.plexica.com/docs` (development mode)
- **Keycloak Documentation**: [https://www.keycloak.org/docs/latest/](https://www.keycloak.org/docs/latest/)
- **OAuth 2.0 Spec**: [RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- **JWT Spec**: [RFC 7519](https://datatracker.ietf.org/doc/html/rfc7519)
- **Constitution**: `.forge/constitution.md` (Articles 5.1, 5.3, 6.2)

---

**Questions or Issues?**

For authentication-related questions or issues, please:

1. Check the error code in the [Error Codes](#error-codes) section
2. Review the [Security Considerations](#security-considerations)
3. Consult the [Code Examples](#code-examples)
4. Open an issue on GitHub with error details and request/response logs

---

_Last Updated: February 17, 2026_  
_Spec Reference: `.forge/specs/002-authentication/`_
