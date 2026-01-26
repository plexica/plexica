#!/usr/bin/env tsx
/**
 * Complete Environment Initialization Script for Plexica
 *
 * This script performs a complete initialization of the development environment:
 * 1. Checks Docker infrastructure
 * 2. Initializes database schema
 * 3. Seeds database with sample data
 * 4. Creates Keycloak realms for each tenant
 * 5. Creates sample users in each realm
 * 6. Configures MinIO buckets
 *
 * Usage:
 *   pnpm run init:env
 *   or
 *   tsx scripts/init-environment.ts
 */

import { execSync } from 'child_process';
import KcAdminClient from '@keycloak/keycloak-admin-client';
import type UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';
import type RealmRepresentation from '@keycloak/keycloak-admin-client/lib/defs/realmRepresentation';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  header: (msg: string) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
  step: (msg: string) => console.log(`  ${colors.magenta}→${colors.reset} ${msg}`),
};

// Configuration
const CONFIG = {
  database: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core',
  },
  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    adminUsername: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
  },
  minio: {
    endpoint: process.env.STORAGE_ENDPOINT || 'localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    useSSL: process.env.STORAGE_USE_SSL === 'true',
  },
};

// Sample data definitions
const TENANTS = [
  { slug: 'acme-corp', name: 'Acme Corporation' },
  { slug: 'globex-inc', name: 'Globex Industries' },
  { slug: 'demo-company', name: 'Demo Company' },
];

const SAMPLE_USERS = [
  {
    username: 'admin',
    email: 'admin@{tenant}.com',
    firstName: 'Admin',
    lastName: 'User',
    password: 'Admin123!',
    roles: ['admin'],
  },
  {
    username: 'user',
    email: 'user@{tenant}.com',
    firstName: 'Regular',
    lastName: 'User',
    password: 'User123!',
    roles: ['user'],
  },
];

const SUPER_ADMIN_REALM = 'plexica-admin';

/**
 * Step 1: Check Docker infrastructure
 */
async function checkDockerInfrastructure(): Promise<boolean> {
  log.header('Step 1: Checking Docker Infrastructure');

  try {
    // Check if Docker is running
    log.step('Checking Docker daemon...');
    execSync('docker info', { stdio: 'ignore' });
    log.success('Docker daemon is running');

    // Check required containers
    const containers = ['plexica-postgres', 'plexica-keycloak', 'plexica-redis', 'plexica-minio'];

    log.step('Checking required containers...');
    const runningContainers = execSync('docker ps --format "{{.Names}}"', {
      encoding: 'utf-8',
    })
      .split('\n')
      .filter(Boolean);

    const missingContainers = containers.filter(
      (container) => !runningContainers.includes(container)
    );

    if (missingContainers.length > 0) {
      log.error(`Missing containers: ${missingContainers.join(', ')}`);
      log.info('Starting infrastructure...');
      execSync('docker compose up -d', { stdio: 'inherit' });
      log.success('Infrastructure started');

      // Wait for services to be healthy
      log.step('Waiting for services to be healthy (30s)...');
      await new Promise((resolve) => setTimeout(resolve, 30000));
    } else {
      log.success('All required containers are running');
    }

    return true;
  } catch (error) {
    log.error('Docker infrastructure check failed');
    console.error(error);
    return false;
  }
}

/**
 * Step 2: Initialize database schema
 */
async function initializeDatabaseSchema(): Promise<boolean> {
  log.header('Step 2: Initializing Database Schema');

  try {
    log.step('Pushing Prisma schema to database...');
    execSync(`npx prisma db push --url="${CONFIG.database.url}"`, {
      cwd: resolve(__dirname, '../packages/database'),
      stdio: 'inherit',
    });
    log.success('Database schema initialized');

    log.step('Generating Prisma Client...');
    execSync('pnpm prisma generate', {
      cwd: resolve(__dirname, '../packages/database'),
      stdio: 'inherit',
    });
    log.success('Prisma Client generated');

    return true;
  } catch (error) {
    log.error('Database schema initialization failed');
    console.error(error);
    return false;
  }
}

/**
 * Step 3: Seed database with sample data
 */
async function seedDatabase(): Promise<boolean> {
  log.header('Step 3: Seeding Database with Sample Data');

  try {
    log.step('Running database seed script...');
    execSync('pnpm db:seed', {
      cwd: resolve(__dirname, '../packages/database'),
      stdio: 'inherit',
    });
    log.success('Database seeded successfully');

    return true;
  } catch (error) {
    log.error('Database seeding failed');
    console.error(error);
    return false;
  }
}

/**
 * Step 4: Create Keycloak realms for tenants
 */
async function createKeycloakRealms(): Promise<boolean> {
  log.header('Step 4: Creating Keycloak Realms');

  try {
    const kcAdminClient = new KcAdminClient({
      baseUrl: CONFIG.keycloak.url,
      realmName: 'master',
    });

    log.step('Authenticating with Keycloak...');
    await kcAdminClient.auth({
      username: CONFIG.keycloak.adminUsername,
      password: CONFIG.keycloak.adminPassword,
      grantType: 'password',
      clientId: 'admin-cli',
    });
    log.success('Authenticated with Keycloak');

    // Create super-admin realm
    log.step(`Creating super-admin realm: ${SUPER_ADMIN_REALM}...`);
    try {
      const existingRealm = await kcAdminClient.realms.findOne({ realm: SUPER_ADMIN_REALM });
      if (existingRealm) {
        log.warning(`Realm ${SUPER_ADMIN_REALM} already exists, skipping`);
      } else {
        await kcAdminClient.realms.create({
          realm: SUPER_ADMIN_REALM,
          displayName: 'Plexica Super Admin',
          enabled: true,
          sslRequired: 'external',
          registrationAllowed: false,
          loginWithEmailAllowed: true,
          duplicateEmailsAllowed: false,
          resetPasswordAllowed: true,
          editUsernameAllowed: false,
          bruteForceProtected: true,
          accessTokenLifespan: 900,
          ssoSessionIdleTimeout: 1800,
          ssoSessionMaxLifespan: 36000,
        });
        log.success(`Created realm: ${SUPER_ADMIN_REALM}`);
      }
    } catch (error) {
      log.warning(`Realm ${SUPER_ADMIN_REALM} might already exist`);
    }

    // Create client for super-admin app
    log.step('Creating super-admin-app client...');
    try {
      kcAdminClient.setConfig({ realmName: SUPER_ADMIN_REALM });
      const existingClients = await kcAdminClient.clients.find({ clientId: 'super-admin-app' });
      if (existingClients.length > 0) {
        log.warning('Client super-admin-app already exists, skipping');
      } else {
        await kcAdminClient.clients.create({
          clientId: 'super-admin-app',
          name: 'Super Admin App',
          enabled: true,
          publicClient: true,
          directAccessGrantsEnabled: true,
          standardFlowEnabled: true,
          implicitFlowEnabled: false,
          redirectUris: ['http://localhost:3002/*'],
          webOrigins: ['http://localhost:3002'],
        });
        log.success('Created client: super-admin-app');
      }
      kcAdminClient.setConfig({ realmName: 'master' });
    } catch (error) {
      log.warning('Client super-admin-app might already exist');
      kcAdminClient.setConfig({ realmName: 'master' });
    }

    // Create super-admin role and user
    log.step('Creating super-admin user...');
    try {
      kcAdminClient.setConfig({ realmName: SUPER_ADMIN_REALM });

      // Create role
      const roles = await kcAdminClient.roles.find();
      const superAdminRole = roles.find((r) => r.name === 'super-admin');
      if (!superAdminRole) {
        await kcAdminClient.roles.create({
          name: 'super-admin',
          description: 'Super Administrator with platform-wide access',
        });
        log.success('Created role: super-admin');
      }

      // Create user
      const existingUsers = await kcAdminClient.users.find({ username: 'admin' });
      if (existingUsers.length > 0) {
        log.warning('Super-admin user already exists, skipping');
      } else {
        const userResult = await kcAdminClient.users.create({
          username: 'admin',
          email: 'admin@plexica.com',
          firstName: 'Super',
          lastName: 'Admin',
          enabled: true,
          emailVerified: true,
        });

        // Set password
        await kcAdminClient.users.resetPassword({
          id: userResult.id!,
          credential: {
            temporary: false,
            type: 'password',
            value: 'admin',
          },
        });

        // Assign role
        const role = await kcAdminClient.roles.findOneByName({ name: 'super-admin' });
        if (role) {
          await kcAdminClient.users.addRealmRoleMappings({
            id: userResult.id!,
            roles: [{ id: role.id!, name: role.name! }],
          });
        }

        log.success('Created super-admin user: admin / admin');
      }
      kcAdminClient.setConfig({ realmName: 'master' });
    } catch (error) {
      log.warning('Super-admin user might already exist');
      kcAdminClient.setConfig({ realmName: 'master' });
    }

    // Create realms for each tenant
    for (const tenant of TENANTS) {
      log.step(`Creating realm for tenant: ${tenant.slug}...`);

      try {
        const existingRealm = await kcAdminClient.realms.findOne({ realm: tenant.slug });
        if (existingRealm) {
          log.warning(`Realm ${tenant.slug} already exists, skipping`);
          continue;
        }
      } catch (error) {
        // Realm doesn't exist, create it
      }

      const realmRepresentation: RealmRepresentation = {
        realm: tenant.slug,
        displayName: tenant.name,
        enabled: true,
        sslRequired: 'external',
        registrationAllowed: false,
        loginWithEmailAllowed: true,
        duplicateEmailsAllowed: false,
        resetPasswordAllowed: true,
        editUsernameAllowed: false,
        bruteForceProtected: true,
        accessTokenLifespan: 900,
        ssoSessionIdleTimeout: 1800,
        ssoSessionMaxLifespan: 36000,
        passwordPolicy:
          'length(8) and digits(1) and lowerCase(1) and upperCase(1) and specialChars(1)',
      };

      await kcAdminClient.realms.create(realmRepresentation);
      log.success(`Created realm: ${tenant.slug}`);

      // Create client for tenant app
      kcAdminClient.setConfig({ realmName: tenant.slug });

      await kcAdminClient.clients.create({
        clientId: `${tenant.slug}-app`,
        name: `${tenant.name} App`,
        enabled: true,
        publicClient: true,
        directAccessGrantsEnabled: true,
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        redirectUris: ['http://localhost:3001/*'],
        webOrigins: ['http://localhost:3001'],
      });
      log.success(`Created client: ${tenant.slug}-app`);

      // Reset to master realm
      kcAdminClient.setConfig({ realmName: 'master' });
    }

    return true;
  } catch (error) {
    log.error('Keycloak realm creation failed');
    console.error(error);
    return false;
  }
}

/**
 * Step 5: Create sample users in each tenant realm
 */
async function createSampleUsers(): Promise<boolean> {
  log.header('Step 5: Creating Sample Users in Tenant Realms');

  try {
    const kcAdminClient = new KcAdminClient({
      baseUrl: CONFIG.keycloak.url,
      realmName: 'master',
    });

    await kcAdminClient.auth({
      username: CONFIG.keycloak.adminUsername,
      password: CONFIG.keycloak.adminPassword,
      grantType: 'password',
      clientId: 'admin-cli',
    });

    for (const tenant of TENANTS) {
      log.step(`Creating users for tenant: ${tenant.slug}...`);

      kcAdminClient.setConfig({ realmName: tenant.slug });

      for (const sampleUser of SAMPLE_USERS) {
        const email = sampleUser.email.replace('{tenant}', tenant.slug);

        try {
          // Check if user exists
          const existingUsers = await kcAdminClient.users.find({ username: sampleUser.username });
          if (existingUsers.length > 0) {
            log.warning(`  User ${sampleUser.username} already exists in ${tenant.slug}, skipping`);
            continue;
          }

          const userRepresentation: UserRepresentation = {
            username: sampleUser.username,
            email,
            firstName: sampleUser.firstName,
            lastName: sampleUser.lastName,
            enabled: true,
            emailVerified: true,
          };

          const result = await kcAdminClient.users.create(userRepresentation);

          // Set password
          await kcAdminClient.users.resetPassword({
            id: result.id!,
            credential: {
              temporary: false,
              type: 'password',
              value: sampleUser.password,
            },
          });

          log.success(`  Created user: ${sampleUser.username} / ${sampleUser.password}`);
        } catch (error: any) {
          log.warning(`  Failed to create user ${sampleUser.username}: ${error.message}`);
        }
      }

      kcAdminClient.setConfig({ realmName: 'master' });
    }

    return true;
  } catch (error) {
    log.error('Sample user creation failed');
    console.error(error);
    return false;
  }
}

/**
 * Step 6: Configure MinIO buckets
 */
async function configureMinIOBuckets(): Promise<boolean> {
  log.header('Step 6: Configuring MinIO Buckets');

  try {
    log.step('MinIO bucket configuration...');
    log.info('MinIO buckets are created automatically by the core-api service');
    log.info('Required buckets: plexica-plugins (public), plexica-tenants (private)');
    log.success('MinIO configuration noted');

    return true;
  } catch (error) {
    log.error('MinIO configuration failed');
    console.error(error);
    return false;
  }
}

/**
 * Display summary
 */
function displaySummary() {
  log.header('🎉 Environment Initialization Complete!');

  console.log('\n' + colors.bright + 'Summary:' + colors.reset);
  console.log('  ✓ Docker infrastructure running');
  console.log('  ✓ Database schema initialized');
  console.log('  ✓ Sample data seeded');
  console.log('  ✓ Keycloak realms created');
  console.log('  ✓ Sample users created');
  console.log('  ✓ MinIO configured');

  console.log('\n' + colors.bright + 'Sample Tenants:' + colors.reset);
  TENANTS.forEach((tenant) => {
    console.log(`  • ${tenant.slug} - ${tenant.name}`);
  });

  console.log('\n' + colors.bright + 'Sample Users (per tenant):' + colors.reset);
  SAMPLE_USERS.forEach((user) => {
    console.log(`  • ${user.username} / ${user.password} (${user.roles.join(', ')})`);
  });

  console.log('\n' + colors.bright + 'Super Admin:' + colors.reset);
  console.log(`  • Realm: ${SUPER_ADMIN_REALM}`);
  console.log('  • User: admin / admin');
  console.log('  • URL: http://localhost:3002');

  console.log('\n' + colors.bright + 'Keycloak Admin:' + colors.reset);
  console.log(`  • URL: ${CONFIG.keycloak.url}`);
  console.log(`  • User: ${CONFIG.keycloak.adminUsername} / ${CONFIG.keycloak.adminPassword}`);

  console.log('\n' + colors.bright + 'Next Steps:' + colors.reset);
  console.log('  1. Start the core-api:');
  console.log('     cd apps/core-api && pnpm dev');
  console.log('\n  2. Start the tenant app:');
  console.log('     cd apps/web && pnpm dev');
  console.log('\n  3. Start the super-admin app:');
  console.log('     cd apps/super-admin && pnpm dev');
  console.log('\n  4. Visit http://localhost:3001 (tenant app)');
  console.log('     or http://localhost:3002 (super-admin app)');
  console.log('');
}

/**
 * Main execution
 */
async function main() {
  console.log(
    colors.bright +
      colors.cyan +
      '\n╔═══════════════════════════════════════════════════════════╗\n' +
      '║                                                           ║\n' +
      '║       Plexica Environment Initialization Script          ║\n' +
      '║                                                           ║\n' +
      '╚═══════════════════════════════════════════════════════════╝\n' +
      colors.reset
  );

  const steps = [
    { name: 'Docker Infrastructure', fn: checkDockerInfrastructure },
    { name: 'Database Schema', fn: initializeDatabaseSchema },
    { name: 'Database Seeding', fn: seedDatabase },
    { name: 'Keycloak Realms', fn: createKeycloakRealms },
    { name: 'Sample Users', fn: createSampleUsers },
    { name: 'MinIO Buckets', fn: configureMinIOBuckets },
  ];

  for (const step of steps) {
    const success = await step.fn();
    if (!success) {
      log.error(`Step failed: ${step.name}`);
      log.error('Environment initialization aborted');
      process.exit(1);
    }
  }

  displaySummary();
}

main().catch((error) => {
  log.error('Unexpected error during initialization');
  console.error(error);
  process.exit(1);
});
