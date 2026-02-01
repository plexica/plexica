# GitHub Configuration

This directory contains GitHub-specific configuration files for Plexica.

## 📁 Structure

```
.github/
├── workflows/              # GitHub Actions workflows
│   ├── ci-tests.yml       # Main test workflow (unit, integration, E2E)
│   ├── coverage.yml       # Code coverage reporting
│   ├── ci.yml            # Legacy workflow (being phased out)
│   ├── deploy.yml        # Deployment workflow
│   └── dependency-review.yml  # Dependency security checks
│
├── docs/                  # CI/CD documentation
│   └── CI_CD_DOCUMENTATION.md  # Complete CI/CD guide
│
└── appmod/               # Application model configuration
```

## 🚀 Quick Start

### Running Tests in CI

Tests run automatically on:

- Pushes to `main` or `develop`
- Pull requests to `main` or `develop`

### Manual Workflow Triggers

You can manually trigger workflows from the GitHub Actions tab.

### Test Categories

- **Unit Tests**: Fast, isolated tests (< 30s)
- **Integration Tests**: With database and services (< 2min)
- **E2E Tests**: Full stack scenarios (< 5min)

## 📚 Documentation

For detailed information about CI/CD setup, troubleshooting, and best practices, see:

- [CI/CD Documentation](./docs/CI_CD_DOCUMENTATION.md)

## 🔧 Workflows Overview

### ci-tests.yml

Main testing workflow that runs all test categories in parallel:

- Lint & type check
- Unit tests
- Integration tests (with Postgres, Redis, Keycloak, MinIO)
- E2E tests (full stack)
- Build verification
- Test summary and quality gate

### coverage.yml

Generates comprehensive code coverage reports:

- Runs all tests with coverage enabled
- Uploads to Codecov
- Generates HTML reports
- Enforces coverage thresholds (≥80%)

### deploy.yml

Handles deployment to various environments (existing).

### dependency-review.yml

Security checks for dependencies (existing).

## 🎯 Quality Gates

All PRs must pass:

- ✅ Lint & type check
- ✅ All test suites (unit, integration, E2E)
- ✅ Build succeeds
- ✅ Coverage thresholds met

## 🐛 Troubleshooting

If CI fails:

1. Check workflow logs in GitHub Actions tab
2. Review [CI/CD Documentation](./docs/CI_CD_DOCUMENTATION.md)
3. Run tests locally to replicate issue
4. Check service health if integration/E2E tests fail

## 🔒 Required Secrets

Configure these in repository settings:

- `CODECOV_TOKEN` - For coverage reporting (optional)
- Additional secrets for deployment (if applicable)

---

For more information, see the [complete CI/CD documentation](./docs/CI_CD_DOCUMENTATION.md).
