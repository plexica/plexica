/**
 * Standalone Authentication Test Script
 *
 * Run this to test authentication separately from the full test suite.
 * Usage: npx tsx tests/e2e/test-auth.ts
 */

import { chromium } from '@playwright/test';
import path from 'path';

async function testAuth() {
  const baseURL = 'http://localhost:3002';
  const storageStatePath = path.join(process.cwd(), 'tests', 'e2e', '.auth', 'user.json');

  console.log('🔐 Testing authentication setup...\n');

  const browser = await chromium.launch({
    headless: false, // Show browser
    slowMo: 500, // Slow down actions
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('📍 Navigating to:', baseURL);
    await page.goto(baseURL);

    await page.waitForLoadState('networkidle');

    let currentUrl = page.url();
    console.log('✅ Current URL:', currentUrl);
    console.log('📄 Page title:', await page.title());
    console.log('');

    // Check if we're on the app's /login page (intermediate page with SSO link)
    if (currentUrl.includes('/login') && !currentUrl.includes('keycloak')) {
      console.log('🔐 App login page detected (with SSO link)');

      // Take screenshot of the intermediate login page
      await page.screenshot({ path: 'tests/e2e/.auth/app-login-page.png', fullPage: true });
      console.log('📸 Screenshot saved: tests/e2e/.auth/app-login-page.png\n');

      // Look for "Sign in with Keycloak SSO" link
      console.log('🔍 Looking for Keycloak SSO link...');
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
          console.log(`   ✅ Found SSO link: ${selector}`);
          foundSSOLink = selector;
          break;
        } else {
          console.log(`   ❌ Not found: ${selector}`);
        }
      }

      if (foundSSOLink) {
        console.log('\n🖱️  Clicking SSO link...');
        await page.click(foundSSOLink);

        console.log('⏳ Waiting for redirect to Keycloak...');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000); // Extra wait for Keycloak to fully load

        currentUrl = page.url();
        console.log('✅ Redirected to:', currentUrl);
        console.log('');
      } else {
        console.log('\n❌ Could not find SSO link!');
        console.log('📸 Check screenshot: tests/e2e/.auth/app-login-page.png\n');
        console.log('⏸️  Browser will stay open for 30 seconds for inspection...\n');
        await page.waitForTimeout(30000);
        throw new Error('SSO link not found');
      }
    }

    // Now check if we're on Keycloak login page
    if (
      currentUrl.includes('keycloak') ||
      currentUrl.includes('/realms/') ||
      currentUrl.includes('/protocol/openid-connect') ||
      currentUrl.includes(':8080') // Keycloak default port
    ) {
      console.log('🔒 Keycloak login page detected!');
      console.log('📄 Page title:', await page.title());
      console.log('');

      // Take screenshot
      await page.screenshot({ path: 'tests/e2e/.auth/login-page.png', fullPage: true });
      console.log('📸 Screenshot saved: tests/e2e/.auth/login-page.png\n');

      // Try to find username field
      console.log('🔍 Searching for username field...');
      const usernameSelectors = [
        'input[name="username"]',
        'input#username',
        'input#kc-username',
        'input[id="username"]',
        'input[type="text"]',
        'input[type="email"]',
      ];

      let foundUsername = null;
      for (const selector of usernameSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`   ✅ Found: ${selector}`);
          foundUsername = selector;
          break;
        } else {
          console.log(`   ❌ Not found: ${selector}`);
        }
      }

      console.log('');

      // Try to find password field
      console.log('🔍 Searching for password field...');
      const passwordSelectors = [
        'input[name="password"]',
        'input#password',
        'input#kc-password',
        'input[id="password"]',
        'input[type="password"]',
      ];

      let foundPassword = null;
      for (const selector of passwordSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`   ✅ Found: ${selector}`);
          foundPassword = selector;
          break;
        } else {
          console.log(`   ❌ Not found: ${selector}`);
        }
      }

      console.log('');

      // Try to find submit button
      console.log('🔍 Searching for login button...');
      const buttonSelectors = [
        'input[type="submit"]',
        'button[type="submit"]',
        'button[name="login"]',
        '#kc-login',
        'button:has-text("Sign In")',
        'button:has-text("Log In")',
        'button:has-text("Login")',
      ];

      let foundButton = null;
      for (const selector of buttonSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`   ✅ Found: ${selector}`);
          foundButton = selector;
          break;
        } else {
          console.log(`   ❌ Not found: ${selector}`);
        }
      }

      console.log('');

      if (foundUsername && foundPassword && foundButton) {
        console.log('✅ All fields found! Attempting login...\n');

        await page.fill(foundUsername, 'admin');
        console.log('   ⌨️  Filled username: admin');

        await page.fill(foundPassword, 'admin');
        console.log('   ⌨️  Filled password: admin');

        await page.click(foundButton);
        console.log('   🖱️  Clicked login button');

        console.log('   ⏳ Waiting for redirect to app...');
        // Wait for redirect to any authenticated page (plugins, tenants, etc.)
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

        console.log('   ✅ Redirected to:', page.url());
        console.log('\n🎉 Login successful!\n');

        // Wait for Keycloak to fully initialize and update localStorage
        console.log('⏳ Waiting for Keycloak initialization...');
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
          console.log('✅ Keycloak authentication state confirmed\n');
        } catch (error) {
          console.warn('⚠️  Keycloak state not confirmed, but continuing...\n');
        }

        // Save auth state
        await context.storageState({ path: storageStatePath });
        console.log('💾 Auth state saved to:', storageStatePath);
      } else {
        console.log('❌ Could not find all required fields!\n');
        console.log('Missing:');
        if (!foundUsername) console.log('   - Username field');
        if (!foundPassword) console.log('   - Password field');
        if (!foundButton) console.log('   - Login button');
        console.log('\n📸 Check screenshot: tests/e2e/.auth/login-page.png');
        console.log('⏸️  Browser will stay open for 30 seconds for manual inspection...\n');
        await page.waitForTimeout(30000);
      }
    } else if (currentUrl.includes('plugins')) {
      console.log('✅ Already on /plugins page - no login needed!\n');
      await context.storageState({ path: storageStatePath });
      console.log('💾 Auth state saved to:', storageStatePath);
    } else {
      console.log('⚠️  Unexpected URL:', currentUrl);
      console.log('Expected to be on login page or /plugins page\n');
    }
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.log('\n⏸️  Browser will stay open for inspection...');
    await page.waitForTimeout(30000);
  } finally {
    await context.close();
    await browser.close();
    console.log('\n👋 Browser closed');
  }
}

testAuth().catch(console.error);
