# Frontend Testing Guide

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Testing Guide

## Overview

This guide covers testing for the Plexica frontend application built with React, TanStack Router, and Keycloak authentication. It includes authentication testing, component testing, multi-tenant URL verification, and end-to-end user flows.

**Tech Stack**:

- React 18 with TypeScript
- TanStack Router for routing
- Keycloak for authentication
- Zustand for state management
- Vite for build/dev server
- Vitest for unit tests
- React Testing Library for component tests

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Authentication Testing](#authentication-testing)
3. [Component Testing](#component-testing)
4. [Multi-Tenant Testing](#multi-tenant-testing)
5. [Console Log Verification](#console-log-verification)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Environment Setup

### Prerequisites

All services must be running:

- PostgreSQL (port 5432)
- Keycloak (port 8080)
- Redis (port 6379) - optional
- Backend API (port 3000)
- Frontend Web (port 5173 or 3001)

### Development Environment Variables

Create `apps/web/.env`:

```env
# Backend API
VITE_API_URL=http://localhost:3000

# Keycloak Configuration
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_CLIENT_ID=plexica-web

# Tenant Configuration for Development
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app

# Optional: Override realm (for testing specific realm)
# VITE_KEYCLOAK_REALM=test-tenant-realm
```

### Test User Setup

For each tenant realm in Keycloak, create a test user:

- **Realm**: `test-tenant-realm` (or your tenant realm)
- **Username**: `testuser`
- **Password**: `testpass123`
- **Email**: `test@plexica.dev`
- **Roles**: Add realm roles as needed

### Start Development Servers

```bash
# Terminal 1 - Backend API
cd apps/core-api
pnpm dev

# Terminal 2 - Frontend
cd apps/web
pnpm dev
```

**Verify servers are running**:

```bash
# Backend health check
curl http://localhost:3000/health
# Expected: {"status":"healthy","timestamp":"..."}

# Frontend accessible
open http://localhost:5173
```

---

## Authentication Testing

### Multi-Tenant URL-Based Authentication

Plexica uses **URL-based multi-tenancy**:

- Each tenant has a **unique subdomain URL**: `tenant1.plexica.app`, `tenant2.plexica.app`
- Each tenant has a **dedicated Keycloak realm**: `tenant1-realm`, `tenant2-realm`
- Tenant is **automatically detected from URL** - no manual selection after login
- Users authenticate to their tenant's specific realm

### Test 1: Fresh Login Flow

**Purpose**: Verify new user login flow with automatic tenant detection

**Steps**:

1. **Clear browser storage**:

   ```javascript
   // In browser console
   localStorage.clear();
   sessionStorage.clear();
   ```

2. **Navigate to tenant URL**:
   - Development: `http://localhost:5173`
   - Subdomain: `http://tenant1.localhost:5173`

3. **Verify initial loading**:
   - AuthProvider loading spinner appears
   - No infinite loading screen

4. **Click "Sign in with Keycloak"**

5. **Verify Keycloak redirect**:
   - URL should be: `http://localhost:8080/realms/test-tenant-realm/protocol/openid-connect/auth`
   - Realm matches your tenant

6. **Login with test credentials**:
   - Username: `testuser`
   - Password: `testpass123`

7. **Verify successful authentication**:
   - Redirected back to `http://localhost:5173`
   - Auth token stored (check DevTools → Application → Local Storage)
   - Tenant info automatically loaded
   - Redirected to dashboard (NOT to tenant selection page)
   - Header shows tenant name

**Expected Console Logs** (see [Console Log Verification](#console-log-verification)):

```
[AuthProvider] Starting initialization...
[AuthProvider] Step 1: Tenant from URL: test-tenant
[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm
[Keycloak] Initialization complete, authenticated: true
[AuthProvider] Step 7: Tenant info received
[AuthProvider] Step 10 (FINAL): Setting isLoading to false
[LoginPage] Authenticated, navigating to home
```

**Pass Criteria**:

- ✅ No infinite loading screen
- ✅ All 10 initialization steps complete
- ✅ Tenant automatically detected from URL
- ✅ Correct Keycloak realm used
- ✅ Tenant data fetched from backend
- ✅ Redirected to dashboard

**Common Issues**:

- "Failed to initialize Keycloak" → Check Keycloak is running
- "Tenant not found" → Verify tenant exists in database
- Wrong realm → Check console logs for realm name

---

### Test 2: Returning User (Cached Auth)

**Purpose**: Verify session persistence for returning users

**Steps**:

1. **Don't clear storage** (keep previous session)
2. **Navigate to** `http://localhost:5173`
3. **Verify automatic login**:
   - No login page shown
   - Immediate redirect to dashboard
   - Console shows: `[AuthStore] Rehydrated API client with token and tenant`

**Pass Criteria**:

- ✅ Automatic authentication
- ✅ No login page shown
- ✅ Tenant matches cached tenant
- ✅ Workspaces load correctly

---

### Test 3: Logout Flow

**Purpose**: Verify proper logout and session cleanup

**Steps**:

1. **While authenticated**, click "Logout" button
2. **Verify logout actions**:
   - Logged out from Keycloak
   - Redirected to login page
   - Local storage cleared
   - Session storage cleared

3. **Try accessing protected route**: `/workspace-settings`
4. **Verify redirect**: Should redirect to `/login`

**Pass Criteria**:

- ✅ Complete logout from Keycloak
- ✅ Redirect to login page
- ✅ Storage cleared
- ✅ Protected routes redirect to login

---

### Test 4: Protected Routes

**Purpose**: Verify route protection works correctly

**Steps**:

1. **Clear browser storage** (logout fully)
2. **Try accessing protected routes**:
   - `http://localhost:5173/workspace-settings`
   - `http://localhost:5173/team`

3. **Verify behavior**:
   - Redirected to `/login`
   - After login, redirected back to originally requested page

**Pass Criteria**:

- ✅ Unauthenticated users redirected to login
- ✅ Original URL preserved
- ✅ Post-login redirect works

---

### Test 5: React StrictMode Double Render

**Purpose**: Ensure initialization is idempotent under React StrictMode

**Steps**:

1. **Verify StrictMode enabled** in `apps/web/src/main.tsx`:

   ```typescript
   <React.StrictMode>
     <App />
   </React.StrictMode>
   ```

2. **Clear storage and login**
3. **Check console logs**:
   - Should see: `[AuthProvider] Initialization already in progress, skipping`
   - Only ONE complete flow from Step 1 to Step 10
   - No duplicate initialization

**Pass Criteria**:

- ✅ No duplicate initialization
- ✅ Single complete auth flow
- ✅ Ref-based guard prevents concurrent init

---

### Test 6: HMR (Hot Module Reload) Stability

**Purpose**: Ensure hot reloading doesn't break active sessions

**Steps**:

1. **With active session**, edit a file:
   - Make comment change in `apps/web/src/routes/login.tsx`
   - Save the file

2. **Verify session stability**:
   - Stay on current page
   - No logout
   - No re-initialization

**Pass Criteria**:

- ✅ Session persists through HMR
- ✅ No unexpected logout
- ✅ No re-initialization

---

## Component Testing

### Test Component Setup

**File**: `apps/web/src/components/__tests__/example.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExampleComponent } from '../ExampleComponent';

describe('ExampleComponent', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<ExampleComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    render(<ExampleComponent />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Clicked')).toBeInTheDocument();
    });
  });
});
```

### Testing with Router Context

Components using TanStack Router need router context:

```typescript
import { createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { RouterProvider } from '@tanstack/react-router';

function createTestRouter(component: React.ReactNode) {
  const rootRoute = createRootRoute({
    component: () => component,
  });

  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
  });

  return router;
}

describe('ComponentWithRouter', () => {
  it('renders with router', () => {
    const router = createTestRouter(<MyComponent />);
    render(<RouterProvider router={router} />);

    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
```

### Testing with Auth Context

Mock the auth store for components that use authentication:

```typescript
import { useAuthStore } from '@/stores/auth';

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(),
}));

describe('AuthenticatedComponent', () => {
  it('renders for authenticated user', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', name: 'Test User' },
      tenant: { id: '1', slug: 'test-tenant', name: 'Test Tenant' },
    });

    render(<AuthenticatedComponent />);
    expect(screen.getByText('Welcome, Test User')).toBeInTheDocument();
  });

  it('redirects when not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      user: null,
      tenant: null,
    });

    render(<AuthenticatedComponent />);
    // Verify redirect behavior
  });
});
```

### Testing Forms

Test form validation and submission:

```typescript
describe('WorkspaceForm', () => {
  it('validates required fields', async () => {
    const user = userEvent.setup();
    render(<WorkspaceForm />);

    await user.click(screen.getByRole('button', { name: /create/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('submits valid data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<WorkspaceForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/name/i), 'Test Workspace');
    await user.type(screen.getByLabelText(/slug/i), 'test-workspace');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Test Workspace',
        slug: 'test-workspace',
      });
    });
  });
});
```

### Running Component Tests

```bash
# Run all tests
cd apps/web
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/components/__tests__/WorkspaceForm.test.tsx
```

---

## Multi-Tenant Testing

### Test 7: Multi-Tenant URL Isolation

**Purpose**: Verify data isolation between tenants

**Prerequisites**: Multiple tenants configured with subdomain setup

**Steps**:

1. **Configure `/etc/hosts`** (macOS/Linux):

   ```
   127.0.0.1 tenant1.localhost
   127.0.0.1 tenant2.localhost
   ```

2. **Access first tenant**:
   - Navigate to `http://tenant1.localhost:5173`
   - Login with tenant1 credentials
   - Note workspaces and data visible

3. **Open new incognito window**

4. **Access second tenant**:
   - Navigate to `http://tenant2.localhost:5173`
   - Login with tenant2 credentials

5. **Verify isolation**:
   - Tenant2 shows different data
   - Tenant1 data NOT accessible from tenant2 URL
   - Each tenant uses separate Keycloak realm
   - Logging out from tenant1 doesn't affect tenant2

**Pass Criteria**:

- ✅ Each tenant URL uses own Keycloak realm
- ✅ Complete data isolation
- ✅ Separate authentication sessions
- ✅ No cross-tenant data leakage

---

### Test 8: Tenant Detection from URL

**Purpose**: Verify correct tenant extraction from URL

**Steps**:

1. **Test localhost**: Access `http://localhost:5173`
   - Console should show: `[AuthProvider] Step 1: Tenant from URL: test-tenant`
   - Uses `VITE_DEFAULT_TENANT` from env

2. **Test subdomain**: Access `http://tenant1.localhost:5173`
   - Console should show: `[AuthProvider] Step 1: Tenant from URL: tenant1`
   - Extracts tenant from subdomain

3. **Verify realm generation**:
   - Console should show: `[Keycloak] Creating config for tenant: tenant1, realm: tenant1-realm`

**Pass Criteria**:

- ✅ Correct tenant extracted from URL
- ✅ Realm name generated correctly
- ✅ Fallback to default tenant for localhost

---

## Console Log Verification

### Complete Authentication Flow Logs

**Expected sequence** for successful login:

```
[AuthProvider] Starting initialization...
[AuthProvider] Step 1: Tenant from URL: test-tenant
[AuthProvider] Step 2: Calling initKeycloak()...
[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm
[Keycloak] Starting initialization...
[Keycloak] Initialization complete, authenticated: true
[AuthProvider] Step 3: initKeycloak() returned: true
[AuthProvider] Step 4: User authenticated, fetching user info...
[AuthProvider] Step 5: User info received, processing...
[AuthProvider] Step 6: Fetching tenant info for: test-tenant
[AuthProvider] Step 7: Tenant info received: {id: "...", slug: "test-tenant", ...}
[AuthStore] setToken called
[AuthProvider] Step 8: Token stored
[AuthStore] setUser called, setting isAuthenticated to true
[AuthProvider] Step 9: User info stored successfully
[AuthProvider] Step 10 (FINAL): Setting isLoading to false
[LoginPage] Authenticated, navigating to home
```

### Key Checkpoints

1. **Step 1**: Tenant detection
   - Confirms tenant extracted from URL
   - Shows which tenant will be used

2. **Keycloak config**: Realm selection
   - Confirms correct realm for tenant
   - Shows Keycloak initialization

3. **Step 7**: Tenant data fetch
   - Confirms backend API accessible
   - Tenant exists in database

4. **Step 10**: Initialization complete
   - Final step - loading stops here
   - If missing, initialization didn't complete

### Error Detection

**Look for these error patterns**:

- `Failed to initialize Keycloak` → Keycloak not accessible
- `Tenant not found` → Tenant missing from database
- `Failed to fetch tenant info` → Backend API error
- `Network error` → API not reachable
- Missing Step 10 → Incomplete initialization

---

## Troubleshooting

### Issue: Infinite Loading Screen

**Symptoms**: Loading spinner never stops after login

**Debugging Steps**:

1. **Check console for "Step 10 (FINAL)"**
   - If missing, initialization didn't complete
   - Look for errors between Step 1 and Step 10

2. **Verify Keycloak is running**:

   ```bash
   docker ps | grep keycloak
   curl http://localhost:8080
   ```

3. **Check tenant exists**:

   ```bash
   curl http://localhost:3000/api/tenants/slug/test-tenant \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **Verify environment variables**:
   - Check `VITE_KEYCLOAK_URL` is correct
   - Check `VITE_DEFAULT_TENANT` matches database

**Solutions**:

- Restart Keycloak if not responding
- Create tenant in database if missing
- Check backend API logs for errors

---

### Issue: "Tenant not found" Error

**Symptoms**: Error message after successful Keycloak login

**Debugging Steps**:

1. **Check tenant in database**:

   ```sql
   SELECT * FROM public.tenants WHERE slug = 'test-tenant';
   ```

2. **Verify tenant is ACTIVE**:

   ```sql
   SELECT slug, status FROM public.tenants;
   ```

3. **Check backend API**:

   ```bash
   curl http://localhost:3000/api/tenants/slug/test-tenant \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

4. **Check console logs**:
   - Look for: `[AuthProvider] Step 6: Fetching tenant info for: X`
   - Look for: `[AuthProvider] Failed to fetch tenant info`

**Solutions**:

- Create tenant in database
- Update tenant status to ACTIVE
- Verify backend API is running
- Check tenant slug matches URL

---

### Issue: Wrong Keycloak Realm

**Symptoms**: Login redirects to wrong realm

**Debugging Steps**:

1. **Check console**:
   - Look for: `[Keycloak] Creating config for tenant: X, realm: X-realm`
   - Verify realm name is correct

2. **Check Keycloak admin**:
   - Access `http://localhost:8080/admin`
   - Login with admin/admin
   - Verify realm exists

3. **Check realm configuration**:
   - Verify client `plexica-web` exists in realm
   - Check redirect URIs include `http://localhost:5173/*`

**Solutions**:

- Create missing realm in Keycloak
- Configure client in correct realm
- Remove `VITE_KEYCLOAK_REALM` override (if testing auto-detection)

---

### Issue: "Invalid redirect URI" Error

**Symptoms**: Keycloak shows error after login

**Debugging Steps**:

1. **Check client configuration** in Keycloak:
   - Realm → Clients → plexica-web
   - Valid Redirect URIs should include:
     - `http://localhost:5173/*`
     - `http://localhost:3001/*`
   - Web Origins should include:
     - `http://localhost:5173`
     - `http://localhost:3001`

2. **Verify client in correct realm**:
   - Client must be in tenant's realm (e.g., `test-tenant-realm`)
   - NOT in `master` realm

**Solutions**:

- Add redirect URIs to client configuration
- Verify client is in correct realm
- Restart Keycloak after changes

---

### Issue: "Cannot read property 'tenant' of null"

**Symptoms**: JavaScript error in console

**Debugging Steps**:

1. **Check Network tab**:
   - Look for `/api/tenants/slug/...` request
   - Check response status and body

2. **Verify backend is running**:

   ```bash
   curl http://localhost:3000/health
   ```

3. **Check backend logs** for errors

**Solutions**:

- Ensure backend API is running
- Check tenant exists in database
- Verify API returns correct tenant data

---

### Issue: HMR Causes Logout

**Symptoms**: Hot reload logs user out

**Debugging Steps**:

1. **Check if initialization runs on HMR**:
   - Look for duplicate `[AuthProvider] Starting initialization...`

2. **Verify ref guard**:
   - Should see: `[AuthProvider] Initialization already in progress, skipping`

**Solutions**:

- Ensure AuthProvider uses ref to prevent re-init
- Check if component unmounts on HMR
- Consider adding HMR boundary

---

## Best Practices

### 1. Use Browser DevTools Effectively

**Console Tab**:

- Filter logs by `[AuthProvider]` or `[Keycloak]`
- Look for error stack traces
- Check for warnings

**Network Tab**:

- Monitor `/auth` requests to Keycloak
- Check `/api/tenants/slug/*` requests
- Verify headers: `Authorization`, `X-Tenant-Slug`

**Application Tab**:

- Inspect localStorage: `plexica-auth`
- Check sessionStorage
- Monitor cookies if used

### 2. Test User Flows, Not Just Components

Focus on complete user journeys:

- Login → Select Workspace → Create Team
- Not just: "Test login button clicks"

### 3. Test Error States

Don't just test happy paths:

- Network failures
- Invalid input
- Missing data
- Permission errors

### 4. Clean Up Between Tests

```typescript
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});
```

### 5. Use Semantic Queries

Prefer semantic queries over implementation details:

```typescript
// ✅ Good - Semantic
screen.getByRole('button', { name: /sign in/i });
screen.getByLabelText(/workspace name/i);

// ❌ Bad - Implementation details
screen.getByClassName('btn-primary');
screen.getByTestId('workspace-input');
```

### 6. Avoid Testing Implementation Details

Test behavior, not internals:

```typescript
// ✅ Good - Tests behavior
expect(screen.getByText('Welcome, Test User')).toBeInTheDocument();

// ❌ Bad - Tests implementation
expect(component.state.userName).toBe('Test User');
```

### 7. Mock External Dependencies

Always mock:

- Keycloak initialization
- API calls
- Browser APIs (localStorage, fetch)
- Third-party libraries

### 8. Use Realistic Test Data

```typescript
// ✅ Good - Realistic
const mockWorkspace = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  slug: 'engineering-team',
  name: 'Engineering Team',
  createdAt: '2026-01-01T00:00:00Z',
};

// ❌ Bad - Unrealistic
const mockWorkspace = {
  id: '1',
  slug: 'test',
  name: 'Test',
};
```

---

## Coverage Targets

### Unit Tests

**Target**: 70% coverage

- Component render tests
- User interaction tests
- Form validation tests
- State management tests

### Integration Tests

**Target**: 60% coverage

- Authentication flows
- Multi-tenant switching
- Workspace context switching
- Form submission flows

### E2E Tests

**Target**: Critical paths only

- Complete login → create workspace → create team flow
- Multi-tenant isolation
- Permission enforcement

---

## Running Tests

```bash
# All tests
cd apps/web
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Specific file
pnpm test src/components/WorkspaceForm.test.tsx

# UI mode (interactive)
pnpm test:ui
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Frontend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: cd apps/web && pnpm test:ci

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./apps/web/coverage/coverage-final.json
```

---

## Next Steps

After frontend testing is complete:

1. **Backend Testing**: See [BACKEND_TESTING.md](./BACKEND_TESTING.md)
2. **E2E Testing**: See [E2E_TESTING.md](./E2E_TESTING.md)
3. **Performance Testing**: Load testing, bundle analysis
4. **Accessibility Testing**: WCAG compliance, screen reader testing
5. **Security Testing**: XSS, CSRF, authentication vulnerabilities

---

**Last Updated**: January 2026  
**Related Documents**:

- [Testing Overview](./README.md)
- [Backend Testing](./BACKEND_TESTING.md)
- [E2E Testing](./E2E_TESTING.md)
- [Quick Test Guide](./QUICK_TEST.md)
