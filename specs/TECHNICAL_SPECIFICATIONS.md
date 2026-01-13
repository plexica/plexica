# Plexica - Technical Specifications

## 1. System Architecture

### 1.1 Architectural Overview

Plexica is a cloud-native multi-tenant platform based on microservices that implements a plugin-based architecture. The system is designed to scale horizontally and support deployment on both Kubernetes and Docker Compose.

#### 1.1.1 Architectural Principles

- **Separation of Concerns**: Each plugin is an autonomous service
- **Multi-tenancy by Design**: Data isolation at database schema level
- **Event-Driven Architecture**: Asynchronous communication via message broker
- **API-First**: All features exposed via REST API
- **Stateless Services**: All services are stateless to facilitate scaling
- **Container-Based**: Each component runs in a dedicated container

### 1.2 Detailed Technology Stack

#### 1.2.1 Backend

| Component | Technology | Version | Rationale |
|------------|------------|----------|-----------|
| Runtime | Node.js | 20 LTS | Performance, npm ecosystem |
| Language | TypeScript | 5.x | Type safety, developer experience |
| Framework | Fastify | 4.x | Performance, native plugin system |
| ORM | Prisma | 5.x | Type-safe queries, migration management |
| Validation | Zod | 3.x | Runtime type validation |
| Testing | Vitest | 1.x | Speed, ESM compatibility |

#### 1.2.2 Database and Storage

| Component | Technology | Version | Configuration |
|------------|------------|----------|----------------|
| Database | PostgreSQL | 15+ | Multi-schema per tenant |
| Cache | Redis | 7+ | Cluster mode, persistence RDB+AOF |
| Message Broker | Redpanda | Latest | 3 broker minimum, replication factor 3 |
| Object Storage | MinIO / S3 | Latest | Bucket per tenant |
| Search | Elasticsearch | 8.x | Index per tenant |

#### 1.2.3 Infrastructure

| Component | Technology | Version | Notes |
|------------|------------|----------|------|
| Container Runtime | Docker | 24+ | BuildKit enabled |
| Orchestration | Kubernetes | 1.28+ | Or Docker Compose for dev |
| API Gateway | Kong | 3.4+ | Or Traefik 2.10+ |
| Service Mesh | Istio | 1.20+ | Optional, for prod |
| Identity Provider | Keycloak | 23+ | Realm per tenant |

#### 1.2.4 Frontend

| Component | Technology | Version | Rationale |
|------------|------------|----------|-----------|
| Framework | React | 18+ | Ecosystem, Module Federation |
| Build Tool | Vite | 5.x | Speed, HMR, Module Federation plugin |
| State Management | Zustand | 4.x | Simplicity, performance |
| UI Library | Material-UI | 5.x | Complete components, theming |
| Routing | React Router | 6.x | Dynamic routes, lazy loading |
| Forms | React Hook Form | 7.x | Performance, validation |
| i18n | i18next | 23.x | Namespace, lazy loading |

### 1.3 Core API Service Architecture

#### 1.3.1 Project Structure

```
plexica-core/
├── src/
│   ├── modules/
│   │   ├── tenant/
│   │   │   ├── tenant.controller.ts
│   │   │   ├── tenant.service.ts
│   │   │   ├── tenant.repository.ts
│   │   │   ├── tenant.schema.ts
│   │   │   └── tenant.module.ts
│   │   ├── user/
│   │   ├── team/
│   │   ├── permission/
│   │   ├── plugin/
│   │   └── auth/
│   ├── shared/
│   │   ├── database/
│   │   │   ├── prisma.service.ts
│   │   │   └── tenant-context.ts
│   │   ├── cache/
│   │   │   └── redis.service.ts
│   │   ├── events/
│   │   │   └── event-bus.service.ts
│   │   ├── storage/
│   │   │   └── storage.service.ts
│   │   └── guards/
│   │       ├── auth.guard.ts
│   │       ├── tenant.guard.ts
│   │       └── permission.guard.ts
│   ├── plugins/
│   │   ├── plugin-loader.ts
│   │   ├── plugin-registry.ts
│   │   └── plugin-proxy.ts
│   ├── config/
│   │   └── configuration.ts
│   └── main.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── package.json
├── tsconfig.json
└── Dockerfile
```

#### 1.3.2 Layer Architecture

```
┌─────────────────────────────────────────────┐
│           Controllers Layer                  │
│  (HTTP handlers, validation, serialization) │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│            Services Layer                    │
│     (Business logic, orchestration)         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          Repository Layer                    │
│       (Data access, queries)                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│           Data Layer                         │
│    (PostgreSQL, Redis, Redpanda)            │
└─────────────────────────────────────────────┘
```

#### 1.3.3 Dependency Injection

Using TypeScript decorators for DI:

```typescript
import { Injectable, Inject } from '@plexica/di';

@Injectable()
export class TenantService {
  constructor(
    private readonly tenantRepository: TenantRepository,
    private readonly eventBus: EventBus,
    private readonly keycloakService: KeycloakService,
    @Inject('STORAGE_SERVICE') private readonly storage: StorageService
  ) {}
  
  async createTenant(dto: CreateTenantDto): Promise<Tenant> {
    // Business logic
  }
}
```

---

## 2. Database Architecture

### 2.1 Schema Multi-Tenant

#### 2.1.1 Isolation Strategy

Plexica uses the **schema-per-tenant** pattern on a single PostgreSQL database:

**Advantages:**
- Complete logical isolation
- Optimal query performance (no tenant_id in WHERE)
- Granular backup/restore per tenant
- Efficient vertical scaling

**Disadvantages (mitigated):**
- PostgreSQL limit: ~10000 schemas (sufficient for use case)
- Migration overhead (resolved with automation)

#### 2.1.2 Naming Convention

```
Database: plexica

Schemas:
- core                          # Global data
- tenant_<slug>                 # Tenant data (e.g.: tenant_acme_corp)
- tenant_<slug>_plugin_<name>   # Plugin-specific data (e.g.: tenant_acme_corp_plugin_crm)
```

#### 2.1.3 Prisma Schema - Core

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["core"]
}

model Tenant {
  id        String   @id @default(uuid())
  slug      String   @unique
  name      String
  status    TenantStatus @default(PROVISIONING)
  settings  Json     @default("{}")
  theme     Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  
  plugins   TenantPlugin[]
  
  @@map("tenants")
  @@schema("core")
}

enum TenantStatus {
  PROVISIONING
  ACTIVE
  SUSPENDED
  PENDING_DELETION
  DELETED
  
  @@schema("core")
}

model Plugin {
  id          String   @id
  name        String
  version     String
  manifest    Json
  status      PluginStatus @default(AVAILABLE)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  tenantPlugins TenantPlugin[]
  
  @@map("plugins")
  @@schema("core")
}

enum PluginStatus {
  AVAILABLE
  INSTALLED
  DEPRECATED
  
  @@schema("core")
}

model TenantPlugin {
  tenantId      String
  pluginId      String
  enabled       Boolean @default(true)
  configuration Json    @default("{}")
  
  tenant        Tenant @relation(fields: [tenantId], references: [id])
  plugin        Plugin @relation(fields: [pluginId], references: [id])
  
  @@id([tenantId, pluginId])
  @@map("tenant_plugins")
  @@schema("core")
}

model SuperAdmin {
  id          String   @id @default(uuid())
  keycloakId  String   @unique @map("keycloak_id")
  email       String
  name        String?
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@map("super_admins")
  @@schema("core")
}
```

#### 2.1.4 Prisma Schema - Tenant Template

```prisma
// Template for tenant schema (generated dynamically)

model User {
  id          String   @id @default(uuid())
  keycloakId  String   @unique @map("keycloak_id")
  email       String
  name        String?
  avatarUrl   String?  @map("avatar_url")
  preferences Json     @default("{}")
  status      UserStatus @default(ACTIVE)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  teamMembers TeamMember[]
  userRoles   UserRole[]
  auditLogs   AuditLog[]
  
  @@map("users")
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

model Team {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now()) @map("created_at")
  
  members     TeamMember[]
  
  @@map("teams")
}

model TeamMember {
  teamId      String   @map("team_id")
  userId      String   @map("user_id")
  role        TeamRole @default(MEMBER)
  
  team        Team     @relation(fields: [teamId], references: [id])
  user        User     @relation(fields: [userId], references: [id])
  
  @@id([teamId, userId])
  @@map("team_members")
}

enum TeamRole {
  ADMIN
  MEMBER
}

model Role {
  id          String   @id @default(uuid())
  name        String
  description String?
  isSystem    Boolean  @default(false) @map("is_system")
  createdAt   DateTime @default(now()) @map("created_at")
  
  rolePermissions RolePermission[]
  userRoles       UserRole[]
  
  @@map("roles")
}

model Permission {
  id          String   @id @default(uuid())
  key         String   @unique
  name        String
  description String?
  pluginId    String?  @map("plugin_id")
  createdAt   DateTime @default(now()) @map("created_at")
  
  rolePermissions RolePermission[]
  
  @@map("permissions")
}

model RolePermission {
  roleId       String @map("role_id")
  permissionId String @map("permission_id")
  
  role         Role       @relation(fields: [roleId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])
  
  @@id([roleId, permissionId])
  @@map("role_permissions")
}

model UserRole {
  userId String @map("user_id")
  roleId String @map("role_id")
  
  user   User   @relation(fields: [userId], references: [id])
  role   Role   @relation(fields: [roleId], references: [id])
  
  @@id([userId, roleId])
  @@map("user_roles")
}

model Policy {
  id          String       @id @default(uuid())
  name        String
  description String?
  resource    String
  effect      PolicyEffect
  conditions  Json
  priority    Int          @default(0)
  source      PolicySource
  pluginId    String?      @map("plugin_id")
  createdAt   DateTime     @default(now()) @map("created_at")
  
  @@map("policies")
}

enum PolicyEffect {
  ALLOW
  DENY
}

enum PolicySource {
  CORE
  PLUGIN
  SUPER_ADMIN
  TENANT_ADMIN
}

model AuditLog {
  id           String   @id @default(uuid())
  userId       String?  @map("user_id")
  action       String
  resourceType String?  @map("resource_type")
  resourceId   String?  @map("resource_id")
  details      Json?
  ipAddress    String?  @map("ip_address")
  createdAt    DateTime @default(now()) @map("created_at")
  
  user         User?    @relation(fields: [userId], references: [id])
  
  @@map("audit_logs")
  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

### 2.2 Migration Management

#### 2.2.1 Core Migrations

```typescript
// src/shared/database/migration.service.ts

@Injectable()
export class MigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger
  ) {}
  
  async runCoreMigrations(): Promise<void> {
    this.logger.info('Running core migrations...');
    // Prisma migrate deploy for core schema
    await this.executeCommand('npx prisma migrate deploy');
  }
  
  async createTenantSchema(tenantSlug: string): Promise<void> {
    const schemaName = `tenant_${tenantSlug}`;
    
    // 1. Create schema
    await this.prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
    );
    
    // 2. Apply template migrations
    await this.applyTenantMigrations(schemaName);
    
    // 3. Seed initial data (base roles, core permissions)
    await this.seedTenantData(schemaName);
    
    this.logger.info(`Tenant schema created: ${schemaName}`);
  }
  
  private async applyTenantMigrations(schemaName: string): Promise<void> {
    const migrations = await this.loadTenantMigrationFiles();
    
    for (const migration of migrations) {
      const sql = migration.content.replace(/{{schema}}/g, schemaName);
      await this.prisma.$executeRawUnsafe(sql);
    }
  }
  
  async dropTenantSchema(tenantSlug: string): Promise<void> {
    const schemaName = `tenant_${tenantSlug}`;
    
    await this.prisma.$executeRawUnsafe(
      `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`
    );
    
    this.logger.info(`Tenant schema dropped: ${schemaName}`);
  }
}
```

#### 2.2.2 Plugin Migrations

Each plugin can contribute migrations for the tenant schema:

```typescript
// Plugin manifest
{
  "migrations": {
    "path": "/migrations",
    "files": [
      "001_create_contacts.sql",
      "002_create_deals.sql"
    ]
  }
}

// src/plugins/plugin-migration.service.ts

@Injectable()
export class PluginMigrationService {
  async installPluginForTenant(
    pluginId: string,
    tenantSlug: string
  ): Promise<void> {
    const plugin = await this.pluginRegistry.get(pluginId);
    const schemaName = `tenant_${tenantSlug}`;
    
    // Apply plugin migrations
    for (const migrationFile of plugin.manifest.migrations.files) {
      const sql = await this.loadPluginMigration(pluginId, migrationFile);
      const sqlWithSchema = sql.replace(/{{schema}}/g, schemaName);
      
      await this.prisma.$executeRawUnsafe(sqlWithSchema);
    }
    
    this.logger.info(`Plugin ${pluginId} installed for tenant ${tenantSlug}`);
  }
}
```

### 2.3 Tenant Context Management

#### 2.3.1 Request-Scoped Context

```typescript
// src/shared/database/tenant-context.ts

import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  schema: string;
  userId?: string;
  traceId: string;
}

export class TenantContextService {
  private static storage = new AsyncLocalStorage<TenantContext>();
  
  static run<T>(context: TenantContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }
  
  static get(): TenantContext | undefined {
    return this.storage.getStore();
  }
  
  static getOrThrow(): TenantContext {
    const context = this.get();
    if (!context) {
      throw new Error('Tenant context not found');
    }
    return context;
  }
}
```

#### 2.3.2 Prisma Tenant-Aware Client

```typescript
// src/shared/database/prisma-tenant.service.ts

@Injectable()
export class PrismaTenantService {
  constructor(private readonly prisma: PrismaService) {}
  
  getClient(): PrismaClient {
    const context = TenantContextService.getOrThrow();
    
    // Create client with specific schema
    return this.prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            // Set search_path to tenant schema
            await prisma.$executeRawUnsafe(
              `SET search_path TO "${context.schema}"`
            );
            
            return query(args);
          }
        }
      }
    });
  }
  
  // Helper for cross-schema queries (use with caution!)
  async queryCoreSchema<T>(callback: () => Promise<T>): Promise<T> {
    await this.prisma.$executeRawUnsafe(`SET search_path TO "core"`);
    try {
      return await callback();
    } finally {
      // Restore tenant schema
      const context = TenantContextService.get();
      if (context) {
        await this.prisma.$executeRawUnsafe(
          `SET search_path TO "${context.schema}"`
        );
      }
    }
  }
}
```

### 2.4 Connection Pooling

#### 2.4.1 PostgreSQL Configuration

```typescript
// config/database.config.ts

export const databaseConfig = {
  url: process.env.DATABASE_URL,
  pool: {
    min: 10,
    max: 100,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },
  log: ['query', 'error', 'warn'],
  errorFormat: 'colorless',
};
```

#### 2.4.2 PgBouncer for Connection Pooling

```ini
# pgbouncer.ini

[databases]
plexica = host=postgres port=5432 dbname=plexica

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3

server_lifetime = 3600
server_idle_timeout = 600
```

---

## 3. Caching Strategy

### 3.1 Redis Architecture

#### 3.1.1 Tenant Isolation

Each Redis key includes the tenant prefix:

```
Pattern: {tenant_id}:{resource_type}:{resource_id}:{attribute}

Examples:
- acme-corp:user:uuid-123:profile
- acme-corp:session:session-456
- acme-corp:permissions:user-789
- globex:cache:contacts:list:page-1
```

#### 3.1.2 Redis Service Implementation

```typescript
// src/shared/cache/redis.service.ts

@Injectable()
export class RedisService {
  private client: Redis;
  
  constructor(
    @Inject('REDIS_CONFIG') private config: RedisConfig
  ) {
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: 0,
      keyPrefix: '', // We manage prefix manually
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }
  
  private getTenantKey(key: string): string {
    const context = TenantContextService.get();
    if (!context) {
      throw new Error('Cannot generate tenant key without context');
    }
    return `${context.tenantSlug}:${key}`;
  }
  
  async get<T>(key: string): Promise<T | null> {
    const tenantKey = this.getTenantKey(key);
    const value = await this.client.get(tenantKey);
    return value ? JSON.parse(value) : null;
  }
  
  async set(
    key: string,
    value: any,
    ttlSeconds?: number
  ): Promise<void> {
    const tenantKey = this.getTenantKey(key);
    const serialized = JSON.stringify(value);
    
    if (ttlSeconds) {
      await this.client.setex(tenantKey, ttlSeconds, serialized);
    } else {
      await this.client.set(tenantKey, serialized);
    }
  }
  
  async del(key: string): Promise<void> {
    const tenantKey = this.getTenantKey(key);
    await this.client.del(tenantKey);
  }
  
  async invalidatePattern(pattern: string): Promise<void> {
    const tenantPattern = this.getTenantKey(pattern);
    const keys = await this.client.keys(tenantPattern);
    
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
  
  // Cache-aside pattern helper
  async remember<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }
    
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    
    return value;
  }
}
```

### 3.2 Caching Strategy per Resource

| Resource | TTL | Invalidation | Notes |
|---------|-----|---------------|------|
| User Profile | 15 min | On update | Cache to reduce DB load |
| Permissions | 5 min | On role change | Critical for authorization |
| Tenant Config | 30 min | On config update | Rarely changes |
| Plugin List | 1 hour | On plugin enable/disable | Relatively static |
| Session Data | Session lifetime | On logout | Token validation |
| API Responses | 1-5 min | On data mutation | Cache-Control headers |

### 3.3 Cache Decorators

```typescript
// src/shared/cache/cache.decorator.ts

export function Cacheable(options: {
  ttl: number;
  key: (args: any[]) => string;
}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const redis: RedisService = this.redis || this.cacheService;
      const cacheKey = options.key(args);
      
      return redis.remember(
        cacheKey,
        options.ttl,
        () => originalMethod.apply(this, args)
      );
    };
    
    return descriptor;
  };
}

// Usage
@Injectable()
export class UserService {
  @Cacheable({
    ttl: 900, // 15 min
    key: (args) => `user:${args[0]}:profile`
  })
  async getUserProfile(userId: string): Promise<UserProfile> {
    return this.userRepository.findById(userId);
  }
}
```

### 3.4 Redis Cluster Configuration

```typescript
// config/redis.config.ts

export const redisClusterConfig = {
  nodes: [
    { host: 'redis-node-1', port: 6379 },
    { host: 'redis-node-2', port: 6379 },
    { host: 'redis-node-3', port: 6379 },
  ],
  options: {
    password: process.env.REDIS_PASSWORD,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    clusterRetryStrategy: (times) => {
      return Math.min(100 * times, 2000);
    },
  },
};
```

---

## 4. Authentication & Authorization

### 4.1 Keycloak Integration

#### 4.1.1 Keycloak Service

```typescript
// src/modules/auth/keycloak.service.ts

import KcAdminClient from '@keycloak/keycloak-admin-client';

@Injectable()
export class KeycloakService {
  private adminClient: KcAdminClient;
  
  constructor(
    @Inject('KEYCLOAK_CONFIG') private config: KeycloakConfig
  ) {
    this.adminClient = new KcAdminClient({
      baseUrl: config.baseUrl,
      realmName: 'master',
    });
  }
  
  async authenticate(): Promise<void> {
    await this.adminClient.auth({
      username: this.config.adminUsername,
      password: this.config.adminPassword,
      grantType: 'password',
      clientId: 'admin-cli',
    });
  }
  
  // Realm Management
  async createRealm(tenantSlug: string): Promise<void> {
    const realmName = `tenant-${tenantSlug}`;
    
    await this.adminClient.realms.create({
      realm: realmName,
      enabled: true,
      displayName: tenantSlug,
      loginTheme: 'plexica',
      accessTokenLifespan: 300,
      ssoSessionIdleTimeout: 1800,
      ssoSessionMaxLifespan: 36000,
    });
    
    // Create client for the tenant
    await this.createRealmClients(realmName);
    
    // Configure base roles
    await this.createBaseRoles(realmName);
  }
  
  private async createRealmClients(realmName: string): Promise<void> {
    await this.adminClient.clients.create({
      realm: realmName,
      clientId: 'plexica-web',
      enabled: true,
      publicClient: true,
      redirectUris: [
        `https://*.plexica.io/*`,
        'http://localhost:3000/*'
      ],
      webOrigins: ['+'],
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
    });
    
    await this.adminClient.clients.create({
      realm: realmName,
      clientId: 'plexica-api',
      enabled: true,
      bearerOnly: true,
      standardFlowEnabled: false,
    });
  }
  
  private async createBaseRoles(realmName: string): Promise<void> {
    const roles = ['tenant_admin', 'user'];
    
    for (const roleName of roles) {
      await this.adminClient.roles.create({
        realm: realmName,
        name: roleName,
      });
    }
  }
  
  // User Management
  async createUser(
    tenantSlug: string,
    userData: CreateUserDto
  ): Promise<string> {
    const realmName = `tenant-${tenantSlug}`;
    
    const user = await this.adminClient.users.create({
      realm: realmName,
      username: userData.email,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      enabled: true,
      emailVerified: false,
      requiredActions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD'],
    });
    
    return user.id;
  }
  
  async assignRole(
    tenantSlug: string,
    userId: string,
    roleName: string
  ): Promise<void> {
    const realmName = `tenant-${tenantSlug}`;
    
    const role = await this.adminClient.roles.findOneByName({
      realm: realmName,
      name: roleName,
    });
    
    await this.adminClient.users.addRealmRoleMappings({
      realm: realmName,
      id: userId,
      roles: [{ id: role.id, name: role.name }],
    });
  }
  
  async deleteRealm(tenantSlug: string): Promise<void> {
    const realmName = `tenant-${tenantSlug}`;
    await this.adminClient.realms.del({ realm: realmName });
  }
}
```

#### 4.1.2 JWT Validation

```typescript
// src/modules/auth/jwt.service.ts

import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';

@Injectable()
export class JwtService {
  private jwksClients: Map<string, jwksClient.JwksClient> = new Map();
  
  constructor(
    @Inject('KEYCLOAK_CONFIG') private config: KeycloakConfig,
    private readonly cache: RedisService
  ) {}
  
  private getJwksClient(realm: string): jwksClient.JwksClient {
    if (!this.jwksClients.has(realm)) {
      const client = jwksClient({
        jwksUri: `${this.config.baseUrl}/realms/${realm}/protocol/openid-connect/certs`,
        cache: true,
        cacheMaxAge: 600000, // 10 min
      });
      this.jwksClients.set(realm, client);
    }
    return this.jwksClients.get(realm);
  }
  
  async verify(token: string): Promise<JwtPayload> {
    // Decode without verification to extract realm
    const decoded = jwt.decode(token, { complete: true }) as any;
    
    if (!decoded || !decoded.payload.iss) {
      throw new UnauthorizedException('Invalid token');
    }
    
    // Extract realm from issuer
    const issuerMatch = decoded.payload.iss.match(/\/realms\/([^\/]+)/);
    if (!issuerMatch) {
      throw new UnauthorizedException('Invalid issuer');
    }
    
    const realm = issuerMatch[1];
    
    // Check cache for already validated tokens
    const cacheKey = `jwt:validated:${this.hashToken(token)}`;
    const cached = await this.cache.get<JwtPayload>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Get signing key
    const client = this.getJwksClient(realm);
    const key = await client.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();
    
    // Verify token
    const payload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: `${this.config.baseUrl}/realms/${realm}`,
    }) as JwtPayload;
    
    // Cache result
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    await this.cache.set(cacheKey, payload, ttl);
    
    return payload;
  }
  
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  
  extractTenantSlug(payload: JwtPayload): string {
    const realmMatch = payload.iss.match(/\/realms\/tenant-([^\/]+)/);
    if (!realmMatch) {
      throw new UnauthorizedException('Invalid tenant realm');
    }
    return realmMatch[1];
  }
}

export interface JwtPayload {
  sub: string;
  email: string;
  iss: string;
  realm: string;
  roles: string[];
  exp: number;
  iat: number;
}
```

#### 4.1.3 Authentication Guard

```typescript
// src/shared/guards/auth.guard.ts

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Extract token
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing authorization token');
    }
    
    // Validate JWT
    const payload = await this.jwtService.verify(token);
    
    // Load user from DB
    const user = await this.userService.findByKeycloakId(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }
    
    // Enrich request
    request.user = user;
    request.jwtPayload = payload;
    request.token = token;
    
    return true;
  }
  
  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}
```

#### 4.1.4 Tenant Guard

```typescript
// src/shared/guards/tenant.guard.ts

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tenantService: TenantService
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const payload: JwtPayload = request.jwtPayload;
    
    if (!payload) {
      throw new UnauthorizedException('JWT payload not found');
    }
    
    // Extract tenant slug from JWT
    const tenantSlug = this.jwtService.extractTenantSlug(payload);
    
    // Load tenant from DB
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant is not active');
    }
    
    // Set tenant context
    const tenantContext: TenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      schema: `tenant_${tenant.slug}`,
      userId: request.user.id,
      traceId: request.headers['x-trace-id'] || randomUUID(),
    };
    
    request.tenantContext = tenantContext;
    
    // Execute handler in context
    return true;
  }
}
```

### 4.2 Permission System (RBAC + ABAC)

#### 4.2.1 Permission Service

```typescript
// src/modules/permission/permission.service.ts

@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaTenantService,
    private readonly cache: RedisService,
    private readonly policyEngine: PolicyEngineService
  ) {}
  
  async checkPermission(
    userId: string,
    permission: string,
    resource?: any
  ): Promise<boolean> {
    // 1. Check RBAC
    const hasRbacPermission = await this.checkRbacPermission(
      userId,
      permission
    );
    
    if (hasRbacPermission) {
      // 2. If RBAC OK, verify ABAC policies
      return this.policyEngine.evaluate({
        user: await this.getUserContext(userId),
        resource,
        action: permission,
      });
    }
    
    return false;
  }
  
  private async checkRbacPermission(
    userId: string,
    permission: string
  ): Promise<boolean> {
    const cacheKey = `permissions:user:${userId}`;
    
    // Cache permissions
    const permissions = await this.cache.remember(
      cacheKey,
      300, // 5 min
      async () => {
        const client = this.prisma.getClient();
        
        // Query permissions via user roles
        const userRoles = await client.userRole.findMany({
          where: { userId },
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        });

        // Flatten permissions
        const perms = new Set<string>();
        for (const ur of userRoles) {
          for (const rp of ur.role.rolePermissions) {
            perms.add(rp.permission.key);
          }
        }
        
        return Array.from(perms);
      }
    );
    
    // Check wildcard and exact match
    return this.matchesPermission(permission, permissions);
  }
  
  private matchesPermission(
    required: string,
    granted: string[]
  ): boolean {
    for (const perm of granted) {
      // Exact match
      if (perm === required) return true;
      
      // Wildcard match (e.g.: crm:* matches crm:contacts:read)
      if (perm.endsWith(':*')) {
        const prefix = perm.slice(0, -2);
        if (required.startsWith(prefix)) return true;
      }
    }
    
    return false;
  }
  
  private async getUserContext(userId: string): Promise<UserContext> {
    const client = this.prisma.getClient();
    
    const user = await client.user.findUnique({
      where: { id: userId },
      include: {
        teamMembers: {
          include: { team: true }
        }
      }
    });
    
    return {
      id: user.id,
      email: user.email,
      teams: user.teamMembers.map(tm => tm.team.id),
      primaryTeam: user.teamMembers[0]?.team.id,
    };
  }
}
```

#### 4.2.2 Policy Engine (ABAC)

```typescript
// src/modules/permission/policy-engine.service.ts

@Injectable()
export class PolicyEngineService {
  constructor(
    private readonly prisma: PrismaTenantService,
    private readonly cache: RedisService
  ) {}
  
  async evaluate(context: EvaluationContext): Promise<boolean> {
    const policies = await this.getApplicablePolicies(context.action);
    
    // Sort by priority
    const policies.sort((a, b) => b.priority - a.priority);
    
    let finalDecision = false;
    
    for (const policy of policies) {
      const matches = this.evaluateConditions(
        policy.conditions,
        context
      );
      
      if (matches) {
        if (policy.effect === 'DENY') {
          // DENY takes precedence
          return false;
        }
        finalDecision = true;
      }
    }
    
    return finalDecision;
  }
  
  private async getApplicablePolicies(
    resource: string
  ): Promise<Policy[]> {
    const cacheKey = `policies:resource:${resource}`;
    
    return this.cache.remember(
      cacheKey,
      300,
      async () => {
        const client = this.prisma.getClient();
        
        return client.policy.findMany({
          where: {
            OR: [
              { resource },
              { resource: resource.split(':')[0] + ':*' }
            ]
          }
        });
      }
    );
  }
  
  private evaluateConditions(
    conditions: any,
    context: EvaluationContext
  ): boolean {
    // Support "all" and "any" logic
    if (conditions.all) {
      return conditions.all.every(cond => 
        this.evaluateCondition(cond, context)
      );
    }
    
    if (conditions.any) {
      return conditions.any.some(cond => 
        this.evaluateCondition(cond, context)
      );
    }
    
    return this.evaluateCondition(conditions, context);
  }
  
  private evaluateCondition(
    condition: Condition,
    context: EvaluationContext
  ): boolean {
    const value = this.resolveAttribute(condition.attribute, context);
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return Array.isArray(value) && value.includes(condition.value);
      case 'in':
        return Array.isArray(condition.value) && 
               condition.value.includes(value);
      case 'greaterThan':
        return value > condition.value;
      case 'lessThan':
        return value < condition.value;
      default:
        return false;
    }
  }
  
  private resolveAttribute(
    attribute: string,
    context: EvaluationContext
  ): any {
    const parts = attribute.split('.');
    let current: any = context;
    
    for (const part of parts) {
      if (current == null) return null;
      current = current[part];
    }
    
    return current;
  }
}

interface EvaluationContext {
  user: UserContext;
  resource?: any;
  action: string;
  environment?: {
    time?: Date;
    ipAddress?: string;
  };
}

interface Condition {
  attribute: string;
  operator: 'equals' | 'contains' | 'in' | 'greaterThan' | 'lessThan';
  value: any;
}
```

#### 4.2.3 Permission Guard & Decorator

```typescript
// src/shared/guards/permission.guard.ts

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService
  ) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler()
    );
    
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    if (!user) {
      throw new UnauthorizedException();
    }
    
    // Verify at least one required permission
    for (const permission of requiredPermissions) {
      const hasPermission = await this.permissionService.checkPermission(
        user.id,
        permission,
        request.body
      );
      
      if (hasPermission) {
        return true;
      }
    }
    
    throw new ForbiddenException(
      `Required permissions: ${requiredPermissions.join(', ')}`
    );
  }
}

// Decorator
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

// Usage in controllers
@Controller('contacts')
@UseGuards(AuthGuard, TenantGuard, PermissionGuard)
export class ContactsController {
  
  @Get()
  @RequirePermissions('crm:contacts:read')
  async listContacts() {
    // ...
  }
  
  @Post()
  @RequirePermissions('crm:contacts:write')
  async createContact() {
    // ...
  }
}
```

---

## 5. Event System (Redpanda)

### 5.1 Event Bus Architecture

#### 5.1.1 Topic Strategy

```
Naming: {tenant_id}.{plugin}.{entity}.{event_type}

Examples:
- acme-corp.crm.contact.created
- acme-corp.crm.deal.won
- acme-corp.billing.invoice.created
- globex.core.user.updated
```

#### 5.1.2 Event Bus Service

```typescript
// src/shared/events/event-bus.service.ts

import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Map<string, Consumer> = new Map();
  
  constructor(
    @Inject('KAFKA_CONFIG') private config: KafkaConfig
  ) {
    this.kafka = new Kafka({
      clientId: 'plexica-core',
      brokers: config.brokers,
      ssl: config.ssl,
      sasl: config.sasl,
    });
    
    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      transactionalId: `plexica-core-${randomUUID()}`,
    });
  }
  
  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }
  
  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
    
    for (const consumer of this.consumers.values()) {
      await consumer.disconnect();
    }
  }
  
  async publish(event: DomainEvent): Promise<void> {
    const context = TenantContextService.get();
    
    const topic = this.buildTopicName(
      context?.tenantSlug || 'global',
      event.type
    );
    
    await this.producer.send({
      topic,
      messages: [{
        key: event.aggregateId,
        value: JSON.stringify(event),
        headers: {
          'event-type': event.type,
          'tenant-id': context?.tenantId || 'global',
          'trace-id': context?.traceId || randomUUID(),
          'timestamp': Date.now().toString(),
        }
      }],
    });
  }
  
  async subscribe(
    eventType: string,
    handler: EventHandler,
    options?: SubscriptionOptions
  ): Promise<void> {
    const groupId = options?.groupId || `plexica-${eventType}`;
    
    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
    
    await consumer.connect();
    
    // Subscribe to pattern to support multi-tenant
    const topicPattern = new RegExp(`.*\\.${eventType}`);
    await consumer.subscribe({
      topic: topicPattern,
      fromBeginning: options?.fromBeginning || false,
    });
    
    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload, handler);
      },
    });
    
    this.consumers.set(groupId, consumer);
  }
  
  private async handleMessage(
    payload: EachMessagePayload,
    handler: EventHandler
  ): Promise<void> {
    const { message, topic, partition } = payload;
    
    try {
      const event = JSON.parse(message.value.toString()) as DomainEvent;
      
      // Extract tenant context from headers
      const tenantId = message.headers['tenant-id']?.toString();
      const traceId = message.headers['trace-id']?.toString();
      
      if (tenantId && tenantId !== 'global') {
        // Execute handler in tenant context
        const tenant = await this.loadTenant(tenantId);
        const context: TenantContext = {
          tenantId,
          tenantSlug: tenant.slug,
          schema: `tenant_${tenant.slug}`,
          traceId,
        };
        
        await TenantContextService.run(context, async () => {
          await handler(event);
        });
      } else {
        await handler(event);
      }
      
    } catch (error) {
      this.logger.error(`Error handling event on ${topic}`, error);
      
      // Dead letter queue
      await this.publishToDeadLetter({
        originalTopic: topic,
        partition,
        offset: message.offset,
        error: error.message,
        payload: message.value.toString(),
      });
    }
  }
  
  private buildTopicName(tenantSlug: string, eventType: string): string {
    return `${tenantSlug}.${eventType}`;
  }
  
  private async publishToDeadLetter(info: any): Promise<void> {
    await this.producer.send({
      topic: 'dead-letter-queue',
      messages: [{
        value: JSON.stringify(info),
      }],
    });
  }
}

export interface DomainEvent {
  type: string;
  aggregateId: string;
  data: any;
  metadata?: {
    userId?: string;
    timestamp: number;
  };
}

export type EventHandler = (event: DomainEvent) => Promise<void>;
```

#### 5.1.3 Event Decorators

```typescript
// src/shared/events/event.decorator.ts

export const EventHandler = (eventType: string) => {
  return (target: any, propertyKey: string) => {
    // Register handler automatically
    Reflect.defineMetadata('event:type', eventType, target, propertyKey);
  };
};

// Usage
@Injectable()
export class ContactsEventHandler {
  constructor(
    private readonly notificationService: NotificationService
  ) {}
  
  @EventHandler('crm.contact.created')
  async onContactCreated(event: DomainEvent): Promise<void> {
    const contact = event.data;
    
    await this.notificationService.send({
      userId: event.metadata.userId,
      type: 'info',
      message: `New contact created: ${contact.name}`,
    });
  }
}
```

### 5.2 Event Sourcing (Optional)

For complete audit and state reconstruction:

```typescript
// src/shared/events/event-store.service.ts

@Injectable()
export class EventStoreService {
  constructor(
    private readonly prisma: PrismaTenantService
  ) {}
  
  async append(
    aggregateId: string,
    events: DomainEvent[]
  ): Promise<void> {
    const client = this.prisma.getClient();
    
    await client.eventStore.createMany({
      data: events.map((event, index) => ({
        aggregateId,
        eventType: event.type,
        eventData: event.data,
        sequence: index,
        timestamp: new Date(),
      })),
    });
  }
  
  async getEvents(
    aggregateId: string,
    fromSequence = 0
  ): Promise<DomainEvent[]> {
    const client = this.prisma.getClient();
    
    const records = await client.eventStore.findMany({
      where: {
        aggregateId,
        sequence: { gte: fromSequence },
      },
      orderBy: { sequence: 'asc' },
    });
    
    return records.map(r => ({
      type: r.eventType,
      aggregateId: r.aggregateId,
      data: r.eventData,
      metadata: { timestamp: r.timestamp.getTime() },
    }));
  }
}
```

---

## 6. Plugin System

### 6.1 Plugin Architecture

#### 6.1.1 Plugin Manifest Schema

```typescript
// src/plugins/types/plugin-manifest.ts

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  
  runtime: {
    type: 'typescript';
    image: string;
    resources: {
      cpu: string;
      memory: string;
    };
  };
  
  dependencies: Array<{
    plugin: string;
    version: string;
  }>;
  
  api: {
    basePath: string;
    healthCheck: string;
    openapi: string;
  };
  
  frontend?: {
    remoteEntry: string;
    routePrefix: string;
    exposes: Record<string, string>;
  };
  
  permissions: Array<{
    key: string;
    name: string;
    description?: string;
  }>;
  
  translations?: {
    namespaces: string[];
    supportedLocales: string[];
  };
  
  events: {
    publishes: string[];
    subscribes: string[];
  };
  
  configuration?: {
    schema: JSONSchema;
  };
  
  migrations: {
    path: string;
  };
}
```

#### 6.1.2 Plugin Registry

```typescript
// src/plugins/plugin-registry.service.ts

@Injectable()
export class PluginRegistryService {
  private plugins: Map<string, PluginMetadata> = new Map();
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisService
  ) {}
  
  async register(manifest: PluginManifest): Promise<void> {
    // Validate manifest
    await this.validateManifest(manifest);
    
    // Check dependencies
    await this.checkDependencies(manifest.dependencies);
    
    // Save in core DB
    await this.prisma.plugin.upsert({
      where: { id: manifest.id },
      create: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        manifest: manifest as any,
        status: 'AVAILABLE',
      },
      update: {
        version: manifest.version,
        manifest: manifest as any,
      },
    });
    
    // Register permissions
    await this.registerPermissions(manifest);
    
    this.plugins.set(manifest.id, {
      manifest,
      status: 'REGISTERED',
    });
    
    await this.cache.del('plugins:registry');
  }
  
  async get(pluginId: string): Promise<PluginMetadata> {
    if (this.plugins.has(pluginId)) {
      return this.plugins.get(pluginId);
    }
    
    const plugin = await this.prisma.plugin.findUnique({
      where: { id: pluginId },
    });
    
    if (!plugin) {
      throw new NotFoundException(`Plugin ${pluginId} not found`);
    }
    
    const metadata: PluginMetadata = {
      manifest: plugin.manifest as PluginManifest,
      status: plugin.status,
    };
    
    this.plugins.set(pluginId, metadata);
    return metadata;
  }
  
  async list(): Promise<PluginMetadata[]> {
    const plugins = await this.prisma.plugin.findMany();
    
    return plugins.map(p => ({
      manifest: p.manifest as PluginManifest,
      status: p.status,
    }));
  }
  
  private async validateManifest(manifest: PluginManifest): Promise<void> {
    // Validate JSON schema
    // Verify basePath is not in conflict
    // Verify permissions keys are unique
  }
  
  private async checkDependencies(
    dependencies: PluginManifest['dependencies']
  ): Promise<void> {
    for (const dep of dependencies) {
      const plugin = await this.get(dep.plugin);
      if (!plugin) {
        throw new Error(`Dependency ${dep.plugin} not found`);
      }
      
      // Verify compatible version
      if (!this.isVersionCompatible(plugin.manifest.version, dep.version)) {
        throw new Error(
          `Incompatible version for ${dep.plugin}: ` +
          `required ${dep.version}, found ${plugin.manifest.version}`
        );
      }
    }
  }
  
  private async registerPermissions(manifest: PluginManifest): Promise<void> {
    // Register permissions globally in core schema
    // These will then be copied to each tenant schema
  }
}
```

#### 6.1.3 Plugin Loader

```typescript
// src/plugins/plugin-loader.service.ts

@Injectable()
export class PluginLoaderService {
  constructor(
    private readonly registry: PluginRegistryService,
    private readonly docker: DockerService,
    private readonly k8s: KubernetesService,
    private readonly migrationService: PluginMigrationService,
    private readonly eventBus: EventBusService
  ) {}
  
  async installPlugin(
    pluginId: string,
    tenantSlug: string
  ): Promise<void> {
    const plugin = await this.registry.get(pluginId);
    const manifest = plugin.manifest;
    
    try {
      // 1. Run migrations
      await this.migrationService.installPluginForTenant(
        pluginId,
        tenantSlug
      );
      
      // 2. Copy permissions to tenant
      await this.copyPermissionsToTenant(manifest, tenantSlug);
      
      // 3. Deploy container (K8s o Docker)
      if (process.env.ORCHESTRATOR === 'kubernetes') {
        await this.k8s.deployPlugin(manifest, tenantSlug);
      } else {
        await this.docker.deployPlugin(manifest, tenantSlug);
      }
      
      // 4. Register in service discovery
      await this.registerService(manifest, tenantSlug);
      
      // 5. Subscribe to events
      await this.subscribeToEvents(manifest);
      
      // 6. Update tenant_plugins
      await this.markPluginInstalled(pluginId, tenantSlug);
      
      // 7. Emit event
      await this.eventBus.publish({
        type: 'core.plugin.installed',
        aggregateId: pluginId,
        data: { tenantSlug, pluginId },
      });
      
    } catch (error) {
      // Rollback
      await this.rollbackInstallation(pluginId, tenantSlug);
      throw error;
    }
  }
  
  async enablePlugin(
    pluginId: string,
    tenantSlug: string
  ): Promise<void> {
    const plugin = await this.registry.get(pluginId);
    
    // Start container
    if (process.env.ORCHESTRATOR === 'kubernetes') {
      await this.k8s.scalePlugin(pluginId, tenantSlug, 1);
    } else {
      await this.docker.startContainer(pluginId, tenantSlug);
    }
    
    // Update DB
    await this.prisma.tenantPlugin.update({
      where: {
        tenantId_pluginId: {
          tenantId: await this.getTenantId(tenantSlug),
          pluginId,
        },
      },
      data: { enabled: true },
    });
    
    await this.eventBus.publish({
      type: 'core.plugin.enabled',
      aggregateId: pluginId,
      data: { tenantSlug, pluginId },
    });
  }
  
  async disablePlugin(
    pluginId: string,
    tenantSlug: string
  ): Promise<void> {
    // Stop container (but keep data)
    if (process.env.ORCHESTRATOR === 'kubernetes') {
      await this.k8s.scalePlugin(pluginId, tenantSlug, 0);
    } else {
      await this.docker.stopContainer(pluginId, tenantSlug);
    }
    
    await this.prisma.tenantPlugin.update({
      where: {
        tenantId_pluginId: {
          tenantId: await this.getTenantId(tenantSlug),
          pluginId,
        },
      },
      data: { enabled: false },
    });
  }
  
  async uninstallPlugin(
    pluginId: string,
    tenantSlug: string,
    deleteData = false
  ): Promise<void> {
    // 1. Stop container
    await this.disablePlugin(pluginId, tenantSlug);
    
    // 2. Remove container
    if (process.env.ORCHESTRATOR === 'kubernetes') {
      await this.k8s.deletePlugin(pluginId, tenantSlug);
    } else {
      await this.docker.removeContainer(pluginId, tenantSlug);
    }
    
    // 3. Remove from service discovery
    await this.unregisterService(pluginId, tenantSlug);
    
    // 4. Optionally delete data
    if (deleteData) {
      await this.migrationService.uninstallPluginForTenant(
        pluginId,
        tenantSlug
      );
    }
    
    // 5. Remove from tenant_plugins
    await this.prisma.tenantPlugin.delete({
      where: {
        tenantId_pluginId: {
          tenantId: await this.getTenantId(tenantSlug),
          pluginId,
        },
      },
    });
  }
  
  private async subscribeToEvents(manifest: PluginManifest): Promise<void> {
    for (const eventType of manifest.events.subscribes) {
      await this.eventBus.subscribe(
        eventType,
        async (event) => {
          // Forward to plugin
          await this.forwardEventToPlugin(manifest.id, event);
        },
        { groupId: `plugin-${manifest.id}` }
      );
    }
  }
  
  private async forwardEventToPlugin(
    pluginId: string,
    event: DomainEvent
  ): Promise<void> {
    // Call plugin webhook to notify event
    const pluginUrl = await this.getPluginUrl(pluginId);
    
    await axios.post(`${pluginUrl}/events`, event, {
      headers: {
        'Content-Type': 'application/json',
        'X-Event-Type': event.type,
      },
    });
  }
}
```

### 6.2 Plugin SDK

#### 6.2.1 TypeScript SDK

```typescript
// @plexica/sdk/src/plugin.ts

export abstract class PlexicaPlugin {
  protected db: DatabaseClient;
  protected cache: CacheClient;
  protected events: EventClient;
  protected storage: StorageClient;
  protected http: HttpClient;
  
  constructor(private readonly context: PluginContext) {
    this.initializeClients();
  }
  
  private initializeClients(): void {
    this.db = new DatabaseClient(this.context);
    this.cache = new CacheClient(this.context);
    this.events = new EventClient(this.context);
    this.storage = new StorageClient(this.context);
    this.http = new HttpClient(this.context);
  }
  
  // Lifecycle hooks
  abstract onInstall?(context: TenantContext): Promise<void>;
  abstract onEnable?(context: TenantContext): Promise<void>;
  abstract onDisable?(context: TenantContext): Promise<void>;
  abstract onUninstall?(context: TenantContext): Promise<void>;
  
  // Helper to publish events
  protected async publishEvent(
    eventType: string,
    data: any
  ): Promise<void> {
    await this.events.publish({
      type: `${this.context.pluginId}.${eventType}`,
      aggregateId: data.id || randomUUID(),
      data,
    });
  }
  
  // Helper to call other plugins
  protected async callPlugin(
    pluginId: string,
    path: string,
    options?: RequestOptions
  ): Promise<any> {
    return this.http.request(pluginId, path, options);
  }
}
```

---

## 7. Frontend Architecture

### 7.1 Module Federation Setup

#### 7.1.1 Shell Application (Host)

```typescript
// apps/web/vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'web',
      remotes: {
        // Configured dynamically at runtime
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        'react-router-dom': { singleton: true },
        '@mui/material': { singleton: true },
        zustand: { singleton: true },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});
```

```typescript
// apps/web/src/plugins/plugin-loader.ts

export class PluginLoader {
  private loadedPlugins: Map<string, any> = new Map();
  
  async loadPlugin(manifest: PluginManifest): Promise<void> {
    const remoteEntry = manifest.frontend.remoteEntry;
    
    // Dynamic import of remote
    const container = await this.loadRemoteContainer(remoteEntry);
    
    // Initialize shared scope
    await container.init(__webpack_share_scopes__.default);
    
    // Load exposes
    const exports = {};
    for (const [name, path] of Object.entries(manifest.frontend.exposes)) {
      const factory = await container.get(path);
      exports[name] = factory();
    }
    
    this.loadedPlugins.set(manifest.id, exports);
  }
  
  private async loadRemoteContainer(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.type = 'text/javascript';
      script.async = true;
      
      script.onload = () => {
        const container = (window as any)[this.getContainerName(url)];
        resolve(container);
      };
      
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  
  getPlugin(pluginId: string): any {
    return this.loadedPlugins.get(pluginId);
  }
}
```

#### 7.1.2 Plugin Frontend (Remote)

```typescript
// apps/plugins/crm/vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'crm',
      filename: 'remoteEntry.js',
      exposes: {
        './ContactsPage': './src/pages/ContactsPage',
        './DealsPage': './src/pages/DealsPage',
        './ContactWidget': './src/widgets/ContactWidget',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        'react-router-dom': { singleton: true },
        '@mui/material': { singleton: true },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: true,
    cssCodeSplit: false,
  },
});
```

### 7.2 Dynamic Routing

```typescript
// apps/web/src/router/dynamic-routes.tsx

export function useDynamicRoutes() {
  const [routes, setRoutes] = useState<RouteObject[]>([]);
  const { plugins } = usePlugins();
  const pluginLoader = usePluginLoader();
  
  useEffect(() => {
    async function loadRoutes() {
      const dynamicRoutes: RouteObject[] = [];
      
      for (const plugin of plugins) {
        if (!plugin.frontend) continue;
        
        // Load plugin
        await pluginLoader.loadPlugin(plugin);
        
        // Create routes
        for (const [name, component] of Object.entries(plugin.frontend.exposes)) {
          if (name.endsWith('Page')) {
            const path = `/${plugin.frontend.routePrefix}/${kebabCase(name.replace('Page', ''))}`;
            
            dynamicRoutes.push({
              path,
              element: React.createElement(
                React.lazy(() => pluginLoader.getPlugin(plugin.id)[name])
              ),
            });
          }
        }
      }
      
      setRoutes(dynamicRoutes);
    }
    
    loadRoutes();
  }, [plugins]);
  
  return routes;
}

// App.tsx
function App() {
  const dynamicRoutes = useDynamicRoutes();
  
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="settings" element={<Settings />} />
          
          {/* Dynamic routes from plugins */}
          {dynamicRoutes.map(route => (
            <Route key={route.path} {...route} />
          ))}
          
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Router>
  );
}
```

### 7.3 Shared Context

```typescript
// apps/web/src/context/plexica-context.tsx

interface PlexicaContextValue {
  user: User;
  tenant: Tenant;
  permissions: string[];
  theme: Theme;
  api: ApiClient;
  eventBus: FrontendEventBus;
}

const PlexicaContext = createContext<PlexicaContextValue>(null);

export function PlexicaProvider({ children }: PropsWithChildren) {
  const { data: session } = useSession();
  const { data: tenant } = useTenant();
  const { data: permissions } = usePermissions();
  
  const api = useMemo(() => new ApiClient({
    baseUrl: import.meta.env.VITE_API_URL,
    token: session?.accessToken,
  }), [session]);
  
  const eventBus = useMemo(() => new FrontendEventBus(), []);
  
  const theme = useMemo(() => createTheme({
    palette: {
      primary: { main: tenant?.theme?.colors?.primary || '#1976d2' },
      secondary: { main: tenant?.theme?.colors?.secondary || '#dc004e' },
    },
  }), [tenant]);
  
  return (
    <PlexicaContext.Provider value={{
      user: session?.user,
      tenant,
      permissions,
      theme,
      api,
      eventBus,
    }}>
      <ThemeProvider theme={theme}>
        {children}
      </ThemeProvider>
    </PlexicaContext.Provider>
  );
}

export const usePlexica = () => useContext(PlexicaContext);
```

### 7.4 API Client

```typescript
// packages/api-client/src/api-client.ts

export class ApiClient {
  constructor(private config: ApiClientConfig) {}
  
  async request<T>(
    method: string,
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    
    if (!response.ok) {
      throw new ApiError(response.status, await response.json());
    }
    
    return response.json();
  }
  
  // Helper methods
  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, options);
  }
  
  post<T>(path: string, body: any, options?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }
  
  put<T>(path: string, body: any, options?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }
  
  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }
}
```

---

## 8. API Gateway Configuration

### 8.1 Kong Configuration

```yaml
# kong.yml

_format_version: "3.0"

services:
  - name: core-api
    url: http://core-api:3000
    routes:
      - name: core-routes
        paths:
          - /api/core
        strip_path: true
    plugins:
      - name: jwt
        config:
          uri_param_names: []
          cookie_names: []
          key_claim_name: kid
          secret_is_base64: false
      - name: rate-limiting
        config:
          minute: 100
          policy: redis
          redis_host: redis
      - name: correlation-id
        config:
          header_name: X-Trace-ID
          generator: uuid
      - name: request-transformer
        config:
          add:
            headers:
              - X-Tenant-ID: $(jwt.tenant_id)
              - X-User-ID: $(jwt.sub)

  - name: plugin-crm
    url: http://plugin-crm:3000
    routes:
      - name: crm-routes
        paths:
          - /api/plugins/crm
        strip_path: true
    plugins:
      - name: jwt
      - name: rate-limiting
        config:
          minute: 100
```

### 8.2 Traefik Configuration

```yaml
# traefik.yml

http:
  routers:
    core-api:
      rule: "PathPrefix(`/api/core`)"
      service: core-api
      middlewares:
        - auth
        - tenant-context
        - rate-limit
    
    plugin-crm:
      rule: "PathPrefix(`/api/plugins/crm`)"
      service: plugin-crm
      middlewares:
        - auth
        - tenant-context
        - rate-limit
  
  services:
    core-api:
      loadBalancer:
        servers:
          - url: "http://core-api:3000"
    
    plugin-crm:
      loadBalancer:
        servers:
          - url: "http://plugin-crm:3000"
  
  middlewares:
    auth:
      plugin:
        jwt:
          jwksUrl: "http://keycloak:8080/realms/{realm}/protocol/openid-connect/certs"
    
    tenant-context:
      headers:
        customRequestHeaders:
          X-Tenant-ID: "{{ .JWT.tenant_id }}"
          X-User-ID: "{{ .JWT.sub }}"
    
    rate-limit:
      rateLimit:
        average: 100
        period: 1m
```

---

## 9. Deployment Strategies

### 9.1 Kubernetes Deployment

#### 9.1.1 Core API Deployment

```yaml
# k8s/core-api/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: core-api
  namespace: plexica
spec:
  replicas: 3
  selector:
    matchLabels:
      app: core-api
  template:
    metadata:
      labels:
        app: core-api
    spec:
      containers:
        - name: core-api
          image: plexica/core-api:1.0.0
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: plexica-secrets
                  key: database-url
            - name: REDIS_URL
              value: "redis://redis-cluster:6379"
            - name: KAFKA_BROKERS
              value: "redpanda-0.redpanda:9092,redpanda-1.redpanda:9092"
            - name: KEYCLOAK_URL
              value: "http://keycloak:8080"
          resources:
            requests:
              cpu: 500m
              memory: 512Mi
            limits:
              cpu: 1000m
              memory: 1Gi
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: core-api
  namespace: plexica
spec:
  selector:
    app: core-api
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

#### 9.1.2 Plugin Deployment Template

```yaml
# k8s/plugins/crm/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: plugin-crm
  namespace: plexica
  labels:
    plugin: crm
spec:
  replicas: 2
  selector:
    matchLabels:
      app: plugin-crm
  template:
    metadata:
      labels:
        app: plugin-crm
        plugin: crm
    spec:
      containers:
        - name: crm
          image: plexica/plugin-crm:1.2.0
          ports:
            - containerPort: 3000
          env:
            - name: CORE_API_URL
              value: "http://core-api:3000"
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: plexica-secrets
                  key: database-url
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: plugin-crm
  namespace: plexica
spec:
  selector:
    app: plugin-crm
  ports:
    - port: 3000
      targetPort: 3000
```

#### 9.1.3 Helm Chart Structure

```
plexica-helm/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── core/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   ├── configmap.yaml
│   │   └── secret.yaml
│   ├── gateway/
│   │   ├── kong.yaml
│   │   └── ingress.yaml
│   ├── database/
│   │   ├── postgresql.yaml
│   │   └── pgbouncer.yaml
│   ├── cache/
│   │   └── redis-cluster.yaml
│   ├── messaging/
│   │   └── redpanda.yaml
│   └── plugins/
│       └── _plugin-template.yaml
```

### 9.2 Docker Compose per Development

```yaml
# docker-compose.dev.yml

version: '3.8'

services:
  # Database
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: plexica
      POSTGRES_USER: plexica
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U plexica"]
      interval: 10s
      timeout: 5s
      retries: 5
  
  # Cache
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
  
  # Message Broker
  redpanda:
    image: docker.redpanda.com/redpandadata/redpanda:latest
    command:
      - redpanda
      - start
      - --kafka-addr internal://0.0.0.0:9092,external://0.0.0.0:19092
      - --advertise-kafka-addr internal://redpanda:9092,external://localhost:19092
      - --pandaproxy-addr internal://0.0.0.0:8082,external://0.0.0.0:18082
      - --advertise-pandaproxy-addr internal://redpanda:8082,external://localhost:18082
      - --schema-registry-addr internal://0.0.0.0:8081,external://0.0.0.0:18081
      - --rpc-addr redpanda:33145
      - --advertise-rpc-addr redpanda:33145
      - --smp 1
      - --memory 1G
    ports:
      - "18081:18081"
      - "18082:18082"
      - "19092:19092"
      - "19644:9644"
    volumes:
      - redpanda_data:/var/lib/redpanda/data
  
  # Identity Provider
  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres:5432/plexica
      KC_DB_USERNAME: plexica
      KC_DB_PASSWORD: dev_password
      KC_HOSTNAME: localhost
      KC_HTTP_PORT: 8080
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    command: start-dev
  
  # Object Storage
  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: plexica
      MINIO_ROOT_PASSWORD: plexica123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
  
  # Core API
  core-api:
    build:
      context: ./apps/core-api
      dockerfile: Dockerfile.dev
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://plexica:dev_password@postgres:5432/plexica
      REDIS_URL: redis://redis:6379
      KAFKA_BROKERS: redpanda:9092
      KEYCLOAK_URL: http://keycloak:8080
      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_ACCESS_KEY: plexica
      STORAGE_SECRET_KEY: plexica123
    ports:
      - "3000:3000"
    volumes:
      - ./apps/core-api:/app
      - /app/node_modules
    depends_on:
      - postgres
      - redis
      - redpanda
      - keycloak
      - minio
    command: npm run dev
  
  # API Gateway
  kong:
    image: kong:3.4-alpine
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /kong/kong.yml
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
      KONG_ADMIN_ERROR_LOG: /dev/stderr
      KONG_ADMIN_LISTEN: 0.0.0.0:8001
    ports:
      - "8000:8000"
      - "8443:8443"
      - "8001:8001"
    volumes:
      - ./config/kong.yml:/kong/kong.yml
    depends_on:
      - core-api
  
  # Frontend Shell
  frontend:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.dev
    environment:
      VITE_API_URL: http://localhost:8000
      VITE_KEYCLOAK_URL: http://localhost:8080
    ports:
      - "5173:5173"
    volumes:
      - ./apps/web:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres_data:
  redis_data:
  redpanda_data:
  minio_data:
```

---

## 10. Monitoring & Observability

### 10.1 Logging

#### 10.1.1 Structured Logger

```typescript
// src/shared/logger/logger.service.ts

import * as winston from 'winston';

@Injectable()
export class Logger {
  private logger: winston.Logger;
  
  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'plexica-core',
        version: process.env.APP_VERSION,
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });
  }
  
  private enrichContext(): Record<string, any> {
    const context = TenantContextService.get();
    return {
      tenant_id: context?.tenantId,
      tenant_slug: context?.tenantSlug,
      user_id: context?.userId,
      trace_id: context?.traceId,
    };
  }
  
  info(message: string, meta?: any): void {
    this.logger.info(message, { ...this.enrichContext(), ...meta });
  }
  
  error(message: string, error?: Error, meta?: any): void {
    this.logger.error(message, {
      ...this.enrichContext(),
      error: {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      },
      ...meta,
    });
  }
  
  warn(message: string, meta?: any): void {
    this.logger.warn(message, { ...this.enrichContext(), ...meta });
  }
  
  debug(message: string, meta?: any): void {
    this.logger.debug(message, { ...this.enrichContext(), ...meta });
  }
}
```

### 10.2 Metrics (Prometheus)

```typescript
// src/shared/metrics/metrics.service.ts

import { Counter, Histogram, Gauge, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private registry: Registry;
  
  // Counters
  private httpRequestsTotal: Counter;
  private eventsPublished: Counter;
  private eventsConsumed: Counter;
  
  // Histograms
  private httpRequestDuration: Histogram;
  private dbQueryDuration: Histogram;
  
  // Gauges
  private activeTenants: Gauge;
  private activePlugins: Gauge;
  
  constructor() {
    this.registry = new Registry();
    this.initializeMetrics();
  }
  
  private initializeMetrics(): void {
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status', 'tenant_id'],
      registers: [this.registry],
    });
    
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Duration of database queries in seconds',
      labelNames: ['operation', 'table'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
      registers: [this.registry],
    });
    
    this.eventsPublished = new Counter({
      name: 'events_published_total',
      help: 'Total number of events published',
      labelNames: ['event_type', 'tenant_id'],
      registers: [this.registry],
    });
    
    this.activeTenants = new Gauge({
      name: 'active_tenants',
      help: 'Number of active tenants',
      registers: [this.registry],
    });
  }
  
  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    duration: number,
    tenantId?: string
  ): void {
    this.httpRequestsTotal.inc({
      method,
      route,
      status,
      tenant_id: tenantId || 'none',
    });
    
    this.httpRequestDuration.observe(
      { method, route, status },
      duration / 1000
    );
  }
  
  recordDbQuery(operation: string, table: string, duration: number): void {
    this.dbQueryDuration.observe(
      { operation, table },
      duration / 1000
    );
  }
  
  recordEventPublished(eventType: string, tenantId?: string): void {
    this.eventsPublished.inc({
      event_type: eventType,
      tenant_id: tenantId || 'global',
    });
  }
  
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

### 10.3 Distributed Tracing (OpenTelemetry)

```typescript
// src/shared/tracing/tracing.service.ts

import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export class TracingService {
  private provider: NodeTracerProvider;
  
  constructor() {
    this.provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'plexica-core',
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION,
      }),
    });
    
    const exporter = new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT,
    });
    
    this.provider.addSpanProcessor(
      new BatchSpanProcessor(exporter)
    );
    
    this.provider.register();
  }
  
  async traceAsync<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, any>
  ): Promise<T> {
    const tracer = trace.getTracer('plexica-core');
    const span = tracer.startSpan(name, {
      attributes: {
        ...attributes,
        ...this.getTenantAttributes(),
      },
    });
    
    try {
      const result = await context.with(
        trace.setSpan(context.active(), span),
        fn
      );
      
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }
  
  private getTenantAttributes(): Record<string, string> {
    const ctx = TenantContextService.get();
    return {
      'tenant.id': ctx?.tenantId || 'none',
      'tenant.slug': ctx?.tenantSlug || 'none',
      'user.id': ctx?.userId || 'none',
    };
  }
}
```

### 10.4 Health Checks

```typescript
// src/health/health.controller.ts

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafka: KafkaHealthService
  ) {}
  
  @Get()
  async check(): Promise<HealthCheckResult> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkKafka(),
      this.checkKeycloak(),
    ]);
    
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: this.getCheckResult(checks[0]),
        redis: this.getCheckResult(checks[1]),
        kafka: this.getCheckResult(checks[2]),
        keycloak: this.getCheckResult(checks[3]),
      },
    };
    
    const allHealthy = Object.values(results.checks).every(c => c.healthy);
    results.status = allHealthy ? 'healthy' : 'unhealthy';
    
    return results;
  }
  
  @Get('ready')
  async readiness(): Promise<{ ready: boolean }> {
    // Check if the service is ready to receive traffic
    const ready = await this.checkDatabase();
    return { ready: ready.healthy };
  }
  
  private async checkDatabase(): Promise<HealthCheck> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { healthy: true, responseTime: 0 };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
  
  private async checkRedis(): Promise<HealthCheck> {
    try {
      const start = Date.now();
      await this.redis.ping();
      return { healthy: true, responseTime: Date.now() - start };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
  
  private async checkKafka(): Promise<HealthCheck> {
    try {
      const healthy = await this.kafka.checkHealth();
      return { healthy };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }
}
```

---

## 11. Security Best Practices

### 11.1 Input Validation

```typescript
// Uso di Zod per validazione runtime

const CreateContactSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
  company: z.string().max(255).optional(),
});

@Post('/contacts')
@RequirePermissions('crm:contacts:write')
async createContact(@Body() body: unknown): Promise<Contact> {
  // Validate & parse
  const data = CreateContactSchema.parse(body);
  
  // Sanitize
  const sanitized = {
    name: sanitizeHtml(data.name),
    email: data.email.toLowerCase().trim(),
    phone: data.phone,
    company: data.company ? sanitizeHtml(data.company) : null,
  };
  
  return this.contactsService.create(sanitized);
}
```

### 11.2 SQL Injection Prevention

```typescript
// ALWAYS use parameterized queries

// ❌ VULNERABLE
const users = await prisma.$queryRawUnsafe(
  `SELECT * FROM users WHERE email = '${email}'`
);

// ✅ SAFE
const users = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${email}
`;

// ✅ SAFE with Prisma ORM
const users = await prisma.user.findMany({
  where: { email }
});
```

### 11.3 Rate Limiting

```typescript
// src/shared/guards/rate-limit.guard.ts

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = this.getRateLimitKey(request);
    
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, 60); // 1 minute window
    }
    
    const limit = this.getLimit(request);
    
    if (current > limit) {
      throw new TooManyRequestsException(
        `Rate limit exceeded: ${limit} requests per minute`
      );
    }
    
    return true;
  }
  
  private getRateLimitKey(request: Request): string {
    const tenantId = request.tenantContext?.tenantId || 'global';
    const userId = request.user?.id || request.ip;
    const route = request.route.path;
    
    return `rate_limit:${tenantId}:${userId}:${route}`;
  }
  
  private getLimit(request: Request): number {
    // Different limits for tenant/user/route
    const isPremium = request.tenantContext?.tenant?.plan === 'premium';
    return isPremium ? 1000 : 100;
  }
}
```

### 11.4 CORS Configuration

```typescript
// src/main.ts

app.enableCors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://app.plexica.io',
      'https://*.plexica.io',
      /\.plexica\.io$/,
    ];
    
    if (!origin || allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === origin;
      }
      return allowed.test(origin);
    })) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Tenant-ID',
    'X-Trace-ID',
  ],
});
```

### 11.5 Secrets Management

```typescript
// config/secrets.config.ts

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export class SecretsManager {
  private ssmClient: SSMClient;
  private cache: Map<string, { value: string; expiry: number }> = new Map();
  
  constructor() {
    this.ssmClient = new SSMClient({ region: process.env.AWS_REGION });
  }
  
  async getSecret(key: string): Promise<string> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    
    // Fetch from SSM Parameter Store
    const command = new GetParameterCommand({
      Name: `/plexica/${process.env.NODE_ENV}/${key}`,
      WithDecryption: true,
    });
    
    const response = await this.ssmClient.send(command);
    const value = response.Parameter.Value;
    
    // Cache for 5 minutes
    this.cache.set(key, {
      value,
      expiry: Date.now() + 300000,
    });
    
    return value;
  }
}
```

---

## 12. Testing Strategy

### 12.1 Unit Tests

```typescript
// src/modules/tenant/tenant.service.spec.ts

describe('TenantService', () => {
  let service: TenantService;
  let mockRepository: jest.Mocked<TenantRepository>;
  let mockKeycloak: jest.Mocked<KeycloakService>;
  
  beforeEach(() => {
    mockRepository = createMock<TenantRepository>();
    mockKeycloak = createMock<KeycloakService>();
    
    service = new TenantService(
      mockRepository,
      mockKeycloak,
      // ... other deps
    );
  });
  
  describe('createTenant', () => {
    it('should create tenant with all provisioning steps', async () => {
      const dto = {
        slug: 'test-corp',
        name: 'Test Corp',
      };
      
      mockRepository.create.mockResolvedValue({
        id: 'tenant-123',
        ...dto,
        status: 'PROVISIONING',
      });
      
      const result = await service.createTenant(dto);
      
      expect(result.status).toBe('ACTIVE');
      expect(mockKeycloak.createRealm).toHaveBeenCalledWith('test-corp');
      expect(mockRepository.update).toHaveBeenCalledWith(
        'tenant-123',
        { status: 'ACTIVE' }
      );
    });
    
    it('should rollback on keycloak failure', async () => {
      mockKeycloak.createRealm.mockRejectedValue(
        new Error('Keycloak error')
      );
      
      await expect(
        service.createTenant({ slug: 'test', name: 'Test' })
      ).rejects.toThrow('Keycloak error');
      
      expect(mockRepository.delete).toHaveBeenCalled();
    });
  });
});
```

### 12.2 Integration Tests

```typescript
// tests/integration/api/contacts.test.ts

describe('Contacts API (Integration)', () => {
  let app: INestApplication;
  let authToken: string;
  
  beforeAll(async () => {
    app = await createTestApp();
    await app.init();
    
    
    // Setup test tenant & user
    authToken = await setupTestUser(app);
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  describe('POST /api/plugins/crm/contacts', () => {
    it('should create contact with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/plugins/crm/contacts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'John Doe',
          email: 'john@example.com',
        })
        .expect(201);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: 'John Doe',
        email: 'john@example.com',
      });
    });
    
    it('should reject without permission', async () => {
      const limitedToken = await setupUserWithoutPermission(app);
      
      await request(app.getHttpServer())
        .post('/api/plugins/crm/contacts')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ name: 'Test', email: 'test@example.com' })
        .expect(403);
    });
  });
});
```

### 12.3 E2E Tests

```typescript
// tests/e2e/tenant-provisioning.test.ts

describe('Tenant Provisioning (E2E)', () => {
  it('should provision complete tenant environment', async () => {
    // 1. Create tenant via Super Admin API
    const tenant = await superAdminClient.post('/tenants', {
      slug: 'e2e-test',
      name: 'E2E Test Corp',
    });
    
    expect(tenant.status).toBe('ACTIVE');
    
    // 2. Verify database schema created
    const schemas = await prisma.$queryRaw`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name = 'tenant_e2e-test'
    `;
    expect(schemas).toHaveLength(1);
    
    // 3. Verify Keycloak realm created
    const realm = await keycloakAdmin.realms.findOne({
      realm: 'tenant-e2e-test'
    });
    expect(realm).toBeDefined();
    
    // 4. Verify storage bucket created
    const buckets = await minioClient.listBuckets();
    expect(buckets.some(b => b.name === 'tenant-e2e-test')).toBe(true);
    
    // 5. Create user and verify login
    await superAdminClient.post(`/tenants/${tenant.id}/users`, {
      email: 'admin@e2e-test.com',
      name: 'Admin User',
    });
    
    const token = await loginUser('admin@e2e-test.com', 'password');
    expect(token).toBeDefined();
    
    // 6. Install plugin
    await tenantAdminClient.post(`/plugins/crm/install`);
    
    // 7. Verify plugin tables created
    const tables = await prisma.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'tenant_e2e-test'
      AND table_name LIKE 'crm_%'
    `;
    expect(tables.length).toBeGreaterThan(0);
    
    // Cleanup
    await superAdminClient.delete(`/tenants/${tenant.id}`);
  });
});
```

---

## 13. Performance Optimization

### 13.1 Database Optimization

```sql
-- Critical indexes for performance

-- Core schema
CREATE INDEX idx_tenants_slug ON core.tenants(slug);
CREATE INDEX idx_tenants_status ON core.tenants(status);

-- Tenant schema (template)
CREATE INDEX idx_users_keycloak_id ON users(keycloak_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### 13.2 Query Optimization

```typescript
// ❌ N+1 Query Problem
const users = await prisma.user.findMany();
for (const user of users) {
  const roles = await prisma.userRole.findMany({
    where: { userId: user.id }
  });
  user.roles = roles;
}

// ✅ Eager Loading
const users = await prisma.user.findMany({
  include: {
    userRoles: {
      include: {
        role: true
      }
    }
  }
});

// ✅ Pagination
const contacts = await prisma.contact.findMany({
  skip: (page - 1) * limit,
  take: limit,
  orderBy: { createdAt: 'desc' },
});
```

### 13.3 Caching Strategy

```typescript
// Multi-level caching

// L1: In-memory (per request)
const requestCache = new Map();

// L2: Redis (shared)
const redisCache = new RedisService();

// L3: Database (source of truth)
async function getUser(userId: string): Promise<User> {
  // L1 check
  if (requestCache.has(userId)) {
    return requestCache.get(userId);
  }
  
  // L2 check
  const cached = await redisCache.get<User>(`user:${userId}`);
  if (cached) {
    requestCache.set(userId, cached);
    return cached;
  }
  
  // L3 fetch
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });
  
  // Populate caches
  await redisCache.set(`user:${userId}`, user, 900); // 15 min
  requestCache.set(userId, user);
  
  return user;
}
```

---

## 14. CI/CD Pipeline

### 14.1 GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml

name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: plexica_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run linter
        run: npm run lint
      
      - name: Run type check
        run: npm run type-check
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/plexica_test
          REDIS_URL: redis://localhost:6379
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      
      - name: Login to Container Registry
        uses: docker/login-action@v2
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Build and push Core API
        uses: docker/build-push-action@v4
        with:
          context: ./apps/core-api
          push: true
          tags: ghcr.io/plexica/core-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      
      - name: Build and push Frontend
        uses: docker/build-push-action@v4
        with:
          context: ./apps/web
          push: true
          tags: ghcr.io/plexica/frontend:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure kubectl
        uses: azure/k8s-set-context@v3
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBE_CONFIG }}
      
      - name: Deploy to Kubernetes
        run: |
          helm upgrade --install plexica ./plexica-helm \
            --set image.tag=${{ github.sha }} \
            --namespace plexica \
            --create-namespace
      
      - name: Verify deployment
        run: |
          kubectl rollout status deployment/core-api -n plexica
          kubectl rollout status deployment/frontend -n plexica
```

---

## 15. Conclusions

### 15.1 Pre-Production Checklist

- [ ] Database migrations tested
- [ ] Automated backups configured
- [ ] Monitoring and alerting active
- [ ] Rate limiting configured
- [ ] HTTPS/TLS enabled
- [ ] Secrets managed via vault
- [ ] Structured logging active
- [ ] Health checks implemented
- [ ] Disaster recovery plan documented
- [ ] Security audit completed
- [ ] Load testing executed
- [ ] Documentation updated

### 15.2 Target Metrics

| Metric | Target | Measurement |
|---------|--------|-------------|
| API Response Time (p95) | < 500ms | Prometheus |
| API Response Time (p99) | < 1000ms | Prometheus |
| Database Query Time (p95) | < 100ms | Prometheus |
| Availability | 99.9% | Uptime monitoring |
| Error Rate | < 0.1% | Logs aggregation |
| Tenant Provisioning Time | < 30s | Custom metric |
| Plugin Install Time | < 60s | Custom metric |

### 15.3 Technical Roadmap

**Q1 2025**
- Core platform implementation
- Base multi-tenancy
- MVP plugin system
- Docker Compose deployment
- ABAC policy engine
- Frontend Module Federation

**Q2 2025**
- Kubernetes deployment
- Performance optimization
- Advanced plugin capabilities
- Plugin marketplace

**Q3 2025**
- Horizontal scaling optimization
- Multi-region support
- Advanced monitoring

**Q4 2025**
- Self-service tenant provisioning
- Enterprise features
- Compliance certifications (SOC2, ISO27001)

---

*Plexica Technical Document v1.0*  
*Last updated: January 2025*  
*Author: Plexica Engineering Team*
