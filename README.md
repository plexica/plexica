# Plexica v2

Multi-tenant SaaS platform. Each tenant runs in an isolated PostgreSQL schema,
authenticated via a dedicated Keycloak realm, with plugin support through Module Federation.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/) >= 2
- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 8

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/plexica.git && cd plexica

# 2. Configure environment
cp .env.example .env

# 3. Start infrastructure and install dependencies
docker compose up -d
pnpm install
```

## Services

| Service      | Default Port | UI / Notes                          |
| ------------ | ------------ | ----------------------------------- |
| Core API     | 3001         | `http://localhost:3001`             |
| Web (tenant) | 5173         | `http://localhost:5173`             |
| Admin UI     | 5174         | `http://localhost:5174`             |
| PostgreSQL   | 5432         | —                                   |
| Keycloak     | 8080         | `http://localhost:8080/admin`       |
| Redis        | 6379         | —                                   |
| MinIO        | 9000 / 9001  | Console at `http://localhost:9001`  |
| Redpanda     | 19092        | Kafka-compatible broker             |
| Mailhog      | 1025 / 8025  | SMTP UI at `http://localhost:8025`  |

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
