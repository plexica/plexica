# Plexica - External Plugin Strategy

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Architecture Team  
**Document Type**: Technical Specifications

## Overview: Hybrid Model Monorepo + External Plugins

**Recommendation**: Monorepo for the core + **External plugins in separate repositories**

This is the optimal strategy that combines:

- ✅ Monorepo advantages for the core platform
- ✅ Independent plugin development flexibility
- ✅ Third-party plugin marketplace

---

## Plugin Architecture

### Internal Plugins (Monorepo)

Official plugins developed by the core team:

```
plexica/                           # Main monorepo
└── apps/plugins/
    ├── crm/                       # Official plugin
    ├── billing/                   # Official plugin
    └── analytics/                 # Official plugin
```

**Characteristics:**

- Developed and maintained by the Plexica team
- Synchronized deployment with core
- Direct access to internal packages
- Guaranteed type safety

### External Plugins (Separate Repositories)

Plugins developed by third parties or external teams:

```
plexica-plugin-helpdesk/          # Separate repository
plexica-plugin-inventory/         # Separate repository
acme-plugin-custom/               # Custom client plugin
```

**Characteristics:**

- Independent development
- Autonomous versioning
- Published to registry (npm, Docker Hub)
- Dynamically installable

---

## External Plugin Structure

### Repository Template

```
plexica-plugin-helpdesk/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── events/
│   │   └── main.ts
│   ├── migrations/
│   ├── Dockerfile
│   ├── package.json
│   └── plugin.manifest.json      # ⭐ Declarative manifest
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── widgets/
│   ├── vite.config.ts
│   └── package.json
│
├── tests/
├── docs/
├── .github/workflows/
│   └── publish.yml               # CI/CD for publishing
├── package.json                   # Root package
├── README.md
└── LICENSE
```

### Plugin Manifest (`plugin.manifest.json`)

```json
{
  "id": "helpdesk",
  "name": "Help Desk",
  "version": "1.0.0",
  "description": "Customer support ticketing system",
  "author": "ACME Corp",
  "license": "MIT",

  "plexica": {
    "minVersion": "1.0.0",
    "maxVersion": "2.x"
  },

  "runtime": {
    "type": "typescript",
    "backend": {
      "image": "registry.plexica.io/plugins/helpdesk:1.0.0",
      "resources": {
        "cpu": "500m",
        "memory": "512Mi"
      }
    },
    "frontend": {
      "remoteEntry": "https://cdn.plexica.io/plugins/helpdesk/1.0.0/remoteEntry.js",
      "routePrefix": "/helpdesk"
    }
  },

  "dependencies": {
    "plugins": [
      {
        "id": "notifications",
        "version": ">=1.0.0"
      }
    ],
    "npm": {
      "@plexica/sdk": "^1.0.0",
      "@plexica/types": "^1.0.0"
    }
  },

  "api": {
    "basePath": "/api/plugins/helpdesk",
    "healthCheck": "/health",
    "openapi": "/openapi.json"
  },

  "permissions": [
    {
      "key": "helpdesk:tickets:read",
      "name": "View Tickets",
      "description": "Can view support tickets"
    },
    {
      "key": "helpdesk:tickets:write",
      "name": "Manage Tickets",
      "description": "Can create and edit tickets"
    }
  ],

  "events": {
    "publishes": ["helpdesk.ticket.created", "helpdesk.ticket.resolved"],
    "subscribes": ["crm.contact.created", "notifications.send"]
  },

  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "autoAssign": {
          "type": "boolean",
          "default": true,
          "title": "Auto-assign tickets"
        },
        "slaHours": {
          "type": "number",
          "default": 24,
          "title": "SLA response time (hours)"
        }
      }
    }
  },

  "migrations": {
    "path": "/migrations"
  },

  "pricing": {
    "model": "per-seat",
    "tiers": [
      {
        "name": "Basic",
        "price": 10,
        "currency": "USD",
        "features": ["Up to 100 tickets/month"]
      }
    ]
  }
}
```

---

## SDK for External Plugins

### Public Package: `@plexica/sdk`

External plugins depend on SDK published on npm:

```json
// External plugin package.json
{
  "name": "@acme/plexica-plugin-helpdesk",
  "version": "1.0.0",
  "dependencies": {
    "@plexica/sdk": "^1.0.0",
    "@plexica/types": "^1.0.0"
  }
}
```

### SDK Versioning

```
@plexica/sdk versioning strategy:

1.x.x - Stable API (current)
├── 1.0.0 - Initial release
├── 1.1.0 - Backward compatible features
└── 1.2.0 - Backward compatible features

2.x.x - Breaking changes
└── 2.0.0 - New plugin architecture

Plugin compatibility:
- Plugin built with SDK 1.x works with Core 1.x and 2.x
- Plugin built with SDK 2.x requires Core 2.x+
```

### SDK Publication

```typescript
// packages/sdk/package.json (in monorepo)
{
  "name": "@plexica/sdk",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

**SDK publication pipeline:**

```yaml
# .github/workflows/publish-sdk.yml
name: Publish SDK

on:
  push:
    tags:
      - '@plexica/sdk@*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm --filter @plexica/sdk build
      - run: pnpm --filter @plexica/sdk publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## External Plugin Development Workflow

### 1. Initial Setup

```bash
# Clone template
npx @plexica/create-plugin my-plugin

cd plexica-plugin-my-plugin

# Install dependencies
npm install

# Setup development environment
npm run dev:setup
```

### 2. Local Development

```bash
# Start Plexica core locally (docker-compose)
npm run plexica:start

# Develop plugin in watch mode
npm run dev

# Plugin connects to local core
# Backend: http://localhost:3000
# Frontend: http://localhost:5173
```

### 3. Testing

```bash
# Unit tests
npm test

# Integration tests (requires running core)
npm run test:integration

# E2E tests
npm run test:e2e
```

### 4. Build and Publication

```bash
# Build backend + frontend
npm run build

# Build Docker image
npm run docker:build

# Publish to registry
npm run publish
```

### 5. Plugin Registration

```bash
# Register plugin in Plexica registry
plexica-cli plugin register \
  --manifest ./plugin.manifest.json \
  --backend-image registry.io/my-plugin:1.0.0 \
  --frontend-url https://cdn.example.com/plugin/remoteEntry.js
```

---

## Plugin Registry

### Registry Architecture

```
Plexica Plugin Registry
├── Public Registry (official and verified plugins)
│   └── https://registry.plexica.io/
│
└── Private Registry (custom corporate plugins)
    └── https://registry.acme-corp.internal/
```

### Registry API

```typescript
// GET /api/registry/plugins
{
  "plugins": [
    {
      "id": "helpdesk",
      "name": "Help Desk",
      "version": "1.0.0",
      "author": "ACME Corp",
      "verified": true,
      "downloads": 1523,
      "rating": 4.5,
      "manifest": { /* ... */ }
    }
  ]
}

// GET /api/registry/plugins/helpdesk
{
  "id": "helpdesk",
  "versions": ["1.0.0", "1.0.1", "1.1.0"],
  "latest": "1.1.0",
  "manifest": { /* ... */ },
  "readme": "# Help Desk Plugin...",
  "changelog": "## 1.1.0\n- Fixed bug..."
}
```

### Installing Plugin from Registry

```typescript
// Super Admin or Tenant Admin
POST /api/tenants/{tenantId}/plugins/install
{
  "pluginId": "helpdesk",
  "version": "1.0.0",
  "source": "registry",  // or "custom"
  "configuration": {
    "autoAssign": true,
    "slaHours": 24
  }
}

// Core API downloads and deploys the plugin
1. Verify version compatibility
2. Download Docker image from registry
3. Execute migrations
4. Deploy K8s/Docker container
5. Register in service discovery
6. Activate frontend (Module Federation)
```

---

## External Plugin Security

### 1. Sandboxing

```yaml
# Kubernetes NetworkPolicy for plugin
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: plugin-helpdesk-policy
spec:
  podSelector:
    matchLabels:
      app: plugin-helpdesk
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: core-api
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
    - to:
        - podSelector:
            matchLabels:
              app: redis
```

### 2. Permission Validation

```typescript
// Core API validates that plugin only requests declared permissions
async function validatePluginPermissions(
  pluginId: string,
  requestedPermission: string
): Promise<boolean> {
  const manifest = await pluginRegistry.getManifest(pluginId);

  const allowedPermissions = manifest.permissions.map((p) => p.key);

  return allowedPermissions.some((allowed) => matchesPermission(requestedPermission, allowed));
}
```

### 3. Resource Limits

```typescript
// Core API enforces limits from manifest
const limits = {
  cpu: manifest.runtime.backend.resources.cpu, // "500m"
  memory: manifest.runtime.backend.resources.memory, // "512Mi"
  storage: '1Gi',
  requests: {
    perMinute: 1000,
    perDay: 100000,
  },
};
```

### 4. Code Signing

```bash
# Plugin must be signed
npm run sign -- --private-key ./private.key

# Core verifies signature before installation
plexica-cli plugin verify \
  --manifest ./plugin.manifest.json \
  --signature ./plugin.sig \
  --public-key ./author-public.key
```

---

## Marketplace UI

### Super Admin: Browse Plugins

```typescript
// apps/super-admin/src/pages/Marketplace.tsx

function PluginMarketplace() {
  const { data: plugins } = useQuery('plugins', fetchPlugins);

  return (
    <Grid>
      {plugins.map(plugin => (
        <PluginCard key={plugin.id} plugin={plugin}>
          <Badge verified={plugin.verified} />
          <Title>{plugin.name}</Title>
          <Description>{plugin.description}</Description>
          <Stats>
            <Downloads>{plugin.downloads}</Downloads>
            <Rating>{plugin.rating}</Rating>
          </Stats>
          <Button onClick={() => installPlugin(plugin.id)}>
            Install
          </Button>
        </PluginCard>
      ))}
    </Grid>
  );
}
```

### Tenant Admin: Manage Installed Plugins

```typescript
// apps/web/src/pages/Plugins.tsx

function InstalledPlugins() {
  const { data: installed } = useQuery('tenant-plugins', fetchInstalled);

  return (
    <List>
      {installed.map(plugin => (
        <PluginRow key={plugin.id}>
          <Info>
            <Name>{plugin.name}</Name>
            <Version>{plugin.version}</Version>
          </Info>
          <Actions>
            <Switch
              checked={plugin.enabled}
              onChange={() => togglePlugin(plugin.id)}
            />
            <Button onClick={() => configurePlugin(plugin.id)}>
              Configure
            </Button>
            <Button
              variant="danger"
              onClick={() => uninstallPlugin(plugin.id)}
            >
              Uninstall
            </Button>
          </Actions>
        </PluginRow>
      ))}
    </List>
  );
}
```

---

## CLI for Plugin Developers

### `@plexica/create-plugin`

```bash
# Create new plugin from template
npx @plexica/create-plugin my-plugin

# Interactive wizard
? Plugin name: My Plugin
? Plugin ID: my-plugin
? Description: My awesome plugin
? Backend language: TypeScript
? Include frontend: Yes
? Frontend framework: React
? License: MIT

Creating plugin structure...
✓ Created backend/
✓ Created frontend/
✓ Created plugin.manifest.json
✓ Installed dependencies

Next steps:
  cd plexica-plugin-my-plugin
  npm run dev
```

### `plexica-cli`

```bash
# Login to registry
plexica-cli login

# Test plugin locally
plexica-cli dev --plugin ./

# Validate manifest
plexica-cli validate

# Publish plugin
plexica-cli publish --tag latest

# Stats
plexica-cli stats my-plugin
```

---

## Complete Example: External Plugin

### Repository: `plexica-plugin-helpdesk`

```
plexica-plugin-helpdesk/
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── controllers/
│   │   │   └── tickets.controller.ts
│   │   ├── services/
│   │   │   └── tickets.service.ts
│   │   └── events/
│   │       └── ticket.events.ts
│   ├── migrations/
│   │   └── 001_create_tickets.sql
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── TicketsPage.tsx
│   │   └── components/
│   │       └── TicketCard.tsx
│   ├── vite.config.ts
│   └── package.json
│
├── plugin.manifest.json
├── .github/workflows/
│   ├── test.yml
│   └── publish.yml
└── README.md
```

### `backend/src/main.ts`

```typescript
import { PlexicaPlugin } from '@plexica/sdk';
import { TicketsController } from './controllers/tickets.controller';

class HelpdeskPlugin extends PlexicaPlugin {
  async onInstall() {
    console.log('Helpdesk plugin installed');

    // Setup default configuration
    await this.db.execute(`
      INSERT INTO plugin_config (key, value)
      VALUES ('autoAssign', 'true')
    `);
  }

  async onEnable() {
    // Subscribe to events
    this.events.subscribe('crm.contact.created', async (event) => {
      // Auto-create welcome ticket
      await this.createWelcomeTicket(event.data);
    });
  }

  @Route('GET', '/tickets')
  @Permission('helpdesk:tickets:read')
  async listTickets(req: Request) {
    const tickets = await this.db.query('SELECT * FROM tickets WHERE tenant_id = $1', [
      req.tenantContext.tenantId,
    ]);

    return tickets;
  }

  @Route('POST', '/tickets')
  @Permission('helpdesk:tickets:write')
  async createTicket(req: Request) {
    const ticket = await this.db.query(
      'INSERT INTO tickets (subject, description, tenant_id) VALUES ($1, $2, $3) RETURNING *',
      [req.body.subject, req.body.description, req.tenantContext.tenantId]
    );

    // Publish event
    await this.publishEvent('ticket.created', ticket);

    return ticket;
  }
}

export default HelpdeskPlugin;
```

---

## Hybrid Model Advantages

### ✅ For the Core Team

- Full control over official plugins
- Synchronized deployment of core + internal plugins
- Type safety in monorepo
- Facilitated refactoring

### ✅ For Plugin Developers

- Independent development
- Autonomous versioning
- Deploy when ready
- Monetization possibility

### ✅ For Clients

- Wide plugin choice
- Custom plugins can be developed internally
- On-demand installation
- Granular updates

---

## Strategy Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    PLEXICA MONOREPO                         │
│  ┌─────────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │  Core API   │  │  Shell   │  │  Internal Plugins    │   │
│  │             │  │          │  │  ├── crm             │   │
│  │             │  │          │  │  ├── billing         │   │
│  │             │  │          │  │  └── analytics       │   │
│  └─────────────┘  └──────────┘  └──────────────────────┘   │
│                                                              │
│  ┌──────────┐  ┌───────────┐  ┌─────────┐                  │
│  │   SDK    │  │   Types   │  │   UI    │  ← Published     │
│  │ (public) │  │ (public)  │  │ (public)│     to npm       │
│  └──────────┘  └───────────┘  └─────────┘                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
                    Published to npm
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              EXTERNAL PLUGINS (Separate Repositories)       │
│                                                              │
│  plexica-plugin-helpdesk/      (uses @plexica/sdk)         │
│  plexica-plugin-inventory/     (uses @plexica/sdk)         │
│  acme-plugin-custom/           (uses @plexica/sdk)         │
│                                                              │
│  → Independent development                                   │
│  → Published to Plugin Registry                              │
│  → Dynamically installable                                   │
└─────────────────────────────────────────────────────────────┘
```

**Conclusion**: This hybrid model offers the best of both worlds, allowing control over the core and flexibility for the plugin ecosystem.

---

_Plexica Document - Plugin Strategy v1.0_  
_Last updated: January 2025_
