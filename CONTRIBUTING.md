# Contributing to Plexica

Thank you for your interest in contributing to Plexica! This document explains
how to get started, what to work on, and how contributions are reviewed.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold this code. Please report unacceptable
behaviour to the maintainers via GitHub Issues.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/plexica.git && cd plexica
   ```
3. Follow the [Quick Start](README.md#quick-start) to set up your local environment.
4. Browse [open issues](https://github.com/plexica/plexica/issues) — issues labelled
   `good first issue` are a great starting point.

---

## How to Contribute

### Reporting Bugs

Open a GitHub Issue using the **Bug Report** template. Include:

- Steps to reproduce
- Expected vs actual behaviour
- Environment (OS, Node version, Docker version)
- Relevant logs

### Requesting Features

Open a GitHub Issue using the **Feature Request** template. Describe:

- The problem you are solving
- The proposed solution
- Alternatives you have considered

### Submitting Code

1. Find or open an issue for the work you want to do.
2. Comment on the issue to let maintainers know you are working on it.
3. Create a branch following the naming conventions below.
4. Implement the change with tests.
5. Open a Pull Request referencing the issue.

---

## Development Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) >= 24
- [Docker Compose](https://docs.docker.com/compose/) >= 2
- [Node.js](https://nodejs.org/) >= 24
- [pnpm](https://pnpm.io/) >= 10

### Running the stack

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter core-api db:migrate
```

See [README.md](README.md) for the full Quick Start guide.

---

## Commit Message Format

All commit messages **must be in English** and follow
[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

| Type       | When to use                              |
| ---------- | ---------------------------------------- |
| `feat`     | A new feature                            |
| `fix`      | A bug fix                                |
| `refactor` | Code change that is neither fix nor feat |
| `test`     | Adding or fixing tests                   |
| `docs`     | Documentation only                       |
| `chore`    | Tooling, build process, config           |
| `perf`     | Performance improvement                  |
| `ci`       | CI/CD configuration                      |

**Examples:**

```
feat(auth): add Keycloak token validation middleware
fix(tenant): prevent schema creation for duplicate slugs
docs(readme): update Quick Start with Docker Compose v2 commands
```

Commits written in any language other than English will be rejected.

---

## Branch Naming

| Type    | Pattern            | Example                      |
| ------- | ------------------ | ---------------------------- |
| Feature | `feat/<id>-<slug>` | `feat/WS-001-workspace-crud` |
| Fix     | `fix/<id>-<slug>`  | `fix/AA-002-jwt-validation`  |
| Hotfix  | `hotfix/<slug>`    | `hotfix/tenant-context-leak` |

---

## Pull Request Process

1. Ensure all CI checks pass (lint, typecheck, build, unit + integration tests, E2E).
2. Fill in the Pull Request template completely.
3. Reference the related issue in the PR description (`Fixes #123` or `Relates to #456`).
4. Request review from a maintainer.
5. Address all review comments before the PR is merged.
6. PRs are merged via **squash merge** — your branch is deleted automatically.

### What we review

- Correctness and completeness of the feature
- Test coverage (unit + integration + E2E for user-facing features)
- Adherence to the coding standards and architecture decisions
- No file over 200 lines
- No hardcoded secrets

---

## Coding Standards

- **TypeScript strict mode** everywhere.
- **No `console.log`** in production code — use the Pino structured logger.
- **One pattern per operation type** (see [AGENTS.md](AGENTS.md) for the full table).
- **File size limit**: 200 lines maximum. Decompose if larger.
- **Naming**: kebab-case files, PascalCase classes, camelCase functions.
- **Imports**: built-in → external → `@plexica/*` → relative, each group separated by a blank line.

---

## Testing Requirements

Every user-facing feature **must have a Playwright E2E test**. CI blocks merge if
E2E tests are missing or failing.

| Test type         | Framework  | Required for                      |
| ----------------- | ---------- | --------------------------------- |
| E2E               | Playwright | All user-facing features          |
| Integration (API) | Vitest     | All API endpoints                 |
| Unit              | Vitest     | Business logic, validators, utils |

See [README.md — Running Tests](README.md#running-tests) for how to run the suite locally.

---

## Questions?

Open a [GitHub Discussion](https://github.com/plexica/plexica/discussions) or
file an issue. We are happy to help.
