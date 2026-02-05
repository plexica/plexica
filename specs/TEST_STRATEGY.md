# 📋 Piano Completo di Implementazione - Sistema di Test Plexica

**Versione:** 1.0  
**Data:** 28 Gennaio 2025  
**Autore:** Analisi Architetturale Core-API

---

## 📊 Metriche di Successo

### Coverage Target per Modulo

| Modulo        | Unit | Integration | E2E  | Overall  | Status    |
| ------------- | ---- | ----------- | ---- | -------- | --------- |
| **Auth**      | ≥90% | ≥85%        | ≥70% | **≥85%** | 🎯 Target |
| **Tenant**    | ≥90% | ≥85%        | ≥70% | **≥85%** | 🎯 Target |
| **Workspace** | ≥90% | ≥85%        | ≥70% | **≥85%** | 🎯 Target |
| **Plugin**    | ≥85% | ≥80%        | ≥70% | **≥80%** | 🎯 Target |
| **Overall**   | -    | -           | -    | **≥80%** | 🎯 Target |

### Performance Target

| Test Type           | Target       | Rationale             |
| ------------------- | ------------ | --------------------- |
| Unit Tests          | **< 30s**    | Fast feedback loop    |
| Integration Tests   | **< 2 min**  | Include DB operations |
| E2E Tests           | **< 5 min**  | Full system scenarios |
| CI Pipeline (total) | **< 10 min** | Parallel execution    |

### Reliability Target

| Metric              | Target    | Importance           |
| ------------------- | --------- | -------------------- |
| Test Flakiness      | **< 1%**  | Reliable tests       |
| Test Stability      | **≥ 99%** | Consistent results   |
| CI Success Rate     | **≥ 95%** | Production readiness |
| False Positive Rate | **< 2%**  | Trust in tests       |

---

## 🗓️ Timeline Completo

### Breakdown per Phase

| Phase       | Description         | Effort           | Duration          | Dependencies  |
| ----------- | ------------------- | ---------------- | ----------------- | ------------- |
| **Phase 1** | Infrastruttura Base | 3-4 giorni       | 1 settimana       | -             |
| **Phase 2** | Auth Tests          | 2-3 giorni       | 3-4 giorni        | Phase 1       |
| **Phase 3** | Tenant Tests        | 2-3 giorni       | 3-4 giorni        | Phase 1, 2    |
| **Phase 4** | Workspace Tests     | 3-4 giorni       | 1 settimana       | Phase 1, 2, 3 |
| **Phase 5** | Plugin Tests        | 4-5 giorni       | 1 settimana       | Phase 1, 2, 3 |
| **Phase 6** | CI/CD Setup         | 1-2 giorni       | 2-3 giorni        | Phase 1-5     |
| **Phase 7** | Quickstart Data     | 1 giorno         | 1-2 giorni        | Phase 1       |
| **TOTALE**  |                     | **16-22 giorni** | **4-5 settimane** |               |

### Milestones

**Week 1: Foundation**

- ✅ Infrastructure complete
- ✅ All helpers implemented
- ✅ Test configs ready
- ✅ First auth tests passing

**Week 2: Core Modules**

- ✅ Auth tests complete (≥85% coverage)
- ✅ Tenant tests complete (≥85% coverage)
- 🔄 Start workspace tests

**Week 3: Features**

- ✅ Workspace tests complete (≥85% coverage)
- 🔄 Start plugin tests

**Week 4: Plugin & CI**

- ✅ Plugin tests complete (≥80% coverage)
- ✅ CI/CD pipeline working
- 🔄 Final polish

**Week 5: Polish & Documentation**

- ✅ Quickstart data ready
- ✅ Documentation complete
- ✅ All tests passing in CI
- ✅ Coverage targets met

---

## ✅ Checklist Finale

Prima di considerare il progetto completo:

### Infrastructure

- [ ] Docker Compose test configurato e funzionante
- [ ] Tutti i servizi (Postgres, Keycloak, Redis, MinIO) avviano correttamente
- [ ] Script setup/teardown/reset funzionano senza errori
- [ ] Healthchecks dei container sono affidabili

### Helpers & Utilities

- [ ] TestDatabaseHelper implementato e testato
- [ ] TestKeycloakHelper implementato e testato
- [ ] TestAuthHelper implementato e testato
- [ ] Factories per dati test funzionanti

### Seed Data

- [ ] Minimal seed data validato
- [ ] Quickstart seed data validato
- [ ] Seed scripts idempotenti (possono essere eseguiti più volte)

### Test Coverage

**Auth Module:**

- [ ] Unit tests: ≥90% coverage
- [ ] Integration tests: ≥85% coverage
- [ ] E2E tests: ≥70% coverage
- [ ] Overall: ≥85% coverage
- [ ] Cross-tenant security tests passano
- [ ] Permission system tests passano

**Tenant Module:**

- [ ] Unit tests: ≥90% coverage
- [ ] Integration tests: ≥85% coverage
- [ ] E2E tests: ≥70% coverage
- [ ] Overall: ≥85% coverage
- [ ] Provisioning E2E tests passano
- [ ] Isolation tests passano

**Workspace Module:**

- [ ] Unit tests: ≥90% coverage
- [ ] Integration tests: ≥85% coverage
- [ ] E2E tests: ≥70% coverage
- [ ] Overall: ≥85% coverage
- [ ] Permission matrix completa testata
- [ ] Team management tests passano

**Plugin Module:**

- [ ] Unit tests: ≥85% coverage
- [ ] Integration tests: ≥80% coverage
- [ ] E2E tests: ≥70% coverage
- [ ] Overall: ≥80% coverage
- [ ] Lifecycle tests passano
- [ ] Communication tests passano
- [ ] Dependency resolution tests passano

### CI/CD

- [ ] GitHub Actions workflow configurato
- [ ] Workflow esegue tutti i test (unit, integration, e2e)
- [ ] Coverage report caricato su Codecov
- [ ] PR comments con coverage funzionanti
- [ ] Badges in README aggiornati

### Quality Metrics

- [ ] Test flakiness < 1%
- [ ] Nessun test intermittente
- [ ] Tutti i test sequenziali (non paralleli)
- [ ] Performance targets raggiunti:
  - [ ] Unit tests < 30s
  - [ ] Integration tests < 2 min
  - [ ] E2E tests < 5 min
  - [ ] CI pipeline < 10 min

### Documentation

- [ ] README.md test-infrastructure completo
- [ ] README.md core-api aggiornato
- [ ] Documentazione troubleshooting
- [ ] Guida quickstart
- [ ] Commenti nei test complessi

---

## 🚀 Prossimi Passi dopo Completamento

### Mantenimento

1. **Monitorare test in CI**: Verificare che rimangano stabili
2. **Aggiornare test**: Quando il codice cambia
3. **Refactoring**: Migliorare test quando necessario
4. **Aggiungere test**: Per nuove funzionalità

### Espansione

1. **Performance tests**: Load testing, stress testing
2. **Security tests**: Penetration testing, fuzzing
3. **Mutation testing**: Verifica qualità test
4. **Contract testing**: Per API pubbliche

### Ottimizzazione

1. **Parallelizzazione selettiva**: Dove safe
2. **Test selection**: Eseguire solo test rilevanti per cambiamenti
3. **Cache optimization**: Velocizzare CI
4. **Snapshot testing**: Per UI components

---

## 💡 Best Practices Identificate

### Test Organization

- ✅ Struttura chiara: unit/integration/e2e
- ✅ Un modulo = una directory
- ✅ Naming consistente: `*.test.ts`, `*.integration.test.ts`, `*.e2e.test.ts`

### Test Quality

- ✅ AAA pattern (Arrange, Act, Assert)
- ✅ Nomi descrittivi: `should [behavior] when [condition]`
- ✅ Un test = un comportamento
- ✅ Test indipendenti e isolati

### Mock Strategy

- ✅ Unit: Mock tutto tranne il codice sotto test
- ✅ Integration: Mock solo servizi esterni
- ✅ E2E: Nessun mock, sistema reale

### Data Management

- ✅ Factory functions per dati test
- ✅ Seed data minimo ma rappresentativo
- ✅ Cleanup automatico tra test suite
- ✅ Dati idempotenti (ripetibili)

### Error Handling

- ✅ Test casi successo E fallimento
- ✅ Test edge cases
- ✅ Test error messages
- ✅ Test rollback e recovery

---

## 📚 Risorse e Riferimenti

### Documentation

- [Vitest Documentation](https://vitest.dev/)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [Fastify Testing](https://www.fastify.io/docs/latest/Guides/Testing/)
- [Keycloak Admin Client](https://www.keycloak.org/docs/latest/server_admin/)

### Tools

- **Vitest**: Test runner
- **Docker**: Container infrastructure
- **GitHub Actions**: CI/CD
- **Codecov**: Coverage reporting

### Internal Files

- `apps/core-api/src/__tests__/README.md`: Test documentation esistente
- `test-infrastructure/README.md`: Infrastructure documentation
- `TEST_IMPLEMENTATION_PLAN.md`: Questo documento

---

## 🎯 Conclusioni

### Obiettivi Raggiunti

✅ Sistema di test completo da sistema vuoto  
✅ Dati iniziali minimi per test veloci  
✅ Supporto tutti i livelli (unit, integration, e2e)  
✅ Container Docker isolati  
✅ CI/CD automatizzato su GitHub Actions  
✅ Reset completo pre-suite (test sequenziali)  
✅ Dati quickstart per demo

### Benefici

- **Affidabilità**: Test robusti e ripetibili
- **Velocità**: Test ottimizzati per performance
- **Manutenibilità**: Struttura chiara e consistente
- **Scalabilità**: Facile aggiungere nuovi test
- **Documentazione**: Test documentano il comportamento
- **CI/CD**: Automazione completa

### Impatto

- **Qualità del codice**: Maggiore confidenza nei cambiamenti
- **Onboarding**: Nuovi sviluppatori capiscono il sistema dai test
- **Refactoring**: Possibile refactoring sicuro
- **Bug detection**: Trovare bug prima della produzione
- **Regression**: Prevenire regressioni

### Metriche Finali

- **Coverage complessivo**: ≥80%
- **Test count**: ~500+ test
- **CI pipeline**: < 10 minuti
- **Test stability**: ≥99%

---

## 🙏 Note Finali

Questo piano di implementazione è stato creato il **28 Gennaio 2025** basandosi sull'analisi approfondita del codice esistente in Plexica core-api.

Il piano segue le decisioni architetturali concordate:

- ✅ Dati iniziali base (minimi necessari)
- ✅ Keycloak reale con seed
- ✅ Docker container per test isolati
- ✅ Tutti i livelli di test in parallelo
- ✅ GitHub Actions per CI/CD
- ✅ Reset completo pre-suite (test sequenziali)

**Ordine di implementazione**: Auth → Tenant → Workspace → Plugin

Il piano è flessibile e può essere adattato durante l'implementazione in base alle esigenze emergenti.

---

**Fine del documento**

**Priorità:** MEDIA  
**Effort:** 1-2 giorni  
**Obiettivo:** Automatizzare test su GitHub Actions

### Task 6.1: GitHub Actions Workflow

**File:** `.github/workflows/test-core-api.yml`

```yaml
name: Core API Tests

on:
  pull_request:
    paths:
      - 'apps/core-api/**'
      - 'packages/database/**'
      - 'packages/event-bus/**'
      - 'test-infrastructure/**'
      - '.github/workflows/test-core-api.yml'
  push:
    branches: [main, develop]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  setup:
    name: Setup Test Infrastructure
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install pnpm
        run: npm install -g pnpm@10.28.1

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

  test-unit:
    name: Unit Tests
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install pnpm
        run: npm install -g pnpm@10.28.1

      - name: Restore dependencies
        uses: actions/cache@v3
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Run unit tests
        run: pnpm --filter @plexica/core-api test:unit

      - name: Upload unit test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: unit-test-results
          path: apps/core-api/coverage/

  test-integration:
    name: Integration Tests
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install pnpm
        run: npm install -g pnpm@10.28.1

      - name: Restore dependencies
        uses: actions/cache@v3
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Setup test infrastructure
        run: |
          cd test-infrastructure/scripts
          bash test-setup.sh
        timeout-minutes: 5

      - name: Run integration tests
        run: pnpm --filter @plexica/core-api test:integration

      - name: Upload integration test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: integration-test-results
          path: apps/core-api/coverage/

      - name: Teardown infrastructure
        if: always()
        run: |
          cd test-infrastructure/scripts
          bash test-teardown.sh

  test-e2e:
    name: E2E Tests
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install pnpm
        run: npm install -g pnpm@10.28.1

      - name: Restore dependencies
        uses: actions/cache@v3
        with:
          path: |
            node_modules
            apps/*/node_modules
            packages/*/node_modules
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Setup test infrastructure
        run: |
          cd test-infrastructure/scripts
          bash test-setup.sh
        timeout-minutes: 5

      - name: Run E2E tests
        run: pnpm --filter @plexica/core-api test:e2e

      - name: Upload E2E test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-test-results
          path: apps/core-api/coverage/

      - name: Upload logs on failure
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: docker-logs
          path: test-infrastructure/docker/*.log

      - name: Teardown infrastructure
        if: always()
        run: |
          cd test-infrastructure/scripts
          bash test-teardown.sh

  coverage:
    name: Coverage Report
    needs: [test-unit, test-integration, test-e2e]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download all test results
        uses: actions/download-artifact@v3

      - name: Merge coverage reports
        run: |
          # Merge coverage from all test types
          # This is a placeholder - implement based on your coverage tool
          echo "Coverage reports merged"

      - name: Upload to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./apps/core-api/coverage/coverage-final.json
          flags: core-api
          name: core-api-coverage
          fail_ci_if_error: false

      - name: Comment PR with coverage
        if: github.event_name == 'pull_request'
        uses: romeovs/lcov-reporter-action@v0.3.1
        with:
          lcov-file: ./apps/core-api/coverage/lcov.info
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Task 6.2: Badge Documentation

**File:** `apps/core-api/README.md` (aggiungere badges)

```markdown
# Core API

![Tests](https://github.com/plexica/plexica/workflows/Core%20API%20Tests/badge.svg)
[![Coverage](https://codecov.io/gh/plexica/plexica/branch/main/graph/badge.svg?flag=core-api)](https://codecov.io/gh/plexica/plexica)

## Test Status

- **Unit Tests**: ≥90% coverage
- **Integration Tests**: ≥85% coverage
- **E2E Tests**: ≥70% coverage
- **Overall**: ≥80% coverage
```

### Deliverables Phase 6

- ✅ GitHub Actions workflow completo
- ✅ Cache per dependencies
- ✅ Parallel job execution (unit, integration, e2e)
- ✅ Coverage merge e upload
- ✅ Artifact upload per test results
- ✅ PR comments con coverage
- ✅ Badges in README

**Tempo stimato:** 1-2 giorni

---

## 📚 PHASE 7: Quickstart Data

**Priorità:** BASSA  
**Effort:** 1 giorno  
**Obiettivo:** Creare dati demo per quickstart

### Task 7.1: Quickstart Seed Data

**File:** `test-infrastructure/fixtures/quickstart-seed.ts`

```typescript
import { PrismaClient, TenantStatus, PluginStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const QUICKSTART_SEED_DATA = {
  tenants: [
    {
      id: 'demo-tenant-acme',
      slug: 'acme-demo',
      name: 'Acme Demo Corporation',
      status: TenantStatus.ACTIVE,
      settings: {
        timezone: 'America/New_York',
        locale: 'en-US',
        features: {
          workspaces: true,
          plugins: true,
          analytics: true,
        },
      },
      theme: {
        primaryColor: '#3B82F6',
        secondaryColor: '#8B5CF6',
        logo: '/logos/acme-demo.png',
      },
    },
  ],
  users: [
    {
      id: 'demo-admin',
      keycloakId: 'kc-demo-admin',
      email: 'admin@acme-demo.local',
      firstName: 'John',
      lastName: 'Admin',
      locale: 'en-US',
    },
    {
      id: 'demo-user-1',
      keycloakId: 'kc-demo-user-1',
      email: 'john.doe@acme-demo.local',
      firstName: 'John',
      lastName: 'Doe',
      locale: 'en-US',
    },
    {
      id: 'demo-user-2',
      keycloakId: 'kc-demo-user-2',
      email: 'jane.smith@acme-demo.local',
      firstName: 'Jane',
      lastName: 'Smith',
      locale: 'en-US',
    },
  ],
  workspaces: [
    {
      id: 'demo-ws-sales',
      slug: 'sales',
      name: 'Sales Team',
      description: 'Workspace for sales team',
      tenantId: 'demo-tenant-acme',
      settings: { theme: 'light' },
    },
    {
      id: 'demo-ws-marketing',
      slug: 'marketing',
      name: 'Marketing Team',
      description: 'Workspace for marketing team',
      tenantId: 'demo-tenant-acme',
      settings: { theme: 'dark' },
    },
  ],
  plugins: [
    {
      pluginId: 'crm',
      tenantId: 'demo-tenant-acme',
      version: '1.2.0',
      enabled: true,
      configuration: {
        syncInterval: 60,
        enableNotifications: true,
      },
    },
    {
      pluginId: 'analytics',
      tenantId: 'demo-tenant-acme',
      version: '2.0.1',
      enabled: false,
      configuration: {
        refreshInterval: 300,
      },
    },
  ],
};

async function seed() {
  console.log('🌱 Seeding quickstart demo data...\n');

  // Seed tenants, users, workspaces, plugins
  // Similar to minimal-seed.ts but with more data

  console.log('\n✅ Quickstart seed complete!\n');
  console.log('📊 Demo Credentials:');
  console.log('  Admin: admin@acme-demo.local / Demo123!');
  console.log('  User 1: john.doe@acme-demo.local / Demo123!');
  console.log('  User 2: jane.smith@acme-demo.local / Demo123!');
}

seed()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

### Task 7.2: Quickstart Setup Script

**File:** `test-infrastructure/scripts/quickstart-setup.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Setting up Plexica Quickstart Demo..."

# Use same infrastructure as test-setup
bash "$(dirname "$0")/test-setup.sh"

# Seed quickstart data instead of minimal
echo "🌱 Seeding quickstart demo data..."
cd "$(dirname "$0")/.."
node -r esbuild-register fixtures/quickstart-seed.ts

echo ""
echo "✅ Quickstart demo is ready!"
echo ""
echo "🎯 Access the demo:"
echo "  Web App:    http://localhost:3000"
echo "  Core API:   http://localhost:3001"
echo "  Keycloak:   http://localhost:8081"
echo ""
echo "👤 Demo Credentials:"
echo "  Admin:  admin@acme-demo.local / Demo123!"
echo "  User 1: john.doe@acme-demo.local / Demo123!"
echo "  User 2: jane.smith@acme-demo.local / Demo123!"
echo ""
echo "🏢 Demo Tenant: acme-demo"
echo "🏢 Workspaces: sales, marketing"
echo "🔌 Plugins: CRM (active), Analytics (inactive)"
echo ""
```

**Rendere eseguibile:**

```bash
chmod +x test-infrastructure/scripts/quickstart-setup.sh
```

### Task 7.3: Quickstart Documentation

**File:** `test-infrastructure/README.md`

````markdown
# Test Infrastructure

This directory contains all test infrastructure for Plexica.

## Quick Start

### For Development Testing

```bash
# Setup test infrastructure
pnpm --filter @plexica/core-api test:setup

# Run tests
pnpm --filter @plexica/core-api test:unit
pnpm --filter @plexica/core-api test:integration
pnpm --filter @plexica/core-api test:e2e

# Teardown
pnpm --filter @plexica/core-api test:teardown
```
````

### For Demo/Quickstart

```bash
# Setup demo with sample data
bash test-infrastructure/scripts/quickstart-setup.sh

# Access demo at http://localhost:3000
# Login with: admin@acme-demo.local / Demo123!

# Teardown
bash test-infrastructure/scripts/test-teardown.sh
```

## Architecture

### Docker Services

- **PostgreSQL** (port 5433): Test database
- **Keycloak** (port 8081): Identity management
- **Redis** (port 6380): Caching
- **MinIO** (port 9010/9011): Object storage

All services use `tmpfs` for performance.

### Test Data

- **Minimal Seed**: Minimal data for fast tests
  - 1 tenant
  - 2 users
  - 1 workspace
  - No plugins
- **Quickstart Seed**: Rich data for demo
  - 1 tenant (acme-demo)
  - 3 users
  - 2 workspaces
  - 2 plugins (CRM active, Analytics inactive)

### Helpers

- `TestDatabaseHelper`: Database operations
- `TestKeycloakHelper`: Keycloak management
- `TestAuthHelper`: Authentication utilities

## Test Structure

```
apps/core-api/src/__tests__/
├── auth/       # Authentication & authorization
├── tenant/     # Multi-tenancy
├── workspace/  # Workspaces & collaboration
└── plugin/     # Plugin system
```

Each module has:

- `unit/`: Unit tests (mocks)
- `integration/`: Integration tests (real DB, mock external services)
- `e2e/`: End-to-end tests (no mocks)

## Troubleshooting

### Docker not starting

```bash
# Check Docker is running
docker info

# View logs
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs
```

### Tests failing

```bash
# Reset test data
pnpm --filter @plexica/core-api test:reset

# Clean restart
pnpm --filter @plexica/core-api test:teardown
pnpm --filter @plexica/core-api test:setup
```

### Port conflicts

Edit `test-infrastructure/docker/docker-compose.test.yml` to change ports.

````

### Deliverables Phase 7

- ✅ Quickstart seed data
- ✅ Quickstart setup script
- ✅ Comprehensive documentation
- ✅ Troubleshooting guide

**Tempo stimato:** 1 giorno

---


**Priorità:** ALTA
**Effort:** 4-5 giorni
**Obiettivo:** Completare test per sistema plugin (lifecycle, comunicazione, marketplace)

### Analisi Gap Esistenti

**Test già presenti (eccellenti):**

- ✅ `plugin.service.test.ts` - Basic tests
- ✅ `plugin-service-extended.test.ts` (807 linee) - Completo!
- ✅ `plugin-manifest.test.ts` (529 linee) - Schema validation
- ✅ `plugin-communication.test.ts` (518 linee) - Communication
- ✅ `dependency-resolution.test.ts` - Dependencies
- ✅ `plugin-api-gateway.test.ts` - API Gateway
- ✅ `service-registry.test.ts` - Service registry
- ✅ `shared-data.test.ts` - Shared data

**Gap critici da coprire:**

- 🔴 Lifecycle hooks execution (attualmente stub)
- 🔴 Marketplace service implementation
- 🔴 Plugin versioning (upgrade/downgrade)
- 🔴 Plugin authentication
- 🟡 Transaction rollback tests
- 🟡 Performance tests

### Task 5.1: Riorganizzare Test Esistenti

**Azioni:**

```bash
# Spostare test esistenti nella nuova struttura
mv src/__tests__/plugin.service.test.ts src/__tests__/plugin/unit/plugin-basic.test.ts
mv src/__tests__/services/plugin-service-extended.test.ts src/__tests__/plugin/unit/plugin-service.test.ts
mv src/__tests__/schemas/plugin-manifest.test.ts src/__tests__/plugin/unit/plugin-manifest.test.ts
mv src/__tests__/services/dependency-resolution.test.ts src/__tests__/plugin/unit/dependency-resolution.test.ts
mv src/__tests__/services/plugin-api-gateway.test.ts src/__tests__/plugin/unit/plugin-api-gateway.test.ts
mv src/__tests__/services/service-registry.test.ts src/__tests__/plugin/unit/service-registry.test.ts
mv src/__tests__/services/shared-data.test.ts src/__tests__/plugin/unit/shared-data.test.ts
mv src/__tests__/integration/plugin-communication.test.ts src/__tests__/plugin/integration/
````

### Task 5.2: Unit Tests - Plugin Hooks

**File:** `src/__tests__/plugin/unit/plugin-hooks.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Lifecycle Hooks', () => {
  describe('Hook Execution', () => {
    - should execute install hook after installation
    - should execute activate hook on activation
    - should execute deactivate hook on deactivation
    - should execute uninstall hook before uninstallation
    - should pass correct context to hooks
    - should timeout long-running hooks (30s default)
    - should handle hook errors gracefully
    - should log hook execution
  });

  describe('Hook Context', () => {
    - should pass tenant context
    - should pass plugin configuration
    - should pass user context
    - should pass workspace context (if applicable)
    - should include database connection
    - should include logger
  });

  describe('Hook Rollback', () => {
    - should rollback installation on install hook failure
    - should not activate if activate hook fails
    - should handle partial rollback scenarios
  });

  describe('Hook Timeout', () => {
    - should timeout after configured duration
    - should kill hook process
    - should mark hook as failed
    - should trigger rollback
  });

  describe('Hook Error Handling', () => {
    - should catch synchronous errors
    - should catch async errors
    - should catch unhandled promise rejections
    - should log error details
  });
});
```

### Task 5.3: Unit Tests - Plugin Versioning

**File:** `src/__tests__/plugin/unit/plugin-versioning.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Versioning', () => {
  describe('Version Upgrade', () => {
    - should upgrade plugin to newer version
    - should run migration between versions
    - should update installed version in DB
    - should preserve user configuration
    - should check dependency versions
    - should prevent downgrade via upgrade API
  });

  describe('Version Downgrade', () => {
    - should downgrade plugin to older version
    - should run reverse migration
    - should update installed version
    - should warn about data loss
  });

  describe('Version Compatibility', () => {
    - should check API compatibility
    - should check dependency versions on upgrade
    - should prevent incompatible upgrades
    - should suggest compatible versions
  });

  describe('Version Rollback', () => {
    - should rollback failed upgrade
    - should restore previous version
    - should restore previous configuration
    - should run rollback migration
  });

  describe('Multiple Versions', () => {
    - should allow different tenants on different versions
    - should track version per tenant
    - should support version pinning
  });
});
```

**File:** `src/__tests__/plugin/unit/plugin-auth.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Authentication', () => {
  describe('API Key Generation', () => {
    - should generate unique API key for plugin
    - should hash API key before storage
    - should store key metadata (permissions, expiry)
    - should return unhashed key only once
  });

  describe('API Key Validation', () => {
    - should validate API key against hash
    - should reject invalid key
    - should reject expired key
    - should check key permissions
    - should check key is for correct plugin
  });

  describe('API Key Permissions', () => {
    - should enforce read/write permissions
    - should enforce resource scoping
    - should support wildcard permissions
    - should deny by default
  });

  describe('API Key Revocation', () => {
    - should revoke API key
    - should reject revoked key
    - should revoke all keys for plugin
    - should log revocation event
  });

  describe('API Key Rotation', () => {
    - should support key rotation
    - should allow grace period
    - should invalidate old key after rotation
  });
});
```

### Task 5.4: Integration Tests - Plugin Lifecycle

**File:** `src/__tests__/plugin/integration/plugin-lifecycle.integration.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Lifecycle Integration', () => {
  it('should complete full lifecycle', async () => {
    // 1. Register plugin in registry
    // 2. Verify plugin in DRAFT status
    // 3. Publish plugin (PUBLISHED status)
    // 4. Install plugin for tenant
    // 5. Verify plugin installed but disabled
    // 6. Activate plugin
    // 7. Verify plugin active
    // 8. Make API call to plugin
    // 9. Verify response
    // 10. Deactivate plugin
    // 11. Verify plugin disabled
    // 12. Uninstall plugin
    // 13. Verify plugin removed
  });

  it('should handle lifecycle with dependencies', async () => {
    // 1. Register plugin A
    // 2. Register plugin B (depends on A)
    // 3. Install A for tenant
    // 4. Install B for tenant
    // 5. Activate A
    // 6. Activate B
    // 7. Attempt to uninstall A (should fail - B depends on it)
    // 8. Uninstall B first
    // 9. Uninstall A (should succeed)
  });

  it('should enforce transaction boundaries', async () => {
    // Simulate failure during install
    // Verify all changes rolled back
    // Verify no partial state
  });

  it('should cleanup on failure', async () => {
    // Trigger error during activation
    // Verify cleanup occurred
    // Verify plugin back to previous state
  });
});
```

**File:** `src/__tests__/plugin/integration/plugin-marketplace.integration.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Marketplace Integration', () => {
  describe('Publish Plugin', () => {
    - should publish plugin to marketplace
    - should validate manifest
    - should set status to PENDING_REVIEW
    - should notify reviewers
    - should include plugin metadata
  });

  describe('Review Plugin', () => {
    - should approve plugin (PUBLISHED)
    - should reject plugin (REJECTED) with reason
    - should request changes
    - should notify plugin author
  });

  describe('Search Plugins', () => {
    - should search by name
    - should search by description
    - should filter by category
    - should filter by rating
    - should sort by popularity
    - should paginate results
  });

  describe('Rate Plugin', () => {
    - should submit rating (1-5 stars)
    - should submit review text
    - should update average rating
    - should prevent duplicate ratings per user
    - should allow updating own rating
  });

  describe('Download Plugin', () => {
    - should increment download count
    - should track download by tenant
    - should return plugin assets
  });

  describe('Track Installation', () => {
    - should increment install count
    - should track active installations
    - should track installation history
  });

  describe('Plugin Analytics', () => {
    - should return download stats
    - should return installation stats
    - should return rating distribution
    - should return version distribution
  });
});
```

### Task 5.5: Integration Tests - Plugin Transaction Safety

**File:** `src/__tests__/plugin/integration/plugin-transactions.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Transaction Safety', () => {
  it('should rollback on database error', async () => {
    // Simulate DB error during install
    // Verify installation record not created
    // Verify service not registered
  });

  it('should rollback on service registration error', async () => {
    // Install plugin
    // Simulate error during service registration
    // Verify installation rolled back
  });

  it('should rollback on hook error', async () => {
    // Install plugin with failing hook
    // Verify installation rolled back
    // Verify state is clean
  });

  it('should handle partial failures gracefully', async () => {
    // Simulate failure midway through install
    // Verify compensation actions executed
    // Verify system in consistent state
  });

  it('should use Saga pattern for distributed transactions', async () => {
    // Complex install with multiple services
    // Trigger failure in step 3 of 5
    // Verify steps 1-2 compensated
    // Verify steps 4-5 never executed
  });
});
```

### Task 5.6: E2E Tests - Plugin Ecosystem

**File:** `src/__tests__/plugin/e2e/plugin-ecosystem.e2e.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Ecosystem E2E', () => {
  it('should support complete plugin ecosystem', async () => {
    // 1. Developer registers CRM plugin
    // 2. Developer registers Analytics plugin (depends on CRM)
    // 3. Super admin reviews and approves CRM
    // 4. Super admin reviews and approves Analytics
    // 5. Tenant installs CRM
    // 6. Tenant configures CRM
    // 7. Tenant activates CRM
    // 8. CRM creates database tables
    // 9. User creates contact in CRM
    // 10. CRM emits "contact.created" event
    // 11. Tenant installs Analytics
    // 12. Tenant activates Analytics
    // 13. Analytics subscribes to CRM events
    // 14. Analytics receives "contact.created" event
    // 15. Analytics calls CRM API to fetch contact details
    // 16. Analytics stores analytics data
    // 17. User views analytics dashboard
    // 18. Tenant attempts to uninstall CRM (should fail - Analytics depends on it)
    // 19. Tenant uninstalls Analytics first
    // 20. Tenant uninstalls CRM (should succeed)
  });

  it('should handle plugin version upgrades', async () => {
    // 1. Install CRM v1.0.0
    // 2. Use CRM, create data
    // 3. Upgrade to CRM v1.1.0
    // 4. Run migration
    // 5. Verify data intact
    // 6. Verify new features available
  });

  it('should support plugin marketplace workflow', async () => {
    // 1. Browse marketplace
    // 2. Search for "CRM"
    // 3. View plugin details
    // 4. Read reviews
    // 5. Install plugin
    // 6. Rate plugin
    // 7. Write review
  });
});
```

### Task 5.7: Performance Tests

**File:** `src/__tests__/plugin/integration/plugin-performance.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Performance', () => {
  it('should handle 100 concurrent API calls', async () => {
    // Make 100 concurrent plugin API calls
    // All should complete in < 5 seconds
    // No rate limiting errors
  });

  it('should cache service discovery', async () => {
    // First call: query service registry
    // Subsequent calls: use cache
    // Verify cache hit rate > 95%
  });

  it('should optimize dependency resolution', async () => {
    // Complex dependency graph (10+ plugins)
    // Resolution should complete in < 1 second
  });

  it('should handle large dependency graphs', async () => {
    // 50+ plugins with interconnected dependencies
    // Topological sort should complete quickly
    // Circular detection should be fast
  });

  it('should efficiently query installed plugins', async () => {
    // Tenant with 20+ installed plugins
    // Query should use indexes
    // Result in < 100ms
  });
});
```

### Task 5.8: Security Tests

**File:** `src/__tests__/plugin/integration/plugin-security.test.ts`

**Test cases principali:**

```typescript
describe('Plugin Security', () => {
  it('should validate plugin manifest', async () => {
    // Reject malicious manifest
    // Validate all fields
    // Prevent code injection
  });

  it('should sandbox plugin execution', async () => {
    // Plugin cannot access file system
    // Plugin cannot access other plugins' data
    // Plugin cannot escape sandbox
  });

  it('should enforce API permissions', async () => {
    // Plugin with read-only permission
    // Attempt write operation (should fail)
  });

  it('should prevent plugin-to-plugin attacks', async () => {
    // Malicious plugin attempts to call internal API
    // Should be denied
  });

  it('should audit plugin operations', async () => {
    // Log all plugin API calls
    // Log all sensitive operations
    // Track access patterns
  });
});
```

### Deliverables Phase 5

- ✅ Test plugin riorganizzati
- ✅ Plugin hooks unit tests
- ✅ Plugin versioning unit tests
- ✅ Plugin auth unit tests
- ✅ Plugin lifecycle integration tests
- ✅ Plugin marketplace integration tests
- ✅ Plugin transaction safety tests
- ✅ Plugin ecosystem E2E tests
- ✅ Plugin performance tests
- ✅ Plugin security tests
- ✅ Coverage plugin module: ≥80%

**Tempo stimato:** 4-5 giorni

---

**Priorità:** ALTA  
**Effort:** 3-4 giorni  
**Obiettivo:** Completare test per sistema workspace e collaborazione

### Analisi Gap Esistenti

**Test già presenti (buoni):**

- ✅ `workspace.core-logic.test.ts` - Business logic
- ✅ `workspace.integration.test.ts` - Integration con mock
- ✅ `workspace.e2e.test.ts` - E2E con DB reale
- ✅ `workspace-tenant-api.integration.test.ts` - Tenant API
- ✅ `workspace-tenant-isolation.test.ts` - Isolamento

**Gap da coprire:**

- 🔴 Team management tests
- 🔴 Permission matrix tests completi
- 🟡 Workspace members concurrent operations
- 🟡 Last admin bypass fix

### Task 4.1: Riorganizzare Test Esistenti

**Azioni:**

```bash
# Spostare test esistenti nella nuova struttura
mv src/__tests__/workspace.core-logic.test.ts src/__tests__/workspace/unit/workspace-logic.test.ts
mv src/__tests__/workspace.integration.test.ts src/__tests__/workspace/integration/workspace-api.integration.test.ts
mv src/__tests__/workspace.e2e.test.ts src/__tests__/workspace/e2e/workspace-lifecycle.e2e.test.ts
mv src/__tests__/workspace-tenant-api.integration.test.ts src/__tests__/workspace/integration/workspace-tenant.integration.test.ts
mv src/__tests__/workspace-tenant-isolation.test.ts src/__tests__/workspace/unit/workspace-isolation.test.ts
```

### Task 4.2: Unit Tests - Workspace Permissions

**File:** `src/__tests__/workspace/unit/workspace-permissions.test.ts`

**Test cases principali:**

```typescript
describe('Workspace Permissions', () => {
  describe('ADMIN Role', () => {
    - can view workspace details
    - can update workspace (name, description, settings)
    - can delete workspace
    - can add members with any role
    - can remove members (except if last admin)
    - can update member roles
    - can create teams
    - can update teams
    - can delete teams
    - can manage team members
  });

  describe('MEMBER Role', () => {
    - can view workspace details
    - can view workspace members
    - can view teams
    - cannot update workspace
    - cannot delete workspace
    - cannot add members
    - cannot remove members
    - cannot update member roles
    - cannot create teams
    - cannot delete teams
  });

  describe('VIEWER Role', () => {
    - can view workspace details
    - can view workspace members (read-only)
    - can view teams (read-only)
    - cannot perform any write operations
  });

  describe('Last Admin Protection', () => {
    - should prevent removing last admin
    - should prevent demoting last admin to member/viewer
    - should allow if multiple admins exist
    - should check before role update
    - should check before member removal
  });

  describe('Permission Edge Cases', () => {
    - creator becomes admin automatically
    - admin can demote themselves if others exist
    - cannot remove yourself if you're the last admin
  });
});
```

**File:** `src/__tests__/workspace/unit/workspace-validation.test.ts`

**Test cases principali:**

```typescript
describe('Workspace Validation', () => {
  describe('Slug Validation', () => {
    - should validate slug format (alphanumeric + hyphens)
    - should reject invalid characters
    - should enforce min length (3 chars)
    - should enforce max length (64 chars)
    - should ensure uniqueness per tenant
    - should allow same slug in different tenants
  });

  describe('Name Validation', () => {
    - should enforce min length
    - should enforce max length
    - should trim whitespace
  });

  describe('Settings Validation', () => {
    - should validate settings as JSON object
    - should reject invalid JSON
    - should accept empty settings
  });

  describe('Member Validation', () => {
    - should validate role enum
    - should validate user exists
    - should prevent duplicate members
  });
});
```

### Task 4.3: Integration Tests - Workspace Members

**File:** `src/__tests__/workspace/integration/workspace-members.integration.test.ts`

**Test cases principali:**

```typescript
describe('Workspace Members Integration', () => {
  describe('Add Member', () => {
    - should add member with default role (MEMBER)
    - should add member with specific role
    - should reject duplicate member (409)
    - should enforce permissions (ADMIN only)
    - should return 403 for non-admin
    - should validate user exists
  });

  describe('Update Member Role', () => {
    - should update member role (ADMIN action)
    - should prevent demoting last admin
    - should allow admin to demote self if others exist
    - should validate new role
    - should return 403 for non-admin
  });

  describe('Remove Member', () => {
    - should remove member (ADMIN action)
    - should prevent removing last admin
    - should cascade delete team memberships
    - should return 403 for non-admin
    - should return 404 for non-member
  });

  describe('List Members', () => {
    - should list all members (any role)
    - should include user details
    - should include role and join date
    - should filter by role (query param)
    - should paginate results
  });

  describe('Get Member', () => {
    - should get specific member details
    - should include full user profile
    - should return 404 for non-member
  });
});
```

**File:** `src/__tests__/workspace/integration/workspace-teams.integration.test.ts`

**Test cases principali:**

```typescript
describe('Workspace Teams Integration', () => {
  describe('Create Team', () => {
    - should create team in workspace (ADMIN only)
    - should set creator as owner
    - should validate team name
    - should return 403 for non-admin
  });

  describe('Update Team', () => {
    - should update team name
    - should update team description
    - should enforce permissions (ADMIN or team owner)
    - should return 403 for non-authorized
  });

  describe('Delete Team', () => {
    - should delete team (ADMIN or owner)
    - should remove all team members
    - should cascade delete properly
    - should prevent deletion of default team (if exists)
  });

  describe('Team Members', () => {
    - should add member to team
    - should remove member from team
    - should list team members
    - should validate member is in workspace
  });

  describe('Team List', () => {
    - should list all teams in workspace
    - should include member count
    - should filter by owner
  });
});
```

### Task 4.4: Integration Tests - Workspace API Complete

**File:** `src/__tests__/workspace/integration/workspace-crud.integration.test.ts`

**Test cases principali:**

```typescript
describe('Workspace CRUD Integration', () => {
  describe('Create Workspace', () => {
    - should create workspace for authenticated user
    - creator becomes ADMIN automatically
    - should validate slug uniqueness per tenant
    - should set default settings
    - should return 201 with workspace data
  });

  describe('List Workspaces', () => {
    - should list user's workspaces
    - should include role in each workspace
    - should filter by role (query param)
    - should paginate results
    - should sort by name or createdAt
  });

  describe('Get Workspace', () => {
    - should get workspace details
    - should include member count
    - should include team count
    - should include user's role
    - should return 404 for non-member
  });

  describe('Update Workspace', () => {
    - should update name (ADMIN only)
    - should update description (ADMIN only)
    - should update settings (ADMIN only)
    - should return 403 for non-admin
    - should validate updates
  });

  describe('Delete Workspace', () => {
    - should delete workspace (ADMIN only)
    - should prevent deletion with teams
    - should cascade delete members
    - should return 403 for non-admin
  });
});
```

### Task 4.5: E2E Tests - Workspace Collaboration

**File:** `src/__tests__/workspace/e2e/workspace-collaboration.e2e.test.ts`

**Test cases principali:**

```typescript
describe('Workspace Collaboration E2E', () => {
  it('should support full collaboration workflow', async () => {
    // 1. Admin creates workspace
    // 2. Admin adds member1 (MEMBER role)
    // 3. Admin adds member2 (VIEWER role)
    // 4. Admin creates team
    // 5. Admin adds member1 to team
    // 6. Member1 views workspace (allowed)
    // 7. Member1 attempts to update workspace (denied)
    // 8. Member2 views workspace (allowed)
    // 9. Member2 attempts to add member (denied)
    // 10. Admin promotes member1 to ADMIN
    // 11. Member1 can now update workspace
    // 12. Member1 adds member3
    // 13. Admin demotes self to MEMBER (allowed, member1 is admin)
  });

  it('should enforce last admin protection', async () => {
    // 1. Create workspace (admin1)
    // 2. Add admin2 as ADMIN
    // 3. Admin1 demotes self to MEMBER (allowed)
    // 4. Admin2 attempts to remove self (denied - last admin)
    // 5. Admin2 adds admin3 as ADMIN
    // 6. Admin2 can now remove self
  });

  it('should handle large workspace (100+ members)', async () => {
    // 1. Create workspace
    // 2. Add 100 members
    // 3. List members with pagination
    // 4. Performance should be acceptable
  });
});
```

**File:** `src/__tests__/workspace/e2e/workspace-teams.e2e.test.ts`

**Test cases principali:**

```typescript
describe('Workspace Teams E2E', () => {
  it('should manage teams end-to-end', async () => {
    // 1. Create workspace
    // 2. Add several members
    // 3. Create team "Engineering"
    // 4. Add members to Engineering team
    // 5. Create team "Design"
    // 6. Add members to Design team
    // 7. Member can be in multiple teams
    // 8. Update team name
    // 9. Remove member from team
    // 10. Delete team
    // 11. Verify members still in workspace
  });
});
```

### Task 4.6: Integration Tests - Concurrent Operations

**File:** `src/__tests__/workspace/integration/workspace-concurrent.test.ts`

**Test cases principali:**

```typescript
describe('Workspace Concurrent Operations', () => {
  it('should handle concurrent member additions', async () => {
    // Add multiple members simultaneously
    // All should succeed
  });

  it('should handle concurrent role updates', async () => {
    // Update roles concurrently
    // Should handle with proper locking
  });

  it('should prevent race condition on last admin', async () => {
    // Two admins try to remove themselves concurrently
    // One should fail (last admin protection)
  });

  it('should handle concurrent workspace updates', async () => {
    // Update workspace settings concurrently
    // Last write wins (or use optimistic locking)
  });

  it('should handle concurrent team operations', async () => {
    // Create/update teams concurrently
    // Should handle gracefully
  });
});
```

### Deliverables Phase 4

- ✅ Test workspace riorganizzati
- ✅ Workspace permissions unit tests (complete matrix)
- ✅ Workspace validation unit tests
- ✅ Workspace members integration tests
- ✅ Workspace teams integration tests
- ✅ Workspace CRUD integration tests
- ✅ Workspace collaboration E2E tests
- ✅ Workspace teams E2E tests
- ✅ Concurrent operations tests
- ✅ Coverage workspace module: ≥85%

**Tempo stimato:** 3-4 giorni

---

**Priorità:** ALTA  
**Effort:** 2-3 giorni  
**Obiettivo:** Completare test per sistema multi-tenant

### Analisi Gap Esistenti

**Test già presenti (buoni):**

- ✅ `tenant.service.test.ts` (379 linee) - Unit tests
- ✅ `tenant-context.middleware.test.ts` (298 linee) - Middleware
- ✅ `tenant-context-helpers.test.ts` - Helpers
- ✅ `multi-tenant-isolation.integration.test.ts` (355 linee) - Isolamento
- ✅ `tenant-provisioning.service.test.ts` (173 linee) - Provisioning

**Gap da coprire:**

- 🔴 E2E provisioning completo (con Keycloak reale)
- 🟡 Concurrent tenant operations
- 🟡 Tenant lifecycle edge cases
- 🟡 Schema migration tests

### Task 3.1: Riorganizzare Test Esistenti

**Azioni:**

```bash
# Spostare test esistenti nella nuova struttura
mv src/__tests__/tenant.service.test.ts src/__tests__/tenant/unit/
mv src/__tests__/tenant-context.middleware.test.ts src/__tests__/tenant/unit/
mv src/__tests__/tenant-context-helpers.test.ts src/__tests__/tenant/unit/
mv src/__tests__/multi-tenant-isolation.integration.test.ts src/__tests__/tenant/integration/tenant-isolation.integration.test.ts
mv src/__tests__/tenant-provisioning.service.test.ts src/__tests__/tenant/unit/
```

### Task 3.2: Unit Tests - Tenant Lifecycle

**File:** `src/__tests__/tenant/unit/tenant-lifecycle.test.ts`

**Test cases principali:**

```typescript
describe('Tenant Lifecycle', () => {
  describe('State Transitions', () => {
    - should transition from PROVISIONING to ACTIVE
    - should transition from ACTIVE to SUSPENDED
    - should transition from SUSPENDED to ACTIVE (reactivate)
    - should transition from ACTIVE to PENDING_DELETION
    - should transition from PENDING_DELETION to DELETED
    - should reject invalid state transitions
    - should track transition history
  });

  describe('Edge Cases', () => {
    - should handle duplicate slug (reject)
    - should handle special characters in slug
    - should enforce slug format (lowercase, alphanumeric, hyphens)
    - should handle provisioning failure gracefully
    - should rollback on Keycloak failure
    - should rollback on schema creation failure
  });

  describe('Validation', () => {
    - should validate tenant name length
    - should validate slug format
    - should validate settings schema
    - should validate theme configuration
  });
});
```

### Task 3.3: Integration Tests - Tenant API

**File:** `src/__tests__/tenant/integration/tenant-api.integration.test.ts`

**Test cases principali:**

```typescript
describe('Tenant API Integration', () => {
  describe('POST /tenants', () => {
    - should create tenant (super admin only)
    - should reject non-super-admin (403)
    - should validate slug format
    - should prevent duplicate slug (409)
    - should return 201 with tenant data
    - should start provisioning async
  });

  describe('GET /tenants', () => {
    - should list tenants (super admin)
    - should filter by status
    - should paginate results
    - should sort by creation date
    - should include tenant stats
  });

  describe('GET /tenants/:id', () => {
    - should get tenant details
    - should include settings and theme
    - should include user count
    - should include workspace count
    - should reject invalid tenant ID (404)
  });

  describe('PATCH /tenants/:id', () => {
    - should update tenant name
    - should update tenant settings
    - should update tenant theme
    - should suspend tenant (status change)
    - should validate updates
    - should reject non-super-admin (403)
  });

  describe('DELETE /tenants/:id', () => {
    - should soft delete tenant
    - should update status to PENDING_DELETION
    - should prevent deletion with active workspaces
    - should schedule cleanup job
    - should reject non-super-admin (403)
  });
});
```

### Task 3.4: E2E Tests - Tenant Provisioning

**File:** `src/__tests__/tenant/e2e/tenant-provisioning.e2e.test.ts`

**Test cases principali:**

```typescript
describe('Tenant Provisioning E2E', () => {
  it('should provision tenant end-to-end', async () => {
    // 1. Create tenant via API (super admin token)
    // 2. Verify status = PROVISIONING
    // 3. Wait for provisioning to complete
    // 4. Verify status = ACTIVE
    // 5. Verify DB schema exists (pg_namespace query)
    // 6. Verify Keycloak realm created
    // 7. Verify default roles created in realm
    // 8. Create user in tenant
    // 9. Login user and get token
    // 10. Verify tenant context works correctly
  });

  it('should handle provisioning failure gracefully', async () => {
    // Simulate Keycloak failure
    // Verify rollback occurs
    // Verify status = PROVISIONING_FAILED
  });

  it('should rollback on error', async () => {
    // Trigger error during provisioning
    // Verify schema is dropped
    // Verify realm is deleted
    // Verify tenant record is rolled back
  });

  it('should delete tenant end-to-end', async () => {
    // 1. Create and provision tenant
    // 2. Create workspaces and data
    // 3. Soft delete tenant (PENDING_DELETION)
    // 4. Verify data still accessible
    // 5. Hard delete tenant
    // 6. Verify schema dropped (CASCADE)
    // 7. Verify Keycloak realm deleted
    // 8. Verify tenant record removed
  });
});
```

**File:** `src/__tests__/tenant/e2e/tenant-isolation.e2e.test.ts`

**Test cases principali:**

```typescript
describe('Tenant Isolation E2E', () => {
  let tenant1: Tenant;
  let tenant2: Tenant;

  beforeAll(async () => {
    // Create two tenants with data
  });

  it('should isolate data between tenants', async () => {
    // Create workspace in tenant1
    // Create workspace in tenant2 (same slug)
    // Verify both exist independently
    // Verify tenant1 user cannot see tenant2 workspace
  });

  it('should isolate users between tenants', async () => {
    // Create user in tenant1
    // Create user in tenant2 (same email)
    // Verify both can exist (different realms)
  });

  it('should isolate permissions between tenants', async () => {
    // Admin in tenant1 != admin in tenant2
    // Permissions are schema-scoped
  });

  it('should prevent cross-tenant queries', async () => {
    // Attempt to access tenant2 data with tenant1 token
    // Should return 404 or 403
  });

  it('should enforce tenant context in all operations', async () => {
    // Every query must include tenantId filter
    // Middleware must set tenant context
  });
});
```

### Task 3.5: Integration Tests - Concurrent Operations

**File:** `src/__tests__/tenant/integration/tenant-concurrent.test.ts`

**Test cases principali:**

```typescript
describe('Tenant Concurrent Operations', () => {
  it('should handle concurrent tenant creation', async () => {
    // Create multiple tenants simultaneously
    // All should succeed with unique slugs
  });

  it('should prevent duplicate slug in race condition', async () => {
    // Attempt to create same slug concurrently
    // One should succeed, others should fail
  });

  it('should handle concurrent provisioning', async () => {
    // Trigger multiple provisions
    // All should complete successfully
  });

  it('should handle concurrent updates', async () => {
    // Update same tenant concurrently
    // Last write wins (optimistic locking)
  });

  it('should prevent race conditions in state transitions', async () => {
    // Concurrent suspend/activate
    // Should handle gracefully
  });
});
```

### Task 3.6: Integration Tests - Schema Operations

**File:** `src/__tests__/tenant/integration/tenant-schema.integration.test.ts`

**Test cases principali:**

```typescript
describe('Tenant Schema Operations', () => {
  it('should create schema with correct structure', async () => {
    // Create tenant
    // Verify schema exists
    // Verify all tables exist
    // Verify indexes exist
  });

  it('should apply migrations to tenant schema', async () => {
    // Create tenant
    // Run migration
    // Verify migration applied to tenant schema
  });

  it('should drop schema on tenant deletion', async () => {
    // Create tenant
    // Delete tenant (hard delete)
    // Verify schema no longer exists
  });

  it('should handle schema name conflicts', async () => {
    // Edge case: schema exists but tenant doesn't
    // Should handle gracefully
  });
});
```

### Deliverables Phase 3

- ✅ Test tenant riorganizzati
- ✅ Tenant lifecycle unit tests
- ✅ Tenant API integration tests
- ✅ Tenant provisioning E2E tests
- ✅ Tenant isolation E2E tests
- ✅ Concurrent operations tests
- ✅ Schema operations tests
- ✅ Coverage tenant module: ≥85%

**Tempo stimato:** 2-3 giorni

---

**Priorità:** ALTA  
**Effort:** 2-3 giorni  
**Obiettivo:** Completare test per autenticazione e autorizzazione

### Analisi Gap Esistenti

**Test già presenti (ottimi):**

- ✅ `auth.middleware.test.ts` (1223 linee) - Middleware completo
- ✅ `lib/keycloak-jwt.test.ts` (290 linee) - JWT validation
- ✅ `lib/jwt-library.test.ts` (373 linee) - JWT utilities

**Gap da coprire:**

- 🔴 Integration tests end-to-end auth flow
- 🔴 Cross-tenant security tests
- 🔴 Permission system integration tests
- 🟡 Token refresh scenarios
- 🟡 Concurrent request scenarios

### Task 2.1: Riorganizzare Test Esistenti

**Azioni:**

```bash
# Spostare test esistenti nella nuova struttura
mv src/__tests__/auth.middleware.test.ts src/__tests__/auth/unit/
mv src/__tests__/lib/keycloak-jwt.test.ts src/__tests__/auth/unit/
mv src/__tests__/lib/jwt-library.test.ts src/__tests__/auth/unit/

# Aggiornare imports nei file spostati se necessario
```

### Task 2.2: Unit Tests - Permission Service

**File:** `src/__tests__/auth/unit/permission.service.test.ts`

**Test cases principali:**

```typescript
describe('PermissionService', () => {
  describe('getUserPermissions', () => {
    - should return user permissions from database
    - should aggregate permissions from multiple roles
    - should cache permissions in Redis
    - should handle user without roles
    - should filter by tenant schema
  });

  describe('hasPermission', () => {
    - should check single permission
    - should return false for missing permission
    - should respect tenant isolation
    - should use cache when available
  });

  describe('hasAnyPermission', () => {
    - should check multiple permissions with OR logic
    - should return true if any permission matches
  });

  describe('hasAllPermissions', () => {
    - should check multiple permissions with AND logic
    - should return true only if all permissions match
  });
});
```

### Task 2.3: Integration Tests - Auth Flow

**File:** `src/__tests__/auth/integration/auth-flow.integration.test.ts`

**Test cases principali:**

```typescript
describe('Auth Flow Integration', () => {
  describe('Login Flow', () => {
    - should authenticate user with valid credentials
    - should reject invalid credentials
    - should extract tenant from token
    - should populate user context
    - should include roles and permissions
  });

  describe('Protected Routes', () => {
    - should allow access with valid token
    - should deny access without token (401)
    - should deny access with expired token (401)
    - should deny access with invalid signature (401)
    - should deny access with malformed token (400)
  });

  describe('Role-Based Access', () => {
    - should allow access with required role
    - should deny access without required role (403)
    - should support multiple role requirements (OR)
    - should support multiple role requirements (AND)
  });

  describe('Permission-Based Access', () => {
    - should allow access with required permission
    - should deny access without required permission (403)
    - should check permissions in correct tenant schema
    - should support complex permission patterns
  });
});
```

**File:** `src/__tests__/auth/integration/permission-database.integration.test.ts`

**Test cases principali:**

```typescript
describe('Permission Database Integration', () => {
  describe('Permission Storage', () => {
    - should store permissions in tenant schema
    - should link permissions to roles
    - should link roles to users
    - should cascade delete on role removal
  });

  describe('Permission Queries', () => {
    - should query permissions efficiently
    - should use proper indexes
    - should handle N+1 query problem
  });

  describe('Permission Cache', () => {
    - should cache permission lookups in Redis
    - should invalidate cache on permission change
    - should invalidate cache on role change
    - should handle cache misses gracefully
  });
});
```

### Task 2.4: E2E Tests - Cross-Tenant Security

**File:** `src/__tests__/auth/e2e/cross-tenant-security.e2e.test.ts`

**Test cases principali:**

```typescript
describe('Cross-Tenant Security E2E', () => {
  let tenant1: Tenant;
  let tenant2: Tenant;
  let user1Token: string;  // tenant1 admin
  let user2Token: string;  // tenant2 admin

  beforeAll(async () => {
    // Setup real tenants and users via Keycloak
  });

  describe('Tenant Isolation', () => {
    - user from tenant1 cannot access tenant2 workspaces
    - user from tenant1 cannot access tenant2 users
    - user from tenant1 cannot access tenant2 plugins
    - user from tenant2 cannot access tenant1 resources
    - super admin can access both tenants
  });

  describe('Token Manipulation', () => {
    - should reject tampered tenant claim in JWT
    - should reject forged token signature
    - should validate issuer matches tenant realm
    - should reject token from different realm
  });

  describe('Permission Isolation', () => {
    - permissions are scoped to tenant schema
    - role assignment is tenant-specific
    - admin in tenant1 is not admin in tenant2
  });

  describe('Data Leakage Prevention', () => {
    - queries are always filtered by tenantId
    - cross-tenant joins are prevented
    - tenant context is enforced at DB level
  });
});
```

**File:** `src/__tests__/auth/e2e/token-refresh.e2e.test.ts`

**Test cases principali:**

```typescript
describe('Token Refresh E2E', () => {
  describe('Token Expiration', () => {
    - should refresh expired access token
    - should use refresh token to get new access token
    - should reject expired refresh token
    - should update token expiration correctly
  });

  describe('Concurrent Refresh', () => {
    - should handle concurrent refresh requests
    - should not create race conditions
    - should use same refresh token result
  });

  describe('Token Revocation', () => {
    - should revoke old access token after refresh
    - should invalidate all user tokens on logout
    - should handle revoked token gracefully
  });
});
```

### Task 2.5: Security Tests

**File:** `src/__tests__/auth/integration/security.test.ts`

**Test cases principali:**

```typescript
describe('Auth Security', () => {
  describe('SQL Injection', () => {
    - should sanitize schema name in permission queries
    - should prevent SQL injection in user lookup
    - should validate tenant slug format
    - should escape special characters
  });

  describe('Algorithm Confusion', () => {
    - should reject HS256 when expecting RS256
    - should enforce explicit algorithms
    - should validate algorithm matches key type
  });

  describe('Privilege Escalation', () => {
    - should prevent role bypass via token manipulation
    - should prevent permission bypass
    - should require super admin for tenant owner actions
    - should validate role hierarchy
  });

  describe('JWKS Cache', () => {
    - should handle Keycloak key rotation
    - should refresh stale JWKS keys
    - should prevent cache poisoning
    - should validate key signatures
  });

  describe('Rate Limiting', () => {
    - should rate limit login attempts
    - should block after failed attempts
    - should reset counter after success
  });
});
```

### Deliverables Phase 2

- ✅ Test auth riorganizzati in `auth/unit/`
- ✅ Permission service unit tests
- ✅ Auth flow integration tests
- ✅ Permission database integration tests
- ✅ Cross-tenant security E2E tests
- ✅ Token refresh E2E tests
- ✅ Security hardening tests
- ✅ Coverage auth module: ≥85%

**Tempo stimato:** 2-3 giorni

---

**File:** `test-infrastructure/helpers/test-auth.helper.ts`

```typescript
import { TestKeycloakHelper } from './test-keycloak.helper.js';

export interface MockJWT {
  sub: string;
  preferred_username: string;
  email: string;
  name: string;
  given_name: string;
  family_name: string;
  realm_access: {
    roles: string[];
  };
  tenant?: string;
  iss: string;
  exp: number;
  iat: number;
}

export class TestAuthHelper {
  private keycloakHelper: TestKeycloakHelper;

  constructor(keycloakHelper: TestKeycloakHelper) {
    this.keycloakHelper = keycloakHelper;
  }

  /**
   * Generate mock JWT payload for unit tests
   */
  mockJWT(userId: string, roles: string[] = ['user'], tenantSlug?: string): MockJWT {
    const now = Math.floor(Date.now() / 1000);

    return {
      sub: userId,
      preferred_username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      realm_access: { roles },
      tenant: tenantSlug,
      iss: `http://localhost:8081/realms/${tenantSlug || 'test-tenant'}`,
      exp: now + 900, // 15 minutes
      iat: now,
    };
  }

  /**
   * Get real JWT token from Keycloak for E2E tests
   */
  async getRealToken(realm: string, username: string, password: string): Promise<string> {
    return await this.keycloakHelper.getToken(realm, username, password);
  }

  /**
   * Get authorization headers for API requests
   */
  getAuthHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Get headers with tenant context
   */
  getTenantHeaders(token: string, tenantSlug: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'X-Tenant-Slug': tenantSlug,
    };
  }

  /**
   * Mock admin user
   */
  mockAdminJWT(tenantSlug?: string): MockJWT {
    return this.mockJWT('admin-user-id', ['admin', 'user'], tenantSlug);
  }

  /**
   * Mock super admin user
   */
  mockSuperAdminJWT(): MockJWT {
    const jwt = this.mockJWT('superadmin-user-id', ['super-admin', 'admin', 'user']);
    jwt.iss = 'http://localhost:8081/realms/master';
    return jwt;
  }

  /**
   * Mock regular user
   */
  mockUserJWT(tenantSlug?: string): MockJWT {
    return this.mockJWT('user-user-id', ['user'], tenantSlug);
  }
}
```

### Task 1.10: Vitest Configs

**File:** `apps/core-api/test/vitest.config.unit.ts`

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'core-api:unit',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/{auth,tenant,workspace,plugin}/unit/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],
    setupFiles: ['./src/__tests__/setup/global-setup.ts'],
    testTimeout: 5000, // 5 seconds for unit tests
    hookTimeout: 10000,
    teardownTimeout: 10000,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/__tests__/**',
        'src/**/*.d.ts',
        'dist/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
    sequence: {
      shuffle: false, // Sequential as requested
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
    },
  },
});
```

**File:** `apps/core-api/test/vitest.config.integration.ts`

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'core-api:integration',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/{auth,tenant,workspace,plugin}/integration/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],
    setupFiles: ['./src/__tests__/setup/global-setup.ts'],
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 30000,
    teardownTimeout: 10000,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/__tests__/**',
        'src/**/*.d.ts',
        'dist/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
    sequence: {
      shuffle: false, // Sequential as requested
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
    },
  },
});
```

**File:** `apps/core-api/test/vitest.config.e2e.ts`

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'core-api:e2e',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/{auth,tenant,workspace,plugin}/e2e/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],
    setupFiles: ['./src/__tests__/setup/global-setup.ts'],
    testTimeout: 60000, // 60 seconds for E2E tests
    hookTimeout: 60000,
    teardownTimeout: 10000,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/__tests__/**',
        'src/**/*.d.ts',
        'dist/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
    sequence: {
      shuffle: false, // Sequential as requested
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
    },
  },
});
```

### Task 1.11: Global Setup

**File:** `apps/core-api/src/__tests__/setup/global-setup.ts`

```typescript
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load test environment variables
config({ path: resolve(__dirname, '../../../.env.test') });

beforeAll(async () => {
  console.log('🔧 Setting up global test environment...\n');

  // Set environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    'postgresql://plexica_test:test_password@localhost:5433/plexica_test';
  process.env.REDIS_URL = 'redis://localhost:6380';
  process.env.KEYCLOAK_URL = 'http://localhost:8081';
  process.env.KEYCLOAK_ADMIN_USERNAME = 'test-admin';
  process.env.KEYCLOAK_ADMIN_PASSWORD = 'test-admin';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only-do-not-use-in-production';
  process.env.MINIO_ENDPOINT = 'localhost';
  process.env.MINIO_PORT = '9010';
  process.env.MINIO_ACCESS_KEY = 'test-minio';
  process.env.MINIO_SECRET_KEY = 'test-minio';
  process.env.MINIO_USE_SSL = 'false';

  console.log('✅ Global test environment ready\n');
});

afterAll(async () => {
  console.log('\n🧹 Cleaning up global test environment...');
  // Global cleanup if needed
});

beforeEach(async () => {
  // Clear all mocks before each test
  if (typeof vi !== 'undefined') {
    vi.clearAllMocks();
  }
});

afterEach(async () => {
  // Cleanup after each test if needed
});
```

**File:** `apps/core-api/.env.test`

```bash
# Test Environment Variables
NODE_ENV=test
DATABASE_URL=postgresql://plexica_test:test_password@localhost:5433/plexica_test
REDIS_URL=redis://localhost:6380
KEYCLOAK_URL=http://localhost:8081
KEYCLOAK_ADMIN_USERNAME=test-admin
KEYCLOAK_ADMIN_PASSWORD=test-admin
JWT_SECRET=test-secret-key-for-testing-only-do-not-use-in-production
MINIO_ENDPOINT=localhost
MINIO_PORT=9010
MINIO_ACCESS_KEY=test-minio
MINIO_SECRET_KEY=test-minio
MINIO_USE_SSL=false
```

### Task 1.12: Package.json Scripts

**File:** `apps/core-api/package.json` (aggiungere scripts)

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --config test/vitest.config.unit.ts --run",
    "test:integration": "vitest --config test/vitest.config.integration.ts --run",
    "test:e2e": "vitest --config test/vitest.config.e2e.ts --run",
    "test:all": "pnpm test:unit && pnpm test:integration && pnpm test:e2e",
    "test:watch": "vitest --watch",
    "test:watch:unit": "vitest --config test/vitest.config.unit.ts --watch",
    "test:watch:integration": "vitest --config test/vitest.config.integration.ts --watch",
    "test:watch:e2e": "vitest --config test/vitest.config.e2e.ts --watch",
    "test:coverage": "vitest --coverage --run",
    "test:ui": "vitest --ui",
    "test:setup": "bash ../../test-infrastructure/scripts/test-setup.sh",
    "test:teardown": "bash ../../test-infrastructure/scripts/test-teardown.sh",
    "test:reset": "bash ../../test-infrastructure/scripts/test-reset.sh",
    "test:ci": "pnpm test:setup && pnpm test:all && pnpm test:teardown"
  }
}
```

### Deliverables Phase 1

- ✅ Struttura directory completa
- ✅ Docker Compose per test (postgres, keycloak, redis, minio)
- ✅ Script setup/teardown/reset
- ✅ Minimal seed data
- ✅ Helpers per DB, Keycloak, Auth
- ✅ Vitest configs (unit/integration/e2e)
- ✅ Global setup e .env.test
- ✅ Package.json scripts

**Tempo stimato:** 3-4 giorni

---

**File:** `test-infrastructure/fixtures/minimal-seed.ts`

```typescript
import { PrismaClient, TenantStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://plexica_test:test_password@localhost:5433/plexica_test',
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const MINIMAL_SEED_DATA = {
  tenants: [
    {
      id: 'test-tenant-1',
      slug: 'test-tenant',
      name: 'Test Tenant',
      status: TenantStatus.ACTIVE,
      settings: {
        timezone: 'UTC',
        locale: 'en-US',
        features: {
          workspaces: true,
          plugins: true,
          analytics: false,
        },
      },
      theme: {
        primaryColor: '#3B82F6',
        secondaryColor: '#8B5CF6',
      },
    },
  ],
  users: [
    {
      id: 'test-user-admin',
      keycloakId: 'kc-test-admin',
      email: 'admin@test.local',
      firstName: 'Test',
      lastName: 'Admin',
      locale: 'en-US',
    },
    {
      id: 'test-user-member',
      keycloakId: 'kc-test-member',
      email: 'member@test.local',
      firstName: 'Test',
      lastName: 'Member',
      locale: 'en-US',
    },
  ],
  workspaces: [
    {
      id: 'test-workspace-1',
      slug: 'test-workspace',
      name: 'Test Workspace',
      description: 'Test workspace for automated testing',
      tenantId: 'test-tenant-1',
      settings: {},
    },
  ],
};

async function seed() {
  console.log('🌱 Seeding minimal test data...\n');

  // 1. Seed Tenants
  console.log('📊 Seeding tenants...');
  for (const tenant of MINIMAL_SEED_DATA.tenants) {
    const result = await prisma.tenant.upsert({
      where: { slug: tenant.slug },
      update: tenant,
      create: tenant,
    });
    console.log(`   ✅ ${result.slug} - ${result.name}`);
  }

  // 2. Seed Users
  console.log('\n👥 Seeding users...');
  for (const user of MINIMAL_SEED_DATA.users) {
    const result = await prisma.user.upsert({
      where: { keycloakId: user.keycloakId },
      update: user,
      create: user,
    });
    console.log(`   ✅ ${result.email}`);
  }

  // 3. Seed Workspaces
  console.log('\n🏢 Seeding workspaces...');
  for (const workspace of MINIMAL_SEED_DATA.workspaces) {
    const result = await prisma.workspace.upsert({
      where: {
        tenantId_slug: {
          tenantId: workspace.tenantId,
          slug: workspace.slug,
        },
      },
      update: workspace,
      create: workspace,
    });
    console.log(`   ✅ ${result.slug} - ${result.name}`);

    // Add admin as workspace member
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: result.id,
          userId: 'test-user-admin',
        },
      },
      update: {},
      create: {
        workspaceId: result.id,
        userId: 'test-user-admin',
        role: 'ADMIN',
      },
    });
  }

  console.log('\n✅ Minimal seed data complete!\n');
}

seed()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

### Task 1.7: Database Helper

**File:** `test-infrastructure/helpers/test-database.helper.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { execSync } from 'child_process';

export class TestDatabaseHelper {
  private prisma: PrismaClient;
  private pool: Pool;

  constructor(databaseUrl?: string) {
    const url =
      databaseUrl ||
      process.env.DATABASE_URL ||
      'postgresql://plexica_test:test_password@localhost:5433/plexica_test';

    this.pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(this.pool);
    this.prisma = new PrismaClient({ adapter });
  }

  async setup(): Promise<void> {
    console.log('🗄️  Setting up test database...');

    // Run migrations
    await this.runMigrations();

    // Seed minimal data
    await this.seedMinimalData();

    console.log('✅ Test database ready');
  }

  async reset(): Promise<void> {
    console.log('🔄 Resetting test database...');

    await this.truncateAll();
    await this.seedMinimalData();

    console.log('✅ Database reset complete');
  }

  async teardown(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
  }

  async truncateAll(): Promise<void> {
    // Get all table names
    const tables = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'core' 
      AND tablename != '_prisma_migrations'
    `;

    // Disable foreign key checks
    await this.prisma.$executeRaw`SET session_replication_role = replica`;

    // Truncate each table
    for (const { tablename } of tables) {
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE core.${tablename} CASCADE`);
    }

    // Re-enable foreign key checks
    await this.prisma.$executeRaw`SET session_replication_role = DEFAULT`;
  }

  async seedMinimalData(): Promise<void> {
    // Import and run seed
    const { execSync } = await import('child_process');
    execSync('node -r esbuild-register test-infrastructure/fixtures/minimal-seed.ts', {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  }

  private async runMigrations(): Promise<void> {
    execSync('pnpm --filter @plexica/database db:migrate', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });
  }

  // Factory methods
  async createTenant(data: any) {
    return await this.prisma.tenant.create({ data });
  }

  async createUser(data: any) {
    return await this.prisma.user.create({ data });
  }

  async createWorkspace(data: any) {
    return await this.prisma.workspace.create({ data });
  }

  async createPlugin(data: any) {
    return await this.prisma.plugin.create({ data });
  }

  // Getters
  get client() {
    return this.prisma;
  }
}
```

### Task 1.8: Keycloak Helper

**File:** `test-infrastructure/helpers/test-keycloak.helper.ts`

```typescript
import KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';

interface KeycloakUser {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  credentials?: Array<{
    type: string;
    value: string;
    temporary: boolean;
  }>;
}

export class TestKeycloakHelper {
  private kcAdmin: KcAdminClient;
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:8081') {
    this.baseUrl = baseUrl;
    this.kcAdmin = new KcAdminClient({
      baseUrl,
      realmName: 'master',
    });
  }

  async setup(): Promise<void> {
    console.log('🔐 Setting up Keycloak...');

    // Authenticate
    await this.authenticate();

    // Create test realm if not exists
    await this.createRealmIfNotExists('test-tenant');

    // Create test users
    await this.createTestUsers();

    console.log('✅ Keycloak ready');
  }

  async authenticate(): Promise<void> {
    await this.kcAdmin.auth({
      username: 'test-admin',
      password: 'test-admin',
      grantType: 'password',
      clientId: 'admin-cli',
    });
  }

  async createRealmIfNotExists(slug: string): Promise<void> {
    try {
      await this.kcAdmin.realms.findOne({ realm: slug });
      console.log(`   ℹ️  Realm ${slug} already exists`);
    } catch (error) {
      // Realm doesn't exist, create it
      await this.kcAdmin.realms.create({
        realm: slug,
        enabled: true,
        displayName: `Test Realm: ${slug}`,
        accessTokenLifespan: 900, // 15 minutes
        ssoSessionIdleTimeout: 1800, // 30 minutes
        ssoSessionMaxLifespan: 36000, // 10 hours
      });
      console.log(`   ✅ Created realm: ${slug}`);
    }
  }

  async createTestUsers(): Promise<void> {
    const realm = 'test-tenant';
    await this.kcAdmin.setConfig({ realmName: realm });

    const users: KeycloakUser[] = [
      {
        username: 'admin@test.local',
        email: 'admin@test.local',
        firstName: 'Test',
        lastName: 'Admin',
        enabled: true,
        credentials: [
          {
            type: 'password',
            value: 'Test123!',
            temporary: false,
          },
        ],
      },
      {
        username: 'member@test.local',
        email: 'member@test.local',
        firstName: 'Test',
        lastName: 'Member',
        enabled: true,
        credentials: [
          {
            type: 'password',
            value: 'Test123!',
            temporary: false,
          },
        ],
      },
    ];

    for (const user of users) {
      try {
        const existingUsers = await this.kcAdmin.users.find({
          username: user.username,
          realm,
        });

        if (existingUsers.length === 0) {
          await this.kcAdmin.users.create(user);
          console.log(`   ✅ Created user: ${user.username}`);
        } else {
          console.log(`   ℹ️  User ${user.username} already exists`);
        }
      } catch (error) {
        console.error(`   ❌ Error creating user ${user.username}:`, error);
      }
    }

    // Reset to master realm
    await this.kcAdmin.setConfig({ realmName: 'master' });
  }

  async getToken(realm: string, username: string, password: string): Promise<string> {
    const response = await axios.post(
      `${this.baseUrl}/realms/${realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username,
        password,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return response.data.access_token;
  }

  async deleteUser(realm: string, userId: string): Promise<void> {
    await this.kcAdmin.setConfig({ realmName: realm });
    await this.kcAdmin.users.del({ id: userId });
    await this.kcAdmin.setConfig({ realmName: 'master' });
  }

  async reset(): Promise<void> {
    console.log('🔄 Resetting Keycloak users...');
    // For now, we recreate users
    await this.createTestUsers();
    console.log('✅ Keycloak reset complete');
  }
}
```

---

**Priorità:** ALTA  
**Effort:** 3-4 giorni  
**Obiettivo:** Creare l'infrastruttura completa per supportare tutti i test

### Task 1.1: Creare Struttura Directory

**Files da creare:**

```bash
mkdir -p test-infrastructure/{docker,fixtures/factories,helpers,scripts}
mkdir -p apps/core-api/test
mkdir -p apps/core-api/src/__tests__/setup
mkdir -p apps/core-api/src/__tests__/{auth,tenant,workspace,plugin}/{unit,integration,e2e}
```

### Task 1.2: Docker Compose per Test

**File:** `test-infrastructure/docker/docker-compose.test.yml`

**Contenuto:**

```yaml
version: '3.9'

services:
  postgres-test:
    image: postgres:18.1-alpine
    container_name: plexica-test-postgres
    environment:
      POSTGRES_USER: plexica_test
      POSTGRES_PASSWORD: test_password
      POSTGRES_DB: plexica_test
    ports:
      - '5433:5432'
    volumes:
      - ./postgres-test-init.sql:/docker-entrypoint-initdb.d/init.sql
     tmpfs:
       - /var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U plexica_test']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - plexica-test-network

  keycloak-test:
    image: quay.io/keycloak/keycloak:26.5
    container_name: plexica-test-keycloak
    command: start-dev --import-realm
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://postgres-test:5432/plexica_test
      KC_DB_USERNAME: plexica_test
      KC_DB_PASSWORD: test_password
      KC_DB_SCHEMA: keycloak_test
      KEYCLOAK_ADMIN: test-admin
      KEYCLOAK_ADMIN_PASSWORD: test-admin
      KC_HEALTH_ENABLED: 'true'
    ports:
      - '8081:8080'
    volumes:
      - ./keycloak-test-realm.json:/opt/keycloak/data/import/realm.json
    depends_on:
      postgres-test:
        condition: service_healthy
    healthcheck:
      test: ['CMD-SHELL', 'exec 3<>/dev/tcp/127.0.0.1/8080']
      interval: 10s
      timeout: 5s
      retries: 10
    networks:
      - plexica-test-network

  redis-test:
    image: redis:8.4-alpine
    container_name: plexica-test-redis
    command: redis-server --appendonly no
    ports:
      - '6380:6379'
    tmpfs:
      - /data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - plexica-test-network

  minio-test:
    image: minio/minio:latest
    container_name: plexica-test-minio
    command: server /data --console-address ":9002"
    environment:
      MINIO_ROOT_USER: test-minio
      MINIO_ROOT_PASSWORD: test-minio
    ports:
      - '9010:9000'
      - '9011:9002'
    tmpfs:
      - /data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 10s
      timeout: 5s
      retries: 3
    networks:
      - plexica-test-network

networks:
  plexica-test-network:
    driver: bridge
```

**Note:**

- Tutte le porte sono diverse da quelle production per evitare conflitti
- Uso di `tmpfs` per velocità (dati in RAM)
- Healthchecks per attendere che i servizi siano pronti
- Network dedicato per isolamento

### Task 1.3: Script Setup

**File:** `test-infrastructure/scripts/test-setup.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Setting up test infrastructure..."

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi

# Navigate to docker directory
cd "$(dirname "$0")/../docker"

# Stop any existing containers
echo "🛑 Stopping existing test containers..."
docker compose -f docker-compose.test.yml down -v 2>/dev/null || true

# Start containers
echo "🐳 Starting test containers..."
docker compose -f docker-compose.test.yml up -d

# Wait for healthchecks
echo "⏳ Waiting for services to be healthy..."
timeout=120
elapsed=0
while [ $elapsed -lt $timeout ]; do
  if docker compose -f docker-compose.test.yml ps | grep -q "healthy"; then
    postgres_health=$(docker inspect --format='{{.State.Health.Status}}' plexica-test-postgres 2>/dev/null || echo "starting")
    keycloak_health=$(docker inspect --format='{{.State.Health.Status}}' plexica-test-keycloak 2>/dev/null || echo "starting")
    redis_health=$(docker inspect --format='{{.State.Health.Status}}' plexica-test-redis 2>/dev/null || echo "starting")

    if [ "$postgres_health" = "healthy" ] && [ "$redis_health" = "healthy" ]; then
      echo "✅ Core services are healthy"

      # Give Keycloak more time
      if [ "$keycloak_health" = "healthy" ]; then
        echo "✅ Keycloak is healthy"
        break
      else
        echo "⏳ Waiting for Keycloak... ($elapsed seconds)"
      fi
    fi
  fi

  sleep 5
  elapsed=$((elapsed + 5))
done

if [ $elapsed -ge $timeout ]; then
  echo "❌ Timeout waiting for services to be healthy"
  docker compose -f docker-compose.test.yml logs
  exit 1
fi

# Return to root
cd ../..

# Run database migrations
echo "🗄️  Running database migrations..."
export DATABASE_URL="postgresql://plexica_test:test_password@localhost:5433/plexica_test"
cd ../../packages/database
pnpm db:migrate

# Seed minimal data
echo "🌱 Seeding minimal test data..."
cd ../../test-infrastructure
node -r esbuild-register fixtures/minimal-seed.ts

echo ""
echo "✅ Test infrastructure is ready!"
echo ""
echo "📊 Service URLs:"
echo "  PostgreSQL: postgresql://plexica_test:test_password@localhost:5433/plexica_test"
echo "  Keycloak:   http://localhost:8081 (admin: test-admin / test-admin)"
echo "  Redis:      redis://localhost:6380"
echo "  MinIO:      http://localhost:9010 (test-minio / test-minio)"
echo ""
echo "🧪 Run tests with:"
echo "  pnpm --filter @plexica/core-api test:unit"
echo "  pnpm --filter @plexica/core-api test:integration"
echo "  pnpm --filter @plexica/core-api test:e2e"
echo ""
```

**Rendere eseguibile:**

```bash
chmod +x test-infrastructure/scripts/test-setup.sh
```

### Task 1.4: Script Teardown

**File:** `test-infrastructure/scripts/test-teardown.sh`

```bash
#!/bin/bash
set -e

echo "🧹 Tearing down test infrastructure..."

cd "$(dirname "$0")/../docker"

# Stop and remove containers
docker compose -f docker-compose.test.yml down -v

echo "✅ Test infrastructure stopped and cleaned up"
```

**Rendere eseguibile:**

```bash
chmod +x test-infrastructure/scripts/test-teardown.sh
```

### Task 1.5: Script Reset

**File:** `test-infrastructure/scripts/test-reset.sh`

```bash
#!/bin/bash
set -e

echo "🔄 Resetting test data..."

# Truncate all tables except migrations
export DATABASE_URL="postgresql://plexica_test:test_password@localhost:5433/plexica_test"

psql $DATABASE_URL <<EOF
-- Disable foreign key checks
SET session_replication_role = replica;

-- Truncate all tables in core schema
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'core' AND tablename != '_prisma_migrations')
    LOOP
        EXECUTE 'TRUNCATE TABLE core.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END \$\$;

-- Re-enable foreign key checks
SET session_replication_role = DEFAULT;
EOF

# Re-seed minimal data
echo "🌱 Re-seeding minimal data..."
cd "$(dirname "$0")/.."
node -r esbuild-register fixtures/minimal-seed.ts

echo "✅ Test data reset complete"
```

**Rendere eseguibile:**

```bash
chmod +x test-infrastructure/scripts/test-reset.sh
```

---

Creare un sistema di test completo per core-api che:

- ✅ Parte da sistema vuoto (DB, Keycloak, Redis, MinIO puliti)
- ✅ Popola con dati minimi ma funzionali
- ✅ Supporta tutti i livelli di test (unit, integration, e2e)
- ✅ Usa container Docker isolati per i test
- ✅ Setup automatizzato per GitHub Actions
- ✅ Reset completo pre-suite (test sequenziali)
- ✅ Dati riutilizzabili per quickstart/demo

---

## 📦 Decisioni Architetturali

### Dati Iniziali

**Scelta:** Base (Minimi necessari)

- 1-2 tenant
- 1-2 utenti
- 1-2 workspace
- Nessun plugin di default

### Gestione Keycloak

**Scelta:** Keycloak reale con seed

- Setup automatico di realm, client e utenti
- Container Keycloak dedicato per test

### Isolamento Database

**Scelta:** Docker container per test

- Container PostgreSQL temporaneo per test suite
- Database `plexica_test` separato
- Porta 5433 per evitare conflitti

### Livelli di Test

**Scelta:** Tutti in parallelo

- Unit tests (focus su service layer)
- Integration tests (focus su API endpoints)
- E2E tests (focus su flussi completi)

### Automazione CI/CD

**Scelta:** GitHub Actions

- Workflow per test automatici su PR e push
- Coverage reporting con Codecov

### Cleanup e Reset

**Scelta:** Reset completo pre-suite

- Cleanup prima di ogni test suite
- Test sequenziali (non paralleli)
- Snapshot e restore non necessari

---

## 🏗️ Architettura Proposta

### Struttura Directory

```
plexica/
├── test-infrastructure/              # 🆕 Nuova directory radice
│   ├── docker/
│   │   ├── docker-compose.test.yml
│   │   ├── postgres-test-init.sql
│   │   └── keycloak-test-realm.json
│   ├── fixtures/
│   │   ├── minimal-seed.ts           # Dati minimi per test
│   │   ├── quickstart-seed.ts        # Dati per demo/quickstart
│   │   └── factories/
│   │       ├── tenant.factory.ts
│   │       ├── user.factory.ts
│   │       ├── workspace.factory.ts
│   │       └── plugin.factory.ts
│   ├── helpers/
│   │   ├── test-database.helper.ts
│   │   ├── test-keycloak.helper.ts
│   │   ├── test-auth.helper.ts
│   │   └── test-context.helper.ts
│   ├── scripts/
│   │   ├── test-setup.sh
│   │   ├── test-teardown.sh
│   │   └── test-reset.sh
│   └── README.md
│
└── apps/core-api/
    ├── test/                         # 🆕 Test configs
    │   ├── vitest.config.unit.ts
    │   ├── vitest.config.integration.ts
    │   └── vitest.config.e2e.ts
    └── src/__tests__/
        ├── setup/                    # 🆕 Setup globale
        │   ├── global-setup.ts
        │   └── test-helpers.ts
        ├── auth/                     # 🆕 Test auth
        │   ├── unit/
        │   ├── integration/
        │   └── e2e/
        ├── tenant/                   # 🆕 Test tenant
        │   ├── unit/
        │   ├── integration/
        │   └── e2e/
        ├── workspace/                # ♻️ Riorganizzare esistenti
        │   ├── unit/
        │   ├── integration/
        │   └── e2e/
        └── plugin/                   # ♻️ Riorganizzare esistenti
            ├── unit/
            ├── integration/
            └── e2e/
```

### Componenti Principali

#### 1. Docker Infrastructure

- **PostgreSQL Test**: Porta 5433, database `plexica_test`, tmpfs per performance
- **Keycloak Test**: Porta 8081, auto-import realm, schema dedicato
- **Redis Test**: Porta 6380, tmpfs storage
- **MinIO Test**: Porta 9010/9011, tmpfs storage

#### 2. Test Helpers

- **TestDatabaseHelper**: Gestione setup/reset/teardown DB
- **TestKeycloakHelper**: Gestione realm, utenti, token
- **TestAuthHelper**: Mock JWT e token reali
- **TestContextHelper**: Tenant context per test

#### 3. Seed Data

- **Minimal Seed**: Dati minimi per test veloci
- **Quickstart Seed**: Dati demo per quickstart
- **Factories**: Factory functions per generare dati test

#### 4. Test Configurations

- **vitest.config.unit.ts**: Config per unit tests
- **vitest.config.integration.ts**: Config per integration tests
- **vitest.config.e2e.ts**: Config per E2E tests

---

## 📊 Ordine di Implementazione

Il sistema sarà implementato seguendo questo ordine:

1. **Phase 1**: Infrastruttura Base (setup completo)
2. **Phase 2**: Test Auth (autenticazione e autorizzazione)
3. **Phase 3**: Test Tenant (multi-tenancy e isolamento)
4. **Phase 4**: Test Workspace (collaborazione e permessi)
5. **Phase 5**: Test Plugin (lifecycle e comunicazione)
6. **Phase 6**: CI/CD Setup (GitHub Actions)
7. **Phase 7**: Quickstart Data (dati demo)

---
