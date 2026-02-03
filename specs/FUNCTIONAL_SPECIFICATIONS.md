# Plexica - Functional Specifications

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Functional Specifications

## Table of Contents

- [1. Project Overview](#1-project-overview)
  - [1.1 Vision](#11-vision)
  - [1.2 Main Objectives](#12-main-objectives)
  - [1.3 Technology Stack](#13-technology-stack)
- [2. System Architecture](#2-system-architecture)
  - [2.1 Core Components](#21-core-components)
  - [2.2 Core API Service](#22-core-api-service)
  - [2.3 Request Flow](#23-request-flow)
- [3. Multi-Tenancy](#3-multi-tenancy)
  - [3.1 Isolation Model](#31-isolation-model)
  - [3.2 Tenant Lifecycle](#32-tenant-lifecycle)
    - [Tenant States](#tenant-states)
    - [Automatic Provisioning](#automatic-provisioning)
  - [3.3 Per-Tenant Configuration](#33-per-tenant-configuration)
- [4. Authentication System](#4-authentication-system)
  - [4.1 Keycloak Architecture](#41-keycloak-architecture)
  - [4.2 Keycloak Roles (Base)](#42-keycloak-roles-base)
  - [4.3 JWT Token Structure](#43-jwt-token-structure)
  - [4.4 Keycloak - Internal Database Sync](#44-keycloak---internal-database-sync)
- [5. Authorization System (RBAC + ABAC)](#5-authorization-system-rbac--abac)
  - [5.1 Hybrid Model](#51-hybrid-model)
  - [5.2 RBAC - Role Based Access Control](#52-rbac---role-based-access-control)
    - [RBAC Entities](#rbac-entities)
    - [Permission Schema](#permission-schema)
    - [System Roles (Built-in)](#system-roles-built-in)
  - [5.3 ABAC - Attribute Based Access Control](#53-abac---attribute-based-access-control)
    - [Policy Engine](#policy-engine)
    - [Available Attributes](#available-attributes)
    - [Policy Sources](#policy-sources)
  - [5.4 Authorization Flow](#54-authorization-flow)
  - [5.5 Plugin-Contributed Permissions](#55-plugin-contributed-permissions)
- [6. Workspaces and Organization](#6-workspaces-and-organization)
  - [6.1 Workspace Hierarchy](#61-workspace-hierarchy)
  - [6.2 Workspace vs Tenant](#62-workspace-vs-tenant)
  - [6.3 Workspace Features](#63-workspace-features)
    - [6.3.1 Workspace Properties](#631-workspace-properties)
    - [6.3.2 Workspace Roles](#632-workspace-roles)
    - [6.3.3 Workspace Isolation](#633-workspace-isolation)
  - [6.4 Team Structure](#64-team-structure)
    - [6.4.1 Team Membership](#641-team-membership)
    - [6.4.2 Team Roles](#642-team-roles)
  - [6.5 Resource Sharing](#65-resource-sharing)
    - [6.5.1 Within Workspace](#651-within-workspace)
    - [6.5.2 Cross-Workspace Sharing](#652-cross-workspace-sharing)
- [7. Plugin System](#7-plugin-system)
  - [7.1 Plugin Architecture](#71-plugin-architecture)
  - [7.2 Plugin Manifest](#72-plugin-manifest)
  - [7.3 Plugin Lifecycle](#73-plugin-lifecycle)
    - [Lifecycle Operations](#lifecycle-operations)
  - [7.4 Plugin Communication](#74-plugin-communication)
    - [A) Event-Driven (Asynchronous) - Default](#a-event-driven-asynchronous---default)
    - [B) REST API (Synchronous)](#b-rest-api-synchronous)
    - [C) Shared Data Service](#c-shared-data-service)
  - [7.5 Standard Plugin API](#75-standard-plugin-api)
  - [7.6 Plugin SDK](#76-plugin-sdk)
- [8. Frontend Architecture](#8-frontend-architecture)
  - [8.1 Module Federation](#81-module-federation)
  - [8.2 Web Application](#82-web-application)
  - [8.3 Plugin Frontend Integration](#83-plugin-frontend-integration)
  - [8.4 Routing and Prefixes](#84-routing-and-prefixes)
  - [8.5 Widget System](#85-widget-system)
  - [8.6 Theming](#86-theming)
- [9. Translations (i18n)](#9-translations-i18n)
  - [9.1 Architecture](#91-architecture)
  - [9.2 Namespace per Plugin](#92-namespace-per-plugin)
  - [9.3 Per-Tenant Override](#93-per-tenant-override)
  - [9.4 Translation Contribution from Plugins](#94-translation-contribution-from-plugins)
- [10. Core Services](#10-core-services)
  - [10.1 Storage Service](#101-storage-service)
  - [10.2 Notification Service](#102-notification-service)
  - [10.3 Job Queue Service](#103-job-queue-service)
  - [10.4 Search Service](#104-search-service)
- [11. Super Admin Panel](#11-super-admin-panel)
  - [11.1 Features](#111-features)
  - [11.2 Tenant Management](#112-tenant-management)
  - [11.3 Plugin Management](#113-plugin-management)
- [12. Tenant Admin Interface](#12-tenant-admin-interface)
  - [12.1 Features](#121-features)
  - [12.2 User Management](#122-user-management)
  - [12.3 Role Editor](#123-role-editor)
- [13. Deployment](#13-deployment)
  - [13.1 Kubernetes Deployment](#131-kubernetes-deployment)
    - [Helm Chart Values (example)](#helm-chart-values-example)
  - [13.2 Docker Compose Deployment](#132-docker-compose-deployment)
- [14. Logging and Tracing](#14-logging-and-tracing)
  - [14.1 Structured Logging](#141-structured-logging)
  - [14.2 Log Levels](#142-log-levels)
  - [14.3 Trace Context Propagation](#143-trace-context-propagation)
- [15. Security](#15-security)
  - [15.1 Data Isolation](#151-data-isolation)
  - [15.2 API Security](#152-api-security)
  - [15.3 Plugin Sandboxing](#153-plugin-sandboxing)
  - [15.4 Audit Logging](#154-audit-logging)
- [16. Roadmap and Priorities](#16-roadmap-and-priorities)
  - [Phase 1 - MVP (Core)](#phase-1---mvp-core)
  - [Phase 2 - Plugin Ecosystem](#phase-2---plugin-ecosystem)
  - [Phase 3 - Advanced Features](#phase-3---advanced-features)
  - [Phase 4 - Enterprise](#phase-4---enterprise)
  - [Phase 5 - Ecosystem Expansion (Future)](#phase-5---ecosystem-expansion-future)
- [Appendix A - Glossary](#appendix-a---glossary)
- [Appendix B - Core Database Schema](#appendix-b---core-database-schema)

## Related Documents

For technical implementation details and architecture, please refer to:

- **[TECHNICAL_SPECIFICATIONS.md](./TECHNICAL_SPECIFICATIONS.md)** - Technical implementation details, technology stack, and system architecture
- **[WORKSPACE_SPECIFICATIONS.md](./WORKSPACE_SPECIFICATIONS.md)** - Detailed workspace hierarchy, roles, and isolation mechanisms referenced in Section 6
- **[PLUGIN_ECOSYSTEM_ARCHITECTURE.md](./PLUGIN_ECOSYSTEM_ARCHITECTURE.md)** - Deep dive into plugin system architecture, lifecycle, and integration patterns (Section 7)
- **[PLUGIN_COMMUNICATION_API.md](./PLUGIN_COMMUNICATION_API.md)** - Detailed API specifications for plugin-to-plugin and plugin-to-core communication
- **[UX_SPECIFICATIONS.md](./UX_SPECIFICATIONS.md)** - User interface design and experience specifications referenced in Sections 11-12 (Admin Interfaces)
- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** - Repository structure and code organization implementing these functional requirements
- **[PLUGIN_STRATEGY.md](./PLUGIN_STRATEGY.md)** - Strategic overview and roadmap for plugin ecosystem evolution
- **[MILESTONES.md](../planning/MILESTONES.md)** - Project timeline and phase breakdown aligned with these functional specifications

---

## 1. Project Overview

### 1.1 Vision

Plexica is a cloud-native platform that serves as a foundation for developing enterprise applications through a modular plugin system. The platform natively manages multi-tenancy, granular permissions (RBAC/ABAC), and offers a scalable architecture deployable on both Kubernetes and Docker Compose.

### 1.2 Main Objectives

- Provide a solid foundation for multi-tenant SaaS applications
- Enable rapid feature development through modular plugins
- Ensure data isolation and security between tenants
- Support flexible deployment (Kubernetes and Docker Compose)
- Scale from hundreds to hundreds of thousands of users

### 1.3 Technology Stack

| Component          | Technology                     |
| ------------------ | ------------------------------ |
| Database           | PostgreSQL (schema per tenant) |
| Cache              | Redis (prefixes per tenant)    |
| Message Broker     | Redpanda (Kafka-compatible)    |
| Identity Provider  | Keycloak (realm per tenant)    |
| API Gateway        | Kong or Traefik                |
| Frontend           | React + Module Federation      |
| Backend Plugins    | TypeScript (Node.js)           |
| Container Registry | Docker Registry / Harbor       |
| Package Registry   | Private npm / PyPI             |

---

## 2. System Architecture

### 2.1 Core Components

```
+------------------------------------------------------------------+
|                         API Gateway                               |
|                      (Kong / Traefik)                             |
+------------------------------------------------------------------+
         |              |              |              |
         v              v              v              v
+-------------+  +-------------+  +-------------+  +-------------+
|   Core API  |  |  Plugin A   |  |  Plugin B   |  |  Plugin N   |
|   Service   |  |  (Container)|  |  (Container)|  |  (Container)|
+-------------+  +-------------+  +-------------+  +-------------+
         |              |              |              |
         v              v              v              v
+------------------------------------------------------------------+
|                      Service Mesh / Internal Network              |
+------------------------------------------------------------------+
         |              |              |              |
         v              v              v              v
+-------------+  +-------------+  +-------------+  +-------------+
| PostgreSQL  |  |    Redis    |  |  Redpanda   |  |  Keycloak   |
+-------------+  +-------------+  +-------------+  +-------------+
         |
         v
+------------------------------------------------------------------+
|                    Object Storage (S3/MinIO)                      |
|                    (Bucket per tenant)                            |
+------------------------------------------------------------------+
```

### 2.2 Core API Service

The Core API Service is the heart of the platform and manages:

- **Tenant Management**: CRUD tenants, provisioning, lifecycle
- **User Management**: Sync with Keycloak, user profiles, team membership
- **Permission Engine**: RBAC and ABAC evaluation
- **Plugin Orchestration**: Plugin lifecycle, service discovery, health monitoring
- **Shared Services**: Storage, notifications, job queue, search

### 2.3 Request Flow

1. HTTP request arrives at the API Gateway
2. Gateway validates JWT (issued by Keycloak)
3. Gateway extracts `tenant_id` from JWT and routes to correct service
4. Core/Plugin receives request with enriched tenant context
5. Permission Engine evaluates authorization (RBAC + ABAC)
6. Service processes request with access only to tenant data

---

## 3. Multi-Tenancy

### 3.1 Isolation Model

Plexica implements a **schema-per-tenant** isolation model on PostgreSQL:

```
PostgreSQL Instance
|
+-- Database: plexica
    |
    +-- Schema: core (global data: tenant registry, plugin registry)
    |
    +-- Schema: tenant_acme_corp (ACME tenant data)
    |   +-- users, teams, permissions, plugin_data_*
    |
    +-- Schema: tenant_globex (Globex tenant data)
    |   +-- users, teams, permissions, plugin_data_*
    |
    +-- Schema: tenant_initech (Initech tenant data)
        +-- users, teams, permissions, plugin_data_*
```

### 3.2 Tenant Lifecycle

#### Tenant States

```
[PROVISIONING] --> [ACTIVE] --> [SUSPENDED] --> [PENDING_DELETION] --> [DELETED]
                      ^              |
                      +--------------+
                       (reactivation)
```

| State            | Description                                        |
| ---------------- | -------------------------------------------------- |
| PROVISIONING     | Creating DB schema, storage bucket, Keycloak realm |
| ACTIVE           | Operational tenant                                 |
| SUSPENDED        | Access blocked, data preserved                     |
| PENDING_DELETION | Grace period before permanent deletion             |
| DELETED          | Data permanently removed                           |

#### Automatic Provisioning

When Super Admin creates a tenant:

1. Create record in `core.tenants`
2. Create PostgreSQL schema `tenant_{slug}`
3. Execute base migrations (users, teams, permissions)
4. Create Keycloak realm `tenant-{slug}`
5. Create storage bucket `tenant-{slug}`
6. Enable default plugins
7. Create tenant admin user

### 3.3 Per-Tenant Configuration

Each tenant can have:

- **Custom theme**: Logo, color palette
- **Enabled/disabled plugins**: Subset of available plugins
- **Plugin configurations**: Each plugin can have tenant-specific config
- **Resource limits** (future): Storage quotas, API rate limits, number of users

---

## 4. Authentication System

### 4.1 Keycloak Architecture

```
Keycloak Instance
|
+-- Realm: master (Super Admin)
|
+-- Realm: tenant-acme-corp
|   +-- Users (credentials)
|   +-- Clients (plexica-web, plexica-api)
|   +-- Roles (tenant_admin, user)
|
+-- Realm: tenant-globex
|   +-- Users
|   +-- Clients
|   +-- Roles
```

### 4.2 Keycloak Roles (Base)

| Role         | Description                                |
| ------------ | ------------------------------------------ |
| super_admin  | Access to Super Admin panel (master realm) |
| tenant_admin | Tenant administrator                       |
| user         | Base tenant user                           |

### 4.3 JWT Token Structure

```json
{
  "sub": "user-uuid",
  "iss": "https://auth.plexica.io/realms/tenant-acme-corp",
  "realm": "tenant-acme-corp",
  "tenant_id": "acme-corp",
  "roles": ["tenant_admin"],
  "teams": ["team-sales", "team-marketing"],
  "exp": 1699999999
}
```

### 4.4 Keycloak - Internal Database Sync

Keycloak only manages authentication. Profile data is in the Plexica DB:

| Keycloak              | Plexica DB                                   |
| --------------------- | -------------------------------------------- |
| UUID, email, password | UUID (FK), display_name, avatar, preferences |
| Realm membership      | tenant_id, team_memberships                  |
| Basic roles           | Granular RBAC/ABAC permissions               |

**Sync Mechanism:**

- Keycloak emits events on user create/update/delete
- Plexica consumes events via webhook or Redpanda
- Internal DB is updated in near-realtime

---

## 5. Authorization System (RBAC + ABAC)

### 5.1 Hybrid Model

Plexica combines RBAC and ABAC for maximum flexibility:

- **RBAC**: Predefined roles with associated permissions (simple, performant)
- **ABAC**: Dynamic policies based on attributes (flexible, granular)

### 5.2 RBAC - Role Based Access Control

#### RBAC Entities

```
+----------+       +------------+       +-------------+
|   User   |------>| UserRole   |<------| Role        |
+----------+       +------------+       +-------------+
                                              |
                                              v
                                       +-------------+
                                       | Permission  |
                                       +-------------+

+----------+       +------------+       +-------------+
|   Team   |------>| TeamRole   |<------| Role        |
+----------+       +------------+       +-------------+
```

#### Permission Schema

```
Permission: {resource}:{action}

Examples:
- users:read
- users:write
- users:delete
- crm:contacts:read
- crm:contacts:write
- crm:deals:*
- billing:invoices:export
```

#### System Roles (Built-in)

| Role         | Scope  | Permissions                                    |
| ------------ | ------ | ---------------------------------------------- |
| super_admin  | Global | Everything                                     |
| tenant_admin | Tenant | Tenant management, users, teams, plugin config |
| team_admin   | Team   | Team member management                         |
| user         | Tenant | Base permissions defined by tenant admin       |

### 5.3 ABAC - Attribute Based Access Control

#### Policy Engine

ABAC policies are evaluated when RBAC is not sufficient:

```json
{
  "id": "policy-001",
  "name": "Sales team can only view their own deals",
  "effect": "ALLOW",
  "resource": "crm:deals:*",
  "conditions": {
    "all": [
      { "attribute": "user.teams", "operator": "contains", "value": "sales" },
      { "attribute": "resource.owner_team", "operator": "equals", "value": "user.primary_team" }
    ]
  }
}
```

#### Available Attributes

| Category    | Attributes                                         |
| ----------- | -------------------------------------------------- |
| User        | id, email, roles, teams, department, created_at    |
| Resource    | id, type, owner, owner*team, created_at, custom*\* |
| Environment | time, ip_address, device_type                      |
| Tenant      | id, plan, settings                                 |

#### Policy Sources

1. **Core**: Non-modifiable system policies
2. **Plugin**: Predefined policies provided by plugins
3. **Super Admin**: Global cross-tenant policies
4. **Tenant Admin**: Tenant-specific policies

### 5.4 Authorization Flow

```
Request --> Extract Context --> RBAC Check --> ABAC Check --> Decision
                |                   |              |             |
                v                   v              v             v
          User, Tenant,        Has role      Evaluate        ALLOW/DENY
          Resource, Action     with perm?    policies
```

1. Extract context from request (user, tenant, resource, action)
2. Check RBAC: does user have a role with required permission?
3. If RBAC DENY or inconclusive, evaluate ABAC policies
4. Apply decision (ALLOW/DENY)

### 5.5 Plugin-Contributed Permissions

Plugins can register:

```json
{
  "plugin": "crm",
  "permissions": [
    {
      "key": "crm:contacts:read",
      "name": "View Contacts",
      "description": "Can view contact list and details"
    },
    {
      "key": "crm:contacts:write",
      "name": "Edit Contacts",
      "description": "Can create and edit contacts"
    },
    {
      "key": "crm:deals:*",
      "name": "Full Deals Access",
      "description": "Full access to deals module"
    }
  ],
  "default_policies": [
    {
      "name": "Contacts visible to all users",
      "resource": "crm:contacts:read",
      "effect": "ALLOW",
      "conditions": {}
    }
  ]
}
```

---

## 6. Workspaces and Organization

### 6.1 Workspace Hierarchy

Plexica implements a hierarchical organizational structure within tenants:

```
Tenant: ACME Corp (Complete isolation: DB schema, Keycloak realm, S3 bucket)
|
+-- Workspace: Sales (Logical grouping within tenant schema)
|   +-- Team: Enterprise Sales
|   |   +-- User: Alice (team_admin)
|   |   +-- User: Bob
|   +-- Team: SMB Sales
|       +-- User: Charlie (team_admin)
|
+-- Workspace: Marketing
|   +-- Team: Content Marketing
|   |   +-- User: Dave (team_admin)
|   +-- Team: Demand Gen
|       +-- User: Eve
|       +-- User: Alice (cross-workspace member)
|
+-- Workspace: Engineering
    +-- Team: Backend
    |   +-- User: Frank (team_admin)
    +-- Team: Frontend
        +-- User: Grace (team_admin)
```

**Organizational Levels**:

| Level         | Isolation                            | Domain           | Use Case                          |
| ------------- | ------------------------------------ | ---------------- | --------------------------------- |
| **Tenant**    | Complete (DB schema, realm, bucket)  | Unique subdomain | Different customers/organizations |
| **Workspace** | Logical (filtered by `workspace_id`) | Same as tenant   | Internal departments/divisions    |
| **Team**      | None (collaboration unit)            | Same as tenant   | Project teams, working groups     |

### 6.2 Workspace vs Tenant

**When to Use Workspaces**:

- Internal departmental separation (Sales, Marketing, Engineering)
- Shared data access acceptable (e.g., company-wide contacts)
- Cost optimization important (avoid schema overhead)
- Fast provisioning required (no infrastructure setup)
- Cross-workspace collaboration common

**When to Use Tenants**:

- Complete data isolation required (regulatory, security)
- Different customers/organizations
- Separate billing and resource quotas
- Custom domain or branding per customer
- Legal separation of data required

**Analogy**:

- **Tenant** = GitHub Account (e.g., `acme-corp`)
- **Workspace** = GitHub Organization (e.g., `acme-corp/sales`, `acme-corp/engineering`)
- **Team** = GitHub Repository/Project (e.g., `sales/lead-tracking`)

### 6.3 Workspace Features

#### 6.3.1 Workspace Properties

```json
{
  "id": "uuid",
  "slug": "sales",
  "name": "Sales Department",
  "description": "Customer-facing sales operations",
  "status": "ACTIVE",
  "settings": {
    "defaultTeamRole": "MEMBER",
    "allowCrossWorkspaceSharing": true
  },
  "createdAt": "2024-01-15T10:00:00Z"
}
```

#### 6.3.2 Workspace Roles

| Role       | Permissions                               |
| ---------- | ----------------------------------------- |
| **ADMIN**  | Manage workspace settings, members, teams |
| **MEMBER** | Access workspace resources, join teams    |
| **VIEWER** | Read-only access to workspace resources   |

#### 6.3.3 Workspace Isolation

- Each workspace has its own set of teams
- Resources (contacts, deals, invoices) belong to a workspace
- Users can be members of multiple workspaces
- Permissions are evaluated per-workspace
- Cross-workspace resource sharing is optional

### 6.4 Team Structure

Teams are organizational units within workspaces:

#### 6.4.1 Team Membership

- A user can belong to **multiple teams** across multiple workspaces
- Each team has at least one **team_admin**
- Permissions are **additive**: users inherit permissions from all their teams
- Teams belong to a single workspace

#### 6.4.2 Team Roles

| Role       | Permissions                       |
| ---------- | --------------------------------- |
| **ADMIN**  | Manage team members, assign roles |
| **MEMBER** | Standard team access              |

### 6.5 Resource Sharing

#### 6.5.1 Within Workspace

Resources can be shared between teams in the same workspace:

```json
{
  "resource_id": "deal-123",
  "resource_type": "crm:deal",
  "workspace_id": "sales",
  "owner_team": "enterprise-sales",
  "shared_with": [{ "team": "smb-sales", "permission": "read" }]
}
```

#### 6.5.2 Cross-Workspace Sharing

Resources can optionally be shared across workspaces:

```json
{
  "resource_id": "contact-456",
  "resource_type": "crm:contact",
  "source_workspace": "sales",
  "target_workspace": "marketing",
  "permission": "read",
  "shared_by": "user-id",
  "shared_at": "2024-01-15T10:00:00Z"
}
```

---

## 7. Plugin System

### 7.1 Plugin Architecture

Each plugin is an autonomous unit that:

- Runs in a **separate container** (process isolation)
- Exposes **standardized APIs**
- Can contribute **frontend components** (Module Federation)
- Can extend **permissions and translations**
- Has its own **data schema** in the tenant DB

### 7.2 Plugin Manifest

Each plugin declares its capabilities in a manifest:

```json
{
  "id": "crm",
  "name": "CRM",
  "version": "1.2.0",
  "description": "Customer Relationship Management",

  "runtime": {
    "type": "typescript",
    "image": "registry.plexica.io/plugins/crm:1.2.0",
    "resources": {
      "cpu": "500m",
      "memory": "512Mi"
    }
  },

  "dependencies": [
    { "plugin": "core", "version": ">=1.0.0" },
    { "plugin": "notifications", "version": ">=1.0.0" }
  ],

  "api": {
    "basePath": "/api/plugins/crm",
    "healthCheck": "/health",
    "openapi": "/openapi.json"
  },

  "frontend": {
    "remoteEntry": "https://cdn.plexica.io/plugins/crm/1.2.0/remoteEntry.js",
    "routePrefix": "/crm",
    "exposes": {
      "ContactsPage": "./src/pages/Contacts",
      "DealsPage": "./src/pages/Deals",
      "ContactWidget": "./src/widgets/ContactCard"
    }
  },

  "permissions": [
    { "key": "crm:contacts:read", "name": "View Contacts" },
    { "key": "crm:contacts:write", "name": "Edit Contacts" },
    { "key": "crm:deals:read", "name": "View Deals" },
    { "key": "crm:deals:write", "name": "Edit Deals" }
  ],

  "translations": {
    "namespaces": ["crm"],
    "supportedLocales": ["en", "it", "es", "de"]
  },

  "events": {
    "publishes": [
      "crm.contact.created",
      "crm.contact.updated",
      "crm.deal.created",
      "crm.deal.won",
      "crm.deal.lost"
    ],
    "subscribes": ["billing.invoice.created", "notifications.send"]
  },

  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "dealStages": {
          "type": "array",
          "items": { "type": "string" },
          "default": ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]
        },
        "enableLeadScoring": {
          "type": "boolean",
          "default": false
        }
      }
    }
  },

  "migrations": {
    "path": "/migrations"
  }
}
```

### 7.3 Plugin Lifecycle

```
[REGISTERED] --> [INSTALLING] --> [INSTALLED] --> [ACTIVE]
                                       |             |
                                       v             v
                               [UPDATING]     [DISABLED]
                                   |             |
                                   v             v
                               [INSTALLED]   [UNINSTALLING]
                                                 |
                                                 v
                                            [UNINSTALLED]
```

#### Lifecycle Operations

| Operation | Actions                                                    |
| --------- | ---------------------------------------------------------- |
| Install   | Pull image, run migrations, register routes, load frontend |
| Enable    | Start container, register in service discovery             |
| Disable   | Stop container, keep data                                  |
| Update    | Pull new image, run migrations, hot-swap (if possible)     |
| Uninstall | Stop container, cleanup data (optional), remove routes     |

### 7.4 Plugin Communication

#### A) Event-Driven (Asynchronous) - Default

```
Plugin CRM                    Redpanda                    Plugin Billing
    |                            |                            |
    | -- publish --------------> |                            |
    |    crm.deal.won            |                            |
    |    {deal_id, amount}       | -- deliver --------------> |
    |                            |    crm.deal.won            |
    |                            |                            |
    |                            |                     Create invoice
```

#### B) REST API (Synchronous)

Plugins can call each other directly via service discovery:

```typescript
// In CRM plugin
const billingService = await core.getService('billing');
const invoice = await billingService.post('/invoices', {
  tenant_id: context.tenant_id,
  deal_id: deal.id,
  amount: deal.value,
});
```

#### C) Shared Data Service

For critical shared data:

```typescript
// Write shared data
await core.sharedData.set('customer-profile', customerId, {
  name: 'ACME Corp',
  industry: 'Technology',
});

// Read from another plugin
const profile = await core.sharedData.get('customer-profile', customerId);
```

### 7.5 Standard Plugin API

Each plugin MUST expose:

| Endpoint      | Method | Description             |
| ------------- | ------ | ----------------------- |
| /health       | GET    | Health check (liveness) |
| /ready        | GET    | Readiness check         |
| /openapi.json | GET    | OpenAPI specification   |
| /metrics      | GET    | Prometheus metrics      |

Required headers in every request:

| Header        | Description                |
| ------------- | -------------------------- |
| X-Tenant-ID   | Tenant ID                  |
| X-User-ID     | User ID                    |
| X-Trace-ID    | ID for distributed tracing |
| Authorization | Bearer JWT token           |

### 7.6 Plugin SDK

Plexica provides TypeScript SDK for plugin development:

```typescript
// TypeScript SDK
import { PlexicaPlugin, PluginContext } from '@plexica/sdk';

export class CRMPlugin extends PlexicaPlugin {
  async onInstall(context: PluginContext) {
    // Run migrations, setup
  }

  async onEnable(context: PluginContext) {
    // Register event handlers
    this.subscribe('billing.invoice.created', this.handleInvoice);
  }

  async onDisable(context: PluginContext) {
    // Cleanup
  }

  // API handlers
  @Route('GET', '/contacts')
  @Permission('crm:contacts:read')
  async listContacts(req: Request, ctx: PluginContext) {
    const contacts = await this.db.query('SELECT * FROM contacts WHERE tenant_id = $1', [
      ctx.tenant.id,
    ]);
    return contacts;
  }
}
```

---

## 8. Frontend Architecture

### 8.1 Module Federation

Plexica uses Webpack Module Federation to dynamically load plugin frontends:

```
+------------------------------------------------------------------+
|                        Web Application                            |
|  (React, routing, layout, auth, theme)                           |
+------------------------------------------------------------------+
         |              |              |              |
         v              v              v              v
+-------------+  +-------------+  +-------------+  +-------------+
|  Core UI    |  |   CRM       |  |  Billing    |  |  Analytics  |
|  (widgets)  |  |  (pages)    |  |  (pages)    |  |  (widgets)  |
+-------------+  +-------------+  +-------------+  +-------------+
    Local           Remote          Remote          Remote
                  (CDN/S3)        (CDN/S3)        (CDN/S3)
```

### 8.2 Web Application

The web app provides:

- **Base layout**: Header, sidebar, navigation
- **Routing**: React Router with lazy loading remotes
- **Auth context**: User info, permissions, tenant
- **Theme provider**: Custom theme support per tenant
- **i18n**: Translations with namespaces per plugin

### 8.3 Plugin Frontend Integration

```typescript
// Web app configuration
const remotes = {
  crm: 'crm@https://cdn.plexica.io/plugins/crm/1.2.0/remoteEntry.js',
  billing: 'billing@https://cdn.plexica.io/plugins/billing/1.0.0/remoteEntry.js',
};

// Dynamic route registration
const routes = plugins.flatMap((plugin) =>
  plugin.frontend.routes.map((route) => ({
    path: `/${plugin.manifest.frontend.routePrefix}${route.path}`,
    component: lazy(() => import(`${plugin.id}/${route.component}`)),
  }))
);
```

### 8.4 Routing and Prefixes

To avoid conflicts, each plugin has a unique prefix:

| Plugin    | Prefix     | Example Route             |
| --------- | ---------- | ------------------------- |
| CRM       | /crm       | /crm/contacts, /crm/deals |
| Billing   | /billing   | /billing/invoices         |
| Analytics | /analytics | /analytics/dashboard      |

Routes reserved for web app:

- `/` - Dashboard
- `/settings` - Tenant settings
- `/admin` - Tenant admin
- `/profile` - User profile

### 8.5 Widget System

Plugins can expose reusable widgets:

```typescript
// CRM plugin exposes widget
// crm/src/widgets/ContactCard.tsx
export const ContactCard: React.FC<{contactId: string}> = ({contactId}) => {
  const contact = useContact(contactId);
  return (
    <Card>
      <Avatar src={contact.avatar} />
      <Text>{contact.name}</Text>
    </Card>
  );
};

// Use in another plugin or web app
import { ContactCard } from 'crm/ContactCard';

<ContactCard contactId="123" />
```

### 8.6 Theming

Each tenant can customize:

```json
{
  "tenant_id": "acme-corp",
  "theme": {
    "logo": "https://storage.plexica.io/acme-corp/logo.png",
    "colors": {
      "primary": "#1976d2",
      "secondary": "#dc004e",
      "background": "#ffffff",
      "surface": "#f5f5f5",
      "text": "#212121"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Roboto"
    }
  }
}
```

---

## 9. Translations (i18n)

### 9.1 Architecture

Plexica uses a namespace-based i18n system:

```
translations/
  en/
    core.json        # Core translations
    crm.json         # CRM plugin translations
    billing.json     # Billing plugin translations
  it/
    core.json
    crm.json
    billing.json
```

### 9.2 Namespace per Plugin

Each plugin declares its namespaces in the manifest:

```json
{
  "translations": {
    "namespaces": ["crm"],
    "supportedLocales": ["en", "it", "es", "de"]
  }
}
```

### 9.3 Per-Tenant Override

Tenants can override specific translations:

```json
{
  "tenant_id": "acme-corp",
  "translation_overrides": {
    "en": {
      "crm": {
        "deals.title": "Opportunities"
      }
    }
  }
}
```

### 9.4 Translation Contribution from Plugins

```json
// crm/translations/en.json
{
  "contacts": {
    "title": "Contacts",
    "new": "New Contact",
    "fields": {
      "name": "Name",
      "email": "Email",
      "phone": "Phone"
    }
  },
  "deals": {
    "title": "Deals",
    "new": "New Deal",
    "stages": {
      "lead": "Lead",
      "qualified": "Qualified",
      "proposal": "Proposal",
      "won": "Won",
      "lost": "Lost"
    }
  }
}
```

---

## 10. Core Services

### 10.1 Storage Service

Unified API for file management:

```typescript
interface StorageService {
  upload(file: Buffer, path: string, options?: UploadOptions): Promise<FileInfo>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<FileInfo[]>;
  getSignedUrl(path: string, expiresIn: number): Promise<string>;
}
```

Isolation: each tenant has its own bucket `tenant-{tenant_id}`.

### 10.2 Notification Service

```typescript
interface NotificationService {
  send(notification: Notification): Promise<void>;
  sendBulk(notifications: Notification[]): Promise<void>;

  // Channels
  email(to: string, template: string, data: object): Promise<void>;
  push(userId: string, message: PushMessage): Promise<void>;
  inApp(userId: string, message: InAppMessage): Promise<void>;
}
```

### 10.3 Job Queue Service

For asynchronous and scheduled operations:

```typescript
interface JobQueueService {
  enqueue(job: Job): Promise<string>;
  schedule(job: Job, cronExpression: string): Promise<string>;
  cancel(jobId: string): Promise<void>;
  getStatus(jobId: string): Promise<JobStatus>;
}

// Example usage
await jobQueue.enqueue({
  type: 'crm.export-contacts',
  tenant_id: 'acme-corp',
  payload: { format: 'csv', filters: {...} }
});
```

### 10.4 Search Service

Integrated full-text search:

```typescript
interface SearchService {
  index(document: Indexable): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  delete(documentId: string): Promise<void>;
  reindex(type: string): Promise<void>;
}

// Example
await search.index({
  id: 'contact-123',
  type: 'crm:contact',
  tenant_id: 'acme-corp',
  content: {
    name: 'John Doe',
    email: 'john@example.com',
    company: 'ACME',
  },
});

const results = await search.search({
  query: 'john',
  types: ['crm:contact'],
  tenant_id: 'acme-corp',
});
```

---

## 11. Super Admin Panel

### 11.1 Features

The Super Admin panel is independent of tenants and manages:

| Section   | Features                                              |
| --------- | ----------------------------------------------------- |
| Dashboard | System overview, metrics, health status               |
| Tenants   | CRUD tenants, provisioning, suspension, deletion      |
| Plugins   | Registry, installation, updates, global configuration |
| Users     | Super admin management                                |
| System    | Global configuration, feature flags, maintenance      |
| Logs      | Audit log, error tracking                             |

### 11.2 Tenant Management

```
+------------------------------------------------------------------+
|  Tenants                                          [+ New Tenant] |
+------------------------------------------------------------------+
| Name          | Status  | Users | Plugins | Created    | Actions |
|---------------|---------|-------|---------|------------|---------|
| ACME Corp     | Active  | 150   | 5       | 2024-01-15 | [....]  |
| Globex Inc    | Active  | 45    | 3       | 2024-02-20 | [....]  |
| Initech       | Suspend | 12    | 2       | 2024-03-01 | [....]  |
+------------------------------------------------------------------+
```

### 11.3 Plugin Management

```
+------------------------------------------------------------------+
|  Plugins                                                          |
+------------------------------------------------------------------+
| Plugin      | Version | Status    | Tenants | Actions            |
|-------------|---------|-----------|---------|-------------------|
| CRM         | 1.2.0   | Installed | 15/20   | Update | Config   |
| Billing     | 1.0.0   | Installed | 12/20   | Config             |
| Analytics   | 2.0.0   | Available | -       | Install            |
+------------------------------------------------------------------+
```

---

## 12. Tenant Admin Interface

### 12.1 Features

Each tenant has an admin interface to manage:

| Section   | Features                                      |
| --------- | --------------------------------------------- |
| Dashboard | Tenant overview, usage metrics                |
| Users     | User management, invites, deactivation        |
| Teams     | CRUD teams, membership                        |
| Roles     | Custom role management, permission assignment |
| Plugins   | Enable/disable, per-tenant configuration      |
| Settings  | Theme, preferences, integrations              |
| Audit Log | User activity logs                            |

### 12.2 User Management

```
+------------------------------------------------------------------+
|  Users                                              [+ Invite]   |
+------------------------------------------------------------------+
| Name          | Email              | Teams      | Role   | Status|
|---------------|--------------------|------------|--------|-------|
| Alice Smith   | alice@acme.com     | Sales, Mkt | Admin  | Active|
| Bob Johnson   | bob@acme.com       | Sales      | User   | Active|
| Carol White   | carol@acme.com     | Eng        | User   | Invite|
+------------------------------------------------------------------+
```

### 12.3 Role Editor

```
+------------------------------------------------------------------+
|  Edit Role: Sales Manager                                        |
+------------------------------------------------------------------+
| Name: [Sales Manager          ]                                  |
| Description: [Sales team manager with deals access]              |
|                                                                  |
| Permissions:                                                     |
| +-- Core                                                         |
|     [ ] users:read                                               |
|     [ ] users:write                                              |
| +-- CRM                                                          |
|     [x] crm:contacts:read                                        |
|     [x] crm:contacts:write                                       |
|     [x] crm:deals:read                                           |
|     [x] crm:deals:write                                          |
| +-- Billing                                                      |
|     [x] billing:invoices:read                                    |
|     [ ] billing:invoices:write                                   |
|                                                     [Save] [Cancel]
+------------------------------------------------------------------+
```

---

## 13. Deployment

### 13.1 Kubernetes Deployment

```yaml
# K8s deployment structure
plexica-namespace/
- core-api (Deployment + Service)
- plugin-crm (Deployment + Service)
- plugin-billing (Deployment + Service)
- api-gateway (Kong/Traefik Ingress)
- postgresql (StatefulSet or managed)
- redis (StatefulSet or managed)
- redpanda (StatefulSet or managed)
- keycloak (Deployment or managed)
- minio (StatefulSet, only if not S3)
```

#### Helm Chart Values (example)

```yaml
# values.yaml
global:
  domain: plexica.example.com
  storageClass: standard

core:
  replicas: 3
  resources:
    cpu: 500m
    memory: 512Mi

postgresql:
  enabled: true
  persistence:
    size: 100Gi

redis:
  enabled: true
  cluster:
    enabled: true

redpanda:
  enabled: true
  replicas: 3

keycloak:
  enabled: true
  replicas: 2

plugins:
  crm:
    enabled: true
    version: 1.2.0
  billing:
    enabled: true
    version: 1.0.0
```

### 13.2 Docker Compose Deployment

```yaml
# docker-compose.yml
version: '3.8'

services:
  gateway:
    image: kong:3.4
    ports:
      - '80:8000'
      - '443:8443'
    depends_on:
      - core-api

  core-api:
    image: plexica/core-api:latest
    environment:
      DATABASE_URL: postgres://plexica:pass@postgres/plexica
      REDIS_URL: redis://redis:6379
      REDPANDA_BROKERS: redpanda:9092
      KEYCLOAK_URL: http://keycloak:8080
    depends_on:
      - postgres
      - redis
      - redpanda
      - keycloak

  plugin-crm:
    image: plexica/plugin-crm:1.2.0
    environment:
      CORE_API_URL: http://core-api:3000
      DATABASE_URL: postgres://plexica:pass@postgres/plexica
      REDIS_URL: redis://redis:6379
      REDPANDA_BROKERS: redpanda:9092

  plugin-billing:
    image: plexica/plugin-billing:1.0.0
    environment:
      CORE_API_URL: http://core-api:3000
      DATABASE_URL: postgres://plexica:pass@postgres/plexica
      REDIS_URL: redis://redis:6379
      REDPANDA_BROKERS: redpanda:9092

  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: plexica
      POSTGRES_USER: plexica
      POSTGRES_PASSWORD: pass

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  redpanda:
    image: redpandadata/redpanda:latest
    command:
      - redpanda start
      - --smp 1
      - --memory 1G
      - --overprovisioned

  keycloak:
    image: quay.io/keycloak/keycloak:22.0
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    command: start-dev

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    environment:
      MINIO_ROOT_USER: plexica
      MINIO_ROOT_PASSWORD: plexica123

  frontend:
    image: plexica/frontend:latest
    ports:
      - '3000:80'

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

---

## 14. Logging and Tracing

### 14.1 Structured Logging

All logs MUST include:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Contact created",
  "tenant_id": "acme-corp",
  "trace_id": "abc123xyz",
  "span_id": "def456",
  "user_id": "user-789",
  "plugin": "crm",
  "context": {
    "contact_id": "contact-123",
    "action": "create"
  }
}
```

### 14.2 Log Levels

| Level | Usage                            |
| ----- | -------------------------------- |
| error | Errors requiring attention       |
| warn  | Anomalous but handled situations |
| info  | Significant business events      |
| debug | Troubleshooting details          |
| trace | Very verbose details (dev only)  |

### 14.3 Trace Context Propagation

The trace_id is propagated through:

- HTTP Headers: `X-Trace-ID`
- Message Queue: message metadata
- Internal calls: automatic context propagation

---

## 15. Security

### 15.1 Data Isolation

**Tenant-Level Isolation** (Complete):

- Separate PostgreSQL schemas per tenant
- Separate storage buckets per tenant
- Redis keys with tenant prefix
- Separate Keycloak realms per tenant
- Every query MUST include tenant_id filter

**Workspace-Level Isolation** (Logical):

- Shared PostgreSQL schema (filtered by `workspace_id`)
- Shared storage bucket (prefixed path)
- Same Keycloak realm (workspace as user attribute)
- Every workspace-scoped query MUST include workspace_id filter
- Workspace membership enforced via middleware

### 15.2 API Security

- Mandatory TLS (HTTPS)
- JWT validation on every request
- Rate limiting per tenant and per user
- Input validation (schema-based)
- Output sanitization

### 15.3 Plugin Sandboxing

- Separate containers per plugin
- Network policies to limit communication
- Resource limits (CPU, memory)
- Secret injection via environment variables

### 15.4 Audit Logging

Events to log:

- User login/logout
- Permission and role changes
- CRUD on sensitive resources
- Admin access
- Configuration changes

---

## 16. Roadmap and Priorities

### Phase 1 - MVP (Core)

- [ ] Core API Service
- [ ] Basic multi-tenancy (schema separation)
- [ ] Keycloak integration
- [ ] RBAC system
- [ ] Basic plugin system (install, enable, disable)
- [ ] Frontend shell
- [ ] Super Admin panel (base)
- [ ] Tenant Admin panel (base)
- [ ] Docker Compose deployment

### Phase 2 - Plugin Ecosystem

- [ ] Plugin SDK (TypeScript)
- [ ] Module Federation integration
- [ ] Event system (Redpanda)
- [ ] Plugin-to-plugin communication
- [ ] Plugin marketplace/registry
- [ ] Kubernetes deployment (Helm)

### Phase 3 - Advanced Features

- [ ] ABAC policy engine
- [ ] Advanced theming
- [ ] Complete i18n system
- [ ] Core services (storage, notifications, job queue, search)
- [ ] Resource limits per tenant

### Phase 4 - Enterprise

- [ ] Observability (logging, tracing, metrics)
- [ ] Self-service tenant provisioning
- [ ] Per-tenant SSO
- [ ] Advanced analytics
- [ ] Disaster recovery

### Phase 5 - Ecosystem Expansion (Future)

- [ ] Plugin SDK Python (if required by specific use cases)
- [ ] Support for other languages (Go, Rust)
- [ ] Advanced plugin isolation (WebAssembly)

---

## Appendix A - Glossary

| Term     | Definition                                     |
| -------- | ---------------------------------------------- |
| Tenant   | Isolated customer organization in the platform |
| Plugin   | Extensible module that adds functionality      |
| Realm    | Isolated Keycloak instance for a tenant        |
| Policy   | ABAC rule for access control                   |
| Manifest | Plugin configuration file                      |
| Web App  | Main frontend application                      |
| Remote   | Dynamically loaded frontend module             |

---

## Appendix B - Core Database Schema

```sql
-- Schema: core

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'provisioning',
    settings JSONB DEFAULT '{}',
    theme JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE plugins (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    manifest JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'available',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tenant_plugins (
    tenant_id UUID REFERENCES tenants(id),
    plugin_id VARCHAR(100) REFERENCES plugins(id),
    enabled BOOLEAN DEFAULT true,
    configuration JSONB DEFAULT '{}',
    PRIMARY KEY (tenant_id, plugin_id)
);

CREATE TABLE super_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
```

```sql
-- Schema: tenant_{slug} (template)

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keycloak_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    avatar_url VARCHAR(500),
    preferences JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE team_members (
    team_id UUID REFERENCES teams(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'member',
    PRIMARY KEY (team_id, user_id)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(200) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    plugin_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id),
    permission_id UUID REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id),
    role_id UUID REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    resource VARCHAR(200) NOT NULL,
    effect VARCHAR(10) NOT NULL,
    conditions JSONB NOT NULL,
    priority INTEGER DEFAULT 0,
    source VARCHAR(50) NOT NULL,
    plugin_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

_Document generated for Plexica v0.1_
_Last updated: January 2025_
