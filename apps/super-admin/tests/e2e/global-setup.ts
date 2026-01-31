/**
 * Global Setup for Playwright Tests
 *
 * This file runs once before all tests to set up authentication.
 * It performs login and saves the authentication state to be reused by all tests.
 */

import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  const storageStatePath = path.join(process.cwd(), 'tests', 'e2e', '.auth', 'user.json');

  console.log('🔐 Setting up authentication...');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the app
    await page.goto(baseURL || 'http://localhost:3002');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check current URL
    let currentUrl = page.url();
    console.log('  📍 Current URL:', currentUrl);

    // STEP 1: Check if we're on app's /login page (with SSO link)
    if (currentUrl.includes('/login') && !currentUrl.includes('keycloak')) {
      console.log('  📋 App login page detected (with SSO link)');

      // Look for "Sign in with Keycloak SSO" link
      const ssoLinkSelectors = [
        'text=Sign in with Keycloak SSO',
        'a:has-text("Sign in with Keycloak")',
        'button:has-text("Sign in with Keycloak")',
        'a:has-text("Keycloak")',
        'button:has-text("SSO")',
        '[href*="keycloak"]',
        'a:has-text("Sign in")',
      ];

      let foundSSOLink = null;
      for (const selector of ssoLinkSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          foundSSOLink = selector;
          break;
        }
      }

      if (foundSSOLink) {
        console.log('  🖱️  Clicking SSO link...');
        await page.click(foundSSOLink);

        console.log('  ⏳ Waiting for redirect to Keycloak...');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        currentUrl = page.url();
        console.log('  ✅ Redirected to Keycloak');
      } else {
        throw new Error('SSO link not found on /login page');
      }
    }

    // STEP 2: Check if we're on Keycloak login page
    if (
      currentUrl.includes('keycloak') ||
      currentUrl.includes('/realms/') ||
      currentUrl.includes('/protocol/openid-connect') ||
      currentUrl.includes(':8080') // Keycloak default port
    ) {
      console.log('  📋 Keycloak login page detected, attempting login...');

      // Take screenshot to see what the login page looks like
      await page.screenshot({ path: 'tests/e2e/.auth/login-page.png', fullPage: true });
      console.log('  📸 Screenshot saved to tests/e2e/.auth/login-page.png');

      // Log page content to help debug selectors
      const pageTitle = await page.title();
      console.log('  📄 Page title:', pageTitle);

      // Try to find username field with multiple strategies
      console.log('  🔍 Looking for username field...');

      let usernameSelector = null;
      const possibleUsernameSelectors = [
        'input[name="username"]',
        'input#username',
        'input#kc-username',
        'input[id="username"]',
        'input[type="text"]',
        'input[type="email"]',
        '[name="username"]',
      ];

      for (const selector of possibleUsernameSelectors) {
        const element = await page.locator(selector).count();
        if (element > 0) {
          console.log(`  ✅ Found username field with selector: ${selector}`);
          usernameSelector = selector;
          break;
        }
      }

      if (!usernameSelector) {
        console.error('  ❌ Could not find username field!');
        console.error('  ℹ️  Please check the screenshot at tests/e2e/.auth/login-page.png');
        console.error('  ℹ️  And inspect the page to find the correct selectors');

        // Keep browser open for manual inspection
        console.log('  ⏸️  Browser will stay open for 60 seconds for manual inspection...');
        await page.waitForTimeout(60000);
        throw new Error('Username field not found');
      }

      // Fill in credentials
      console.log('  ⌨️  Filling username...');
      await page.fill(usernameSelector, 'admin');

      // Try to find password field
      console.log('  🔍 Looking for password field...');
      let passwordSelector = null;
      const possiblePasswordSelectors = [
        'input[name="password"]',
        'input#password',
        'input#kc-password',
        'input[id="password"]',
        'input[type="password"]',
        '[name="password"]',
      ];

      for (const selector of possiblePasswordSelectors) {
        const element = await page.locator(selector).count();
        if (element > 0) {
          console.log(`  ✅ Found password field with selector: ${selector}`);
          passwordSelector = selector;
          break;
        }
      }

      if (!passwordSelector) {
        console.error('  ❌ Could not find password field!');
        throw new Error('Password field not found');
      }

      console.log('  ⌨️  Filling password...');
      await page.fill(passwordSelector, 'admin');

      // Find and click login button
      console.log('  🔍 Looking for login button...');
      const possibleButtonSelectors = [
        'input[type="submit"]',
        'button[type="submit"]',
        'button[name="login"]',
        '#kc-login',
        'button:has-text("Sign In")',
        'button:has-text("Log In")',
        'button:has-text("Login")',
      ];

      let buttonSelector = null;
      for (const selector of possibleButtonSelectors) {
        const element = await page.locator(selector).count();
        if (element > 0) {
          console.log(`  ✅ Found login button with selector: ${selector}`);
          buttonSelector = selector;
          break;
        }
      }

      if (!buttonSelector) {
        console.error('  ❌ Could not find login button!');
        throw new Error('Login button not found');
      }

      console.log('  🖱️  Clicking login button...');
      await page.click(buttonSelector);

      // Wait for redirect back to app (any authenticated page)
      console.log('  ⏳ Waiting for redirect to app...');
      await page.waitForURL(
        (url) => {
          const urlStr = url.href;
          return (
            urlStr.includes('/plugins') ||
            urlStr.includes('/tenants') ||
            urlStr.includes('/dashboard') ||
            (urlStr.includes('localhost:3002') && !urlStr.includes('/login'))
          );
        },
        { timeout: 15000 }
      );

      console.log('  ✅ Login successful via Keycloak');

      // Wait for Keycloak to fully initialize and update localStorage
      console.log('  ⏳ Waiting for Keycloak initialization...');

      // First, check what's in localStorage right after login
      const authStateCheck = await page.evaluate(() => {
        return localStorage.getItem('super-admin-auth');
      });
      console.log('  📝 Current auth state:', authStateCheck);

      try {
        await page.waitForFunction(
          () => {
            const authState = localStorage.getItem('super-admin-auth');
            if (!authState) return false;
            try {
              const parsed = JSON.parse(authState);
              return parsed.state?.isAuthenticated === true;
            } catch {
              return false;
            }
          },
          { timeout: 10000 }
        );
        console.log('  ✅ Keycloak authentication state confirmed');

        // Extra step: verify we can access a protected page
        console.log('  📍 Verifying access to protected page...');
        // Wait for any protected page content to appear (sidebar, header, etc.)
        await page.waitForSelector('text=Plexica Super Admin', { timeout: 5000 }).catch(() => {
          console.log('  ⚠️  Could not find app header');
        });
      } catch (timeoutError) {
        console.warn('  ⚠️  Keycloak state check timed out');
        console.warn('  ⚠️  Authentication might work via cookies instead of localStorage');
        // Continue anyway - cookies might be sufficient
      }
    } else if (currentUrl.includes('plugins') || currentUrl.includes('tenants')) {
      console.log('  ✅ Already logged in (or no auth required)');
    } else {
      console.warn('  ⚠️  Unexpected URL after navigation:', currentUrl);
      console.warn('  ⚠️  Tests may fail if authentication is required');
    }

    // Save the authentication state
    // Get cookies from ALL domains, not just the current page
    const allCookies = await context.cookies();
    console.log('  📊 Cookies to save:', allCookies.length);

    if (allCookies.length === 0) {
      console.warn('  ⚠️  No cookies found! Checking specific URLs...');

      // Check cookies for different domains
      const appCookies = await context.cookies('http://localhost:3002');
      const keycloakCookies = await context.cookies('http://localhost:8080');

      console.log('    - App cookies (localhost:3002):', appCookies.length);
      console.log('    - Keycloak cookies (localhost:8080):', keycloakCookies.length);

      if (keycloakCookies.length > 0) {
        console.log('  ℹ️  Keycloak cookies found:', keycloakCookies.map((c) => c.name).join(', '));
      }
    }

    await context.storageState({ path: storageStatePath });
    console.log('  💾 Authentication state saved to:', storageStatePath);
  } catch (error) {
    console.error('  ❌ Authentication setup failed:', error);
    console.error('  ⚠️  Tests will likely fail. Please check:');
    console.error('     1. Is super-admin app running on http://localhost:3002?');
    console.error('     2. Is Keycloak configured correctly?');
    console.error('     3. Are the credentials correct?');
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
