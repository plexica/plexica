# Spec 001: Infrastructure Setup

**Phase**: 0 — Infrastructure Setup
**Duration**: 1-2 weeks
**Status**: Draft
**Date**: March 2026

---

## Overview

Bootstrap the entire development and CI environment from scratch. This phase
delivers a working monorepo, containerised dev stack, design system foundation,
and a green CI pipeline — everything needed before any application code is
written.

## Dependencies

None. This is the first phase of the project.

## Features

### 0.1 Monorepo & Tooling

| ID     | Feature                                                                 | E2E Test                                |
| ------ | ----------------------------------------------------------------------- | --------------------------------------- |
| 001-01 | Create monorepo (pnpm workspaces) with tsconfig, eslint, prettier       | Build passes with `pnpm build`          |

### 0.2 Dev Infrastructure (Docker Compose)

| ID     | Feature                                                                                        | E2E Test                                       |
| ------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 001-02 | Docker Compose for dev: PostgreSQL, Keycloak, Redis, MinIO, Redpanda (1 node), Mailhog         | `docker compose up` starts all services        |
| 001-03 | Docker Compose for CI (identical to dev, runnable in GitHub Actions)                            | CI pipeline runs successfully                  |

### 0.3 Service Configuration

| ID     | Feature                                                                                                  | E2E Test                                    |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 001-04 | Keycloak automated setup: test realm import, pre-configured users, realm provisioning script              | Keycloak starts with test realm ready       |
| 001-05 | PostgreSQL setup with schema-per-tenant: init script for `core` schema, utility for tenant schema creation/migration | Tenant schema created and migrated          |
| 001-06 | Kafka/Redpanda setup: single node dev, topic auto-creation, consumer group management                    | Events can be produced and consumed         |

### 0.4 Design System Base

| ID     | Feature                                                                                             | E2E Test                             |
| ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 001-07 | Design system base: Inter font, colors, spacing, border-radius. Storybook with Button, Input, Dialog, Toast, Table | Storybook renders 5 components       |

### 0.5 CI Pipeline & Smoke Test

| ID     | Feature                                                                                                    | E2E Test                                 |
| ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 001-08 | CI pipeline: lint + TypeScript + build + Docker up + seed + test (unit + integration + E2E) + teardown      | Pipeline green with all stages           |
| 001-09 | First E2E smoke test: Playwright opens frontend, sees login page                                           | Playwright test passes                   |

## Acceptance Criteria

1. `docker compose up` starts the entire stack (PostgreSQL, Keycloak, Redis,
   MinIO, Redpanda, Mailhog) without manual intervention.
2. An empty Playwright test connects to the frontend and passes.
3. CI pipeline executes all stages (lint, build, test, teardown) and reports
   results.
4. Design system has base tokens (colors, spacing, typography) and 5 components
   rendered in Storybook.
5. Keycloak starts with a pre-imported test realm and at least 2 test users.
6. A tenant schema can be created and migrated via the provided utility.
7. A Kafka/Redpanda topic can be created, and a message produced and consumed.

## Non-Functional Requirements

| NFR    | Metric                                    | Target     |
| ------ | ----------------------------------------- | ---------- |
| NFR-01 | Docker Compose full startup time          | < 60s      |
| NFR-02 | CI pipeline total duration                | < 10 min   |
| NFR-03 | `pnpm install` from clean cache           | < 90s      |
| NFR-04 | Storybook cold start                      | < 15s      |
| NFR-05 | All Docker images pinned to exact digests | 100%       |

## Risks

| ID   | Risk                                                        | Impact | Mitigation                                           |
| ---- | ----------------------------------------------------------- | ------ | ---------------------------------------------------- |
| R-01 | Redpanda single-node instability in CI                      | MEDIUM | Fallback to in-memory event bus for CI tests         |
| R-02 | Keycloak realm import JSON format changes across versions   | LOW    | Pin Keycloak image version, version-lock export JSON |
| R-03 | Docker Compose resource limits exceed CI runner capacity     | HIGH   | Profile memory usage, cap container limits           |
| R-04 | pnpm workspace hoisting conflicts with native dependencies  | MEDIUM | Use `.pnpmfile.cjs` hooks for problem packages       |
