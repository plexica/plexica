# Plugin [Plugin Name]

> **Type**: [Core | Enterprise | Community]  
> **Status**: [In Development | Alpha | Beta | Stable]  
> **Version**: x.y.z  
> **Author**: [Author Name/Team]  
> **Last Updated**: [DD MMM YYYY]

## Overview

[Brief description of the plugin (2-3 sentences) explaining what it does and which problem it solves]

### Key Features

- **Feature 1**: Brief description
- **Feature 2**: Brief description
- **Feature 3**: Brief description

### Use Cases

1. **Use case 1**: Scenario description
2. **Use case 2**: Scenario description
3. **Use case 3**: Scenario description

---

## Requirements

### Plugin Dependencies

- **Required plugins**: [list of required plugins, or "None"]
- **Compatible plugins**: [list of plugins it can integrate with]
- **Known conflicts**: [list of incompatible plugins, or "None"]

### Technical Requirements

- **Plexica Version**: >= x.y.z
- **Node.js**: >= 20.x
- **Database**: [PostgreSQL, MySQL, etc.]
- **External services**: [Third-party APIs, if applicable]

### Required Permissions

- `permission.category.action` - Permission description
- `permission.category.action` - Permission description

---

## Installation

### Via Plugin Marketplace

```bash
# Install from marketplace (per tenant)
plexica plugin install [plugin-name]

# Global installation (all tenants)
plexica plugin install [plugin-name] --global
```

### Manual Installation

```bash
# Clone repository
git clone https://github.com/[org]/plexica-plugin-[name].git

# Install dependencies
cd plexica-plugin-[name]
pnpm install

# Build
pnpm build

# Deploy to core
plexica plugin deploy ./dist
```

### Initial Configuration

1. **Required environment variables**:

```env
# File: .env
PLUGIN_[NAME]_API_KEY=your_api_key
PLUGIN_[NAME]_ENDPOINT=https://api.example.com
PLUGIN_[NAME]_DEBUG=false
```

2. **Manifest configuration**:

```json
{
  "id": "plugin-[name]",
  "name": "[Plugin Name]",
  "version": "1.0.0",
  "settings": {
    "api_key": {
      "type": "string",
      "required": true,
      "description": "API key for external service"
    }
  }
}
```

---

## Architecture

### File Structure

```
plugin-[name]/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── events/
│   │   └── main.ts
│   ├── migrations/
│   └── plugin.manifest.json
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   ├── components/
    │   └── widgets/
    └── vite.config.ts
```

### Architecture Diagram

```
┌─────────────────────┐
│   Plexica Core      │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  Plugin [Name]      │
├─────────────────────┤
│  • Controller       │
│  • Service Logic    │
│  • Data Access      │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  External Service   │
│  (if applicable)    │
└─────────────────────┘
```

### Database Schema

```prisma
// File: backend/migrations/001_initial_schema.sql

-- Tenant schema
CREATE SCHEMA IF NOT EXISTS "tenant_[id]_plugin_[name]";

-- Example table
CREATE TABLE "tenant_[id]_plugin_[name]".entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_entities_tenant ON "tenant_[id]_plugin_[name]".entities(tenant_id);
```

---

## API Endpoints

### Backend API

#### GET /api/plugins/[name]/entities

Retrieves list of entities.

**Required permissions**: `plugin.[name].entities.read`

**Query Parameters**:
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Results per page (default: 20)
- `filter` (string, optional): Search filter

**Response 200**:
```typescript
{
  data: Array<{
    id: string;
    name: string;
    data: object;
    createdAt: string;
    updatedAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

**Response 403**: Insufficient permissions  
**Response 500**: Internal error

---

#### POST /api/plugins/[name]/entities

Creates new entity.

**Required permissions**: `plugin.[name].entities.create`

**Request Body**:
```typescript
{
  name: string;
  data?: object;
}
```

**Response 201**:
```typescript
{
  id: string;
  name: string;
  data: object;
  createdAt: string;
  updatedAt: string;
}
```

**Response 400**: Validation failed  
**Response 403**: Insufficient permissions  
**Response 500**: Internal error

---

#### PUT /api/plugins/[name]/entities/:id

Updates existing entity.

**Required permissions**: `plugin.[name].entities.update`

**Request Body**:
```typescript
{
  name?: string;
  data?: object;
}
```

**Response 200**: Entity updated  
**Response 404**: Entity not found  
**Response 403**: Insufficient permissions

---

#### DELETE /api/plugins/[name]/entities/:id

Deletes entity.

**Required permissions**: `plugin.[name].entities.delete`

**Response 204**: Deletion completed  
**Response 404**: Entity not found  
**Response 403**: Insufficient permissions

---

## Events

### Emitted Events

```typescript
// Event: plugin.[name].entity.created
{
  type: 'plugin.[name].entity.created',
  payload: {
    entityId: string;
    tenantId: string;
    data: object;
  },
  metadata: {
    userId: string;
    timestamp: string;
  }
}
```

```typescript
// Event: plugin.[name].entity.updated
{
  type: 'plugin.[name].entity.updated',
  payload: {
    entityId: string;
    tenantId: string;
    changes: object;
  },
  metadata: {
    userId: string;
    timestamp: string;
  }
}
```

```typescript
// Event: plugin.[name].entity.deleted
{
  type: 'plugin.[name].entity.deleted',
  payload: {
    entityId: string;
    tenantId: string;
  },
  metadata: {
    userId: string;
    timestamp: string;
  }
}
```

### Consumed Events

```typescript
// Listens to: tenant.user.created
// Action: Creates user profile in plugin
```

---

## Frontend

### Pages

#### `/plugins/[name]/dashboard`

Main plugin dashboard.

**Components**:
- `DashboardPage.tsx` - Main container
- `StatsWidget.tsx` - Statistics widget
- `RecentActivityWidget.tsx` - Recent activities

#### `/plugins/[name]/entities`

List of entities managed by the plugin.

**Components**:
- `EntitiesListPage.tsx` - List with table
- `EntityCreateModal.tsx` - Creation modal
- `EntityDetailDrawer.tsx` - Entity details

### Widgets

#### `EntitySummaryWidget`

Summary widget for main dashboard.

**Props**:
```typescript
interface EntitySummaryWidgetProps {
  tenantId: string;
  limit?: number;
}
```

**Usage**:
```typescript
import { EntitySummaryWidget } from '@plexica/plugin-[name]';

<EntitySummaryWidget tenantId={currentTenant.id} limit={5} />
```

### Custom Hooks

#### `useEntities()`

Hook for managing entities.

```typescript
import { useEntities } from '@plexica/plugin-[name]';

function MyComponent() {
  const { entities, loading, error, create, update, remove } = useEntities();
  
  // ... usage
}
```

---

## Configuration

### Plugin Settings (Tenant-Level)

```typescript
interface PluginSettings {
  enabled: boolean;
  apiKey: string;
  endpoint: string;
  features: {
    feature1: boolean;
    feature2: boolean;
  };
  limits: {
    maxEntities: number;
    rateLimit: number;
  };
}
```

### Advanced Configuration

```yaml
# File: plugin-config.yaml
plugin:
  [name]:
    cache:
      enabled: true
      ttl: 3600
    
    rateLimit:
      enabled: true
      maxRequests: 100
      windowMs: 60000
    
    features:
      advanced_search: true
      batch_operations: false
```

---

## Testing

### Unit Tests

```bash
# Run unit tests
pnpm test

# With coverage
pnpm test:coverage
```

**Example test**:
```typescript
// File: backend/src/services/__tests__/entity.service.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityService } from '../entity.service';

describe('EntityService', () => {
  let service: EntityService;
  
  beforeEach(() => {
    service = new EntityService();
  });
  
  it('should create entity', async () => {
    const entity = await service.create({ name: 'Test' });
    expect(entity).toHaveProperty('id');
    expect(entity.name).toBe('Test');
  });
});
```

### Integration Tests

```bash
# Run integration tests
pnpm test:integration
```

### E2E Tests

```bash
# Run E2E tests
pnpm test:e2e
```

---

## Development

### Development Environment Setup

```bash
# Clone repository
git clone https://github.com/[org]/plexica-plugin-[name].git
cd plexica-plugin-[name]

# Install dependencies
pnpm install

# Setup database
pnpm db:setup

# Run in development mode
pnpm dev
```

### Hot Reload

Plugin supports hot reload in development mode:

```bash
# Terminal 1: Core API
cd plexica-core
pnpm dev

# Terminal 2: Plugin
cd plexica-plugin-[name]
pnpm dev --watch
```

### Debug

```typescript
// File: backend/src/main.ts

import { PlexicaPlugin } from '@plexica/sdk';

export default class MyPlugin extends PlexicaPlugin {
  async onInit() {
    this.logger.debug('Plugin initialized', {
      version: this.manifest.version,
      config: this.config
    });
  }
}
```

---

## Deployment

### Production Build

```bash
# Build backend and frontend
pnpm build

# Output:
# - backend/dist/
# - frontend/dist/
```

### Deploy on Kubernetes

```yaml
# File: k8s/deployment.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: plexica-plugin-[name]
spec:
  replicas: 3
  selector:
    matchLabels:
      app: plexica-plugin-[name]
  template:
    metadata:
      labels:
        app: plexica-plugin-[name]
    spec:
      containers:
      - name: plugin
        image: plexica/plugin-[name]:latest
        env:
        - name: PLUGIN_CONFIG
          valueFrom:
            configMapKeyRef:
              name: plugin-[name]-config
              key: config.json
```

---

## Monitoring

### Metrics

Plugin exposes the following Prometheus metrics:

- `plugin_[name]_requests_total` - Total number of requests
- `plugin_[name]_requests_duration_ms` - Request duration
- `plugin_[name]_entities_total` - Total number of entities
- `plugin_[name]_errors_total` - Total number of errors

### Logs

```typescript
// Available log levels
this.logger.debug('Debug message');
this.logger.info('Info message');
this.logger.warn('Warning message');
this.logger.error('Error message', { error });
```

### Health Check

```bash
# Check plugin health
curl http://localhost:3000/api/plugins/[name]/health

# Response
{
  "status": "healthy",
  "uptime": 12345,
  "version": "1.0.0"
}
```

---

## Troubleshooting

### Common Issues

#### Plugin won't load

**Symptom**: "Plugin not found" error in core

**Solution**:
1. Verify manifest is valid
2. Check core logs: `plexica logs core`
3. Ensure plugin is registered: `plexica plugin list`

#### Permission errors

**Symptom**: 403 Forbidden on plugin APIs

**Solution**:
1. Verify permissions are assigned to user role
2. Check plugin manifest for required permissions
3. Restart core after permission changes

#### Database migration failed

**Symptom**: Error during `pnpm db:migrate`

**Solution**:
1. Rollback last migration: `pnpm db:rollback`
2. Verify SQL syntax of migration
3. Check database connection
4. Retry: `pnpm db:migrate`

---

## Contributing

### Guidelines

1. Fork the repository
2. Create feature branch: `git checkout -b feature/feature-name`
3. Commit with descriptive messages
4. Push to branch: `git push origin feature/feature-name`
5. Open Pull Request

### Code Style

- Follow project's ESLint config
- Use TypeScript strict mode
- Write tests for new features
- Document public functions with JSDoc

### Review Process

- At least 1 approval required
- All tests must pass
- Coverage >= 80%
- No ESLint warnings

---

## Changelog

### [1.0.0] - 2025-01-XX

**Added**:
- Feature 1
- Feature 2

**Changed**:
- Improvement 1

**Fixed**:
- Bug fix 1

### [0.9.0] - 2025-01-XX

**Added**:
- Initial release

---

## License

[MIT License](./LICENSE) - Copyright (c) 2025 [Author/Organization]

---

## Support

- **Documentation**: https://docs.plexica.io/plugins/[name]
- **Issues**: https://github.com/[org]/plexica-plugin-[name]/issues
- **Community Forum**: https://community.plexica.io
- **Email**: support@plexica.io

---

*Plugin [Name] Documentation v1.0*  
*Last updated: January 2025*  
*Author: [Team Name]*
