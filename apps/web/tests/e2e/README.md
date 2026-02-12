# Web App E2E Tests

**Last Updated**: 2026-02-11  
**Status**: Active  
**Test Framework**: Playwright  
**Document Type**: Test Documentation

## Overview

This directory contains Playwright end-to-end tests for the Plexica web applications, covering critical user flows for both the super-admin and regular web app.

## 📊 Test Statistics

- **Total E2E Tests**: 169 tests
- **Test Files**: 15 files
- **Pass Rate**: 100% (when services running)
- **Execution Time**: 3-5 minutes

### Test Distribution

| App             | Tests   | Files        | Status        |
| --------------- | ------- | ------------ | ------------- |
| **Super-Admin** | 105     | 9 files      | ✅ Complete   |
| **Web App**     | 64      | 6 files      | ✅ Complete   |
| **Total**       | **169** | **15 files** | **✅ Active** |

---

## 📁 Test Files

### Super-Admin App (9 files, 105 tests)

#### 1. **auth.spec.ts** - Authentication Flows

**Tests**: Super-admin login, logout, session management
**Key Scenarios**:

- ✅ Super-admin login with credentials
- ✅ Session persistence
- ✅ Logout and cleanup
- ✅ Invalid credentials handling
- ✅ Keycloak realm validation

#### 2. **tenant-management.spec.ts** - Tenant CRUD Operations

**Tests**: Create, read, update, delete tenants
**Key Scenarios**:

- ✅ Create new tenant with validation
- ✅ List all tenants with pagination
- ✅ Update tenant information
- ✅ Deactivate/reactivate tenants
- ✅ Delete tenant (with dependencies check)
- ✅ Tenant slug validation

#### 3. **user-management.spec.ts** - User Operations

**Tests**: Create, manage, and control users
**Key Scenarios**:

- ✅ Create user with roles
- ✅ List users with filters
- ✅ Update user information
- ✅ Manage user roles (admin, member)
- ✅ Deactivate users
- ✅ Reset user password

#### 4. **plugin-management.spec.ts** - Plugin Installation & Configuration

**Tests**: Install, configure, and manage plugins
**Key Scenarios**:

- ✅ Browse plugin marketplace
- ✅ Install plugin on tenant
- ✅ Configure plugin settings
- ✅ Activate/deactivate plugin
- ✅ Uninstall plugin
- ✅ Plugin dependency validation

#### 5. **settings.spec.ts** - Global Settings

**Tests**: Global configuration and platform settings
**Key Scenarios**:

- ✅ Update platform settings
- ✅ Configure email notifications
- ✅ Manage API keys
- ✅ Set security policies
- ✅ Configure branding

#### 6. **multi-tenancy.spec.ts** - Multi-Tenant Isolation

**Tests**: Data isolation between tenants
**Key Scenarios**:

- ✅ Verify tenant data isolation
- ✅ Switch between tenants
- ✅ Cross-tenant access prevention
- ✅ Separate authentication per tenant
- ✅ Tenant-specific feature flags

#### 7. **workspace-management.spec.ts** - Workspace Administration

**Tests**: Manage workspaces across tenants
**Key Scenarios**:

- ✅ Create workspace in tenant
- ✅ List workspaces with pagination
- ✅ Update workspace settings
- ✅ Manage workspace members
- ✅ Delete workspace
- ✅ Workspace role assignment

#### 8. **dashboard.spec.ts** - Super-Admin Dashboard

**Tests**: Dashboard functionality and widgets
**Key Scenarios**:

- ✅ Dashboard loads with analytics
- ✅ Tenant summary widget
- ✅ User activity widget
- ✅ System health widget
- ✅ Recent activity timeline

#### 9. **plugin-marketplace.spec.ts** - Plugin Discovery

**Tests**: Plugin marketplace browsing and installation
**Key Scenarios**:

- ✅ Browse available plugins
- ✅ Search and filter plugins
- ✅ View plugin details
- ✅ Install plugin
- ✅ Review plugin ratings

### Web App (6 files, 64 tests)

#### 1. **auth-flow.spec.ts** - User Authentication

**Tests**: Login, logout, and session management
**Key Scenarios**:

- ✅ User login with Keycloak
- ✅ Redirect to dashboard after login
- ✅ Session persistence (returning user)
- ✅ Logout and redirect to login
- ✅ Protected route access
- ✅ Invalid credentials handling
- ✅ Session timeout

#### 2. **dashboard.spec.ts** - Dashboard Interface

**Tests**: Dashboard layout, widgets, and data display
**Key Scenarios**:

- ✅ Dashboard loads with workspace info
- ✅ Recent activity section
- ✅ Workspace selector
- ✅ Quick action buttons
- ✅ Data refresh on interval
- ✅ Responsive layout

#### 3. **workspace-management.spec.ts** - Workspace Operations

**Tests**: Create, manage, and delete workspaces
**Key Scenarios**:

- ✅ Create new workspace
- ✅ List workspaces with pagination
- ✅ View workspace details
- ✅ Edit workspace settings
- ✅ Add workspace members
- ✅ Remove workspace members
- ✅ Set member roles
- ✅ Delete workspace

#### 4. **navigation.spec.ts** - Application Navigation

**Tests**: Router and navigation flows
**Key Scenarios**:

- ✅ Navigate between pages
- ✅ Sidebar navigation
- ✅ Breadcrumb navigation
- ✅ Active route highlighting
- ✅ Deep linking (direct URL access)
- ✅ Route guards and redirects
- ✅ Back button navigation

#### 5. **settings.spec.ts** - User & Workspace Settings

**Tests**: Settings management and preferences
**Key Scenarios**:

- ✅ Update user profile
- ✅ Change password
- ✅ Manage email preferences
- ✅ Update workspace settings
- ✅ Manage workspace members (roles, permissions)
- ✅ Configure workspace integrations
- ✅ Download user data

#### 6. **plugin-lifecycle.spec.ts** - Plugin Management

**Tests**: Plugin installation, activation, and lifecycle
**Key Scenarios**:

- ✅ Browse available plugins
- ✅ Install plugin in workspace
- ✅ Configure plugin settings
- ✅ Activate plugin
- ✅ Deactivate plugin
- ✅ Uninstall plugin
- ✅ View plugin documentation
- ✅ Handle plugin errors

---

## 🚀 Running Tests

### Run All E2E Tests

```bash
cd apps/web
pnpm test:e2e
```

**Expected**: All 169 tests pass in 3-5 minutes

### Run Tests by Category

```bash
# Super-admin tests only
pnpm test:e2e --grep "@super-admin"

# Web app tests only
pnpm test:e2e --grep "@web-app"
```

### Run Specific Test File

```bash
# Single file
pnpm test:e2e auth-flow.spec.ts

# Super-admin specific file
pnpm test:e2e super-admin/tenant-management.spec.ts
```

### Run with UI (Visual Test Runner)

```bash
pnpm test:e2e --ui
```

Launches interactive test UI with:

- Test file explorer
- Watch mode
- Debug tools
- Test filtering

### Run in Headed Mode (See Browser)

```bash
pnpm test:e2e --headed
```

**Note**: Tests run slower in headed mode but allow visual inspection

### Debug Mode (Step-Through)

```bash
pnpm test:e2e --debug
```

Opens inspector for step-by-step test execution

### Generate HTML Report

```bash
pnpm test:e2e --reporter=html
open playwright-report/index.html
```

---

## 🛠️ Test Setup & Teardown

### Environment Setup

All E2E tests require:

1. **Backend API running** (port 3000)

   ```bash
   cd apps/core-api
   pnpm dev
   ```

2. **Frontend server running** (port 5173)

   ```bash
   cd apps/web
   pnpm dev
   ```

3. **Test infrastructure** (PostgreSQL, Keycloak, Redis)
   ```bash
   cd test-infrastructure
   ./scripts/test-setup.sh
   ```

### Verify Services

```bash
# Check backend health
curl http://localhost:3000/health

# Check frontend accessible
open http://localhost:5173

# Check Keycloak
open http://localhost:8080
```

### Test User Credentials

```
Realm: test-tenant-realm
Username: testuser
Password: testpass123
Email: test@plexica.dev
```

---

## 📋 Test Structure

### Standard Test Pattern

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate, login, etc.
    await page.goto('http://localhost:5173');
  });

  test('should complete user flow', async ({ page }) => {
    // Act: User interactions
    await page.click('text=Create Workspace');
    await page.fill('input[name="name"]', 'New Workspace');

    // Assert: Verify results
    await expect(page).toHaveURL(/.*workspace/);
    await expect(page.locator('text=New Workspace')).toBeVisible();
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Navigate away, logout, etc.
    await page.context().clearCookies();
  });
});
```

### Common Test Selectors

```typescript
// By text
page.locator('text=Create Workspace');

// By role
page.locator('button:has-text("Submit")');

// By placeholder
page.fill('input[placeholder="Enter name"]', 'value');

// By label
page.fill('input[type="email"]', 'user@example.com');

// By data-testid
page.locator('[data-testid="workspace-form"]');
```

---

## 🎯 Coverage Map

### Super-Admin Coverage

- ✅ Authentication (admin login/logout)
- ✅ Tenant management (create, list, update, delete)
- ✅ User management (CRUD, roles)
- ✅ Plugin management (install, configure, manage)
- ✅ Settings (global configuration)
- ✅ Multi-tenancy (data isolation, switching)
- ✅ Workspace admin (create, manage, delete)
- ✅ Dashboard (analytics, widgets)
- ✅ Plugin marketplace (browse, install)

### Web App Coverage

- ✅ User authentication (login, logout, sessions)
- ✅ Dashboard (overview, widgets)
- ✅ Workspace management (CRUD, members)
- ✅ Navigation (routing, guards)
- ✅ Settings (user, workspace, preferences)
- ✅ Plugin lifecycle (install, activate, deactivate)

---

## ⚙️ Configuration

### Playwright Config

**File**: `apps/web/playwright.config.ts`

```typescript
{
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI ? true : false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  webServer: {
    command: 'pnpm dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
}
```

### Parallel Execution

- **Local**: 4 workers (concurrent test files)
- **CI**: 1 worker (sequential, for reliability)

### Timeouts

- **Test timeout**: 30 seconds per test
- **Assertion timeout**: 5 seconds per assertion
- **Navigation wait**: 10 seconds default

---

## 🐛 Debugging Tests

### View Test Trace

```bash
# Generate trace during test run
pnpm test:e2e --trace on

# View trace (must run first)
pnpm exec playwright show-trace trace/trace.zip
```

### Use Page Inspector

```bash
pnpm test:e2e --debug

# In inspector:
# 1. Click on test step to see what it does
# 2. Use console to interact with page
# 3. Step through execution
```

### Screenshot on Failure

Tests automatically capture screenshots on failure:

```
test-results/
├── auth-flow-should-login-0.png
├── auth-flow-should-login-0.txt
└── ...
```

### Video Recording

```bash
# Record video during test run
pnpm test:e2e --record-video on
```

---

## 📖 Best Practices

### 1. Use Meaningful Selectors

```typescript
// ✅ Good: Semantic, stable
page.locator('button:has-text("Create Workspace")');
page.locator('input[type="email"]');

// ❌ Bad: Brittle, implementation-dependent
page.locator('.btn-primary-large');
page.locator('#workspace-form-input-name');
```

### 2. Wait for Elements

```typescript
// ✅ Good: Explicit wait
await page.waitForSelector('[data-testid="workspace-card"]');
await page.locator('text=New Workspace').waitFor();

// ❌ Bad: Implicit assumptions
await page.click('button'); // Which button?
```

### 3. Clean Up Resources

```typescript
test.afterEach(async ({ page }) => {
  // Clear cookies/storage
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());

  // Close connections
  await page.close();
});
```

### 4. Test Behavior, Not Implementation

```typescript
// ✅ Good: Tests user behavior
test('should create workspace', async ({ page }) => {
  await page.fill('input[name="name"]', 'My Workspace');
  await page.click('button:has-text("Create")');
  await expect(page.locator('text=My Workspace')).toBeVisible();
});

// ❌ Bad: Tests implementation details
expect(component.state.workspace.name).toBe('My Workspace');
```

### 5. Use Fixtures for Setup

```typescript
const authenticatedPage = test.extend({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('http://localhost:5173/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();

    await use(page);
  },
});

authenticatedPage('should show dashboard', async ({ authenticatedPage: page }) => {
  // Already logged in
  await expect(page).toHaveURL(/.*dashboard/);
});
```

---

## 🔗 Related Documentation

- [Frontend Testing Guide](../../docs/testing/FRONTEND_TESTING.md)
- [E2E Testing Overview](../../docs/testing/E2E_TESTING.md)
- [Testing Documentation](../../docs/testing/README.md)
- [Playwright Official Docs](https://playwright.dev/)

---

**Last Updated**: February 11, 2026  
**Maintained by**: Plexica Engineering Team  
**Framework**: Playwright v1.40+
