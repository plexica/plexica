# Authentication Setup for E2E Tests

## 🔐 How Authentication Works

The E2E tests use **Playwright Storage State** to handle authentication efficiently:

1. **Global Setup** (`global-setup.ts`): Runs **once** before all tests
   - Navigates to the app
   - Detects Keycloak login page
   - Logs in with super-admin credentials
   - Saves authentication state to `.auth/user.json`

2. **Tests**: Automatically use the saved authentication state
   - No need to login in each test
   - Tests start already authenticated
   - Much faster execution

## 🚀 Quick Start

### If Authentication Works (Happy Path)

```bash
cd apps/super-admin
pnpm test:e2e
```

The global setup will:

- ✅ Login automatically
- ✅ Save auth state
- ✅ Run all tests as authenticated user

### If Tests Fail with "Login Required"

This means the global setup couldn't authenticate. Follow these steps:

---

## 🔧 Troubleshooting Authentication Issues

### Option 1: Check Prerequisites

Ensure all services are running:

```bash
# Terminal 1: Infrastructure
pnpm infra:start

# Terminal 2: Database
cd packages/database
pnpm db:migrate
pnpm db:seed

# Terminal 3: Backend API
cd apps/core-api
pnpm dev  # Must be on http://localhost:3000

# Terminal 4: Frontend
cd apps/super-admin
pnpm dev  # Must be on http://localhost:3002
```

**Verify manually:**

1. Open browser to http://localhost:3002
2. You should see Keycloak login page
3. Try logging in with `superadmin@plexica.io` / `SuperAdmin123!`
4. If login works manually, tests should work too

---

### Option 2: Update Credentials

If the default credentials don't work, update them in `global-setup.ts`:

```typescript
// tests/e2e/global-setup.ts (lines ~30-31)

await page.fill('input[name="username"], input#username', 'YOUR_USERNAME');
await page.fill('input[name="password"], input#password', 'YOUR_PASSWORD');
```

---

### Option 3: Adjust Keycloak Selectors

If your Keycloak theme uses different selectors, update them:

```typescript
// tests/e2e/global-setup.ts (lines ~30-34)

// Default selectors:
await page.fill('input[name="username"], input#username', 'superadmin@plexica.io');
await page.fill('input[name="password"], input#password', 'SuperAdmin123!');
await page.click('input[type="submit"], button[type="submit"]');

// If your Keycloak uses different selectors, inspect with browser DevTools
// and update accordingly. For example:
// await page.fill('#kc-username', 'superadmin@plexica.io');
// await page.fill('#kc-password', 'SuperAdmin123!');
// await page.click('#kc-login');
```

---

### Option 4: Bypass Authentication (For Development)

If Keycloak is not configured or you want to skip auth entirely:

#### 4a. Mock Authentication in Tests

Add API mocking to bypass auth checks:

```typescript
// In each test file, add to beforeEach:
test.beforeEach(async ({ page }) => {
  helpers = new TestHelpers(page);

  // Mock auth API to return authenticated user
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'super-admin-test',
        username: 'superadmin@plexica.io',
        role: 'super-admin',
      }),
    });
  });

  await helpers.nav.goToPluginsPage();
});
```

#### 4b. Disable Authentication in Super-Admin App (Temporary)

**⚠️ Only for local testing - DO NOT commit this!**

In `apps/super-admin/src/main.tsx` or routing config, comment out auth guards:

```typescript
// Temporarily disable auth check
// if (!isAuthenticated) {
//   return <Navigate to="/login" />
// }
```

---

### Option 5: Run Tests Without Global Setup

If global setup keeps failing, you can disable it and use per-test login:

#### 5a. Comment out global setup in `playwright.config.ts`:

```typescript
export default defineConfig({
  testDir: './tests/e2e',

  // globalSetup: './tests/e2e/global-setup.ts', // <-- Comment this out
  // ...

  use: {
    baseURL: 'http://localhost:3002',
    // storageState: './tests/e2e/.auth/user.json', // <-- Comment this out
    // ...
  },
});
```

#### 5b. Re-enable login in test files:

```typescript
test.beforeEach(async ({ page }) => {
  helpers = new TestHelpers(page);

  // Re-enable manual login
  await helpers.auth.loginAsSuperAdmin('superadmin@plexica.io', 'SuperAdmin123!');

  await helpers.nav.goToPluginsPage();
});
```

**Note:** This will make tests slower (login for every test) but might be easier to debug.

---

## 🐛 Debugging Authentication

### Check Global Setup Output

When you run tests, you should see:

```bash
$ pnpm test:e2e

🔐 Setting up authentication...
  📋 Keycloak login page detected, attempting login...
  ✅ Login successful via Keycloak
  💾 Authentication state saved to: /path/to/tests/e2e/.auth/user.json

Running 33 tests...
```

### If You See Errors:

```bash
❌ Authentication setup failed: Error: ...
⚠️  Tests will likely fail. Please check:
   1. Is super-admin app running on http://localhost:3002?
   2. Is Keycloak configured correctly?
   3. Are the credentials correct?
```

**Action:** Follow the checklist above.

---

### Manually Inspect Authentication State

After global setup runs, check the saved state:

```bash
cat apps/super-admin/tests/e2e/.auth/user.json
```

You should see cookies and storage state (not human-readable, but file should exist and be >100 bytes).

---

### Run Global Setup Manually

Test the setup in isolation:

```bash
cd apps/super-admin

# Run global setup only (not the full tests)
npx playwright test --global-setup-only

# Or run with debug
DEBUG=pw:api npx playwright test --global-setup-only
```

---

## 📝 Best Practices

1. **Keep credentials in test-data.ts**: Don't hardcode in tests
2. **Use storage state**: Much faster than logging in per test
3. **Mock APIs where possible**: Reduces dependency on backend state
4. **Test auth separately**: Have a dedicated auth test file
5. **Reset state**: Use `test.afterEach()` to cleanup if needed

---

## 🔗 Related Files

- `global-setup.ts` - Authentication setup script
- `playwright.config.ts` - Playwright configuration with storage state
- `helpers/test-helpers.ts` - AuthHelpers class (manual login)
- `fixtures/test-data.ts` - Test user credentials
- `.auth/user.json` - Saved authentication state (gitignored)

---

## ✅ Checklist: Is Everything Running?

Before running tests, verify:

- [ ] PostgreSQL is running (port 5432)
- [ ] Redis is running (port 6379)
- [ ] Keycloak is running (port 8080) **[If using auth]**
- [ ] core-api is running (port 3000)
- [ ] super-admin is running (port 3002)
- [ ] Database is migrated (`pnpm db:migrate`)
- [ ] Database is seeded (`pnpm db:seed`)
- [ ] You can login manually at http://localhost:3002
- [ ] Global setup completes successfully

---

## 🆘 Still Having Issues?

### Quick Fix: Skip Authentication Entirely

Create a `.env.test` file:

```bash
# apps/super-admin/.env.test
VITE_SKIP_AUTH=true
```

Update tests to use this env:

```bash
NODE_ENV=test pnpm test:e2e
```

### Contact

If authentication continues to fail, provide:

1. Output from `pnpm test:e2e` (full error logs)
2. Screenshot of http://localhost:3002 (what you see)
3. Keycloak configuration (realm, client settings)
4. Browser console errors (F12 → Console tab)

---

**Plexica E2E Tests - Authentication Guide**  
**Last updated: January 2026**
