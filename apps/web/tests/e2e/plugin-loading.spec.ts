/**
 * E2E Test: Plugin Loading Flow
 *
 * This test verifies that plugins are correctly loaded and rendered in the Plexica web app.
 *
 * Test Prerequisites:
 * - core-api running on localhost:3000
 * - web app running on localhost:3001
 * - Database seeded with plugins (CRM, Analytics)
 * - Plugins installed for test tenant
 *
 * Test Flow:
 * 1. Login as tenant user
 * 2. Verify plugins load in sidebar
 * 3. Click CRM menu item
 * 4. Verify CRM dashboard component renders
 * 5. Navigate to CRM contacts page
 * 6. Verify contacts list renders
 * 7. Click Analytics menu item
 * 8. Verify Analytics dashboard renders
 * 9. Navigate to Analytics reports page
 * 10. Verify reports page renders
 */

describe('Plugin Loading E2E Test', () => {
  const TEST_TENANT_ID = '114c994b-81b0-40da-aa0a-dbc8b838cdd4'; // Default Organization
  const BASE_URL = 'http://localhost:3001';

  before(() => {
    // Setup: Verify services are running
    cy.request('http://localhost:3000/health').then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body.status).to.eq('healthy');
    });
  });

  it('should load the web app', () => {
    cy.visit(BASE_URL);
    cy.url().should('include', BASE_URL);
  });

  it('should show login page', () => {
    // Assuming Keycloak integration
    cy.contains('Sign in').should('be.visible');
  });

  it('should login successfully', () => {
    // TODO: Implement actual login flow with test credentials
    // For now, this is a placeholder
    cy.get('input[name="username"]').type('testuser@example.com');
    cy.get('input[name="password"]').type('testpassword');
    cy.get('button[type="submit"]').click();

    // Wait for redirect after login
    cy.url().should('not.include', 'auth');
  });

  it('should load plugins in sidebar', () => {
    // Verify CRM plugin appears in sidebar
    cy.get('[data-testid="sidebar"]').within(() => {
      cy.contains('CRM').should('be.visible');
      cy.contains('Analytics').should('be.visible');
    });
  });

  it('should load CRM plugin on click', () => {
    cy.contains('CRM').click();

    // Verify URL changed to CRM route
    cy.url().should('include', '/plugins/crm');

    // Verify CRM dashboard loaded
    cy.contains('CRM Dashboard').should('be.visible');
    cy.contains('Total Contacts').should('be.visible');
    cy.contains('Active Deals').should('be.visible');
  });

  it('should navigate to CRM contacts page', () => {
    cy.contains('View Contacts').click();

    // Verify contacts page loaded
    cy.url().should('include', '/plugins/crm/contacts');
    cy.contains('Contacts').should('be.visible');
    cy.get('table').should('be.visible');
  });

  it('should load Analytics plugin on click', () => {
    cy.contains('Analytics').click();

    // Verify URL changed to Analytics route
    cy.url().should('include', '/plugins/analytics');

    // Verify Analytics dashboard loaded
    cy.contains('Analytics Dashboard').should('be.visible');
    cy.contains('Total Revenue').should('be.visible');
  });

  it('should navigate to Analytics reports page', () => {
    cy.contains('View All Reports').click();

    // Verify reports page loaded
    cy.url().should('include', '/plugins/analytics/reports');
    cy.contains('Reports').should('be.visible');
    cy.contains('Create New Report').should('be.visible');
  });

  it('should verify plugin context is correct', () => {
    // Each plugin component should display tenant context
    cy.contains(`Tenant: ${TEST_TENANT_ID}`).should('be.visible');
  });
});

/**
 * Manual Testing Checklist
 * ========================
 *
 * If automated E2E tests are not available, use this checklist:
 *
 * [ ] Start services
 *     - docker compose up -d (postgres, redis, keycloak, minio)
 *     - cd apps/core-api && pnpm dev
 *     - cd apps/web && pnpm dev
 *
 * [ ] Seed database
 *     - DATABASE_URL="..." npx tsx packages/database/scripts/seed-plugins.ts
 *     - DATABASE_URL="..." npx tsx packages/database/scripts/install-plugins-for-tenants.ts
 *
 * [ ] Login to web app
 *     - Open http://localhost:3001
 *     - Login with test credentials
 *
 * [ ] Verify sidebar
 *     - CRM menu item visible (position 10)
 *     - Analytics menu item visible (position 20)
 *
 * [ ] Test CRM Plugin
 *     - Click CRM → Dashboard loads
 *     - View dashboard stats (contacts, deals, pipeline)
 *     - Navigate to Contacts → Table displays
 *     - Search functionality works
 *     - Navigate to Deals → Kanban board displays
 *     - Deal cards show correct stages
 *
 * [ ] Test Analytics Plugin
 *     - Click Analytics → Dashboard loads
 *     - View metrics (revenue, users, conversion)
 *     - Charts render correctly (revenue trend, traffic sources)
 *     - Navigate to Reports → Reports table displays
 *     - Report templates visible
 *
 * [ ] Verify Plugin Loading
 *     - Open browser DevTools → Network tab
 *     - Verify remoteEntry.js files loaded from MinIO CDN
 *     - Check console for any plugin loading errors
 *     - Verify no CORS errors
 *
 * [ ] Test Routing
 *     - Direct URL navigation works (/plugins/crm/contacts)
 *     - Browser back/forward buttons work
 *     - Deep linking works
 *
 * [ ] Test Performance
 *     - Plugin loads within 2 seconds
 *     - No flickering or layout shifts
 *     - Smooth transitions between pages
 */
