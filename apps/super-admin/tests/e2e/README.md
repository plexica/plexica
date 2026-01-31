# Super-Admin Marketplace E2E Tests

Comprehensive end-to-end tests for the Plexica Plugin Marketplace super-admin interface using Playwright.

## 📋 Test Coverage

### 1. Plugin Review Queue (`plugin-review-queue.spec.ts`)

Tests the workflow for reviewing and approving/rejecting plugins:

- ✅ Display pending plugins in review queue
- ✅ Approve plugin successfully
- ✅ Reject plugin with reason (with validation)
- ✅ Empty state when no pending reviews
- ✅ Handle multiple pending plugins
- ✅ Close review dialog without action
- ✅ Handle API errors during approval

**Total: 7 tests**

### 2. Publish Plugin Wizard (`publish-plugin.spec.ts`)

Tests the 4-step wizard for publishing new plugins:

- ✅ Open publish plugin modal
- ✅ Complete 4-step wizard and publish successfully
- ✅ Validate required fields in step 1
- ✅ Navigate back to edit previous steps
- ✅ Add and remove tags
- ✅ Add and remove screenshots
- ✅ Handle API error during publish
- ✅ Close wizard and discard changes

**Total: 8 tests**

### 3. Version Management (`version-management.spec.ts`)

Tests plugin version management features:

- ✅ Display existing versions for a plugin
- ✅ Expand and collapse version changelog
- ✅ Publish new version successfully
- ✅ Validate required fields for new version
- ✅ Display download count for each version
- ✅ Handle API error during version publish
- ✅ Cancel new version form
- ✅ Sort versions by date (newest first)

**Total: 8 tests**

### 4. Analytics Dashboard (`plugin-analytics.spec.ts`)

Tests the analytics dashboard for plugins:

- ✅ Display analytics dashboard with key metrics
- ✅ Display charts for downloads and installs
- ✅ Change time range and update data (7d, 30d, 90d, all)
- ✅ Display top tenants list
- ✅ Display rating distribution
- ✅ Display average rating
- ✅ Handle empty analytics data gracefully
- ✅ Handle API error when loading analytics
- ✅ Close analytics modal
- ✅ Display growth rate with correct icon (+/-)

**Total: 10 tests**

---

**Grand Total: 33 E2E tests**

## 🏗️ Test Structure

```
apps/super-admin/tests/e2e/
├── .auth/
│   ├── user.json                     # Saved auth state (gitignored)
│   └── .gitignore                    # Ignore auth state files
├── fixtures/
│   └── test-data.ts                  # Test fixtures (plugins, users, mock data)
├── helpers/
│   └── test-helpers.ts               # Reusable helper classes
├── screenshots/                      # Auto-generated screenshots
├── global-setup.ts                   # Global auth setup (runs once before all tests)
├── AUTH_SETUP.md                     # Authentication troubleshooting guide
├── plugin-review-queue.spec.ts       # Review queue tests (7 tests)
├── publish-plugin.spec.ts            # Publish wizard tests (8 tests)
├── version-management.spec.ts        # Version management tests (8 tests)
└── plugin-analytics.spec.ts          # Analytics dashboard tests (10 tests)
```

## 🔐 Authentication

Tests use **Playwright Storage State** for efficient authentication:

1. **Global Setup** (`global-setup.ts`): Runs **once** before all tests
   - Automatically logs in with super-admin credentials
   - Saves authentication state to `.auth/user.json`
   - Reused by all tests (no per-test login needed)

2. **Tests**: Start already authenticated
   - Load auth state from `.auth/user.json`
   - No login code in test files
   - Much faster execution

### If Tests Fail with "Login Required"

See the **[Authentication Setup Guide](./AUTH_SETUP.md)** for complete troubleshooting.

**Quick fix:**

1. Ensure super-admin is running: `pnpm dev` (port 3002)
2. Check credentials in `global-setup.ts` (default: `superadmin@plexica.io` / `SuperAdmin123!`)
3. Run global setup manually: `npx playwright test --global-setup-only`

## 🛠️ Test Helpers

The `test-helpers.ts` file provides 8 helper classes:

1. **AuthHelpers**: Login/logout functionality
2. **NavigationHelpers**: Navigate to pages and tabs
3. **ModalHelpers**: Wait for, close, and interact with modals
4. **FormHelpers**: Fill inputs, textareas, selects, checkboxes
5. **ApiMockHelpers**: Mock API responses for testing
6. **AssertionHelpers**: Custom assertions (toasts, badges, modals)
7. **WaitHelpers**: Network idle, API calls, toast disappear
8. **ScreenshotHelpers**: Take full page and modal screenshots

## 📦 Test Fixtures

The `test-data.ts` file provides:

- **testPlugins**: Pending, new, and published plugin fixtures
- **testUsers**: Super-admin credentials
- **mockAnalyticsData**: Analytics response mock data
- **apiEndpoints**: API endpoint constants

## 🚀 Running the Tests

### Prerequisites

Before running E2E tests, ensure the following services are running:

```bash
# Terminal 1: Start infrastructure (PostgreSQL, Redis, etc.)
pnpm infra:start

# Terminal 2: Migrate and seed database
cd packages/database
pnpm db:migrate
pnpm db:seed  # Or run seed-marketplace.sql

# Terminal 3: Start core-api backend
cd apps/core-api
pnpm dev  # Runs on http://localhost:3000

# Terminal 4: Start super-admin frontend
cd apps/super-admin
pnpm dev  # Runs on http://localhost:3002
```

### Run Tests

```bash
cd apps/super-admin

# Run all tests (headless)
pnpm test:e2e

# Run with UI mode (interactive, recommended)
pnpm test:e2e:ui

# Run in headed mode (see browser)
pnpm test:e2e:headed

# Run specific test file
pnpm test:e2e tests/e2e/plugin-review-queue.spec.ts

# Debug mode (pause on breakpoints)
pnpm test:e2e:debug

# View HTML report after tests
pnpm test:e2e:report
```

### Test Configuration

The `playwright.config.ts` file is configured with:

- **Base URL**: `http://localhost:3002`
- **Browser**: Chromium (with Firefox/Safari options available)
- **Reporters**: HTML report, screenshots on failure, video on retry
- **Auto-start**: Dev server starts automatically before tests

## 📸 Screenshots

Screenshots are automatically saved to `tests/e2e/screenshots/` for:

- Each test completion (via `afterEach` hook)
- Error states and failures
- Important UI states (modals, toasts, forms)

## 🔧 Customizing Tests

### Adding New Tests

1. Create a new `.spec.ts` file in `tests/e2e/`
2. Import helpers and fixtures:
   ```typescript
   import { test, expect } from '@playwright/test';
   import { TestHelpers } from './helpers/test-helpers';
   import { testPlugins, testUsers } from './fixtures/test-data';
   ```
3. Initialize helpers in `beforeEach`:
   ```typescript
   test.beforeEach(async ({ page }) => {
     helpers = new TestHelpers(page);
     await helpers.auth.loginAsSuperAdmin(
       testUsers.superAdmin.username,
       testUsers.superAdmin.password
     );
   });
   ```
4. Write your tests using the helper methods

### Updating Test Data

Modify `tests/e2e/fixtures/test-data.ts` to add/update:

- Plugin fixtures
- User credentials
- Mock API responses
- Endpoint URLs

### Adding Helper Methods

Extend the helper classes in `tests/e2e/helpers/test-helpers.ts`:

- Add new methods to existing helper classes
- Create new helper classes for specific domains
- Update the `TestHelpers` combined class to expose new helpers

## 🐛 Debugging Tips

1. **Use UI Mode**: `pnpm test:e2e:ui` - Most useful for debugging
2. **Use Debug Mode**: `pnpm test:e2e:debug` - Pauses on each action
3. **Check Screenshots**: Look in `tests/e2e/screenshots/` for visual debugging
4. **Use Browser Mode**: `pnpm test:e2e:headed` - See tests run in real browser
5. **Check Network Tab**: Use browser DevTools during headed mode
6. **Add `await page.pause()`**: Pause test execution at specific points
7. **Inspect Selectors**: Use Playwright Inspector to test selectors

## 📝 Best Practices

1. **Always use helpers**: Don't directly use `page.click()` etc. when helpers exist
2. **Mock API calls**: Mock all backend API calls for consistent, fast tests
3. **Use data-testid**: Add `data-testid` attributes to components for reliable selectors
4. **Wait appropriately**: Use `waitFor*` helpers instead of arbitrary `setTimeout`
5. **Clean up**: Close modals, reset state between tests
6. **Take screenshots**: Document important states with screenshots
7. **Test error states**: Always test API error handling
8. **Verify loading states**: Check spinners, disabled buttons, etc.

## 🔗 Related Documentation

- [Playwright Documentation](https://playwright.dev/)
- [Plexica Technical Specs](../../../specs/TECHNICAL_SPECIFICATIONS.md)
- [Marketplace Functional Specs](../../../specs/FUNCTIONAL_SPECIFICATIONS.md)
- [Backend API Tests](../../core-api/src/modules/marketplace/__tests__/)

## ✅ Checklist Before Running Tests

- [ ] PostgreSQL running (`pnpm infra:start`)
- [ ] Database migrated (`pnpm db:migrate`)
- [ ] Database seeded with test data
- [ ] core-api running on port 3000
- [ ] super-admin running on port 3002
- [ ] Keycloak configured (if using auth)
- [ ] Test user credentials available

## 📊 Test Results

After running tests, you can view:

- **HTML Report**: `pnpm test:e2e:report`
- **Console Output**: Shows pass/fail status
- **Screenshots**: In `tests/e2e/screenshots/`
- **Videos**: In `test-results/` (if configured)

---

**Plexica M2.4 - Plugin Marketplace**  
**Last updated: January 2026**  
**Author: Plexica Engineering Team**
