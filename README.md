# Plexica v2

Multi-tenant SaaS platform. Each tenant runs in an isolated PostgreSQL schema,
authenticated via a dedicated Keycloak realm, with plugin support through Module Federation.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/) >= 2
- [Node.js](https://nodejs.org/) >= 24
- [pnpm](https://pnpm.io/) >= 8

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/plexica/plexica.git && cd plexica

# 2. Configure environment
cp .env.example .env

# 3. Start infrastructure services (PostgreSQL, Keycloak, Redis, MinIO, Redpanda, Mailpit)
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Apply database migrations
pnpm --filter core-api db:migrate

# 6. Create a demo tenant (required before opening the web UI)
#    Provisions PostgreSQL schema + Keycloak realm + MinIO bucket.
#    --name and --admin-email are optional (default to slug and admin@<slug>.local)
pnpm --filter core-api tenant:create -- --slug demo --name "Demo" --admin-email admin@demo.local

# 7. Start the application (three separate terminals)

# Terminal A — Core API (http://localhost:3001)
pnpm --filter core-api dev

# Terminal B — Web UI / tenant frontend (http://localhost:3000?tenant=demo)
pnpm --filter web dev

# Terminal C — Admin UI (http://localhost:5174)  [not yet implemented — coming in Phase 2]
# pnpm --filter admin dev
```

## Stopping and Resetting

To stop all running containers without losing data:

```bash
docker compose down
```

To stop everything **and delete all Docker volumes** (PostgreSQL data, Keycloak configuration,
Redis cache, MinIO buckets, Redpanda topics):

```bash
docker compose down -v
```

> **Warning:** `docker compose down -v` is destructive and irreversible. All tenant schemas,
> Keycloak realms, uploaded files, and cached data will be permanently deleted. After running
> this command you will need to repeat steps 5–6 of the Quick Start (migrations and tenant
> creation) before the application can be used again.

## Design System — Storybook

The `@plexica/ui` package contains the shared component library and design tokens.
Launch Storybook to browse, test, and develop UI components in isolation:

```bash
pnpm --filter @plexica/ui storybook
```

Storybook opens at **http://localhost:6006**. It includes:

- All components from `packages/ui/src/` with interactive controls
- Design tokens (colours, spacing, typography)
- Dark/light theme switching via the toolbar (`@storybook/addon-themes`)
- Auto-generated docs for components tagged with `autodocs`

To build a static version of the Storybook (e.g. for CI artefacts or deployment):

```bash
pnpm --filter @plexica/ui build-storybook
```

> **Note:** Storybook is standalone — it does not require `docker compose` or the Core API to be running.

## Services

| Service      | Default Port | UI / Notes                         |
| ------------ | ------------ | ---------------------------------- |
| Core API     | 3001         | `http://localhost:3001`            |
| Web (tenant) | 3000         | `http://localhost:3000`            |
| Admin UI     | 5174         | `http://localhost:5174`            |
| Storybook    | 6006         | `http://localhost:6006`            |
| PostgreSQL   | 5432         | —                                  |
| Keycloak     | 8080         | `http://localhost:8080/admin`      |
| Redis        | 6379         | —                                  |
| MinIO        | 9000 / 9001  | Console at `http://localhost:9001` |
| Redpanda     | 19092        | Kafka-compatible broker            |
| Mailpit      | 1025 / 8025  | SMTP UI at `http://localhost:8025` |

## Running Tests

```bash
# All tests (unit + integration + E2E)
pnpm test

# Type checking across all packages
pnpm typecheck

# Lint
pnpm lint
```

## Changing Default Ports

Edit the relevant `*_PORT` variable in `.env` before running `docker compose up`.
For example, to run PostgreSQL on port 5433:

```bash
POSTGRES_PORT=5433
DATABASE_URL=postgresql://plexica:changeme@localhost:5433/plexica
```

## Documentation

- [Specifications](docs/01-SPECIFICHE.md)
- [Architecture](docs/02-ARCHITETTURA.md)
- [Project Plan](docs/03-PROGETTO.md)
